import { test } from 'node:test';
import assert from 'node:assert/strict';
import { usesHeightView, viewSlant, viewAbove, viewBelow } from '../height-view.mjs';
import { stepViewHeight, groundSquare } from '../terrain-math.mjs';

// The cut edge of the map is drawn only on a scene that has asked for the newer ways of showing
// height. A map made before they existed (the bathhouse, Dead Root) is drawn exactly as it was.
const ring = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }];
const plate = (extra = {}) => ({ id: 'p', kind: 'floor', levelId: 'l', height: 2, points: ring, ...extra });

test('an older map has not asked: no view setting, no floating plate', () => {
  for (const design of [undefined, null, {}, { version: 1, nodes: [], segments: [] },
    { version: 1, nodes: [], segments: [], roofs: [plate(), plate({ kind: 'roof' })], ramps: [] },
    { roofs: [plate({ floating: false })] }, { roofs: [plate({ floating: 'yes' })] }, { view: {} }, { view: null }, { view: 'flat' }]) {
    assert.equal(usesHeightView(design), false, JSON.stringify(design));
  }
});

test('a scene asks by carrying any view setting, or by marking a plate floating', () => {
  assert.equal(usesHeightView({ view: { slant: 0.12 } }), true);
  assert.equal(usesHeightView({ view: { slant: 0 } }), true);
  assert.equal(usesHeightView({ view: { above: 'shape' } }), true);
  assert.equal(usesHeightView({ view: { below: 'dim' } }), true);
  assert.equal(usesHeightView({ roofs: [plate(), plate({ floating: true })] }), true, 'one floating plate is enough');
  // The islands map set back to the usual slant in the Walls panel loses its view setting, and
  // still counts: its plates are floating.
  const islands = { roofs: [plate({ floating: true })] };
  assert.deepEqual([viewSlant(islands), viewAbove(islands), viewBelow(islands), usesHeightView(islands)], [0.36, 'off', 'black', true]);
});

test('the GM\'s height arrows step in whole squares', () => {
  // With a token selected the view sits at the token's exact height. It stood at 3.95 on a stair:
  // the arrows used to go to 4.95 and 2.95.
  assert.equal(stepViewHeight(3.95, 'up'), 5);
  assert.equal(stepViewHeight(3.95, 'down'), 3);
  // From a whole height, as always.
  assert.equal(stepViewHeight(3, 'up'), 4);
  assert.equal(stepViewHeight(3, 'down'), 2);
  assert.equal(stepViewHeight(0, 'down'), -1, 'below the ground is allowed, for pits');
  // Each press lands on a whole square, and pressing up then down comes back to it.
  for (const from of [0.33, 1.67, 2.5, 11.9, 17.625, 30]) {
    const up = stepViewHeight(from, 'up'), down = stepViewHeight(from, 'down');
    assert.ok(Number.isInteger(up) && Number.isInteger(down));
    assert.equal(up - down, 2);
    assert.equal(stepViewHeight(up, 'down'), groundSquare(from));
  }
  // Anything but "down" is up, as the buttons send it.
  assert.equal(stepViewHeight(4, undefined), 5);
});
