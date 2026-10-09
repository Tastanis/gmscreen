import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SLANT, validSlant, viewSlant, slantVector, slanted, FLOATING_SIDE, isFloating, sideFoot, shadowRings, castsShadow } from '../height-view.mjs';
import { rampPick, rampHeight } from '../imported-ramps.mjs';

const ring = (l, t, r, b) => [{ x: l, y: t }, { x: r, y: t }, { x: r, y: b }, { x: l, y: b }];
const island = (extra = {}) => ({ id: 'island', kind: 'floor', levelId: 'high', height: 18, points: ring(8, 18, 14, 24), holes: [], ...extra });

test('a scene shows height at the usual slant unless its map design asks for a flatter one', () => {
  assert.equal(DEFAULT_SLANT, 0.36);
  assert.equal(viewSlant(undefined), 0.36);
  assert.equal(viewSlant({ version: 1, nodes: [], segments: [] }), 0.36);
  assert.equal(viewSlant({ view: {} }), 0.36);
  assert.equal(viewSlant({ view: { slant: 0.12 } }), 0.12);
  assert.equal(viewSlant({ view: { slant: 0 } }), 0, 'straight overhead is allowed');
  // Nonsense is ignored, not obeyed: the scene falls back to the usual view.
  for (const bad of [-0.1, 0.37, 2, '0.12', null, NaN, Infinity, true, [0.1]]) assert.equal(viewSlant({ view: { slant: bad } }), 0.36, String(bad));
  assert.equal(validSlant(0.36), true); assert.equal(validSlant(0), true); assert.equal(validSlant(0.361), false); assert.equal(validSlant('0'), false);
});

test('how far a square of height moves a thing on screen', () => {
  // The usual slant is exactly the numbers the board has always used.
  assert.deepEqual(slantVector(), { x: 0.12, y: 0.36 });
  assert.deepEqual(slantVector(0.36), { x: 0.12, y: 0.36 });
  // A flatter one keeps the same direction: a third as far right as up.
  const third = slantVector(0.12);
  assert.ok(Math.abs(third.x - 0.04) < 1e-12 && third.y === 0.12);
  assert.deepEqual(slantVector(0), { x: 0, y: 0 });
  // An island 18 high: six and a half squares up the screen today, about two at a third, nowhere at zero.
  assert.deepEqual(slanted(10, 20, 18), { x: 12.16, y: 13.52 });
  const flatter = slanted(10, 20, 18, slantVector(0.12));
  assert.ok(Math.abs(flatter.x - 10.72) < 1e-9 && Math.abs(flatter.y - 17.84) < 1e-9);
  assert.deepEqual(slanted(10, 20, 18, slantVector(0)), { x: 10, y: 20 });
  assert.deepEqual(slanted(10, 20, 0), { x: 10, y: 20 }, 'ground level is never moved');
});

test('a click on a ramp lands on the ramp at any slant', () => {
  // The islands arch: 8 long, rising 6 to the south.
  const arch = { left: 10, right: 12, top: 10, bottom: 18, base: 12, height: 18, direction: 'south' };
  for (const amount of [0.36, 0.24, 0.12, 0.04, 0]) {
    const slant = slantVector(amount);
    for (const point of [{ x: 10.5, y: 10.5 }, { x: 11.25, y: 14 }, { x: 11.9, y: 17.9 }]) {
      const drawn = slanted(point.x, point.y, rampHeight(arch, point.x, point.y), slant);
      const picked = rampPick(arch, drawn, slant);
      assert.ok(picked && Math.abs(picked.x - point.x) < 1e-9 && Math.abs(picked.y - point.y) < 1e-9, `slant ${amount}: ${JSON.stringify(point)} -> ${JSON.stringify(picked)}`);
    }
  }
  // With no slant named, the usual one is used, as before.
  const usual = slanted(11, 14, rampHeight(arch, 11, 14));
  assert.deepEqual(rampPick(arch, usual), rampPick(arch, usual, slantVector(0.36)));
});

test('only a floor plate marked floating is floating', () => {
  assert.equal(isFloating(island({ floating: true })), true);
  assert.equal(isFloating(island()), false);
  assert.equal(isFloating(island({ floating: 'yes' })), false);
  assert.equal(isFloating({ ...island({ floating: true }), kind: 'roof' }), false, 'a roof is not a floor');
  assert.equal(isFloating(null), false);
});

test('the side of a plate: down to what is under it, or a short slab edge when it floats', () => {
  assert.equal(FLOATING_SIDE, 2);
  // An ordinary plate, as always: a wall from the plate to the ground, or to the plate below.
  assert.equal(sideFoot(island(), 0), 0);
  assert.equal(sideFoot(island(), 12), 12);
  // A floating one: two squares deep.
  assert.equal(sideFoot(island({ floating: true }), 0), 16);
  assert.equal(sideFoot(island({ floating: true }), 12), 16);
  // Unless something is nearer than that under the edge: it stops there, as an ordinary side would.
  assert.equal(sideFoot(island({ floating: true }), 17.6), 17.6);
  // Ground higher than the plate (a plate set into a hillside) leaves no side at all, either way.
  assert.equal(sideFoot(island(), 20), 18);
  assert.equal(sideFoot(island({ floating: true }), 20), 18);
});

test('a floating plate casts a shadow straight down, following the ground', () => {
  const flat = shadowRings(island({ floating: true }), () => 0);
  assert.equal(flat.length, 1);
  assert.equal(flat[0].length, 96, 'a 6 by 6 outline cut four to the square');
  assert.ok(flat[0].every((p) => p.z === 0 && p.x >= 8 && p.x <= 14 && p.y >= 18 && p.y <= 24));
  assert.deepEqual(flat[0][0], { x: 8, y: 18, z: 0 });
  assert.equal(castsShadow(flat, island({ floating: true })), true);
  // Uneven ground: each point takes the height under it.
  const sloped = shadowRings(island({ floating: true }), (x) => x - 8);
  assert.deepEqual(sloped[0].filter((p) => p.y === 18).map((p) => p.z).slice(0, 5), [0, 0.25, 0.5, 0.75, 1]);
  // A hole in the plate is a hole in the shadow.
  const holed = shadowRings(island({ floating: true, holes: [ring(10, 20, 12, 22)] }), () => 0);
  assert.equal(holed.length, 2); assert.equal(holed[1].length, 32);
  // Ground as high as the plate: nothing under it to shade.
  const resting = shadowRings(island({ floating: true }), () => 18);
  assert.ok(resting[0].every((p) => p.z === 18));
  assert.equal(castsShadow(resting, island({ floating: true })), false);
  assert.equal(castsShadow(shadowRings(island({ floating: true }), () => 25), island({ floating: true })), false, 'ground above the plate is never shaded from below');
  // A plate that is not floating casts none: its side wall already says where it stands.
  assert.deepEqual(shadowRings(island(), () => 0), []);
  assert.deepEqual(shadowRings({ ...island({ floating: true }), points: [] }, () => 0), []);
});
