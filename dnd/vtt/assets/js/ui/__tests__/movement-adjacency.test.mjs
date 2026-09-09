import assert from 'node:assert/strict';
import test from 'node:test';
import { movementAdjacencyChanges } from '../movement-adjacency.js';
import { normalMovementDetail } from '../../sync-v2/confirmed-movement.js';
const token = (column, row = 2, levelId = 'level-0') => ({ column, row, width: 1, height: 1, levelId });
const watcher = token(2);
const floor = (height = 1, cutouts = [{ column: 0, row: 0, width: 10, height: 10 }]) => ({ levels: [{ id: 'upper', elevationSquares: height, mapUrl: '/floor.png', cutouts }] });

test('normal acknowledged movement retains floors for departure and arrival adjacency', () => {
  const detail = normalMovementDetail('scene', 'mover', token(3), token(3, 2, 'upper'), {
    source: 'acknowledgement', event: { type: 'token.moved', operationId: 'move', revision: 2, payload: { movementKind: 'walk' } }
  });
  assert.deepEqual(movementAdjacencyChanges(detail.from, detail.to, watcher, floor(5)), { leaves: true, enters: false });
  assert.deepEqual(movementAdjacencyChanges(detail.to, detail.from, watcher, floor(5)), { leaves: false, enters: true });
  assert.deepEqual(movementAdjacencyChanges(detail.from, detail.to, watcher, floor(1)), { leaves: false, enters: false });
});

test('one-square cross-floor adjacency needs an opening and remains distinct from five-square separation', () => {
  const from = token(3, 2, 'upper'), to = token(5, 2, 'upper');
  assert.equal(movementAdjacencyChanges(from, to, watcher, floor(1)).leaves, true);
  assert.equal(movementAdjacencyChanges(from, to, watcher, floor(1, [])).leaves, false);
  assert.equal(movementAdjacencyChanges(from, to, watcher, floor(5)).leaves, false);
  assert.equal(movementAdjacencyChanges(token(2, 2, 'upper'), to, watcher, floor(1)).leaves, true);
});

test('same-floor pass-by and fractional movements terminate and preserve adjacency transitions', () => {
  assert.equal(movementAdjacencyChanges(token(0), token(5), watcher, {}).leaves, true);
  assert.equal(movementAdjacencyChanges(token(3.5), token(2.5), watcher, {}).enters, true);
  assert.equal(movementAdjacencyChanges(token(2.5), token(3.5), watcher, {}).leaves, true);
  assert.equal(movementAdjacencyChanges(token(0, 5), token(5, 5), watcher, {}).leaves, false);
});

test('floor transitions never infer adjacency along an unknown intermediate floor path', () => {
  assert.deepEqual(movementAdjacencyChanges(token(0), token(6, 2, 'upper'), watcher, floor(5)), { leaves: false, enters: false });
  assert.deepEqual(movementAdjacencyChanges(token(0), token(6, 2, 'deleted'), watcher, floor(5)), { leaves: false, enters: false });
});
