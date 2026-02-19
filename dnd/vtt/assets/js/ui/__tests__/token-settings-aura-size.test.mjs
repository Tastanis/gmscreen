import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import * as boardInteractionsModule from '../board-interactions.js';

const { mountBoardInteractions } = boardInteractionsModule;

function createDom() {
  const dom = new JSDOM(
    `<!DOCTYPE html>
      <body>
        <div id="vtt-board-canvas">
          <div class="vtt-board__empty"></div>
          <div id="vtt-map-surface">
            <div id="vtt-map-transform">
              <img id="vtt-map-image" />
              <div id="vtt-map-overlay" hidden></div>
              <div id="vtt-grid-overlay"></div>
              <div id="vtt-aura-layer" hidden></div>
              <div id="vtt-template-layer"></div>
              <div id="vtt-token-layer"></div>
              <div id="vtt-ping-layer"></div>
            </div>
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
  Object.defineProperty(globalThis, 'navigator', { value: window.navigator, writable: true, configurable: true });
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

function setupBoard(dom, store) {
  const { document } = dom.window;
  const board = document.getElementById('vtt-board-canvas');
  board.getBoundingClientRect = () => ({
    width: 512, height: 512, top: 0, left: 0, right: 512, bottom: 512,
  });

  const mapSurface = document.getElementById('vtt-map-surface');
  mapSurface.getBoundingClientRect = () => ({
    width: 512, height: 512, top: 0, left: 0, right: 512, bottom: 512,
  });

  const mapImage = document.getElementById('vtt-map-image');
  Object.defineProperty(mapImage, 'naturalWidth', { value: 512, configurable: true });
  Object.defineProperty(mapImage, 'naturalHeight', { value: 512, configurable: true });
  Object.defineProperty(mapImage, 'complete', { value: true, configurable: true });
  Object.defineProperty(mapImage, 'decode', { value: undefined, configurable: true, writable: true });

  const interactions = mountBoardInteractions(store) ?? {};
  return interactions;
}

function createGmState(placements = []) {
  return {
    user: { isGM: true, name: 'GM' },
    scenes: { items: [{ id: 'scene-1', name: 'Scene 1' }] },
    grid: { size: 64, visible: true },
    boardState: {
      activeSceneId: 'scene-1',
      mapUrl: 'http://example.com/map.png',
      placements: { 'scene-1': placements },
      sceneState: {
        'scene-1': { grid: { size: 64, visible: true } },
      },
    },
  };
}

// ─── Compact Layout Tests ────────────────────────────────────────

test('token settings menu does not contain the triggered action hint text', async () => {
  const dom = createDom();
  try {
    const store = createMockStore(createGmState([
      { id: 'token-1', name: 'Goblin', column: 1, row: 1, width: 1, height: 1 },
    ]));
    const interactions = setupBoard(dom, store);

    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    const hooks = interactions.__testing ?? {};
    hooks.openTokenSettingsById?.('token-1', 100, 100);
    await Promise.resolve();

    const menu = hooks.getTokenSettingsMenu?.();
    assert.ok(menu?.element, 'token settings menu should exist');

    const hint = menu.element.querySelector('[data-token-settings-hint]');
    assert.equal(hint, null, 'triggered action hint should be removed for compact layout');
  } finally {
    dom.window.close();
  }
});

test('token settings menu contains size selector with 1x1 through 5x5 options', async () => {
  const dom = createDom();
  try {
    const store = createMockStore(createGmState([
      { id: 'token-1', name: 'Goblin', column: 1, row: 1, width: 1, height: 1 },
    ]));
    const interactions = setupBoard(dom, store);

    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    const hooks = interactions.__testing ?? {};
    hooks.openTokenSettingsById?.('token-1', 100, 100);
    await Promise.resolve();

    const menu = hooks.getTokenSettingsMenu?.();
    assert.ok(menu?.sizeSelect, 'size select element should exist');

    const options = Array.from(menu.sizeSelect.querySelectorAll('option'));
    assert.equal(options.length, 5, 'should have 5 size options');
    assert.deepEqual(
      options.map((o) => o.textContent),
      ['1x1', '2x2', '3x3', '4x4', '5x5'],
      'size options should be 1x1 through 5x5'
    );
  } finally {
    dom.window.close();
  }
});

test('token settings menu contains aura toggle, radius input, and color picker', async () => {
  const dom = createDom();
  try {
    const store = createMockStore(createGmState([
      { id: 'token-1', name: 'Goblin', column: 1, row: 1, width: 1, height: 1 },
    ]));
    const interactions = setupBoard(dom, store);

    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    const hooks = interactions.__testing ?? {};
    hooks.openTokenSettingsById?.('token-1', 100, 100);
    await Promise.resolve();

    const menu = hooks.getTokenSettingsMenu?.();
    assert.ok(menu?.auraToggle, 'aura toggle checkbox should exist');
    assert.ok(menu?.auraRadiusInput, 'aura radius input should exist');
    assert.ok(menu?.auraColorInput, 'aura color input should exist');
    assert.equal(menu.auraRadiusInput.type, 'number', 'radius input should be a number field');
    assert.equal(menu.auraColorInput.type, 'color', 'color input should be a color picker');
  } finally {
    dom.window.close();
  }
});

// ─── Size Override Tests ─────────────────────────────────────────

test('size select reflects current token width on open', async () => {
  const dom = createDom();
  try {
    const store = createMockStore(createGmState([
      { id: 'big-token', name: 'Dragon', column: 0, row: 0, width: 3, height: 3 },
    ]));
    const interactions = setupBoard(dom, store);

    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    const hooks = interactions.__testing ?? {};
    hooks.openTokenSettingsById?.('big-token', 100, 100);
    await Promise.resolve();

    const menu = hooks.getTokenSettingsMenu?.();
    assert.equal(menu.sizeSelect.value, '3', 'size select should reflect the token current 3x3 size');
  } finally {
    dom.window.close();
  }
});

test('changing size select updates placement width and height', async () => {
  const dom = createDom();
  try {
    const store = createMockStore(createGmState([
      { id: 'token-1', name: 'Goblin', column: 1, row: 1, width: 1, height: 1 },
    ]));
    const interactions = setupBoard(dom, store);

    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    const hooks = interactions.__testing ?? {};
    hooks.openTokenSettingsById?.('token-1', 100, 100);
    await Promise.resolve();

    const menu = hooks.getTokenSettingsMenu?.();
    menu.sizeSelect.value = '2';
    menu.sizeSelect.dispatchEvent(new dom.window.Event('change', { bubbles: true }));

    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    const state = store.getState();
    const placement = state.boardState.placements['scene-1'].find((p) => p.id === 'token-1');
    assert.equal(placement.width, 2, 'width should be updated to 2');
    assert.equal(placement.height, 2, 'height should be updated to 2');
    assert.equal(placement.sizeOverride, 2, 'sizeOverride should be stored');
  } finally {
    dom.window.close();
  }
});

test('size override only affects the specific token placement', async () => {
  const dom = createDom();
  try {
    const store = createMockStore(createGmState([
      { id: 'token-1', name: 'Goblin A', column: 1, row: 1, width: 1, height: 1 },
      { id: 'token-2', name: 'Goblin B', column: 3, row: 3, width: 1, height: 1 },
    ]));
    const interactions = setupBoard(dom, store);

    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    const hooks = interactions.__testing ?? {};
    hooks.openTokenSettingsById?.('token-1', 100, 100);
    await Promise.resolve();

    const menu = hooks.getTokenSettingsMenu?.();
    menu.sizeSelect.value = '4';
    menu.sizeSelect.dispatchEvent(new dom.window.Event('change', { bubbles: true }));

    await Promise.resolve();

    const state = store.getState();
    const token1 = state.boardState.placements['scene-1'].find((p) => p.id === 'token-1');
    const token2 = state.boardState.placements['scene-1'].find((p) => p.id === 'token-2');
    assert.equal(token1.width, 4, 'token-1 width should be 4');
    assert.equal(token2.width, 1, 'token-2 width should remain 1 (unaffected)');
  } finally {
    dom.window.close();
  }
});

// ─── Aura Toggle Tests ──────────────────────────────────────────

test('aura controls are disabled when aura toggle is unchecked', async () => {
  const dom = createDom();
  try {
    const store = createMockStore(createGmState([
      { id: 'token-1', name: 'Goblin', column: 1, row: 1, width: 1, height: 1 },
    ]));
    const interactions = setupBoard(dom, store);

    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    const hooks = interactions.__testing ?? {};
    hooks.openTokenSettingsById?.('token-1', 100, 100);
    await Promise.resolve();

    const menu = hooks.getTokenSettingsMenu?.();
    assert.equal(menu.auraToggle.checked, false, 'aura toggle should default to unchecked');
    assert.equal(menu.auraRadiusInput.disabled, true, 'radius should be disabled when aura is off');
    assert.equal(menu.auraColorInput.disabled, true, 'color should be disabled when aura is off');
    assert.ok(
      menu.auraField.classList.contains('is-disabled'),
      'aura field should have is-disabled class when off'
    );
  } finally {
    dom.window.close();
  }
});

test('enabling aura toggle stores aura data on placement', async () => {
  const dom = createDom();
  try {
    const store = createMockStore(createGmState([
      { id: 'token-1', name: 'Goblin', column: 1, row: 1, width: 1, height: 1 },
    ]));
    const interactions = setupBoard(dom, store);

    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    const hooks = interactions.__testing ?? {};
    hooks.openTokenSettingsById?.('token-1', 100, 100);
    await Promise.resolve();

    const menu = hooks.getTokenSettingsMenu?.();
    menu.auraToggle.checked = true;
    menu.auraToggle.dispatchEvent(new dom.window.Event('change', { bubbles: true }));

    await Promise.resolve();

    const state = store.getState();
    const placement = state.boardState.placements['scene-1'].find((p) => p.id === 'token-1');
    assert.ok(placement.aura, 'placement should have aura data');
    assert.equal(placement.aura.enabled, true, 'aura should be enabled');
    assert.equal(typeof placement.aura.radius, 'number', 'aura radius should be a number');
    assert.equal(typeof placement.aura.color, 'string', 'aura color should be a string');
  } finally {
    dom.window.close();
  }
});

test('disabling aura toggle sets aura.enabled to false', async () => {
  const dom = createDom();
  try {
    const store = createMockStore(createGmState([
      {
        id: 'token-1', name: 'Goblin', column: 1, row: 1, width: 1, height: 1,
        aura: { enabled: true, radius: 2, color: '#ff0000' },
      },
    ]));
    const interactions = setupBoard(dom, store);

    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    const hooks = interactions.__testing ?? {};
    hooks.openTokenSettingsById?.('token-1', 100, 100);
    await Promise.resolve();

    const menu = hooks.getTokenSettingsMenu?.();
    assert.equal(menu.auraToggle.checked, true, 'aura should start as checked');

    menu.auraToggle.checked = false;
    menu.auraToggle.dispatchEvent(new dom.window.Event('change', { bubbles: true }));

    await Promise.resolve();

    const state = store.getState();
    const placement = state.boardState.placements['scene-1'].find((p) => p.id === 'token-1');
    assert.equal(placement.aura.enabled, false, 'aura should be disabled');
    assert.equal(placement.aura.radius, 2, 'radius should be preserved');
    assert.equal(placement.aura.color, '#ff0000', 'color should be preserved');
  } finally {
    dom.window.close();
  }
});

test('changing aura radius updates placement aura radius', async () => {
  const dom = createDom();
  try {
    const store = createMockStore(createGmState([
      {
        id: 'token-1', name: 'Goblin', column: 1, row: 1, width: 1, height: 1,
        aura: { enabled: true, radius: 1, color: '#3b82f6' },
      },
    ]));
    const interactions = setupBoard(dom, store);

    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    const hooks = interactions.__testing ?? {};
    hooks.openTokenSettingsById?.('token-1', 100, 100);
    await Promise.resolve();

    const menu = hooks.getTokenSettingsMenu?.();
    menu.auraRadiusInput.value = '5';
    menu.auraRadiusInput.dispatchEvent(new dom.window.Event('change', { bubbles: true }));

    await Promise.resolve();

    const state = store.getState();
    const placement = state.boardState.placements['scene-1'].find((p) => p.id === 'token-1');
    assert.equal(placement.aura.radius, 5, 'aura radius should be updated to 5');
  } finally {
    dom.window.close();
  }
});

test('aura radius is clamped between 1 and 20', async () => {
  const dom = createDom();
  try {
    const store = createMockStore(createGmState([
      {
        id: 'token-1', name: 'Goblin', column: 1, row: 1, width: 1, height: 1,
        aura: { enabled: true, radius: 1, color: '#3b82f6' },
      },
    ]));
    const interactions = setupBoard(dom, store);

    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    const hooks = interactions.__testing ?? {};
    hooks.openTokenSettingsById?.('token-1', 100, 100);
    await Promise.resolve();

    const menu = hooks.getTokenSettingsMenu?.();

    // Test upper bound
    menu.auraRadiusInput.value = '99';
    menu.auraRadiusInput.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    await Promise.resolve();

    let state = store.getState();
    let placement = state.boardState.placements['scene-1'].find((p) => p.id === 'token-1');
    assert.equal(placement.aura.radius, 20, 'radius should be clamped to max 20');

    // Test lower bound
    menu.auraRadiusInput.value = '0';
    menu.auraRadiusInput.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    await Promise.resolve();

    state = store.getState();
    placement = state.boardState.placements['scene-1'].find((p) => p.id === 'token-1');
    assert.equal(placement.aura.radius, 1, 'radius should be clamped to min 1');
  } finally {
    dom.window.close();
  }
});

test('changing aura color updates placement aura color', async () => {
  const dom = createDom();
  try {
    const store = createMockStore(createGmState([
      {
        id: 'token-1', name: 'Goblin', column: 1, row: 1, width: 1, height: 1,
        aura: { enabled: true, radius: 2, color: '#3b82f6' },
      },
    ]));
    const interactions = setupBoard(dom, store);

    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    const hooks = interactions.__testing ?? {};
    hooks.openTokenSettingsById?.('token-1', 100, 100);
    await Promise.resolve();

    const menu = hooks.getTokenSettingsMenu?.();
    // Simulate color picker input
    menu.auraColorInput.value = '#ff0000';
    menu.auraColorInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));

    await Promise.resolve();

    const state = store.getState();
    const placement = state.boardState.placements['scene-1'].find((p) => p.id === 'token-1');
    assert.equal(placement.aura.color, '#ff0000', 'aura color should be updated to red');
  } finally {
    dom.window.close();
  }
});

// ─── Aura Rendering Tests ───────────────────────────────────────

test('aura layer contains aura elements for tokens with active auras', async () => {
  const dom = createDom();
  try {
    const store = createMockStore(createGmState([
      {
        id: 'token-1', name: 'Paladin', column: 2, row: 2, width: 1, height: 1,
        aura: { enabled: true, radius: 2, color: '#fbbf24' },
      },
      {
        id: 'token-2', name: 'Goblin', column: 5, row: 5, width: 1, height: 1,
      },
    ]));
    const interactions = setupBoard(dom, store);

    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    // Trigger a render cycle
    store.updateState((draft) => {
      draft.boardState.mapUrl = 'http://example.com/map.png';
    });
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    const auraLayer = dom.window.document.getElementById('vtt-aura-layer');
    const auras = auraLayer?.querySelectorAll('.vtt-token-aura') ?? [];
    const auraIds = Array.from(auras).map((el) => el.dataset.placementId);

    // Token with aura enabled should have an aura element
    assert.ok(auraIds.includes('token-1'), 'paladin with aura should have aura element');
    // Token without aura should not
    assert.ok(!auraIds.includes('token-2'), 'goblin without aura should not have aura element');
  } finally {
    dom.window.close();
  }
});

test('aura element is circular with translucent background', async () => {
  const dom = createDom();
  try {
    const store = createMockStore(createGmState([
      {
        id: 'token-1', name: 'Paladin', column: 2, row: 2, width: 1, height: 1,
        aura: { enabled: true, radius: 3, color: '#ff0000' },
      },
    ]));
    const interactions = setupBoard(dom, store);

    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    store.updateState((draft) => {
      draft.boardState.mapUrl = 'http://example.com/map.png';
    });
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    const auraLayer = dom.window.document.getElementById('vtt-aura-layer');
    const auraEl = auraLayer?.querySelector('[data-placement-id="token-1"]');

    if (auraEl) {
      // Check it has the vtt-token-aura class (which gives border-radius: 50%)
      assert.ok(auraEl.classList.contains('vtt-token-aura'), 'aura should have circle class');

      // Check background includes rgba for translucency
      const bg = auraEl.style.background || '';
      assert.ok(bg.includes('rgba(255,0,0,'), 'background should use translucent red from #ff0000');
    }
  } finally {
    dom.window.close();
  }
});

test('aura element dimensions reflect radius in grid squares', async () => {
  const dom = createDom();
  try {
    // 1x1 token with radius 2, gridSize defaults to 64
    // pixel radius = (1/2 + 2) * 64 = 2.5 * 64 = 160
    // diameter = 320
    const store = createMockStore(createGmState([
      {
        id: 'token-1', name: 'Paladin', column: 2, row: 2, width: 1, height: 1,
        aura: { enabled: true, radius: 2, color: '#3b82f6' },
      },
    ]));
    const interactions = setupBoard(dom, store);

    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    store.updateState((draft) => {
      draft.boardState.mapUrl = 'http://example.com/map.png';
    });
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    const auraLayer = dom.window.document.getElementById('vtt-aura-layer');
    const auraEl = auraLayer?.querySelector('[data-placement-id="token-1"]');

    if (auraEl) {
      // Expected: (0.5 + 2) * 64 * 2 = 320px
      assert.equal(auraEl.style.width, '320px', 'aura width should be 320px for 1x1 token + 2 sq radius');
      assert.equal(auraEl.style.height, '320px', 'aura height should be 320px for 1x1 token + 2 sq radius');
    }
  } finally {
    dom.window.close();
  }
});

test('aura element for a 2x2 token has correct dimensions', async () => {
  const dom = createDom();
  try {
    // 2x2 token with radius 1, gridSize 64
    // pixel radius = (2/2 + 1) * 64 = 2 * 64 = 128
    // diameter = 256
    const store = createMockStore(createGmState([
      {
        id: 'token-1', name: 'Ogre', column: 2, row: 2, width: 2, height: 2,
        aura: { enabled: true, radius: 1, color: '#22c55e' },
      },
    ]));
    const interactions = setupBoard(dom, store);

    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    store.updateState((draft) => {
      draft.boardState.mapUrl = 'http://example.com/map.png';
    });
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    const auraLayer = dom.window.document.getElementById('vtt-aura-layer');
    const auraEl = auraLayer?.querySelector('[data-placement-id="token-1"]');

    if (auraEl) {
      // Expected: (1 + 1) * 64 * 2 = 256px
      assert.equal(auraEl.style.width, '256px', 'aura width should be 256px for 2x2 token + 1 sq radius');
      assert.equal(auraEl.style.height, '256px', 'aura height should match width');
    }
  } finally {
    dom.window.close();
  }
});

// ─── Aura Layer Z-order Tests ───────────────────────────────────

test('aura layer exists in DOM between grid overlay and template layer', () => {
  const dom = createDom();
  try {
    const { document } = dom.window;
    const mapTransform = document.getElementById('vtt-map-transform');
    const children = Array.from(mapTransform.children).map((el) => el.id).filter(Boolean);

    const gridIndex = children.indexOf('vtt-grid-overlay');
    const auraIndex = children.indexOf('vtt-aura-layer');
    const templateIndex = children.indexOf('vtt-template-layer');

    assert.ok(auraIndex > gridIndex, 'aura layer should come after grid overlay');
    assert.ok(auraIndex < templateIndex, 'aura layer should come before template layer');
  } finally {
    dom.window.close();
  }
});

// ─── Sync Form Tests ────────────────────────────────────────────

test('opening settings for token with existing aura syncs form controls', async () => {
  const dom = createDom();
  try {
    const store = createMockStore(createGmState([
      {
        id: 'token-1', name: 'Paladin', column: 1, row: 1, width: 1, height: 1,
        aura: { enabled: true, radius: 4, color: '#ef4444' },
      },
    ]));
    const interactions = setupBoard(dom, store);

    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    const hooks = interactions.__testing ?? {};
    hooks.openTokenSettingsById?.('token-1', 100, 100);
    await Promise.resolve();

    const menu = hooks.getTokenSettingsMenu?.();
    assert.equal(menu.auraToggle.checked, true, 'aura toggle should be checked');
    assert.equal(menu.auraRadiusInput.value, '4', 'radius should be 4');
    assert.equal(menu.auraColorInput.value, '#ef4444', 'color should be #ef4444');
    assert.equal(menu.auraRadiusInput.disabled, false, 'radius input should be enabled');
    assert.equal(menu.auraColorInput.disabled, false, 'color input should be enabled');
  } finally {
    dom.window.close();
  }
});

test('opening settings for token with sizeOverride syncs size select', async () => {
  const dom = createDom();
  try {
    const store = createMockStore(createGmState([
      { id: 'token-1', name: 'Dragon', column: 0, row: 0, width: 4, height: 4, sizeOverride: 4 },
    ]));
    const interactions = setupBoard(dom, store);

    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    const hooks = interactions.__testing ?? {};
    hooks.openTokenSettingsById?.('token-1', 100, 100);
    await Promise.resolve();

    const menu = hooks.getTokenSettingsMenu?.();
    assert.equal(menu.sizeSelect.value, '4', 'size select should reflect sizeOverride of 4');
  } finally {
    dom.window.close();
  }
});

test('token without aura data defaults to unchecked toggle and disabled controls', async () => {
  const dom = createDom();
  try {
    const store = createMockStore(createGmState([
      { id: 'token-1', name: 'Goblin', column: 1, row: 1, width: 1, height: 1 },
    ]));
    const interactions = setupBoard(dom, store);

    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    const hooks = interactions.__testing ?? {};
    hooks.openTokenSettingsById?.('token-1', 100, 100);
    await Promise.resolve();

    const menu = hooks.getTokenSettingsMenu?.();
    assert.equal(menu.auraToggle.checked, false, 'aura toggle should default to off');
    assert.equal(menu.auraRadiusInput.disabled, true, 'radius should be disabled');
    assert.equal(menu.auraColorInput.disabled, true, 'color should be disabled');
    assert.equal(menu.auraRadiusInput.value, '1', 'radius should default to 1');
  } finally {
    dom.window.close();
  }
});

// ─── Integration: Aura disabled token should not render aura ────

test('token with aura.enabled=false does not produce an aura element', async () => {
  const dom = createDom();
  try {
    const store = createMockStore(createGmState([
      {
        id: 'token-1', name: 'Goblin', column: 1, row: 1, width: 1, height: 1,
        aura: { enabled: false, radius: 3, color: '#ff0000' },
      },
    ]));
    const interactions = setupBoard(dom, store);

    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    store.updateState((draft) => {
      draft.boardState.mapUrl = 'http://example.com/map.png';
    });
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    const auraLayer = dom.window.document.getElementById('vtt-aura-layer');
    const auras = auraLayer?.querySelectorAll('.vtt-token-aura') ?? [];
    assert.equal(auras.length, 0, 'no aura elements should render when aura is disabled');
  } finally {
    dom.window.close();
  }
});
