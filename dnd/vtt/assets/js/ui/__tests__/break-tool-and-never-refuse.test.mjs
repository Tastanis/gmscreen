import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { breakableThings, thingAt, toggleBreak } from '../break-tool.mjs';
import { moveQuestionText } from '../move-question.js';

// Brandon, November 10, 2026, two things:
// 1. "Dont ever ... tell me i cant go somewhere ... do not stop the gm from making this move ever! i need to se the
//    monster there, so let me set it there." A walk that does not reach the picked spot is put there as a teleport:
//    the Director is not asked, a player is asked "Put it there / Cancel".
// 2. "in the map edits tools, i need a new button ... that allows me to break or unbreak a square. So i can see
//    breakable squares outlined, and i can click to break one or unbreak one."

const ring = (id, x, y, material, extra = {}) => {
  const nodes = [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]].map(([a, b], i) => ({ id: `${id}:p${i}`, x: a, y: b }));
  const segments = nodes.map((n, i) => ({ id: `${id}:${i}`, a: n.id, b: nodes[(i + 1) % 4].id, material, object: id, ...extra }));
  return { nodes, segments };
};

test('breakable things: an object is one thing, a lone wall piece another; walls with no material are not listed', () => {
  const crate = ring('crate', 4, 4, 'wood'), rock = ring('rock', 8, 8, undefined);
  const model = { nodes: [...crate.nodes, ...rock.nodes, { id: 'w1', x: 0, y: 0 }, { id: 'w2', x: 2, y: 0 }],
    segments: [...crate.segments, ...rock.segments.map(({ material, ...e }) => e), { id: 'wall-a', a: 'w1', b: 'w2', material: 'stone' }] };
  const things = breakableThings(model);
  assert.deepEqual(things.map((t) => t.key).sort(), ['object:crate', 'wall:wall-a']);
  const crateThing = things.find((t) => t.key === 'object:crate');
  assert.equal(crateThing.edges.length, 4); assert.equal(crateThing.closed, true); assert.equal(crateThing.broken, false);
  assert.equal(thingAt(things, { x: 4.5, y: 4.5 })?.key, 'object:crate', 'a click inside the crate');
  assert.equal(thingAt(things, { x: 1, y: 0.2 })?.key, 'wall:wall-a', 'a click by the wall');
  assert.equal(thingAt(things, { x: 20, y: 20 }), null, 'nothing there');
});

test('a click breaks a standing thing whole and mends a broken one', () => {
  const crate = ring('crate', 4, 4, 'wood'), model = { nodes: crate.nodes, segments: crate.segments };
  assert.equal(toggleBreak(model, breakableThings(model)[0]), true);
  assert.ok(model.segments.every((e) => e.broken === true));
  assert.equal(toggleBreak(model, breakableThings(model)[0]), false);
  assert.ok(model.segments.every((e) => !('broken' in e)));
  model.segments[0].broken = true; // one piece broken by a push: the click breaks the rest
  assert.equal(toggleBreak(model, breakableThings(model)[0]), true);
  assert.ok(model.segments.every((e) => e.broken === true));
});

test('the Break button is in the Edits panel, for the Director, and draws in 2D and 3D', () => {
  const walls = readFileSync(new URL('../wall-prototype.js', import.meta.url), 'utf8');
  assert.match(walls, /breakButton\.dataset\.action='map-break'/);
  assert.match(walls, /board3d\(\)\?\.setOverlay\?\.\('break',list\);/);
  assert.match(walls, /if\(!breaking\|\|!context\?\.isGM\|\|storedError\|\|event\.button!==0\)return;consume\(event\);/);
  assert.match(walls, /toggleBreak\(model,thing\);change\(before\);/, 'saved like any wall edit, so Undo takes it back');
  assert.match(walls, /editor\.portals\(\);drawBreak\(\);/);
  const panel = readFileSync(new URL('../edit-tools.js', import.meta.url), 'utf8');
  assert.match(panel, /const breakTool=\$\('\[data-action="map-break"\]'\);if\(breakTool\)\{breakTool\.hidden=false;tools\.append\(breakTool\);/);
});

test('a walk that does not get there is never refused: the Director\'s token is put there; a player is asked', () => {
  assert.deepEqual(moveQuestionText({ kind: 'place' }), { title: "Can't walk there.", lines: [], answers: [['place', 'Put it there'], ['cancel', 'Cancel']] });
  const board = readFileSync(new URL('../board-interactions.js', import.meta.url), 'utf8');
  assert.doesNotMatch(board, /const reason='The walking route does not reach the picked surface\. Follow its stairs or vine, or choose teleport\.';/);
  assert.match(board, /if\(!isGmUser\(\)\)\{[\s\S]{0,300}askMoveQuestion\(\{kind:'place'\},\{anchor\}\);/);
  assert.match(board, /movementKind='teleport';waypoints=\[\];ruler\.splice\(1,ruler\.length-2\);/);
  assert.match(board, /blocked=isGmUser\(\)\?'Can’t walk there: let go and it is put there\.'/);
});
