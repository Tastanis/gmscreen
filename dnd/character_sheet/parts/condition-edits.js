// Adding or taking off one of a hero's conditions from the character sheet page or the map's side panel (October
// 2026: one list for the sheet and the token, parts/conditions.js).
//
// - The hero has a token on the map (the players' scene first, else the Director's open scene): the token is changed
//   (vtt api/v2/hero-conditions.php: the signed-in user's own placement change, so the token's rules apply), then
//   the same change, and only it, is applied to the sheet's list with the token's revision (handler.php
//   sync-conditions, source vtt, a delta). A whole list is never sent: the token's old conditions stay off the sheet.
// - No token: the sheet's own list is changed (sync-conditions, source sheet) with the revision the page last read;
//   if somebody changed the conditions since, nothing is written and the page reads the sheet again.

import { normalizeSheetConditions, applySheetConditionChange, toSheetCondition, normalizeConditionOps, applyConditionDelta } from './conditions.js';

export const HERO_CONDITIONS_ENDPOINT = '/dnd/vtt/api/v2/hero-conditions.php';
// Pages of one browser tell each other a hero's conditions changed ({type: 'conditions-sync', source, character, conditions}).
export const CONDITION_SYNC_CHANNEL = 'vtt-condition-sync';

const newOperationId = () => globalThis.crypto?.randomUUID?.() || `cond-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;

async function readJson(response) {
  try { return await response.json(); } catch (_) { return null; }
}

/** One write of the sheet's list (handler.php sync-conditions). Answers the server's JSON; throws on no answer. */
export async function writeSheetConditions(endpoint, { character, conditions, placementId, revision, baseRevision, source = 'vtt' } = {}, { fetchImpl = (...args) => globalThis.fetch(...args) } = {}) {
  const body = new URLSearchParams({ action: 'sync-conditions', source, character: String(character || ''), conditions: JSON.stringify(normalizeSheetConditions(conditions)) });
  if (placementId) body.set('placementId', String(placementId));
  if (revision !== undefined && revision !== null && revision !== '' && Number.isFinite(Number(revision))) body.set('revision', String(Math.trunc(Number(revision))));
  if (baseRevision !== undefined && baseRevision !== null && baseRevision !== '') body.set('baseRevision', String(baseRevision));
  const response = await fetchImpl(endpoint, {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!response?.ok) throw new Error(`Condition sync failed with status ${response?.status ?? 'unknown'}`);
  return readJson(response);
}

/**
 * One delta for the sheet's list (handler.php sync-conditions, a delta). With placementId and revision (the token's,
 * after the change) the server takes each condition's change once and never an older one; without them (the
 * Director's new-fight wipe and its undo) it is applied as it comes. Answers the server's JSON; throws on no answer.
 */
export async function writeSheetConditionDelta(endpoint, { character, ops, placementId, revision, source = 'vtt', reason = '' } = {}, { fetchImpl = (...args) => globalThis.fetch(...args) } = {}) {
  const body = new URLSearchParams({ action: 'sync-conditions', source, character: String(character || ''), delta: JSON.stringify(normalizeConditionOps(ops)) });
  if (placementId) body.set('placementId', String(placementId));
  if (revision !== undefined && revision !== null && revision !== '' && Number.isFinite(Number(revision))) body.set('revision', String(Math.trunc(Number(revision))));
  if (reason) body.set('reason', String(reason).slice(0, 40));
  const response = await fetchImpl(endpoint, {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!response?.ok) throw new Error(`Condition sync failed with status ${response?.status ?? 'unknown'}`);
  return readJson(response);
}

/** Where the hero's token is and its conditions: {onMap, placementId, entityRevision, conditions}, or null (no answer). */
export async function readTokenConditions(character, { endpoint = HERO_CONDITIONS_ENDPOINT, fetchImpl = (...args) => globalThis.fetch(...args) } = {}) {
  try {
    const url = new URL(endpoint, globalThis.location?.href ?? 'http://localhost/');
    url.searchParams.set('character', String(character || ''));
    const response = await fetchImpl(url.toString(), { method: 'GET', credentials: 'same-origin', cache: 'no-store' });
    const answer = response?.ok ? await readJson(response) : null;
    if (answer?.success !== true) return null;
    return answer.onMap ? { ...answer, conditions: normalizeSheetConditions(answer.conditions) } : { onMap: false };
  } catch (_) {
    return null;
  }
}

/**
 * Adds (op 'add') or takes off (op 'remove') one condition. currentList and baseRevision: the page's own list and the
 * sheet revision it last read (used only when the hero has no token). Answers {ok, onMap, conditions, revision} or
 * {ok: false, error, stale}.
 */
export async function editHeroCondition({
  character, op, condition, currentList = [], baseRevision = null,
  sheetEndpoint = '/dnd/character_sheet/handler.php', tokenEndpoint = HERO_CONDITIONS_ENDPOINT,
  fetchImpl = (...args) => globalThis.fetch(...args), operationId = newOperationId(),
} = {}) {
  const target = toSheetCondition(condition);
  if (!target || (op !== 'add' && op !== 'remove')) return { ok: false, error: 'That is not a condition.' };
  let token;
  try {
    const response = await fetchImpl(tokenEndpoint, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ character, op, condition: target, operationId }),
    });
    token = await readJson(response);
    if (!response?.ok || token?.success !== true) return { ok: false, error: token?.error || `The map did not take the change (${response?.status ?? 'no answer'}).` };
  } catch (error) {
    return { ok: false, error: 'No answer from the map.' };
  }
  if (token.onMap) {
    // The sheet takes this one change, and only it.
    const ops = [{ op, condition: target }];
    let conditions = applyConditionDelta(currentList, ops);
    let revision = null;
    try {
      const saved = await writeSheetConditionDelta(sheetEndpoint, { character, ops, placementId: token.placementId, revision: token.entityRevision }, { fetchImpl });
      if (saved?.success === true && Array.isArray(saved.conditions)) conditions = normalizeSheetConditions(saved.conditions);
      revision = Number.isFinite(saved?.revision) ? saved.revision : null;
    } catch (_) { /* the token holds it; the map's pages send the same change too */ }
    return { ok: true, onMap: true, applied: token.applied !== false, conditions, revision };
  }
  const next = applySheetConditionChange(currentList, op, target);
  try {
    const saved = await writeSheetConditions(sheetEndpoint, { character, conditions: next, baseRevision, source: 'sheet' }, { fetchImpl });
    if (saved?.success !== true) return { ok: false, stale: Boolean(saved?.stale || saved?.locked), error: saved?.error || 'The sheet did not take the change.' };
    return { ok: true, onMap: false, applied: saved.applied !== false, conditions: normalizeSheetConditions(saved.conditions), revision: Number.isFinite(saved.revision) ? saved.revision : null };
  } catch (_) {
    return { ok: false, error: 'No answer from the server.' };
  }
}
