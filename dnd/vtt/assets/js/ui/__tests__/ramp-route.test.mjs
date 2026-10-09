import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRouteWalker, stepGhost, walksPlates, hasStairs } from '../route-walker.mjs';
import { routeSteps } from '../terrain-math.mjs';
import { rampGround, rampLanding } from '../imported-ramps.mjs';
import { intersectsFloor, floorSupported } from '../floor-support.js';

// The ruler's price for ramps between two upper floors. The scene is the shape floating islands
// are built in (the server's forced-on-ramps.test.php uses the same one): a mid island 12 high, a
// high island 18 high, a low island 6 high, open air and the ground (0) between them. A sloping
// arch, 2 wide and 8 long, joins mid to high; a vine one square long joins low to mid.
const ring = (l, t, r, b) => [{ x: l, y: t }, { x: r, y: t }, { x: r, y: b }, { x: l, y: b }];
const holes = (l, t, r, b) => [
  { column: 0, row: 0, width: 26, height: t }, { column: 0, row: b, width: 26, height: 30 - b },
  { column: 0, row: t, width: l, height: b - t }, { column: r, row: t, width: 26 - r, height: b - t },
];
const box = (l, t, r, b) => [{ column: l, row: t }, { column: r, row: t }, { column: r, row: b }, { column: l, row: b }];
const arch = { id: 'arch', corners: box(10, 10, 12, 18), edgeColors: { '10,18-11,18': 'green', '11,18-12,18': 'green', '10,10-11,10': 'red', '11,10-12,10': 'red' } };
const vine = { id: 'vine', corners: box(15, 7, 16, 8), edgeColors: { '15,7-15,8': 'green', '16,7-16,8': 'red' } };
const mapLevels = {
  baseStairs: [],
  levels: [
    { id: 'low', zIndex: 0, elevationSquares: 6, cutouts: holes(16, 4, 21, 10), stairs: [{ ...vine, direction: 'up', linkedLevelId: 'mid' }] },
    { id: 'mid', zIndex: 1, elevationSquares: 12, cutouts: holes(7, 3, 15, 10), stairs: [{ ...arch, direction: 'up', linkedLevelId: 'high' }, { ...vine, direction: 'down', linkedLevelId: 'low' }] },
    { id: 'high', zIndex: 2, elevationSquares: 18, cutouts: holes(8, 18, 14, 24), stairs: [{ ...arch, direction: 'down', linkedLevelId: 'mid' }] },
  ],
};
const plates = [
  { id: 'plate-low', kind: 'floor', levelId: 'low', height: 6, points: ring(16, 4, 21, 10) },
  { id: 'plate-mid', kind: 'floor', levelId: 'mid', height: 12, points: ring(7, 3, 15, 10) },
  { id: 'plate-high', kind: 'floor', levelId: 'high', height: 18, points: ring(8, 18, 14, 24) },
];
const ramps = [
  { id: 'arch', left: 10, right: 12, top: 10, bottom: 18, base: 12, height: 18, fromLevel: 'mid', toLevel: 'high', direction: 'south' },
  { id: 'vine', left: 15, right: 16, top: 7, bottom: 8, base: 6, height: 12, fromLevel: 'low', toLevel: 'mid', direction: 'west' },
];
const elevation = { 'level-0': 0, low: 6, mid: 12, high: 18 };
const cutouts = (levelId) => mapLevels.levels.find((level) => level.id === levelId)?.cutouts || [];

// Where a token stands, given its floor, its stair progress and any plate it is known to be on:
// the board's own rule (groundFor in terrain-prototype.js), over this scene's flat ground.
function standing(p) {
  const level = p.levelId || 'level-0';
  if (p._supportSurfaceId) { const held = plates.find((s) => s.id === p._supportSurfaceId); if (held && intersectsFloor(p, held, cutouts(held.levelId))) return held.height; }
  const z = rampGround(ramps, p, { x: p.column + (p.width || 1) / 2, y: p.row + (p.height || 1) / 2 });
  if (z !== null) return z;
  if (level !== 'level-0') return floorSupported(p, plates, cutouts(level)) === false ? 0 : elevation[level];
  return 0;
}
// What the ruler asked before, one square at a time, with the token as it stood at the start.
const onSurface = (surface, p) => p.x >= surface.points[0].x && p.x <= surface.points[1].x && p.y >= surface.points[0].y && p.y <= surface.points[2].y;
const plainHeight = (column, row, who) => rampLanding(ramps, plates, who, { x: column + (who.width || 1) / 2, y: row + (who.height || 1) / 2 }, onSurface) ?? standing({ ...who, column, row });

const token = (column, row, levelId, extra = {}) => ({ id: 't', column, row, width: 1, height: 1, levelId, ...extra });
/** The ruler over a route given as squares, each leg handed to the next as the board does. */
function price(actor, squares, { follow = true } = {}) {
  let carried = null, cost = 0; const heights = [], steps = [];
  for (let k = 1; k < squares.length; k++) {
    const walker = createRouteWalker({ actor, surfaces: plates, mapLevels, terrain: () => 0, plainHeight, carried, standing: follow ? standing : null });
    const leg = routeSteps({ column: squares[k - 1][0], row: squares[k - 1][1] }, { column: squares[k][0], row: squares[k][1] }, (c, r) => walker.height(c, r));
    carried = walker.ghost; cost += leg.cost;
    for (const [i, point] of leg.points.entries()) { if (i || k === 1) heights.push(+point.rawHeight.toFixed(3)); if (i) steps.push(Math.max(1, Math.abs(point.rise))); }
  }
  return { cost, heights, steps, ghost: carried };
}

test('before: the ruler priced the last step off a ramp as a drop to the ground', () => {
  // These are the numbers the Map maker's test recorded on the real app.
  assert.equal(price(token(10, 18, 'high'), [[10, 18], [10, 9]], { follow: false }).cost, 20, 'arch down: 8 steps and a 12-square drop');
  assert.equal(price(token(10, 9, 'mid'), [[10, 9], [10, 18]], { follow: false }).cost, 21, 'arch up');
  assert.equal(price(token(14, 7, 'mid'), [[14, 7], [16, 7]], { follow: false }).cost, 12, 'vine down');
  assert.equal(price(token(16, 7, 'low'), [[16, 7], [14, 7]], { follow: false }).cost, 12, 'vine up');
  // The single step the Map maker measured: on the foot of the arch, one square onto the mid island.
  const onFoot = token(10, 10, 'high', { _floorTraversal: { stairId: 'arch', entry: 'green' } });
  assert.equal(price(onFoot, [[10, 10], [10, 9]], { follow: false }).cost, 12);
});

test('the arch costs its length, both ways, in one drag or square by square', () => {
  const down = price(token(10, 18, 'high'), [[10, 18], [10, 9]]);
  assert.deepEqual(down.heights, [18, 17.625, 16.875, 16.125, 15.375, 14.625, 13.875, 13.125, 12.375, 12]);
  assert.equal(down.cost, 9);
  assert.deepEqual(down.steps, [1, 1, 1, 1, 1, 1, 1, 1, 1], 'every step, the last one included, is 1');
  assert.equal(down.ghost.levelId, 'mid', 'it is on the mid island at the end');
  const up = price(token(10, 9, 'mid'), [[10, 9], [10, 18]]);
  assert.deepEqual(up.heights, [12, 12.375, 13.125, 13.875, 14.625, 15.375, 16.125, 16.875, 17.625, 18]);
  assert.equal(up.cost, 9);
  assert.equal(up.ghost.levelId, 'high');
  // The same routes drawn with a waypoint on every square.
  const each = (from, to, column) => Array.from({ length: Math.abs(to - from) + 1 }, (_, i) => [column, from + Math.sign(to - from) * i]);
  assert.equal(price(token(11, 18, 'high'), each(18, 9, 11)).cost, 9);
  assert.equal(price(token(11, 9, 'mid'), each(9, 18, 11)).cost, 9);
  // On past both ends: the island squares beyond cost 1 each.
  assert.equal(price(token(10, 20, 'high'), [[10, 20], [10, 6]]).cost, 14);
  assert.equal(price(token(10, 6, 'mid'), [[10, 6], [10, 20]]).cost, 14);
});

test('the last step down, measured from where the token stands on the ramp', () => {
  const onFoot = token(10, 10, 'high', { _floorTraversal: { stairId: 'arch', entry: 'green', signature: 'x' } });
  const step = price(onFoot, [[10, 10], [10, 9]]);
  assert.deepEqual(step.heights, [12.375, 12]);
  assert.equal(step.cost, 1);
  // Half-way down, the rest of the way in one drag.
  const half = token(10, 14, 'high', { _floorTraversal: { stairId: 'arch', entry: 'green' } });
  assert.equal(price(half, [[10, 14], [10, 9]]).cost, 5);
  // Half-way up, having come from the foot.
  const climbing = token(10, 13, 'mid', { _floorTraversal: { stairId: 'arch', entry: 'red' } });
  assert.equal(price(climbing, [[10, 13], [10, 18]]).cost, 5);
  assert.equal(price(climbing, [[10, 13], [10, 9]]).cost, 4, 'and back down to the island it came from');
});

test('the vine costs its height once: 3 and 3, up or down', () => {
  const down = price(token(14, 7, 'mid'), [[14, 7], [16, 7]]);
  assert.deepEqual(down.heights, [12, 9, 6]);
  assert.deepEqual(down.steps, [3, 3]);
  assert.equal(down.cost, 6);
  const up = price(token(16, 7, 'low'), [[16, 7], [14, 7]]);
  assert.deepEqual(up.heights, [6, 9, 12]);
  assert.equal(up.cost, 6);
  // The single last step the Map maker measured.
  const onVine = token(15, 7, 'mid', { _floorTraversal: { stairId: 'vine', entry: 'green' } });
  assert.equal(price(onVine, [[15, 7], [16, 7]]).cost, 3);
});

test('a size 2 token on the two-wide arch', () => {
  const big = (column, row, levelId) => ({ ...token(column, row, levelId), width: 2, height: 2 });
  const down = price(big(10, 18, 'high'), [[10, 18], [10, 8]]);
  assert.equal(down.cost, 10);
  assert.equal(down.ghost.levelId, 'mid');
  assert.ok(down.heights.every((height, i) => i === 0 || height <= down.heights[i - 1]), `only ever downward: ${down.heights}`);
  assert.equal(price(big(10, 8, 'mid'), [[10, 8], [10, 18]]).cost, 10);
});

test('stepping off the side of a ramp is still priced as the drop it is', () => {
  const half = token(11, 15, 'high', { _floorTraversal: { stairId: 'arch', entry: 'green' } });
  const off = price(half, [[11, 15], [13, 15]]);
  assert.deepEqual(off.heights, [16.125, 0, 0]);
  assert.equal(off.cost, 17, 'a 16-square drop, then one more square');
  // Walking off an island's edge away from any ramp is unchanged by any of this.
  assert.equal(price(token(13, 20, 'high'), [[13, 20], [15, 20]]).cost, price(token(13, 20, 'high'), [[13, 20], [15, 20]], { follow: false }).cost);
});

test('a walk that does not touch a ramp is priced exactly as before', () => {
  for (const [actor, route] of [
    [token(9, 20, 'high'), [[9, 20], [13, 22]]], [token(8, 4, 'mid'), [[8, 4], [13, 8]]], [token(17, 5, 'low'), [[17, 5], [20, 9]]],
    [token(2, 2, 'level-0'), [[2, 2], [6, 6]]], [token(9, 22, 'high'), [[9, 22], [9, 26]]],
  ]) {
    const now = price(actor, route), before = price(actor, route, { follow: false });
    assert.deepEqual([now.cost, now.heights], [before.cost, before.heights], `${actor.levelId} ${JSON.stringify(route)}`);
  }
});

test('which tokens the preview walks', () => {
  const onStair = token(10, 14, 'high', { _floorTraversal: { stairId: 'arch', entry: 'green' } });
  assert.equal(walksPlates(onStair, plates), false, 'without ramps to follow, a token on a stair is not walked (as before)');
  assert.equal(walksPlates(onStair, plates, true), true);
  assert.equal(walksPlates(token(1, 1, 'level-0'), [], true), true);
  assert.equal(walksPlates(token(1, 1, 'level-0'), []), false);
  assert.equal(walksPlates({ ...onStair, movementMode: 'fly' }, plates, true), false, 'a flier is never walked');
  assert.equal(hasStairs(mapLevels), true);
  assert.equal(hasStairs({ baseStairs: [], levels: [{ id: 'a' }] }), false);
  assert.equal(hasStairs(null), false);
  // A scene with ramps but no stairs to follow them by is walked as before.
  const none = createRouteWalker({ actor: onStair, surfaces: plates, mapLevels: { levels: [] }, terrain: () => 0, plainHeight, standing });
  assert.equal(none.height(10, 14), plainHeight(10, 14, onStair));
  assert.equal(none.height(10, 13), plainHeight(10, 13, onStair));
});

test('one step at a time, as the reach outline asks', () => {
  let ghost = token(10, 18, 'high'), heights = [];
  for (let row = 17; row >= 8; row--) {
    const stepped = stepGhost({ ghost, column: 10, row, actor: token(10, 18, 'high'), surfaces: plates, mapLevels, terrain: () => 0, plainHeight, standing });
    ghost = stepped.ghost; heights.push(stepped.height);
  }
  assert.deepEqual(heights, [17.625, 16.875, 16.125, 15.375, 14.625, 13.875, 13.125, 12.375, 12, 12]);
  assert.equal(ghost.levelId, 'mid');
  assert.equal(ghost._floorTraversal ?? null, null);
});
