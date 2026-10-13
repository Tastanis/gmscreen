import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderDrawings } from '../drawing-tool.js';
import { canEditDrawing } from '../drawing-edits.js';
import { floorDrawn, pickView } from '../pointer-pick.mjs';

// Brandon, October 12, 2026: "Drawings need to be drawn on the level i click on or am looking at."
//
// A stroke was given the floor its page was on, and a page showed only the strokes given its own floor. The
// Director, looking down from the ground floor, drew on a raised platform: the stroke was the ground floor's and
// the player standing on that platform never saw it. On a map with built floors a stroke now keeps the height of
// the floor under the pointer where it began, and is shown to whoever is shown that floor.

const page = (levelId, drawings) => {
  const drawn = [];
  globalThis.document = { createElementNS: () => ({ dataset: {}, attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } }) };
  const state = { levelId, drawings, cursorIndicator: null, drawingLayer: { childNodes: [], removeChild() {}, appendChild(path) { drawn.push(path.dataset.drawingId); } } };
  renderDrawings(state);
  return drawn;
};
const stroke = (id, extra = {}) => ({ id, authorId: 'gm', levelId: 'level-0', points: [{ x: 0, y: 0 }, { x: 10, y: 10 }], ...extra });
// The page's own test for which floors it is shown, as terrain-prototype.js gives it: pointer-pick's floorDrawn.
const looking = (view) => { globalThis.terrainPrototype = { heightShown: (z) => z <= 0 || !view || floorDrawn(z, view) }; };

test('the Director\'s case: drawn on a raised platform from a page on the ground floor', () => {
  const strokes = [stroke('on-the-platform', { z: 5 }), stroke('on-the-ground', { z: 0 })];
  // A hero standing on the platform (5 squares up, on the floor called "upper"): sees both.
  looking(pickView({ token: { column: 3, row: 3, width: 1, height: 1 }, ground: 5 }));
  assert.deepEqual(page('upper', strokes), ['on-the-platform', 'on-the-ground']);
  // A hero on the ground is not shown the platform's top, so not what was drawn on it.
  looking(pickView({ token: { column: 3, row: 3, width: 1, height: 1 }, ground: 0 }));
  assert.deepEqual(page('level-0', strokes), ['on-the-ground']);
  // The Director looking down from 5 up sees both; from the ground, the ground's.
  looking(pickView({ gmHeight: 5 }));
  assert.deepEqual(page('level-0', strokes), ['on-the-platform', 'on-the-ground']);
  looking(pickView({ gmHeight: 0 }));
  assert.deepEqual(page('level-0', strokes), ['on-the-ground']);
});

test('a stroke with no height, or a map with no built floors, keeps the floor it was given', () => {
  const strokes = [stroke('old-ground'), stroke('old-upper', { levelId: 'upper' }), stroke('tall', { z: 5, levelId: 'upper' })];
  looking(pickView({ gmHeight: 9 }));
  assert.deepEqual(page('level-0', strokes), ['old-ground', 'tall'], 'an older stroke is still its floor\'s');
  globalThis.terrainPrototype = { heightShown: () => null };            // no built floors on this map
  assert.deepEqual(page('upper', strokes), ['old-upper', 'tall']);
  delete globalThis.terrainPrototype;                                    // no terrain at all
  assert.deepEqual(page('level-0', strokes), ['old-ground']);
});

test('erasing and clearing reach the strokes shown on the page, and still only one\'s own', () => {
  const mine = stroke('mine', { authorId: 'cal', levelId: 'level-0', z: 5 });
  assert.equal(canEditDrawing(mine, { userId: 'cal', levelId: 'upper', shown: true }), true, 'shown here, though given another floor');
  assert.equal(canEditDrawing(mine, { userId: 'cal', levelId: 'level-0', shown: false }), false, 'not shown here, though given this floor');
  assert.equal(canEditDrawing(mine, { userId: 'sharon', levelId: 'upper', shown: true }), false);
  assert.equal(canEditDrawing(mine, { userId: 'gm', isGM: true, shown: true }), true);
  assert.equal(canEditDrawing(mine, { userId: 'cal', levelId: 'level-0', shown: null }), true, 'where height does not decide, the floor does');
});

test('a stroke takes its height where it begins, keeps it through the eraser, and the layer follows the viewer', () => {
  const tool = readFileSync(new URL('../drawing-tool.js', import.meta.url), 'utf8');
  assert.match(tool, /state\.currentHeight = floorHeightUnder\(point\);/);
  assert.match(tool, /\.\.\.\(state\.currentHeight !== null \? \{ z: state\.currentHeight \} : \{\}\),/);
  assert.equal(tool.match(/\.\.\.\(Number\.isFinite\(drawing\.z\) \? \{ z: drawing\.z \} : \{\}\),/g)?.length, 2, 'both pieces an erased stroke can leave');
  assert.match(tool, /if \(shownKey\(state\) !== state\.shownKey\) renderDrawings\(state\);/, 'redrawn when who is shown what changes');
  assert.match(tool, /if \(state\.drawing \|\| state\.erasing \|\| !state\.drawings\.some\(\(drawing\) => Number\.isFinite\(drawing\?\.z\)\)\) return;/, 'and looked at only while a stroke has a height');
  const terrain = readFileSync(new URL('../terrain-prototype.js', import.meta.url), 'utf8');
  assert.match(terrain, /return hit\?\.floor\?Number\(hit\.height\)\|\|0:0;/, 'a built floor gives its height; the ground and a stair give 0');
  assert.match(terrain, /return height<=0\|\|!view\|\|floorDrawn\(height,view\);/, 'the ground is always shown; a floor by the picture\'s own test');
  assert.match(terrain, /window\.terrainPrototype=\{floorUnder,heightShown,/);
});
