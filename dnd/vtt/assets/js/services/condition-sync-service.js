/**
 * Condition sync: a hero's token and its character sheet keep one list of conditions (October 2026). Brandon: "Idk
 * why you would have a condition that is in your character sheet and not in the vtt or vice versa. So probably
 * merge them."
 *
 * Then (late October 2026), on leaving a finished fight's map on: "what I don't want it to do is accidentally
 * backpropagate if I start a new combat on a different map later ... If a map isn't used, then it shouldn't send any
 * signals. So only if a bunch of stuff changes in the map should it be like, oh, combat is still running, I'll turn
 * back on and start sending stuff. If a map just gets turned on and then turned back off, no signals go out."
 *
 * - Changes travel as deltas (parts/conditions.js conditionDelta): a real condition change on a hero's token (added,
 *   taken off, ended at the end of a turn, saved against, put on by an ability) sends only what it changed to the
 *   sheet (handler.php sync-conditions, a delta, with the token's id and revision: each condition's change is taken
 *   once and never an older one). A token's old conditions are never sent unless that condition itself changes.
 *   Each page keeps what it last saw of every token (createConditionTracker): a snapshot (page load, a scene opened,
 *   recovery) only records it, so opening a map sends nothing.
 * - The pages that send: the Director's, the hero's own player's, and the page whose user made the change.
 * - The sheet changes the hero's token (api/v2/hero-conditions.php): the one on the players' scene first, else the
 *   Director's open scene, else none (the sheet edits its own list). heroSceneOrder / pickHeroPlacement are that
 *   order on the page; lib/HeroConditions.php is it on the server.
 * - A token newly placed with no conditions takes the sheet's list (seedTokenConditions); never a scene opened.
 */
import { normalizeSheetConditions, conditionDelta, normalizeConditionOps, conditionChipLabel } from '../../../../character_sheet/parts/conditions.js';
import { writeSheetConditions, writeSheetConditionDelta, CONDITION_SYNC_CHANNEL } from '../../../../character_sheet/parts/condition-edits.js';

export { writeSheetConditions, writeSheetConditionDelta, CONDITION_SYNC_CHANNEL };

let channelInstance = null;
function getChannel() {
  if (typeof BroadcastChannel !== 'function') return null;
  if (!channelInstance) channelInstance = new BroadcastChannel(CONDITION_SYNC_CHANNEL);
  return channelInstance;
}

/** Tells the other pages of this browser (the sheet page, the side panel) a hero's conditions changed. */
export function broadcastConditionSync({ character, ops = [], source = 'vtt' } = {}) {
  const channel = getChannel();
  if (!channel || !character) return;
  channel.postMessage({ type: 'conditions-sync', source, character: String(character).toLowerCase(), delta: normalizeConditionOps(ops) });
}

export function subscribeToConditionSync(handler) {
  if (typeof handler !== 'function') return;
  getChannel()?.addEventListener('message', handler);
}

/** The scenes where "the hero's token" is looked for, in order: the players' scene, then the Director's open scene. */
export function heroSceneOrder({ playerActiveSceneId = null, activeSceneId = null, playerMapDisabled = false } = {}) {
  const order = [];
  if (!playerMapDisabled && typeof playerActiveSceneId === 'string' && playerActiveSceneId) order.push(playerActiveSceneId);
  if (typeof activeSceneId === 'string' && activeSceneId && !order.includes(activeSceneId)) order.push(activeSceneId);
  return order;
}

const isHidden = (placement) => Boolean(placement?.hidden || placement?.isHidden || placement?.flags?.hidden);

/**
 * The hero's token among one scene's tokens, as the server picks it (SyncV2Store::resolvePcPlacementIdForUser): its
 * primary token, else its only one; none when that is hidden or there is no single answer.
 */
export function pickHeroPlacement(placements, profileId, profileOf) {
  const id = String(profileId || '').toLowerCase();
  if (!id || typeof profileOf !== 'function') return null;
  const matches = (Array.isArray(placements) ? placements : Object.values(placements || {}))
    .filter((placement) => placement && typeof placement === 'object' && String(profileOf(placement) || '').toLowerCase() === id);
  const primary = matches.filter((placement) => placement.primaryPc === true);
  const candidates = primary.length ? primary : matches;
  return candidates.length === 1 && !isHidden(candidates[0]) ? candidates[0] : null;
}

/** The hero's token on the map: {sceneId, placement}, or null (off the map). */
export function findHeroToken(boardState, profileId, profileOf) {
  for (const sceneId of heroSceneOrder(boardState || {})) {
    const placement = pickHeroPlacement(boardState?.placements?.[sceneId], profileId, profileOf);
    if (placement) return { sceneId, placement };
  }
  return null;
}

/**
 * What one page last saw of each token's conditions. prime() records (a snapshot: page load, a scene opened,
 * recovery); observe() records a confirmed change and answers the delta from what it saw before, or null when it
 * had seen nothing of that token (a new one) or nothing changed. An older revision than the one seen is ignored.
 * A change that carries a new quiet mark (placement.conditionsQuietMark: the new-fight wipe and its Undo, which write
 * the sheets themselves) is recorded and not sent.
 */
export function createConditionTracker() {
  const seen = new Map();   // placementId -> {revision, conditions, mark}
  const listOf = (conditions) => (Array.isArray(conditions) ? conditions : (conditions ? [conditions] : []));
  function prime(placementId, revision, conditions, mark = null) {
    if (!placementId) return;
    seen.set(String(placementId), { revision: Number(revision) || 0, conditions: listOf(conditions), mark: mark ?? null });
  }
  function observe(placementId, revision, conditions, mark = null) {
    if (!placementId) return null;
    const key = String(placementId);
    const last = seen.get(key);
    const rev = Number(revision) || 0;
    if (last && rev && last.revision && rev <= last.revision) return null;
    seen.set(key, { revision: rev, conditions: listOf(conditions), mark: mark ?? null });
    if (!last || (mark ?? null) !== last.mark) return null;
    const ops = conditionDelta(last.conditions, conditions);
    return ops.length ? ops : null;
  }
  function primeSnapshot(snapshot) {
    for (const scene of Object.values(snapshot?.state?.placements ?? {})) {
      for (const [placementId, placement] of Object.entries(scene ?? {})) {
        if (placement && typeof placement === 'object') prime(placementId, placement._entityRevision, placement.conditions ?? placement.condition ?? null, placement.conditionsQuietMark ?? null);
      }
    }
  }
  return { prime, observe, primeSnapshot, forget: (placementId) => seen.delete(String(placementId)), has: (placementId) => seen.has(String(placementId)) };
}

/**
 * Whether this page sends the sheet one confirmed condition change of a hero's token: an ordinary change (not a
 * token just placed: that one takes the sheet's list instead), and this page is the Director's, the hero's player's,
 * or the one whose user made the change.
 */
export function shouldMirrorConditionChange({ mutation, profileId, isGm = false, currentUserId = '', actorId = '' } = {}) {
  if (!mutation || mutation.kind !== 'upsert' || mutation.projectionOnly || !profileId) return false;
  const fields = Array.isArray(mutation.changedFields) ? mutation.changedFields : [];
  if (!fields.some((field) => field === 'conditions' || field === 'condition' || field === '*')) return false;
  if (fields.includes('*') && Number(mutation.entityRevision) === 1) return false;
  const me = String(currentUserId || '').toLowerCase();
  return Boolean(isGm || (me && me === String(profileId).toLowerCase()) || (me && me === String(actorId || '').toLowerCase()));
}

/**
 * The conditions a token newly placed (or linked) with none takes from its sheet, in the token's shape: an
 * end-of-turn condition ends at the end of the hero's own turn. Null when there is nothing to do (the token has some
 * already, or the sheet has none).
 */
export function seedTokenConditions(tokenConditions, sheetConditions, { placementId = '', tokenName = '' } = {}) {
  const held = Array.isArray(tokenConditions) ? tokenConditions.filter(Boolean) : (tokenConditions ? [tokenConditions] : []);
  if (held.length) return null;
  const sheet = normalizeSheetConditions(sheetConditions);
  if (!sheet.length) return null;
  return sheet.map((condition) => {
    const entry = { ...condition, duration: { type: condition.duration.type } };
    if (entry.duration.type === 'end-of-turn' && placementId) {
      entry.duration.targetTokenId = placementId;
      if (tokenName) entry.duration.targetTokenName = tokenName;
    }
    return entry;
  });
}

// ---- new fight, clean slate (Brandon, late October 2026) --------------------------------------------------------
// "I don't want it to throw all the conditions back on. I kind of want it to wipe them." Start combat wipes the
// leftover conditions of the fight's heroes: their tokens on that scene and their sheets' lists. Never the Director's
// hidden effects. Undo puts back exactly what was taken.

/** A condition the sheet and the players see (not the Director's hidden effect). */
export function isShownCondition(condition) {
  return Boolean(condition && typeof condition === 'object' && !(condition.hidden && condition.shown !== true)
    && String(condition.name || '').trim().toLowerCase() !== 'hiddeneffect');
}

/**
 * What a new fight clears. heroes: [{placementId, profileId, name, conditions}] (their tokens on the fight's scene);
 * sheetLists: Map hero -> its sheet's list. Answers {tokens: Map placementId -> {keep, removed}, sheets: Map hero ->
 * the list cleared, text} — text null when there was nothing to clear.
 */
export function planNewFightWipe(heroes, sheetLists = new Map()) {
  const tokens = new Map();
  const sheets = new Map();
  const words = [];
  const label = (condition) => conditionChipLabel(normalizeSheetConditions([condition])[0] || condition) || String(condition?.label || condition?.name || '');
  const profiles = [];
  for (const hero of Array.isArray(heroes) ? heroes : []) {
    if (!hero?.placementId || !hero.profileId) continue;
    if (!profiles.includes(hero.profileId)) profiles.push(hero.profileId);
    const list = Array.isArray(hero.conditions) ? hero.conditions : (hero.conditions ? [hero.conditions] : []);
    const removed = list.filter(isShownCondition);
    if (removed.length) tokens.set(hero.placementId, { keep: list.filter((condition) => !isShownCondition(condition)), removed: JSON.parse(JSON.stringify(removed)) });
  }
  for (const profileId of profiles) {
    const sheet = normalizeSheetConditions(sheetLists.get(profileId));
    if (sheet.length) sheets.set(profileId, sheet);
    const mine = (Array.isArray(heroes) ? heroes : []).filter((hero) => hero?.profileId === profileId);
    const who = mine.find((hero) => hero.name)?.name || profileId;
    const names = new Set();
    mine.forEach((hero) => (tokens.get(hero.placementId)?.removed || []).forEach((condition) => names.add(label(condition))));
    sheet.forEach((condition) => names.add(label(condition)));
    names.forEach((name) => { if (name) words.push(`${name} (${who})`); });
  }
  return { tokens, sheets, text: words.length ? `New fight: cleared ${words.join(', ')}` : null };
}

/** A token's list with what a wipe took put back (none twice). */
export function restoreRemovedConditions(current, removed, keyOf = (condition) => JSON.stringify(condition)) {
  const list = Array.isArray(current) ? current : (current ? [current] : []);
  const held = new Set(list.map(keyOf));
  return [...list, ...(Array.isArray(removed) ? removed : []).filter((condition) => !held.has(keyOf(condition)))];
}

/**
 * The delta sender of one map page: schedule(character, ops, {placementId, revision}) after a confirmed change; it
 * waits a moment (a burst of changes of one token is one write, its ops in order, sent with the newest revision) and
 * sends. A write that fails is sent again with the token's next change.
 */
export function createConditionMirror({
  endpoint,
  fetchImpl = (...args) => globalThis.fetch(...args),
  debounceMs = 250,
  broadcast = broadcastConditionSync,
  timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id) },
} = {}) {
  const waiting = new Map();      // character -> {ops, placementId, revision, timer}
  const sent = new Map();         // character -> {placementId, revision}

  async function flush(character) {
    const entry = waiting.get(character);
    if (!entry) return null;
    waiting.delete(character);
    if (entry.timer) timers.clear(entry.timer);
    try {
      const answer = await writeSheetConditionDelta(endpoint, { character, ops: entry.ops, placementId: entry.placementId, revision: entry.revision }, { fetchImpl });
      if (answer?.success !== true) throw new Error(answer?.error || 'The sheet did not take the change.');
      sent.set(character, { placementId: entry.placementId, revision: entry.revision });
      if (answer.applied) broadcast?.({ character, ops: entry.ops, source: 'vtt' });
      return answer;
    } catch (error) {
      console.warn('[VTT] Failed to send the hero\'s condition change to the sheet', error);
      // Kept, and sent with the token's next change.
      const next = waiting.get(character);
      if (next && next.placementId === entry.placementId) next.ops = [...entry.ops, ...next.ops];
      else if (!next) waiting.set(character, { ...entry, timer: null, failed: true });
      return null;
    }
  }

  function schedule(character, ops, { placementId = '', revision = null } = {}) {
    const key = String(character || '').toLowerCase();
    const list = normalizeConditionOps(ops);
    if (!endpoint || !key || !list.length) return;
    const id = String(placementId || '');
    let existing = waiting.get(key);
    if (existing?.timer) timers.clear(existing.timer);
    if (existing && existing.placementId !== id) {
      // Another token of the hero: what waited for the first goes now, by itself.
      if (!existing.failed) flush(key); else waiting.delete(key);
      existing = null;
    }
    const entry = { ops: [...(existing?.ops ?? []), ...list], placementId: id, revision: Math.max(Number(revision) || 0, Number(existing?.revision) || 0) };
    entry.timer = timers.set(() => flush(key), debounceMs);
    waiting.set(key, entry);
  }

  return { schedule, flush, pending: () => [...waiting.keys()], lastSent: (character) => sent.get(String(character || '').toLowerCase()) ?? null };
}
