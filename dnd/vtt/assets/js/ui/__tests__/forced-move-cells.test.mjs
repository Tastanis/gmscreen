import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { forcedMoveLegalCells, forcedLineCell, forcedLineCells, nearestPullCell, footprintsOverlap, cellsOnMap, closestCell } from '../forced-move-cells.js';
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

test('a long teleport offers only squares that are on the map', () => {
  // A 40 by 30 map, and the board's rule for keeping a token on it.
  const clamp = (column, row, width, height) => ({ column: Math.max(0, Math.min(40 - width, column)), row: Math.max(0, Math.min(30 - height, row)) });
  const elowin = token('elowin', 24, 18);
  const all = forcedMoveLegalCells(elowin, elowin, 60, 'slide');
  assert.equal(all.length, 121 * 121 - 1, 'every square within 60, most of them off the map');
  const onMap = cellsOnMap(all, clamp, elowin);
  assert.equal(onMap.length, 40 * 30 - 1, 'the whole map except the square she stands on');
  assert.ok(onMap.every((cell) => cell.column >= 0 && cell.row >= 0 && cell.column < 40 && cell.row < 30));
  // A size 2 token cannot be put half off the far edge.
  const big = token('warden', 10, 10, 2);
  assert.ok(cellsOnMap(forcedMoveLegalCells(big, big, 60, 'slide'), clamp, big).every((cell) => cell.column <= 38 && cell.row <= 28));
  // A short move in the middle of the map loses nothing, and without a rule nothing is dropped.
  const near = forcedMoveLegalCells(elowin, elowin, 2, 'slide');
  assert.equal(cellsOnMap(near, clamp, elowin).length, near.length);
  assert.equal(cellsOnMap(all, null, elowin).length, all.length);
});

// ---- The tester's re-check, R-1 ---------------------------------------------
// Sluice Drowner at (24,22), Cal two squares west at (22,22), pull 3. The squares directly
// north and south of the puller used to be offered; the straight line to either clips the
// puller's own square, and the leftover movement was scored as a collision with the puller.
test('a pull offers only squares that bring the target closer, so none clips the puller', () => {
  for (const [puller, target, pulls] of [[token('drowner', 24, 22), token('cal', 22, 22), [3]], [token('elowin', 24, 18), token('cal', 22, 18), [2, 3, 4]]]) {
    for (const pull of pulls) {
      const cells = forcedMoveLegalCells(puller, target, pull, 'pull');
      const row = target.row;
      // Until October 12, 2026 the three squares beside the puller on the target's side were offered. A pull now
      // goes along its one straight line (Brandon: "Ability pushes go in a straight line, yes"): one square here.
      assert.deepEqual(keys(cells), [`23,${row}`], `pull ${pull}: the square beside the puller, on the line to it`);
      for (const cell of cells) {
        const result = resolveForcedDrag(target, cell, [puller, target]);
        assert.deepEqual([result.destination.column, result.destination.row, result.damage, result.collidedIds], [cell.column, cell.row, 0, []], `pull ${pull} to ${cell.column},${cell.row}: arrives, no collision`);
      }
    }
  }
});

test('the two squares that used to slam the target into the puller, picked by hand, end beside the puller', () => {
  const drowner = token('drowner', 24, 22), cal = token('cal', 22, 22);
  const cells = forcedMoveLegalCells(drowner, cal, 3, 'pull');
  // Since the straight-line ruling the nearest offered square is the one on the line, beside the puller.
  for (const [picked, lands] of [[{ column: 24, row: 21 }, { column: 23, row: 22 }], [{ column: 24, row: 23 }, { column: 23, row: 22 }]]) {
    // Why they are no longer offered: the straight line there runs into the puller.
    assert.deepEqual(resolveForcedDrag(cal, picked, [drowner, cal]).collidedIds, ['drowner']);
    // What the picker does instead: the nearest offered square, which has no collision.
    const offered = closestCell(cells, picked);
    assert.deepEqual(offered, lands);
    assert.equal(resolveForcedDrag(cal, offered, [drowner, cal]).damage, 0);
  }
  assert.equal(closestCell([], { column: 1, row: 1 }), null);
});

test('a pull along a straight line still reaches the square beside the puller from any side', () => {
  const puller = token('puller', 10, 10);
  for (const [from, beside] of [[[10, 6], '10,9'], [[14, 10], '11,10'], [[10, 14], '10,11'], [[6, 10], '9,10'], [[6, 6], '9,9'], [[14, 14], '11,11']]) {
    const cells = keys(forcedMoveLegalCells(puller, token('target', ...from), 5, 'pull'));
    assert.ok(cells.includes(beside), `from ${from}: ${beside} is offered`);
    assert.ok(!cells.includes('10,10'), 'never the puller\'s own square');
  }
  // A push is unchanged: it may still run level with the pusher for a step.
  assert.ok(keys(forcedMoveLegalCells(puller, token('target', 11, 10), 3, 'push')).includes('14,10'));
});

// ---- Brandon, October 12, 2026: "Ability pushes go in a straight line, yes." ----
// The picker offered a fan: every square further from the pusher. It offers the one line now, from the pusher
// through the target and on. The server refuses a push or a pull that is off it (forced-line.test.php, which
// reads the same list of cases: straight, diagonal, at a slant, a large pusher measured from its middle, pulls).
const LINE_CASES = JSON.parse(readFileSync(new URL('../../../../api/v2/tests/fixtures/forced-line-cases.json', import.meta.url), 'utf8')).cases;
const sized = ([column, row, size], id) => token(id, column, row, size);

test('a push or a pull has one straight line, and each square of it is where the server says it is', () => {
  assert.ok(LINE_CASES.length >= 18);
  for (const { pusher, target, verb, squares, square: [column, row] } of LINE_CASES) {
    assert.deepEqual(forcedLineCell(sized(pusher, 'pusher'), sized(target, 'target'), squares, verb), { column, row }, `${verb} ${squares} of a target at ${target} by one at ${pusher}`);
  }
  assert.equal(forcedLineCell(token('a', 5, 5), token('b', 5, 5), 2, 'push'), null, 'no line when they share a middle');
  assert.deepEqual(forcedLineCells(token('a', 10, 10), token('b', 11, 10), 3, 'push'), [{ column: 12, row: 10 }, { column: 13, row: 10 }, { column: 14, row: 10 }], 'nearest first');
});

test('a push offers only the squares of its line, a slide still offers any', () => {
  const pusher = token('warden', 10, 10);
  assert.deepEqual(forcedMoveLegalCells(pusher, token('cal', 11, 10), 3, 'push'), [{ column: 12, row: 10 }, { column: 13, row: 10 }, { column: 14, row: 10 }], 'straight east, and nothing to either side of it');
  assert.deepEqual(forcedMoveLegalCells(pusher, token('cal', 11, 11), 2, 'push'), [{ column: 12, row: 12 }, { column: 13, row: 13 }], 'a true diagonal');
  assert.deepEqual(forcedMoveLegalCells(pusher, token('cal', 12, 9), 4, 'push'), [{ column: 13, row: 8 }, { column: 14, row: 8 }, { column: 15, row: 7 }, { column: 16, row: 7 }], 'at a slant it steps over as it goes');
  // Every square offered is further from the pusher than the one before it.
  for (const target of [token('t', 12, 9), token('t', 7, 4), token('t', 10, 13), token('t', 8, 11)]) {
    let last = Math.max(Math.abs(target.column - 10), Math.abs(target.row - 10));
    for (const cell of forcedMoveLegalCells(pusher, target, 6, 'push')) { const next = Math.max(Math.abs(cell.column - 10), Math.abs(cell.row - 10)); assert.ok(next > last, `from ${target.column},${target.row}: ${cell.column},${cell.row} is further away`); last = next; }
  }
  assert.equal(forcedMoveLegalCells(pusher, token('cal', 11, 10), 2, 'slide').length, 24, 'a slide is not a line');
  // Sharing a middle there is no line to take: the old fan is all there is to offer.
  assert.ok(forcedMoveLegalCells(token('a', 5, 5), token('b', 5, 5), 1, 'push').length >= 0);
});

test('a pull offers the squares of its line up to the one beside the puller', () => {
  const puller = token('puller', 10, 10);
  assert.deepEqual(forcedMoveLegalCells(puller, token('t', 15, 10), 3, 'pull'), [{ column: 14, row: 10 }, { column: 13, row: 10 }, { column: 12, row: 10 }]);
  assert.deepEqual(forcedMoveLegalCells(puller, token('t', 13, 10), 6, 'pull'), [{ column: 12, row: 10 }, { column: 11, row: 10 }], 'it stops beside the puller however long the pull');
  assert.deepEqual(forcedMoveLegalCells(puller, token('t', 14, 12), 6, 'pull'), [{ column: 13, row: 11 }, { column: 12, row: 11 }, { column: 11, row: 10 }], 'at a slant, to the square beside the puller that the line reaches');
  assert.deepEqual(nearestPullCell(puller, token('t', 14, 12), forcedMoveLegalCells(puller, token('t', 14, 12), 6, 'pull')), { column: 11, row: 10 });
});

test('the board takes what is picked as a square of the line, and says whose push it is', () => {
  const board = readFileSync(new URL('../board-interactions.js', import.meta.url), 'utf8');
  assert.match(board, /const lined = \(request\.movementKind\|\|'forced'\)==='forced' && \(request\.baseVerb==='push'\|\|request\.baseVerb==='pull'\) && request\.legalCells\.length>0;/, 'a push or a pull with squares on offer; a slide and a teleport are as they were');
  assert.match(board, /if \(!collisionPlacement\) destination = closestCell\(request\.legalCells,/, 'a pick off the line is the offered square nearest to it');
  assert.match(board, /if\(collisionPlacement&&lined&&wholeLine\.length\)\{\s*const last=wholeLine\[wholeLine\.length-1\];forcedIntent=\{column:last\.column,row:last\.row\};/, 'a creature on the line is slammed into along the line, with the whole distance');
  assert.match(board, /forcedIntent=\{\.\.\.forcedIntent,by:\{id:request\.sourceSnapshot\.id,verb:request\.baseVerb\}\};/, 'the server is told whose push or pull it is');
});
