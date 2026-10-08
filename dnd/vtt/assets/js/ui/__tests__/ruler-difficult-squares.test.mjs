import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { summarizeRoute } from '../terrain-zones.mjs';
import { routeSteps } from '../terrain-math.mjs';

// The red stretch on the ruler lies over the difficult squares themselves:
// it starts at the edge the route enters by and stops at the edge it leaves by.
const dom = new JSDOM(`<div id="vtt-distance-ruler" hidden><span class="vtt-board__ruler-value"></span></div>
 <button data-action="measure-distance"></button>
 <div id="vtt-map-surface"><div id="vtt-map-transform"><div id="vtt-grid-overlay"></div></div></div>`);
globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.getComputedStyle = dom.window.getComputedStyle;

// Row 3 on a flat map: columns 4 and 5 are blood (x2), column 8 is deep mud (x4).
const multiplier = (column, row) => (row === 3 && (column === 4 || column === 5) ? 2 : row === 3 && column === 8 ? 4 : 1);
const walk = (a, b) => routeSteps(a, b, () => 0, multiplier);
window.terrainZones = { routeCost: (points) => summarizeRoute(points, walk) };

const ruler = await import('../drag-ruler.js');
ruler.mountDragRuler();
const GRID = 64;
const point = (column, row) => ({ column, row, mapX: (column + 0.5) * GRID, mapY: (row + 0.5) * GRID });
const red = () => [...document.querySelectorAll('.vtt-difficult-step')].map((path) => path.getAttribute('d'));
const marks = () => [...document.querySelectorAll('.vtt-difficult-step__label')].map((label) => label.textContent);

test('the route summary says which square is walked after each difficult one', () => {
  const summary = summarizeRoute([{ column: 2, row: 3 }, { column: 5, row: 3 }, { column: 7, row: 3 }], walk);
  assert.deepEqual(summary.difficult.map((step) => [step.column, step.from.column, step.next?.column]), [[4, 3, 5], [5, 4, 6]], 'the square after a waypoint comes from the next leg');
  const stops = summarizeRoute([{ column: 2, row: 3 }, { column: 5, row: 3 }], walk);
  assert.equal(stops.difficult[1].next, undefined, 'a route that ends in the blood has no square after it');
});

test('red starts at the edge of the blood and stops at its far edge', () => {
  assert.ok(ruler.beginExternalMeasurement(point(2, 3), { allowInactive: true }));
  ruler.updateExternalMeasurement(point(7, 3));
  // Column 4 spans x 256 to 320 and column 5 spans x 320 to 384; the row's middle is y 224.
  assert.deepEqual(red(), ['M 256 224 L 288 224 L 320 224', 'M 320 224 L 352 224 L 384 224']);
  assert.deepEqual(marks(), ['×2', '×2']);
});

test('a route that ends in difficult terrain is red from the edge to the token', () => {
  ruler.updateExternalMeasurement(point(8, 3));
  assert.equal(red().at(-1), 'M 512 224 L 544 224', 'the mud square: its near edge to its middle');
  assert.deepEqual(marks(), ['×2', '×2', '×4']);
});

test('a diagonal step is split at the shared corner', () => {
  ruler.updateExternalMeasurement(point(5, 4));
  // (2,3) -> (3,4) -> (4,4) -> (5,4): no difficult square on row 4.
  assert.deepEqual(red(), []);
  ruler.updateExternalMeasurement(point(4, 1));
  // (2,3) -> (3,2) -> (4,1): still none.
  assert.deepEqual(red(), []);
  ruler.cancelExternalMeasurement();
  ruler.beginExternalMeasurement(point(3, 2), { allowInactive: true });
  ruler.updateExternalMeasurement(point(5, 4));
  // (3,2) -> (4,3) blood -> (5,4): in by the top-left corner, out by the bottom-right corner.
  assert.deepEqual(red(), ['M 256 192 L 288 224 L 320 256']);
  ruler.cancelExternalMeasurement();
});

test('ordinary ground has no red at all', () => {
  ruler.beginExternalMeasurement(point(0, 0), { allowInactive: true });
  ruler.updateExternalMeasurement(point(3, 0));
  assert.deepEqual(red(), []);
  assert.equal(document.querySelector('[data-difficult-route]'), null);
  ruler.cancelExternalMeasurement();
});

test('the ruler on flat ground is black, so red only ever means difficult terrain', () => {
  const stops = [...document.querySelectorAll('.vtt-measure-overlay stop')].map((stop) => stop.getAttribute('stop-color'));
  assert.equal(stops.length, 2);
  for (const colour of stops) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(colour.slice(i, i + 2), 16));
    assert.ok(r < 32 && g < 32 && b < 32, `${colour} is black`);
  }
});
