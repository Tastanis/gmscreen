import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { movementWaiver, zoneCostFor } from '../terrain-zones.mjs';

// Phase 4 (Brandon, October 2026): movement rules the board follows (speed, difficult terrain, opportunity attacks),
// abilities found by name, heroes asked to move with a popup.

const board = await readFile(new URL('../board-interactions.js', import.meta.url), 'utf8');
function section(start, end) {
  const first = board.indexOf(start);
  const last = board.indexOf(end, first + start.length);
  assert.ok(first >= 0 && last > first, start);
  return board.slice(first, last);
}

function rulesHarness(placements) {
  const store = new Map(placements.map((p) => [p.id, p]));
  const deps = {
    getPlacementFromStore: (id) => store.get(id),
    ensurePlacementHitPoints: (hp) => ({ ...(hp || {}) }),
    ensurePlacementConditions: (list) => (Array.isArray(list) ? list : list ? [list] : []),
    getCharacterSheetProfileIdForPlacement: (p) => p.profile || '',
    characterSummaryCache: new Map([['zepha', { features: [{ title: 'Nimble', automation: { passives: [{ kind: 'movement', speedBonus: 1 }] } }] }]]),
    window: {},
  };
  const code = `${section('  function monsterPassivesOfKind(', '  // "Rise again" (deathRule passive)')}
    ${section('  // ---------- movement rules (movement passives and buffs) ----------', '  // The terrain cost reads this')}
    return movementRulesFor;`;
  return new Function('deps', `with (deps) { ${code} }`)(deps);
}

test('movement rules: passives with gates, hero features, and buffs on the token', () => {
  const elf = { id: 'elf', hp: { current: 4, max: 20 }, monster: { traits: [{ name: 'Fickle and Free', automation: { passives: [{ kind: 'movement', ignoreDifficultTerrain: true, when: { winded: true } }, { kind: 'movement', speedBonus: 2 }] } }] } };
  const healthy = { ...elf, id: 'elf2', hp: { current: 20, max: 20 } };
  const goblin = { id: 'gob', conditions: [{ name: 'hiddenEffect', label: 'Goblin Mode', rider: { type: 'rollBuff', speedBonus: 3, noOpportunityAttacks: true } }] };
  const zepha = { id: 'z', profile: 'zepha' };
  const rules = rulesHarness([elf, healthy, goblin, zepha]);
  assert.deepEqual(rules(elf), { speedBonus: 2, ignoreDifficultTerrain: true, noOpportunityAttacks: false, moveThroughCreatures: false, grabLimit: 1, labels: ['Fickle and Free'] });
  assert.equal(rules(healthy).ignoreDifficultTerrain, false, 'the winded gate');
  assert.deepEqual([rules(goblin).speedBonus, rules(goblin).noOpportunityAttacks], [3, true]);
  assert.equal(rules(zepha).speedBonus, 1, "a hero's feature");
});

test('difficult terrain costs nothing extra with the rule, or with "ignores difficult terrain" in the movement', () => {
  const saved = globalThis.vttMovementRulesFor;
  try {
    globalThis.vttMovementRulesFor = (p) => ({ ignoreDifficultTerrain: p?.id === 'elf' });
    assert.equal(zoneCostFor({ tag: 'mud', cost: 2 }, movementWaiver({ id: 'elf' })), 1);
    assert.equal(zoneCostFor({ tag: 'mud', cost: 2 }, movementWaiver({ id: 'orc' })), 2);
    globalThis.vttMovementRulesFor = undefined;
    assert.equal(zoneCostFor({ tag: 'mud', cost: 2 }, movementWaiver({ id: 'x', movement: 'Fly, ignores difficult terrain' })), 1);
  } finally { globalThis.vttMovementRulesFor = saved; }
});

test('the speed bonus and the opportunity-attack check use the movement rules', () => {
  assert.match(board, /getSpeedBonus: \(tokenId\) => \(captainBonusFor\(getPlacementsForActiveScene\(\), tokenId\)\?\.speed \?\? 0\)\s*\n\s*\+ \(movementRulesFor\(getPlacementFromStore\(tokenId\)\)\?\.speedBonus \|\| 0\)/);
  assert.match(board, /detail\.kind === 'normal' && !movementRulesFor\(movingPlacement\)\.noOpportunityAttacks/);
});

test('abilities by name, and "signature"', () => {
  const store = new Map([
    ['wolf', { id: 'wolf', monster: { abilities: { action: [{ name: 'Claw', keywords: 'Melee, Strike' }, { name: 'Savage Bite', keywords: 'Signature Ability, Melee' }], maneuver: [{ name: 'Howl' }] } } }],
    ['ogre', { id: 'ogre', monster: { abilities: { action: [{ name: 'Club' }] } } }],
  ]);
  const find = new Function('deps', `with (deps) { ${section('  function abilityForPlacement(', '  // ---------- heroes told to move by an ability ----------')}; return abilityForPlacement; }`)({
    getPlacementFromStore: (id) => store.get(id), getCharacterSheetProfileIdForPlacement: () => '', characterSummaryCache: new Map(),
  });
  assert.equal(find('wolf', 'howl').name, 'Howl');
  assert.equal(find('wolf', 'bite').name, 'Savage Bite', 'part of the name');
  assert.equal(find('wolf', 'signature').name, 'Savage Bite');
  assert.equal(find('ogre', 'signature').name, 'Club', 'no ability says signature: its first action');
  assert.equal(find('ogre', 'tail'), null);
});

test('heroes asked to move: a popup for whoever can move the hero; Move opens the picker as its own move', () => {
  const popup = section('  function maybePromptHeroMove(', '  // Popup triggers ("when it dies")');
  assert.match(popup, /canCurrentUserMovePlacement\(placement\)/);
  assert.match(popup, /sourcePlacement: \{ id: placement\.id \}/);
  assert.match(popup, /walkKind: pending\.verb === 'move' \? 'walk' : 'shift'/);
  const ask = section('  function requestHeroMoves(', '  const heroMovePopups');
  assert.match(ask, /Stop waiting/);
  assert.match(board, /const walkKind = request\.payload\?\.walkKind === 'walk' \? 'walk' : 'shift';/);
});
