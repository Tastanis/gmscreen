import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFile } from 'node:fs/promises';
import { portalVisible, portalAnchorVisible } from '../portal-visibility.mjs';

globalThis.indexedDB = { open: () => ({}) };
const { createWallEditor } = await import('../wall-editor.mjs');

function fixture(isGM = false) {
  const dom = new JSDOM('<html class="height-vision-active"><body><div id="map"></div><aside hidden><footer></footer></aside></body></html>');
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  const model = {
    nodes: [{ id: 'a', x: 2, y: 0 }, { id: 'b', x: 2, y: 3 }, { id: 'c', x: 4, y: 0 }, { id: 'd', x: 4, y: 3 }],
    segments: [{ id: 'near-door', a: 'a', b: 'b', interaction: 'door' }, { id: 'far-window', a: 'c', b: 'd', interaction: 'window' }], roofs: [],
  };
  window.vtt3d = { active: true, overlayHost: document.querySelector('#map') };
  const context = { isGM, view: { gridSize: 50, scale: 1, gridOffsets: {} } };
  const editor = createWallEditor({ panel: document.querySelector('aside'), transform: document.querySelector('#map'), selected: () => [], model: () => model,
    context: () => context, projected: p => ({ x: p.x * 50, y: p.y * 50 }), groundAt: () => 0, change() {}, render() {}, copyWalls: value => structuredClone(value) });
  return { editor, model, context };
}

test('door and window controls attach to the 3D doorways with role-specific permissions', () => {
  const {editor, model, context} = fixture();
  editor.portals();
  const door = window.vtt3d.overlayHost.querySelector('[data-portal-id="near-door"]');
  const pane = window.vtt3d.overlayHost.querySelector('[data-portal-id="far-window"]');
  assert.equal(door.disabled, false);
  assert.equal(pane.disabled, true);
  assert.equal(door.dataset.vtt3dAnchor.split(',').length, 3);
  assert.equal(door.style.visibility, 'hidden');
  model.segments[1].secret = true;
  editor.portals();
  assert.equal(document.querySelector('[data-portal-id="far-window"]'), null);
  context.isGM = true;
  editor.portals();
  assert.match(document.querySelector('[data-portal-id="far-window"]').dataset.portalKind, /^secret-/);
});

test('camera-projected door markers follow native player sight, including startup and whole-map view', () => {
  const visible = (sight, active = true) => portalAnchorVisible(false, sight, active, 2, 1.5);
  assert.equal(visible(undefined), false);
  assert.equal(visible(() => null), false);
  assert.equal(visible(() => null, false), true);
  assert.equal(visible(() => false), false);
  assert.equal(visible((x, y) => x === 2 && y === 1.5), true);
  assert.equal(portalAnchorVisible(true, () => false, true, 2, 1.5), true);
});

test('portal markers require matching vertical range even when their face is unobstructed', () => {
  const geometry = { a: { x: 2, y: 0 }, b: { x: 2, y: 3 }, base: 2, top: 4, viewer: { x: .5, y: 1.5 }, eye: 1, sight: () => true };
  assert.equal(portalVisible({ ...geometry, ground: 0 }), false);
  assert.equal(portalVisible({ ...geometry, ground: 1.75, eye: 2.75 }), true, 'A visible raised doorway is not hidden by a small exterior height gap.');
  assert.equal(portalVisible({ ...geometry, ground: 2, eye: 3 }), true);
  assert.equal(portalVisible({ ...geometry, ground: 4, eye: 5 }), false);
});

test('manual healing/damage token selection bypasses portals and cancel restores their normal hit area', async () => {
  const { editor } = fixture(true);
  editor.portals();
  const surface = document.querySelector('#map');
  const portal = document.querySelector('[data-portal-id="near-door"]');
  assert.equal(window.getComputedStyle(portal).pointerEvents, 'auto');
  const source = await readFile(new URL('../board-interactions.js', import.meta.url), 'utf8');
  // Exercise the production picker lifecycle without mounting the whole board.
  const begin = source.slice(source.indexOf('  function beginDamageHealTargeting('), source.indexOf('  function updateDamageHealTargetingStatus('));
  const cancel = source.slice(source.indexOf('  function cancelDamageHealTargeting('), source.indexOf('  function clearDamageHealStatusTimeout('));
  const lifecycle = new Function('board', `
    let pendingDamageHeal = null;
    const status = {textContent:'Ready'}, defaultStatusText = 'Ready';
    const normalizeAutomationDamageType = value => value;
    const clearDamageHealStatusTimeout = () => {}, updateDamageHealTargetingStatus = () => {}, setDamageHealMode = () => {}, restoreStatus = () => {};
    ${begin}\n${cancel}
    return {begin:beginDamageHealTargeting,cancel:cancelDamageHealTargeting};
  `)(surface);
  lifecycle.begin('heal', 0);
  assert.equal(window.getComputedStyle(portal).pointerEvents, 'auto', 'Invalid selection does not disable portals.');
  for (const mode of ['heal', 'damage']) {
    lifecycle.begin(mode, 3);
    assert.equal(window.getComputedStyle(portal).pointerEvents, 'none', 'The visible portal no longer captures token-targeting clicks.');
    assert.equal(portal.disabled, false, 'GM portal permission stays unchanged.');
    lifecycle.cancel();
    assert.equal(window.getComputedStyle(portal).pointerEvents, 'auto', 'Normal door/window interaction returns when targeting ends.');
  }
});
