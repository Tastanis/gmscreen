import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

// The shadow layer on a page: what is actually drawn under floating plates.
const dom = new JSDOM('<div id="vtt-map-transform"><svg id="wall-rubble-ground"></svg><div id="vtt-grid-overlay"></div></div>');
globalThis.window = dom.window; globalThis.document = dom.window.document;

const ring = (l, t, r, b) => [{ x: l, y: t }, { x: r, y: t }, { x: r, y: b }, { x: l, y: b }];
const plate = (id, levelId, height, box, extra = {}) => ({ id, kind: 'floor', levelId, height, points: ring(...box), holes: [], nodes: [], ...extra });
const scene = {
  mapLevels: { levels: [{ id: 'high', elevationSquares: 18 }, { id: 'mid', elevationSquares: 12 }, { id: 'secret', elevationSquares: 6, hidden: true }] },
  walls: { revision: 1, value: { version: 1, nodes: [], segments: [], roofs: [
    plate('high-island', 'high', 18, [8, 18, 14, 24], { floating: true }),
    plate('mid-island', 'mid', 12, [7, 3, 15, 10], { floating: true }),
    plate('balcony', 'mid', 12, [20, 3, 24, 6]),
    plate('hidden-island', 'secret', 6, [16, 4, 21, 10], { floating: true }),
  ] } },
};
// The board's height view: ground at 0 everywhere, the usual slant.
let slant = { x: 0.12, y: 0.36 }, revision = 1;
window.terrainPrototype = { active: true, get revision() { return revision; }, key: 'k', get slant() { return slant; }, heightAt: () => 0, project: (x, y, h) => ({ x: x + h * 100 * slant.x, y: y - h * 100 * slant.y }) };
window.terrainContext = () => ({
  isGM: true, levelId: 'level-0', userId: 'gm',
  view: { mapLoaded: true, gridSize: 100, gridOffsets: { left: 0, top: 0 }, mapPixelSize: { width: 2600, height: 3000 } },
  state: { boardState: { activeSceneId: 'scene', sceneState: { scene: { mapLevels: scene.mapLevels, environment: { walls: scene.walls } } } } },
});
await import('../floating-shadows.js');
const redraw = () => window.floatingShadows.redraw();
const shadows = () => [...document.querySelectorAll('#floating-shadows path')];
const corners = (path) => path.getAttribute('d').slice(1, -1).split('L').map((pair) => pair.split(' ').map(Number));

test('each floating plate on a shown floor has a shadow; an ordinary plate and a hidden floor have none', () => {
  redraw();
  assert.deepEqual(shadows().map((path) => path.dataset.shadowOf), ['high-island', 'mid-island']);
  assert.deepEqual(window.floatingShadows.plates.map((entry) => entry.id), ['high-island', 'mid-island']);
});

test('the shadow lies on the plate\'s true squares, at ground height, not where the plate is drawn', () => {
  const points = corners(shadows()[0]);
  const xs = points.map(([x]) => x), ys = points.map(([, y]) => y);
  // Squares 8 to 14 across and 18 to 24 down, at 100 pixels a square. The plate itself is drawn 648 pixels higher.
  assert.deepEqual([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)], [800, 1400, 1800, 2400]);
});

test('it sits just above the map, under the ground rubble, and is soft and see-through', () => {
  const layer = document.querySelector('#floating-shadows');
  assert.equal(layer.nextElementSibling.id, 'wall-rubble-ground', 'under the rubble that lies on the same ground');
  assert.match(layer.style.cssText, /z-index:\s*2/, 'the same low layer as zones and ground rubble: the fog is far above it');
  const path = shadows()[0];
  assert.equal(path.getAttribute('fill'), '#000');
  assert.ok(Number(path.getAttribute('fill-opacity')) > 0.2 && Number(path.getAttribute('fill-opacity')) < 0.6);
  assert.equal(path.getAttribute('filter'), 'url(#floating-shadow-soft)');
  assert.ok(Number(document.querySelector('#floating-shadow-soft feGaussianBlur').getAttribute('stdDeviation')) > 5);
});

test('it is redrawn when the design changes, and only then', () => {
  const before = window.floatingShadows.builds;
  redraw(); redraw();
  assert.equal(window.floatingShadows.builds, before, 'nothing changed, nothing redrawn');
  // The GM unmarks the high island.
  const value = JSON.parse(JSON.stringify(scene.walls.value)); delete value.roofs[0].floating;
  scene.walls = { revision: 2, value }; redraw();
  assert.deepEqual(shadows().map((path) => path.dataset.shadowOf), ['mid-island']);
  // The slant changes: the ground does not move, so neither does the shadow.
  const at = corners(shadows()[0])[0];
  slant = { x: 0.04, y: 0.12 }; revision = 2; redraw();
  assert.deepEqual(corners(shadows()[0])[0], at);
  assert.ok(window.floatingShadows.builds > before);
});

test('no floating plates, no layer contents', () => {
  const value = JSON.parse(JSON.stringify(scene.walls.value));
  for (const roof of value.roofs) delete roof.floating;
  scene.walls = { revision: 3, value }; redraw();
  assert.equal(document.querySelector('#floating-shadows').children.length, 0);
  assert.deepEqual(window.floatingShadows.plates, []);
});
