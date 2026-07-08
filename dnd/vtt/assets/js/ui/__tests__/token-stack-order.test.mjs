import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTokenStackOrderUpdate,
  getDefaultTokenStackOrderMap,
  getPlacementStackOrder,
  getTokenStackOrderAvailability,
} from '../token-stack-order.js';

test('getPlacementStackOrder falls back to the supplied layer', () => {
  assert.equal(getPlacementStackOrder({}, 4), 4);
  assert.equal(getPlacementStackOrder({ stackOrder: '2' }, 4), 2);
  assert.equal(getPlacementStackOrder({ stackOrder: -8 }, 4), 0);
});

test('getDefaultTokenStackOrderMap puts higher grid rows in front', () => {
  const defaults = getDefaultTokenStackOrderMap([
    { id: 'top', row: 1 },
    { id: 'middle', row: 5 },
    { id: 'bottom', row: 10 },
  ]);

  assert.ok(defaults.get('bottom') > defaults.get('middle'));
  assert.ok(defaults.get('middle') > defaults.get('top'));
});

test('getDefaultTokenStackOrderMap puts smaller tokens above bigger ones', () => {
  const defaults = getDefaultTokenStackOrderMap([
    { id: 'small', row: 4, width: 1, height: 1 },
    { id: 'dragon', row: 6, width: 3, height: 3 },
  ]);

  assert.ok(defaults.get('small') > defaults.get('dragon'));
});

test('getDefaultTokenStackOrderMap preserves placement order within the same row', () => {
  const defaults = getDefaultTokenStackOrderMap([
    { id: 'a', row: 4 },
    { id: 'b', row: 4 },
  ]);

  assert.ok(defaults.get('b') > defaults.get('a'));
});

test('buildTokenStackOrderUpdate brings a token to the front', () => {
  const changes = buildTokenStackOrderUpdate(
    [
      { id: 'top', row: 1 },
      { id: 'middle', row: 5 },
      { id: 'bottom', row: 10 },
    ],
    'top',
    'front'
  );

  assert.equal(changes.length, 1);
  assert.equal(changes[0].id, 'top');
  assert.ok(changes[0].stackOrder > getDefaultTokenStackOrderMap([
    { id: 'top', row: 1 },
    { id: 'middle', row: 5 },
    { id: 'bottom', row: 10 },
  ]).get('bottom'));
});

test('buildTokenStackOrderUpdate sends a token to the back', () => {
  const changes = buildTokenStackOrderUpdate(
    [
      { id: 'top', row: 1 },
      { id: 'middle', row: 5 },
      { id: 'bottom', row: 10 },
    ],
    'bottom',
    'back'
  );

  assert.deepEqual(changes, [{ id: 'bottom', stackOrder: 999 }]);
});

test('buildTokenStackOrderUpdate honors explicit stack orders as locked layers', () => {
  const changes = buildTokenStackOrderUpdate(
    [
      { id: 'top', row: 1 },
      { id: 'locked', row: 10, stackOrder: 5000 },
    ],
    'top',
    'front'
  );

  assert.deepEqual(changes, [{ id: 'top', stackOrder: 5001 }]);
});

test('buildTokenStackOrderUpdate returns no changes at stack edges', () => {
  const placements = [
    { id: 'back', row: 1 },
    { id: 'front', row: 10 },
  ];

  assert.deepEqual(buildTokenStackOrderUpdate(placements, 'back', 'back'), []);
  assert.deepEqual(buildTokenStackOrderUpdate(placements, 'front', 'front'), []);
});

test('getTokenStackOrderAvailability reports edge movement', () => {
  const placements = [
    { id: 'top', row: 1 },
    { id: 'middle', row: 5 },
    { id: 'bottom', row: 10 },
  ];

  assert.deepEqual(getTokenStackOrderAvailability(placements, 'top'), {
    canMoveToBack: false,
    canMoveToFront: true,
  });
  assert.deepEqual(getTokenStackOrderAvailability(placements, 'middle'), {
    canMoveToBack: true,
    canMoveToFront: true,
  });
  assert.deepEqual(getTokenStackOrderAvailability(placements, 'bottom'), {
    canMoveToBack: true,
    canMoveToFront: false,
  });
});
