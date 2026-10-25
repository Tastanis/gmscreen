// Turn undo, the page side (Brandon, October 2026). The server keeps every change made during a running turn
// (vtt/lib/UndoJournal.php); this tags the changes of one action with one group, reports hero sheet changes the
// server cannot see, and words the chat line for what was undone ("↶ Undid 10 damage to Goblin 1 — Zepha").

function newGroupId() {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${(newGroupId.count = (newGroupId.count || 0) + 1).toString(36)}`;
  return `ug-${random}`;
}

/** The fields a command carries so the server files its changes under the action in progress. */
export function currentUndoTag() {
  const group = globalThis.vttUndoGroup;
  if (!group || typeof group.id !== 'string' || !group.id) return {};
  return { undoGroup: group.id, ...(group.label ? { undoLabel: String(group.label).slice(0, 80) } : {}) };
}

/** Runs `fn` as one action for undo (one Ctrl+Z). Inside an action already running, it is part of that one. */
export async function inUndoGroup(label, fn) {
  if (globalThis.vttUndoGroup?.id) return fn();
  const id = newGroupId();
  globalThis.vttUndoGroup = { id, label: label || '' };
  try {
    return await fn();
  } finally {
    if (globalThis.vttUndoGroup?.id === id) globalThis.vttUndoGroup = null;
  }
}

/** A hero sheet counter changed (heroic resource, surges, recoveries, victories): kept for the running turn. */
export function recordSheetUndo(change) {
  try {
    globalThis.vttUndo?.recordSheet?.(change);
  } catch (error) {
    console.warn('[VTT] undo record failed', error);
  }
}

// Turn bookkeeping on a token: a ready "!" trigger, which actions it has used. Undone with the rest, named only when
// nothing else was (a move that set off someone's trigger reads "move", not "move, a change to Cal").
const READY_FIELDS = ['hasReadyTrigger', 'readyTriggerAbilities', 'readyTriggerPayloads', 'readyTriggerSources', 'triggerMarkRound', 'triggerMarkCombatantId', 'triggerSetAtPhase'];
const USAGE_FIELDS = ['mainActionUsedThisTurn', 'maneuverUsedThisTurn', 'usedActions', 'usedAbilities', 'triggeredActionReady', 'triggeredActionUsedThisRound', 'soloTurnsTaken'];
export function isBookkeepingStep(step) {
  if (!step || step.kind !== 'placement' || step.hidden) return false;
  const fields = Object.keys(step.after || {});
  return fields.length > 0 && fields.every((field) => READY_FIELDS.includes(field) || USAGE_FIELDS.includes(field));
}

const COUNTER_WORDS = { resource: 'heroic resource', surges: 'surges', recoveries: 'Recoveries', victories: 'Victories', stamina: 'Stamina' };

function hpNumber(hp, key) {
  const value = hp && typeof hp === 'object' ? hp[key] : undefined;
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? number : null;
}

function conditionNames(list) {
  return (Array.isArray(list) ? list : list ? [list] : [])
    .map((condition) => (typeof condition === 'string' ? condition : condition?.label || condition?.name || ''))
    .map((name) => String(name).trim())
    .filter((name) => name && name.toLowerCase() !== 'hiddeneffect');
}

/**
 * What one undone step was, in words: "10 damage to Goblin 1", "move of Cal", "Prone on Cal", "2 Malice spent".
 * `nameOf(id)` gives a token's name; `actorName` lets a creature's own move read just "move".
 */
export function describeUndoStep(step, { nameOf = () => '', actorName = '' } = {}) {
  if (!step || typeof step !== 'object') return '';
  if (step.kind === 'malice') {
    const change = (Number(step.after?.malice) || 0) - (Number(step.before?.malice) || 0);
    return `${Math.abs(change)} Malice ${change > 0 ? 'gained' : 'spent'}`;
  }
  if (step.kind === 'sheet') {
    const delta = Number(step.after?.delta) || 0;
    const what = COUNTER_WORDS[step.after?.counter] || 'resource';
    const who = step.after?.name || nameOf(step.entityId) || '';
    return `${Math.abs(delta)} ${what} ${delta > 0 ? 'gained' : 'spent'}${who ? ` by ${who}` : ''}`;
  }
  if (step.hidden) return 'a change to a hidden creature';
  const name = nameOf(step.entityId) || 'a token';
  const before = step.before || {};
  const after = step.after || {};
  const parts = [];
  if ('hp' in before || 'hp' in after) {
    const was = hpNumber(before.hp, 'current'), is = hpNumber(after.hp, 'current');
    if (was !== null && is !== null && was !== is) parts.push(was > is ? `${was - is} damage to ${name}` : `${is - was} healing on ${name}`);
    const tempWas = hpNumber(before.hp, 'temp') ?? 0, tempIs = hpNumber(after.hp, 'temp') ?? 0;
    if (tempWas !== tempIs) parts.push(`temporary Stamina on ${name}`);
  }
  if ('column' in after || 'row' in after) parts.push(name === actorName ? 'move' : `move of ${name}`);
  if ('conditions' in before || 'conditions' in after || 'condition' in after) {
    const was = conditionNames(before.conditions ?? before.condition), is = conditionNames(after.conditions ?? after.condition);
    is.filter((item) => !was.includes(item)).forEach((item) => parts.push(`${item} on ${name}`));
    was.filter((item) => !is.includes(item)).forEach((item) => parts.push(`${item} ending on ${name}`));
  }
  if (after.triggeredActionUsedThisRound === true) parts.push(`${name}'s triggered action`);
  else if (Object.keys(after).some((field) => USAGE_FIELDS.includes(field)) && !parts.length) parts.push(`${name}'s action use`);
  if (Object.keys(after).some((field) => READY_FIELDS.includes(field)) && !parts.length) parts.push(`${name}'s ready trigger`);
  if ('counters' in after) parts.push(`counters on ${name}`);
  if ('persistentZones' in after) parts.push(`an area from ${name}`);
  if (!parts.length) parts.push(`a change to ${name}`);
  return parts.join(', ');
}

/** One chat line per undone action, or one line for a whole turn. */
export function undoChatLines(steps, { nameOf = () => '', actorNameOf = (id) => id, whole = false, whose = '' } = {}) {
  const groups = [];
  const byId = new Map();
  for (const step of Array.isArray(steps) ? steps : []) {
    const key = step.groupId || `${step.kind}:${step.entityId}`;
    if (!byId.has(key)) { const group = { label: step.label || '', actorId: step.actorId || '', steps: [] }; byId.set(key, group); groups.push(group); }
    byId.get(key).steps.push(step);
  }
  const phrase = (group) => {
    const actorName = actorNameOf(group.actorId) || '';
    const main = group.steps.filter((step) => !isBookkeepingStep(step));
    const parts = [...new Set((main.length ? main : group.steps).map((step) => describeUndoStep(step, { nameOf, actorName })).filter(Boolean))];
    return { text: `${group.label ? `${group.label}: ` : ''}${parts.join(', ')}`, actorName };
  };
  if (whole) {
    const items = groups.map(phrase).map(({ text, actorName }) => `${text}${actorName ? ` (${actorName})` : ''}`);
    return items.length ? [`↶ Undid ${whose ? `${whose}'s` : 'the'} turn: ${items.join('; ')}`] : [];
  }
  return groups.map(phrase).map(({ text, actorName }) => `↶ Undid ${text}${actorName ? ` — ${actorName}` : ''}`);
}

export async function postUndo(endpoint, body, fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.success !== true) {
    const error = new Error(result?.error || `Undo was not accepted (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return result;
}
