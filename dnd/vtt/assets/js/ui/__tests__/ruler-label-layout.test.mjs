import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { placeTotalLabel, placeLegLabels, totalLabelSize, legLabelSize, rulerWording, legWording, fallSquares } from '../ruler-label-layout.mjs';
import { travelPath } from '../travel-height.mjs';
import { placeCornerControl } from '../terrain-zones.mjs';

const at = (column, row, grid = 50) => ({ mapX: column * grid + grid / 2, mapY: row * grid + grid / 2 });
const overlap = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
const leg = (from, to, squares, grid = 50) => ({ start: at(...from, grid), end: at(...to, grid), squares });

test('the total sits below the destination, clear of the token and its Stamina bar', () => {
  const end = at(10, 10), placed = placeTotalLabel({ end, previous: at(15, 10), gridSize: 50, mapHeight: 3000, lines: ['Move 5 · Cost 8'] });
  assert.equal(placed.side, 'below');
  assert.ok(placed.box.top > end.mapY + 25, 'the whole label is under the destination square');
  // The token fills its square and its Stamina bar rides just above it.
  const tokenAndBar = { left: end.mapX - 25, right: end.mapX + 25, top: end.mapY - 45, bottom: end.mapY + 25 };
  assert.ok(!overlap(placed.box, tokenAndBar));
});

test('a route that comes up from below gets its total above the Stamina bar, not along the route', () => {
  const end = at(10, 10), placed = placeTotalLabel({ end, previous: at(10, 15), gridSize: 50, mapHeight: 3000, lines: ['Move 5 · Cost 10'] });
  assert.equal(placed.side, 'above');
  assert.ok(placed.box.bottom < end.mapY - 50 * 0.75, 'the label ends above the Stamina bar, which rides three quarters of a square up');
  // One line only: still above, and the single line is the main label.
  assert.equal(placeTotalLabel({ end, previous: at(10, 15), gridSize: 50, mapHeight: 3000, lines: ['Move 5'] }).side, 'above');
  // A diagonal that is mostly sideways still reads better below.
  assert.equal(placeTotalLabel({ end, previous: at(20, 12), gridSize: 50, mapHeight: 3000, lines: ['Move 10'] }).side, 'below');
});

test('the total stays on the map at the top and bottom edges', () => {
  const bottom = placeTotalLabel({ end: at(10, 59), previous: at(15, 59), gridSize: 50, mapHeight: 3000, lines: ['Move 5 · Cost 8'] });
  assert.equal(bottom.side, 'above', 'no room under the last row');
  const top = placeTotalLabel({ end: at(10, 0), previous: at(10, 5), gridSize: 50, mapHeight: 3000, lines: ['Move 5 · Cost 8'] });
  assert.equal(top.side, 'below', 'no room over the first row, even coming from below');
});

test('labels grow with the grid so they are readable on maps drawn with large squares', () => {
  assert.equal(totalLabelSize(50), 22);
  assert.equal(legLabelSize(50), 18);
  assert.ok(totalLabelSize(200) >= 80 && legLabelSize(200) >= 70, 'a 200 pixel square gets a label about 0.4 squares tall');
  const small = placeTotalLabel({ end: at(5, 5, 50), gridSize: 50, lines: ['Move 5'] });
  const large = placeTotalLabel({ end: at(5, 5, 200), gridSize: 200, lines: ['Move 5'] });
  assert.ok(large.fontSize > small.fontSize * 3);
  assert.ok(large.box.right - large.box.left > (small.box.right - small.box.left) * 3);
});

test('one leg needs no leg label; several legs are labelled beside the route, never on it', () => {
  assert.deepEqual(placeLegLabels([leg([7, 2], [2, 2], 5)], null, 50), []);
  const legs = [leg([7, 5], [7, 2], 3), leg([7, 2], [3, 2], 4)];
  const [vertical, horizontal] = placeLegLabels(legs, null, 50);
  assert.equal(vertical.text, '3 squares');
  assert.equal(vertical.anchor, 'start');
  assert.ok(vertical.left > legs[0].start.mapX + 12, 'the vertical leg is labelled to its right, off the line');
  assert.equal(horizontal.text, '4 squares');
  assert.ok(horizontal.bottom < legs[1].start.mapY - 9, 'the horizontal leg is labelled above the line and its square numbers');
  assert.equal(placeLegLabels([leg([0, 0], [1, 0], 1), leg([1, 0], [1, 4], 4)], null, 50)[0].text, '1 square');
  const [diagonal] = placeLegLabels([leg([2, 2], [6, 6], 4), leg([6, 6], [12, 6], 6)], null, 50);
  const mid = at(4, 4);
  assert.ok(diagonal.left > mid.mapX && diagonal.bottom < mid.mapY + 12, 'a falling diagonal is labelled up and to the right of its middle');
});

test('a leg label that would touch the total is left out, and no two labels collide', () => {
  // East along a row, up two, then back west: the route ends two rows above the middle of its
  // first leg, so that leg's label would land on the total under the destination.
  const legs = [leg([2, 5], [8, 5], 6), leg([8, 5], [8, 3], 2), leg([8, 3], [5, 3], 3)];
  const total = placeTotalLabel({ end: legs[2].end, previous: legs[2].start, gridSize: 50, mapHeight: 3000, lines: ['Move 7 · Cost 10'] });
  const labels = placeLegLabels(legs, total.box, 50);
  assert.deepEqual(labels.map((label) => label.text), ['2 squares', '3 squares'], 'the first leg lost its label to the total');
  assert.equal(placeLegLabels(legs, null, 50).length, 3, 'with no total in the way every leg is labelled');
  for (const label of labels) assert.ok(!overlap(label, total.box), `${label.text} is clear of the total`);
  for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) assert.ok(!overlap(labels[i], labels[j]));
  // The reported Dead Root case: five squares straight north into the canal. One label, above the bar.
  const north = [leg([30, 20], [30, 15], 5, 150)];
  assert.deepEqual(placeLegLabels(north, null, 150), []);
  assert.equal(placeTotalLabel({ end: north[0].end, previous: north[0].start, gridSize: 150, mapHeight: 6000, lines: ['Move 5 · Cost 10'] }).side, 'above');
});

test('ruler wording: "Move 5", and "Move 5 · Cost 8" only when the cost differs', () => {
  assert.deepEqual(rulerWording({ movementLabel: 'Move', squares: 5, cost: 8 }), { distance: 'Move 5', cost: 'Cost 8', fall: null });
  assert.deepEqual(rulerWording({ movementLabel: 'Move', squares: 5, cost: 5 }), { distance: 'Move 5', cost: null, fall: null });
  assert.deepEqual(rulerWording({ movementLabel: 'Move', squares: 1, cost: 1 }), { distance: 'Move 1', cost: null, fall: null });
  assert.equal(rulerWording({ movementLabel: 'Shift', squares: 4, cost: 7 }).distance, 'Shift 4');
  assert.equal(rulerWording({ movementLabel: 'Forced movement', squares: 3, cost: 3 }).distance, 'Forced movement 3');
  // The plain Measure tool has no movement word, so it still says what the number is.
  assert.deepEqual(rulerWording({ squares: 5, cost: 5 }), { distance: '5 squares', cost: null, fall: null });
  assert.equal(rulerWording({ squares: 1 }).distance, '1 square');
  assert.equal(legWording(1), '1 square');
  assert.equal(legWording(4), '4 squares');
});

// "Push and fall should be separate." A creature pushed 2 squares off an island 6 squares up
// reads "Forced movement 2 · Fall 6", not 8.
test('a forced move says the squares moved and, apart from them, the fall', () => {
  assert.deepEqual(rulerWording({ movementLabel: 'Forced movement', squares: 2, cost: 2, fall: 6 }), { distance: 'Forced movement 2', cost: null, fall: 'Fall 6' });
  assert.equal(rulerWording({ movementLabel: 'Forced movement', squares: 2, cost: 2, fall: 0 }).fall, null, 'no drop, no Fall part');
  assert.equal(fallSquares(6, 0), 6);
  assert.equal(fallSquares(18, 12), 6);
  assert.equal(fallSquares(6, 5.5), 0, 'under one square is not a fall');
  assert.equal(fallSquares(6, 5), 1);
  assert.equal(fallSquares(6, 4.4), 2, 'to the nearest whole square');
  assert.equal(fallSquares(3, 6), 0, 'landing higher is not a fall');
  assert.equal(fallSquares(undefined, 0), 0);
  assert.equal(fallSquares(6, null), 6);
});

test('the fall is from the height the creature travels at to where it lands', () => {
  // An island 6 high over columns 20 to 29, a ledge 3 high over columns 32 to 35, flat ground elsewhere.
  const footing = (p) => { const x = p.column + 0.5; return x >= 20 && x <= 30 ? 6 : x >= 32 && x <= 36 ? 3 : 0; };
  const hero = { column: 28, row: 12, width: 1, height: 1 }, path = travelPath(hero, footing, { kind: 'forced' });
  const fall = (column) => fallSquares(path.heightAt({ ...hero, column }), footing({ ...hero, column }));
  assert.equal(fall(29), 0, 'still on the island');
  assert.equal(fall(30), 6, 'one square off the edge: over the crater floor');
  assert.equal(fall(31), 6);
  assert.equal(fall(33), 3, 'over the ledge: it lands on the ledge');
});

test('the ruler counts a forced move flat and asks the board for the fall', () => {
  const ruler = readFileSync(new URL('../drag-ruler.js', import.meta.url), 'utf8');
  assert.match(ruler, /const squares = forced \? segment\.squares : measured \? measured\.distance/);
  assert.match(ruler, /cost: forced \? squares : measured \? measured\.cost : squares/);
  assert.match(ruler, /const fall = forced && segments\.length && zones\?\.forcedFall \? zones\.forcedFall\(/);
  assert.match(ruler, /if \(wording\.fall\) readout\.push\(wording\.fall\);/);
  const zones = readFileSync(new URL('../terrain-zones-overlay.js', import.meta.url), 'utf8');
  assert.match(zones, /const travelling = walls\.moverHeight\(from, at\(end\), 'forced'\);/);
  assert.match(zones, /return fallSquares\(travelling, caught === null \? ground : Math\.max\(ground, caught\)\);/);
  assert.match(zones, /routeCost,\s+forcedFall,/);
});

// ---- the corner Zones control ------------------------------------------------
const viewport = { width: 1600, height: 900 }, frame = { left: 11, top: 143, right: 1589, bottom: 887 }, size = { width: 109, height: 20 };
const panel = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
/** A hit test over fixed panels: the first panel the control would lie on. */
const blockers = (...panels) => (left, top) => panels.find((p) => overlap({ left, right: left + size.width, top, bottom: top + size.height }, p)) ?? null;

test('the corner control sits at the bottom left of the board when nothing covers it', () => {
  assert.deepEqual(placeCornerControl({ frame, viewport, size }), { left: 17, bottom: 19 });
  // A panel elsewhere (the chat drawer on the right, a short hero panel on the left) does not move it.
  assert.deepEqual(placeCornerControl({ frame, viewport, size, blockerAt: blockers(panel(1312, 20, 288, 860), panel(0, 159, 380, 466)) }), { left: 17, bottom: 19 });
});

test('the corner control steps to the right of a slide-out that covers the corner', () => {
  const settings = panel(0, 18, 380, 870);
  assert.deepEqual(placeCornerControl({ frame, viewport, size, blockerAt: blockers(settings) }), { left: 386, bottom: 19 });
  // Stat block on the left and the ability tray along the bottom: it lands in the gap between them.
  const tray = panel(510, 844, 1080, 40);
  const place = placeCornerControl({ frame, viewport, size, blockerAt: blockers(settings, tray) });
  assert.deepEqual(place, { left: 386, bottom: 19 });
  assert.ok(place.left + size.width < tray.left);
  // Two panels side by side: it clears both.
  assert.equal(placeCornerControl({ frame, viewport, size, blockerAt: blockers(settings, panel(380, 600, 260, 300)) }).left, 646);
});

test('the corner control rises above a bar that runs the whole width of the bottom', () => {
  const bar = panel(0, 840, 1600, 60);
  const place = placeCornerControl({ frame, viewport, size, blockerAt: blockers(bar) });
  assert.equal(place.left, 17);
  assert.ok(viewport.height - place.bottom <= bar.top, 'its lower edge is above the bar');
});

test('with no free place the corner control waits out of sight rather than sit on a panel', () => {
  // A full-screen layer such as a modal backdrop.
  assert.equal(placeCornerControl({ frame, viewport, size, blockerAt: blockers(panel(0, 0, 1600, 900)) }), null);
  // A narrow window that the slide-out nearly fills: no room beside it or above it.
  const narrow = { width: 700, height: 800 };
  assert.equal(placeCornerControl({ frame: { left: 7, top: 20, right: 693, bottom: 793 }, viewport: narrow, size, blockerAt: blockers(panel(0, 18, 640, 782)) }), null);
  assert.equal(placeCornerControl({ frame: { left: 7, top: 20, right: 693, bottom: 793 }, viewport: narrow, size, blockerAt: blockers(panel(0, 18, 600, 782)) }), null);
  // The same narrow window with the panel closed.
  assert.deepEqual(placeCornerControl({ frame: { left: 7, top: 20, right: 693, bottom: 793 }, viewport: narrow, size }), { left: 13, bottom: 13 });
  // It never ends up outside the window.
  const place = placeCornerControl({ frame, viewport, size, blockerAt: blockers(panel(0, 18, 1400, 870)) });
  assert.ok(place === null || (place.left + size.width <= viewport.width && viewport.height - place.bottom - size.height >= 0));
});
