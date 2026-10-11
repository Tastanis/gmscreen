import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LOW_BARRIER, movementBlocked, movementPathBlocked, lowBarrier, lowBarrierOnPath, onGridLine, properties, restrictions } from '../wall-properties.mjs';
import { climbPromptText } from '../climb-prompt.js';
import { makeSight } from '../vision-height.mjs';

// Brandon, October 10, 2026, of the bathhouse balcony rails: "I want them to be breakable. But also
// climbable. If it asks to climb. I want players to be able to click yes and move to the top. Instead
// of it knocking them back like a wall. Those railings shouldn't block vision in the bathhouse. And yes
// they should be breakable. But also they should be able to just jump over them since they are only one
// square high or less." The server's side is in low-barriers.test.php.

// A wall along the line between column 2 and column 3, rows 1 to 5; the hero stands at 2,2 on floor `z`.
const scene = (...walls) => ({
  nodes: walls.flatMap((wall, i) => [{ id: `a${i}`, x: wall.x ?? 3, y: 1 }, { id: `b${i}`, x: wall.x ?? 3, y: 5 }]),
  segments: walls.map(({ x, ...wall }, i) => ({ id: `wall${i}`, a: `a${i}`, b: `b${i}`, baseMode: 'fixed', base: 0, movement: 'block', ...wall })),
});
const hero = { column: 2, row: 2, width: 1, height: 1 }, over = { column: 3, row: 2 };
const onFloor = (z) => () => z, ground = () => 0;
const blocked = (model, { to = over, climb = false, z = 0 } = {}) => movementBlocked(model, hero, to, onFloor(z), ground, climb);
const rail = { height: 0.67, material: 'wood', sight: 'pass' };

test('a rail refuses a walk until the walker says yes, and then he goes over it', () => {
  assert.equal(LOW_BARRIER, 1);
  assert.equal(blocked(scene(rail)), true);
  assert.equal(blocked(scene(rail), { climb: true }), false);
  assert.equal(blocked(scene({ height: 1 }), { climb: true }), false, 'exactly one square is still low');
  assert.equal(blocked(scene(rail), { climb: true, to: { column: 5, row: 2 } }), false, 'a longer step across it');
  // The question is asked only when low barriers are all that is in the way, and says how high.
  assert.ok(Math.abs(lowBarrier(scene(rail), hero, over, onFloor(0), ground).rise - 0.67) < 1e-9);
  assert.equal(lowBarrier(scene(rail), hero, { column: 2, row: 3 }, onFloor(0), ground), null, 'nothing in the way: no question');
});

test('what is not a low barrier refuses either way, and asks nothing', () => {
  const cases = {
    'a wall 1.2 high': scene({ height: 1.2 }),
    'a wall that gives no height (two squares)': scene({}),
    'the wall of an object inside a square': scene({ height: 0.67, x: 3.04 }),
    'a closed low gate': scene({ height: 1, interaction: 'door' }),
    'a beam off the floor': scene({ height: 0.5, base: 0.4 }),
    'a rail with a window above it': scene(rail, { base: 0.67, height: 1.33 }),
  };
  for (const [name, model] of Object.entries(cases)) {
    assert.equal(blocked(model, { climb: true }), true, name + ' still stops him');
    assert.equal(lowBarrier(model, hero, over, onFloor(0), ground), null, name + ' asks nothing');
  }
  assert.equal(blocked(scene(rail, { base: 1.67, height: 1 }), { climb: true }), false, 'a beam well overhead does not stop him');
  assert.equal(blocked(scene(rail, { height: 2, x: 4 }), { climb: true, to: { column: 5, row: 2 } }), true, 'a full wall further along the same step');
});

test('a rail is low for whoever stands on its own floor', () => {
  const balcony = scene({ height: 0.67, base: 4 });
  assert.equal(blocked(balcony, { z: 4 }), true);
  assert.equal(blocked(balcony, { z: 4, climb: true }), false);
  assert.equal(blocked(balcony, { z: 0 }), false, 'nothing to a walker on the ground under it');
});

test('a walk with corners is asked once, for the tallest barrier on its way', () => {
  const model = scene(rail, { height: 0.9, x: 5 });
  const walk = { column: 6, row: 2, path: [{ column: 4, row: 2 }] };
  assert.equal(movementPathBlocked(model, hero, walk, onFloor(0), ground), true);
  assert.equal(movementPathBlocked(model, hero, walk, onFloor(0), ground, undefined, true), false);
  assert.ok(Math.abs(lowBarrierOnPath(model, hero, walk, onFloor(0), ground).rise - 0.9) < 1e-9);
  assert.equal(lowBarrierOnPath(scene(rail, { height: 2, x: 5 }), hero, walk, onFloor(0), ground), null, 'a full wall on a later leg: no question, it is refused');
  assert.equal(lowBarrierOnPath(model, hero, { column: 2, row: 4 }, onFloor(0), ground), null);
});

test('a rail runs along the edge between squares; an object\'s walls do not', () => {
  assert.equal(onGridLine({ x: 3, y: 1 }, { x: 3, y: 5 }), true);
  assert.equal(onGridLine({ x: 20, y: 22 }, { x: 21, y: 22 }), true);
  assert.equal(onGridLine({ x: 3.04, y: 1.04 }, { x: 3.04, y: 1.96 }), false);
  assert.equal(onGridLine({ x: 3, y: 1 }, { x: 4, y: 2 }), false, 'nor a slanted wall');
});

test('a wall one square high or less lets sight through unless it says it blocks', () => {
  assert.equal(properties({ height: 0.67 }).sight, 'pass');
  assert.equal(properties({ height: 1 }).sight, 'pass');
  assert.equal(properties({ height: 0.67, sight: 'block' }).sight, 'block', 'it says so');
  assert.equal(properties({ height: 1.2 }).sight, 'block', 'a taller wall that says nothing blocks, as always');
  assert.equal(properties({}).sight, 'block', 'and so does a wall with no height: it is two squares');
  assert.equal(restrictions({ height: 0.67 }).sight, 'pass');
  // Through the sight test itself: a creature lying low behind a rail is seen; behind a low wall that says "block" it is not.
  const viewer = { column: 0, row: 2, width: 1, height: 1 }, target = { x: 3.6, y: 2.5 };   // just beyond the wall, near the floor
  const sees = (wall) => makeSight({ viewer, viewerGround: 0, groundAt: () => 0, walls: scene(wall) })(target, 0.2);
  assert.equal(sees({ height: 0.67 }), true);
  assert.equal(sees({ height: 0.67, sight: 'block' }), false);
  assert.equal(sees({}), false);
});

test('the pop-up is one short line: the fact and the cost', () => {
  const text = climbPromptText({ over: 0.67, cost: 2, left: 4 });
  assert.equal(text.title, 'Climb over railing?');
  assert.deepEqual(text.lines, ['Cost 2.']);
  assert.deepEqual([text.yes, text.no], ['Climb', 'Don’t climb']);
  // Short of movement he is told, and may still go: the app warns, it does not block.
  assert.deepEqual(climbPromptText({ over: 1, cost: 3, left: 1 }).lines, ['Cost 3.', 'Only 1 movement left.']);
  // A low object that fills a square is climbed onto.
  assert.equal(climbPromptText({ over: 0.86, onto: true, cost: 1 }).title, 'Climb onto it?');
  // The cliff question has the same taste.
  assert.equal(climbPromptText({ squares: 3, cost: 6 }).title, 'Climb 3 squares?');
});

test('the board asks before it sends, the answer travels with the move, and a push is not asked', () => {
  const board = readFileSync(new URL('../board-interactions.js', import.meta.url), 'utf8');
  assert.match(board, /\(movementKind === 'walk' \|\| movementKind === 'shift'\) && moves\.length === 1 && !isGmUser\(\) && typeof window\.wallPrototype\?\.lowBarrier === 'function'/);
  assert.match(board, /const yes = await askClimb\(\{ name: origin\.name \|\| 'Token', over: low\.rise, onto: low\.onto === true, cost, left \}, \{ anchor \}\);/);
  assert.match(board, /updateStatus\('Did not climb\.'\);\s*return;\s*\}\s*climbLow = true;/);
  assert.match(board, /\.\.\.\(climbLow \? \{ climbLow: true \} : \{\}\) \};/);
  const runtime = readFileSync(new URL('../../sync-v2/token-movement-runtime.js', import.meta.url), 'utf8');
  assert.match(runtime, /\.\.\.\(move\.climbLow === true \? \{climbLow:true\} : \{\}\),/);
  const walls = readFileSync(new URL('../wall-prototype.js', import.meta.url), 'utf8');
  assert.match(walls, /lowBarrier:\(from,to\)=>!context\|\|context\.isGM\|\|/);
  // The forced check does not take the answer.
  assert.match(walls, /forcedBlockedMove:\(from,to\)=>[^\n]*movementBlocked\(activeModel\(\),from,to,\(t,origin\)=>moverHeight\(origin,t,'forced'\),groundAt\)\)/);
});
