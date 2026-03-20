import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { mountBoardInteractions } from '../board-interactions.js';

// ---------------------------------------------------------------------------
// Helpers
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
            <div id="vtt-aura-layer"></div>
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
  window.matchMedia ??= () => ({ matches: false, addListener() {}, removeListener() {} });
  globalThis.requestAnimationFrame =
    window.requestAnimationFrame?.bind(window) ?? ((cb) => setTimeout(cb, 16));
  globalThis.cancelAnimationFrame =
    window.cancelAnimationFrame?.bind(window) ?? ((id) => clearTimeout(id));
  globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
  return dom;
}

function createMockStore(initialState) {
  let state = initialState;
  let subscriber = null;

  const clone = (value) => JSON.parse(JSON.stringify(value));

  return {
    getState: () => state,
    subscribe: (callback) => {
      subscriber = typeof callback === 'function' ? callback : null;
      return () => {
        if (subscriber === callback) subscriber = null;
      };
    },
    setState: (nextState) => {
      state = nextState;
      subscriber?.(state);
    },
    updateState: (updater) => {
      if (typeof updater !== 'function') return;
      const draft = clone(state);
      updater(draft);
      state = draft;
      subscriber?.(state);
    },
  };
}

function buildPcBoardState(placements = []) {
  return {
    user: { isGM: true },
    boardState: {
      activeSceneId: 'scene-1',
      placements: {
        'scene-1': placements,
      },
      scenes: [{ id: 'scene-1', name: 'Test Scene' }],
    },
    combatState: {},
    tokensState: {
      folders: [{ id: 'tfd_pc', name: "PC's" }],
      items: [],
    },
  };
}

function pcPlacement(id, name, currentHp, maxHp) {
  return {
    id,
    name,
    column: 0,
    row: 0,
    hp: { current: String(currentHp), max: String(maxHp) },
    metadata: { sourceFolderName: "PC's", authorRole: 'gm' },
  };
}

function sheetBroadcastEvent(character, currentStamina, staminaMax) {
  return {
    data: {
      type: 'stamina-sync',
      source: 'sheet',
      character,
      currentStamina,
      staminaMax,
    },
  };
}

function vttBroadcastEvent(character, currentStamina, staminaMax) {
  return {
    data: {
      type: 'stamina-sync',
      source: 'vtt',
      character,
      currentStamina,
      staminaMax,
    },
  };
}

// ---------------------------------------------------------------------------
// Tests: handleSheetStaminaBroadcast (direct unit tests)
// ---------------------------------------------------------------------------

test('handleSheetStaminaBroadcast updates PC token HP from sheet broadcast', () => {
  const dom = createDom();
  const store = createMockStore(
    buildPcBoardState([pcPlacement('plc-frunk', 'Frunk', 30, 50)])
  );

  globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
  const api = mountBoardInteractions(store, { sheet: '/api/sheet.php' });
  const { handleSheetStaminaBroadcast } = api.__testing;

  // Simulate sheet recovery: HP goes from 30 -> 42
  handleSheetStaminaBroadcast(sheetBroadcastEvent('Frunk', 42, 50));

  const state = store.getState();
  const placement = state.boardState.placements['scene-1'].find((p) => p.id === 'plc-frunk');
  assert.equal(placement.hp.current, '42', 'Token HP should update from sheet broadcast');
  assert.equal(placement.hp.max, '50', 'Token max HP should remain correct');

  dom.window.close();
});

test('handleSheetStaminaBroadcast ignores VTT-sourced messages', () => {
  const dom = createDom();
  const store = createMockStore(
    buildPcBoardState([pcPlacement('plc-frunk', 'Frunk', 30, 50)])
  );

  globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
  const api = mountBoardInteractions(store, { sheet: '/api/sheet.php' });
  const { handleSheetStaminaBroadcast } = api.__testing;

  // Simulate a VTT broadcast (should be ignored)
  handleSheetStaminaBroadcast(vttBroadcastEvent('Frunk', 99, 50));

  const state = store.getState();
  const placement = state.boardState.placements['scene-1'].find((p) => p.id === 'plc-frunk');
  assert.equal(placement.hp.current, '30', 'Token HP should NOT change from VTT-sourced broadcast');

  dom.window.close();
});

test('handleSheetStaminaBroadcast only updates PC placements, not monsters', () => {
  const dom = createDom();

  const monsterPlacement = {
    id: 'plc-monster',
    name: 'Frunk',
    column: 1,
    row: 1,
    hp: { current: '15', max: '15' },
    metadata: { sourceFolderName: 'Monsters' },
  };

  const store = createMockStore(
    buildPcBoardState([pcPlacement('plc-frunk', 'Frunk', 30, 50), monsterPlacement])
  );

  globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
  const api = mountBoardInteractions(store, { sheet: '/api/sheet.php' });
  const { handleSheetStaminaBroadcast } = api.__testing;

  handleSheetStaminaBroadcast(sheetBroadcastEvent('Frunk', 42, 50));

  const state = store.getState();
  const pc = state.boardState.placements['scene-1'].find((p) => p.id === 'plc-frunk');
  const monster = state.boardState.placements['scene-1'].find((p) => p.id === 'plc-monster');

  assert.equal(pc.hp.current, '42', 'PC placement should be updated');
  assert.equal(monster.hp.current, '15', 'Monster placement should NOT be updated');

  dom.window.close();
});

test('handleSheetStaminaBroadcast matches character name case-insensitively', () => {
  const dom = createDom();
  const store = createMockStore(
    buildPcBoardState([pcPlacement('plc-frunk', 'Frunk', 30, 50)])
  );

  globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
  const api = mountBoardInteractions(store, { sheet: '/api/sheet.php' });
  const { handleSheetStaminaBroadcast } = api.__testing;

  handleSheetStaminaBroadcast(sheetBroadcastEvent('frunk', 45, 50));

  const state = store.getState();
  const placement = state.boardState.placements['scene-1'].find((p) => p.id === 'plc-frunk');
  assert.equal(placement.hp.current, '45', 'Case-insensitive name should match');

  dom.window.close();
});

test('handleSheetStaminaBroadcast skips update when values unchanged', () => {
  const dom = createDom();
  const store = createMockStore(
    buildPcBoardState([pcPlacement('plc-frunk', 'Frunk', 42, 50)])
  );

  globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
  const api = mountBoardInteractions(store, { sheet: '/api/sheet.php' });
  const { handleSheetStaminaBroadcast } = api.__testing;

  // Track updateState calls
  let updateCount = 0;
  const origUpdate = store.updateState;
  store.updateState = (...args) => {
    updateCount++;
    return origUpdate(...args);
  };

  // Send same values as current
  handleSheetStaminaBroadcast(sheetBroadcastEvent('Frunk', 42, 50));

  assert.equal(updateCount, 0, 'Should not update store when HP values are unchanged');

  dom.window.close();
});

test('handleSheetStaminaBroadcast also updates overlays.hitPoints', () => {
  const dom = createDom();

  const placementWithOverlays = {
    ...pcPlacement('plc-frunk', 'Frunk', 30, 50),
    overlays: { hitPoints: { value: { current: '30', max: '50' } } },
  };

  const store = createMockStore(buildPcBoardState([placementWithOverlays]));

  globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
  const api = mountBoardInteractions(store, { sheet: '/api/sheet.php' });
  const { handleSheetStaminaBroadcast } = api.__testing;

  handleSheetStaminaBroadcast(sheetBroadcastEvent('Frunk', 42, 50));

  const state = store.getState();
  const placement = state.boardState.placements['scene-1'][0];
  assert.equal(placement.hp.current, '42');
  assert.equal(placement.overlays.hitPoints.value.current, '42', 'Overlay HP should also update');
  assert.equal(placement.overlays.hitPoints.value.max, '50');

  dom.window.close();
});

test('handleSheetStaminaBroadcast ignores messages with no character name', () => {
  const dom = createDom();
  const store = createMockStore(
    buildPcBoardState([pcPlacement('plc-frunk', 'Frunk', 30, 50)])
  );

  globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
  const api = mountBoardInteractions(store, { sheet: '/api/sheet.php' });
  const { handleSheetStaminaBroadcast } = api.__testing;

  handleSheetStaminaBroadcast(sheetBroadcastEvent('', 42, 50));

  const state = store.getState();
  const placement = state.boardState.placements['scene-1'][0];
  assert.equal(placement.hp.current, '30', 'Should not change when character name is empty');

  dom.window.close();
});

test('handleSheetStaminaBroadcast ignores non-stamina-sync messages', () => {
  const dom = createDom();
  const store = createMockStore(
    buildPcBoardState([pcPlacement('plc-frunk', 'Frunk', 30, 50)])
  );

  globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
  const api = mountBoardInteractions(store, { sheet: '/api/sheet.php' });
  const { handleSheetStaminaBroadcast } = api.__testing;

  handleSheetStaminaBroadcast({
    data: { type: 'other-message', source: 'sheet', character: 'Frunk', currentStamina: 99 },
  });

  const state = store.getState();
  const placement = state.boardState.placements['scene-1'][0];
  assert.equal(placement.hp.current, '30', 'Non-stamina messages should be ignored');

  dom.window.close();
});

// ---------------------------------------------------------------------------
// Tests: No oscillation / feedback loops
// ---------------------------------------------------------------------------

test('VTT damage syncs to sheet, then sheet recovery does NOT re-sync back to sheet', async () => {
  const dom = createDom();

  let sheetSyncCount = 0;
  globalThis.fetch = async (url, opts) => {
    if (opts?.method === 'POST' && String(opts.body ?? '').includes('sync-stamina')) {
      sheetSyncCount++;
    }
    return { ok: true, json: async () => ({ success: true }) };
  };

  const store = createMockStore(
    buildPcBoardState([pcPlacement('plc-frunk', 'Frunk', 50, 50)])
  );

  const api = mountBoardInteractions(store, { sheet: '/api/sheet.php' });
  const { applyDamageHealToPlacement, handleSheetStaminaBroadcast } = api.__testing;

  // Step 1: GM damages token by 15 (50 -> 35)
  const damageResult = applyDamageHealToPlacement('plc-frunk', 'damage', 15);
  assert.ok(damageResult, 'Damage should return a result');
  assert.equal(damageResult.current, 35, 'After damage, HP should be 35');

  // Wait for debounced sync to sheet
  await new Promise((resolve) => setTimeout(resolve, 600));
  const syncCountAfterDamage = sheetSyncCount;
  assert.ok(syncCountAfterDamage > 0, 'Damage should trigger sheet sync');

  // Step 2: Player uses recovery on character sheet (35 -> 47)
  handleSheetStaminaBroadcast(sheetBroadcastEvent('Frunk', 47, 50));

  const state = store.getState();
  const placement = state.boardState.placements['scene-1'].find((p) => p.id === 'plc-frunk');
  assert.equal(placement.hp.current, '47', 'Token should reflect recovery');

  // Wait to ensure no feedback loop
  await new Promise((resolve) => setTimeout(resolve, 800));
  assert.equal(
    sheetSyncCount,
    syncCountAfterDamage,
    'No additional sheet syncs should occur (no oscillation)'
  );

  dom.window.close();
});

test('Multiple rapid sheet broadcasts settle to final value without oscillation', () => {
  const dom = createDom();
  const store = createMockStore(
    buildPcBoardState([pcPlacement('plc-frunk', 'Frunk', 30, 50)])
  );

  globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
  const api = mountBoardInteractions(store, { sheet: '/api/sheet.php' });
  const { handleSheetStaminaBroadcast } = api.__testing;

  // Simulate rapid successive changes from sheet (e.g. multiple recoveries)
  handleSheetStaminaBroadcast(sheetBroadcastEvent('Frunk', 35, 50));
  handleSheetStaminaBroadcast(sheetBroadcastEvent('Frunk', 40, 50));
  handleSheetStaminaBroadcast(sheetBroadcastEvent('Frunk', 45, 50));

  const state = store.getState();
  const placement = state.boardState.placements['scene-1'].find((p) => p.id === 'plc-frunk');
  assert.equal(placement.hp.current, '45', 'Should settle to final value');

  dom.window.close();
});

test('handleSheetStaminaBroadcast correctly handles zero HP', () => {
  const dom = createDom();
  const store = createMockStore(
    buildPcBoardState([pcPlacement('plc-frunk', 'Frunk', 30, 50)])
  );

  globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
  const api = mountBoardInteractions(store, { sheet: '/api/sheet.php' });
  const { handleSheetStaminaBroadcast } = api.__testing;

  handleSheetStaminaBroadcast(sheetBroadcastEvent('Frunk', 0, 50));

  const state = store.getState();
  const placement = state.boardState.placements['scene-1'].find((p) => p.id === 'plc-frunk');
  assert.equal(placement.hp.current, '0', 'Zero HP should be preserved, not skipped');

  dom.window.close();
});

test('handleSheetStaminaBroadcast correctly handles negative HP', () => {
  const dom = createDom();
  const store = createMockStore(
    buildPcBoardState([pcPlacement('plc-frunk', 'Frunk', 5, 50)])
  );

  globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
  const api = mountBoardInteractions(store, { sheet: '/api/sheet.php' });
  const { handleSheetStaminaBroadcast } = api.__testing;

  handleSheetStaminaBroadcast(sheetBroadcastEvent('Frunk', -5, 50));

  const state = store.getState();
  const placement = state.boardState.placements['scene-1'].find((p) => p.id === 'plc-frunk');
  assert.equal(placement.hp.current, '-5', 'Negative HP should be preserved');

  dom.window.close();
});

// ---------------------------------------------------------------------------
// Tests: Negative HP via damage and display
// ---------------------------------------------------------------------------

test('VTT damage can produce negative HP (no floor at 0)', () => {
  const dom = createDom();
  const store = createMockStore(
    buildPcBoardState([pcPlacement('plc-frunk', 'Frunk', 5, 50)])
  );

  globalThis.fetch = async () => ({ ok: true, json: async () => ({ success: true }) });
  const api = mountBoardInteractions(store, { sheet: '/api/sheet.php' });
  const { applyDamageHealToPlacement } = api.__testing;

  const result = applyDamageHealToPlacement('plc-frunk', 'damage', 15);
  assert.ok(result, 'Damage should return a result');
  assert.equal(result.current, -10, 'HP should go negative: 5 - 15 = -10');

  const state = store.getState();
  const placement = state.boardState.placements['scene-1'].find((p) => p.id === 'plc-frunk');
  assert.equal(placement.hp.current, '-10', 'Stored HP should be -10');

  dom.window.close();
});

test('VTT damage to 0 exactly still works', () => {
  const dom = createDom();
  const store = createMockStore(
    buildPcBoardState([pcPlacement('plc-frunk', 'Frunk', 10, 50)])
  );

  globalThis.fetch = async () => ({ ok: true, json: async () => ({ success: true }) });
  const api = mountBoardInteractions(store, { sheet: '/api/sheet.php' });
  const { applyDamageHealToPlacement } = api.__testing;

  const result = applyDamageHealToPlacement('plc-frunk', 'damage', 10);
  assert.equal(result.current, 0, 'HP should be exactly 0');

  dom.window.close();
});

test('Negative HP syncs from sheet to token and back without corruption', async () => {
  const dom = createDom();

  let sheetSyncCount = 0;
  globalThis.fetch = async (url, opts) => {
    if (opts?.method === 'POST' && String(opts.body ?? '').includes('sync-stamina')) {
      sheetSyncCount++;
    }
    return { ok: true, json: async () => ({ success: true }) };
  };

  const store = createMockStore(
    buildPcBoardState([pcPlacement('plc-frunk', 'Frunk', 5, 50)])
  );

  const api = mountBoardInteractions(store, { sheet: '/api/sheet.php' });
  const { applyDamageHealToPlacement, handleSheetStaminaBroadcast } = api.__testing;

  // Step 1: Damage token into negative (5 - 20 = -15)
  const damageResult = applyDamageHealToPlacement('plc-frunk', 'damage', 20);
  assert.equal(damageResult.current, -15, 'Token should go to -15');

  await new Promise((resolve) => setTimeout(resolve, 600));
  const syncCountAfterDamage = sheetSyncCount;

  // Step 2: Sheet adjusts to -10 (e.g. some partial effect)
  handleSheetStaminaBroadcast(sheetBroadcastEvent('Frunk', -10, 50));

  const state = store.getState();
  const placement = state.boardState.placements['scene-1'].find((p) => p.id === 'plc-frunk');
  assert.equal(placement.hp.current, '-10', 'Token should update to -10 from sheet');

  // No oscillation
  await new Promise((resolve) => setTimeout(resolve, 800));
  assert.equal(sheetSyncCount, syncCountAfterDamage, 'No feedback loop with negative values');

  dom.window.close();
});

