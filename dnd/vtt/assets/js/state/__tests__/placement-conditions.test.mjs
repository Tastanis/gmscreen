import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizePlacementCondition,
  normalizePlacementConditions,
} from '../normalize/placements.js';

test('typed weakness survives canonical placement normalization and reload', () => {
  const weakness = {
    name: 'damageWeakness',
    amount: '5',
    damageType: ' FIRE ',
    duration: { type: 'save-ends' },
  };
  const once = normalizePlacementCondition(weakness);
  assert.deepEqual(once, {
    name: 'damageWeakness',
    amount: 5,
    damageType: 'fire',
    duration: { type: 'save-ends' },
  });
  assert.deepEqual(normalizePlacementCondition(JSON.parse(JSON.stringify(once))), once);
});

test('distinct typed weaknesses and values are retained while exact duplicates collapse', () => {
  const conditions = normalizePlacementConditions([
    { name: 'damageWeakness', damageType: 'fire', amount: 5 },
    { name: 'damageWeakness', damageType: 'fire', amount: 5 },
    { name: 'damageWeakness', damageType: 'cold', amount: 5 },
    { name: 'damageWeakness', damageType: 'fire', amount: 3 },
    { name: 'damageWeakness', amount: 2 },
  ]);
  assert.deepEqual(
    conditions.map((condition) => [condition.damageType ?? 'all', condition.amount]),
    [['fire', 5], ['cold', 5], ['fire', 3], ['all', 2]]
  );
});

test('invalid numeric rider fields do not corrupt ordinary conditions', () => {
  assert.deepEqual(normalizePlacementCondition({
    name: 'damageWeakness',
    amount: 0,
    damageType: 'untyped',
  }), {
    name: 'damageWeakness',
    duration: { type: 'save-ends' },
  });
  assert.deepEqual(normalizePlacementCondition({
    name: 'Prone',
    amount: 99,
    damageType: 'fire',
  }), {
    name: 'Prone',
    duration: { type: 'save-ends' },
  });
});
