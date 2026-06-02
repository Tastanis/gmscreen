import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getPowerRollSuggestions,
  __testing,
} from '../power-roll-suggestions.js';

const ally = (id, column, row, extra = {}) => ({
  id,
  column,
  row,
  width: 1,
  height: 1,
  team: 'ally',
  ...extra,
});

const enemy = (id, column, row, extra = {}) => ({
  id,
  column,
  row,
  width: 1,
  height: 1,
  team: 'enemy',
  ...extra,
});

function ids(suggestions) {
  return suggestions.map((entry) => entry.id).sort();
}

function activeIds(suggestions) {
  return suggestions.filter((entry) => entry.active).map((entry) => entry.id).sort();
}

test('suggests high ground when actor level ranks above target level', () => {
  const actor = ally('actor', 1, 1, { levelId: 'upper' });
  const target = enemy('target', 1, 2, { levelId: 'ground' });
  const suggestions = getPowerRollSuggestions({
    actor,
    targets: [target],
    placements: [actor, target],
    mapLevels: [
      { id: 'ground', zIndex: 0 },
      { id: 'upper', zIndex: 1 },
    ],
    context: { keywords: ['Ranged', 'Strike'] },
  });
  assert.ok(activeIds(suggestions).includes('edge-high-ground'));
});

test('suggests flanking for opposite allied tokens around a large target', () => {
  const actor = ally('actor', 4, 5);
  const helper = ally('helper', 7, 6);
  const target = enemy('ogre', 5, 5, { width: 2, height: 2 });
  const suggestions = getPowerRollSuggestions({
    actor,
    targets: [target],
    placements: [actor, helper, target],
    context: { keywords: ['Melee', 'Strike'] },
  });
  assert.ok(activeIds(suggestions).includes('edge-flanking'));
});

test('does not suggest flanking when ally is dazed or on the same side', () => {
  const actor = ally('actor', 4, 5);
  const sameSide = ally('same', 4, 6);
  const dazedOpposite = ally('dazed', 7, 6, { conditions: [{ name: 'dazed' }] });
  const target = enemy('ogre', 5, 5, { width: 2, height: 2 });
  const suggestions = getPowerRollSuggestions({
    actor,
    targets: [target],
    placements: [actor, sameSide, dazedOpposite, target],
    context: { keywords: ['Melee', 'Strike'] },
  });
  assert.equal(activeIds(suggestions).includes('edge-flanking'), false);
});

test('suggests condition-based edges and banes', () => {
  const actor = ally('actor', 1, 1, { conditions: [{ name: 'Hidden' }, { name: 'Weakened' }] });
  const target = enemy('target', 1, 2, { conditions: [{ name: 'Prone' }, { name: 'Restrained' }] });
  const suggestions = getPowerRollSuggestions({
    actor,
    targets: [target],
    placements: [actor, target],
    context: { keywords: ['Melee', 'Strike'] },
  });
  assert.ok(ids(suggestions).includes('bane-cover'));
  assert.deepEqual(activeIds(suggestions), [
    'bane-weakened',
    'edge-hidden',
    'edge-prone',
    'edge-restrained',
  ]);
});

test('does not count same-team tokens as flankers', () => {
  const actor = ally('actor', 4, 5);
  const helper = enemy('enemy-helper', 7, 6);
  const target = enemy('ogre', 5, 5, { width: 2, height: 2 });
  assert.equal(__testing.isFlanking(actor, target, [actor, helper, target]), false);
});
