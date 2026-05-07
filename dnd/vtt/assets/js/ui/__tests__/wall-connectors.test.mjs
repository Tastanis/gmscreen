import { test } from 'node:test';
import assert from 'node:assert/strict';

import { shouldRenderWallDiagonalConnector } from '../board-interactions.js';

function keySet(points) {
  return new Set(points.map(([column, row]) => `${column},${row}`));
}

test('wall diagonal connector renders when only the two diagonal squares touch the corner', () => {
  const squares = keySet([
    [2, 2],
    [3, 3],
  ]);

  assert.equal(
    shouldRenderWallDiagonalConnector({ column: 2, row: 2 }, { column: 3, row: 3 }, squares),
    true
  );
});

test('wall diagonal connector is skipped when a third square touches the corner', () => {
  const squares = keySet([
    [2, 2],
    [3, 3],
    [2, 3],
  ]);

  assert.equal(
    shouldRenderWallDiagonalConnector({ column: 2, row: 2 }, { column: 3, row: 3 }, squares),
    false
  );
});

test('wall diagonal connector checks the north-east corner neighborhood', () => {
  const openCorner = keySet([
    [2, 3],
    [3, 2],
  ]);
  const crowdedCorner = keySet([
    [2, 3],
    [3, 2],
    [2, 2],
  ]);

  assert.equal(
    shouldRenderWallDiagonalConnector({ column: 2, row: 3 }, { column: 3, row: 2 }, openCorner),
    true
  );
  assert.equal(
    shouldRenderWallDiagonalConnector({ column: 2, row: 3 }, { column: 3, row: 2 }, crowdedCorner),
    false
  );
});
