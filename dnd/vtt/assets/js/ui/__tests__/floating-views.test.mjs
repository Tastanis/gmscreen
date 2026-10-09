import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VIEW_ABOVE, VIEW_BELOW, viewAbove, viewBelow, shapesAbove, dimsBelow, TIER_BAND, SHAPE_FILL, SHAPE_EDGE, DIM_FILL, viewSlant } from '../height-view.mjs';

// What a viewer is shown of floating plates over and under them: two settings a scene may carry.
const ring = (l, t, r, b) => [{ x: l, y: t }, { x: r, y: t }, { x: r, y: b }, { x: l, y: b }];
const plate = (id, height, extra = {}) => ({ id, kind: 'floor', levelId: 'l' + height, height, points: ring(0, 0, 4, 4), floating: true, ...extra });
// The islands map: floating plates on five levels, and one ordinary plate (a building's floor) at 12.
const scene = [plate('low-a', 6), plate('low-b', 6), plate('mid', 12), plate('high', 18), plate('upper', 24), plate('top', 30), plate('hall', 12, { floating: false })];
const ids = (list) => list.map((surface) => surface.id);

test('a scene shows floating plates as it always has unless its design says otherwise', () => {
  assert.deepEqual(VIEW_ABOVE, ['off', 'shape', 'tier']);
  assert.deepEqual(VIEW_BELOW, ['black', 'dim']);
  for (const design of [undefined, null, {}, { view: {} }, { view: { slant: 0.12 } }, { view: { above: 'bright', below: 7 } }, { view: { above: null, below: true } }]) {
    assert.equal(viewAbove(design), 'off'); assert.equal(viewBelow(design), 'black');
  }
  assert.equal(viewAbove({ view: { above: 'shape' } }), 'shape');
  assert.equal(viewAbove({ view: { above: 'tier' } }), 'tier');
  assert.equal(viewBelow({ view: { below: 'dim' } }), 'dim');
  // The three settings are independent of each other.
  const all = { view: { slant: 0.18, above: 'tier', below: 'dim' } };
  assert.deepEqual([viewSlant(all), viewAbove(all), viewBelow(all)], [0.18, 'tier', 'dim']);
});

test('shapes overhead: every floating plate at or above the viewer\'s head, and never an ordinary one', () => {
  // A hero on the crater floor: head a square or two up.
  assert.deepEqual(ids(shapesAbove(scene, 1.5, 'shape')), ['low-a', 'low-b', 'mid', 'high', 'upper', 'top']);
  // A hero on the mid islands (12): head at about 13.5. The low and mid islands are below and are not shapes.
  assert.deepEqual(ids(shapesAbove(scene, 13.5, 'shape')), ['high', 'upper', 'top']);
  // On the top island nothing is overhead.
  assert.deepEqual(shapesAbove(scene, 31.5, 'shape'), []);
  // A plate exactly level with the viewer's head counts as overhead, as it does when it is left undrawn.
  assert.deepEqual(ids(shapesAbove(scene, 18, 'shape')), ['high', 'upper', 'top']);
  // The building's floor at 12 is over the crater-floor hero too, but it is not floating: never a shape.
  assert.ok(!ids(shapesAbove(scene, 1.5, 'shape')).includes('hall'));
  // Off, or anything unknown: none.
  for (const mode of ['off', undefined, 'bright']) assert.deepEqual(shapesAbove(scene, 1.5, mode), []);
  assert.deepEqual(shapesAbove(null, 1.5, 'shape'), []);
});

test('nearest tier only: the lowest floating plates overhead, and others level with them', () => {
  assert.equal(TIER_BAND, 0.5);
  assert.deepEqual(ids(shapesAbove(scene, 1.5, 'tier')), ['low-a', 'low-b'], 'from the crater floor, both low islands and nothing higher');
  assert.deepEqual(ids(shapesAbove(scene, 7.5, 'tier')), ['mid'], 'from a low island, the mid island');
  assert.deepEqual(ids(shapesAbove(scene, 13.5, 'tier')), ['high']);
  assert.deepEqual(ids(shapesAbove(scene, 25.5, 'tier')), ['top']);
  assert.deepEqual(shapesAbove(scene, 31.5, 'tier'), []);
  // Plates a hair apart in height are one tier; a plate a square higher is the next.
  const uneven = [plate('a', 6), plate('b', 6.4), plate('c', 7)];
  assert.deepEqual(ids(shapesAbove(uneven, 1.5, 'tier')), ['a', 'b']);
});

test('dimmed below: only floating plates, only when the scene asks', () => {
  const dim = { view: { below: 'dim' } };
  assert.equal(dimsBelow(plate('mid', 12), dim), true);
  assert.equal(dimsBelow(plate('mid', 12), {}), false, 'black unless asked');
  assert.equal(dimsBelow(plate('mid', 12), { view: { below: 'black' } }), false);
  // A building's floor is never dimmed: a lower floor must not show through a stairwell.
  assert.equal(dimsBelow(plate('hall', 12, { floating: false }), dim), false);
  assert.equal(dimsBelow({ ...plate('roof', 12), kind: 'roof' }, dim), false);
});

test('a shape is see-through, and a dimmed plate is still clearly darker than a seen one', () => {
  const alpha = (colour) => Number(/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\s*\)/.exec(colour)[1]);
  assert.ok(alpha(SHAPE_FILL) >= 0.2 && alpha(SHAPE_FILL) <= 0.45, 'what lies under a shape stays readable');
  assert.ok(alpha(SHAPE_EDGE) > alpha(SHAPE_FILL), 'its edge is firmer than its body');
  assert.ok(alpha(DIM_FILL) >= 0.5 && alpha(DIM_FILL) <= 0.8);
});
