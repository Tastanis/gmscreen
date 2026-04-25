import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTokenStackOrderUpdate,
  getPlacementStackOrder,
  getTokenStackOrderAvailability,
} from '../token-stack-order.js';

test('getPlacementStackOrder falls back to the placement index', () => {
  assert.equal(getPlacementStackOrder({}, 4), 4);
  assert.equal(getPlacementStackOrder({ stackOrder: '2' }, 4), 2);
  assert.equal(getPlacementStackOrder({ stackOrder: -8 }, 4), 0);
});

test('buildTokenStackOrderUpdate moves a token forward one layer', () => {
  const changes = buildTokenStackOrderUpdate(
    [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    'a',
    'forward'
  );

  assert.deepEqual(changes, [
    { id: 'b', stackOrder: 0 },
    { id: 'a', stackOrder: 1 },
  ]);
});

test('buildTokenStackOrderUpdate moves a token backward one layer', () => {
  const changes = buildTokenStackOrderUpdate(
    [
      { id: 'a', stackOrder: 0 },
      { id: 'b', stackOrder: 1 },
      { id: 'c', stackOrder: 2 },
    ],
    'c',
    'backward'
  );

  assert.deepEqual(changes, [
    { id: 'c', stackOrder: 1 },
    { id: 'b', stackOrder: 2 },
  ]);
});

test('buildTokenStackOrderUpdate returns no changes at stack edges', () => {
  const placements = [{ id: 'a' }, { id: 'b' }];

  assert.deepEqual(buildTokenStackOrderUpdate(placements, 'a', 'backward'), []);
  assert.deepEqual(buildTokenStackOrderUpdate(placements, 'b', 'forward'), []);
});

test('getTokenStackOrderAvailability reports edge movement', () => {
  const placements = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  assert.deepEqual(getTokenStackOrderAvailability(placements, 'a'), {
    canMoveBackward: false,
    canMoveForward: true,
  });
  assert.deepEqual(getTokenStackOrderAvailability(placements, 'b'), {
    canMoveBackward: true,
    canMoveForward: true,
  });
  assert.deepEqual(getTokenStackOrderAvailability(placements, 'c'), {
    canMoveBackward: true,
    canMoveForward: false,
  });
});
