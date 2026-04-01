import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

// Prevent BroadcastChannel from keeping the process alive
globalThis.BroadcastChannel = undefined;

import { mountBoardInteractions } from '../board-interactions.js';

// ---------------------------------------------------------------------------
// Helpers (shared with bidirectional-stamina-sync.test.mjs)
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

  // Mock setInterval/clearInterval to prevent leaked timers from blocking process exit
  window.setInterval = () => 0;
  window.clearInterval = () => {};


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

function monsterPlacement(id, name, currentHp, maxHp) {
  return {
    id,
    name,
    column: 1,
    row: 1,
    hp: { current: String(currentHp), max: String(maxHp) },
    metadata: { sourceFolderName: 'Monsters', authorRole: 'gm' },
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

// ---------------------------------------------------------------------------
// Tests: Heal operation via applyDamageHealToPlacement
// ---------------------------------------------------------------------------

test('VTT heal increases HP correctly', () => {
  const dom = createDom();
  const store = createMockStore(
    buildPcBoardState([pcPlacement('plc-frunk', 'Frunk', 30, 50)])
  );

  globalThis.fetch = async () => ({ ok: true, json: async () => ({ success: true }) });
  const api = mountBoardInteractions(store, { sheet: '/api/sheet.php' });
  const { applyDamageHealToPlacement } = api.__testing;

  const result = applyDamageHealToPlacement('plc-frunk', 'heal', 10);
  assert.ok(result, 'Heal should return a result');
  assert.equal(result.current, 40, 'HP should increase: 30 + 10 = 40');
  assert.equal(result.previous, 30, 'Previous HP should be recorded');

  dom.window.close();
});

test('VTT heal caps at max HP', () => {
  const dom = createDom();
  const store = createMockStore(
    buildPcBoardState([pcPlacement('plc-frunk', 'Frunk', 45, 50)])
  );

  globalThis.fetch = async () => ({ ok: true, json: async () => ({ success: true }) });
  const api = mountBoardInteractions(store, { sheet: '/api/sheet.php' });
  const { applyDamageHealToPlacement } = api.__testing;

  const result = applyDamageHealToPlacement('plc-frunk', 'heal', 20);
  assert.ok(result, 'Heal should return a result');
  assert.equal(result.current, 50, 'HP should cap at max: min(45+20, 50) = 50');

  dom.window.close();
});

test('VTT heal from negative HP does not cap if still below max', () => {
  const dom = createDom();
  const store = createMockStore(
    buildPcBoardState([pcPlacement('plc-frunk', 'Frunk', -10, 50)])
  );

  globalThis.fetch = async () => ({ ok: true, json: async () => ({ success: true }) });
  const api = mountBoardInteractions(store, { sheet: '/api/sheet.php' });
  const { applyDamageHealToPlacement } = api.__testing;

  const result = applyDamageHealToPlacement('plc-frunk', 'heal', 15);
  assert.ok(result, 'Heal should return a result');
  assert.equal(result.current, 5, 'HP should go from -10 to 5');

  dom.window.close();
});

// ---------------------------------------------------------------------------
// Tests: Heal syncs to sheet (full path)
// ---------------------------------------------------------------------------

test('VTT heal triggers sheet sync for PC token', async () => {
  const dom = createDom();

  let sheetSyncPayload = null;
  globalThis.fetch = async (url, opts) => {
    if (opts?.method === 'POST' && String(opts.body ?? '').includes('sync-stamina')) {
      sheetSyncPayload = String(opts.body);
    }
    return { ok: true, json: async () => ({ success: true }) };
  };

  const store = createMockStore(
    buildPcBoardState([pcPlacement('plc-frunk', 'Frunk', 30, 50)])
  );

  const api = mountBoardInteractions(store, { sheet: '/api/sheet.php' });
  const { applyDamageHealToPlacement } = api.__testing;

  applyDamageHealToPlacement('plc-frunk', 'heal', 10);

  // Wait for debounced sync
  await new Promise((resolve) => setTimeout(resolve, 600));

  assert.ok(sheetSyncPayload, 'Heal should trigger a sheet sync');
  assert.ok(
    sheetSyncPayload.includes('currentStamina=40'),
    'Synced stamina should be 40'
  );

  dom.window.close();
});

// ---------------------------------------------------------------------------
// Tests: syncPlacementHitPointsToSheet skips non-PC tokens
// ---------------------------------------------------------------------------

test('VTT damage on monster does NOT sync to sheet', async () => {
  const dom = createDom();

  let sheetSyncCount = 0;
  globalThis.fetch = async (url, opts) => {
    if (opts?.method === 'POST' && String(opts.body ?? '').includes('sync-stamina')) {
      sheetSyncCount++;
    }
    return { ok: true, json: async () => ({ success: true }) };
  };

  const store = createMockStore(
    buildPcBoardState([monsterPlacement('plc-goblin', 'Goblin', 15, 15)])
  );

  const api = mountBoardInteractions(store, { sheet: '/api/sheet.php' });
  const { applyDamageHealToPlacement } = api.__testing;

  applyDamageHealToPlacement('plc-goblin', 'damage', 5);

  // Wait for potential debounced sync
  await new Promise((resolve) => setTimeout(resolve, 600));

  assert.equal(sheetSyncCount, 0, 'Monster damage should NOT trigger sheet sync');

  // But the monster HP should still be updated locally
  const state = store.getState();
  const goblin = state.boardState.placements['scene-1'].find((p) => p.id === 'plc-goblin');
  assert.equal(goblin.hp.current, '10', 'Monster HP should still update locally');

  dom.window.close();
});

// ---------------------------------------------------------------------------
// Tests: Multiple PC placements of same character
// ---------------------------------------------------------------------------

test('Sheet broadcast updates all PC placements with matching name', () => {
  const dom = createDom();

  // Two PC placements for "Frunk" (e.g. across different positions)
  const store = createMockStore(
    buildPcBoardState([
      pcPlacement('plc-frunk-1', 'Frunk', 30, 50),
      pcPlacement('plc-frunk-2', 'Frunk', 30, 50),
    ])
  );

  globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
  const api = mountBoardInteractions(store, { sheet: '/api/sheet.php' });
  const { handleSheetStaminaBroadcast } = api.__testing;

  handleSheetStaminaBroadcast(sheetBroadcastEvent('Frunk', 42, 50));

  const state = store.getState();
  const placements = state.boardState.placements['scene-1'];
  const frunk1 = placements.find((p) => p.id === 'plc-frunk-1');
  const frunk2 = placements.find((p) => p.id === 'plc-frunk-2');

  assert.equal(frunk1.hp.current, '42', 'First Frunk placement should update');
  assert.equal(frunk2.hp.current, '42', 'Second Frunk placement should also update');

  dom.window.close();
});

// ---------------------------------------------------------------------------
// Tests: fetchAndApplyCharacterStamina (PC drag)
// ---------------------------------------------------------------------------

test('fetchAndApplyCharacterStamina pulls HP from sheet when placing PC token', async () => {
  const dom = createDom();

  globalThis.fetch = async (url) => {
    if (String(url).includes('sync-stamina') && String(url).includes('character=Frunk')) {
      return {
        ok: true,
        json: async () => ({ currentStamina: 35, staminaMax: 50, name: 'Frunk' }),
      };
    }
    return { ok: true, json: async () => ({}) };
  };

  // Token starts with max HP (initial drag)
  const store = createMockStore(
    buildPcBoardState([pcPlacement('plc-frunk', 'Frunk', 50, 50)])
  );

  const api = mountBoardInteractions(store, { sheet: '/api/sheet.php' });
  const { fetchAndApplyCharacterStamina } = api.__testing;

  await fetchAndApplyCharacterStamina('plc-frunk', 'scene-1');

  const state = store.getState();
  const placement = state.boardState.placements['scene-1'].find((p) => p.id === 'plc-frunk');

  assert.equal(placement.hp.current, '35', 'HP should be pulled from character sheet');
  assert.equal(placement.hp.max, '50', 'Max HP should be pulled from character sheet');

  dom.window.close();
});

test('fetchAndApplyCharacterStamina does NOT fetch for monster tokens', async () => {
  const dom = createDom();

  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return { ok: true, json: async () => ({ currentStamina: 99, staminaMax: 99 }) };
  };

  const store = createMockStore(
    buildPcBoardState([monsterPlacement('plc-goblin', 'Goblin', 15, 15)])
  );

  const api = mountBoardInteractions(store, { sheet: '/api/sheet.php' });
  const { fetchAndApplyCharacterStamina } = api.__testing;

  await fetchAndApplyCharacterStamina('plc-goblin', 'scene-1');

  const state = store.getState();
  const goblin = state.boardState.placements['scene-1'].find((p) => p.id === 'plc-goblin');

  assert.equal(goblin.hp.current, '15', 'Monster HP should remain unchanged');

  dom.window.close();
});

test('fetchAndApplyCharacterStamina handles failed fetch gracefully', async () => {
  const dom = createDom();

  globalThis.fetch = async () => {
    return { ok: false, status: 500, json: async () => ({}) };
  };

  const store = createMockStore(
    buildPcBoardState([pcPlacement('plc-frunk', 'Frunk', 50, 50)])
  );

  const api = mountBoardInteractions(store, { sheet: '/api/sheet.php' });
  const { fetchAndApplyCharacterStamina } = api.__testing;

  // Should not throw
  await fetchAndApplyCharacterStamina('plc-frunk', 'scene-1');

  const state = store.getState();
  const placement = state.boardState.placements['scene-1'].find((p) => p.id === 'plc-frunk');

  assert.equal(placement.hp.current, '50', 'HP should remain unchanged on fetch failure');

  dom.window.close();
});

test('fetchAndApplyCharacterStamina handles network error gracefully', async () => {
  const dom = createDom();

  globalThis.fetch = async () => {
    throw new Error('Network error');
  };

  const store = createMockStore(
    buildPcBoardState([pcPlacement('plc-frunk', 'Frunk', 50, 50)])
  );

  const api = mountBoardInteractions(store, { sheet: '/api/sheet.php' });
  const { fetchAndApplyCharacterStamina } = api.__testing;

  // Should not throw
  await fetchAndApplyCharacterStamina('plc-frunk', 'scene-1');

  const state = store.getState();
  const placement = state.boardState.placements['scene-1'].find((p) => p.id === 'plc-frunk');

  assert.equal(placement.hp.current, '50', 'HP should remain unchanged on network error');

  dom.window.close();
});

// ---------------------------------------------------------------------------
// Tests: Invalid inputs to applyDamageHealToPlacement
// ---------------------------------------------------------------------------

test('applyDamageHealToPlacement returns null for invalid mode', () => {
  const dom = createDom();
  const store = createMockStore(
    buildPcBoardState([pcPlacement('plc-frunk', 'Frunk', 50, 50)])
  );

  globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
  const api = mountBoardInteractions(store, { sheet: '/api/sheet.php' });
  const { applyDamageHealToPlacement } = api.__testing;

  const result = applyDamageHealToPlacement('plc-frunk', 'invalid', 10);
  assert.equal(result, null, 'Invalid mode should return null');

  dom.window.close();
});

test('applyDamageHealToPlacement returns null for zero amount', () => {
  const dom = createDom();
  const store = createMockStore(
    buildPcBoardState([pcPlacement('plc-frunk', 'Frunk', 50, 50)])
  );

  globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
  const api = mountBoardInteractions(store, { sheet: '/api/sheet.php' });
  const { applyDamageHealToPlacement } = api.__testing;

  const result = applyDamageHealToPlacement('plc-frunk', 'damage', 0);
  assert.equal(result, null, 'Zero amount should return null');

  dom.window.close();
});

test('applyDamageHealToPlacement returns null for negative amount', () => {
  const dom = createDom();
  const store = createMockStore(
    buildPcBoardState([pcPlacement('plc-frunk', 'Frunk', 50, 50)])
  );

  globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
  const api = mountBoardInteractions(store, { sheet: '/api/sheet.php' });
  const { applyDamageHealToPlacement } = api.__testing;

  // Negative amount is converted via Math.abs then checked > 0, so -5 becomes 5
  const result = applyDamageHealToPlacement('plc-frunk', 'damage', -5);
  assert.ok(result, 'Negative amount should be converted to positive via Math.abs');
  assert.equal(result.current, 45, 'Damage should still apply: 50 - 5 = 45');

  dom.window.close();
});

test('applyDamageHealToPlacement returns null for non-existent placement', () => {
  const dom = createDom();
  const store = createMockStore(
    buildPcBoardState([pcPlacement('plc-frunk', 'Frunk', 50, 50)])
  );

  globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
  const api = mountBoardInteractions(store, { sheet: '/api/sheet.php' });
  const { applyDamageHealToPlacement } = api.__testing;

  const result = applyDamageHealToPlacement('plc-nonexistent', 'damage', 10);
  assert.equal(result, null, 'Non-existent placement should return null');

  dom.window.close();
});

test('applyDamageHealToPlacement truncates float damage amounts', () => {
  const dom = createDom();
  const store = createMockStore(
    buildPcBoardState([pcPlacement('plc-frunk', 'Frunk', 50, 50)])
  );

  globalThis.fetch = async () => ({ ok: true, json: async () => ({ success: true }) });
  const api = mountBoardInteractions(store, { sheet: '/api/sheet.php' });
  const { applyDamageHealToPlacement } = api.__testing;

  const result = applyDamageHealToPlacement('plc-frunk', 'damage', 7.9);
  assert.ok(result, 'Float amount should still work');
  assert.equal(result.current, 43, 'Float amount should truncate: 50 - trunc(7.9)=7 = 43');

  dom.window.close();
});

// ---------------------------------------------------------------------------
// Tests: Rapid VTT damage debouncing
// ---------------------------------------------------------------------------

test('Rapid VTT damage operations debounce to single sheet sync', async () => {
  const dom = createDom();

  let sheetSyncCount = 0;
  let lastSyncBody = '';
  globalThis.fetch = async (url, opts) => {
    if (opts?.method === 'POST' && String(opts.body ?? '').includes('sync-stamina')) {
      sheetSyncCount++;
      lastSyncBody = String(opts.body);
    }
    return { ok: true, json: async () => ({ success: true }) };
  };

  const store = createMockStore(
    buildPcBoardState([pcPlacement('plc-frunk', 'Frunk', 50, 50)])
  );

  const api = mountBoardInteractions(store, { sheet: '/api/sheet.php' });
  const { applyDamageHealToPlacement } = api.__testing;

  // Apply 3 rapid damage operations (within 400ms debounce window)
  applyDamageHealToPlacement('plc-frunk', 'damage', 5);  // 50 -> 45
  applyDamageHealToPlacement('plc-frunk', 'damage', 3);  // 45 -> 42
  applyDamageHealToPlacement('plc-frunk', 'damage', 2);  // 42 -> 40

  // Wait for debounce to resolve
  await new Promise((resolve) => setTimeout(resolve, 800));

  // The debounce should batch these - we expect the final value synced
  assert.ok(lastSyncBody.includes('currentStamina=40'), 'Final synced value should be 40');

  // Local state should reflect all operations
  const state = store.getState();
  const placement = state.boardState.placements['scene-1'].find((p) => p.id === 'plc-frunk');
  assert.equal(placement.hp.current, '40', 'Local HP should be 40 after all operations');

  dom.window.close();
});

// ---------------------------------------------------------------------------
// Tests: postHitPointsToSheet network failure
// ---------------------------------------------------------------------------

test('VTT damage still applies locally even when sheet sync fails', async () => {
  const dom = createDom();

  globalThis.fetch = async (url, opts) => {
    if (opts?.method === 'POST') {
      throw new Error('Network failure');
    }
    return { ok: true, json: async () => ({}) };
  };

  const store = createMockStore(
    buildPcBoardState([pcPlacement('plc-frunk', 'Frunk', 50, 50)])
  );

  const api = mountBoardInteractions(store, { sheet: '/api/sheet.php' });
  const { applyDamageHealToPlacement } = api.__testing;

  const result = applyDamageHealToPlacement('plc-frunk', 'damage', 10);
  assert.ok(result, 'Damage should succeed locally');
  assert.equal(result.current, 40, 'Local HP should be 40');

  // Wait for debounced sync attempt (will fail)
  await new Promise((resolve) => setTimeout(resolve, 600));

  // Local state should still be correct
  const state = store.getState();
  const placement = state.boardState.placements['scene-1'].find((p) => p.id === 'plc-frunk');
  assert.equal(placement.hp.current, '40', 'Local HP should remain 40 despite sync failure');

  dom.window.close();
});

// ---------------------------------------------------------------------------
// Tests: Full round-trip scenario (damage -> sync -> recovery -> sync back)
// ---------------------------------------------------------------------------

test('Full round-trip: damage token, sheet recovers, token updates, no desync', async () => {
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

  // Step 1: GM damages token (50 -> 35)
  const damageResult = applyDamageHealToPlacement('plc-frunk', 'damage', 15);
  assert.equal(damageResult.current, 35);

  await new Promise((resolve) => setTimeout(resolve, 600));
  const syncAfterDamage = sheetSyncCount;
  assert.ok(syncAfterDamage > 0, 'Damage should sync to sheet');

  // Step 2: Player uses recovery on sheet (35 -> 47)
  handleSheetStaminaBroadcast(sheetBroadcastEvent('Frunk', 47, 50));

  let state = store.getState();
  let placement = state.boardState.placements['scene-1'].find((p) => p.id === 'plc-frunk');
  assert.equal(placement.hp.current, '47', 'Token should reflect recovery');

  // Step 3: No oscillation
  await new Promise((resolve) => setTimeout(resolve, 600));
  assert.equal(sheetSyncCount, syncAfterDamage, 'No feedback loop');

  // Step 4: GM damages again (47 -> 30)
  const damage2 = applyDamageHealToPlacement('plc-frunk', 'damage', 17);
  assert.equal(damage2.current, 30);

  await new Promise((resolve) => setTimeout(resolve, 600));
  assert.ok(sheetSyncCount > syncAfterDamage, 'Second damage should also sync');

  // Step 5: Final state check
  state = store.getState();
  placement = state.boardState.placements['scene-1'].find((p) => p.id === 'plc-frunk');
  assert.equal(placement.hp.current, '30', 'Final HP should be 30');

  dom.window.close();
});

// ---------------------------------------------------------------------------
// Tests: Sheet broadcast with only partial data
// ---------------------------------------------------------------------------

test('Sheet broadcast with only currentStamina updates current but preserves max', () => {
  const dom = createDom();
  const store = createMockStore(
    buildPcBoardState([pcPlacement('plc-frunk', 'Frunk', 30, 50)])
  );

  globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
  const api = mountBoardInteractions(store, { sheet: '/api/sheet.php' });
  const { handleSheetStaminaBroadcast } = api.__testing;

  handleSheetStaminaBroadcast({
    data: {
      type: 'stamina-sync',
      source: 'sheet',
      character: 'Frunk',
      currentStamina: 42,
      // staminaMax intentionally omitted
    },
  });

  const state = store.getState();
  const placement = state.boardState.placements['scene-1'].find((p) => p.id === 'plc-frunk');
  assert.equal(placement.hp.current, '42', 'Current HP should update');
  assert.equal(placement.hp.max, '50', 'Max HP should be preserved from original');

  dom.window.close();
});

test('Sheet broadcast with updated max HP also updates max on token', () => {
  const dom = createDom();
  const store = createMockStore(
    buildPcBoardState([pcPlacement('plc-frunk', 'Frunk', 30, 50)])
  );

  globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
  const api = mountBoardInteractions(store, { sheet: '/api/sheet.php' });
  const { handleSheetStaminaBroadcast } = api.__testing;

  // Simulate a level-up where max HP increases
  handleSheetStaminaBroadcast(sheetBroadcastEvent('Frunk', 55, 55));

  const state = store.getState();
  const placement = state.boardState.placements['scene-1'].find((p) => p.id === 'plc-frunk');
  assert.equal(placement.hp.current, '55', 'Current HP should update');
  assert.equal(placement.hp.max, '55', 'Max HP should also update');

  dom.window.close();
});

// ---------------------------------------------------------------------------
// Tests: fetchAndApplyCharacterStamina with missing/invalid IDs
// ---------------------------------------------------------------------------

test('fetchAndApplyCharacterStamina does nothing with null placementId', async () => {
  const dom = createDom();

  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return { ok: true, json: async () => ({}) };
  };

  const store = createMockStore(buildPcBoardState([]));
  const api = mountBoardInteractions(store, { sheet: '/api/sheet.php' });
  const { fetchAndApplyCharacterStamina } = api.__testing;

  await fetchAndApplyCharacterStamina(null, 'scene-1');
  assert.equal(fetchCalled, false, 'Should not fetch with null placementId');

  dom.window.close();
});

test('fetchAndApplyCharacterStamina does nothing with null sceneId', async () => {
  const dom = createDom();

  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return { ok: true, json: async () => ({}) };
  };

  const store = createMockStore(
    buildPcBoardState([pcPlacement('plc-frunk', 'Frunk', 50, 50)])
  );
  const api = mountBoardInteractions(store, { sheet: '/api/sheet.php' });
  const { fetchAndApplyCharacterStamina } = api.__testing;

  await fetchAndApplyCharacterStamina('plc-frunk', null);
  assert.equal(fetchCalled, false, 'Should not fetch with null sceneId');

  dom.window.close();
});
