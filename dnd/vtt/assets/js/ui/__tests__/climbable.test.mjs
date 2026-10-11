import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BOX_TOP, lowBoxes, withLowBoxes } from '../low-boxes.mjs';
import { climbable, defaults, movementBlocked, lowBarrier, lowBarrierOnPath } from '../wall-properties.mjs';
import { walkFloorContact, BOX_FOOT } from '../floor-support.js';
import { climbPromptText } from '../climb-prompt.js';
import { routeSteps, stepCost, climbSurcharge } from '../terrain-math.mjs';

// Brandon, October 10, 2026, after a rim rock 1.58 squares tall refused him beside one 0.61 tall that asked:
// "well i should be able to climb up most things right that are steep terrain. So I guess we need a wall type called
// climbable ... any thing outside like a large rock or something. Those should all be climbable. We can just make
// that a setting instead of trying to make sure every block is the right height". Only what is ticked is climbable.
// The cost is a cliff's; coming down is the fall rule as it is. The server's side is in climbable.test.php.

function ring(name, column, row, { base = 0, height = 0.86, size = 1, ...extra } = {}) {
  const x0 = column + 0.04, y0 = row + 0.04, x1 = column + size - 0.04, y1 = row + size - 0.04;
  const corners = { nw: [x0, y0], ne: [x1, y0], se: [x1, y1], sw: [x0, y1] };
  const nodes = Object.entries(corners).map(([k, [x, y]]) => ({ id: `${name}-${k}`, x, y }));
  const side = (id, a, b) => ({ id: `${name}-${id}`, a: `${name}-${a}`, b: `${name}-${b}`, baseMode: 'fixed', base, height, sight: 'pass', movement: 'block', ...extra });
  return { nodes, segments: [side('north', 'nw', 'ne'), side('east', 'ne', 'se'), side('south', 'se', 'sw'), side('west', 'sw', 'nw')] };
}
const model = (...parts) => ({ nodes: parts.flatMap((p) => p.nodes || []), segments: parts.flatMap((p) => p.segments || []), roofs: parts.flatMap((p) => p.roofs || []) });
const hero = { id: 'cal', column: 4, row: 2, width: 1, height: 1, levelId: 'level-0' }, into = { column: 5, row: 2 }, z = () => 0, ground = () => 0;

test('only what is ticked: the setting is off unless a wall says so, and a door is opened, not climbed', () => {
  assert.equal(defaults.climbable, false);
  assert.equal(climbable({ climbable: true }), true);
  assert.equal(climbable({}), false); assert.equal(climbable({ climbable: 'yes' }), false); assert.equal(climbable(null), false);
  assert.equal(climbable({ climbable: true, interaction: 'door' }), false);
});

test('a rock taller than a square: a wall as before without the tick, climbed on a yes with it', () => {
  const plain = withLowBoxes(model(ring('rock', 5, 2, { height: 1.58 })));
  assert.equal(plain.roofs.length, 0, 'no top: it is a wall');
  assert.equal(movementBlocked(plain, hero, into, z, ground, true), true, 'and refuses even with a yes');
  const ticked = withLowBoxes(model(ring('rock', 5, 2, { height: 1.58, climbable: true })));
  assert.equal(movementBlocked(ticked, hero, into, z, ground), true, 'asked first');
  assert.equal(movementBlocked(ticked, hero, into, z, ground, true), false);
  const low = lowBarrier(ticked, hero, into, z, ground);
  assert.ok(Math.abs(low.rise - 1.58) < 1e-9); assert.equal(low.onto, true); assert.equal(low.tall, true);
  for (const height of [3, 10]) assert.equal(movementBlocked(withLowBoxes(model(ring('tor', 5, 2, { height, climbable: true }))), hero, into, z, ground, true), false, `any height: ${height}`);
  // The low things keep working without the tick, and are not "tall".
  assert.equal(lowBarrier(withLowBoxes(model(ring('crate', 5, 2, { height: 0.86 }))), hero, into, z, ground).tall, false);
});

test('a ring of climbable walls is a box of any height, with its top at its real height', () => {
  const boxes = lowBoxes(model(ring('rock', 5, 2, { base: 12, height: 1.58, climbable: true }), ring('tor', 8, 2, { base: 12, height: 6, size: 2, climbable: true })));
  assert.deepEqual(boxes.map((b) => [b.id, b.height, b.climbable]), [[BOX_TOP + 'rock-east', 13.58, true], [BOX_TOP + 'tor-east', 18, true]]);
  const worked = withLowBoxes(model(ring('rock', 5, 2, { height: 1.58, climbable: true })));
  assert.deepEqual(worked.roofs.map((r) => [r.boxTop, r.climbable, r.base, r.height]), [[true, true, 0, 1.58]]);
  // All four sides must say so: three ticked and one not is no box above a square high.
  const mixed = ring('mixed', 5, 2, { height: 1.58, climbable: true }); delete mixed.segments[2].climbable;
  assert.deepEqual(lowBoxes(model(mixed)), []);
  // A low ring with the tick is a box as it was without.
  assert.equal(lowBoxes(model(ring('crate', 5, 2, { height: 0.86, climbable: true }))).length, 1);
});

test('he stands on its top; stepping off a tall one is a drop, which the fall rule lands', () => {
  const island = { id: 'mid', kind: 'floor', levelId: 'mid-level', height: 12, points: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 0, y: 10 }], holes: [] };
  const worked = withLowBoxes(model(ring('rock', 5, 2, { base: 12, height: 3, climbable: true }), { roofs: [island] })), surfaces = worked.roofs;
  const levels = { levels: [{ id: 'mid-level', elevationSquares: 12, cutouts: [] }] }, onIsland = { ...hero, levelId: 'mid-level', _supportSurfaceId: 'mid' };
  const up = walkFloorContact(onIsland, { ...onIsland, column: 5 }, [], surfaces, levels, ground);
  assert.equal(up?.id, BOX_TOP + 'rock-east'); assert.equal(up.height, 15);
  const onRock = { ...onIsland, column: 5, _supportSurfaceId: up.id };
  assert.equal(walkFloorContact(onRock, { ...onRock, column: 6 }, [], surfaces, levels, ground), null, 'three squares down is no step: he has left his footing, and the fall rule lands him on the island');
  const short = withLowBoxes(model(ring('rock', 5, 2, { base: 12, height: 1.4, climbable: true }), { roofs: [island] }));
  assert.equal(walkFloorContact({ ...onIsland, column: 5, _supportSurfaceId: BOX_TOP + 'rock-east' }, { ...onIsland, column: 6 }, [], short.roofs, levels, ground)?.id, 'mid', 'off one under a square and a half he steps down onto the island');
  // While the walk is still being judged he is not up on it: its walls are met from the island.
  assert.equal(walkFloorContact(onIsland, { ...onIsland, column: 5 }, [], surfaces, levels, ground, false)?.id, 'mid');
  // A climbable thing far above or below him is not his: on the ground under the island he walks under it.
  assert.equal(walkFloorContact({ ...hero }, { ...hero, column: 5 }, [], surfaces, levels, ground), null);
  assert.equal(BOX_FOOT, 0.5);
  // One whose base is more than half a square above his feet is not stepped onto.
  const high = withLowBoxes(model(ring('ledge', 5, 2, { base: 0.6, height: 2, climbable: true })));
  assert.equal(walkFloorContact(hero, { ...hero, column: 5 }, [], high.roofs, { levels: [] }, ground), null);
  assert.equal(movementBlocked(high, hero, into, z, ground, true), true, 'and its walls refuse');
});

test('a climbable line (a fence, a wall along an edge) is crossed on a yes whatever its height', () => {
  const fence = (extra) => ({ nodes: [{ id: 'a', x: 5, y: 1 }, { id: 'b', x: 5, y: 4 }], segments: [{ id: 'fence', a: 'a', b: 'b', baseMode: 'fixed', base: 0, height: 3, movement: 'block', ...extra }] });
  assert.equal(movementBlocked(fence({}), hero, into, z, ground, true), true, 'three squares high and not ticked: a wall');
  assert.equal(movementBlocked(fence({ climbable: true }), hero, into, z, ground, true), false);
  const low = lowBarrier(fence({ climbable: true }), hero, into, z, ground);
  assert.equal(low.onto, false); assert.equal(low.tall, true); assert.equal(low.rise, 3);
  assert.equal(movementBlocked(fence({ climbable: true, interaction: 'door' }), hero, into, z, ground, true), true, 'a shut door is not climbed');
  // Off the grid lines too: the tick is what counts, not where the wall lies.
  const slanted = { nodes: [{ id: 'a', x: 4.6, y: 1.2 }, { id: 'b', x: 5.7, y: 3.9 }], segments: [{ id: 'log', a: 'a', b: 'b', baseMode: 'fixed', base: 0, height: 1.4, movement: 'block', climbable: true }] };
  assert.equal(movementBlocked(slanted, hero, into, z, ground, true), false);
  // Something that is not climbable on the same walk still refuses it.
  const both = model(fence({ climbable: true }), { nodes: [{ id: 'c', x: 6, y: 1 }, { id: 'd', x: 6, y: 4 }], segments: [{ id: 'wall', a: 'c', b: 'd', baseMode: 'fixed', base: 0, height: 3, movement: 'block' }] });
  assert.equal(lowBarrierOnPath(both, hero, { column: 7, row: 2 }, z, ground), null);
});

test('Brandon\'s drag: across a tall rock and a low one side by side, asked once for the whole drag', () => {
  const pair = (tick) => withLowBoxes(model(ring('tall', 14, 44, { base: 12, height: 1.58, ...tick }), ring('low', 15, 44, { base: 12, height: 0.61, ...tick })));
  const from = { id: 'cal', column: 13, row: 44, width: 1, height: 1 }, to = { column: 17, row: 44 }, feet = () => 12;
  assert.equal(lowBarrierOnPath(pair({}), from, to, feet, ground), null, 'as he found it: the tall one is a wall, nothing is asked');
  const low = lowBarrierOnPath(pair({ climbable: true }), from, to, feet, ground);
  assert.ok(Math.abs(low.rise - 1.58) < 1e-9); assert.equal(low.onto, true); assert.equal(low.tall, true);
});

test('the cost is a cliff\'s: under a square and a half is a step, from there it is charged double', () => {
  const walk = (height) => routeSteps({ column: 4, row: 2 }, { column: 5, row: 2 }, (column) => (column === 5 ? height : 0), null, () => true);
  assert.equal(walk(0.61).cost, 1); assert.equal(walk(1.4).cost, 1); assert.equal(walk(1.4).climbExtra, 0);
  assert.equal(walk(1.58).cost, 4); assert.equal(walk(1.58).climbExtra, 2);
  assert.equal(walk(3).cost, 6);
  assert.equal(stepCost({ horizontal: 1, rise: 2, climb: true }), 2 + climbSurcharge(2));
  // The ruler charges it when the step goes up onto a climbable thing's top.
  const terrain = readFileSync(new URL('../terrain-prototype.js', import.meta.url), 'utf8');
  assert.match(terrain, /return resolveSupportSurfaces\(importedDesign\(\)\|\|\{\}\)\.some\(s=>s\.boxTop&&s\.climbable&&Math\.abs\(s\.height-b\.rawHeight\)<\.01&&intersectsFloor\(to,s,\[\]\)\);/);
});

test('one question for the whole drag, and the words', () => {
  assert.equal(climbPromptText({ over: 1.58, onto: true, tall: true, cost: 4 }).title, 'Climb onto it?');
  assert.equal(climbPromptText({ over: 3, tall: true, cost: 1 }).title, 'Climb over it?');
  assert.equal(climbPromptText({ over: 0.67, cost: 1 }).title, 'Climb over railing?');
  assert.equal(climbPromptText({ squares: 2, cost: 4 }).title, 'Climb 2 squares?');
  const board = readFileSync(new URL('../board-interactions.js', import.meta.url), 'utf8');
  // A yes to the cliff question is the yes to any low or climbable wall on the same drag: he is not asked twice.
  assert.match(board, /climbAnswered = climb === true;/);
  assert.match(board, /const yes = climbAnswered \|\| await askClimb\(/);
});

test('the Walls panel has the tick, and takes it away cleanly', () => {
  const editor = readFileSync(new URL('../wall-editor.mjs', import.meta.url), 'utf8');
  assert.match(editor, /climbable:'Climbable'/);
  assert.match(editor, /input\.type=\['open','locked','secret','broken','climbable'\]\.includes\(k\)\?'checkbox'/);
  assert.match(editor, /else if\(k==='climbable'\)\{if\(value\)edge\.climbable=true;else delete edge\.climbable;\}/);
});
