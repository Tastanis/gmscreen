import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MOVEMENT_RULES } from '../movement-rules.mjs';
import { lowBoxes, withLowBoxes, OBJECT_WALL, objectRing, BOX_HEIGHT } from '../low-boxes.mjs';
import { liveWalls, LOW_BARRIER, BOX_FOOT, BODY } from '../wall-properties.mjs';
import { BOX_REACH, PLATE_REACH, BOX_FOOT as FLOOR_BOX_FOOT, CLIMB_FOOT } from '../floor-support.js';

// Labelled maps (Brandon, November 8, 2026). The server builds an object's walls from its one record
// (MapLabels.php); the browser stands creatures on objects marked standOn at their own outline, and never guesses a
// box from four walls on a labelled map. The server's side is in labelled-maps.test.php.

// The walls the server builds for an object (MapLabels::expand), written out here.
function built(objects, extra = {}) {
  const nodes = [], segments = [];
  for (const object of objects) {
    const ring = objectRing(object.points);
    ring.forEach((p, i) => nodes.push({ id: `${OBJECT_WALL}${object.id}:p${i}`, x: p.x, y: p.y }));
    ring.forEach((p, i) => segments.push({ id: `${OBJECT_WALL}${object.id}:${i}`, a: `${OBJECT_WALL}${object.id}:p${i}`, b: `${OBJECT_WALL}${object.id}:p${(i + 1) % ring.length}`,
      baseMode: 'fixed', base: object.base ?? 0, height: object.top - (object.base ?? 0), topMode: 'follow', sight: 'pass', movement: 'block', object: object.id, climbable: object.climbable === true }));
  }
  return { version: 1, labels: 1, nodes, segments, roofs: [], objects, ...extra };
}
const square = (x, y, size = 1) => [{ x, y }, { x: x + size, y }, { x: x + size, y: y + size }, { x, y: y + size }];

test('the rules table is the one the server reads', () => {
  const source = readFileSync(new URL('../movement-rules.mjs', import.meta.url), 'utf8');
  const json = JSON.parse(source.slice(source.indexOf('/*rules*/') + 9, source.indexOf('/*end*/')));
  assert.deepEqual(json, MOVEMENT_RULES);
  assert.equal(MOVEMENT_RULES.stepUp, 1.5);
  assert.equal(MOVEMENT_RULES.climbGrade, 2);
  assert.equal(MOVEMENT_RULES.detourLimit, 2);
  assert.equal(MOVEMENT_RULES.cost.enemy, 1);
  // The numbers the rules still use by name are the table's rows.
  for (const [value, row] of [[LOW_BARRIER, 'stepUp'], [BOX_REACH, 'stepUp'], [BOX_HEIGHT, 'stepUp'], [PLATE_REACH, 'deckSnap'], [BOX_FOOT, 'boxFoot'], [FLOOR_BOX_FOOT, 'boxFoot'], [BODY, 'bodyHeight'], [CLIMB_FOOT, 'bodyHeight']]) assert.equal(value, MOVEMENT_RULES[row], row);
});

test('only objects marked standOn are stood on, at their own outline', () => {
  const model = built([
    { id: 'crate', points: square(5, 2), top: 1, standOn: true, climbable: true, levelId: 'level-0' },
    { id: 'leg', points: [{ x: 8, y: 2 }, { x: 10, y: 2 }, { x: 9, y: 4 }], top: 6, standOn: false },
    { id: 'step', points: [{ x: 1, y: 1 }, { x: 3, y: 1 }, { x: 2, y: 3 }], base: 0.5, top: 2, standOn: true, levelId: 'balcony' },
  ]);
  const boxes = lowBoxes(model);
  assert.deepEqual(boxes.map((box) => box.id), ['box-top:obj:crate', 'box-top:obj:step']);
  const derived = withLowBoxes(model), tops = derived.roofs.filter((roof) => roof.boxTop);
  assert.equal(tops[1].points.length, 3, 'any outline can be stood on');
  assert.equal(tops[1].levelId, 'balcony', 'on the floor the object says');
  assert.equal(tops[1].base, 0.5);
  assert.equal(tops[0].height, 1);
  assert.equal(tops[0].climbable, true);
  assert.ok(derived.segments.filter((edge) => edge.object === 'crate').every((edge) => edge.boxWall === true));
  assert.ok(!derived.segments.some((edge) => edge.object === 'leg' && edge.boxWall));
});

test('a broken object is not stood on', () => {
  const model = built([{ id: 'crate', points: square(5, 2), top: 1, standOn: true }]);
  model.segments[1] = { ...model.segments[1], broken: true, material: 'wood' };
  assert.deepEqual(lowBoxes(liveWalls(model)), []);
});

test('on a labelled map four walls in a square are not guessed to be a box', () => {
  const guess = { version: 1, labels: 1, nodes: [{ id: 'n1', x: 1, y: 1 }, { id: 'n2', x: 2, y: 1 }, { id: 'n3', x: 2, y: 2 }, { id: 'n4', x: 1, y: 2 }],
    segments: [0, 1, 2, 3].map((i) => ({ id: `s${i}`, a: `n${i + 1}`, b: `n${(i + 1) % 4 + 1}`, baseMode: 'fixed', base: 0, height: 1 })) };
  assert.deepEqual(lowBoxes(guess), []);
  assert.equal(lowBoxes({ ...guess, labels: undefined }).length, 1, 'an old map keeps the guess');
});
