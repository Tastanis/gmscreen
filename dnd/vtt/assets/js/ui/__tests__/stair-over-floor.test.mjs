import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRouteWalker } from '../route-walker.mjs';
import { routeSteps } from '../terrain-math.mjs';
import { rampAt, rampHeight, rampGround, rampCarries, rampLanding } from '../imported-ramps.mjs';
import { intersectsFloor, floorSupported } from '../floor-support.js';

// A building's stair, as on the bathhouse: the lower floor's plate runs on under the stair. The
// tester measured 5 for this 4-square stair, both ways. Going up, a token that started on the lower
// plate was held at that plate's height all the way and then jumped the whole rise in one step.
// The stair is the one square column 16, rows 10 to 12; its foot is at row 13, its head at row 9.
const ring = (l, t, r, b) => [{ x: l, y: t }, { x: r, y: t }, { x: r, y: b }, { x: l, y: b }];
const corners = [{ column: 16, row: 10 }, { column: 17, row: 10 }, { column: 17, row: 13 }, { column: 16, row: 13 }];
const colours = { '16,10-17,10': 'green', '16,13-17,13': 'red' };
const mapLevels = {
  baseStairs: [{ id: 'stair', direction: 'up', linkedLevelId: 'first', corners, edgeColors: colours }],
  levels: [{ id: 'first', zIndex: 1, elevationSquares: 2, cutouts: [{ column: 0, row: 10, width: 30, height: 20 }],
    stairs: [{ id: 'stair', direction: 'down', linkedLevelId: 'level-0', corners, edgeColors: colours }] }],
};
const plates = [
  { id: 'ground', kind: 'floor', levelId: 'level-0', height: 0, points: ring(10, 9, 22, 20) }, // runs under the stair and the floor above
  { id: 'first', kind: 'floor', levelId: 'first', height: 2, points: ring(10, 2, 22, 10) },
];
const ramps = [{ id: 'stair', left: 16, right: 17, top: 10, bottom: 13, base: 0, height: 2, fromLevel: 'level-0', toLevel: 'first', direction: 'north' }];
const cutouts = (levelId) => mapLevels.levels.find((level) => level.id === levelId)?.cutouts || [];
const centre = (p) => ({ x: p.column + (p.width || 1) / 2, y: p.row + (p.height || 1) / 2 });

// Where a token stands: the board's rule (groundFor in terrain-prototype.js, WallMovement::height on
// the server). `carriedFirst` is the rule as it is now; false is how it was.
const standingBy = (carriedFirst) => function standing(p) {
  const level = p.levelId || 'level-0', at = centre(p);
  if (carriedFirst && p._floorTraversal) { const ramp = rampAt(ramps, at); if (ramp && rampCarries(ramp, p)) return rampHeight(ramp, at.x, at.y); }
  if (p._supportSurfaceId) { const held = plates.find((s) => s.id === p._supportSurfaceId); if (held && intersectsFloor(p, held, cutouts(held.levelId))) return held.height; }
  const z = rampGround(ramps, p, at);
  if (z !== null) return z;
  if (level !== 'level-0') return floorSupported(p, plates, cutouts(level)) === false ? 0 : 2;
  return 0;
};
const onSurface = (surface, p) => p.x >= surface.points[0].x && p.x <= surface.points[1].x && p.y >= surface.points[0].y && p.y <= surface.points[2].y;
function price(actor, squares, carriedFirst = true) {
  const standing = standingBy(carriedFirst);
  const plainHeight = (column, row, who) => rampLanding(ramps, plates, who, { x: column + 0.5, y: row + 0.5 }, onSurface) ?? standing({ ...who, column, row });
  let carried = null, cost = 0; const heights = [];
  for (let k = 1; k < squares.length; k++) {
    const walker = createRouteWalker({ actor, surfaces: plates, mapLevels, terrain: () => 0, plainHeight, carried, standing });
    const leg = routeSteps({ column: squares[k - 1][0], row: squares[k - 1][1] }, { column: squares[k][0], row: squares[k][1] }, (c, r) => walker.height(c, r));
    carried = walker.ghost; cost += leg.cost;
    for (const [i, point] of leg.points.entries()) if (i || k === 1) heights.push(+point.rawHeight.toFixed(2));
  }
  return { cost, heights, ghost: carried };
}
const token = (column, row, levelId, plate) => ({ id: 't', column, row, width: 1, height: 1, levelId, _supportSurfaceId: plate });

test('a token is carried by a ramp it came onto by the end that belongs to its floor', () => {
  const [stair] = ramps;
  assert.equal(rampCarries(stair, { levelId: 'level-0', _floorTraversal: { entry: 'red' } }), true, 'from the lower floor, by the foot');
  assert.equal(rampCarries(stair, { levelId: 'first', _floorTraversal: { entry: 'green' } }), true, 'from the upper floor, by the head');
  assert.equal(rampCarries(stair, { levelId: 'level-0', _floorTraversal: { entry: 'green' } }), false, 'by the wrong end');
  assert.equal(rampCarries(stair, { levelId: 'level-0', _floorTraversal: { entry: 'barrier' } }), false, 'in by the side');
  assert.equal(rampCarries(stair, { levelId: 'level-0' }), false, 'not on a stair at all');
  assert.equal(rampCarries(stair, { levelId: 'elsewhere', _floorTraversal: { entry: 'red' } }), false);
});

test('going up: the token rises with the stair, though its own floor still lies under it', () => {
  const up = price(token(16, 13, 'level-0', 'ground'), [[16, 13], [16, 9]]);
  assert.deepEqual(up.heights, [0, 0.33, 1, 1.67, 2]);
  assert.equal(up.cost, 4, 'four squares cost four');
  assert.equal(up.ghost.levelId, 'first');
  // Square by square, the same.
  assert.equal(price(token(16, 13, 'level-0', 'ground'), [[16, 13], [16, 12], [16, 11], [16, 10], [16, 9]]).cost, 4);
  // How it was: held at the lower floor's height to the top, then the whole rise in the last step.
  const before = price(token(16, 13, 'level-0', 'ground'), [[16, 13], [16, 9]], false);
  assert.deepEqual(before.heights, [0, 0, 0, 0, 2]);
  assert.equal(before.cost, 5, 'the 5 the tester measured');
});

test('going down the same stair costs its length too', () => {
  const down = price(token(16, 9, 'first', 'first'), [[16, 9], [16, 13]]);
  assert.deepEqual(down.heights, [2, 1.67, 1, 0.33, 0]);
  assert.equal(down.cost, 4);
  assert.equal(down.ghost.levelId, 'level-0');
  // From a square on the stair, the last step off its foot, which the tester saw priced at 2.
  const onStair = { ...token(16, 12, 'first'), _floorTraversal: { stairId: 'stair', entry: 'green' } };
  assert.equal(price(onStair, [[16, 12], [16, 13]]).cost, 1);
  // And the last step off its head going up.
  const climbing = { ...token(16, 10, 'level-0', 'ground'), _floorTraversal: { stairId: 'stair', entry: 'red' } };
  assert.deepEqual(price(climbing, [[16, 10], [16, 9]]).heights, [1.67, 2]);
  assert.equal(price(climbing, [[16, 10], [16, 9]]).cost, 1);
});

test('walking the ground floor past the stair, or under the floor above, is unchanged', () => {
  for (const route of [[[12, 14], [20, 14]], [[12, 11], [15, 11]], [[18, 12], [18, 18]]]) {
    assert.deepEqual(price(token(route[0][0], route[0][1], 'level-0', 'ground'), route), price(token(route[0][0], route[0][1], 'level-0', 'ground'), route, false), JSON.stringify(route));
  }
});
