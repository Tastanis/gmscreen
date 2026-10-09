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

// ---- where a creature coming down over a square would land ----------------------------------
// Found on the islands map: the squares an ability offers for a push off a ledge were painted on
// the ground far under the ledge and the island the hero would land on, two of them nearly on top
// of each other. A square is now drawn on the highest plate under it that is not above the creature.
test('an offered square over a drop is drawn on the ledge or island under it', async () => {
  const { landingSurfaceHeight } = await import('../floor-support.js');
  const levels = { levels: [{ id: 'shelf', elevationSquares: 18, cutouts: [] }, { id: 'ledge', elevationSquares: 12, cutouts: [] }, { id: 'low', elevationSquares: 6, cutouts: [] }, { id: 'sky', elevationSquares: 30, cutouts: [] }, { id: 'secret', elevationSquares: 9, cutouts: [], hidden: true }] };
  const surfaces = [
    { id: 'shelf', kind: 'floor', levelId: 'shelf', height: 18, points: ring(20, 48, 26, 54) },
    { id: 'ledge', kind: 'floor', levelId: 'ledge', height: 12, points: ring(20, 46, 26, 48) },
    { id: 'low', kind: 'floor', levelId: 'low', height: 6, points: ring(18, 40, 28, 46) },
    { id: 'sky', kind: 'floor', levelId: 'sky', height: 30, points: ring(18, 40, 28, 54) },
    { id: 'secret', kind: 'floor', levelId: 'secret', height: 9, points: ring(18, 30, 28, 40) },
  ];
  const at = (column, row) => ({ column, row, width: 1, height: 1, levelId: 'shelf' });
  const from18 = (column, row, ground = 3) => landingSurfaceHeight(at(column, row), surfaces, levels, 18, ground);
  assert.equal(from18(22, 48), 18, 'still on the shelf');
  assert.equal(from18(22, 47), 12, 'the catch ledge, not the ground 3 up under it');
  assert.equal(from18(22, 46), 12);
  assert.equal(from18(22, 45), 6, 'the low island');
  assert.equal(from18(22, 39, 0), 0, 'a hidden floor catches no one a viewer may see');
  assert.equal(from18(30, 45, 2.5), 2.5, 'open ground: the ground itself');
  assert.equal(from18(22, 45, 7), 7, 'ground that stands above a plate is what it lands on');
  // The island overhead is above the creature and is never a landing.
  assert.equal(landingSurfaceHeight(at(22, 44), surfaces, levels, 18, 0), 6);
  // From lower down, only what is at or below it: from the ledge, the low island; from the floor, the floor.
  assert.equal(landingSurfaceHeight(at(22, 45), surfaces, levels, 12, 0), 6);
  assert.equal(landingSurfaceHeight(at(22, 47), surfaces, levels, 6, 0), 0);
  assert.equal(landingSurfaceHeight(at(22, 45), surfaces, levels, 0, 0), 0);
});
