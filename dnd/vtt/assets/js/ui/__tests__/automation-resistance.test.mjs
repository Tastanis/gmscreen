import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveAutomationDamageAmount,
  resolveAutomationForcedMovementDistance,
  resolveIgnoredResistance,
} from '../automation-resistance.js';

test('ignored resistance supports none, a fixed amount, and all', () => {
  assert.deepEqual(resolveIgnoredResistance(7, false), { total: 7, ignored: 0, applied: 7 });
  assert.deepEqual(resolveIgnoredResistance(7, 3), { total: 7, ignored: 3, applied: 4 });
  assert.deepEqual(resolveIgnoredResistance(7, true), { total: 7, ignored: 7, applied: 0 });
  assert.deepEqual(resolveIgnoredResistance(7, 'all'), { total: 7, ignored: 7, applied: 0 });
  assert.deepEqual(resolveIgnoredResistance(3, 20), { total: 3, ignored: 3, applied: 0 });
});

test('damage can ignore some or all immunity without losing weakness', () => {
  assert.deepEqual(resolveAutomationDamageAmount({
    amount: 10,
    vulnerability: 2,
    immunity: 5,
    ignoreImmunity: 3,
  }), {
    amount: 10,
    originalAmount: 10,
    vulnerability: 2,
    immunity: 2,
    ignoredImmunity: 3,
    totalImmunity: 5,
  });

  assert.deepEqual(resolveAutomationDamageAmount({
    amount: 10,
    vulnerability: 2,
    immunity: 5,
    ignoreImmunity: true,
  }), {
    amount: 12,
    originalAmount: 10,
    vulnerability: 2,
    immunity: 0,
    ignoredImmunity: 5,
    totalImmunity: 5,
  });
});

test('forced movement can ignore Stability independently from size resistance', () => {
  assert.deepEqual(resolveAutomationForcedMovementDistance({
    distance: 8,
    stability: 3,
    sizePenalty: 2,
    ignoreStability: 2,
  }), {
    distance: 5,
    requestedDistance: 8,
    stability: 1,
    ignoredStability: 2,
    sizePenalty: 2,
    ignoredSizePenalty: 0,
  });

  assert.deepEqual(resolveAutomationForcedMovementDistance({
    distance: 8,
    stability: 3,
    sizePenalty: 2,
    ignoreStability: true,
  }), {
    distance: 6,
    requestedDistance: 8,
    stability: 0,
    ignoredStability: 3,
    sizePenalty: 2,
    ignoredSizePenalty: 0,
  });
});

test('voluntary movement can bypass both Stability and size resistance', () => {
  assert.equal(resolveAutomationForcedMovementDistance({
    distance: 6,
    stability: 4,
    sizePenalty: 3,
    ignoreStability: true,
    ignoreSizePenalty: true,
  }).distance, 6);
});
