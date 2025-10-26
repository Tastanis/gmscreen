import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { renderSceneList } from '../scene-manager.js';

function createDom() {
  const dom = new JSDOM(
    `<!DOCTYPE html>
      <body>
        <div id="scene-manager"></div>
        <form data-scene-form>
          <input data-scene-name-input />
          <select data-scene-folder-select></select>
          <button type="submit"></button>
        </form>
        <div data-scene-feedback></div>
        <input id="vtt-overlay-upload-input" type="file" />
        <div data-action="create-folder"></div>
      </body>`,
    { url: 'http://localhost' }
  );

  const { window } = dom;
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.navigator = window.navigator;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.Element = window.Element;
  globalThis.Node = window.Node;
  globalThis.CustomEvent = window.CustomEvent;
  globalThis.Event = window.Event;
  globalThis.File = window.File;
  return dom;
}

function createMockStore(initialState) {
  let state = initialState;
  let subscriber = null;

  const clone = (value) => {
    if (typeof structuredClone === 'function') {
      return structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value));
  };

  return {
    getState: () => state,
    subscribe: (callback) => {
      subscriber = typeof callback === 'function' ? callback : null;
      return () => {
        subscriber = null;
      };
    },
    updateState: (updater) => {
      const draft = clone(state);
      updater?.(draft);
      state = draft;
      subscriber?.(state);
    },
  };
}

test('uploading an overlay map for a single layer preserves other layer masks', async () => {
  const dom = createDom();
  const polygon = {
    points: [
      { column: 0, row: 0 },
      { column: 1, row: 0 },
      { column: 0, row: 1 },
    ],
  };
  const firstMask = { visible: true, polygons: [polygon] };
  const expectedFirstMask = JSON.parse(JSON.stringify(firstMask));

  const overlayConfig = {
    mapUrl: 'https://example.com/overlay-1.png',
    mask: { visible: true, polygons: [polygon] },
    activeLayerId: 'layer-1',
    layers: [
      { id: 'layer-1', name: 'Overlay 1', visible: true, mask: firstMask },
      { id: 'layer-2', name: 'Overlay 2', visible: true, mask: { visible: true, polygons: [] } },
    ],
  };

  const boardState = {
    activeSceneId: 'scene-1',
    mapUrl: 'https://example.com/map.png',
    overlay: JSON.parse(JSON.stringify(overlayConfig)),
    placements: {},
    sceneState: {
      'scene-1': {
        overlay: JSON.parse(JSON.stringify(overlayConfig)),
        grid: { size: 64, locked: false, visible: true },
      },
    },
    templates: {},
  };

  const initialState = {
    scenes: {
      items: [
        {
          id: 'scene-1',
          name: 'Example Scene',
          mapUrl: 'https://example.com/map.png',
          grid: { size: 64, locked: false, visible: true },
        },
      ],
      folders: [],
    },
    boardState,
  };

  const store = createMockStore(initialState);

  const originalFetch = globalThis.fetch;
  const fetchMock = mock.fn(async (input, init = {}) => {
    const body = init?.body;
    const isFormData = Boolean(body && typeof body.append === 'function' && typeof body.get === 'function');
    if (isFormData) {
      return {
        ok: true,
        json: async () => ({
          success: true,
          data: { url: 'https://example.com/overlay-2.png' },
        }),
      };
    }

    return {
      ok: true,
      json: async () => ({}),
    };
  });
  globalThis.fetch = fetchMock;

  renderSceneList(
    {
      uploads: 'https://example.com/uploads',
      scenes: 'https://example.com/scenes',
      state: 'https://example.com/state',
    },
    store
  );

  const uploadButton = dom.window.document.querySelector(
    '.scene-overlay__item[data-overlay-id="layer-2"] .scene-overlay__upload'
  );
  assert.ok(uploadButton, 'expected upload button for second overlay');
  uploadButton.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));

  const overlayInput = dom.window.document.getElementById('vtt-overlay-upload-input');
  const file = new Blob(['dummy'], { type: 'image/png' });
  Object.defineProperty(file, 'name', { value: 'overlay.png' });
  Object.defineProperty(overlayInput, 'files', {
    configurable: true,
    value: [file],
  });

  overlayInput.dispatchEvent(new dom.window.Event('change'));

  await new Promise((resolve) => setImmediate(resolve));

  const updatedState = store.getState();
  const sceneOverlay = updatedState.boardState.sceneState['scene-1'].overlay;
  const firstLayer = sceneOverlay.layers.find((layer) => layer.id === 'layer-1');
  const secondLayer = sceneOverlay.layers.find((layer) => layer.id === 'layer-2');

  assert.equal(sceneOverlay.mapUrl, 'https://example.com/overlay-2.png');
  assert.deepEqual(firstLayer.mask, expectedFirstMask);
  assert.deepEqual(secondLayer.mask, { visible: true, polygons: [] });

  const boardOverlay = updatedState.boardState.overlay;
  const boardFirstLayer = boardOverlay.layers.find((layer) => layer.id === 'layer-1');
  const boardSecondLayer = boardOverlay.layers.find((layer) => layer.id === 'layer-2');

  assert.equal(boardOverlay.mapUrl, 'https://example.com/overlay-2.png');
  assert.deepEqual(boardFirstLayer.mask, expectedFirstMask);
  assert.deepEqual(boardSecondLayer.mask, { visible: true, polygons: [] });

  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.ok(fetchMock.mock.callCount() >= 1);

  globalThis.fetch = originalFetch;
});
