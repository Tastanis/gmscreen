import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

// The sight layer itself, run on a page as a player's browser runs it, one frame at a time. What is
// checked is the order of things when a token moves: creatures are hidden in the very frame the
// token arrives, the lit ground follows over the next frames, only the newest place is shown, the
// map is not uncovered before a finished picture, and ground seen in passing is still remembered.
const dom = new JSDOM('<div id="vtt-map-transform"><img id="vtt-map-image"><div id="vtt-token-layer"><div data-placement-id="hero"></div><div data-placement-id="ogre"></div></div></div>', { url: 'http://localhost/', pretendToBeVisual: true });
const { window } = dom, { document } = window;
Object.assign(globalThis, { window, document, MutationObserver: window.MutationObserver, localStorage: window.localStorage });
Object.defineProperty(document.querySelector('#vtt-map-image'), 'naturalWidth', { value: 4000 });
Object.defineProperty(document.querySelector('#vtt-map-image'), 'naturalHeight', { value: 3000 });

// A clock that moves one millisecond each time it is read, so "ten milliseconds of work" is the same on every machine.
let clock = 0; Object.defineProperty(globalThis, 'performance', { value: { now: () => ++clock }, configurable: true });
// Frames are run by hand.
let frames = []; globalThis.requestAnimationFrame = (callback) => { frames.push(callback); return frames.length; };
const settle = () => new Promise((resolve) => setImmediate(resolve));
async function frame() { const due = frames; frames = []; for (const callback of due) callback(); await settle(); await settle(); }

// Every canvas records what is drawn on it.
const drawn = [];
window.HTMLCanvasElement.prototype.getContext = function getContext() {
  if (!this.recorder) { const canvas = this, store = { canvas }; this.recorder = new Proxy(store, { get: (target, name) => (name in target ? target[name] : (...args) => { drawn.push({ canvas, call: String(name), args }); }), set: (target, name, value) => { target[name] = value; return true; } }); }
  return this.recorder;
};
window.HTMLCanvasElement.prototype.toBlob = function toBlob(callback) { callback(null); };
globalThis.Path2D = class Path2D { constructor() { this.points = 0; this.pieces = 0; } moveTo() { this.points++; } lineTo() { this.points++; } closePath() { this.closed = true; } addPath(piece) { if (!piece.closed) throw new Error('a piece was added before it was closed'); this.points += piece.points; this.pieces++; } };
// A viewer's memory of the map, with nothing saved yet.
const request = (result) => { const r = { result }; queueMicrotask(() => r.onsuccess?.()); return r; };
const store = { get: () => request(undefined), put: () => request(undefined), openCursor: () => request(null) };
globalThis.indexedDB = { open: () => request({ transaction: () => ({ objectStore: () => store }), createObjectStore: () => store }) };

// The scene: 40 by 30 squares of flat ground, one long wall, a hero the player owns and an ogre.
const walls = { version: 1, nodes: [{ id: 'n1', x: 15, y: 0 }, { id: 'n2', x: 15, y: 8 }], segments: [{ id: 'w', a: 'n1', b: 'n2', sight: 'block', movement: 'block', height: 3 }], roofs: [], ramps: [] };
const hero = (column, row) => ({ id: 'hero', name: 'Cal', column, row, width: 1, height: 1, levelId: 'level-0', visionOwners: ['cal'] });
const ogre = { id: 'ogre', name: 'Ogre', column: 20, row: 5, width: 1, height: 1, levelId: 'level-0' };
const board = { activeSceneId: 'scene', mapUrl: '/map.jpg', placements: { scene: [hero(5, 12), ogre] }, templates: {}, sceneState: { scene: { environment: { walls: { revision: 1, value: walls } }, fogOfWar: {} } } };
const context = { isGM: false, userId: 'cal', levelId: 'level-0', selectedIds: [], followId: null, state: { boardState: board }, view: { mapLoaded: true, gridSize: 100, gridOffsets: { left: 0, top: 0 }, mapInsets: { left: 0, top: 0 }, mapPixelSize: { width: 4000, height: 3000 }, scale: 1 } };
window.terrainContext = () => context;
window.terrainPrototype = { active: true, field: { n: 41, m: 31, h: new Float32Array(41 * 31) }, key: 'ground', revision: 1, flightRevision: 0, markersVisible: false, slant: { x: 0.12, y: 0.36 }, project: (x, y) => ({ x, y }), heightAt: () => 0, groundFor: () => 0 };
let portalRefreshes = 0;
window.wallPrototype = { revision: 1, model: walls, refreshPortals: () => { portalRefreshes++; } };
const moveHero = (column, row) => { board.placements = { scene: [hero(column, row), ogre] }; };

const { confirmPlayerFogPaint } = await import('../player-visibility-ready.js');
await import('../vision-prototype.js');
const stats = () => window.visionPrototype.stats;
const sightCanvas = document.querySelector('#vision-prototype'), tokenView = document.querySelector('#vision-token-view');
const shownTokens = () => [...tokenView.querySelectorAll('[data-vision-placement-id]')].map((node) => node.dataset.visionPlacementId);
const covered = () => document.documentElement.classList.contains('vtt-player-visibility-pending');
/** What was drawn since the last call: on the sight canvas, and on the half-size memory picture. */
function drawing() {
  const mine = drawn.splice(0);
  return { sight: mine.filter((d) => d.canvas === sightCanvas).map((d) => d.call), memory: mine.filter((d) => !d.canvas.id && d.call === 'fill').length };
}
async function untilStill(limit = 400) { let n = 0; while ((stats().groundPending || stats().memoryWaiting) && n++ < limit) await frame(); return n; }

test('the first picture of a scene is made at once, and the map is uncovered only after it', async () => {
  assert.equal(stats().paints, 0);
  await frame();
  assert.equal(stats().groundRuns, 1, 'worked out in the first frame, not spread out');
  assert.equal(stats().groundPending, false);
  assert.equal(covered(), true, 'still covered: the ordinary fog has not been drawn');
  confirmPlayerFogPaint(context.state, context.view, false, 'level-0');
  await frame(); await frame();
  assert.equal(covered(), false);
  assert.deepEqual(shownTokens(), ['hero', 'ogre'], 'from (5,12) the ogre is in view past the end of the wall');
  drawing();
});

test('a move: the creature is hidden in that frame; the lit ground follows, and is the newest place only', async () => {
  const before = stats();
  moveHero(5, 11); // one square north: the wall now stands between the hero and the ogre
  await frame();
  const first = drawing();
  assert.deepEqual(shownTokens(), ['hero'], 'the ogre is gone from the screen in the frame the hero arrives');
  assert.equal(window.visionPrototype.tokenVisible('ogre'), false);
  assert.equal(stats().paints, before.paints + 1);
  assert.equal(stats().groundPending, true, 'the lit ground is still being worked out');
  assert.deepEqual(first.sight, [], 'and the old ground picture is left as it is meanwhile');
  let waited = 0; while (stats().groundPending) { await frame(); waited++; assert.ok(waited < 200); }
  const after = stats(), last = drawing();
  assert.ok(waited >= 3, `spread over several frames (${waited})`);
  assert.equal(after.groundRuns, before.groundRuns + 1);
  assert.ok(after.lastGroundSlices > 3, `in ${after.lastGroundSlices} slices`);
  assert.ok(last.sight.includes('fillRect') && last.sight.includes('fill'), 'then the new picture is drawn');
  assert.equal(last.sight.filter((call) => call === 'fillRect').length, 1, 'once');
  assert.equal(after.paints, before.paints + 1, 'nothing else was worked out again');
  assert.deepEqual(shownTokens(), ['hero']);
});

test('no frame of a move does more than a slice of the ground work', async () => {
  moveHero(6, 11);
  let longest = 0; do { const start = clock; await frame(); longest = Math.max(longest, clock - start); } while (stats().groundPending);
  // The clock moves a millisecond for each reading; a frame reads it a few dozen times at most.
  assert.ok(longest < 40, `the longest frame took ${longest} readings of the clock`);
  drawing();
});

test('four fast moves: one picture is shown, for the last square, and the three squares passed are remembered', async () => {
  await untilStill(); drawing();
  const before = stats();
  for (const column of [7, 8, 9, 10]) { moveHero(column, 11); await frame(); }
  const during = drawing();
  assert.deepEqual(during.sight, [], 'no picture was put up for a square the hero had already left');
  assert.equal(stats().groundSetAside, before.groundSetAside + 3);
  assert.equal(stats().memoryWaiting, 3);
  while (stats().groundPending) await frame();
  const shown = drawing();
  assert.equal(stats().groundRuns, before.groundRuns + 1, 'one picture for the screen');
  assert.equal(shown.sight.filter((call) => call === 'fillRect').length, 1);
  assert.equal(shown.memory, 1, 'the place the hero stands is remembered as it is shown');
  await untilStill();
  const later = drawing();
  assert.equal(stats().memoryCatchUps, before.memoryCatchUps + 3, 'the three squares passed through were finished afterwards');
  assert.equal(stats().memoryWaiting, 0);
  // Each is added to memory (one fill on the memory picture); the screen is drawn again from memory once, at the end.
  assert.equal(later.memory, 3 + 1, 'three added to memory, and the shown place drawn again once');
  assert.equal(later.sight.filter((call) => call === 'fillRect').length, 1);
  assert.equal(stats().groundRuns, before.groundRuns + 1, 'none of them was shown as lit');
});

test('going back to the square just shown costs nothing', async () => {
  moveHero(11, 11); await frame(); assert.equal(stats().groundPending, true);
  moveHero(10, 11); await frame(); // back before the picture for (11,11) was finished
  assert.equal(stats().groundPending, false, 'the picture for (10,11) is already on the screen');
  await untilStill(); drawing();
});

test('another token moving does not work the viewer\'s ground out again', async () => {
  const before = stats();
  board.placements = { scene: [hero(10, 11), { ...ogre, column: 22 }] };
  await frame();
  assert.equal(stats().paints, before.paints + 1, 'the creature checks ran');
  assert.equal(stats().groundRuns, before.groundRuns);
  assert.equal(stats().groundPending, false);
  assert.deepEqual(drawing().sight, [], 'and the ground picture was not touched');
});

test('when the walls change the picture is made at once, not kept from before', async () => {
  const before = stats();
  window.wallPrototype.revision = 2;
  moveHero(12, 11);
  await frame();
  assert.equal(stats().groundPending, false, 'not spread out: the old picture was for other walls');
  assert.equal(stats().groundRuns, before.groundRuns + 1);
  assert.ok(drawing().sight.includes('fillRect'));
});

test('a change of floor covers the player\'s map until the new floor\'s picture is finished', async () => {
  context.levelId = 'upper';
  await frame();
  assert.equal(covered(), true);
  assert.equal(stats().groundPending, false, 'made at once');
  confirmPlayerFogPaint(context.state, context.view, false, 'upper');
  await frame();
  assert.equal(covered(), false);
  assert.ok(portalRefreshes > 5, 'door buttons were put back with each repaint');
});
