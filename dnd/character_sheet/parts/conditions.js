// Conditions: one list for the hero's token, the map's side panel and the character sheet (October 2026). Brandon:
// "Idk why you would have a condition that is in your character sheet and not in the vtt or vice versa. So probably
// merge them."
//
// - The list: the token-settings menu, the side panel's picker and the sheet's picker all draw from
//   CONDITION_DEFINITIONS (same names, labels and aliases; SE / EOT; "Other…" for a condition typed by hand).
// - One list kept in step by deltas: a real change on a hero's token sends only what changed to the sheet's
//   hero.conditions ([{name, duration: {type}}]); a change on the sheet goes to the hero's token (the one on the
//   players' scene first, else the Director's open scene); with no token, the sheet's list is its own.
//   The pages and the server keep the two together (vtt services/condition-sync-service.js, api/v2/hero-conditions.php,
//   handler.php sync-conditions).
// - Old sheets stored free text ("Slowed, save ends", "Dazed (EOT)", "custom thing"): read leniently into
//   {name, duration} here, when the sheet is read. The file itself is rewritten at the next save of the list.
//
// Plain data and pure functions, so the sheet page, the map (board-interactions, the side panel) and node tests load
// the same file.

export const CUSTOM_CONDITION_NAME = 'Other';

export const CONDITION_DEFINITIONS = Object.freeze([
  {
    name: 'Bleeding',
    description:
      'While bleeding, whenever you make a test using Might or Agility, make a strike, or use an action, maneuver, or a triggered action, you lose 1d6 Stamina after the test, action, maneuver, or triggered action is resolved. This Stamina loss can’t be prevented in any way.',
  },
  {
    name: 'Dazed',
    description:
      'While you are dazed, you can do only one thing on your turn: use a maneuver, use an action, or take a move action. You also can’t use triggered actions, free triggered actions, or free maneuvers.',
  },
  {
    name: 'Frightened',
    description:
      'If you are frightened, ability power rolls you make against the source of your fear take a bane. If that source is a creature, their ability power rolls against you gain an edge. You can’t willingly move closer to the source of your fear if you know the location of that source. If you gain the frightened condition from one source while already frightened by a different source, the new condition replaces the old one.',
  },
  {
    name: 'Grabbed',
    description:
      'While you are grabbed, your speed is 0, you can’t be force moved, you can’t use the Knockback maneuver, and you take a bane on abilities that don’t target the creature grabbing you. If the creature grabbing you moves, they bring you with them. If the creature’s size is equal to or less than yours, their speed is halved while they have you grabbed. The creature grabbing you can use a maneuver to move you into an unoccupied space adjacent to them. The creature grabbing you can end the grab at any time (no action required). You can also attempt to escape being grabbed using the Escape Grab maneuver (see Maneuvers in Combat). If you teleport or if the creature grabbing you is force moved to a space that isn’t adjacent to you, you are no longer grabbed.',
  },
  {
    name: 'Invisible',
    description:
      'Other players cannot see this token (the Director and its own player see it faded). Invisible creatures always have concealment: strikes against them take a bane. They can still be targeted unless they are also hidden.',
  },
  {
    name: 'Concealed',
    description:
      'Darkness, fog or anything else that fully hides the creature without protecting it. Strikes against it take a bane.',
  },
  {
    name: 'Hidden',
    description:
      'While you are hidden from another creature, that creature cannot target you with non-area abilities, and you gain an edge on ability rolls made against that creature until the end of the turn in which you are no longer hidden.',
  },
  {
    name: 'Prone',
    description:
      'While you are prone, you are flat on the ground, strikes you make take a bane, and melee abilities made against you gain an edge. You must crawl to move along the ground, which costs you 1 additional square of movement for every square you crawl. You can’t climb, jump, swim, or fly while prone. If you are climbing, flying, or jumping while you are knocked prone, you fall. While prone, you can stand up as a maneuver (see Maneuvers in Combat), unless the ability or effect that imposed the condition says otherwise. You can use a maneuver to make an adjacent prone creature stand up.',
  },
  {
    name: 'Restrained',
    description:
      'While you are restrained, your speed is 0, you can’t use the Stand Up maneuver, and you can’t be force moved. Your ability power rolls take a bane, abilities against you gain an edge, and you have a bane on Might and Agility tests. If you teleport while restrained, the condition ends.',
  },
  {
    name: 'Slowed',
    description: 'While you are slowed, your speed is 2 unless it is already lower, and you can’t shift.',
  },
  {
    name: 'Taunted',
    description:
      'If you are taunted, you have a double bane on ability power rolls that don’t target the creature who taunted you while you have line of effect to that creature. If you gain the taunted condition from one creature while already taunted by a different creature, the new condition replaces the old one.',
  },
  {
    name: 'Unconscious',
    description:
      'While you are unconscious, you can\'t take actions or maneuvers, your speed is 0, you are unaware of your surroundings, and you are prone. Ability rolls against you have a double edge. If you wake up, you can stand up from prone as a free maneuver.',
  },
  {
    name: 'Weakened',
    description: 'While you are weakened, all your power rolls take a bane.',
  },
  {
    // Numeric rider applied by automation. Stored on the placement with `amount` and (optionally) `damageType`; the
    // automation damage handler stacks the amount onto incoming damage of the matching type. Empty damageType =
    // applies to every type. Needs an amount, so only the token's own dialog adds it.
    name: 'damageWeakness',
    label: 'Weakness',
    rider: true,
    description:
      'While you have this rider, you take extra damage equal to the rider amount from the matching damage type (or any type if untyped).',
  },
  {
    // Mirror of damageWeakness — soaks `amount` from incoming damage of the matching type.
    name: 'damageImmunity',
    label: 'Immunity',
    rider: true,
    description:
      'While you have this rider, you ignore damage equal to the rider amount from the matching damage type (or any type if untyped).',
  },
  { name: CUSTOM_CONDITION_NAME, label: 'Other…', description: '', isCustom: true },
].map((definition) => Object.freeze(definition)));

export const CONDITION_NAMES = Object.freeze(CONDITION_DEFINITIONS.map((definition) => definition.name));
export const CONDITION_ALIASES = new Map([
  ['grappled', 'Grabbed'],
]);
const DEFINITION_BY_KEY = new Map(CONDITION_DEFINITIONS.map((definition) => [definition.name.toLowerCase(), definition]));

/** What the sheet's and the side panel's pickers offer: the conditions with a name only, then "Other…". */
export const PICKER_CONDITION_NAMES = Object.freeze(
  CONDITION_DEFINITIONS.filter((definition) => !definition.rider && !definition.isCustom).map((definition) => definition.name),
);

export const DURATION_TYPES = Object.freeze(['save-ends', 'end-of-turn', 'end-of-encounter', 'until-dying', 'instantaneous']);
const DURATION_SHORT = { 'save-ends': 'SE', 'end-of-turn': 'EOT', 'end-of-encounter': 'EoE' };
const DURATION_LONG = { 'save-ends': 'save ends', 'end-of-turn': 'end of turn', 'end-of-encounter': 'end of encounter', 'until-dying': 'until dying' };
export const MAX_SHEET_CONDITIONS = 40;
export const MAX_CONDITION_NAME = 80;

export function getConditionDefinition(name) {
  if (typeof name !== 'string') return null;
  const key = name.trim().toLowerCase();
  if (!key) return null;
  const alias = CONDITION_ALIASES.get(key);
  return DEFINITION_BY_KEY.get(alias ? alias.toLowerCase() : key) ?? null;
}

/** A known condition's own spelling ("slowed" → "Slowed", "grappled" → "Grabbed"); null for anything else. */
export function canonicalConditionName(name) {
  const definition = getConditionDefinition(name);
  return definition && !definition.isCustom ? definition.name : null;
}

/** The label a menu shows for a name ("damageWeakness" → "Weakness"). */
export function conditionOptionLabel(name) {
  const definition = getConditionDefinition(name);
  return definition?.label || definition?.name || String(name ?? '');
}

export function normalizeDurationType(value) {
  const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!text) return 'save-ends';
  if (DURATION_TYPES.includes(text)) return text;
  if (text.includes('save') || text === 'se') return 'save-ends';
  if (text.includes('encounter') || text === 'eoe') return 'end-of-encounter';
  if (text.includes('dying')) return 'until-dying';
  if (text.includes('instant') || text === 'until-removed') return 'instantaneous';
  if (text.includes('eot') || text.includes('end')) return 'end-of-turn';
  return 'save-ends';
}

export const durationShort = (type) => DURATION_SHORT[normalizeDurationType(type)] || '';
export const durationLong = (type) => DURATION_LONG[normalizeDurationType(type)] || '';

const cleanName = (value) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_CONDITION_NAME);

/**
 * An old sheet's free text read as a condition: "Slowed, save ends" → Slowed (SE), "Dazed (EOT)" → Dazed (EOT),
 * "grappled - end of turn" → Grabbed (EOT), "custom thing" → a condition typed by hand, save ends. Null for nothing.
 */
export function parseConditionText(text) {
  let rest = cleanName(text);
  if (!rest) return null;
  let type = null;
  const take = (pattern, found) => {
    if (!pattern.test(rest)) return;
    if (!type) type = found;
    rest = rest.replace(pattern, ' ');
  };
  take(/\b(?:until\s+)?(?:the\s+)?end\s+of\s+(?:(?:your|its|their|the)\s+)?(?:next\s+)?turn\b|\be\.?o\.?t\.?\b|\beont\b/gi, 'end-of-turn');
  take(/\b(?:\(\s*)?save\s*s?\s*ends?\b|\bse\b|\bsave\b/gi, 'save-ends');
  rest = rest.replace(/[()[\]{}]/g, ' ').replace(/\s+/g, ' ').replace(/^[\s,;:\-–—/|.]+|[\s,;:\-–—/|.]+$/g, '').trim();
  if (!rest) return null;
  return { name: canonicalConditionName(rest) || rest, duration: { type: type || 'save-ends' } };
}

/**
 * One condition in the sheet's shape: {name, duration: {type}}, and for a damage rider its amount and type. A known
 * name takes its own spelling; anything else is kept as typed (a condition added by hand, "Other"). Null when there
 * is nothing to keep (no name, a hidden effect).
 */
export function toSheetCondition(value) {
  if (typeof value === 'string') return parseConditionText(value);
  if (!value || typeof value !== 'object') return null;
  const raw = cleanName(value.name);
  if (!raw || raw.toLowerCase() === 'hiddeneffect' || raw.toLowerCase() === CUSTOM_CONDITION_NAME.toLowerCase()) return null;
  const source = value.duration ?? value.mode ?? value.type ?? '';
  const type = normalizeDurationType(typeof source === 'string' ? source : (source?.type ?? source?.value ?? source?.mode ?? ''));
  const condition = { name: canonicalConditionName(raw) || raw, duration: { type } };
  if (condition.name === 'damageWeakness' || condition.name === 'damageImmunity') {
    const amount = String(value.amount ?? '').trim().toLowerCase() === 'all' ? 'all' : Number.parseInt(value.amount, 10);
    if (amount === 'all' || (Number.isFinite(amount) && amount > 0)) condition.amount = amount;
    const damageType = typeof value.damageType === 'string' ? value.damageType.trim().toLowerCase() : '';
    if (damageType && damageType !== 'untyped') condition.damageType = damageType.slice(0, 40);
    if (value.stacks === true) condition.stacks = true;
  }
  return condition;
}

/** Which condition is which, between the sheet and the token: name, duration and (riders) amount and type. */
export function sheetConditionKey(condition) {
  const c = toSheetCondition(condition);
  if (!c) return '';
  const base = `${c.name.toLowerCase()}|${c.duration.type}`;
  return c.name === 'damageWeakness' || c.name === 'damageImmunity' ? `${base}|${c.amount ?? ''}${c.stacks ? '+' : ''}|${c.damageType ?? ''}` : base;
}

/** The sheet's list, whatever it was stored as (old text, objects): structured, one of each, at most 40. */
export function normalizeSheetConditions(list) {
  const entries = Array.isArray(list) ? list : (list ? [list] : []);
  const seen = new Set();
  const result = [];
  for (const entry of entries) {
    const condition = toSheetCondition(entry);
    const key = condition ? sheetConditionKey(condition) : '';
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(condition);
    if (result.length >= MAX_SHEET_CONDITIONS) break;
  }
  return result;
}

/** What the sheet keeps of a token's conditions: everything shown on the token, not the Director's hidden effects. */
export function mirrorFromTokenConditions(tokenConditions) {
  const entries = Array.isArray(tokenConditions) ? tokenConditions : (tokenConditions ? [tokenConditions] : []);
  return normalizeSheetConditions(entries.filter((entry) => !(entry && typeof entry === 'object' && entry.hidden && entry.shown !== true)));
}

export function sameSheetConditions(a, b) {
  const left = normalizeSheetConditions(a).map(sheetConditionKey);
  const right = normalizeSheetConditions(b).map(sheetConditionKey);
  return left.length === right.length && left.every((key, index) => key === right[index]);
}

/** Adds one (none when the same one is there) or takes the first match off. Answers a new list. */
export function applySheetConditionChange(list, op, condition) {
  const current = normalizeSheetConditions(list);
  const target = toSheetCondition(condition);
  if (!target) return current;
  const key = sheetConditionKey(target);
  if (op === 'remove') {
    const at = current.findIndex((entry) => sheetConditionKey(entry) === key);
    if (at >= 0) current.splice(at, 1);
    return current;
  }
  if (!current.some((entry) => sheetConditionKey(entry) === key) && current.length < MAX_SHEET_CONDITIONS) current.push(target);
  return current;
}

// ---- changes travel as deltas (October 2026) ----------------------------------------------------------------
// Brandon: "what I don't want it to do is accidentally backpropagate if I start a new combat on a different map
// later ... If a map isn't used, then it shouldn't send any signals." So the token and the sheet never send each
// other a whole list: only what one real change did. A delta is a list of ops, in the sheet's shape:
//   {op: 'add', condition}  {op: 'remove', condition}  {op: 'duration', condition (with the new duration), from}
// A token's old conditions that nobody touched are never in a delta.

const DELTA_OPS = new Set(['add', 'remove', 'duration']);

/** The ops that turn one list into the other (a token's before and after; hidden effects are not the sheet's). */
export function conditionDelta(before, after) {
  const was = mirrorFromTokenConditions(before), now = mirrorFromTokenConditions(after);
  const wasKeys = new Set(was.map(sheetConditionKey)), nowKeys = new Set(now.map(sheetConditionKey));
  const removed = was.filter((c) => !nowKeys.has(sheetConditionKey(c)));
  const added = now.filter((c) => !wasKeys.has(sheetConditionKey(c)));
  const ops = [];
  const isRider = (c) => c.name === 'damageWeakness' || c.name === 'damageImmunity';
  for (const condition of added) {
    const at = isRider(condition) ? -1 : removed.findIndex((old) => !isRider(old) && old.name.toLowerCase() === condition.name.toLowerCase());
    if (at >= 0) {
      ops.push({ op: 'duration', condition, from: removed[at].duration.type });
      removed.splice(at, 1);
    } else ops.push({ op: 'add', condition });
  }
  for (const condition of removed) ops.push({ op: 'remove', condition });
  return ops;
}

/** A delta as sent or received, checked: known ops with a condition each. */
export function normalizeConditionOps(ops) {
  const list = Array.isArray(ops) ? ops : [];
  const result = [];
  for (const entry of list) {
    if (!entry || !DELTA_OPS.has(entry.op)) continue;
    const condition = toSheetCondition(entry.condition);
    if (!condition) continue;
    result.push(entry.op === 'duration' ? { op: 'duration', condition, from: normalizeDurationType(entry.from) } : { op: entry.op, condition });
    if (result.length >= 80) break;
  }
  return result;
}

/** A delta applied to a list: answers the new list. Adding one already there, or taking off one not there, is nothing. */
export function applyConditionDelta(list, ops) {
  let current = normalizeSheetConditions(list);
  for (const entry of normalizeConditionOps(ops)) {
    const key = sheetConditionKey(entry.condition);
    const at = current.findIndex((c) => sheetConditionKey(c) === key);
    if (entry.op === 'add') {
      if (at < 0 && current.length < MAX_SHEET_CONDITIONS) current.push(entry.condition);
    } else if (entry.op === 'remove') {
      if (at >= 0) current.splice(at, 1);
    } else {
      const fromKey = sheetConditionKey({ ...entry.condition, duration: { type: entry.from } });
      const fromAt = current.findIndex((c) => sheetConditionKey(c) === fromKey);
      if (fromAt >= 0) {
        if (at < 0) current[fromAt] = entry.condition; else current.splice(fromAt, 1);
      } else if (at < 0 && current.length < MAX_SHEET_CONDITIONS) current.push(entry.condition);
    }
  }
  return current;
}

/** What a chip says: "Slowed", "Fire weakness 5", a hand-typed name as typed. */
export function conditionChipLabel(condition) {
  const c = condition && typeof condition === 'object' ? condition : toSheetCondition(condition);
  if (!c) return '';
  if (c.name === 'damageWeakness' || c.name === 'damageImmunity') {
    const type = c.damageType ? `${c.damageType.charAt(0).toUpperCase()}${c.damageType.slice(1)} ` : '';
    const amount = c.amount === 'all' ? ' all' : Number.isFinite(Number(c.amount)) && Number(c.amount) > 0 ? ` ${c.amount}` : '';
    return `${type}${c.name === 'damageWeakness' ? 'weakness' : 'immunity'}${amount}${c.stacks ? ' (adds)' : ''}`.trim();
  }
  return canonicalConditionName(c.name) || String(c.name || '');
}
