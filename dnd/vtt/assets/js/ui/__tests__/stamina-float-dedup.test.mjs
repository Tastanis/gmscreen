import test from 'node:test';
import assert from 'node:assert/strict';

import { claimRecentStaminaFloatEventId } from '../board-interactions.js';

test('the same stamina-float event id can render only once', () => {
  const history = new Set();
  assert.equal(claimRecentStaminaFloatEventId(history, 'float-123'), true);
  assert.equal(claimRecentStaminaFloatEventId(history, 'float-123'), false);
});

test('different event ids preserve legitimate repeated equal-damage hits', () => {
  const history = new Set();
  assert.equal(claimRecentStaminaFloatEventId(history, 'float-hit-one'), true);
  assert.equal(claimRecentStaminaFloatEventId(history, 'float-hit-two'), true);
});

test('events without ids remain displayable and old ids age out of the guard', () => {
  const history = new Set();
  assert.equal(claimRecentStaminaFloatEventId(history, ''), true);
  assert.equal(claimRecentStaminaFloatEventId(history, ''), true);
  assert.equal(claimRecentStaminaFloatEventId(history, 'float-a', 2), true);
  assert.equal(claimRecentStaminaFloatEventId(history, 'float-b', 2), true);
  assert.equal(claimRecentStaminaFloatEventId(history, 'float-c', 2), true);
  assert.equal(claimRecentStaminaFloatEventId(history, 'float-a', 2), true);
});
