import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { seesRampTop } from '../surface-facing.mjs';
import { rampPlane, rampHeight, rampJoins, standingFloor, rampSightHeight } from '../imported-ramps.mjs';
import { ceilingBlocks } from '../roof-geometry.mjs';
import { onSurface } from '../stacked-surfaces.mjs';
import { makeSight, head, center } from '../vision-height.mjs';
import { pickDrawn, pickView } from '../pointer-pick.mjs';
import { slanted, slantVector } from '../height-view.mjs';

// A stair is drawn for someone standing on the floor it leaves, at either end. Before, a hero on
// the island at the top of an arch or a vine saw the crater floor where the stair was: the stair
// was drawn only for an eye above its slope carried on past its top, and the hero's own floor
// counted as hiding everything lower than itself. Now an eye at or above a stair's top sees its
// face, and each part of a stair joined to the hero's floor is looked for at that floor's height.
const ring = (l, t, r, b) => [{ x: l, y: t }, { x: r, y: t }, { x: r, y: b }, { x: l, y: b }];
const floor = (id, height, box) => ({ id, kind: 'floor', height, points: ring(...box), holes: [] });
const token = (column, row, size = 1) => ({ id: 't', column, row, width: size, height: size });
const upper = floor('upper', 6, [0, 0, 10, 10]), lower = floor('lower', 0, [16, 0, 26, 10]), far = floor('far', 6, [30, 0, 40, 10]);
// An arch from the lower island (0) up to the upper island (6): it rises to the west, its top at x = 10.
const arch = { id: 'arch', left: 10, right: 16, top: 4, bottom: 6, base: 0, height: 6, direction: 'west', fromLevel: 'low', toLevel: 'high' };
// A vine up the upper island's south side: one square, six squares of height.
const vine = { id: 'vine', left: 4, right: 5, top: 10, bottom: 11, base: 0, height: 6, direction: 'north', fromLevel: 'low', toLevel: 'high' };

/** How many 1/16-square slices of a ramp are drawn for a token, by the rules roof-renderer.js applies. */
function drawn(ramp, hero, ground, { surfaces = [upper, lower, far], walls = [], nodes = [] } = {}) {
  const model = { nodes, segments: walls, ramps: [arch, vine] }, viewer = center(hero), eye = head(hero, ground);
  const plain = makeSight({ viewer: hero, viewerGround: ground, groundAt: () => 0, walls: model });
  const sight = (p, z) => !ceilingBlocks(viewer, eye, p, z, surfaces) && plain(p, z); // roofRenderer.blockSight
  const own = standingFloor(surfaces, viewer, ground, onSurface), level = rampSightHeight(ramp, own, -Infinity, onSurface), see = (p, z) => sight(p, Math.max(z, level));
  const plane = rampPlane(ramp), across = Math.abs(plane.a) > 0, gradient = { x: plane.a, y: plane.b };
  let count = 0, of = 0;
  for (let t = across ? ramp.left : ramp.top; t < (across ? ramp.right : ramp.bottom) - 1e-7; t += 1 / 16) {
    const mid = across ? { x: t + 1 / 32, y: (ramp.top + ramp.bottom) / 2 } : { x: (ramp.left + ramp.right) / 2, y: t + 1 / 32 }, z = rampHeight(ramp, mid.x, mid.y);
    of++; if (seesRampTop(viewer, eye, mid, z, gradient, ramp.height) && see(mid, z)) count++;
  }
  return [count, of];
}

test('an eye at or above a ramp\'s top sees its face; an eye under its slope does not', () => {
  const gradient = { x: -1, y: 0 }, point = { x: 13, y: 5 }; // half way down the arch, 3 squares high
  // On the upper island, 4.5 squares back from the top step: under the slope carried on, above the stair.
  assert.equal(seesRampTop({ x: 5.5, y: 4.5 }, 7, point, 3, gradient), false, 'the old rule alone hides it');
  assert.equal(seesRampTop({ x: 5.5, y: 4.5 }, 7, point, 3, gradient, arch.height), true);
  assert.equal(seesRampTop({ x: 5.5, y: 4.5 }, 6, point, 3, gradient, arch.height), true, 'eyes level with the top count');
  // Under the stair itself, on the ground below its high end: still not shown its walking face.
  assert.equal(seesRampTop({ x: 11.5, y: 5 }, 1, point, 3, gradient, arch.height), false);
  // At the foot, looking up: shown, as before.
  assert.equal(seesRampTop({ x: 17.5, y: 5 }, 1, point, 3, gradient, arch.height), true);
});

test('a ramp is joined to the floor at its top and the floor at its foot, and to no other', () => {
  assert.equal(rampJoins(arch, upper, onSurface), true, 'top');
  assert.equal(rampJoins(arch, lower, onSurface), true, 'foot');
  assert.equal(rampJoins(arch, far, onSurface), false, 'another island at the same height');
  assert.equal(rampJoins(arch, floor('wrong-height', 5, [0, 0, 10, 10]), onSurface), false);
  assert.equal(rampJoins(vine, upper, onSurface), true, 'a vine hangs from the island at its top');
  assert.equal(rampJoins(vine, lower, onSurface), false);
  for (const [direction, box, topSide] of [['east', [10, 4, 16, 6], [16, 0, 26, 10]], ['south', [4, 10, 6, 16], [0, 16, 10, 26]], ['north', [4, -6, 6, 0], [0, -16, 10, -6]]]) {
    const ramp = { id: direction, left: box[0], top: box[1], right: box[2], bottom: box[3], base: 0, height: 6, direction };
    assert.equal(rampJoins(ramp, floor('top', 6, topSide), onSurface), true, direction + ' top');
    assert.equal(rampJoins(ramp, floor('top', 0, topSide), onSurface), false, direction + ' top side at the foot height');
  }
  // A ragged rim: the island touches only part of the top step's width.
  assert.equal(rampJoins(arch, floor('ragged', 6, [0, 0, 10, 4.6]), onSurface), true);
});

test('a part of a stair below the floor it is joined to is looked for at the height of that floor', () => {
  assert.equal(rampSightHeight(arch, upper, 2, onSurface), 6);
  assert.equal(rampSightHeight(arch, lower, 2, onSurface), 2, 'from the foot it is where it is');
  assert.equal(rampSightHeight(arch, far, 2, onSurface), 2, 'not joined');
  assert.equal(rampSightHeight(arch, null, 2, onSurface), 2, 'standing on no floor');
});

test('the floor someone stands on is found by height and place', () => {
  assert.equal(standingFloor([upper, lower, far], { x: 5.5, y: 4.5 }, 6, onSurface), upper);
  assert.equal(standingFloor([upper, lower, far], { x: 5.5, y: 4.5 }, 0, onSurface), null, 'on the ground under it');
  assert.equal(standingFloor([upper, lower, far], { x: 13, y: 5 }, 3, onSurface), null, 'on the stair');
  assert.equal(standingFloor([{ ...upper, kind: 'roof' }], { x: 5.5, y: 4.5 }, 6, onSurface), null);
});

test('from the island at its top, the whole arch and the whole vine are drawn', () => {
  for (const [column, row] of [[9, 4], [8, 4], [5, 4], [1, 8]]) {
    assert.deepEqual(drawn(arch, token(column, row), 6), [96, 96], `arch from (${column},${row})`);
    assert.deepEqual(drawn(vine, token(column, row), 6), [16, 16], `vine from (${column},${row})`);
  }
  assert.deepEqual(drawn(arch, token(4, 4, 2), 6), [96, 96], 'a two-square creature');
});

test('from its foot and from the stair itself it is drawn as before', () => {
  for (const column of [16, 17, 20]) assert.deepEqual(drawn(arch, token(column, 4), 0), [96, 96]);
  assert.deepEqual(drawn(vine, token(4, 12), 0), [16, 16]);
  assert.deepEqual(drawn(arch, token(13, 4), 3), [96, 96], 'standing half way up');
});

test('standing under the stair, its walking face is still not drawn', () => {
  const [count] = drawn(arch, token(10, 4), 0, { surfaces: [upper, lower, far] });
  assert.ok(count < 96 / 2, `${count} of 96`);
});

test('what else is in the way still hides it: a wall, and another floor', () => {
  // A wall standing on the upper island between the hero and the top step hides all of it, the low
  // end too: the stair is not seen under the wall through the floor.
  const nodes = [{ id: 'a', x: 8, y: 0 }, { id: 'b', x: 8, y: 10 }], wall = { id: 'w', a: 'a', b: 'b', baseMode: 'fixed', base: 6, height: 3, sight: 'block', movement: 'block' };
  assert.deepEqual(drawn(arch, token(5, 4), 6, { walls: [wall], nodes }), [0, 96]);
  assert.deepEqual(drawn(vine, token(5, 4), 6, { walls: [wall], nodes }), [16, 16], 'the vine is on the same side of that wall as the hero');
  // A second floor a little higher, between the hero and the edge: the line down to the stair crosses it.
  const shelf = floor('shelf', 6.5, [6.2, 0, 9.9, 10]);
  const [behindShelf] = drawn(arch, token(5, 4), 6, { surfaces: [upper, lower, far, shelf] });
  assert.ok(behindShelf < 96, `${behindShelf} of 96 with a shelf in the way`);
  // From another island at the same height the hero's own floor is not the stair's floor: no pass.
  const [fromFar] = drawn(arch, token(34, 4), 6);
  assert.ok(fromFar < 96, `${fromFar} of 96 from the far island`);
});

test('a click on a stair seen from the floor at its top lands on the stair', () => {
  const slant = slantVector(), raw = slanted(13, 5, 3, slant), view = pickView({ token: token(5, 4), ground: 6 });
  const hit = pickDrawn(raw, { slant, surfaces: [upper, lower, far], ramps: [arch, vine], view });
  assert.equal(hit?.ramp?.id, 'arch');
  assert.deepEqual([+hit.x.toFixed(6), +hit.y.toFixed(6), +hit.height.toFixed(6)], [13, 5, 3]);
  // Where the hero's own floor is drawn, the floor is what is clicked.
  const onFloor = pickDrawn(slanted(8.5, 5, 6, slant), { slant, surfaces: [upper, lower, far], ramps: [arch, vine], view });
  assert.equal(onFloor?.floor?.id, 'upper');
});

test('the plate layer uses these rules for the stair picture and its arrows', () => {
  const source = readFileSync(new URL('../roof-renderer.js', import.meta.url), 'utf8');
  assert.equal((source.match(/seesRampTop\(viewer,head\(token,viewerGround\),(?:mid|p),z,gradient,s\.height\)/g) || []).length, 2);
  assert.equal((source.match(/if\(lighting&&!see\((?:mid|p),z\)\)continue;/g) || []).length, 2);
  assert.match(source, /const ownFloor=inspectionHeight===null\?standingFloor\(surfaces,viewer,viewerGround,onSurface\):null;/);
  assert.match(source, /const level=rampSightHeight\(s,ownFloor,-Infinity,onSurface\),see=\(p,z\)=>sight\(p,Math\.max\(z,level\)\);/);
});
