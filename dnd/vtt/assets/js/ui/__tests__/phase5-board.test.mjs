import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseDefenseText, pickDefense, defenseEntriesFromMonster, defenseEntriesFromConditions, resolveAutomationDamageAmount, describeDefense } from '../automation-resistance.js';
import { abilityTerrainZones } from '../terrain-zones.mjs';
import { getPowerRollSuggestions } from '../power-roll-suggestions.js';

// Phase 5 (Brandon, October 2026): immunity and weakness applied by the Draw Steel rules with a chat line; ability
// zones as difficult terrain that ask the Director before they go; invisible creatures hidden from other players.

const board = await readFile(new URL('../board-interactions.js', import.meta.url), 'utf8');
function section(start, end) {
  const first = board.indexOf(start);
  const last = board.indexOf(end, first + start.length);
  assert.ok(first >= 0 && last > first, start);
  return board.slice(first, last);
}

test('hero sheet lines: "fire immunity 5", "5" (all damage), "poison all", "+fire 2" (adds)', () => {
  assert.deepEqual(parseDefenseText('fire immunity 5'), { type: 'fire', value: 5 });
  assert.deepEqual(parseDefenseText('5'), { type: '', value: 5 });
  assert.deepEqual(parseDefenseText('Poison all'), { type: 'poison', value: 'all' });
  assert.deepEqual(parseDefenseText('+fire 2'), { type: 'fire', value: 2, stacks: true });
  assert.equal(parseDefenseText('equal to your level'), null);
});

test('only the highest immunity counts; "stacks" adds; "all" ignores everything; weakness comes first', () => {
  const entries = [
    ...defenseEntriesFromMonster({ immunities: [{ type: 'fire', value: 5 }, { type: '', value: 3 }], weaknesses: [{ type: 'holy', value: 4 }] }, 'immunity'),
    ...defenseEntriesFromMonster({ weaknesses: [{ type: 'holy', value: 4 }] }, 'weakness'),
    ...defenseEntriesFromConditions([{ name: 'damageImmunity', amount: 2, damageType: 'fire' }, { name: 'damageWeakness', amount: 1 }]),
  ];
  assert.equal(pickDefense(entries, 'immunity', 'fire').value, 5, 'fire 5 beats all-damage 3 and the effect 2');
  assert.equal(pickDefense(entries, 'immunity', 'cold').value, 3);
  assert.equal(pickDefense(entries, 'weakness', 'holy').value, 4, 'holy 4 beats all-damage 1');
  const stacked = [...entries, { kind: 'immunity', type: 'fire', value: 2, stacks: true }];
  const fire = pickDefense(stacked, 'immunity', 'fire');
  assert.equal(fire.value, 7);
  assert.equal(describeDefense('immunity', fire, 'fire'), 'fire immunity 7');
  const all = pickDefense([{ kind: 'immunity', type: 'poison', value: 'all' }], 'immunity', 'poison');
  assert.equal(describeDefense('immunity', all, 'poison'), 'immune to poison');
  const resolved = resolveAutomationDamageAmount({ amount: 10, vulnerability: 2, immunity: all.value });
  assert.deepEqual([resolved.amount, resolved.immunityAll], [0, true]);
  assert.equal(resolveAutomationDamageAmount({ amount: 10, vulnerability: 2, immunity: 'all', ignoreImmunity: true }).amount, 12);
});

test('every damage path goes through the same rule and the same chat line', () => {
  const adjust = section('  async function getAutomationDamageAdjustment(', '  // The creature that dealt damage applied by hand');
  assert.match(adjust, /pickDefense\(entries, 'immunity', damageType\)/);
  assert.match(board, /if \(result && payload\.chatBreakdown !== true\) announceDamageDefense\(/);
  const manual = section('  async function applyManualDamageToPlacement(', '  async function getAutomationSheetForPlacement(');
  assert.match(manual, /announceDamageDefense\(placementId, adjustment, resolution\)/);
  assert.match(section('  async function applyAutomationCollisionDamage(', '  async function giveBackCollisionDamage('), /announceDamageDefense\(/);
  const said = [];
  const announce = new Function('deps', `with (deps) { ${section('  function announceDamageDefense(', '  // The creature that dealt damage')}; return announceDamageDefense; }`)({
    getPlacementFromStore: () => ({ id: 'gob', name: 'Goblin' }), isAutomationPlacementHidden: () => false,
    shouldHideEnemyHitPointValues: () => false, tokenLabel: (p) => p.name, announceToChat: (m) => said.push(m),
  });
  announce('gob', { immunityText: 'fire immunity 5', weaknessText: '' }, { originalAmount: 10, amount: 5, immunity: 5, vulnerability: 0 });
  announce('gob', { immunityText: '', weaknessText: '' }, { originalAmount: 10, amount: 10, immunity: 0, vulnerability: 0 });
  assert.deepEqual(said, ['Goblin: fire immunity 5 (10 → 5).']);
});

test('ability zones that are difficult terrain (or carry a tag) count as terrain for movement', () => {
  const zones = abilityTerrainZones({
    a: { id: 'a', persistentZones: [{ id: 'z1', abilityName: 'Mire', terrainCost: 2, template: { column: 2, row: 3, width: 2, height: 1 } }] },
    b: { id: 'b', persistentZones: [{ id: 'z2', tag: 'fire', squares: [{ column: 0, row: 0 }] }, { id: 'z3', template: { column: 9, row: 9 } }] },
  });
  assert.deepEqual(zones.map((z) => [z.id, z.tag, z.cost, z.squares.length]), [['ability:z1', 'difficult', 2, 2], ['ability:z2', 'fire', 1, 1]], 'a plain damage zone is not terrain');
  assert.deepEqual(zones[0].squares, [[2, 3], [3, 3]]);
});

test("a zone's time is up: askBeforeEnd false goes at once, the rest are marked and the Director is asked", async () => {
  const removed = [], marked = new Map();
  let asked = 0;
  const store = { gob: { id: 'gob', persistentZones: [{ id: 'z1' }, { id: 'z2' }] } };
  const end = new Function('deps', `with (deps) { ${section('  async function endPersistentZonesByTime(', '  const promptedZoneEnds')}; return endPersistentZonesByTime; }`)({
    removePersistentZones: async (ids, { reason }) => removed.push([ids, reason]),
    updatePlacementById: (id, fn) => { fn(store[id]); marked.set(id, store[id].persistentZones); },
    renderPersistentZoneOverlays() {}, maybePromptZoneEnds: () => { asked += 1; }, Date,
  });
  await end([{ id: 'z1', casterId: 'gob', askBeforeEnd: false }, { id: 'z2', casterId: 'gob' }, { id: 'z3', casterId: 'gob', endDue: { at: 1 } }], 'end of the round');
  assert.deepEqual(removed, [[['z1'], 'end of the round']]);
  assert.equal(marked.get('gob').find((z) => z.id === 'z2').endDue.reason, 'end of the round');
  assert.equal(asked, 1);
  assert.match(section('  function maybePromptZoneEnds(', '  // Zones that last'), /confirmText: 'Remove', cancelText: 'Keep'/);
  assert.match(board, /endPersistentZonesAtCombatEnd\(\);/, 'combat end asks instead of wiping');
});

test('invisible: gone for other players, faded for the Director; strikes against it take a named bane', () => {
  assert.match(board, /if \(isInvisibleToViewer\(placement\)\) \{\s*return;/);
  assert.match(board, /function isInvisibleToViewer\(placement\) \{\s*return !isGmUser\(\) && hasInvisibleCondition\(placement\) && !canCurrentUserMovePlacement\(placement\);/);
  const target = { id: 't', name: 'Imp', conditions: [{ name: 'invisible', sourceAbility: 'Vanish' }] };
  const strike = getPowerRollSuggestions({ actor: { id: 'a' }, targets: [target], context: { keywords: ['Melee', 'Strike'] } });
  const bane = strike.find((s) => s.id === 'bane-concealed-t');
  assert.deepEqual([bane.kind, bane.label, bane.active, bane.reason], ['bane', 'Invisible', true, 'From Vanish']);
  const area = getPowerRollSuggestions({ actor: { id: 'a' }, targets: [target], context: { keywords: ['Area', 'Magic'] } });
  assert.ok(!area.some((s) => s.id === 'bane-concealed-t'), 'not on an area ability');
  const fog = getPowerRollSuggestions({ actor: { id: 'a' }, targets: [{ id: 'f', conditions: ['Concealed'] }], context: { keywords: ['Ranged', 'Strike'] } });
  assert.equal(fog.find((s) => s.id === 'bane-concealed-f').label, 'Concealed');
});

test('the saved condition keeps immunity "all" and "stacks" (token-conditions normalizer)', async () => {
  const { ensurePlacementCondition } = await import('../token-conditions.js');
  const kept = ensurePlacementCondition({ name: 'damageImmunity', amount: 'all', damageType: 'poison', duration: { type: 'end-of-encounter' } });
  assert.deepEqual([kept.amount, kept.damageType], ['all', 'poison']);
  assert.equal(ensurePlacementCondition({ name: 'damageImmunity', amount: 2, stacks: true, duration: { type: 'save-ends' } }).stacks, true);
});
