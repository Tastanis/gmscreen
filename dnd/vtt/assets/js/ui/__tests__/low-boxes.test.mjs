import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BOX_HEIGHT, BOX_TOP, lowBoxes, withLowBoxes } from '../low-boxes.mjs';
import { LOW_BARRIER, BOX_FOOT, movementBlocked, lowBarrier } from '../wall-properties.mjs';
import { walkFloorContact, floorSupported, BOX_REACH } from '../floor-support.js';
import { roofSurfaces } from '../roof-geometry.mjs';
import { climbPromptText } from '../climb-prompt.js';

// Brandon, October 10, 2026: "We can treat full square boxes like railings. A full square box ... can be like
// one square up. You can still see over it. It doesn't block vision ... it can be broken, and if you try to go
// over it, it gives you a one climb thing. But if you get like pushed, it can block your push ... if you go to
// move over it, it just says, want to climb? And you say, sure." The server's side is in low-boxes.test.php.

// A ring of four wall pieces just inside one square, as the map packages make an object on a square.
function ring(name, column, row, { base = 0, height = 0.86, size = 1, ...extra } = {}) {
  const x0 = column + 0.04, y0 = row + 0.04, x1 = column + size - 0.04, y1 = row + size - 0.04;
  const corners = { nw: [x0, y0], ne: [x1, y0], se: [x1, y1], sw: [x0, y1] };
  const nodes = Object.entries(corners).map(([k, [x, y]]) => ({ id: `${name}-${k}`, x, y }));
  const side = (id, a, b) => ({ id: `${name}-${id}`, a: `${name}-${a}`, b: `${name}-${b}`, baseMode: 'fixed', base, height, sight: 'pass', movement: 'block', ...extra });
  return { nodes, segments: [side('north', 'nw', 'ne'), side('east', 'ne', 'se'), side('south', 'se', 'sw'), side('west', 'sw', 'nw')] };
}
const model = (...parts) => ({ nodes: parts.flatMap((p) => p.nodes || []), segments: parts.flatMap((p) => p.segments || []), roofs: parts.flatMap((p) => p.roofs || []) });

test('a box is a closed ring of four plain wall pieces of one height, one square high or less', () => {
  assert.equal(BOX_HEIGHT, LOW_BARRIER);
  const boxes = lowBoxes(model(ring('crate', 9, 41, { base: 12, height: 0.57 })));
  assert.equal(boxes.length, 1);
  assert.deepEqual({ ...boxes[0], edges: [...boxes[0].edges].sort() }, { id: BOX_TOP + 'crate-east', left: 9.04, right: 9.96, top: 41.04, bottom: 41.96, base: 12, height: 12.57, edges: ['crate-east', 'crate-north', 'crate-south', 'crate-west'] });
  assert.equal(lowBoxes(model(ring('font', 9, 9, { size: 2, height: 1 })))[0].right, 10.96, 'one that fills two squares by two');
  // Two boxes side by side are two boxes.
  assert.equal(lowBoxes(model(ring('a', 3, 3), ring('b', 4, 3))).length, 2);
});

test('what is not a box is left exactly as it was', () => {
  const none = (m, why) => { assert.deepEqual(lowBoxes(m), [], why); assert.equal(withLowBoxes(m), m, why + ': the model itself comes back'); };
  none(model(ring('pillar', 3, 3, { height: 1.2 })), 'taller than a square');
  none(model(ring('door', 3, 3, { interaction: 'door' })), 'made of doors');
  none(model(ring('ghost', 3, 3, { movement: 'pass' })), 'walls that stop nothing');
  none(model(ring('oneway', 3, 3, { movementDirection: 'left' })), 'one-way walls');
  const open = ring('open', 3, 3); open.segments.pop(); none(model(open), 'three sides only');
  const mixed = ring('mixed', 3, 3); mixed.segments[1].height = 0.5; none(model(mixed), 'sides of different heights');
  const broken = ring('broken', 3, 3); broken.segments[2].broken = true; none(model(broken), 'one side broken through');
  const unset = ring('unset', 3, 3); unset.segments.forEach((s) => { delete s.height; }); none(model(unset), 'no height given: a wall is two squares');
  const onGround = ring('terrain', 3, 3); onGround.segments.forEach((s) => { s.baseMode = 'terrain'; }); none(model(onGround), 'no fixed base to measure its top from');
  none(model({ nodes: [{ id: 'a', x: 3, y: 1 }, { id: 'b', x: 3, y: 5 }], segments: [{ id: 'rail', a: 'a', b: 'b', baseMode: 'fixed', base: 0, height: 0.67, movement: 'block' }] }), 'a rail alone');
});

test('the box gets a top to stand on, on the floor it stands on, and its walls are marked', () => {
  const island = { id: 'mid', kind: 'floor', levelId: 'mid-level', height: 12, points: [{ x: 5, y: 38 }, { x: 15, y: 38 }, { x: 15, y: 46 }, { x: 5, y: 46 }], holes: [] };
  const worked = withLowBoxes(model(ring('rock', 9, 41, { base: 12, height: 0.57 }), ring('crate', 30, 30, { base: 0, height: 1 }), { roofs: [island] }));
  const tops = worked.roofs.filter((roof) => roof.boxTop);
  assert.deepEqual(tops.map((t) => [t.id, t.kind, t.levelId, t.base, t.height]), [[BOX_TOP + 'rock-east', 'floor', 'mid-level', 12, 12.57], [BOX_TOP + 'crate-east', 'floor', 'level-0', 0, 1]]);
  assert.deepEqual(tops[0].points, [{ x: 9.04, y: 41.04 }, { x: 9.96, y: 41.04 }, { x: 9.96, y: 41.96 }, { x: 9.04, y: 41.96 }]);
  assert.equal(worked.segments.filter((s) => s.boxWall).length, 8);
  assert.equal(worked.roofs.includes(island), true, 'the map\'s own plates are untouched');
  // It is somewhere to stand, not a ceiling or a picture: sight and the floors' drawing never see it.
  assert.deepEqual(roofSurfaces(worked).map((r) => r.id), ['mid']);
});

test('a walk into a box is asked like a rail, and says "onto"; without the yes it is refused as before', () => {
  const raw = model(ring('crate', 5, 2, { height: 0.86 })), worked = withLowBoxes(raw);
  const hero = { column: 4, row: 2, width: 1, height: 1 }, into = { column: 5, row: 2 }, z = () => 0, ground = () => 0;
  assert.equal(movementBlocked(worked, hero, into, z, ground), true);
  assert.equal(movementBlocked(worked, hero, into, z, ground, true), false);
  const low = lowBarrier(worked, hero, into, z, ground);
  assert.ok(Math.abs(low.rise - 0.86) < 1e-9); assert.equal(low.onto, true);
  assert.equal(climbPromptText({ over: low.rise, onto: low.onto, cost: 1 }).title, 'Climb onto it?');
  // The same walls before the boxes are worked in: an object's walls inside a square are no rail.
  assert.equal(movementBlocked(raw, hero, into, z, ground, true), true);
  // A rail is still "over".
  const rail = { nodes: [{ id: 'a', x: 5, y: 1 }, { id: 'b', x: 5, y: 4 }], segments: [{ id: 'rail', a: 'a', b: 'b', baseMode: 'fixed', base: 0, height: 0.67, movement: 'block' }] };
  assert.equal(lowBarrier(rail, hero, into, z, ground).onto, false);
  // A taller ring refuses either way.
  assert.equal(movementBlocked(withLowBoxes(model(ring('pillar', 5, 2, { height: 1.2 }))), hero, into, z, ground, true), true);
});

test('a box on rough ground: its base may be up to half a square above his feet, no more', () => {
  // Dead Root's rocks stand at the ground's height where they are (0.22), and the next square is a little lower
  // or higher; one is 0.43 above the square beside it. A rail on a built floor keeps the strict rule.
  const hero = { column: 4, row: 2, width: 1, height: 1 }, into = { column: 5, row: 2 }, z = () => 0, ground = () => 0;
  for (const base of [0.02, 0.43, BOX_FOOT]) {
    const worked = withLowBoxes(model(ring('rock', 5, 2, { base, height: 1 })));
    assert.equal(movementBlocked(worked, hero, into, z, ground), true, `base ${base}: asked`);
    assert.equal(movementBlocked(worked, hero, into, z, ground, true), false, `base ${base}: climbed on a yes`);
    assert.ok(Math.abs(lowBarrier(worked, hero, into, z, ground).rise - (base + 1)) < 1e-9, 'the rise is from his feet to its top');
    const up = walkFloorContact({ ...hero, id: 'cal', levelId: 'level-0' }, { ...hero, ...into, id: 'cal', levelId: 'level-0' }, [], worked.roofs, { levels: [] }, ground);
    assert.equal(up?.id, BOX_TOP + 'rock-east', `base ${base}: and he stands on it`);
  }
  assert.equal(movementBlocked(withLowBoxes(model(ring('ledge', 5, 2, { base: 0.6, height: 1 }))), hero, into, z, ground, true), true, 'a box 0.6 above his feet is not on his floor');
  const beam = { nodes: [{ id: 'a', x: 5, y: 1 }, { id: 'b', x: 5, y: 4 }], segments: [{ id: 'beam', a: 'a', b: 'b', baseMode: 'fixed', base: 0.3, height: 0.5, movement: 'block' }] };
  assert.equal(movementBlocked(beam, hero, into, z, ground, true), true, 'a rail keeps the strict rule: one 0.3 off the floor is not stepped over');
});

test('on the ground: he steps up onto the top, and down off it', () => {
  const worked = withLowBoxes(model(ring('crate', 5, 2, { height: 0.86 }))), surfaces = worked.roofs, levels = { levels: [] }, ground = () => 0;
  const hero = { id: 'cal', column: 4, row: 2, width: 1, height: 1, levelId: 'level-0' };
  const up = walkFloorContact(hero, { ...hero, column: 5 }, [], surfaces, levels, ground);
  assert.equal(up?.id, BOX_TOP + 'crate-east'); assert.equal(up.height, 0.86);
  const onTop = { ...hero, column: 5, _supportSurfaceId: up.id };
  assert.equal(walkFloorContact(onTop, { ...onTop, column: 6 }, [], surfaces, levels, ground), null, 'off the far side he is on the ground again');
  assert.equal(walkFloorContact(hero, { ...hero, column: 6 }, [], surfaces, levels, ground), null, 'a walk across it ends on the ground beyond');
  assert.equal(BOX_REACH, LOW_BARRIER + BOX_FOOT);
  // The top is not a floor that bounds its level: the ground round it is still ground.
  assert.equal(floorSupported({ ...hero, column: 8 }, surfaces), null);
});

test('on an island: he steps up from the island onto its rim rock, and back down onto the island', () => {
  const island = { id: 'mid', kind: 'floor', levelId: 'mid-level', height: 12, points: [{ x: 5, y: 38 }, { x: 15, y: 38 }, { x: 15, y: 46 }, { x: 5, y: 46 }], holes: [] };
  const worked = withLowBoxes(model(ring('rock', 9, 41, { base: 12, height: 0.57 }), { roofs: [island] })), surfaces = worked.roofs;
  const levels = { levels: [{ id: 'mid-level', elevationSquares: 12, cutouts: [] }] }, ground = () => 0;
  const hero = { id: 'cal', column: 10, row: 41, width: 1, height: 1, levelId: 'mid-level', _supportSurfaceId: 'mid' };
  const up = walkFloorContact(hero, { ...hero, column: 9 }, [], surfaces, levels, ground);
  assert.equal(up?.id, BOX_TOP + 'rock-east', 'though the island is still under him');
  assert.equal(up.levelId, 'mid-level', 'he stays on the island\'s floor');
  const onRock = { ...hero, column: 9, _supportSurfaceId: up.id };
  assert.equal(walkFloorContact(onRock, { ...onRock, column: 10 }, [], surfaces, levels, ground)?.id, 'mid', 'and steps back down onto the island, not through it');
  // Walking along the island beside the rock, he does not get onto it.
  assert.equal(walkFloorContact(hero, { ...hero, row: 43 }, [], surfaces, levels, ground)?.id, 'mid');
});

test('while a move is still being judged he is not up on the box: its walls are met from where he stands', () => {
  // Without this the box's own top lifted him to the height of its walls as he touched them, and they stopped nothing.
  const worked = withLowBoxes(model(ring('a', 5, 2, { height: 0.4 }), ring('b', 6, 2, { height: 0.4 }), ring('c', 7, 2, { height: 1 }))), surfaces = worked.roofs, levels = { levels: [] }, ground = () => 0;
  const hero = { id: 'cal', column: 4, row: 2, width: 1, height: 1, levelId: 'level-0' }, judged = (from, column) => walkFloorContact(from, { ...from, column }, [], surfaces, levels, ground, false);
  assert.equal(judged(hero, 5), null, 'from the ground: not on it');
  assert.equal(judged(hero, 4.5), null, 'nor part-way in');
  const onA = { ...hero, column: 5, _supportSurfaceId: BOX_TOP + 'a-east' };
  assert.equal(judged(onA, 5.5)?.id, BOX_TOP + 'a-east', 'the top he starts on, he keeps');
  assert.equal(judged(onA, 6)?.id, BOX_TOP + 'b-east', 'and he walks onto the next of the same height');
  assert.equal(judged({ ...hero, column: 6, _supportSurfaceId: BOX_TOP + 'b-east' }, 7), null, 'but not up onto a higher one');
  assert.equal(walkFloorContact({ ...hero, column: 6, _supportSurfaceId: BOX_TOP + 'b-east' }, { ...hero, column: 7 }, [], surfaces, levels, ground)?.id, BOX_TOP + 'c-east', 'which the move itself, once let in, does');
  const terrain = readFileSync(new URL('../terrain-prototype.js', import.meta.url), 'utf8');
  assert.match(terrain, /function movementGroundFor\(from,to\)\{return groundFor\(movementPlacement\(from,to,false\)\);\}/);
});

test('the page works the boxes into the walls it reads, before the summoned cubes', () => {
  const walls = readFileSync(new URL('../wall-prototype.js', import.meta.url), 'utf8');
  assert.match(walls, /cachedCubeModel=wallCubeModel\(withLowBoxes\(liveWalls\(model\)\),/);
  const rules = readFileSync(new URL('../wall-properties.mjs', import.meta.url), 'utf8');
  assert.match(rules, /plain=can\|\|e\.interaction==='none'&&\(onGridLine\(a,b\)\|\|edge\.boxWall===true\)/);
});
