import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NODE_CLICK_PIXELS, NODE_CLICK_MS, rightPressAt, rightPressPulls, rightPressClicked } from '../right-press.mjs';

// Brandon, October 10, 2026: "Shift cannot be both to shift as a mechanic and to create a second node
// for movement. So lets program that to be a right click while holding your token, (quick right click)
// gives you a node at wherever it is, then a right click and drag does the normal pull the map to move
// it around. Make sure these two dont interfere with each other."

test('the two numbers: how far and how long a right press may be and still be a click', () => {
  assert.equal(NODE_CLICK_PIXELS, 6);
  assert.equal(NODE_CLICK_MS, 400);
});

test('a quick right click that stays put drops a node', () => {
  const press = rightPressAt(500, 300, 1000);
  assert.equal(rightPressPulls(press, 500, 300), false);
  assert.equal(rightPressClicked(press, 500, 300, 1120), true);
  // A hand is never quite still: a few pixels is still a click.
  assert.equal(rightPressClicked(press, 503, 304, 1200), true);
  assert.equal(rightPressClicked(press, 500, 306, 1400), true, 'right at both limits');
});

test('a right press that moves is a pull of the map and never a node', () => {
  const press = rightPressAt(500, 300, 1000);
  assert.equal(rightPressPulls(press, 507, 300), true);
  assert.equal(rightPressPulls(press, 495, 296), true, 'in any direction');
  assert.equal(rightPressClicked(press, 507, 300, 1050), false, 'however quick');
  assert.equal(rightPressClicked(press, 620, 410, 1900), false);
});

test('a right press held still and let go late is neither', () => {
  const press = rightPressAt(500, 300, 1000);
  assert.equal(rightPressPulls(press, 501, 300), false, 'the map has not moved');
  assert.equal(rightPressClicked(press, 501, 300, 1401), false, 'and no node is dropped');
});

test('with no press there is nothing to pull and nothing to click', () => {
  assert.equal(rightPressPulls(null, 10, 10), false);
  assert.equal(rightPressClicked(null, 10, 10, 5), false);
});

test('Shift drops no node while a token is held; the Measure tool\'s own ruler keeps it', () => {
  const ruler = readFileSync(new URL('../drag-ruler.js', import.meta.url), 'utf8');
  assert.match(ruler, /if \(event\.key === 'Shift' && !event\.repeat && state\.mode === 'pointer'\) \{\s*addMeasurementNode\(state\);/);
  assert.match(ruler, /export function addExternalMeasurementNode\(\)/);
  assert.doesNotMatch(ruler, /handleShiftKey/);
  // Shift is still the shift move.
  assert.match(ruler, /event\.ctrlKey \? 'forced' : event\.shiftKey \? 'shift' : 'walk'/);
});

test('the board asks these rules before it pulls the map or drops a node', () => {
  const board = readFileSync(new URL('../board-interactions.js', import.meta.url), 'utf8');
  // The node is dropped only by a click, and only while a token is being dragged.
  assert.match(board, /const clicked = rightPressClicked\(movementRightPress, event\.clientX, event\.clientY, performance\.now\(\)\);\s*movementRightPress = null;\s*if \(clicked && viewState\.dragState\) addExternalMeasurementNode\(\);/);
  // The map is not pulled until the press has moved past the slack.
  assert.match(board, /if \(!rightPressPulls\(movementRightPress, event\.clientX, event\.clientY\)\) return;\s*movementRightPress = null;\s*\}\s*startMovementPan\(event\);/);
  // The browser's own menu stays off the board.
  assert.match(board, /mapSurface\.addEventListener\('contextmenu', \(event\) => \{\s*event\.preventDefault\(\);/);
});
