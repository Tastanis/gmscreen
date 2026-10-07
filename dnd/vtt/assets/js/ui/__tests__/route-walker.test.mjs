import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRouteWalker } from '../route-walker.mjs';
import { routeSteps } from '../terrain-math.mjs';
import { terrainContact } from '../terrain-contact.js';
import { summarizeRoute } from '../terrain-zones.mjs';

// Two banks at height 2 with a canal (height 0) between rows 3 and 8, and a rope bridge at height 2
// from bank to bank along column 5. The bridge ends lie over the first and last bank squares.
const bridge = { id: 'bridge', kind: 'floor', levelId: 'level-0', height: 2, points: [{ x: 5, y: 2.25 }, { x: 6, y: 2.25 }, { x: 6, y: 9.75 }, { x: 5, y: 9.75 }] };
const groundAt = (x, y) => (y >= 3 && y < 9 ? 0 : 2.01);
const terrain = (p) => groundAt(p.column + (p.width || 1) / 2, p.row + (p.height || 1) / 2);
// What the ruler used before: the ground under the square, or a plate the actor already stands on.
const plainHeight = (column, row, actor) => (actor?._supportSurfaceId === 'bridge' && column === 5 && row >= 2 && row <= 9 ? 2 : groundAt(column + 0.5, row + 0.5));
const hero = (column, row, extra = {}) => ({ id: 'hero', column, row, width: 1, height: 1, levelId: 'level-0', ...extra });
const face = (actor) => (a, b) => terrainContact({ ...actor, column: a.column, row: a.row }, { column: b.column, row: b.row }, groundAt) !== null;
const walk = (actor, from, to, { carried = null, surfaces = [bridge] } = {}) => {
  const walker = createRouteWalker({ actor, surfaces, mapLevels: { levels: [] }, terrain, plainHeight, carried });
  const steps = routeSteps({ column: from[0], row: from[1] }, { column: to[0], row: to[1] }, (c, r) => walker.height(c, r), null, face(actor));
  return { ...steps, heights: steps.points.map((p) => +p.rawHeight.toFixed(2)), ghost: walker.ghost };
};
const stateless = (actor, from, to) => routeSteps({ column: from[0], row: from[1] }, { column: to[0], row: to[1] }, (c, r) => plainHeight(c, r, actor), null, face(actor));

test('the old preview priced a bridge crossing as a drop into the canal and a climb out', () => {
  const actor = hero(5, 1);
  const before = stateless(actor, [5, 1], [5, 10]);
  assert.equal(before.cost, 13, '9 squares priced as 13');
  assert.equal(before.climbExtra, 2, 'and a two-square climb at the far bank');
});

test('the preview walks onto a bridge from the land and stays on it: a crossing costs its length, with no climb', () => {
  const actor = hero(5, 1);
  const across = walk(actor, [5, 1], [5, 10]);
  assert.deepEqual(across.heights, [2.01, 2, 2, 2, 2, 2, 2, 2, 2, 2.01]);
  assert.equal(across.cost, 9);
  assert.equal(across.climbExtra, 0);
  assert.equal(across.ghost._supportSurfaceId, null, 'it is back on the land at the far side');
  // The other way, which used to raise the false climb.
  const back = walk(hero(5, 10), [5, 10], [5, 1]);
  assert.equal(back.cost, 9);
  assert.equal(back.climbExtra, 0);
  // Out onto the bridge and stopping on it.
  const out = walk(actor, [5, 1], [5, 5]);
  assert.deepEqual([out.cost, out.heights.at(-1), out.ghost._supportSurfaceId], [4, 2, 'bridge']);
});

test('a waypoint on the bridge keeps the walker on the bridge for the next leg', () => {
  const actor = hero(5, 1);
  const first = walk(actor, [5, 1], [5, 5]);
  const second = walk(actor, [5, 5], [5, 10], { carried: first.ghost });
  assert.deepEqual(second.heights, [2, 2, 2, 2, 2, 2.01]);
  assert.equal(second.cost, 5);
  // Through the route summary, as the ruler and the counter use it.
  const carry = {};
  const summary = summarizeRoute([{ column: 5, row: 1 }, { column: 5, row: 5 }, { column: 5, row: 10 }], (a, b) => {
    const leg = walk(actor, [a.column, a.row], [b.column, b.row], { carried: carry.ghost ?? null });
    carry.ghost = leg.ghost;
    return leg;
  });
  assert.deepEqual([summary.distance, summary.cost, summary.climbs.length], [9, 9, 0]);
  // A carried ghost from somewhere else is not used.
  const elsewhere = walk(actor, [5, 1], [5, 3], { carried: { ...hero(9, 9), _supportSurfaceId: 'bridge' } });
  assert.equal(elsewhere.heights[0], 2.01);
});

test('what must not change: wading under the bridge, a real climb, fliers, a token already on the bridge, no plates', () => {
  // In the canal beside the bridge, walking under it: stays on the bed.
  const wader = walk(hero(4, 5), [4, 5], [6, 5]);
  assert.deepEqual(wader.heights, [0, 0, 0]);
  assert.equal(wader.ghost._supportSurfaceId, null);
  // Along the canal bed under the bridge and up the far bank: still a real two-square climb.
  const climber = walk(hero(5, 6), [5, 6], [5, 9]);
  assert.deepEqual(climber.heights, [0, 0, 0, 2.01]);
  assert.equal(climber.climbExtra, 2);
  assert.equal(climber.cost, 2 + 4);
  // A flier is not put on the bridge by the preview.
  const flier = walk(hero(5, 1, { movementMode: 'fly', flightHeight: 5 }), [5, 1], [5, 5]);
  assert.deepEqual(flier.heights, [2.01, 2.01, 0, 0, 0], 'left to the plain rule, as before');
  // Already standing on the bridge: priced flat, as before.
  const onIt = walk(hero(5, 4, { _supportSurfaceId: 'bridge' }), [5, 4], [5, 7]);
  assert.deepEqual([onIt.heights, onIt.cost], [[2, 2, 2, 2], 3]);
  // A scene with no plates behaves exactly as the plain rule.
  const bare = walk(hero(5, 1), [5, 1], [5, 10], { surfaces: [] });
  assert.equal(bare.cost, stateless(hero(5, 1), [5, 1], [5, 10]).cost);
  // No token at all (the Measure tool): the plain rule.
  const walker = createRouteWalker({ actor: null, surfaces: [bridge], terrain, plainHeight });
  assert.equal(walker.height(5, 5), 0);
  assert.equal(walker.ghost, null);
});

test('stepping off the side of a bridge drops to the ground below, and a step up of more than a tenth is not bridged', () => {
  const side = walk(hero(5, 5, { _supportSurfaceId: 'bridge' }), [5, 5], [7, 5]);
  assert.deepEqual(side.heights, [2, 0, 0], 'the preview shows the drop the move will make');
  // A bank a quarter of a square lower than the bridge: not level, so the walker is not carried.
  const lowBank = (x, y) => (y >= 3 && y < 9 ? 0 : 1.7);
  const walker = createRouteWalker({ actor: hero(5, 1), surfaces: [bridge], mapLevels: { levels: [] }, terrain: (p) => lowBank(p.column + .5, p.row + .5), plainHeight: (c, r) => lowBank(c + .5, r + .5) });
  const steps = routeSteps({ column: 5, row: 1 }, { column: 5, row: 5 }, (c, r) => walker.height(c, r));
  assert.deepEqual(steps.points.map((p) => p.rawHeight), [1.7, 1.7, 0, 0, 0]);
});
