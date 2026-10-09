import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

// The rubble layer on a page: what a GM and a player actually get drawn.
const dom = new JSDOM('<div id="vtt-map-transform"><canvas id="roof-prototype"></canvas><div id="vtt-grid-overlay"></div></div>');
globalThis.window = dom.window; globalThis.document = dom.window.document;
// As the page lists them: address and size. A window has no pictures here, so it borrows glass.
window.vttRubbleImages = [
  { url: 'assets/images/rubble/rubble-door-1.png?v=5', width: 600, height: 200 },
  { url: 'assets/images/rubble/rubble-door-2.png?v=5', width: 600, height: 200 },
  { url: 'assets/images/rubble/rubble-heap-stone-1.webp?v=5', width: 512, height: 442 },
];

const square = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const scene = {
  walls: {
    revision: 1,
    value: {
      version: 1,
      nodes: [{ id: 'n0', x: 3, y: 0 }, { id: 'n1', x: 3, y: 1 }, { id: 'n2', x: 3, y: 2 }, { id: 'n3', x: 3, y: 3 }, { id: 'u0', x: 5, y: 4 }, { id: 'u1', x: 6, y: 4 }],
      segments: [
        { id: 'stone-wall', a: 'n0', b: 'n1', baseMode: 'fixed', base: 0, height: 2, material: 'stone', broken: true },
        { id: 'door', a: 'n1', b: 'n2', baseMode: 'fixed', base: 0, height: 2, interaction: 'door', material: 'wood', broken: true },
        { id: 'standing', a: 'n2', b: 'n3', baseMode: 'fixed', base: 0, height: 2, material: 'stone' },
        { id: 'upstairs', a: 'u0', b: 'u1', baseMode: 'fixed', base: 2, height: 2, material: 'wood', broken: true },
      ],
      roofs: [{ id: 'upper-floor', kind: 'floor', levelId: 'upper', height: 2, points: square(4, 3, 8, 6) }],
    },
  },
};
const view = { isGM: true, levelId: 'level-0' };
window.terrainContext = () => ({
  isGM: view.isGM, levelId: view.levelId, userId: view.isGM ? 'gm' : 'cal',
  view: { mapLoaded: true, gridSize: 64, gridOffsets: { left: 0, top: 0 }, mapPixelSize: { width: 640, height: 640 } },
  state: { boardState: { activeSceneId: 'scene', sceneState: { scene: { environment: { walls: scene.walls } } } } },
});
await import('../wall-rubble-overlay.js');
const redraw = () => window.wallRubble.redraw();
const groundLayer = () => [...document.querySelectorAll('#wall-rubble-ground > g')];
const floorLayer = () => [...document.querySelectorAll('#wall-rubble-floors > g')];
const byId = (id) => document.querySelector(`[data-rubble-id="${id}"]`);

test('each broken wall on the ground gets rubble, and a standing wall gets none', () => {
  redraw();
  assert.deepEqual(groundLayer().map((node) => node.dataset.rubbleId), ['stone-wall', 'door']);
  assert.equal(byId('standing'), null);
  // In the middle of the wall piece, turned to run along it (this wall runs straight down the map).
  const stone = byId('stone-wall');
  assert.match(stone.getAttribute('transform'), /^translate\(192\.00 32\.00\) rotate\((90|270)\.00\)$/);
  assert.equal(stone.dataset.rubbleKind, 'stone');
});

test('a kind with a picture file uses it; a kind without is drawn', () => {
  const door = byId('door'), image = door.querySelector('image');
  assert.equal(door.dataset.rubbleSource, 'picture');
  assert.match(image.getAttribute('href'), /^assets\/images\/rubble\/rubble-door-[12]\.png\?v=5$/);
  // A little longer than the one-square wall piece, centred on the wall, and the picture's own
  // three-to-one shape: it is never stretched.
  const width = Number(image.getAttribute('width')), height = Number(image.getAttribute('height'));
  assert.ok(width > 64 && width < 77, `${width} long`);
  assert.ok(Math.abs(height - width / 3) < 0.01, `${width} by ${height} is three to one`);
  assert.equal(Number(image.getAttribute('x')), -width / 2);
  const stone = byId('stone-wall');
  assert.equal(stone.dataset.rubbleSource, 'drawn');
  assert.ok(stone.querySelectorAll('path').length > 20);
  assert.deepEqual(window.wallRubble.pictures, { door: 2, 'heap-stone': 1 });
  // The same picture again on the next redraw.
  const first = image.getAttribute('href');
  scene.walls = { ...scene.walls, revision: 2 }; redraw();
  assert.equal(byId('door').querySelector('image').getAttribute('href'), first);
});

test('rubble on an upper floor is drawn above the floor, and only while that floor is viewed', () => {
  assert.deepEqual(floorLayer(), [], 'not while the ground is being viewed');
  view.levelId = 'upper'; redraw();
  assert.deepEqual(floorLayer().map((node) => node.dataset.rubbleId), ['upstairs']);
  assert.equal(document.querySelector('#roof-prototype').nextElementSibling.id, 'wall-rubble-floors', 'directly above the layer the floors are painted on');
  assert.deepEqual(groundLayer().map((node) => node.dataset.rubbleId), ['stone-wall', 'door'], 'ground rubble stays; the floor painted over it hides it where it should');
});

test('a player sees floor rubble only where they can see the spot', () => {
  view.isGM = false; view.levelId = 'upper';
  window.visionPrototype = { portalVisible: () => false }; redraw();
  assert.deepEqual(floorLayer(), [], 'out of sight');
  window.visionPrototype = { portalVisible: ({ base, top }) => base === 2 && top === 4 }; redraw();
  assert.deepEqual(floorLayer().map((node) => node.dataset.rubbleId), ['upstairs'], 'in sight');
  assert.deepEqual(groundLayer().map((node) => node.dataset.rubbleId), ['stone-wall', 'door'], 'ground rubble is under the fog layer, which hides it by itself');
  assert.deepEqual(window.wallRubble.pieces.map((piece) => [piece.id, piece.layer, piece.shown]), [['stone-wall', 'ground', true], ['door', 'ground', true], ['upstairs', 'floor', true]]);
});

test('repairing clears the rubble', () => {
  const repaired = JSON.parse(JSON.stringify(scene.walls.value));
  for (const edge of repaired.segments) delete edge.broken;
  scene.walls = { revision: 3, value: repaired }; redraw();
  assert.deepEqual([groundLayer().length, floorLayer().length], [0, 0]);
  assert.deepEqual(window.wallRubble.pieces, []);
});
