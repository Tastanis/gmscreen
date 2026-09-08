import test from 'node:test';
import assert from 'node:assert/strict';
import { orderedPhysicalFloors, floorRelation, canConfirmPlanarAdjacency } from '../floor-geometry.js';

test('physical floor order always includes base below zero-ranked upper floors and excludes disabled floors', () => {
  const model = { levels: [{ id: 'second', zIndex: 2 }, { id: 'first', zIndex: 0 }, { id: 'hidden', zIndex: 1, hidden: true }] };
  assert.deepEqual(orderedPhysicalFloors(model).map(level => level.id), ['level-0', 'first', 'second']);
  assert.equal(floorRelation({ levelId: 'first' }, {}, model), 'above');
  assert.equal(floorRelation({}, { levelId: 'first' }, model), 'below');
  assert.equal(floorRelation({ levelId: 'hidden' }, { levelId: 'hidden' }, model), 'unknown');
  assert.equal(floorRelation({ levelId: 'deleted' }, {}, model), 'unknown');
  assert.equal(canConfirmPlanarAdjacency({}, {}, model), true);
  assert.equal(canConfirmPlanarAdjacency({ hidden: true }, {}, model), false);
});
