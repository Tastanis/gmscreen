import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizePlacementEntry } from '../../state/normalize/placements.js';

// Phase 3 (Brandon, October 2026): "when it dies" abilities pop up for the GM to confirm; undead rise again by
// themselves with a banner; counters show as a badge on the token and a +/- row in the panel. "Write it in the most
// flexible way possible": uses, damage types, Stamina, conditions, limits and resets are all JSON fields.

const board = await readFile(new URL('../board-interactions.js', import.meta.url), 'utf8');
function section(start, end) {
  const first = board.indexOf(start);
  const last = board.indexOf(end, first + start.length);
  assert.ok(first >= 0 && last > first, start);
  return board.slice(first, last);
}

test('trigger resolve modes: written, auto, popup for its own death, click otherwise', () => {
  const mode = new Function(`${section('  function triggerResolveMode(', '  function registerAuthoredTriggerBlock(')}; return triggerResolveMode;`)();
  assert.equal(mode({}, { event: 'staminaZero', filter: { whose: 'self' } }), 'popup');
  assert.equal(mode({}, { event: 'staminaZero', filter: { whose: 'ally' } }), 'click', 'an ally dying is not its own death');
  assert.equal(mode({ autoResolve: true }, { event: 'staminaZero', filter: { whose: 'self' } }), 'auto');
  assert.equal(mode({ resolve: 'click' }, { event: 'staminaZero', filter: { whose: 'self' } }), 'click', 'the JSON can say otherwise');
  assert.equal(mode({ resolve: 'popup' }, { event: 'damage' }), 'popup', 'any trigger can be a popup');
  assert.equal(mode({}, { event: 'damage' }), 'click');
});

test('popup triggers mark the snapshot, do not use the triggered action, and the GM page asks once', () => {
  assert.match(board, /entry\.resolveMode === 'popup' \|\| entry\.resolveMode === 'run'\s*\? \{ eventType, payload, popup: true, at: Date\.now\(\)/);
  assert.match(board, /\|\| \(\(resolveMode === 'popup' \|\| resolveMode === 'run'\) && block\.usesTriggeredAction !== true\)/);
  const asked = section('  function maybePromptTriggerPopups(', '  async function promptTriggerPopup(');
  assert.match(asked, /!isGmUser\(\)/);
  assert.match(asked, /promptedTriggerPopups\.has\(key\)/);
});

function deathRuleHarness(placement, { squad = false } = {}) {
  const store = new Map([[placement.id, JSON.parse(JSON.stringify(placement))]]);
  const banners = [];
  const deps = {
    getPlacementFromStore: (id) => store.get(id),
    getMinionSquadForPlacement: () => (squad ? { id: 'sq' } : null),
    updatePlacementById: (id, fn) => fn(store.get(id)),
    ensurePlacementHitPoints: (hp) => ({ ...(hp || {}) }),
    ensurePlacementConditions: (list) => (Array.isArray(list) ? [...list] : list ? [list] : []),
    normalizeConditionDurationValue: (value) => value,
    showConditionBanner: (text) => banners.push(text),
    tokenLabel: (p) => p?.name || '',
    window: {},
    redrawAfterRuleChange: () => {},
  };
  const code = `${section('  function monsterPassivesOfKind(', '  // Uses that reset when combat ends')}; return { applyDeathRule, monsterPassivesOfKind };`;
  const fns = new Function('deps', `with (deps) { ${code} }`)(deps);
  return { ...fns, store, banners };
}
const skeleton = (rule) => ({
  id: 'sk', name: 'Skeleton', hp: { current: '0', max: '10' }, conditions: [],
  monster: { traits: [{ name: 'Arise', automation: { passives: [{ kind: 'deathRule', ...rule }] } }] },
});

test('rise again: defaults are 1 Stamina, prone, once', () => {
  const h = deathRuleHarness(skeleton({}));
  assert.equal(h.applyDeathRule('sk', 'untyped'), true);
  const after = h.store.get('sk');
  assert.equal(after.hp.current, '1');
  assert.deepEqual(after.conditions.map((c) => c.name), ['prone']);
  assert.deepEqual(after.deathRuleUses, { Arise: 1 });
  assert.match(h.banners[0], /Skeleton rises again!/);
  after.hp.current = '0';
  assert.equal(h.applyDeathRule('sk', 'untyped'), false, 'once by default');
});

test('rise again: every limit comes from the JSON', () => {
  // Fire or holy stops it.
  let h = deathRuleHarness(skeleton({ notWhenDamageTypes: ['fire', 'holy'] }));
  assert.equal(h.applyDeathRule('sk', 'fire'), false);
  assert.equal(h.applyDeathRule('sk', 'cold'), true);
  // A troll: only acid or fire can't be risen from; it rises any number of times, to 5 Stamina, not prone.
  h = deathRuleHarness(skeleton({ label: 'Relentless', uses: 'unlimited', setStamina: 5, conditions: [] }));
  for (let i = 0; i < 4; i += 1) { h.store.get('sk').hp.current = '0'; assert.equal(h.applyDeathRule('sk', ''), true); }
  assert.equal(h.store.get('sk').hp.current, '5');
  assert.deepEqual(h.store.get('sk').conditions, []);
  // Twice, and only from cold damage.
  h = deathRuleHarness(skeleton({ uses: 2, onlyWhenDamageTypes: ['cold'], banner: 'The ice reforms!' }));
  assert.equal(h.applyDeathRule('sk', 'fire'), false);
  assert.equal(h.applyDeathRule('sk', 'cold'), true);
  assert.equal(h.applyDeathRule('sk', 'cold'), true);
  assert.equal(h.applyDeathRule('sk', 'cold'), false);
  assert.equal(h.banners[0], 'The ice reforms!');
  // Minions in a squad never rise (their Stamina is the squad's).
  h = deathRuleHarness(skeleton({}), { squad: true });
  assert.equal(h.applyDeathRule('sk', ''), false);
});

test('a creature that rises has not died: no "dies" event, on automated and hand damage', () => {
  assert.match(board, /afterStamina <= 0\s*\n\s*&& !applyDeathRule\(payload\.placementId, payload\.damageType \|\| ''\)\) \{\s*\n\s*triggerFire\('staminaZero'/);
  assert.match(board, /afterValue <= 0 && !\(damage && applyDeathRule\(placementId, damage\.damageType \|\| ''\)\)\) \{/);
});

function counterHarness(placement) {
  const store = new Map([[placement.id, JSON.parse(JSON.stringify(placement))]]);
  const deps = {
    getPlacementFromStore: (id) => store.get(id),
    getPlacementsForActiveScene: () => [...store.values()],
    updatePlacementById: (id, fn) => fn(store.get(id)),
    getMinionSquadForPlacement: () => null,
    document: { createElement: () => ({}) },
    redrawAfterRuleChange: () => {},
  };
  const code = `${section('  function monsterPassivesOfKind(', '  // "Rise again" (deathRule passive)')}
    ${section('  // ---------- counters (rage, deathcount, charges) ----------', '  function paintTokenCounters(')}
    return { tokenCounters, getTokenCounter, changeTokenCounter, resetTokenCounters };`;
  return { ...new Function('deps', `with (deps) { ${code} }`)(deps), store };
}
const werewolf = {
  id: 'wolf', name: 'Werewolf',
  monster: { traits: [{ name: 'Accursed Rage', automation: { passives: [{ kind: 'counter', name: 'rage', label: 'Rage', start: 0, max: 10 }] } }] },
};

test('counters: declared with a start, changed by add / spend / set within min and max', () => {
  const h = counterHarness(werewolf);
  assert.deepEqual(h.tokenCounters(h.store.get('wolf')), [{ name: 'rage', label: 'Rage', value: 0, min: 0, max: 10, declared: true }], 'shown from the start, at 0');
  assert.equal(h.changeTokenCounter({ placementId: 'wolf', name: 'rage', op: 'add', amount: 4 }).value, 4);
  assert.equal(h.changeTokenCounter({ placementId: 'wolf', name: 'Rage', op: 'add', amount: 9 }).value, 10, 'capped at its max');
  const spent = h.changeTokenCounter({ placementId: 'wolf', name: 'rage', op: 'spend', amount: 12 });
  assert.deepEqual([spent.value, spent.previous], [0, 10], 'never below its min');
  assert.equal(h.changeTokenCounter({ placementId: 'wolf', name: 'rage', op: 'set', amount: 3 }).value, 3);
  assert.equal(h.getTokenCounter('wolf', 'rage'), 3);
  // An undeclared counter an ability sets still shows.
  h.changeTokenCounter({ placementId: 'wolf', name: 'charges', op: 'add', amount: 2 });
  assert.deepEqual(h.tokenCounters(h.store.get('wolf')).map((c) => [c.label, c.value]), [['Rage', 3], ['Charges', 2]]);
});

test('counters reset at their own boundary', () => {
  const h = counterHarness({ ...werewolf, monster: { traits: [{ name: 'x', automation: { passives: [
    { kind: 'counter', name: 'rage', start: 0 },
    { kind: 'counter', name: 'focus', start: 1, resetAt: 'roundStart' },
    { kind: 'counter', name: 'scars', resetAt: 'never' },
  ] } }] } });
  ['rage', 'focus', 'scars', 'loose'].forEach((name) => h.changeTokenCounter({ placementId: 'wolf', name, op: 'set', amount: 5 }));
  h.resetTokenCounters('roundStart');
  assert.deepEqual(h.store.get('wolf').counters, { rage: 5, focus: 1, scars: 5, loose: 5 });
  h.resetTokenCounters('combatEnd');
  assert.deepEqual(h.store.get('wolf').counters, { rage: 0, focus: 1, scars: 5 }, 'undeclared ones go when combat ends');
});

test('the token keeps its counters and rise-again uses when saved', () => {
  const kept = normalizePlacementEntry({ id: 'wolf', counters: { rage: 3 }, deathRuleUses: { Arise: 1 } });
  assert.deepEqual(kept.counters, { rage: 3 });
  assert.deepEqual(kept.deathRuleUses, { Arise: 1 });
});

test('squad minions that drop each fire their own death, hit one first', () => {
  const code = section('  function fireSquadMinionDeaths(', '  function showMinionKillPopup(');
  const fired = [];
  const placements = { a: { id: 'a', column: 0 }, b: { id: 'b', column: 5 }, c: { id: 'c', column: 1 } };
  const fn = new Function('deps', `with (deps) { ${code}; return fireSquadMinionDeaths; }`)({
    getPlacementFromStore: (id) => placements[id],
    getActiveSceneTokenLevelState: () => ({}),
    placementSquareDistance: (x, y) => Math.abs(x.column - y.column),
    triggerFire: (type, payload) => fired.push([type, payload.placementId]),
  });
  fn({ memberIds: ['a', 'b', 'c'] }, 'a', { kills: 2, current: 4, previous: 12 });
  assert.deepEqual(fired, [['staminaZero', 'a'], ['staminaZero', 'c']], 'the hit minion, then the nearest');
  fired.length = 0;
  fn({ memberIds: ['a', 'b', 'c'] }, 'a', { kills: 3, current: 0, previous: 12 });
  assert.deepEqual(fired.map((f) => f[1]), ['c', 'b'], 'the whole squad down: the hit one is told by the usual event');
});

test('solo turns: from the passive, else 2 for a Solo monster; counted per round; back to back is a reminder only', async () => {
  const store = new Map();
  const banners = [];
  const intents = [];
  const deps = {
    getPlacementFromStore: (id) => store.get(id),
    updatePlacementById: (id, fn) => fn(store.get(id)),
    getMinionSquadForPlacement: () => null,
    combatRound: 2, roundTurnCount: 5, activeCombatantId: null, combatActive: true, combatV2Enabled: true,
    isGmUser: () => true,
    showConditionBanner: (text) => banners.push(text),
    tokenLabel: (p) => p?.name || '',
    getCombatantLabel: () => '', confirmSwitchActiveTurn: async () => true, getCurrentUserName: () => 'GM',
    submitCanonicalCombatIntent: async (type, details) => intents.push([type, details]),
    redrawAfterRuleChange: () => {},
  };
  const code = `${section('  function monsterPassivesOfKind(', '  // "Rise again" (deathRule passive)')}
    ${section('  // ---------- solo turns ----------', '  function handleSoloTurnActivation(')}
    return { soloTurnCount, soloTurnsFor, countSoloTurnStart, noteSoloTurnEnd, startSoloExtraTurn };`;
  const fns = new Function('deps', `with (deps) { ${code} }`)(deps);
  store.set('dragon', { id: 'dragon', name: 'Meteor Dragon', monster: { organization: 'Solo', traits: [] } });
  store.set('three', { id: 'three', monster: { traits: [{ name: 'x', automation: { passives: [{ kind: 'soloTurns', turns: 3 }] } }] } });
  store.set('off', { id: 'off', monster: { organization: 'Solo', traits: [{ name: 'x', automation: { passives: [{ kind: 'soloTurns', turns: 1 }] } }] } });
  store.set('brute', { id: 'brute', monster: { role: 'Brute', traits: [] } });
  assert.deepEqual(['dragon', 'three', 'off', 'brute'].map((id) => fns.soloTurnCount(store.get(id))), [2, 3, 1, 1]);
  fns.countSoloTurnStart('dragon');
  assert.deepEqual(fns.soloTurnsFor('dragon'), { turns: 2, taken: 1, active: false });
  fns.noteSoloTurnEnd('dragon');
  await fns.startSoloExtraTurn('dragon');
  assert.match(banners[0], /solo turns can't be back to back/);
  assert.deepEqual(intents[0], ['turn.start', { combatantId: 'dragon', holderName: 'GM', override: true }], 'the turn still starts');
  // A turn by someone else in between: no reminder.
  deps.roundTurnCount = 6; banners.length = 0;
  const fns2 = new Function('deps', `with (deps) { ${code} }`)(deps);
  await fns2.startSoloExtraTurn('dragon');
  assert.equal(banners.length, 0);
});
