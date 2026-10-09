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
  // A door is painted thicker than a wall and off the wall line, so its strip is drawn 1.4 squares
  // high (89.6 of this board's 64 pixels; a plain wall's is three quarters of a square). Centred
  // on the wall line, in its own three-to-one shape: never stretched.
  const width = Number(image.getAttribute('width')), height = Number(image.getAttribute('height'));
  assert.ok(Math.abs(height - 89.6) < 0.01, `${height} high`);
  assert.ok(Math.abs(width - height * 3) < 0.01, `${width} by ${height} is three to one`);
  assert.equal(Number(image.getAttribute('y')), -height / 2);
  // Only the stretch over the piece is shown: the whole square, fading out just past each end.
  const fade = door.querySelector('mask'), cover = fade.querySelector('rect'), ramp = door.querySelector('linearGradient');
  assert.equal(image.getAttribute('mask'), `url(#${fade.id})`);
  assert.equal(cover.getAttribute('fill'), `url(#${ramp.id})`);
  const shown = Number(cover.getAttribute('width')), left = Number(cover.getAttribute('x'));
  assert.ok(shown > 64 && shown < 84, `${shown} shown for a 64 pixel piece`);
  assert.ok(Math.abs(left + shown / 2) < 0.01, 'centred on the piece');
  assert.equal(Number(cover.getAttribute('height')), height);
  const stops = [...ramp.querySelectorAll('stop')].map((stop) => [Number(stop.getAttribute('offset')) * shown + left, Number(stop.getAttribute('stop-opacity'))]);
  assert.deepEqual(stops.map(([, opacity]) => opacity), [0, 1, 1, 0]);
  assert.ok(stops[1][0] <= -32 + 0.01 && stops[2][0] >= 32 - 0.01, `solid from one end of the piece to the other: ${stops[1][0]} to ${stops[2][0]}`);
  // What is shown comes from the middle of the picture, where its band is whole.
  const x = Number(image.getAttribute('x'));
  assert.ok(left >= x + width * 0.08 - 0.01 && left + shown <= x + width * 0.92 + 0.01, `shown ${left} to ${left + shown} of a picture from ${x} to ${x + width}`);
  assert.equal(new Set([...document.querySelectorAll('[id^="wall-rubble-"]')].map((node) => node.id)).size, document.querySelectorAll('[id^="wall-rubble-"]').length, 'every name is used once');
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

// ---- found by the tester on the bathhouse (October 8)
const breakAgain = (extraPlates = []) => {
  const value = JSON.parse(JSON.stringify(scene.walls.value));
  for (const edge of value.segments) if (edge.id !== 'standing') edge.broken = true;
  value.roofs = [value.roofs[0], ...extraPlates];
  scene.walls = { revision: scene.walls.revision + 1, value };
};

test('the rubble layer is put back above the floor pictures when that layer arrives later', () => {
  view.isGM = false; view.levelId = 'upper'; window.visionPrototype = { portalVisible: () => true };
  breakAgain(); redraw();
  // The page makes the floor-picture layer after the rubble layer: it lands on top and covers the rubble.
  const transform = document.querySelector('#vtt-map-transform'), plates = document.querySelector('#roof-prototype');
  transform.append(plates);
  assert.notEqual(plates.nextElementSibling?.id, 'wall-rubble-floors', 'the floor pictures are now over the rubble');
  redraw();
  assert.equal(plates.nextElementSibling.id, 'wall-rubble-floors', 'the next redraw puts the rubble straight after them again');
  assert.deepEqual(floorLayer().map((node) => node.dataset.rubbleId), ['upstairs'], 'and nothing drawn was lost');
  // Even when nothing about the scene has changed since the last redraw.
  transform.append(plates); redraw();
  assert.equal(plates.nextElementSibling.id, 'wall-rubble-floors');
});

test('the GM, looking down from a chosen height, is shown rubble on the floors in view', () => {
  view.isGM = true; view.levelId = 'level-0'; window.visionPrototype = { portalVisible: () => false };
  const shownAt = (height) => { window.gmVision = { manual: true, height }; redraw(); return floorLayer().map((node) => node.dataset.rubbleId); };
  // The upper floor is 2 high. Below it the GM does not see that floor, or its rubble.
  assert.deepEqual(shownAt(0), []);
  assert.deepEqual(shownAt(1.5), []);
  assert.deepEqual(shownAt(2), ['upstairs'], 'at the floor\'s own height it is in view, whatever floor the GM is "on"');
  assert.deepEqual(shownAt(5), ['upstairs']);
  assert.deepEqual(groundLayer().map((node) => node.dataset.rubbleId), ['stone-wall', 'door'], 'ground rubble is unchanged throughout');
  // A second floor over the same spot, 4 high: once the GM's height takes it in, its picture covers the rubble below.
  breakAgain([{ id: 'top-floor', kind: 'floor', levelId: 'top', height: 4, points: square(4, 3, 8, 6) }]);
  assert.deepEqual(shownAt(3), ['upstairs']);
  assert.deepEqual(shownAt(4), [], 'covered by the floor above');
  // A hole in that floor over the spot lets the rubble show again.
  breakAgain([{ id: 'top-floor', kind: 'floor', levelId: 'top', height: 4, points: square(4, 3, 8, 6), holes: [square(5, 3.5, 6, 4.5)] }]);
  assert.deepEqual(shownAt(4), ['upstairs']);
  // With one token selected the GM looks through its eyes: the token's floor, and what it can see.
  window.gmVision = { manual: false, height: 0 };
  window.terrainContext = ((inner) => () => { const c = inner(); c.state.boardState.placements = { scene: [{ id: 'hero', levelId: 'upper' }] }; return c; })(window.terrainContext);
  window.visionPrototype = { viewerTokenId: 'hero', portalVisible: () => true }; redraw();
  assert.deepEqual(floorLayer().map((node) => node.dataset.rubbleId), ['upstairs'], 'the selected token stands on that floor and sees the spot');
  window.visionPrototype = { viewerTokenId: 'hero', portalVisible: () => false }; document.documentElement.classList.add('height-vision-active'); redraw();
  assert.deepEqual(floorLayer(), [], 'out of the token\'s sight');
  document.documentElement.classList.remove('height-vision-active'); delete window.gmVision;
});
