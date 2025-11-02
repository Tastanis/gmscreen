import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import * as boardInteractionsModule from '../board-interactions.js';

const {
  mountBoardInteractions,
  createBoardStatePoller,
  overlayUploadHelpers,
  createOverlayCutoutBlob,
} = boardInteractionsModule;

function createDom() {
  const dom = new JSDOM(
    `<!DOCTYPE html>
      <body>
        <div id="vtt-board-canvas">
          <div class="vtt-board__empty"></div>
          <div id="vtt-map-surface">
            <div id="vtt-map-transform">
              <img id="vtt-map-image" />
            </div>
            <div id="vtt-grid-overlay"></div>
            <div id="vtt-token-layer"></div>
            <div id="vtt-ping-layer"></div>
            <div id="vtt-template-layer"></div>
          </div>
        </div>
        <div id="vtt-map-backdrop"></div>
        <div id="active-scene-status"></div>
        <div id="active-scene-name"></div>
        <div id="vtt-main"></div>
        <div data-combat-tracker>
          <div data-combat-tracker-waiting></div>
          <div data-combat-tracker-completed></div>
        </div>
        <button data-action="upload-map"></button>
        <input id="vtt-map-upload-input" />
        <button data-action="open-templates"></button>
        <button data-action="group-combatants"></button>
        <button data-action="start-combat">Start Combat</button>
        <div data-round-tracker><span data-round-value></span></div>
        <p data-turn-indicator hidden>Waiting for turn</p>
        <div data-turn-timer>
          <div data-turn-timer-image></div>
          <div data-turn-timer-display></div>
        </div>
        <div data-condition-banner-region></div>
      </body>`
  , { url: 'http://localhost' });

  const { window } = dom;
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.navigator = window.navigator;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.Element = window.Element;
  globalThis.Node = window.Node;
  globalThis.CustomEvent = window.CustomEvent;
  globalThis.Event = window.Event;
  globalThis.getComputedStyle = window.getComputedStyle.bind(window);
  window.matchMedia ??= () => ({ matches: false, addListener() {}, removeListener() {} });
  globalThis.requestAnimationFrame = window.requestAnimationFrame?.bind(window) ?? ((cb) => setTimeout(cb, 16));
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame?.bind(window) ?? ((id) => clearTimeout(id));
  globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
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
        if (subscriber === callback) {
          subscriber = null;
        }
      };
    },
    setState: (nextState) => {
      state = nextState;
      subscriber?.(state);
    },
    updateState: (updater) => {
      if (typeof updater !== 'function') {
        return;
      }
      const draft = clone(state);
      updater(draft);
      state = draft;
      subscriber?.(state);
    },
  };
}

function dispatchPointerEvent(target, type, init = {}) {
  if (!target) {
    return;
  }

  const documentRef = target.ownerDocument;
  const win = documentRef?.defaultView;
  const options = {
    bubbles: true,
    pointerId: init.pointerId ?? 1,
    pointerType: init.pointerType || 'mouse',
    buttons: init.buttons ?? 1,
    button: init.button ?? 0,
    clientX: init.clientX ?? 0,
    clientY: init.clientY ?? 0,
  };

  let event;
  if (win && typeof win.PointerEvent === 'function') {
    event = new win.PointerEvent(type, options);
  } else if (win) {
    event = new win.Event(type, { bubbles: true });
    const assignable = { ...options };
    delete assignable.bubbles;
    Object.assign(event, assignable);
  } else {
    event = new Event(type, { bubbles: true });
    const assignable = { ...options };
    delete assignable.bubbles;
    Object.assign(event, assignable);
  }

  target.dispatchEvent(event);
}

function buildOverlayState(mapUrl, mask = { visible: true, polygons: [] }) {
  return {
    layers: [
      {
        id: 'layer-1',
        name: 'Overlay 1',
        visible: true,
        mapUrl,
        mask,
      },
    ],
    activeLayerId: 'layer-1',
  };
}

test('createOverlayCutoutBlob keeps only masked polygon pixels opaque', async () => {
  class FakeImage {
    constructor(width, height) {
      this.width = width;
      this.height = height;
      this.naturalWidth = width;
      this.naturalHeight = height;
      this.onload = null;
      this.onerror = null;
      this.crossOrigin = null;
    }

    set src(value) {
      this._src = value;
      queueMicrotask(() => {
        if (typeof this.onload === 'function') {
          this.onload();
        }
      });
    }
  }

  class FakeContext {
    constructor(canvas) {
      this.canvas = canvas;
      this.globalCompositeOperation = 'source-over';
      this.fillStyle = '#000';
      this._path = [];
      this._stack = [];
      this.fillCount = 0;
      this.lastCompositeOperation = '';
    }

    clearRect() {
      this.canvas._pixels.fill(0);
    }

    drawImage() {
      const length = this.canvas._width * this.canvas._height;
      this.canvas._pixels = new Array(length).fill(1);
    }

    save() {
      this._stack.push({
        globalCompositeOperation: this.globalCompositeOperation,
        fillStyle: this.fillStyle,
      });
    }

    restore() {
      const state = this._stack.pop();
      if (state) {
        this.globalCompositeOperation = state.globalCompositeOperation;
        this.fillStyle = state.fillStyle;
      }
    }

    beginPath() {
      this._path = [];
    }

    moveTo(x, y) {
      this._path.push([{ x, y }]);
    }

    lineTo(x, y) {
      const current = this._path[this._path.length - 1];
      if (current) {
        current.push({ x, y });
      }
    }

    closePath() {
      const current = this._path[this._path.length - 1];
      if (current && current.length > 0) {
        current.push({ ...current[0] });
      }
    }

    fill() {
      this.fillCount += 1;
      this.lastCompositeOperation = this.globalCompositeOperation;

      const width = this.canvas._width;
      const height = this.canvas._height;
      if (!width || !height) {
        return;
      }

      const mask = new Array(width * height).fill(false);

      const pointInPolygon = (x, y, polygon) => {
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
          const xi = polygon[i].x;
          const yi = polygon[i].y;
          const xj = polygon[j].x;
          const yj = polygon[j].y;
          const intersects =
            yi > y !== yj > y &&
            x < ((xj - xi) * (y - yi)) / (yj - yi || Number.EPSILON) + xi;
          if (intersects) {
            inside = !inside;
          }
        }
        return inside;
      };

      this._path.forEach((subPath) => {
        const polygon = subPath.filter(Boolean);
        if (polygon.length < 3) {
          return;
        }

        for (let y = 0; y < height; y += 1) {
          for (let x = 0; x < width; x += 1) {
            if (pointInPolygon(x + 0.5, y + 0.5, polygon)) {
              mask[y * width + x] = true;
            }
          }
        }
      });

      const existing = this.canvas._pixels.slice();

      if (this.globalCompositeOperation === 'destination-in') {
        for (let index = 0; index < existing.length; index += 1) {
          this.canvas._pixels[index] = existing[index] && mask[index] ? 1 : 0;
        }
      } else if (this.globalCompositeOperation === 'destination-out') {
        for (let index = 0; index < existing.length; index += 1) {
          this.canvas._pixels[index] = mask[index] ? 0 : existing[index];
        }
      }
    }
  }

  class FakeCanvas {
    constructor() {
      this._width = 0;
      this._height = 0;
      this._pixels = [];
      this.context = new FakeContext(this);
    }

    get width() {
      return this._width;
    }

    set width(value) {
      this._width = value;
      this._resize();
    }

    get height() {
      return this._height;
    }

    set height(value) {
      this._height = value;
      this._resize();
    }

    _resize() {
      const length = Math.max(0, this._width * this._height);
      this._pixels = new Array(length).fill(0);
    }

    getContext(type) {
      if (type === '2d') {
        return this.context;
      }
      return null;
    }

    toBlob(callback) {
      callback({
        opaquePixels: this._pixels.slice(),
        width: this._width,
        height: this._height,
      });
    }
  }

  class FakeDocument {
    constructor() {
      this.createdCanvases = [];
    }

    createElement(tagName) {
      if (tagName === 'canvas') {
        const canvas = new FakeCanvas();
        this.createdCanvases.push(canvas);
        return canvas;
      }

      if (tagName === 'img') {
        return new FakeImage(80, 80);
      }

      throw new Error(`Unsupported element: ${tagName}`);
    }
  }

  const documentRef = new FakeDocument();
  const blob = await createOverlayCutoutBlob({
    mapUrl: 'http://example.com/map.png',
    polygons: [
      {
        points: [
          { column: 0, row: 0 },
          { column: 1, row: 0 },
          { column: 1, row: 1 },
          { column: 0, row: 1 },
        ],
      },
    ],
    view: {
      mapPixelSize: { width: 80, height: 80 },
      gridSize: 8,
    },
    documentRef,
  });

  assert.ok(blob, 'expected a blob to be produced');

  const canvas = documentRef.createdCanvases.at(0);
  assert.ok(canvas, 'canvas should be created');

  const { context } = canvas;
  assert.equal(context.fillCount, 1, 'polygons should be filled in a single operation');
  assert.equal(
    context.lastCompositeOperation,
    'destination-in',
    'fill should use destination-in compositing'
  );

  const { opaquePixels, width, height } = blob;
  const index = (x, y) => y * width + x;

  assert.equal(
    opaquePixels[index(4, 4)],
    1,
    'pixel inside polygon should remain opaque'
  );
  assert.equal(
    opaquePixels[index(60, 60)],
    0,
    'pixel outside polygon should become transparent'
  );
});

test('numeric activeSceneId toggles combat button to End Combat', () => {
  const dom = createDom();
  try {
    const startCombatButton = dom.window.document.querySelector('[data-action="start-combat"]');
    assert.ok(startCombatButton, 'start combat button should exist');

    const combatState = {
      active: true,
      round: 1,
      updatedAt: 1,
      activeCombatantId: '',
      completedCombatantIds: [],
    };

    const boardState = {
      activeSceneId: 42,
      sceneState: {
        '42': { combat: combatState },
      },
    };

    const state = {
      user: { isGM: true, name: 'GM' },
      boardState,
      scenes: { items: [{ id: '42', name: 'Test Scene' }] },
    };

    const store = {
      getState: () => state,
      subscribe: () => {},
    };

    mountBoardInteractions(store);

    assert.equal(startCombatButton.textContent, 'End Combat');
  } finally {
    dom.window.close();
  }
});

test('Sharon confirmation is required for other allies but triggers Hesitation banner on her own token', () => {
  const dom = createDom();
  try {
    const { window } = dom;
    const { document } = window;

    const messages = [];
    window.dashboardChat = {
      sendMessage: ({ message }) => {
        messages.push(message);
        return { catch() {} };
      },
    };

    const confirmMessages = [];
    window.confirm = (message) => {
      confirmMessages.push(message);
      return false;
    };

    const state = {
      user: { isGM: false, name: 'Sharon' },
      boardState: {
        activeSceneId: 'scene-1',
        mapUrl: 'http://example.com/map.png',
        placements: {
          'scene-1': [
            {
              id: 'ally-1',
              column: 0,
              row: 0,
              width: 1,
              height: 1,
              name: 'Frunk',
              combatTeam: 'ally',
              profileId: 'frunk',
            },
            {
              id: 'sharon-token',
              column: 1,
              row: 0,
              width: 1,
              height: 1,
              name: 'Sharon',
              combatTeam: 'ally',
              profileId: 'sharon',
            },
          ],
        },
        sceneState: {
          'scene-1': {
            grid: { size: 64 },
            combat: {
              active: true,
              round: 2,
              activeCombatantId: 'enemy-1',
              completedCombatantIds: [],
              startingTeam: 'ally',
              currentTeam: 'enemy',
              lastTeam: 'ally',
              roundTurnCount: 3,
              updatedAt: 1,
            },
          },
        },
      },
      grid: { size: 64, visible: true },
      scenes: { items: [{ id: 'scene-1', name: 'Scene One' }] },
    };

    const store = createMockStore(state);

    mountBoardInteractions(store, { state: '/state' });

    const mapImage = document.getElementById('vtt-map-image');
    Object.defineProperty(mapImage, 'naturalWidth', { value: 1024, configurable: true });
    Object.defineProperty(mapImage, 'naturalHeight', { value: 768, configurable: true });
    mapImage.onload?.();

    const allyToken = document.querySelector('[data-combatant-id="ally-1"]');
    assert.ok(allyToken, 'ally combatant should render');

    allyToken.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true }));

    assert.equal(confirmMessages.length, 1);
    assert.equal(
      confirmMessages[0],
      "It is not the PC's turn. Would you like to go anyways?",
      'standard confirmation dialog should be shown for non-Sharon allies'
    );
    assert.equal(document.querySelector('.vtt-hesitation-banner'), null);
    assert.deepEqual(messages, []);

    window.confirm = () => {
      throw new Error('Sharon should not be prompted when selecting her own token');
    };

    const sharonToken = document.querySelector('[data-combatant-id="sharon-token"]');
    assert.ok(sharonToken, 'Sharon combatant should render');

    sharonToken.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true }));

    const banner = document.querySelector('.vtt-hesitation-banner');
    assert.ok(banner, 'Hesitation banner should appear for Sharon overriding her own turn');
    assert.equal(banner.textContent, 'HESITATION IS WEAKNESS!');
    assert.deepEqual(messages, ['HESITATION IS WEAKNESS!']);
  } finally {
    dom.window.close();
  }
});

test('overlay editor preview applies clip path while editing', () => {
  const dom = createDom();
  try {
    const { document, MouseEvent } = dom.window;

    const sceneManager = document.createElement('div');
    sceneManager.id = 'scene-manager';
    const toggleButton = document.createElement('button');
    toggleButton.dataset.action = 'toggle-overlay-editor';
    toggleButton.setAttribute('data-scene-id', 'scene-1');
    sceneManager.append(toggleButton);
    document.body.append(sceneManager);

    const initialState = {
      user: { isGM: true, name: 'GM' },
      boardState: {
        activeSceneId: 'scene-1',
        mapUrl: 'http://example.com/map.png',
        sceneState: {
          'scene-1': {
            overlay: buildOverlayState('http://example.com/overlay.png', {
              visible: true,
              polygons: [
                {
                  points: [
                    { column: 1, row: 1 },
                    { column: 3, row: 1 },
                    { column: 3, row: 3 },
                    { column: 1, row: 3 },
                  ],
                },
              ],
            }),
          },
        },
      },
      scenes: { items: [{ id: 'scene-1', name: 'Scene One' }] },
    };

    const store = createMockStore(initialState);
    mountBoardInteractions(store);

    const board = document.getElementById('vtt-board-canvas');
    board.getBoundingClientRect = () => ({
      width: 512,
      height: 512,
      top: 0,
      right: 512,
      bottom: 512,
      left: 0,
    });

    const mapImage = document.getElementById('vtt-map-image');
    Object.defineProperty(mapImage, 'naturalWidth', { value: 512, configurable: true });
    Object.defineProperty(mapImage, 'naturalHeight', { value: 512, configurable: true });
    mapImage.onload?.();

    toggleButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const mapOverlay = document.getElementById('vtt-map-overlay');
    const overlayLayer = mapOverlay.querySelector('.vtt-board__map-overlay-layer');
    assert.ok(overlayLayer, 'overlay layer element should render');
    const expectedClipPath =
      "path('M 12.5% 12.5% L 37.5% 12.5% L 37.5% 37.5% L 12.5% 37.5% Z')";

    assert.equal(overlayLayer.style.clipPath, expectedClipPath);
    assert.equal(overlayLayer.style.webkitClipPath, expectedClipPath);
  } finally {
    dom.window.close();
  }
});

test('overlay clip path uses only provided polygons and keeps both visible', () => {
  const dom = createDom();
  try {
    const firstPolygonPoints = [
      { column: 0, row: 0 },
      { column: 5, row: 0 },
      { column: 5, row: 5 },
      { column: 0, row: 5 },
    ];
    const secondPolygonPoints = [
      // Winding order should no longer affect visibility when combining overlays
      { column: 5, row: 5 },
      { column: 10, row: 5 },
      { column: 10, row: 0 },
      { column: 5, row: 0 },
    ];

    const initialState = {
      user: { isGM: true, name: 'GM' },
      scenes: { items: [{ id: 'scene-1', name: 'Scene 1' }] },
      grid: { size: 64, visible: true },
      boardState: {
        activeSceneId: 'scene-1',
        mapUrl: 'http://example.com/map.png',
        placements: { 'scene-1': [] },
        sceneState: {
          'scene-1': {
            grid: { size: 64, visible: true },
            overlay: buildOverlayState('http://example.com/overlay.png'),
          },
        },
        overlay: buildOverlayState('http://example.com/overlay.png'),
      },
    };

    const store = createMockStore(initialState);
    mountBoardInteractions(store);

    const mapImage = dom.window.document.getElementById('vtt-map-image');
    Object.defineProperty(mapImage, 'naturalWidth', { value: 640, configurable: true });
    Object.defineProperty(mapImage, 'naturalHeight', { value: 640, configurable: true });

    const boardElement = dom.window.document.getElementById('vtt-board-canvas');
    boardElement.getBoundingClientRect = () => ({
      width: 640,
      height: 640,
      top: 0,
      left: 0,
      right: 640,
      bottom: 640,
      x: 0,
      y: 0,
    });

    mapImage.onload?.();

    store.updateState((draft) => {
      const mask = {
        visible: true,
        polygons: [
          { points: firstPolygonPoints },
          { points: secondPolygonPoints },
        ],
      };
      draft.boardState.sceneState['scene-1'].overlay = buildOverlayState(
        'http://example.com/overlay.png',
        mask
      );
      draft.boardState.overlay = buildOverlayState('http://example.com/overlay.png', mask);
    });

    const mapOverlay = dom.window.document.getElementById('vtt-map-overlay');
    const overlayLayer = mapOverlay.querySelector('.vtt-board__map-overlay-layer');
    assert.ok(overlayLayer, 'overlay layer element should render');
    const clipPath = overlayLayer.style.clipPath || overlayLayer.style.webkitClipPath;

    const expectedClipPath =
      "path('M 0% 0% L 50% 0% L 50% 50% L 0% 50% Z M 50% 50% L 100% 50% L 100% 0% L 50% 0% Z')";
    assert.equal(
      clipPath,
      expectedClipPath,
      'clip path should include the provided polygons with even-odd fill rule',
    );

    const segments = clipPath.match(/M /g) ?? [];
    assert.equal(segments.length, 2, 'clip path should contain both polygon segments');
  } finally {
    dom.window.close();
  }
});

test('cached map images mark the board as loaded and allow GM drops', async () => {
  const dom = createDom();
  try {
    const { document } = dom.window;
    const board = document.getElementById('vtt-board-canvas');
    board.getBoundingClientRect = () => ({
      width: 512,
      height: 512,
      top: 0,
      left: 0,
      right: 512,
      bottom: 512,
    });

    const mapSurface = document.getElementById('vtt-map-surface');
    mapSurface.getBoundingClientRect = () => ({
      width: 512,
      height: 512,
      top: 0,
      left: 0,
      right: 512,
      bottom: 512,
    });

    const mapImage = document.getElementById('vtt-map-image');
    let intrinsicWidth = 0;
    let intrinsicHeight = 0;
    let isComplete = false;
    Object.defineProperty(mapImage, 'naturalWidth', {
      get: () => intrinsicWidth,
      configurable: true,
    });
    Object.defineProperty(mapImage, 'naturalHeight', {
      get: () => intrinsicHeight,
      configurable: true,
    });
    Object.defineProperty(mapImage, 'complete', {
      get: () => isComplete,
      configurable: true,
    });
    Object.defineProperty(mapImage, 'decode', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    const initialState = {
      user: { isGM: true, name: 'GM' },
      scenes: { items: [{ id: 'scene-1', name: 'Scene 1' }] },
      grid: { size: 64, visible: true },
      boardState: {
        activeSceneId: 'scene-1',
        mapUrl: 'http://example.com/map.png',
        placements: { 'scene-1': [] },
        sceneState: {
          'scene-1': {
            grid: { size: 64, visible: true },
          },
        },
      },
    };

    const store = createMockStore(initialState);
    const interactions = mountBoardInteractions(store) ?? {};
    const viewState = interactions.getViewState?.();
    assert.ok(viewState, 'view state handle should be exposed for tests');

    intrinsicWidth = 512;
    intrinsicHeight = 512;
    isComplete = true;

    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(viewState.mapLoaded, true, 'cached images should flag the map as loaded without relying on load events');

    const dataTransferPayload = JSON.stringify({
      id: 'token-1',
      name: 'Goblin',
      imageUrl: 'http://example.com/token.png',
      size: '1x1',
    });

    let dropEffect = 'none';
    const dataTransfer = {
      types: ['application/x-vtt-token-template'],
      getData: (type) => (type === 'application/x-vtt-token-template' ? dataTransferPayload : ''),
    };
    Object.defineProperty(dataTransfer, 'dropEffect', {
      get: () => dropEffect,
      set: (value) => {
        dropEffect = value;
      },
      configurable: true,
    });

    const dropEvent = new dom.window.Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(dropEvent, 'dataTransfer', { value: dataTransfer });
    Object.defineProperty(dropEvent, 'clientX', { value: 256 });
    Object.defineProperty(dropEvent, 'clientY', { value: 256 });

    mapSurface.dispatchEvent(dropEvent);

    const placements =
      store.getState().boardState?.placements?.['scene-1'] ?? [];
    assert.equal(placements.length, 1, 'GM token drops should be accepted once the map is marked as loaded');
  } finally {
    dom.window.close();
  }
});

test('hiding one overlay layer preserves other visible layers', async () => {
  const dom = createDom();
  const { document } = dom.window;

  const initialOverlay = {
    mapUrl: 'http://example.com/overlay-2.png',
    mask: {
      visible: true,
      polygons: [
        {
          points: [
            { column: 1, row: 1 },
            { column: 3, row: 1 },
            { column: 3, row: 3 },
          ],
        },
        {
          points: [
            { column: 5, row: 5 },
            { column: 7, row: 5 },
            { column: 7, row: 7 },
          ],
        },
      ],
    },
    layers: [
      {
        id: 'layer-1',
        name: 'Overlay 1',
        visible: true,
        mapUrl: 'http://example.com/overlay-1.png',
        mask: {
          visible: true,
          polygons: [
            {
              points: [
                { column: 1, row: 1 },
                { column: 3, row: 1 },
                { column: 3, row: 3 },
              ],
            },
          ],
        },
      },
      {
        id: 'layer-2',
        name: 'Overlay 2',
        visible: true,
        mapUrl: 'http://example.com/overlay-2.png',
        mask: {
          visible: true,
          polygons: [
            {
              points: [
                { column: 5, row: 5 },
                { column: 7, row: 5 },
                { column: 7, row: 7 },
              ],
            },
          ],
        },
      },
    ],
    activeLayerId: 'layer-2',
  };

  const initialState = {
    user: { isGM: true, name: 'GM' },
    scenes: { items: [{ id: 'scene-1', name: 'Scene 1' }] },
    boardState: {
      activeSceneId: 'scene-1',
      mapUrl: 'http://example.com/map.png',
      placements: { 'scene-1': [] },
      sceneState: {
        'scene-1': {
          grid: { size: 64, visible: true },
          overlay: JSON.parse(JSON.stringify(initialOverlay)),
        },
      },
      overlay: JSON.parse(JSON.stringify(initialOverlay)),
    },
  };

  const store = createMockStore(initialState);
  mountBoardInteractions(store);

  const mapImage = document.getElementById('vtt-map-image');
  Object.defineProperty(mapImage, 'naturalWidth', { value: 512, configurable: true });
  Object.defineProperty(mapImage, 'naturalHeight', { value: 512, configurable: true });
  mapImage.onload?.();

  await Promise.resolve();

  const firstLayer = document.querySelector(
    '.vtt-board__map-overlay-layer[data-overlay-layer-id="layer-1"]'
  );
  const secondLayer = document.querySelector(
    '.vtt-board__map-overlay-layer[data-overlay-layer-id="layer-2"]'
  );
  const mapOverlay = document.getElementById('vtt-map-overlay');

  assert.ok(firstLayer, 'expected first overlay layer to render');
  assert.ok(secondLayer, 'expected second overlay layer to render');
  assert.equal(firstLayer.hidden, false, 'first overlay layer should be visible initially');
  assert.equal(secondLayer.hidden, false, 'second overlay layer should be visible initially');

  store.updateState((draft) => {
    const overlay = draft.boardState.overlay;
    overlay.layers = overlay.layers.map((layer) =>
      layer.id === 'layer-2' ? { ...layer, visible: false } : layer
    );
    overlay.mask = {
      visible: true,
      polygons: overlay.layers[0].mask.polygons,
    };
    overlay.mapUrl = overlay.layers[0].mapUrl;

    const sceneOverlay = draft.boardState.sceneState['scene-1'].overlay;
    sceneOverlay.layers = sceneOverlay.layers.map((layer) =>
      layer.id === 'layer-2' ? { ...layer, visible: false } : layer
    );
    sceneOverlay.mask = {
      visible: true,
      polygons: sceneOverlay.layers[0].mask.polygons,
    };
    sceneOverlay.mapUrl = sceneOverlay.layers[0].mapUrl;
  });

  await Promise.resolve();

  assert.equal(firstLayer.hidden, false, 'first overlay layer should remain visible');
  assert.equal(secondLayer.hidden, true, 'second overlay layer should be hidden');
  assert.equal(
    mapOverlay?.dataset.activeOverlayLayerId,
    'layer-1',
    'active overlay layer should switch to the next visible layer'
  );

  dom.window.close();
});

test('overlay cutout upload replaces overlay map when available', async () => {
  const dom = createDom();
  const { document, MouseEvent, Blob } = dom.window;

  const sceneManager = document.createElement('div');
  sceneManager.id = 'scene-manager';
  const toggleButton = document.createElement('button');
  toggleButton.dataset.action = 'toggle-overlay-editor';
  toggleButton.setAttribute('data-scene-id', 'scene-1');
  sceneManager.append(toggleButton);
  document.body.append(sceneManager);

  const initialState = {
    user: { isGM: true, name: 'GM' },
    scenes: { items: [{ id: 'scene-1', name: 'Scene 1' }] },
    boardState: {
      activeSceneId: 'scene-1',
      mapUrl: 'http://example.com/map.png',
      placements: { 'scene-1': [] },
      sceneState: {
        'scene-1': {
          grid: { size: 64, visible: true },
          overlay: buildOverlayState('http://example.com/overlay.png'),
        },
      },
      overlay: buildOverlayState('http://example.com/overlay.png'),
    },
  };

  const store = createMockStore(initialState);
  const cutoutBlob = new Blob(['cutout'], { type: 'image/png' });
  const cutoutMock = mock.method(overlayUploadHelpers, 'createOverlayCutoutBlob', async () => cutoutBlob);
  const uploadMock = mock.method(overlayUploadHelpers, 'uploadMap', async () => 'http://example.com/cropped.png');

  try {
    mountBoardInteractions(store, { uploads: 'http://example.com/uploads' });

    const board = document.getElementById('vtt-board-canvas');
    board.getBoundingClientRect = () => ({
      width: 512,
      height: 512,
      top: 0,
      left: 0,
      right: 512,
      bottom: 512,
    });

    const surface = document.getElementById('vtt-map-surface');
    surface.getBoundingClientRect = () => ({
      width: 512,
      height: 512,
      top: 0,
      left: 0,
      right: 512,
      bottom: 512,
    });

    const mapImage = document.getElementById('vtt-map-image');
    Object.defineProperty(mapImage, 'naturalWidth', { value: 512, configurable: true });
    Object.defineProperty(mapImage, 'naturalHeight', { value: 512, configurable: true });
    mapImage.onload?.();

    toggleButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    dispatchPointerEvent(surface, 'pointerdown', { clientX: 64, clientY: 64, pointerId: 1 });
    dispatchPointerEvent(surface, 'pointerdown', { clientX: 320, clientY: 64, pointerId: 2 });
    dispatchPointerEvent(surface, 'pointerdown', { clientX: 320, clientY: 320, pointerId: 3 });

    const closeButton = document.querySelector('.vtt-overlay-editor__btn');
    closeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const commitButton = document.querySelector('.vtt-overlay-editor__btn--primary');
    commitButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await Promise.resolve();
    await Promise.resolve();

    assert.equal(uploadMock.mock.calls.length, 1, 'upload helper should be called once');
    assert.equal(cutoutMock.mock.calls.length, 1, 'cutout helper should be called once');

    const cutoutArgs = cutoutMock.mock.calls[0]?.arguments?.[0] ?? null;
    assert.deepEqual(
      cutoutArgs?.polygons,
      [
        {
          points: [
            { column: 1, row: 1 },
            { column: 5, row: 1 },
            { column: 5, row: 5 },
          ],
        },
      ],
      'cutout helper should receive the closed polygon'
    );

    const state = store.getState();
    const overlay = state.boardState.sceneState['scene-1'].overlay;
    assert.equal(overlay.mapUrl, 'http://example.com/cropped.png');
    assert.equal(overlay.layers?.[0]?.mapUrl, 'http://example.com/cropped.png');
    assert.deepEqual(overlay.mask, { visible: true, polygons: [] });

    const boardOverlay = state.boardState.overlay;
    assert.equal(boardOverlay.mapUrl, 'http://example.com/cropped.png');
    assert.equal(boardOverlay.layers?.[0]?.mapUrl, 'http://example.com/cropped.png');
    assert.deepEqual(boardOverlay.mask, { visible: true, polygons: [] });
  } finally {
    cutoutMock.mock.restore();
    uploadMock.mock.restore();
    dom.window.close();
  }
});

test('overlay cutout falls back to mask when upload fails', async () => {
  const dom = createDom();
  const { document, MouseEvent } = dom.window;

  const sceneManager = document.createElement('div');
  sceneManager.id = 'scene-manager';
  const toggleButton = document.createElement('button');
  toggleButton.dataset.action = 'toggle-overlay-editor';
  toggleButton.setAttribute('data-scene-id', 'scene-1');
  sceneManager.append(toggleButton);
  document.body.append(sceneManager);

  const initialState = {
    user: { isGM: true, name: 'GM' },
    scenes: { items: [{ id: 'scene-1', name: 'Scene 1' }] },
    boardState: {
      activeSceneId: 'scene-1',
      mapUrl: 'http://example.com/map.png',
      placements: { 'scene-1': [] },
      sceneState: {
        'scene-1': {
          grid: { size: 64, visible: true },
          overlay: buildOverlayState('http://example.com/overlay.png'),
        },
      },
      overlay: buildOverlayState('http://example.com/overlay.png'),
    },
  };

  const store = createMockStore(initialState);
  const cutoutMock = mock.method(overlayUploadHelpers, 'createOverlayCutoutBlob', async () => null);
  const uploadMock = mock.method(overlayUploadHelpers, 'uploadMap', async () => {
    throw new Error('upload should not be called when cutout fails');
  });

  try {
    mountBoardInteractions(store, { uploads: 'http://example.com/uploads' });

    const board = document.getElementById('vtt-board-canvas');
    board.getBoundingClientRect = () => ({
      width: 512,
      height: 512,
      top: 0,
      left: 0,
      right: 512,
      bottom: 512,
    });

    const surface = document.getElementById('vtt-map-surface');
    surface.getBoundingClientRect = () => ({
      width: 512,
      height: 512,
      top: 0,
      left: 0,
      right: 512,
      bottom: 512,
    });

    const mapImage = document.getElementById('vtt-map-image');
    Object.defineProperty(mapImage, 'naturalWidth', { value: 512, configurable: true });
    Object.defineProperty(mapImage, 'naturalHeight', { value: 512, configurable: true });
    mapImage.onload?.();

    toggleButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    dispatchPointerEvent(surface, 'pointerdown', { clientX: 64, clientY: 64, pointerId: 1 });
    dispatchPointerEvent(surface, 'pointerdown', { clientX: 320, clientY: 64, pointerId: 2 });
    dispatchPointerEvent(surface, 'pointerdown', { clientX: 320, clientY: 320, pointerId: 3 });

    const closeButton = document.querySelector('.vtt-overlay-editor__btn');
    closeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const commitButton = document.querySelector('.vtt-overlay-editor__btn--primary');
    commitButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await Promise.resolve();
    await Promise.resolve();

    assert.equal(uploadMock.mock.calls.length, 0, 'upload helper should not be called when cutout fails');
    const state = store.getState();
    const overlay = state.boardState.sceneState['scene-1'].overlay;
    assert.equal(overlay.mapUrl, 'http://example.com/overlay.png');
    assert.equal(overlay.layers?.[0]?.mapUrl, 'http://example.com/overlay.png');
    assert.deepEqual(overlay.mask, {
      visible: true,
      polygons: [
        {
          points: [
            { column: 1, row: 1 },
            { column: 5, row: 1 },
            { column: 5, row: 5 },
          ],
        },
      ],
    });

    const boardOverlay = state.boardState.overlay;
    assert.equal(boardOverlay.mapUrl, 'http://example.com/overlay.png');
    assert.equal(boardOverlay.layers?.[0]?.mapUrl, 'http://example.com/overlay.png');
    assert.deepEqual(boardOverlay.mask, {
      visible: true,
      polygons: [
        {
          points: [
            { column: 1, row: 1 },
            { column: 5, row: 1 },
            { column: 5, row: 5 },
          ],
        },
      ],
    });
  } finally {
    cutoutMock.mock.restore();
    uploadMock.mock.restore();
    dom.window.close();
  }
});

test('overlay editor keeps closed polygon visible when cloning fails for a new shape', () => {
  const dom = createDom();
  try {
    const { document, MouseEvent } = dom.window;

    const sceneManager = document.createElement('div');
    sceneManager.id = 'scene-manager';
    const toggleButton = document.createElement('button');
    toggleButton.dataset.action = 'toggle-overlay-editor';
    toggleButton.setAttribute('data-scene-id', 'scene-1');
    sceneManager.append(toggleButton);
    document.body.append(sceneManager);

    const initialState = {
      user: { isGM: true, name: 'GM' },
      scenes: { items: [{ id: 'scene-1', name: 'Scene 1' }] },
      boardState: {
        activeSceneId: 'scene-1',
        mapUrl: 'http://example.com/map.png',
        placements: { 'scene-1': [] },
        sceneState: {
          'scene-1': {
            grid: { size: 64, visible: true },
            overlay: buildOverlayState(null),
          },
        },
        overlay: buildOverlayState(null),
      },
    };

    const store = createMockStore(initialState);
    mountBoardInteractions(store);

    const board = document.getElementById('vtt-board-canvas');
    board.getBoundingClientRect = () => ({
      width: 512,
      height: 512,
      top: 0,
      left: 0,
      right: 512,
      bottom: 512,
    });

    const surface = document.getElementById('vtt-map-surface');
    surface.getBoundingClientRect = () => ({
      width: 512,
      height: 512,
      top: 0,
      left: 0,
      right: 512,
      bottom: 512,
    });

    const mapImage = document.getElementById('vtt-map-image');
    Object.defineProperty(mapImage, 'naturalWidth', { value: 512, configurable: true });
    Object.defineProperty(mapImage, 'naturalHeight', { value: 512, configurable: true });
    mapImage.onload?.();

    toggleButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    dispatchPointerEvent(surface, 'pointerdown', { clientX: 64, clientY: 64, pointerId: 1 });
    dispatchPointerEvent(surface, 'pointerdown', { clientX: 320, clientY: 64, pointerId: 2 });
    dispatchPointerEvent(surface, 'pointerdown', { clientX: 320, clientY: 320, pointerId: 3 });

    const closeButton = document.querySelector('.vtt-overlay-editor__btn');
    assert.ok(closeButton, 'close button should render');
    closeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const overlay = document.getElementById('vtt-map-overlay');
    assert.ok(overlay, 'overlay host should exist');
    const maskHost = overlay.querySelector(
      '.vtt-board__map-overlay-layer[data-overlay-layer-id="layer-1"]'
    );
    assert.ok(maskHost, 'overlay layer element should exist');
    const beforeClipPath = overlay.style.clipPath;
    const beforeWebkitClipPath = overlay.style.webkitClipPath;

    const statusLabel = document.querySelector('.vtt-overlay-editor__status');
    assert.ok(statusLabel, 'status label should render');
    assert.equal(
      statusLabel.textContent,
      'Shape closed. Apply the mask to commit your changes.',
      'status should reflect a closed shape before starting a new one'
    );

    const originalIsFinite = Number.isFinite;
    Number.isFinite = (value) => {
      if (typeof value === 'number' && value === 5) {
        return false;
      }
      return originalIsFinite(value);
    };

    try {
      dispatchPointerEvent(surface, 'pointerdown', { clientX: 128, clientY: 128, pointerId: 4 });
    } finally {
      Number.isFinite = originalIsFinite;
    }

    const nodes = document.querySelectorAll('.vtt-overlay-editor__node');
    assert.equal(nodes.length, 3, 'existing polygon nodes should remain after failed clone');

    assert.equal(
      overlay.style.clipPath,
      beforeClipPath,
      'overlay clip path should remain unchanged when cloning fails'
    );
    assert.equal(
      overlay.style.webkitClipPath,
      beforeWebkitClipPath,
      'overlay webkit clip path should remain unchanged when cloning fails'
    );

    assert.equal(
      statusLabel.textContent,
      'A closed shape needs at least three valid points before starting another one.',
      'status should explain why a new shape cannot start yet'
    );
    assert.equal(statusLabel.hidden, false, 'status message should be visible');
  } finally {
    dom.window.close();
  }
});

test('overlay editor keeps previously closed polygons when drawing additional shapes', async () => {
  const dom = createDom();
  try {
    const { document, MouseEvent } = dom.window;

    const sceneManager = document.createElement('div');
    sceneManager.id = 'scene-manager';
    const toggleButton = document.createElement('button');
    toggleButton.dataset.action = 'toggle-overlay-editor';
    toggleButton.setAttribute('data-scene-id', 'scene-1');
    sceneManager.append(toggleButton);
    document.body.append(sceneManager);

    const initialState = {
      user: { isGM: true, name: 'GM' },
      scenes: { items: [{ id: 'scene-1', name: 'Scene 1' }] },
      boardState: {
        activeSceneId: 'scene-1',
        mapUrl: 'http://example.com/map.png',
        placements: { 'scene-1': [] },
        sceneState: {
          'scene-1': {
            grid: { size: 64, visible: true },
            overlay: buildOverlayState(null),
          },
        },
        overlay: buildOverlayState(null),
      },
    };

    const store = createMockStore(initialState);
    mountBoardInteractions(store);

    const board = document.getElementById('vtt-board-canvas');
    board.getBoundingClientRect = () => ({
      width: 512,
      height: 512,
      top: 0,
      left: 0,
      right: 512,
      bottom: 512,
    });

    const surface = document.getElementById('vtt-map-surface');
    surface.getBoundingClientRect = () => ({
      width: 512,
      height: 512,
      top: 0,
      left: 0,
      right: 512,
      bottom: 512,
    });

    const mapImage = document.getElementById('vtt-map-image');
    Object.defineProperty(mapImage, 'naturalWidth', { value: 512, configurable: true });
    Object.defineProperty(mapImage, 'naturalHeight', { value: 512, configurable: true });
    mapImage.onload?.();

    toggleButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    dispatchPointerEvent(surface, 'pointerdown', { clientX: 64, clientY: 64, pointerId: 1 });
    dispatchPointerEvent(surface, 'pointerdown', { clientX: 320, clientY: 64, pointerId: 2 });
    dispatchPointerEvent(surface, 'pointerdown', { clientX: 320, clientY: 320, pointerId: 3 });

    const closeButton = document.querySelector('.vtt-overlay-editor__btn');
    assert.ok(closeButton, 'close button should render');
    closeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const overlay = document.getElementById('vtt-map-overlay');
    assert.ok(overlay, 'overlay host should exist');
    const maskHost = overlay.querySelector(
      '.vtt-board__map-overlay-layer[data-overlay-layer-id="layer-1"]'
    );
    assert.ok(maskHost, 'overlay layer element should exist');
    const readonlyNodesBeforeSecondShape = document.querySelectorAll(
      '.vtt-overlay-editor__node--readonly'
    );
    assert.equal(
      readonlyNodesBeforeSecondShape.length,
      0,
      'no read-only nodes should render before starting a second shape'
    );

    const persistedMaskBeforeSecondShape = JSON.parse(maskHost.dataset.overlayMask ?? '{}');
    assert.deepEqual(
      persistedMaskBeforeSecondShape,
      {
        visible: true,
        polygons: [
          {
            points: [
              { column: 1, row: 1 },
              { column: 5, row: 1 },
              { column: 5, row: 5 },
            ],
          },
        ],
      },
      'first polygon should remain in the overlay mask after closing'
    );

    dispatchPointerEvent(surface, 'pointerdown', { clientX: 128, clientY: 128, pointerId: 4 });

    const maskAfterStartingSecondShape = JSON.parse(maskHost.dataset.overlayMask ?? '{}');
    assert.equal(maskAfterStartingSecondShape.polygons?.length, 1);
    assert.deepEqual(
      maskAfterStartingSecondShape.polygons?.[0]?.points,
      [
        { column: 1, row: 1 },
        { column: 5, row: 1 },
        { column: 5, row: 5 },
      ],
      'first polygon should still be present after starting a new shape'
    );

    const readonlyNodesAfterStartingSecondShape = document.querySelectorAll(
      '.vtt-overlay-editor__node--readonly'
    );
    assert.equal(
      readonlyNodesAfterStartingSecondShape.length,
      3,
      'completed polygon should continue to render its nodes as read-only markers'
    );

    dispatchPointerEvent(surface, 'pointerdown', { clientX: 384, clientY: 128, pointerId: 5 });
    dispatchPointerEvent(surface, 'pointerdown', { clientX: 384, clientY: 384, pointerId: 6 });

    const secondCloseButton = document.querySelector('.vtt-overlay-editor__btn');
    secondCloseButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const commitButton = document.querySelector('.vtt-overlay-editor__btn--primary');
    assert.ok(commitButton, 'commit button should render');
    commitButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await Promise.resolve();

    const state = store.getState();
    const overlayState = state.boardState.sceneState['scene-1'].overlay.mask;
    assert.deepEqual(
      overlayState,
      {
        visible: true,
        polygons: [
          {
            points: [
              { column: 2, row: 2 },
              { column: 6, row: 2 },
              { column: 6, row: 6 },
            ],
          },
          {
            points: [
              { column: 1, row: 1 },
              { column: 5, row: 1 },
              { column: 5, row: 5 },
            ],
          },
        ],
      },
      'committed mask should include both polygons'
    );
  } finally {
    dom.window.close();
  }
});

test('Sharon hesitation broadcast from shared combat state shows banner for observers', () => {
  const dom = createDom();
  try {
    const { window } = dom;
    const { document } = window;

    const state = {
      user: { isGM: false, name: 'Indigo' },
      boardState: {
        activeSceneId: 'scene-2',
        mapUrl: 'http://example.com/map.png',
        placements: {
          'scene-2': [
            {
              id: 'sharon-token',
              column: 3,
              row: 4,
              width: 1,
              height: 1,
              name: 'Sharon',
              combatTeam: 'ally',
              profileId: 'sharon',
            },
          ],
        },
        sceneState: {
          'scene-2': {
            combat: {
              active: true,
              round: 3,
              activeCombatantId: 'enemy-7',
              completedCombatantIds: [],
              startingTeam: 'ally',
              currentTeam: 'enemy',
              lastTeam: 'ally',
              roundTurnCount: 2,
              updatedAt: 1700000005000,
              lastEffect: {
                type: 'sharon-hesitation',
                combatantId: 'sharon-token',
                triggeredAt: 1700000000000,
                initiatorId: 'sharon',
              },
            },
          },
        },
      },
      scenes: { items: [{ id: 'scene-2', name: 'Scene Two' }] },
      grid: { size: 64, visible: true },
    };

    const store = createMockStore(state);

    mountBoardInteractions(store, { state: '/state' });

    const mapImage = document.getElementById('vtt-map-image');
    Object.defineProperty(mapImage, 'naturalWidth', { value: 1024, configurable: true });
    Object.defineProperty(mapImage, 'naturalHeight', { value: 768, configurable: true });
    mapImage.onload?.();

    const banner = document.querySelector('.vtt-hesitation-banner');
    assert.ok(
      banner,
      'Hesitation banner should appear for observers when combat state broadcasts Sharon’s effect'
    );
    assert.equal(banner.textContent, 'HESITATION IS WEAKNESS!');
  } finally {
    dom.window.close();
  }
});

test('player token removal queues sanitized board persistence payload', async () => {
  const dom = createDom();
  const { window } = dom;
  const { document } = window;

  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (endpoint, options = {}) => {
    if ((options?.method ?? 'GET').toUpperCase() === 'POST') {
      requests.push({ endpoint, options });
      return { ok: true, json: async () => ({ success: true }) };
    }
    return { ok: true, json: async () => ({}) };
  };

  const originalSetInterval = window.setInterval;
  const originalClearInterval = window.clearInterval;
  window.setInterval = () => 0;
  window.clearInterval = () => {};

  const board = document.getElementById('vtt-board-canvas');
  board.focus = () => {};
  const rect = {
    width: 640,
    height: 640,
    top: 0,
    left: 0,
    right: 640,
    bottom: 640,
    x: 0,
    y: 0,
  };
  board.getBoundingClientRect = () => rect;

  const mapSurface = document.getElementById('vtt-map-surface');
  mapSurface.getBoundingClientRect = () => rect;
  mapSurface.setPointerCapture = () => {};
  mapSurface.releasePointerCapture = () => {};

  if (!window.PointerEvent) {
    class TestPointerEvent extends window.MouseEvent {
      constructor(type, init = {}) {
        super(type, { bubbles: true, cancelable: true, ...init });
        Object.defineProperty(this, 'pointerId', {
          configurable: true,
          value: init.pointerId ?? 1,
        });
        Object.defineProperty(this, 'pointerType', {
          configurable: true,
          value: init.pointerType ?? 'mouse',
        });
        Object.defineProperty(this, 'buttons', {
          configurable: true,
          value:
            init.buttons ?? (typeof init.button === 'number' && init.button === 0 ? 1 : 0),
        });
      }
    }
    window.PointerEvent = TestPointerEvent;
    globalThis.PointerEvent = TestPointerEvent;
  }

  const state = {
    user: { isGM: false, name: 'Player One' },
    boardState: {
      activeSceneId: 'scene-1',
      mapUrl: 'http://example.com/map.png',
      placements: {
        'scene-1': [
          { id: 'visible-token', column: 0, row: 0, width: 1, height: 1 },
          { id: 'hidden-token', column: 5, row: 5, width: 1, height: 1, hidden: true },
        ],
      },
      templates: {
        'scene-1': [
          {
            id: 'template-1',
            type: 'circle',
            color: '#ffffff',
            center: { column: 1, row: 1 },
            radius: 1,
          },
        ],
      },
      sceneState: { 'scene-1': { grid: { size: 64, visible: true } } },
      metadata: {
        updatedAt: 1,
        signature: 'gm:1',
        authorRole: 'gm',
        authorIsGm: true,
        authorId: 'gm',
      },
    },
    grid: { size: 64, visible: true },
    scenes: { items: [{ id: 'scene-1', name: 'Scene One' }] },
  };

  const store = createMockStore(state);

  try {
    mountBoardInteractions(store, { state: '/state' });

    const mapImage = document.getElementById('vtt-map-image');
    Object.defineProperty(mapImage, 'naturalWidth', { value: 640, configurable: true });
    Object.defineProperty(mapImage, 'naturalHeight', { value: 640, configurable: true });
    mapImage.onload?.();

    const token = document.querySelector('[data-placement-id="visible-token"]');
    assert.ok(token, 'visible token should render');

    token.dispatchEvent(
      new window.PointerEvent('pointerdown', {
        clientX: 32,
        clientY: 32,
        button: 0,
        buttons: 1,
        pointerId: 1,
      })
    );
    mapSurface.dispatchEvent(
      new window.PointerEvent('pointerup', {
        clientX: 32,
        clientY: 32,
        button: 0,
        buttons: 0,
        pointerId: 1,
      })
    );

    board.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));

    await new Promise((resolve) => setTimeout(resolve, 350));

    assert.equal(requests.length, 1, 'player interaction should trigger persistence');
    const payload = JSON.parse(requests[0].options.body);
    assert.deepEqual(payload.boardState.placements['scene-1'], []);
    assert.ok(Array.isArray(payload.boardState.templates['scene-1']));
    assert.ok(Array.isArray(payload.boardState.pings));
    assert.equal(payload.boardState.metadata.authorRole, 'player');
    assert.strictEqual(payload.boardState.metadata.authorIsGm, false);
    assert.equal(payload.boardState.metadata.authorId, 'player one');
    assert.ok(typeof payload.boardState.metadata.signature === 'string');
    assert.ok(!('mapUrl' in payload.boardState));
  } finally {
    globalThis.fetch = originalFetch;
    window.setInterval = originalSetInterval;
    window.clearInterval = originalClearInterval;
    dom.window.close();
  }
});

test('board state poller ignores stale player snapshot when newer GM data exists', async () => {
  let state = {
    boardState: {
      activeSceneId: 'scene-1',
      placements: { 'scene-1': [{ id: 'gm-token', column: 2, row: 2 }] },
      metadata: {
        updatedAt: 2000,
        signature: 'gm-2',
        authorRole: 'gm',
        authorIsGm: true,
      },
    },
  };

  const boardApi = {
    getState: () => state,
    updateState: (updater) => {
      const draft = JSON.parse(JSON.stringify(state));
      updater(draft);
      state = draft;
    },
  };

  const payloads = [
    {
      data: {
        boardState: {
          placements: { 'scene-1': [{ id: 'player-token', column: 5, row: 5 }] },
          metadata: {
            updatedAt: 1500,
            signature: 'player-1',
            authorRole: 'player',
            authorIsGm: false,
          },
        },
      },
    },
    {
      data: {
        boardState: {
          placements: { 'scene-1': [{ id: 'gm-token', column: 4, row: 5 }] },
          metadata: {
            updatedAt: 3000,
            signature: 'gm-3',
            authorRole: 'gm',
            authorIsGm: true,
          },
        },
      },
    },
  ];

  const hashes = ['hash-player', 'hash-gm'];

  const poller = createBoardStatePoller({
    stateEndpoint: '/state',
    boardApi,
    fetchFn: async () => {
      const payload = payloads.shift() ?? payloads[0];
      return { ok: true, json: async () => payload };
    },
    hashBoardStateSnapshotFn: () => hashes.shift() ?? `hash-${Date.now()}`,
    safeJsonStringifyFn: (value) => JSON.stringify(value),
    mergeBoardStateSnapshotFn: (_, incoming) => incoming,
    getCurrentUserIdFn: () => 'player one',
    normalizeProfileIdFn: (value) => value,
    getPendingSaveInfo: () => ({ pending: false }),
    getLastPersistedHashFn: () => null,
    getLastPersistedSignatureFn: () => null,
  });

  await poller.poll();
  assert.equal(state.boardState.metadata.signature, 'gm-2');
  assert.deepEqual(state.boardState.placements, { 'scene-1': [{ id: 'gm-token', column: 2, row: 2 }] });

  await poller.poll();
  assert.equal(state.boardState.metadata.signature, 'gm-3');
  assert.deepEqual(state.boardState.placements, { 'scene-1': [{ id: 'gm-token', column: 4, row: 5 }] });
});

test('polygon overlay clip path omits implicit bounding box', () => {
  const dom = createDom();
  try {
    const { window } = dom;
    const { document } = window;

    const board = document.getElementById('vtt-board-canvas');
    board.getBoundingClientRect = () => ({
      width: 640,
      height: 640,
      top: 0,
      right: 640,
      bottom: 640,
      left: 0,
    });

    const overlayPolygon = {
      points: [
        { column: 2, row: 3 },
        { column: 4, row: 3 },
        { column: 4, row: 6 },
        { column: 2, row: 6 },
      ],
    };

    const store = createMockStore({
      user: { isGM: true, name: 'GM' },
      scenes: { items: [{ id: 'scene-1', name: 'Scene 1' }] },
      boardState: {
        activeSceneId: 'scene-1',
        mapUrl: 'http://example.com/map.png',
        sceneState: {
          'scene-1': {
            overlay: buildOverlayState('http://example.com/overlay.png'),
          },
        },
        overlay: buildOverlayState('http://example.com/overlay.png'),
      },
      grid: { size: 64, visible: true },
    });

    mountBoardInteractions(store);

    const mapImage = document.getElementById('vtt-map-image');
    Object.defineProperty(mapImage, 'naturalWidth', { value: 640, configurable: true });
    Object.defineProperty(mapImage, 'naturalHeight', { value: 640, configurable: true });

    mapImage.onload?.();

    store.updateState((draft) => {
      const mask = { visible: true, polygons: [overlayPolygon] };
      draft.boardState.sceneState['scene-1'].overlay = buildOverlayState(
        'http://example.com/overlay.png',
        mask
      );
      draft.boardState.overlay = buildOverlayState('http://example.com/overlay.png', mask);
    });

    const mapOverlay = document.getElementById('vtt-map-overlay');
    const overlayLayer = mapOverlay.querySelector('.vtt-board__map-overlay-layer');
    assert.ok(overlayLayer, 'overlay layer element should render');
    const clipPath = overlayLayer.style.clipPath || overlayLayer.style.webkitClipPath;
    const expectedClipPath =
      "path('M 20% 30% L 40% 30% L 40% 60% L 20% 60% Z')";

    assert.equal(clipPath, expectedClipPath);
  } finally {
    dom.window.close();
  }
});
