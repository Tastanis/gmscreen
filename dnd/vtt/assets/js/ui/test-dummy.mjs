// Test dummies (Brandon, November 17, 2026): "a test button in the tokens. I can then drag out any of my PC tokens and
// it will behave exactly as my PC except that it will basically be a duplicate copy that will leave all of their
// character sheet and stuff alone ... if the test dummy version gets hit, it damages that token following all rules and
// resistances ... but it will not affect their real character at all." Only the Director sees it; it uses its own
// abilities; its Stamina starts full.
//
// A dummy is a hidden token with `metadata.testDummy = {hero, resource, surges, recoveries, victories}`. It is never
// linked to its hero as a player's token: every link the board writes through answers "no hero" for it. It goes by its
// own character id, "dummy:<token id>", wherever a hero's id would go (the side panel, its abilities, automation). A
// request to the sheet's server carrying that id never leaves the page: this file answers it, reading the hero's sheet
// for what the dummy is (stats, abilities, immunities) and keeping what it has (Stamina, Heroic Resource, surges,
// Recoveries, Victories) on the token. The sheet's server refuses an id it does not know as well.
import { staminaState, damageStamina, healStamina, gainTempStamina, recoveryValueOf } from '../../../../character_sheet/parts/stamina-math.js';

export const DUMMY_PREFIX = 'dummy:';

/** The token's dummy record, or null for any other token. */
export function dummyOf(placement) {
  const meta = placement?.metadata ?? placement?.meta;
  const record = meta && typeof meta === 'object' ? meta.testDummy : null;
  return record && typeof record === 'object' && typeof record.hero === 'string' && record.hero.trim() ? record : null;
}
export const isTestDummy = (placement) => dummyOf(placement) !== null;
export const dummyHeroOf = (placement) => dummyOf(placement)?.hero.trim().toLowerCase() || '';
export const isDummyId = (id) => typeof id === 'string' && id.startsWith(DUMMY_PREFIX) && id.length > DUMMY_PREFIX.length;
export const dummyIdFor = (placement) => (placement?.id ? DUMMY_PREFIX + placement.id : '');
export const dummyPlacementId = (id) => (isDummyId(id) ? id.slice(DUMMY_PREFIX.length) : '');
export const dummyName = (heroName) => `Test · ${String(heroName || 'hero').trim()}`;

const whole = (value) => { const n = Number(value); return Number.isFinite(n) ? Math.trunc(n) : null; };

/** A new dummy's own numbers, from the hero's sheet as it is now: Stamina full, Recoveries full, no surges. */
export function newDummyRecord(hero, heroSheet = {}) {
  const h = heroSheet?.hero ?? {}, vitals = h.vitals ?? {};
  const recoveriesMax = whole(vitals.recoveries ?? vitals.recoveriesMax ?? vitals.maxRecoveries);
  return {
    hero: String(hero).trim().toLowerCase(),
    resource: Math.max(0, whole(h.resource?.value) ?? 0),
    surges: 0,
    recoveries: Math.max(0, recoveriesMax ?? whole(vitals.currentRecoveries) ?? 0),
    victories: Math.max(0, whole(h.victories) ?? 0),
  };
}

/** The hero's sheet as the dummy has it: the hero's everything, with the dummy's own numbers in place. */
export function dummySheet(heroSheet, placement) {
  const record = dummyOf(placement);
  const sheet = heroSheet && typeof heroSheet === 'object' ? structuredClone(heroSheet) : {};
  if (!record) return sheet;
  sheet.hero = sheet.hero && typeof sheet.hero === 'object' ? sheet.hero : {};
  const hero = sheet.hero;
  // Named as a test copy everywhere it shows (the panel, chat lines of its abilities).
  hero.name = dummyName(hero.name || record.hero);
  hero.vitals = hero.vitals && typeof hero.vitals === 'object' ? hero.vitals : {};
  const stamina = tokenStamina(placement, hero.vitals.staminaMax);
  hero.vitals.currentStamina = stamina.current;
  hero.vitals.tempStamina = stamina.temp;
  hero.vitals.currentRecoveries = whole(record.recoveries) ?? 0;
  hero.resource = hero.resource && typeof hero.resource === 'object' ? hero.resource : {};
  hero.resource.value = whole(record.resource) ?? 0;
  hero.surges = whole(record.surges) ?? 0;
  hero.surgesUsed = 0;
  hero.victories = whole(record.victories) ?? 0;
  // Its conditions are the token's own (the board shows them); none are kept here.
  hero.conditions = [];
  sheet.testDummy = { placementId: placement.id, hero: record.hero };
  return sheet;
}

/** The token's Stamina as {current, max, temp}; the hero's maximum when the token has none. */
export function tokenStamina(placement, fallbackMax = null) {
  const hp = placement?.hp ?? placement?.hitPoints ?? {};
  const max = whole(hp?.max) ?? whole(fallbackMax);
  return staminaState({ current: whole(hp?.current) ?? max ?? 0, max }, placement?.tempStamina);
}

const REFUSED = 'A test dummy has no character sheet to change.';
const staminaAnswer = (heroSheet, placement, s) => ({
  success: true, name: dummyName(heroSheet?.hero?.name), staminaMax: s.max ?? 0, currentStamina: s.current, tempStamina: s.temp,
  hasStamina: (s.max ?? 0) > 0,
});

/**
 * The answer to one sheet request for a dummy, and what it changes on the dummy token. Nothing here reaches a server.
 *   action, method ('GET'|'POST'), params: the request's own fields; heroSheet: the hero's sheet (summary); placement:
 *   the dummy token. Returns {json, record?: new dummy record, stamina?: {mode: damage|heal|temp, amount} | {set:{current,temp}}}.
 */
export function answerDummyRequest({ action, method = 'GET', params = {}, heroSheet = {}, placement }) {
  const record = dummyOf(placement);
  if (!record) return { json: { success: false, error: 'Unknown character' } };
  const vitals = heroSheet?.hero?.vitals ?? {};
  const s = tokenStamina(placement, vitals.staminaMax);
  const has = (key) => params[key] !== undefined && params[key] !== null && params[key] !== '';
  const next = { ...record };
  const post = method === 'POST';
  switch (action) {
    case 'summary':
    case 'load':
      return { json: { success: true, character: DUMMY_PREFIX + placement.id, data: dummySheet(heroSheet, placement), revision: 0 } };
    case 'live':
      return { json: { success: true, revision: 0, locks: [] } };
    case 'sync-token-traits':
      return { json: { success: false, error: 'forward' }, forward: true };
    case 'sync-stamina': {
      if (!post) return { json: { ...staminaAnswer(heroSheet, placement, s), conditions: [] } };
      if (has('delta')) {
        const delta = whole(params.delta) ?? 0;
        const after = delta < 0 ? damageStamina(s, -delta) : healStamina(s, delta);
        const withTemp = has('tempStamina') ? { ...after, temp: Math.max(0, whole(params.tempStamina) ?? 0) } : after;
        return { json: staminaAnswer(heroSheet, placement, withTemp), stamina: { set: { current: withTemp.current, temp: withTemp.temp } } };
      }
      if (!has('currentStamina') && !has('tempStamina')) return { json: { success: false, error: 'Missing stamina values' } };
      const set = { current: has('currentStamina') ? (whole(params.currentStamina) ?? s.current) : s.current, temp: has('tempStamina') ? Math.max(0, whole(params.tempStamina) ?? 0) : s.temp };
      return { json: staminaAnswer(heroSheet, placement, { ...s, ...set }), stamina: { set } };
    }
    case 'sync-surges': {
      if (!post) return { json: { success: true, name: dummyName(heroSheet?.hero?.name), surges: whole(record.surges) ?? 0 } };
      next.surges = has('value') ? Math.max(0, whole(params.value) ?? 0) : Math.max(0, (whole(record.surges) ?? 0) + (whole(params.delta) ?? 0));
      return { json: { success: true, name: dummyName(heroSheet?.hero?.name), surges: next.surges }, record: next };
    }
    case 'sync-resource': {
      const current = whole(record.resource) ?? 0;
      if (has('spend')) {
        const cost = whole(params.spend);
        if (cost === null || cost < 1) return { json: { success: false, error: 'Invalid upkeep cost' } };
        if (current < cost) return { json: { success: true, paid: false, reason: 'insufficient resource', resource: current } };
        next.resource = current - cost;
        return { json: { success: true, paid: true, name: dummyName(heroSheet?.hero?.name), resource: next.resource }, record: next };
      }
      if (has('delta')) next.resource = current + (whole(params.delta) ?? 0);
      else if (has('value')) {
        if (has('expectedValue') && whole(params.expectedValue) !== current) return { json: { success: false, error: 'Resource changed; review its current value before applying this change.' } };
        next.resource = whole(params.value) ?? current;
      } else return { json: { success: false, error: 'Missing resource value' } };
      return { json: { success: true, paid: null, name: dummyName(heroSheet?.hero?.name), resource: next.resource }, record: next };
    }
    case 'sync-victories': {
      next.victories = has('delta') ? Math.max(0, (whole(record.victories) ?? 0) + (whole(params.delta) ?? 0)) : Math.max(0, whole(params.value) ?? 0);
      return { json: { success: true, victories: next.victories }, record: next };
    }
    case 'sync-vitals': {
      const left = Math.max(0, whole(record.recoveries) ?? 0);
      if (has('spendRecoveries')) {
        const cost = whole(params.spendRecoveries);
        if (cost === null || cost < 1) return { json: { success: false, error: 'Invalid recovery cost' } };
        const spent = left >= cost ? cost : 0;
        next.recoveries = left - spent;
        return { json: { success: true, spent, currentRecoveries: next.recoveries, ...(spent ? {} : { reason: 'insufficient' }) }, ...(spent ? { record: next } : {}) };
      }
      if (has('useRecovery')) {
        const heals = recoveryValueOf({ staminaMax: s.max ?? vitals.staminaMax });
        const answer = (spent, current, reason = '') => ({ success: true, spent, currentStamina: current, currentRecoveries: left - spent, recoveryValue: heals, tempStamina: s.temp, ...(reason ? { reason } : {}) });
        if (left < 1) return { json: answer(0, s.current, 'No Recoveries left.') };
        if (heals < 1) return { json: answer(0, s.current, 'This sheet has no recovery value and no Stamina maximum to work one out from.') };
        const healed = healStamina(s, heals);
        next.recoveries = left - 1;
        return { json: answer(1, healed.current), record: next, stamina: { mode: 'heal', amount: heals } };
      }
      if (has('staminaDelta')) {
        const amount = whole(params.staminaDelta) ?? 0;
        const after = amount < 0 ? damageStamina(s, -amount) : healStamina(s, amount);
        return { json: { success: true, currentStamina: after.current, currentRecoveries: left, tempStamina: after.temp }, stamina: amount < 0 ? { mode: 'damage', amount: -amount } : { mode: 'heal', amount } };
      }
      if (has('gainTemp') || has('tempStamina')) {
        const after = has('gainTemp') ? gainTempStamina(s, whole(params.gainTemp) ?? 0) : { ...s, temp: Math.max(0, whole(params.tempStamina) ?? 0) };
        return { json: { success: true, currentStamina: after.current, currentRecoveries: left, tempStamina: after.temp }, stamina: { set: { current: after.current, temp: after.temp } } };
      }
      if (has('recoveriesDelta')) {
        next.recoveries = Math.max(0, left + (whole(params.recoveriesDelta) ?? 0));
        return { json: { success: true, currentRecoveries: next.recoveries }, record: next };
      }
      if (!has('currentStamina') && !has('currentRecoveries')) return { json: { success: false, error: 'Missing vital values' } };
      if (has('currentRecoveries')) next.recoveries = Math.max(0, whole(params.currentRecoveries) ?? left);
      const current = has('currentStamina') ? (whole(params.currentStamina) ?? s.current) : s.current;
      return { json: { success: true, currentStamina: current, currentRecoveries: next.recoveries }, record: next, ...(has('currentStamina') ? { stamina: { set: { current, temp: s.temp } } } : {}) };
    }
    case 'sync-conditions':
      // The dummy's conditions are its token's; nothing is mirrored anywhere.
      return { json: { success: true, skipped: true, conditions: [] } };
    default:
      // save, save-fields, respite, locks, the party's hero tokens: nothing of a dummy's is a sheet's to write.
      return { json: { success: false, error: REFUSED } };
  }
}

/** The fields of a request: its query, then its body (form text, URLSearchParams, FormData or JSON). */
export function requestFields(url, init = {}) {
  const fields = {};
  try { for (const [k, v] of new URL(url, 'http://x').searchParams) fields[k] = v; } catch { /* not a URL */ }
  const body = init?.body;
  if (body === undefined || body === null) return fields;
  if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) { for (const [k, v] of body) fields[k] = v; return fields; }
  if (typeof FormData !== 'undefined' && body instanceof FormData) { for (const [k, v] of body) if (typeof v === 'string') fields[k] = v; return fields; }
  if (typeof body === 'string') {
    const text = body.trim();
    if (text.startsWith('{')) { try { Object.assign(fields, JSON.parse(text)); } catch { /* not JSON */ } return fields; }
    for (const [k, v] of new URLSearchParams(text)) fields[k] = v;
  }
  return fields;
}

const SHEET_PATH = /\/dnd\/(character_sheet\/handler\.php|vtt\/api\/sheet\.php)$/;
const READ_PATHS = /\/dnd\/(api\/campaign\.php|vtt\/api\/items\.php)$/;
const REFUSE_PATHS = /\/dnd\/vtt\/api\/v2\/hero-conditions\.php$/;

/**
 * Puts the stand-in in front of the page's fetch. board: {placement(id), heroSheet(hero) → Promise<sheet>,
 * setRecord(id, record), stamina(id, change)} (board-interactions.js). Any request whose character is a dummy id is
 * answered here; a read the hero's own answer serves (its campaign record, its items) asks for the hero instead.
 */
export function installDummySheetShim(target, board) {
  const original = target.fetch.bind(target);
  if (target.fetch.__dummyShim) return target.fetch;
  const shim = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url ?? String(input);
    let path = '';
    try { path = new URL(url, target.location?.href ?? 'http://x').pathname; } catch { return original(input, init); }
    const sheet = SHEET_PATH.test(path), read = READ_PATHS.test(path), refuse = REFUSE_PATHS.test(path);
    if (!sheet && !read && !refuse) return original(input, init);
    const fields = requestFields(url, init);
    const character = String(fields.character ?? fields.characterId ?? '');
    if (!isDummyId(character)) return original(input, init);
    const reply = (json, status = 200) => new Response(JSON.stringify(json), { status, headers: { 'Content-Type': 'application/json' } });
    const placement = board.placement(dummyPlacementId(character));
    const hero = dummyHeroOf(placement);
    if (!hero) return reply({ success: false, error: 'That test dummy is no longer on the map.' });
    const method = String(init?.method || (typeof input === 'object' && input?.method) || 'GET').toUpperCase();
    if (refuse) return reply({ success: false, error: REFUSED });
    if (read) {
      if (method !== 'GET') return reply({ success: false, error: REFUSED });
      const forward = new URL(url, target.location?.href ?? 'http://x');
      forward.searchParams.set('character', hero);
      return original(forward.toString(), init);
    }
    const action = String(fields.action || '');
    if (action === 'sync-token-traits' && method === 'GET') {
      const forward = new URL(url, target.location?.href ?? 'http://x');
      forward.searchParams.set('character', hero);
      return original(forward.toString(), init);
    }
    const heroSheet = await board.heroSheet(hero);
    const answer = answerDummyRequest({ action, method, params: fields, heroSheet, placement });
    if (answer.record) await board.setRecord(placement.id, answer.record);
    if (answer.stamina) await board.stamina(placement.id, answer.stamina);
    return reply(answer.json);
  };
  shim.__dummyShim = true;
  target.fetch = shim;
  return shim;
}

// On the map page the stand-in goes in at once, before any sheet is asked for; the board (board-interactions.js) fills
// in window.vttTestDummyBoard when it is ready.
if (typeof window !== 'undefined' && typeof window.fetch === 'function' && typeof Response === 'function') {
  const board = () => window.vttTestDummyBoard || null;
  installDummySheetShim(window, {
    placement: (id) => board()?.placement?.(id) ?? null,
    heroSheet: (hero) => board()?.heroSheet?.(hero) ?? Promise.resolve({}),
    setRecord: (id, record) => board()?.setRecord?.(id, record),
    stamina: (id, change) => board()?.stamina?.(id, change),
  });
}
