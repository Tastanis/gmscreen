import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { walkFloorContact, PLATE_REACH } from '../floor-support.js';
import { createRouteWalker } from '../route-walker.mjs';
import { routeSteps } from '../terrain-math.mjs';

// A stair of plain ground that climbs to a walkway plate, with the numbers of the stone stair on
// Dead Root (squares 45,22 up to the walkway from 45,18), laid along x: the walkway is the plate
// over columns 0 to 4, the stair's landing is level with it (2.00) for 0.7 of a square past the
// plate's end, the stair then falls to the ground over 2.3 squares, and the ground under the
// walkway is 0. And a bridge head like the west bridge's: the deck at 2, the bank level with it in
// the lane and a quarter of a square lower a square to the side.
// stair-meets-walkway.test.php walks the same shapes through the server's copy of the rule.
const line = (points) => (x) => {
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) { const [x0, z0] = points[i - 1], [x1, z1] = points[i]; if (x <= x1) return z0 + (z1 - z0) * (x - x0) / (x1 - x0); }
  return points[points.length - 1][1];
};
const walkway = { id: 'walkway', kind: 'floor', levelId: 'up', height: 2, points: [{ x: 0, y: 1 }, { x: 5, y: 1 }, { x: 5, y: 2 }, { x: 0, y: 2 }] };
const levels = { levels: [{ id: 'up', elevationSquares: 2, cutouts: [] }] };
const stair = line([[4.857, 0], [5, 2], [5.7, 2], [8, 0]]);
const under = (shape) => (p) => shape(p.column + (p.width || 1) / 2);
const walker = (column, row = 1, size = 1, extra = {}) => ({ id: 't', column, row, width: size, height: size, levelId: 'level-0', ...extra });
const on = (shape, from, to, path = []) => walkFloorContact(from, { ...from, ...to }, path, [walkway], levels, under(shape))?.id ?? null;

test('up a stair of plain ground onto the walkway at its top, at any size', () => {
  assert.equal(PLATE_REACH, 0.5);
  assert.equal(on(stair, walker(8), { column: 2, row: 1 }), 'walkway', 'size 1, one drag');
  // Build 458: the middle of a size 2 token is a whole square behind its front edge, still on the
  // slope a quarter of a square below the plate; the rule allowed a tenth, so it went on under the walkway.
  assert.equal(on(stair, walker(8, 1, 2), { column: 2, row: 1 }), 'walkway', 'size 2, one drag');
  assert.equal(on(stair, walker(5, 1, 2), { column: 4, row: 1 }), 'walkway', 'size 2, one square from the head of the stair');
  assert.equal(on(line([[4.857, 0], [5, 2], [7, 0]]), walker(8), { column: 2, row: 1 }), 'walkway', 'a stair with no landing at all');
});

test('what a walkway must not do: lift a walker from the ground under it, or bridge a real step', () => {
  assert.equal(on(stair, walker(1, 0), { column: 1, row: 1 }), null, 'walking in under the walkway from its side, two squares below');
  assert.equal(on(stair, walker(3), { column: 1, row: 1 }), null, 'already under it');
  assert.equal(on(line([[4.857, 0], [5, 1.4], [5.7, 1.4], [8, 0]]), walker(5), { column: 4, row: 1 }), null, 'a landing six tenths of a square below the plate');
  assert.equal(on(stair, walker(8, 1, 1, { movementMode: 'fly', flightHeight: 3 }), { column: 2, row: 1 }), null, 'a flier is not put on it');
});

test('a bridge head: onto the deck from the bank a square to the side of the lane, a quarter of a square lower', () => {
  // The west bridge on Dead Root: deck over x 22.9 to 24.1 from row 8, bank at 2.00 in the lane and 1.76 beside it, canal bed 0.27.
  const deck = { id: 'deck', kind: 'floor', levelId: 'level-0', height: 2, points: [{ x: 22.9, y: 8 }, { x: 24.1, y: 8 }, { x: 24.1, y: 14 }, { x: 22.9, y: 14 }] };
  const ground = (p) => { const x = p.column + .5, y = p.row + .5; return y >= 8 ? 0.27 : x >= 23 && x <= 24 ? 2 : 1.76; };
  const step = (from, to) => walkFloorContact(walker(...from), { ...walker(...from), column: to[0], row: to[1] }, [], [deck], { levels: [] }, ground)?.id ?? null;
  assert.equal(step([23, 7], [23, 8]), 'deck', 'straight down the lane, as before');
  assert.equal(step([24, 7], [23, 8]), 'deck', 'diagonally from the bank beside the lane (it used to end on the canal bed under the bridge)');
  assert.equal(step([22, 7], [23, 8]), 'deck', 'and from the other side');
  // On the canal bed, walking under the bridge: stays on the bed.
  assert.equal(step([22, 10], [23, 10]), null);
});

test('the ruler\'s walk, which the drag ghost is now drawn from, ends on the walkway going up and on the ground coming down', () => {
  const heights = (actor, from, to) => {
    const ruler = createRouteWalker({ actor, surfaces: [walkway], mapLevels: levels, terrain: under(stair), plainHeight: (column) => stair(column + (actor.width || 1) / 2) });
    const walked = routeSteps({ column: from, row: 1 }, { column: to, row: 1 }, (column, row) => ruler.height(column, row));
    return { last: walked.points[walked.points.length - 1].rawHeight, ghost: ruler.ghost };
  };
  const up = heights(walker(8), 8, 2);
  assert.equal(up.last, 2); assert.equal(up.ghost._supportSurfaceId, 'walkway');
  const down = heights(walker(2, 1, 1, { levelId: 'up', _supportSurfaceId: 'walkway' }), 2, 8);
  assert.equal(down.last, 0, 'at the foot, on the ground, not floating at the walkway\'s height'); assert.equal(down.ghost._supportSurfaceId, null);
  // The ghost is drawn from that walk, along the ruler's points when the ruler is this drag's.
  const source = readFileSync(new URL('../terrain-prototype.js', import.meta.url), 'utf8');
  assert.match(source, /const dropped=placement&&token\.dataset\.vttDragGhost\?dropHeight\(placement,Math\.round\(\(matrix\.m41-\(ctx\.view\.gridOffsets\.left\|\|0\)\)\/g\),Math\.round\(\(matrix\.m42-\(ctx\.view\.gridOffsets\.top\|\|0\)\)\/g\)\):null;/);
  assert.match(source, /const points=own\?ruler\.map\(p=>\(\{column:p\.column\+dx,row:p\.row\+dy\}\)\):\[\{column:placement\.column,row:placement\.row\},\{column,row\}\];/);
  assert.match(source, /const walked=routeNow\(points\[i-1\],points\[i\],\{actor:placement,ignoreZones:true,ignoreClimb:true,carry\}\);height=walked\.points\[walked\.points\.length-1\]\.rawHeight;/);
});
