import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

// The rubble layer on a page: what a GM and a player actually get drawn.
const dom = new JSDOM('<div id="vtt-map-transform"><canvas id="roof-prototype"></canvas><div id="vtt-grid-overlay"></div></div>');
globalThis.window = dom.window; globalThis.document = dom.window.document;
let stones;
window.vtt3d = {active:true,setOverlay(name, list) { assert.equal(name,'rubble'); stones=list; }};
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
const ids = layer => window.wallRubble.pieces.filter(p => p.layer === layer && p.shown).map(p => p.id);

test('broken walls create stones at the wall base, including upper floors', () => {
  redraw();
  assert.deepEqual(ids('ground'), ['stone-wall','door']);
  assert.deepEqual(ids('floor'), []);
  assert.ok(stones.length && stones.every(s=>s.kind==='dot' && s.z===0));
  view.levelId='upper'; redraw();
  assert.deepEqual(ids('floor'), ['upstairs']);
  assert.ok(stones.some(s=>s.z===2));
});

test('player sight and repaired walls update the visible stones', () => {
  view.isGM=false;
  window.vttSightSees=(x,y)=>x<5; redraw();
  assert.deepEqual(ids('floor'), []);
  delete window.vttSightSees;
  const repaired=structuredClone(scene.walls.value);
  for(const edge of repaired.segments) delete edge.broken;
  scene.walls={revision:3,value:repaired}; redraw();
  assert.deepEqual(stones, []);
  assert.deepEqual(window.wallRubble.pieces, []);
});

// ---- found by the tester on the bathhouse (October 8)
const breakAgain = (extraPlates = []) => {
  const value = JSON.parse(JSON.stringify(scene.walls.value));
  for (const edge of value.segments) if (edge.id !== 'standing') edge.broken = true;
  value.roofs = [value.roofs[0], ...extraPlates];
  scene.walls = { revision: scene.walls.revision + 1, value };
};

test('the GM, looking down from a chosen height, is shown rubble on the floors in view', () => {
  breakAgain(); view.isGM = true; view.levelId = 'level-0';
  const shownAt = (height) => { window.gmVision = { manual: true, height }; redraw(); return ids('floor'); };
  // The upper floor is 2 high. Below it the GM does not see that floor, or its rubble.
  assert.deepEqual(shownAt(0), []);
  assert.deepEqual(shownAt(1.5), []);
  assert.deepEqual(shownAt(2), ['upstairs'], 'at the floor\'s own height it is in view, whatever floor the GM is "on"');
  assert.deepEqual(shownAt(5), ['upstairs']);
  assert.deepEqual(ids('ground'), ['stone-wall', 'door'], 'ground rubble is unchanged throughout');
  // A second floor over the same spot, 4 high: once the GM's height takes it in, its picture covers the rubble below.
  breakAgain([{ id: 'top-floor', kind: 'floor', levelId: 'top', height: 4, points: square(4, 3, 8, 6) }]);
  assert.deepEqual(shownAt(3), ['upstairs']);
  assert.deepEqual(shownAt(4), [], 'covered by the floor above');
  // A hole in that floor over the spot lets the rubble show again.
  breakAgain([{ id: 'top-floor', kind: 'floor', levelId: 'top', height: 4, points: square(4, 3, 8, 6), holes: [square(5, 3.5, 6, 4.5)] }]);
  assert.deepEqual(shownAt(4), ['upstairs']);
  // With one token selected the GM looks through its eyes: the token's floor, and what it can see.
  window.gmVision = { manual: false, height: 0 };
  window.terrainContext = ((inner) => () => { const c = inner(); c.state.boardState.placements = { scene: [{ id: 'hero', levelId: 'upper' }] }; c.selectedIds = ['hero']; return c; })(window.terrainContext);
  redraw();
  assert.deepEqual(ids('floor'), ['upstairs']);
  delete window.gmVision;
});
