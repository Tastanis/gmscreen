import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LOW_BARRIER, movementBlocked, movementPathBlocked, walkBlocked, lowBarrier, lowBarrierOnPath, onGridLine, properties, restrictions, wallQuestion, headRoomOnPath } from '../wall-properties.mjs';
import { climbPromptText } from '../climb-prompt.js';
import { moveQuestionText } from '../move-question.js';
import { makeSight } from '../vision-height.mjs';
import { isWallRefusal, refusalKind } from '../wall-flash.mjs';

// Brandon, November 8, 2026: "up to 1.5 squares is a plain step with no question", and "every hard refusal becomes a
// question or a warning ... warn and ask, never block, for players as well". A rail, a fence, a box up to the rules
// table's stepUp is walked over; a climbable face above that asks to climb; a shut door asks Open and go / Go anyway;
// a wall asks Move anyway. Before, October 10, 2026, a rail asked to climb. The server's side is in low-barriers.test.php.

// A wall along the line between column 2 and column 3, rows 1 to 5; the hero stands at 2,2 on floor `z`.
const scene = (...walls) => ({
  nodes: walls.flatMap((wall, i) => [{ id: `a${i}`, x: wall.x ?? 3, y: 1 }, { id: `b${i}`, x: wall.x ?? 3, y: 5 }]),
  segments: walls.map(({ x, ...wall }, i) => ({ id: `wall${i}`, a: `a${i}`, b: `b${i}`, baseMode: 'fixed', base: 0, movement: 'block', ...wall })),
});
const hero = { column: 2, row: 2, width: 1, height: 1 }, over = { column: 3, row: 2 };
const onFloor = (z) => () => z, ground = () => 0;
const walks = (model, { to = over, climb = false, z = 0, from = hero } = {}) => !walkBlocked(model, from, to, onFloor(z), ground, climb);
const asks = (model, to = over, from = hero) => wallQuestion(model, from, to, onFloor(0), ground);
const rail = { height: 0.67, material: 'wood', sight: 'pass' };

test('a wall up to a square and a half high is a plain step: no question', () => {
  assert.equal(LOW_BARRIER, 1.5);
  for (const height of [0.67, 1, 1.5]) {
    assert.equal(walks(scene({ height })), true, `${height} high`);
    assert.equal(asks(scene({ height })).kind, 'none', `${height} high asks nothing`);
  }
  assert.equal(walks(scene(rail), { to: { column: 5, row: 2 } }), true, 'a longer step across it');
  assert.equal(walks(scene({ height: 0.67, x: 3.04 })), true, 'the low wall of an object inside a square too');
  // A push is still stopped by a rail.
  assert.equal(movementBlocked(scene(rail), hero, over, onFloor(0), ground), true);
});

test('what is more than a step is asked: climb, door, or wall', () => {
  assert.equal(asks(scene({ height: 1.6 })).kind, 'wall');
  assert.equal(asks(scene({})).kind, 'wall', 'a wall that gives no height is two squares');
  const climb = asks(scene({ height: 2.5, climbable: true }));
  assert.equal(climb.kind, 'climb');
  assert.ok(Math.abs(climb.rise - 2.5) < 1e-9);
  assert.equal(walks(scene({ height: 2.5, climbable: true })), false);
  assert.equal(walks(scene({ height: 2.5, climbable: true }), { climb: true }), true, 'a yes climbs it');
  assert.equal(asks(scene({ height: 2.5, climbable: true, climbSide: 'right' })).kind, 'wall', 'climbable from the other side only');
  assert.equal(asks(scene({ height: 2.5, climbable: true, climbSide: 'right' }), hero, { ...over }).kind, 'climb', 'and from that side it is a climb');
  assert.equal(asks(scene({ height: 1, interaction: 'door' })).kind, 'door', 'a shut low gate is a door');
  assert.equal(asks(scene({ height: 1, interaction: 'door', locked: true })).locked, true);
  assert.equal(asks(scene({ height: 0.5, base: 0.4 })).kind, 'wall', 'a beam off the floor is not a step');
  assert.equal(asks(scene(rail, { base: 0.67, height: 1.33 })).kind, 'wall', 'a window above a sill: over the rail he is at its top');
  assert.equal(asks(scene(rail, { base: 1.67, height: 1 })).kind, 'none', 'a beam well overhead is nothing');
  assert.equal(asks(scene(rail, { height: 2, x: 4 }), { column: 5, row: 2 }).kind, 'wall', 'a full wall further along the same step');
  assert.equal(asks(scene({ height: 1, interaction: 'door' }, { height: 2, x: 4 }), { column: 5, row: 2 }).kind, 'wall', 'a wall beyond a door: the wall is the question');
});

test('head room is a warning, never a stop', () => {
  const big = { ...hero, width: 2, height: 2 }, beam = scene({ base: 1.4, height: 3 });
  assert.equal(walks(beam, { from: big, to: { column: 3, row: 2 } }), true, 'a size 2 walker passes under a beam over its body');
  assert.ok(headRoomOnPath(beam, big, { column: 3, row: 2 }, onFloor(0), ground), 'and is warned');
  assert.equal(headRoomOnPath(beam, hero, over, onFloor(0), ground), null, 'a size 1 walker is not');
});

test('a wall is met by whoever stands on its own floor', () => {
  const balcony = scene({ height: 2, base: 4 });
  assert.equal(walks(balcony, { z: 4 }), false);
  assert.equal(walks(balcony, { z: 0 }), true, 'nothing to a walker on the ground under it');
  assert.equal(walks(scene({ height: 0.67, base: 4 }), { z: 4 }), true, 'a rail on the balcony is a plain step there');
});

test('a walk with corners is asked once, for the tallest climb on its way', () => {
  const model = scene({ height: 2, climbable: true }, { height: 2.6, climbable: true, x: 5 });
  const walk = { column: 6, row: 2, path: [{ column: 4, row: 2 }] };
  assert.equal(movementPathBlocked(model, hero, walk, onFloor(0), ground), true);
  assert.equal(movementPathBlocked(model, hero, walk, onFloor(0), ground, undefined, true), false);
  assert.ok(Math.abs(lowBarrierOnPath(model, hero, walk, onFloor(0), ground).rise - 2.6) < 1e-9);
  assert.ok(Math.abs(asks(model, walk).rise - 2.6) < 1e-9);
  assert.equal(lowBarrierOnPath(scene({ height: 2, climbable: true }, { height: 2, x: 5 }), hero, walk, onFloor(0), ground), null, 'a plain wall on a later leg: not a climb question');
  assert.equal(asks(scene({ height: 2, climbable: true }, { height: 2, x: 5 }), walk).kind, 'wall');
  assert.equal(lowBarrier(scene(rail), hero, over, onFloor(0), ground), null, 'a plain step needs no climb');
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
  assert.equal(properties({ height: 1.2 }).sight, 'block', 'a taller wall that says nothing blocks, as always (the step rule does not change sight)');
  assert.equal(properties({}).sight, 'block', 'and so does a wall with no height: it is two squares');
  assert.equal(restrictions({ height: 0.67 }).sight, 'pass');
  const viewer = { column: 0, row: 2, width: 1, height: 1 }, target = { x: 3.6, y: 2.5 };
  const sees = (wall) => makeSight({ viewer, viewerGround: 0, groundAt: () => 0, walls: scene(wall) })(target, 0.2);
  assert.equal(sees({ height: 0.67 }), true);
  assert.equal(sees({ height: 0.67, sight: 'block' }), false);
  assert.equal(sees({}), false);
});

test('the pop-ups are one short line: the fact and the choices', () => {
  const text = climbPromptText({ over: 2.5, tall: true, cost: 2, left: 4 });
  assert.equal(text.title, 'Climb over it?');
  assert.deepEqual(text.lines, ['Cost 2.']);
  assert.deepEqual(climbPromptText({ over: 2, cost: 3, left: 1, tall: true }).lines, ['Cost 3.', 'Only 1 movement left.']);
  assert.equal(climbPromptText({ over: 2, onto: true, cost: 1 }).title, 'Climb onto it?');
  assert.equal(climbPromptText({ squares: 3, cost: 6 }).title, 'Climb 3 squares?');
  assert.deepEqual(moveQuestionText({ kind: 'wall' }), { title: 'Wall in the way.', lines: [], answers: [['anyway', 'Move anyway'], ['cancel', 'Cancel']] });
  assert.deepEqual(moveQuestionText({ kind: 'door' }).answers.map(([key]) => key), ['open', 'anyway', 'cancel']);
  assert.deepEqual(moveQuestionText({ kind: 'door', locked: true }).answers.map(([key]) => key), ['anyway', 'cancel']);
  assert.equal(moveQuestionText({ kind: 'wall', names: ['Cal', 'Pippa'] }).title, 'Wall in the way (Cal, Pippa).');
  assert.deepEqual(moveQuestionText({ kind: 'reach' }).answers.map(([key]) => key), ['anyway', 'cancel']);
});

test('the server\'s refusals are known for what they are', () => {
  for (const words of ['Movement blocked by a wall or closed door/window.', 'Movement blocked by a closed door or window.', 'Movement needs a climb.']) assert.equal(isWallRefusal(words), true, words);
  assert.equal(refusalKind('Movement blocked by a closed door or window.'), 'door');
  assert.equal(refusalKind('Movement needs a climb.'), 'climb');
  assert.equal(refusalKind('Movement blocked by a wall or closed door/window.'), 'wall');
});

test('the board asks before it sends, for everyone, and the answers travel with each move', () => {
  const board = readFileSync(new URL('../board-interactions.js', import.meta.url), 'utf8');
  assert.match(board, /else if \(\(movementKind === 'walk' \|\| movementKind === 'shift'\) && typeof window\.wallPrototype\?\.question === 'function'\) \{/);
  assert.doesNotMatch(board, /moves\.length === 1 && !isGmUser\(\) && typeof window\.wallPrototype\?\.lowBarrier/, 'no longer one token only, and the Director is asked too');
  assert.match(board, /askMoveQuestion\(\{ kind: 'door', locked:/);
  assert.match(board, /askMoveQuestion\(\{ kind: 'wall', names:/);
  assert.match(board, /\.\.\.\(wallAnswers\.get\(move\.placementId\) \|\| \{\}\) \};/);
  assert.match(board, /presetAnswers: kind === 'climb' \? \{ climbLow: true \} : \{ moveAnyway: true \}/, 'a refusal the page did not foresee is asked, then sent again');
  const runtime = readFileSync(new URL('../../sync-v2/token-movement-runtime.js', import.meta.url), 'utf8');
  assert.match(runtime, /\.\.\.\(move\.climbLow === true \? \{climbLow:true\} : \{\}\),/);
  assert.match(runtime, /\.\.\.\(move\.moveAnyway === true \? \{moveAnyway:true\} : \{\}\),/);
  assert.match(runtime, /\.\.\.\(op\.moveAnyway === true \? \{moveAnyway:true\} : \{\}\),/, 'a group move carries each token\'s answers');
  const walls = readFileSync(new URL('../wall-prototype.js', import.meta.url), 'utf8');
  assert.match(walls, /question:\(from,to\)=>!context\|\|/);
  assert.match(walls, /forcedBlockedMove:\(from,to\)=>[^\n]*movementBlocked\(activeModel\(\),from,to,\(t,origin\)=>moverHeight\(origin,t,'forced'\),groundAt\)\)/);
});
