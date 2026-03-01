import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { mountBoardInteractions } from '../board-interactions.js';

// ---------------------------------------------------------------------------
// These tests verify that the visibility-change handler only flushes board
// state when there are actual local (dirty) changes.  Previously, every
// tab switch sent a full-state snapshot that could overwrite other players'
// recent changes with the GM's stale local copy — the "popback" bug.
// ---------------------------------------------------------------------------

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
      </body>`,
    { url: 'http://localhost' }
  );

  const { window } = dom;
  globalThis.window = window;
  globalThis.document = window.document;
  Object.defineProperty(globalThis, 'navigator', {
    value: window.navigator,
    writable: true,
    configurable: true,
  });
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.Element = window.Element;
  globalThis.Node = window.Node;
  globalThis.CustomEvent = window.CustomEvent;
  globalThis.Event = window.Event;
  globalThis.getComputedStyle = window.getComputedStyle.bind(window);
  window.matchMedia ??= () => ({
    matches: false,
    addListener() {},
    removeListener() {},
  });
  globalThis.requestAnimationFrame =
    window.requestAnimationFrame?.bind(window) ?? ((cb) => setTimeout(cb, 16));
  globalThis.cancelAnimationFrame =
    window.cancelAnimationFrame?.bind(window) ?? ((id) => clearTimeout(id));

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

function createGmState() {
  return {
    user: { isGM: true, id: 'gm-user' },
    boardState: {
      activeSceneId: 'scene-1',
      placements: { 'scene-1': [] },
      sceneState: {
        'scene-1': { grid: { size: 64, locked: false, visible: true } },
      },
      templates: {},
      drawings: {},
    },
    scenes: { items: [{ id: 'scene-1', name: 'Test Scene' }] },
    grid: { size: 64, visible: true },
  };
}

/**
 * Dispatch a simulated visibilitychange event.  JSDOM's
 * document.visibilityState is read-only, so we override the property
 * before dispatching.
 */
function simulateVisibilityChange(state) {
  Object.defineProperty(document, 'visibilityState', {
    value: state,
    writable: true,
    configurable: true,
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

test('visibilitychange to hidden does NOT save board state when no dirty state', async (t) => {
  const dom = createDom();

  // Track POST requests (saves) separately from GET requests (polling)
  const postRequests = [];
  globalThis.fetch = async (url, options = {}) => {
    if (options.method === 'POST') {
      postRequests.push({ url, body: options.body });
    }
    return { ok: true, json: async () => ({ data: { boardState: {} } }) };
  };

  t.after(() => {
    dom.window.close();
  });

  const store = createMockStore(createGmState());
  mountBoardInteractions(store, { state: '/api/board-state' });

  // Let the initial poll complete
  await new Promise((resolve) => setTimeout(resolve, 50));

  // Clear tracked requests
  postRequests.length = 0;

  // Tab away — no dirty state, so no save should happen
  simulateVisibilityChange('hidden');
  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.equal(
    postRequests.length,
    0,
    'no POST should be sent when tabbing away with no dirty state'
  );
});

test('visibilitychange to hidden DOES save board state when dirty state exists', async (t) => {
  const dom = createDom();

  const postRequests = [];
  globalThis.fetch = async (url, options = {}) => {
    if (options.method === 'POST') {
      postRequests.push({ url, body: options.body });
    }
    return { ok: true, json: async () => ({ data: { boardState: {} } }) };
  };

  t.after(() => {
    dom.window.close();
  });

  const store = createMockStore(createGmState());
  mountBoardInteractions(store, { state: '/api/board-state' });

  // Let the initial poll complete
  await new Promise((resolve) => setTimeout(resolve, 50));
  postRequests.length = 0;

  // Create dirty state via the exposed API
  store._markSceneStateDirty?.('scene-1');

  // Tab away — dirty state exists, so a save should happen
  simulateVisibilityChange('hidden');
  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.ok(
    postRequests.length > 0,
    'POST should be sent when tabbing away with dirty state'
  );
});

test('visibilitychange to visible saves dirty state that failed while hidden', async (t) => {
  const dom = createDom();

  const postRequests = [];
  globalThis.fetch = async (url, options = {}) => {
    if (options.method === 'POST') {
      postRequests.push({ url, body: options.body });
    }
    return { ok: true, json: async () => ({ data: { boardState: {} } }) };
  };

  t.after(() => {
    dom.window.close();
  });

  const store = createMockStore(createGmState());
  mountBoardInteractions(store, { state: '/api/board-state' });

  // Let the initial poll complete
  await new Promise((resolve) => setTimeout(resolve, 50));
  postRequests.length = 0;

  // Create dirty state — simulates changes that weren't saved
  store._markSceneStateDirty?.('scene-1');

  // Returning to the tab should trigger a save for the dirty state
  simulateVisibilityChange('visible');
  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.ok(
    postRequests.length > 0,
    'POST should be sent when returning to tab with dirty state'
  );
});

test('visibilitychange to visible does NOT save when no dirty state', async (t) => {
  const dom = createDom();

  const postRequests = [];
  globalThis.fetch = async (url, options = {}) => {
    if (options.method === 'POST') {
      postRequests.push({ url, body: options.body });
    }
    return { ok: true, json: async () => ({ data: { boardState: {} } }) };
  };

  t.after(() => {
    dom.window.close();
  });

  const store = createMockStore(createGmState());
  mountBoardInteractions(store, { state: '/api/board-state' });

  // Let the initial poll complete
  await new Promise((resolve) => setTimeout(resolve, 50));
  postRequests.length = 0;

  // Tab back with no dirty state — no save should happen
  simulateVisibilityChange('visible');
  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.equal(
    postRequests.length,
    0,
    'no POST should be sent when returning to tab with no dirty state'
  );
});
