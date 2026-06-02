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

test('suggests high ground when map levels are passed as board state', () => {
  const actor = ally('actor', 1, 1, { levelId: 'upper' });
  const target = enemy('target', 1, 2, { levelId: 'level-0' });
  const suggestions = getPowerRollSuggestions({
    actor,
    targets: [target],
    placements: [actor, target],
    mapLevels: {
      levels: [
        { id: 'level-0', zIndex: 0 },
        { id: 'upper', zIndex: 2 },
      ],
    },
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

test('suggests source-aware condition edges and banes', () => {
  const actor = ally('actor', 1, 1, {
    conditions: [
      { name: 'Taunted', sourceId: 'taunter' },
      { name: 'Grabbed', sourceId: 'grappler' },
      { name: 'Frightened', sourceId: 'fear-source' },
      { name: 'Prone' },
    ],
  });
  const target = enemy('target', 1, 2, {
    conditions: [
      { name: 'Prone' },
      { name: 'Frightened', sourceId: 'actor' },
      { name: 'Unconscious' },
    ],
  });
  const suggestions = getPowerRollSuggestions({
    actor,
    targets: [target, enemy('fear-source', 2, 2)],
    placements: [actor, target],
    context: { keywords: ['Melee', 'Strike'], rollEvent: 'powerRoll' },
  });
  assert.deepEqual(activeIds(suggestions), [
    'bane-frightened',
    'bane-grabbed',
    'bane-prone',
    'bane-taunted',
    'edge-frightened',
    'edge-prone',
    'edge-unconscious',
  ]);
  assert.equal(suggestions.find((entry) => entry.id === 'bane-taunted')?.count, 2);
  assert.equal(suggestions.find((entry) => entry.id === 'edge-unconscious')?.count, 2);
});

test('does not suggest taunted bane when the taunter is targeted', () => {
  const actor = ally('actor', 1, 1, {
    conditions: [{ name: 'Taunted', sourceId: 'taunter' }],
  });
  const taunter = enemy('taunter', 1, 2);
  const suggestions = getPowerRollSuggestions({
    actor,
    targets: [taunter],
    placements: [actor, taunter],
    context: { keywords: ['Melee', 'Strike'], rollEvent: 'powerRoll' },
  });
  assert.equal(activeIds(suggestions).includes('bane-taunted'), false);
});

test('suggests active hidden roll modifier riders and preserves consume refs', () => {
  const actor = ally('actor', 1, 1, {
    conditions: [{
      name: 'hiddenEffect',
      label: 'Bane on next strike',
      rider: {
        type: 'rollModifier',
        modifier: 'bane',
        appliesTo: { rollEvent: 'powerRoll', keywordsAny: ['Strike'] },
        consume: 'nextMatchingRoll',
      },
    }],
  });
  const target = enemy('target', 1, 2);
  const suggestions = getPowerRollSuggestions({
    actor,
    targets: [target],
    placements: [actor, target],
    context: { keywords: ['Melee', 'Strike'], rollEvent: 'powerRoll' },
  });
  const hidden = suggestions.find((entry) => entry.id === 'hidden-effect-actor-0');
  assert.equal(hidden?.kind, 'bane');
  assert.equal(hidden?.count, 1);
  assert.equal(hidden?.active, true);
  assert.equal(hidden?.consume, 'nextMatchingRoll');
  assert.deepEqual(hidden?.conditionRef, { placementId: 'actor', conditionIndex: 0 });
});

test('supports double hidden roll riders and keyword filtering', () => {
  const actor = ally('actor', 1, 1, {
    conditions: [
      {
        name: 'hiddenEffect',
        label: 'Double edge on next magic',
        rider: {
          type: 'rollModifier',
          modifier: 'doubleEdge',
          appliesTo: { keywordsAll: ['Magic'] },
        },
      },
      {
        name: 'hiddenEffect',
        label: 'Wrong keyword bane',
        rider: {
          type: 'rollModifier',
          modifier: 'bane',
          appliesTo: { keywordsAny: ['Melee'] },
        },
      },
    ],
  });
  const target = enemy('target', 1, 2);
  const suggestions = getPowerRollSuggestions({
    actor,
    targets: [target],
    placements: [actor, target],
    context: { keywords: ['Ranged', 'Magic'], rollEvent: 'powerRoll' },
  });
  const hidden = suggestions.find((entry) => entry.id === 'hidden-effect-actor-0');
  assert.equal(hidden?.kind, 'edge');
  assert.equal(hidden?.count, 2);
  assert.equal(ids(suggestions).includes('hidden-effect-actor-1'), false);
});

test('does not count same-team tokens as flankers', () => {
  const actor = ally('actor', 4, 5);
  const helper = enemy('enemy-helper', 7, 6);
  const target = enemy('ogre', 5, 5, { width: 2, height: 2 });
  assert.equal(__testing.isFlanking(actor, target, [actor, helper, target]), false);
});
