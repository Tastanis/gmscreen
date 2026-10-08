import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forcedMoveLegalCells, nearestPullCell, footprintsOverlap } from '../forced-move-cells.js';
import { resolveForcedDrag } from '../forced-drag.js';

const token = (id, column, row, size = 1) => ({ id, column, row, width: size, height: size });
const keys = (cells) => cells.map((cell) => `${cell.column},${cell.row}`).sort();

test('a pull on a target already beside the puller has no square to go to', () => {
  const drowner = token('drowner', 10, 10), cal = token('cal', 11, 10);
  assert.deepEqual(forcedMoveLegalCells(drowner, cal, 2, 'pull'), []);
  assert.deepEqual(forcedMoveLegalCells(drowner, cal, 3, 'pull'), []);
  assert.equal(nearestPullCell(drowner, cal, []), null);
  // Diagonally beside is the same.
  assert.deepEqual(forcedMoveLegalCells(drowner, token('cal', 11, 11), 3, 'pull'), []);
});

test('a pull never offers the puller\'s own square, and stops beside the puller', () => {
  const elowin = token('elowin', 24, 18), cal = token('cal', 22, 18);
  const cells = forcedMoveLegalCells(elowin, cal, 3, 'pull');
  assert.ok(cells.length > 0);
  assert.ok(cells.every((cell) => !footprintsOverlap({ ...cell, width: 1, height: 1 }, elowin)), 'no legal square is under the puller');
  assert.ok(!keys(cells).includes('24,18'));
  assert.deepEqual(nearestPullCell(elowin, cal, cells), { column: 23, row: 18 }, 'picking the puller means the square beside her, in a straight line');
});

test('a pull toward a large puller stops beside it too', () => {
  const warden = token('warden', 10, 10, 2), cal = token('cal', 14, 10);
  const cells = forcedMoveLegalCells(warden, cal, 5, 'pull');
  assert.ok(cells.every((cell) => !footprintsOverlap({ ...cell, width: 1, height: 1 }, warden)));
  const nearest = nearestPullCell(warden, cal, cells);
  assert.equal(nearest.column, 12, 'the column next to the 2x2 puller');
  assert.equal(resolveForcedDrag(cal, nearest, [warden, cal]).damage, 0, 'ending beside the puller is not a collision');
});

test('a push still offers squares behind the target, and a slide offers any', () => {
  const pusher = token('warden', 10, 10), cal = token('cal', 11, 10);
  assert.ok(keys(forcedMoveLegalCells(pusher, cal, 3, 'push')).includes('14,10'));
  assert.ok(keys(forcedMoveLegalCells(pusher, cal, 1, 'slide')).length === 8);
});

test('a creature in the way stops the mover on a whole square, at any angle', () => {
  const cal = token('cal', 22, 18);
  // Straight lines were already whole.
  assert.deepEqual(pick(resolveForcedDrag(cal, { column: 26, row: 18 }, [token('b', 24, 18)])), { column: 23, row: 18, damage: 3 });
  // A slanted line used to stop between squares (row 18.5).
  for (const [to, other] of [[{ column: 26, row: 20 }, token('b', 24, 19)], [{ column: 25, row: 19 }, token('b', 24, 18, 2)], [{ column: 27, row: 16 }, token('b', 25, 17)]]) {
    const result = resolveForcedDrag(cal, to, [other]);
    assert.ok(Number.isInteger(result.destination.column) && Number.isInteger(result.destination.row), `whole square, got ${result.destination.column},${result.destination.row}`);
    assert.ok(!footprintsOverlap({ ...result.destination, width: 1, height: 1 }, other), 'not inside the other creature');
    assert.ok(result.damage >= 1 && result.collidedIds.includes('b'));
  }
});

function pick(result) {
  return { column: result.destination.column, row: result.destination.row, damage: result.damage };
}
