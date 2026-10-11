import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pointAtHeight, pickWalked } from '../pointer-pick.mjs';
import { slanted, slantVector } from '../height-view.mjs';

// A dragged token lands where the pointer is, on the floor its path walks to (pickWalked).
// The scenes are the ones measured on the real maps on October 10: a bathhouse stair that carries
// straight on to a balcony, an Orchard arch and an Orchard vine. Each `walk` below stands in for
// the page's own walk of the drag's path: it says what height a walk to a square ends at and how
// high it rose on the way.
const square = (point) => [Math.floor(point.x + 1e-9), Math.floor(point.y + 1e-9)];
const over = (column, row, h, slant) => slanted(column + 0.5, row + 0.5, h, slant);
const at = (column, row, height) => ({ x: column + 0.5, y: row + 0.5, height });

// ---- the bathhouse: slant .12/.36. A stair in column 18 climbs north from the ground floor (2) at
// row 23 to a balcony (4) whose squares run from row 19 up to row 13. North of row 13 is a wall.
const usual = slantVector();
const bathStair = (point) => {
  const [column, row] = square(point);
  if (column !== 18) return { end: 2, top: 2 };            // off the stair's line: stays on the ground floor
  if (row >= 23) return { end: 2, top: 2 };                // not yet on the stair
  if (row >= 20) { const h = 2 + (23 - row) * (2 / 4); return { end: h, top: h }; }   // on the stair
  if (row >= 13) return { end: 4, top: 4 };                // on the balcony
  return { end: 2, top: 4 };                               // walked over the balcony and off its far edge
};
/** What the pointer is read as today from the stair's foot: the ground floor (2), which is drawn under the balcony. */
const readBelow = (raw, slant, height) => ({ ...pointAtHeight(raw, height, slant), height });

test('a building stair: the hero lands on the square pointed at, not one further on', () => {
  for (const row of [19, 18, 16]) {
    const raw = over(18, row, 4, usual);
    const today = readBelow(raw, usual, 2);
    assert.deepEqual(square(today), [18, row - 1], 'read as the floor below, the pointer names the next square on');
    const picked = pickWalked(raw, today, { slant: usual, walk: bathStair });
    assert.deepEqual(square(picked), [18, row]);
    assert.equal(picked.height, 4);
    assert.equal(picked.walked, true);
  }
});

test('the last row of an upper floor can be pointed at from below', () => {
  // Today it reads as the square beyond the balcony's far edge, which a wall then refuses.
  const raw = over(18, 13, 4, usual);
  const today = readBelow(raw, usual, 2);
  assert.deepEqual(square(today), [18, 12]);
  assert.deepEqual(square(pickWalked(raw, today, { slant: usual, walk: bathStair })), [18, 13]);
});

test('one square beyond the far edge is a walk off it, read where the hero would come to rest', () => {
  const raw = over(18, 12, 4, usual);
  const picked = pickWalked(raw, readBelow(raw, usual, 2), { slant: usual, walk: bathStair });
  // Read at the balcony's height the walk goes over the edge and ends at 2; read at 2 it ends at 2.
  assert.equal(picked.height, 2);
  assert.deepEqual(square(picked), [18, 11]);
});

test('a drag that stays on its own floor is read exactly as before', () => {
  const raw = over(10, 30, 2, usual);
  const today = at(10, 30, 2);
  const picked = pickWalked(raw, today, { slant: usual, walk: () => ({ end: 2, top: 2 }) });
  assert.deepEqual(square(picked), [10, 30]);
  assert.equal(picked.height, 2);
});

// ---- the Orchard: slant .04/.12. Arch A3 (columns 17 and 18) climbs south from a mid island (12) at
// row 45 to a high island (18) whose landing is row 52; the island carries on to row 53 there.
const gentle = slantVector(0.12);
const arch = (point) => {
  const [column, row] = square(point);
  if (row <= 45) return { end: 12, top: 12 };
  if (column < 17 || column > 18) return { end: 0, top: 15 };       // left the arch's side: a fall to the ground
  if (row <= 51) { const h = 12 + (row - 45); return { end: h, top: h }; }
  if (row <= 53) return { end: 18, top: 18 };
  return { end: 0, top: 18 };                                        // off the island's far edge
};

test('an Orchard arch: one square past the landing is the island, not the ground beside the arch', () => {
  const raw = over(18, 53, 18, gentle);
  // Today, with the island not drawn, the pointer is read as the ground 18 below: (19,51), beside the arch.
  const today = { ...pointAtHeight(raw, 0, gentle), height: 0 };
  assert.deepEqual(square(today), [19, 51]);
  assert.deepEqual(arch(today), { end: 0, top: 15 }, 'which today walks the hero off the arch');
  const picked = pickWalked(raw, today, { slant: gentle, walk: arch });
  assert.deepEqual(square(picked), [18, 53]);
  assert.equal(picked.height, 18);
});

test('a line that truly leaves the side of the arch is still a fall, read where the hero lands', () => {
  // Pointed at a square of the island three columns east of the arch, in one straight line from its foot.
  const offLine = (point) => { const [column, row] = square(point); return row <= 45 ? { end: 12, top: 12 } : column >= 19 ? { end: 0, top: 14 } : arch(point); };
  const raw = over(21, 53, 18, gentle);
  const today = { ...pointAtHeight(raw, 0, gentle), height: 0 };
  const picked = pickWalked(raw, today, { slant: gentle, walk: offLine });
  assert.equal(picked.height, 0, 'nothing is read at a height the walk does not end at');
});

// ---- Vine V1: one square (12,30) straight up from a mid island (12) at row 31 to a high island (18), rows 29 to 25.
const vine = (point) => {
  const [column, row] = square(point);
  if (row >= 31) return { end: 12, top: 12 };
  if (column < 10 || column > 14 || row < 25) return { end: 0, top: 18 };
  if (row === 30) return { end: 15, top: 15 };
  return { end: 18, top: 18 };
};

test('an Orchard vine: three squares past its head is the island, not a fall', () => {
  for (const row of [29, 28, 26]) {
    const raw = over(12, row, 18, gentle);
    const today = { ...pointAtHeight(raw, 0, gentle), height: 0 };
    const picked = pickWalked(raw, today, { slant: gentle, walk: vine });
    assert.deepEqual(square(picked), [12, row]);
    assert.equal(picked.height, 18);
  }
});

test('when no reading agrees with its own walk, the pointer means what it meant before', () => {
  // A walk that always ends somewhere else than it was read at: nothing can be settled.
  let n = 0;
  const restless = () => ({ end: (n += 3), top: n });
  const raw = over(5, 5, 2, usual);
  const today = at(5, 5, 2);
  assert.equal(pickWalked(raw, today, { slant: usual, walk: restless }), today);
  assert.ok(n <= 3 * 5, 'and it stops after a few tries');
});

test('a flat map, a walk that cannot be made, and a missing reading change nothing', () => {
  const today = at(4, 4, 3);
  const raw = { x: 4.5, y: 4.5 };
  assert.equal(pickWalked(raw, today, { slant: { x: 0, y: 0 }, walk: () => ({ end: 9, top: 9 }) }), today);
  assert.equal(pickWalked(raw, today, { slant: usual, walk: () => null }), today);
  assert.equal(pickWalked(raw, today, { slant: usual }), today);
  assert.equal(pickWalked(raw, null, { slant: usual, walk: () => ({ end: 0, top: 0 }) }), null);
});
