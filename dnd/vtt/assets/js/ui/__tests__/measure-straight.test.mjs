import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { heightNote, squaresAcross, straightLeg, straightWords } from '../measure-straight.mjs';

// Build 545, Brandon (October 2026): the Measure tool on the 3D board measures straight lines in the air, Draw
// Steel's way ("4 over and 3 up would be a movement of 4"); Space held shows the walking route; a fall is "Fall x";
// a note beside the pointer tells the height of what it points at; tokens are measuring points; M turns it on.

const at = (column, row, z, more = {}) => ({ column, row, z, ...more });

test('a straight line is whichever is more, across or up and down', () => {
  assert.deepEqual(straightLeg(at(0, 0, 0), at(4, 0, 3)), { across: 4, rise: 3, distance: 4 });
  assert.deepEqual(straightLeg(at(0, 0, 0), at(3, 3, 0)), { across: 3, rise: 0, distance: 3 }, 'a diagonal step counts 1');
  assert.deepEqual(straightLeg(at(0, 0, 6), at(1, 0, 0)), { across: 1, rise: -6, distance: 6 });
  assert.equal(squaresAcross(at(0, 0, 0, { width: 2, height: 2 }), at(2, 1, 0)), 1, 'a big token counts from its nearest square: next to it is 1');
  assert.equal(squaresAcross(at(0, 0, 0, { width: 2, height: 2 }), at(5, 0, 0, { width: 3, height: 3 })), 4);
});

test('the words: squares, then across and up, or a fall to the ground, or down to a token', () => {
  assert.equal(straightWords([at(0, 0, 0), at(4, 0, 3)]).text, '4 squares · 4 across · 3 up');
  assert.equal(straightWords([at(0, 0, 5), at(1, 0, 0)]).text, '5 squares · 1 across · Fall 5');
  assert.equal(straightWords([at(0, 0, 5), at(1, 0, 0, { tokenId: 'goblin' })]).text, '5 squares · 1 across · 5 down');
  assert.equal(straightWords([at(0, 0, 0), at(1, 0, 0)]).text, '1 square', 'level: the distance alone');
  assert.equal(straightWords([at(0, 0, 0), at(2, 0, 0), at(2, 3, 1)]).text, '5 squares · 1 up', 'with a corner: the total and start to end');
  assert.equal(straightWords([at(0, 0, 0)]), null);
});

test('the note beside the pointer', () => {
  assert.equal(heightNote({ ground: 3.6 }), 'Ground 4');
  assert.equal(heightNote({ token: { name: 'Indigo', z: 7, ground: 4, flying: true } }), 'Indigo · 7 high (3 above ground)');
  assert.equal(heightNote({ token: { name: 'Orchard Tender', z: 20, ground: 1.7, flying: false } }), 'Orchard Tender · 20 high', 'standing on a floating plate is not above the ground');
  assert.equal(heightNote(null), '');
});

const ruler = readFileSync(new URL('../drag-ruler.js', import.meta.url), 'utf8');
const board = readFileSync(new URL('../board-interactions.js', import.meta.url), 'utf8');

test('the Measure tool: M, click then click, tokens as points, Space for the walking route', () => {
  assert.match(ruler, /if \(\(event\.key === 'm' \|\| event\.key === 'M'\) && !event\.repeat && !event\.ctrlKey && !event\.metaKey && !event\.altKey/, 'M, not while typing nor with Ctrl, Alt or Cmd');
  assert.match(ruler, /if \(snapPoint && state\.pressSquare && pointsShareCell\(snapPoint, state\.pressSquare\)\) \{\s*state\.following = true;\s*return;\s*\}/, 'let go where pressed: the line follows the pointer');
  assert.match(ruler, /if \(state\.measuring && state\.mode === 'pointer' && state\.following\) \{\s*commitHoverPoint\(state, snapPoint\);\s*endMeasurement\(state\);/, 'the next click ends it there');
  assert.match(ruler, /boardCanvas\.addEventListener\('pointerdown', \(event\) => \{\s*if \(!state\.active \|\| event\.button !== 0 \|\| state\.mode === 'external' \|\| !window\.vtt3d\?\.active\) return;\s*const snapPoint = tokenUnderPointer\(state, event\);\s*if \(!snapPoint\) return;\s*event\.stopImmediatePropagation\(\);/, 'a token press is a measuring point, not a grab');
  assert.match(ruler, /if \(state\.mode !== 'external' && window\.vtt3dActive && !teleportSpaceHeld && drawStraight\(state\)\) return;/, 'straight unless Space is held');
  assert.match(ruler, /else if \(state\.mode !== 'external' && state\.points\.length && window\.vtt3dActive && state\.walkShown !== teleportSpaceHeld\) updateOverlay\(state\);/, 'pressing or letting go of Space redraws it');
  assert.match(ruler, /if \(state\.measuring && state\.mode === 'pointer'\) clearMeasurement\(state\);\s*else toggleMeasureMode\(state, false\);/, 'Escape drops a measurement first, then puts the tool away');
  assert.doesNotMatch(ruler.slice(ruler.indexOf('function drawStraight('), ruler.indexOf('function ensureRulerDetail(')), /sync|publish|boardState/i, 'only the one measuring sees it');
  assert.match(board, /measurePoint\(id\) \{\s*const p = coordinatePlacement\(id\);\s*if \(!p\) return null;/, 'a token this user may not see is no measuring point');
});
