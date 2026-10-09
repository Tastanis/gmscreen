import { test } from 'node:test';
import assert from 'node:assert/strict';
import { walkFloorContact } from '../floor-support.js';

// Found on the islands map: a push along the crater floor took the server 13 to 30 seconds, so
// the "Break through?" pop-up arrived after the tester had given up and other requests timed out.
// At every eighth of a square the walk laid the token's square over the outline of every plate
// on the map, islands 6 to 30 squares overhead included. A plate at another height is now ruled
// out by its height, before its outline is looked at. The answers are the same.
const ring = (l, t, r, b) => [{ x: l, y: t }, { x: r, y: t }, { x: r, y: b }, { x: l, y: b }];
const mapLevels = { levels: [{ id: 'low', elevationSquares: 6, cutouts: [] }, { id: 'deck', elevationSquares: 0, cutouts: [] }] };
const token = (column, row, extra = {}) => ({ id: 't', column, row, width: 1, height: 1, levelId: 'level-0', ...extra });

/** A plate that counts how often its outline is read. */
function counted(plate) {
  let reads = 0; const points = plate.points;
  const watched = { ...plate, get points() { reads++; return points; } };
  return { plate: watched, reads: () => reads };
}

test('a walk on the ground never looks at the outline of a plate far overhead', () => {
  const island = counted({ id: 'island', kind: 'floor', levelId: 'low', height: 6, points: ring(0, 0, 40, 40) });
  const support = walkFloorContact(token(2, 5), token(22, 5), [], [island.plate], mapLevels, () => 0);
  assert.equal(support, null, 'it stays on the ground');
  assert.equal(island.reads(), 0, 'and the island over it was never measured');
});

test('a plate at the same height as the walker is still found, exactly as before', () => {
  // A deck level with the ground from column 10 on: the walker steps onto it.
  const deck = counted({ id: 'deck', kind: 'floor', levelId: 'deck', height: 0, points: ring(10, 0, 20, 10) });
  const island = counted({ id: 'island', kind: 'floor', levelId: 'low', height: 6, points: ring(0, 0, 40, 40) });
  const onto = walkFloorContact(token(5, 5), token(14, 5), [], [island.plate, deck.plate], mapLevels, () => 0);
  assert.equal(onto?.id, 'deck');
  assert.ok(deck.reads() > 0, 'the deck was measured');
  assert.equal(island.reads(), 0, 'the island was not');
  // A walker already on the island stays on it, and walks off its edge onto nothing.
  const on = token(5, 5, { levelId: 'low', _supportSurfaceId: 'island' });
  const small = { id: 'island', kind: 'floor', levelId: 'low', height: 6, points: ring(0, 0, 10, 10) };
  assert.equal(walkFloorContact(on, { ...on, column: 8 }, [], [small], mapLevels, () => 0)?.id, 'island');
  assert.equal(walkFloorContact(on, { ...on, column: 14 }, [], [small], mapLevels, () => 0), null);
});
