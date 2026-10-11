import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileBuildingCutaway, PIT } from '../building-cutaway.mjs';
import { openEdgePieces, wallUnderEdge, EDGE_PIECE, WALL_AT, WALL_BELOW, WALL_SHORT, RAISED_REACH } from '../height-view.mjs';
import { onSurface } from '../stacked-surfaces.mjs';

// Brandon, October 10, 2026, of the bathhouse (a pool in the ground floor, a balcony over it with a well): "if I'm
// standing in the pool, I cannot see outside of the pool. I also cannot see the outline ... I think the intent behind
// this is that you can't see the floor above you normally. But if it's got an opening in the room, then I need to be
// able to see up to it." And: "the question will be can we see the outline of the floor above since it has a hole in it."
// A hole is a hole; and indoors the open edges of a floor above are outlined where the hero has a line to them.

const box = (left, top, right, bottom) => [{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }];
// The bathhouse in small: a ground floor at 2 with a pool cut out of it, a balcony at 4 with a well over the pool
// (one square wider on the west and south), and the roof at 6.
const ground = { id: 'ground', kind: 'floor', height: 2, points: box(0, 0, 20, 20), holes: [box(8, 8, 14, 13)] };
const balcony = { id: 'balcony', kind: 'floor', height: 4, points: box(4, 4, 18, 18), holes: [box(7, 8, 14, 14)] };
const roof = { id: 'roof', kind: 'roof', height: 6, points: box(4, 4, 18, 18) };
const wing = { id: 'wing-roof', kind: 'roof', height: 4, points: box(0, 4, 4, 18) };
const cutaway = compileBuildingCutaway([ground, balcony, roof, wing]);
const hiddenAt = (x, y, feet) => { const hidden = cutaway({ x, y }, feet + 1, feet); return { hidden: [...hidden].sort(), inside: hidden.inside.size > 0 }; };

test('standing in an opening of a floor is not standing under it', () => {
  // In the pool, a tenth of a square below the room's floor: the floor is the room's own, not a ceiling.
  assert.deepEqual(hiddenAt(9.5, 12.5, 1.9), { hidden: ['roof', 'wing-roof'], inside: true }, 'the roofs go; the room\'s floor and the balcony stay to be judged');
  // In the deepest part, eyes under the floor: it is still not over his head, and he is still in its room.
  assert.equal(PIT, 1.5);
  assert.deepEqual(hiddenAt(11.5, 10.5, 0.8), { hidden: ['roof', 'wing-roof'], inside: true });
  // Deeper than a pit (a shaft): the floor far above is not his room's; only what is over his head is cut away.
  assert.deepEqual(hiddenAt(11.5, 10.5, 0.2).hidden, ['roof']);
});

test('under an opening of the floor above he is not under that floor; under the floor itself he is', () => {
  // On the ground floor beside the pool, under the well: the balcony is not his ceiling, so it is left to be outlined.
  assert.deepEqual(hiddenAt(7.5, 13.5, 2), { hidden: ['roof', 'wing-roof'], inside: true });
  // Under the gallery: the balcony is his ceiling and is cut away, as before.
  assert.deepEqual(hiddenAt(5.5, 10.5, 2), { hidden: ['balcony', 'roof', 'wing-roof'], inside: true });
  // Outside the building: nothing is cut away, and he is inside nothing.
  assert.deepEqual(hiddenAt(2.5, 1.5, 2), { hidden: [], inside: false });
  // On the balcony: the roof is his ceiling, and the lower wing's roof beside him goes with it, as before.
  assert.deepEqual(hiddenAt(5.5, 10.5, 4).hidden, ['roof', 'wing-roof']);
});

test('a wall under an edge: the building\'s own wall on that line, not an object beside it', () => {
  const along = { x: 0, y: 1 };
  const wall = (x, base, top, y0 = 0, y1 = 10) => ({ a: { x, y: y0 }, b: { x, y: y1 }, base, top });
  assert.equal(wallUnderEdge({ x: 4, y: 5 }, along, 4, [wall(4, 2, 4)]), true, 'from the floor below up to this one');
  assert.equal(wallUnderEdge({ x: 4, y: 5 }, along, 4, [wall(4, 0, 6)]), true, 'a wall that runs on past it');
  assert.equal(wallUnderEdge({ x: 4, y: 5 }, along, 4, [wall(4, 4, 4.67)]), false, 'a rail standing ON the floor is not under it');
  assert.equal(wallUnderEdge({ x: 4, y: 5 }, along, 4, [wall(4, 2, 3)]), false, 'a half-wall a square high does not come up to it');
  // The tester, on Brandon's live bathhouse under Build 475 as first made: its walls are 1.5 tall under floors 2 apart,
  // the test asked for a wall within a tenth of the floor, and every outer wall of the building was outlined.
  assert.equal(wallUnderEdge({ x: 4, y: 5 }, along, 4, [wall(4, 2, 3.5)]), true, 'a wall that stops half a square short of the floor still holds that edge up');
  assert.equal(wallUnderEdge({ x: 4, y: 5 }, along, 2, [wall(4, 0, 1.5)]), true); assert.equal(wallUnderEdge({ x: 4, y: 5 }, along, 6, [wall(4, 4, 5.5)]), true);
  assert.equal(WALL_SHORT, 0.75);
  assert.equal(wallUnderEdge({ x: 4, y: 5 }, along, 4, [wall(4 + WALL_AT + 0.01, 2, 4)]), false, 'a rock\'s side four hundredths in from the edge');
  assert.equal(wallUnderEdge({ x: 4, y: 12 }, along, 4, [wall(4, 2, 4)]), false, 'beyond the wall\'s end');
  assert.equal(wallUnderEdge({ x: 4, y: 5 }, along, 4, [{ a: { x: 0, y: 5 }, b: { x: 8, y: 5 }, base: 2, top: 4 }]), false, 'a wall that only crosses the edge');
  assert.equal(WALL_BELOW, 0.5);
});

test('the open edges of a floor above: a hole\'s edge and a free edge he has a line to, never an edge on a wall', () => {
  const on = (p) => onSurface(balcony, p), rings = [balcony.points, ...balcony.holes];
  // The building's walls stand under the balcony's outer edges on three sides; its south side is a free edge.
  const walls = [[4, 4, 18, 4], [4, 4, 4, 18], [18, 4, 18, 18]].map(([x0, y0, x1, y1]) => ({ a: { x: x0, y: y0 }, b: { x: x1, y: y1 }, base: 2, top: 4 }));
  const walled = (p, along) => wallUnderEdge(p, along, 4, walls);
  const lengths = (pieces) => { const by = { well: 0, south: 0, wall: 0 }; for (const [a, b] of pieces) { const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, d = Math.hypot(b.x - a.x, b.y - a.y); if (mid.x > 6.9 && mid.x < 14.1 && mid.y > 7.9 && mid.y < 14.1) by.well += d; else if (Math.abs(mid.y - 18) < 1e-6) by.south += d; else by.wall += d; } return by; };
  const viewer = { x: 11, y: 11 };
  // Everything in sight: the whole well and the whole free south edge, none of the three walled sides.
  assert.deepEqual(lengths(openEdgePieces(viewer, rings, on, walled, () => true)), { well: 26, south: 14, wall: 0 });
  // Only what he has a line to: here, only points west of column 9.
  const west = lengths(openEdgePieces(viewer, rings, on, walled, (p) => p.x < 9));
  assert.ok(west.well > 6 && west.well < 12, 'the well\'s west side and the ends of its north and south sides');
  assert.equal(west.wall, 0);
  // He is asked about a point just OFF the floor, on the open side of each edge.
  const asked = []; openEdgePieces(viewer, rings, on, walled, (p) => { asked.push(p); return false; });
  assert.ok(asked.length > 50 && asked.every((p) => !on(p)));
  // No further than the reach.
  assert.deepEqual(lengths(openEdgePieces({ x: 11, y: 11 - RAISED_REACH - 20 }, rings, on, walled, () => true)), { well: 0, south: 0, wall: 0 });
  assert.equal(lengths(openEdgePieces({ x: 10.5, y: 10.5 }, rings, on, walled, () => true)).south, 13, 'the far end of the south edge is past his reach from here');
  assert.equal(EDGE_PIECE, 0.5);
});

test('the drawing: in a hole he is not under the floor, and a floor of his own building is outlined by its open edges', () => {
  const renderer = readFileSync(new URL('../roof-renderer.js', import.meta.url), 'utf8');
  assert.match(renderer, /const underneath=viewerGround<roof\.height-\.01;if\(inspectionHeight===null&&underneath&&onSurface\(roof,viewer\)\)continue;/);
  assert.match(renderer, /if\(interiorHidden\.has\(roof\.id\)\)\{if\(outlinedIndoors\(roof\)\)indoorOutline\(roof\);continue;\}/);
  assert.match(renderer, /else if\(interiorHidden\.inside\?\.has\(roof\.id\)&&outlinedIndoors\(roof\)\)indoorOutline\(roof\);/);
  // The open edges only (Brandon, October 11, 2026: "A for now"); the switch made for his pictures is gone.
  assert.match(renderer, /for\(const \[from,to\] of pieces\)\{const p=at\(from\),q=at\(to\);shape\.moveTo\(p\.x,p\.y\);shape\.lineTo\(q\.x,q\.y\);\}/);
  assert.doesNotMatch(renderer, /__vttIndoorOutline|indoorForm/);
  // Asked just under the floor's top, from below.
  assert.match(renderer, /openEdgePieces\(viewer,\[roof\.points,\.\.\.roof\.holes\|\|\[\]\],on,\(p,along\)=>wallUnderEdge\(p,along,roof\.height,wallsUnder\(\)\),q=>sight\(q,roof\.height-\.01\)\)/);
});
