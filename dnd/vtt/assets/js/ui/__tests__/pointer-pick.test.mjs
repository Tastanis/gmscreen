import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pointAtHeight, pickDrawn, pickView } from '../pointer-pick.mjs';
import { slanted, slantVector } from '../height-view.mjs';
import { rampHeight } from '../imported-ramps.mjs';

// Which square is under the pointer, and where a dragged token lands. The first two scenes are the
// tester's cases on the bathhouse (October 8); the rest are the heights and slants of the islands map.
const ring = (l, t, r, b) => [{ x: l, y: t }, { x: r, y: t }, { x: r, y: b }, { x: l, y: b }];
const floor = (id, height, box) => ({ id, kind: 'floor', height, points: ring(...box), holes: [] });
const square = (point) => [Math.floor(point.x + 1e-9), Math.floor(point.y + 1e-9)];
const token = (column, row) => ({ id: 't', column, row, width: 1, height: 1 });
/** Where the pointer is on the flat board when it is held over the middle of a square that is `h` high. */
const over = (column, row, h, slant) => slanted(column + 0.5, row + 0.5, h, slant);
/** A drag: the token moves by how far the pointer travelled on the map, and snaps to a square. */
const drop = (from, start, end) => [Math.round(from[0] + end.x - start.x), Math.round(from[1] + end.y - start.y)];

// ---- the bathhouse: a basement (0), a ground floor (2) and a balcony (4) over part of it
const usual = slantVector();
const bathhouse = [floor('basement', 0, [5, 5, 35, 35]), floor('ground-floor', 2, [5, 5, 35, 35]), floor('balcony', 4, [17, 10, 30, 20])];

test('S-2: the first drag of an unselected token on the balcony lands where it was dropped', () => {
  // The GM, looking down from height 4, presses on a walker at (23,14) on the balcony and drags it to (25,14).
  const press = over(23, 14, 4, usual), release = over(25, 14, 4, usual);
  // The start is the grabbed token's own place, at the height it stands at.
  const start = pointAtHeight(press, 4, usual);
  assert.deepEqual([+start.x.toFixed(6), +start.y.toFixed(6)], [23.5, 14.5]);
  // By the time the pointer moves, the token is selected and the view is its own (head at 5).
  const view = pickView({ token: token(23, 14), ground: 4 });
  const end = pickDrawn(release, { slant: usual, surfaces: bathhouse, view });
  assert.equal(end.floor.id, 'balcony');
  assert.deepEqual(drop([23, 14], start, end), [25, 14]);
  // How it was: the start was read with no token to go by, so as a point on the ground under the
  // building, and the end against the balcony. The two differ by the balcony's height times the slant.
  const startBefore = pointAtHeight(press, 0, usual);
  assert.deepEqual(drop([23, 14], startBefore, end), [25, 15], 'one row off, as the tester saw');
  // At a slant of 0.12 the same mistake was under half a square and rounded away.
  const flat = slantVector(0.12), endFlat = pickDrawn(over(25, 14, 4, flat), { slant: flat, surfaces: bathhouse, view });
  assert.deepEqual(drop([23, 14], pointAtHeight(over(23, 14, 4, flat), 0, flat), endFlat), [25, 14]);
});

test('S-3: the pointer is read against the floor that is drawn under it', () => {
  // The pointer is held where balcony square (18,18) is drawn.
  const pointer = over(18, 18, 4, usual);
  // The GM looking down from height 4 sees the balcony there: that is the square.
  const fromAbove = pickDrawn(pointer, { slant: usual, surfaces: bathhouse, view: pickView({ gmHeight: 4 }) });
  assert.equal(fromAbove.floor.id, 'balcony');
  assert.deepEqual(square(fromAbove), [18, 18]);
  // From height 3 the balcony is not shown; the ground floor is what is drawn at that spot.
  const lower = pickDrawn(pointer, { slant: usual, surfaces: bathhouse, view: pickView({ gmHeight: 3 }) });
  assert.equal(lower.floor.id, 'ground-floor');
  assert.deepEqual(square(lower), [18, 17]);
  // Through the eyes of Cal on the ground floor (head at 3) the balcony is over his head and is not
  // drawn either. What is under the pointer is ground-floor square (18,17), which is where the
  // tester saw him land: in that view there was no balcony square on the screen to point at.
  const cal = pickDrawn(pointer, { slant: usual, surfaces: bathhouse, view: pickView({ token: token(18, 23), ground: 2 }) });
  assert.equal(cal.floor.id, 'ground-floor');
  assert.deepEqual(square(cal), [18, 17]);
  // A token on the balcony, pointing past its edge at the ground floor beyond: the ground floor.
  const past = pickDrawn(over(12, 14, 2, usual), { slant: usual, surfaces: bathhouse, view: pickView({ token: token(18, 14), ground: 4 }) });
  assert.equal(past.floor.id, 'ground-floor'); assert.deepEqual(square(past), [12, 14]);
});

// ---- the islands map: tiers at 6, 12, 18, 24 and 30, slants of 0.12 and 0.18
const islands = [
  floor('low', 6, [20, 24, 30, 36]), floor('mid', 12, [8, 31, 21, 46]), floor('high', 18, [17, 48, 30, 59]),
  floor('sky', 24, [29, 14, 36, 20]), floor('crown', 30, [23, 13, 28, 18]),
];
const arch = { id: 'arch', left: 17, right: 19, top: 46, bottom: 52, base: 12, height: 18, fromLevel: 'mid', toLevel: 'high', direction: 'south' };

for (const amount of [0.12, 0.18, 0.36]) {
  const slant = slantVector(amount);
  test(`at a slant of ${amount}: a hero on any tier is dragged to the square the pointer is on`, () => {
    for (const [id, height, from, to] of [['low', 6, [22, 28], [26, 31]], ['high', 18, [19, 50], [27, 56]], ['crown', 30, [24, 14], [26, 16]]]) {
      const start = pointAtHeight(over(from[0], from[1], height, slant), height, slant);
      const end = pickDrawn(over(to[0], to[1], height, slant), { slant, surfaces: islands, view: pickView({ token: token(from[0], from[1]), ground: height }) });
      assert.equal(end.floor.id, id);
      assert.deepEqual(drop(from, start, end), to, `${id} island, ${height} high`);
      // The old first-drag mistake grows with the height: it was the height times the slant.
      const before = drop(from, pointAtHeight(over(from[0], from[1], height, slant), 0, slant), end);
      assert.equal(before[1] - to[1], Math.round(height * amount), `${id}: ${Math.round(height * amount)} rows off before`);
    }
  });

  test(`at a slant of ${amount}: the GM's height view picks the highest island drawn under the pointer`, () => {
    for (const island of islands) {
      const [l, t, r, b] = [island.points[0].x, island.points[0].y, island.points[2].x, island.points[2].y];
      const at = [Math.floor((l + r) / 2), Math.floor((t + b) / 2)];
      const hit = pickDrawn(over(at[0], at[1], island.height, slant), { slant, surfaces: islands, view: pickView({ gmHeight: 32 }) });
      assert.deepEqual([hit.floor.id, ...square(hit)], [island.id, ...at]);
    }
    // Lower the viewing height and the islands above it are no longer in the way, or in reach.
    const crownSpot = over(25, 15, 30, slant);
    assert.notEqual(pickDrawn(crownSpot, { slant, surfaces: islands, view: pickView({ gmHeight: 29 }) })?.floor.id, 'crown');
    assert.equal(pickDrawn(over(24, 30, 6, slant), { slant, surfaces: islands, view: pickView({ gmHeight: 5 }) }), null, 'below every island: only the ground');
  });

  test(`at a slant of ${amount}: a hero points down at a lower island, and cannot point at one overhead`, () => {
    const hero = pickView({ token: token(14, 38), ground: 12 }); // on the mid island, head at 13
    const down = pickDrawn(over(24, 30, 6, slant), { slant, surfaces: islands, view: hero });
    assert.deepEqual([down.floor.id, ...square(down)], ['low', 24, 30]);
    // The high island (18) is over the hero's head and is not drawn: the spot where it would be
    // drawn is never read as a square of it.
    const up = pickDrawn(over(22, 52, 18, slant), { slant, surfaces: islands, view: hero });
    assert.notEqual(up?.floor?.id, 'high');
    // A hero on the crown rock sees every tier below.
    const top = pickView({ token: token(25, 15), ground: 30 });
    for (const [id, c, r, h] of [['sky', 32, 16, 24], ['high', 22, 55, 18], ['mid', 12, 40, 12], ['low', 22, 33, 6]]) {
      const hit = pickDrawn(over(c, r, h, slant), { slant, surfaces: islands, view: top });
      assert.deepEqual([hit.floor.id, ...square(hit)], [id, c, r], id);
    }
  });

  test(`at a slant of ${amount}: an arch between two tiers can be pointed at along its whole length`, () => {
    // A hero at the foot of the arch on the mid island. The arch rises over the hero's head, but its
    // top face is in view the whole way up, and it is drawn.
    const hero = pickView({ token: token(17, 45), ground: 12 });
    for (const row of [46, 48, 50, 51]) {
      const z = rampHeight(arch, 18, row + 0.5);
      const hit = pickDrawn(slanted(18, row + 0.5, z, slant), { slant, surfaces: islands, ramps: [arch], view: hero });
      assert.equal(hit.ramp?.id, 'arch', `row ${row}`);
      assert.deepEqual(square(hit), [18, row]);
      assert.ok(Math.abs(hit.height - z) < 1e-9);
    }
    // The GM looking down from height 14 is shown the arch only up to 14.
    const lowView = pickView({ gmHeight: 14 });
    assert.equal(pickDrawn(slanted(18, 47, rampHeight(arch, 18, 47), slant), { slant, surfaces: islands, ramps: [arch], view: lowView }).ramp.id, 'arch');
    assert.notEqual(pickDrawn(slanted(18, 51.5, rampHeight(arch, 18, 51.5), slant), { slant, surfaces: islands, ramps: [arch], view: lowView })?.ramp?.id, 'arch');
  });
}

test('at a slant of zero the pointer is on its own square at every height', () => {
  const flat = slantVector(0);
  const hit = pickDrawn({ x: 25.5, y: 15.5 }, { slant: flat, surfaces: islands, view: pickView({ gmHeight: 32 }) });
  assert.deepEqual([hit.floor.id, ...square(hit)], ['crown', 25, 15]);
  assert.deepEqual(pointAtHeight({ x: 3, y: 4 }, 30, flat), { x: 3, y: 4 });
});

test('holes, roofs and an unknown view', () => {
  const holed = [{ ...floor('deck', 6, [0, 0, 10, 10]), holes: [ring(4, 4, 6, 6)] }, { ...floor('roof', 9, [0, 0, 10, 10]), kind: 'roof' }, floor('under', 2, [0, 0, 10, 10])];
  const view = pickView({ gmHeight: 20 }), slant = slantVector(0.12);
  // Through a hole in the deck the floor below is what is drawn.
  assert.equal(pickDrawn(over(5, 5, 2, slant), { slant, surfaces: holed, view }).floor.id, 'under');
  assert.equal(pickDrawn(over(2, 2, 6, slant), { slant, surfaces: holed, view }).floor.id, 'deck');
  // A roof is never something to stand on, so never something to point at.
  assert.ok(holed.every((surface) => pickDrawn(over(2, 2, 9, slant), { slant, surfaces: holed, view })?.floor?.id !== 'roof'));
  // No view to go by: nothing is picked, and the caller falls back to the ground.
  assert.equal(pickDrawn(over(2, 2, 6, slant), { slant, surfaces: holed, view: null }), null);
  assert.equal(pickView({}), null);
  assert.deepEqual(pickView({ gmHeight: 0 }), { upTo: 0 });
  // A size 2 token's head is two squares over its feet, and it looks from its middle.
  assert.deepEqual(pickView({ token: { column: 4, row: 6, width: 2, height: 2 }, ground: 12 }), { eye: 14, viewer: { x: 5, y: 7 } });
});

test('reading a point at a height undoes the slant exactly', () => {
  for (const amount of [0.36, 0.18, 0.12, 0]) for (const h of [0, 2, 6, 18, 30]) {
    const slant = slantVector(amount), back = pointAtHeight(slanted(12.25, 40.75, h, slant), h, slant);
    assert.ok(Math.abs(back.x - 12.25) < 1e-9 && Math.abs(back.y - 40.75) < 1e-9, `${amount} at ${h}`);
  }
});
