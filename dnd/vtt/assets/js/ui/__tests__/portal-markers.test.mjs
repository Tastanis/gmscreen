import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFile } from 'node:fs/promises';
import { portalVisible } from '../portal-visibility.mjs';
import { makeSight } from '../vision-height.mjs';

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
  const viewer = { column: 0, row: 1, width: 1, height: 1 };
  const sight = makeSight({ viewer, viewerGround: 0, groundAt: () => 0, walls: model });
  window.visionPrototype = { portalVisible: geometry => portalVisible({ ...geometry, viewer: { x: .5, y: 1.5 }, ground: 0, eye: 1, sight }) };
  const context = { isGM, view: { gridSize: 50, scale: 1, gridOffsets: {} } };
  const editor = createWallEditor({ panel: document.querySelector('aside'), transform: document.querySelector('#map'), selected: () => [], model: () => model,
    context: () => context, projected: p => ({ x: p.x * 50, y: p.y * 50 }), groundAt: () => 0, change() {}, render() {}, copyWalls: value => structuredClone(value) });
  return { editor, model, context };
}

test('player sees closed door near face, but not a window occluded behind it', () => {
  const { editor } = fixture();
  editor.portals();
  const marker = document.querySelector('[data-portal-id="near-door"]');
  assert.ok(marker);
  assert.equal(marker.disabled, true, 'Player symbol grants no portal command control.');
  assert.equal(marker.dataset.portalType, 'door');
  assert.equal(marker.querySelector('svg').getAttribute('viewBox'), '0 0 16 16');
  assert.equal(document.querySelector('[data-portal-id="far-window"]'), null);
  assert.doesNotThrow(() => marker.onclick(new window.MouseEvent('click')));
});

test('open door reveals window; vision changes remove obsolete symbols and secrets stay hidden', () => {
  const { editor, model } = fixture();
  model.segments[0].open = true;
  const sight = makeSight({ viewer: { column: 0, row: 1, width: 1, height: 1 }, viewerGround: 0, groundAt: () => 0, walls: model });
  window.visionPrototype.portalVisible = geometry => portalVisible({ ...geometry, viewer: { x: .5, y: 1.5 }, ground: 0, eye: 1, sight });
  editor.portals();
  assert.ok(document.querySelector('[data-portal-type="window"]'));
  model.segments[1].secret = true;
  editor.portals();
  assert.equal(document.querySelector('[data-portal-id="far-window"]'), null);
  window.visionPrototype.portalVisible = () => false;
  editor.portals();
  assert.equal(document.querySelectorAll('.wall-portal').length, 0);
});

test('whole-map view shows projected ordinary symbols while GM retains existing controls', () => {
  const { editor, model, context } = fixture();
  document.documentElement.classList.remove('height-vision-active');
  window.visionPrototype.portalVisible = () => true;
  editor.portals();
  assert.equal(document.querySelectorAll('.wall-portal').length, 2);
  context.isGM = true;
  model.segments[1].secret = true;
  editor.portals();
  assert.equal(document.querySelector('[data-portal-id="near-door"]').disabled, false);
  assert.equal(document.querySelector('[data-portal-id="far-window"]').textContent, '?');
});

test('player never gets all-scene markers before the vision renderer has a valid viewpoint', () => {
  const { editor } = fixture();
  document.documentElement.classList.remove('height-vision-active');
  delete window.visionPrototype;
  editor.portals();
  assert.equal(document.querySelectorAll('.wall-portal').length, 0);
  window.visionPrototype = { portalVisible: () => false };
  editor.portals();
  assert.equal(document.querySelectorAll('.wall-portal').length, 0);
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
  const lifecycle = new Function('mapSurface', `
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
