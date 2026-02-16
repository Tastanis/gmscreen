import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import {
  mountFogOfWar,
  renderFog,
  renderFogSelection,
  isPositionFogged,
  createFogChecker,
  isFogSelectActive,
  toggleFogForScene,
  getFogStateForScene,
  normalizeFogOfWarState,
} from '../fog-of-war.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal JSDOM with the canvas elements fog-of-war expects. */
function createDom() {
  const dom = new JSDOM(
    `<!DOCTYPE html>
      <body>
        <div id="vtt-app">
          <div id="vtt-map-surface">
            <canvas id="vtt-fog-layer"></canvas>
            <canvas id="vtt-fog-selection-layer"></canvas>
          </div>
        </div>
      </body>`,
    { url: 'http://localhost' },
  );

  const { window } = dom;
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.Element = window.Element;
  globalThis.Node = window.Node;
  globalThis.CustomEvent = window.CustomEvent;
  globalThis.Event = window.Event;

  // Stub canvas getContext – JSDOM doesn't implement <canvas>.
  // Cache the context per element so repeated calls return the same object.
  const canvasProto = window.HTMLCanvasElement.prototype;
  canvasProto.getContext = function () {
    if (!this._mockCtx) {
      this._mockCtx = createMockCanvasContext();
    }
    return this._mockCtx;
  };

  return dom;
}

/** A mock 2D rendering context that records draw calls. */
function createMockCanvasContext() {
  const calls = [];
  return {
    _calls: calls,
    clearRect(...args) { calls.push({ method: 'clearRect', args }); },
    fillRect(...args) { calls.push({ method: 'fillRect', args }); },
    strokeRect(...args) { calls.push({ method: 'strokeRect', args }); },
    set fillStyle(v) { calls.push({ method: 'set fillStyle', args: [v] }); },
    get fillStyle() { return ''; },
    set strokeStyle(v) { calls.push({ method: 'set strokeStyle', args: [v] }); },
    get strokeStyle() { return ''; },
    set lineWidth(v) { calls.push({ method: 'set lineWidth', args: [v] }); },
    get lineWidth() { return 1; },
  };
}

/** Mock boardApi matching the interface used by fog-of-war.js. */
function createMockBoardApi(initialState) {
  let state = JSON.parse(JSON.stringify(initialState));
  const dirty = [];

  return {
    getState: () => state,
    updateState(updater) {
      const draft = JSON.parse(JSON.stringify(state));
      updater(draft);
      state = draft;
    },
    _markSceneStateDirty(sceneId) { dirty.push(sceneId); },
    _persistBoardState() {},
    _getDirty() { return dirty; },
    _getState() { return state; },
  };
}

/** Convenience: a board state with fog enabled on scene-1. */
function makeFogState(overrides = {}) {
  return {
    boardState: {
      activeSceneId: 'scene-1',
      placements: { 'scene-1': overrides.placements ?? [] },
      sceneState: {
        'scene-1': {
          grid: { size: 64, locked: false, visible: true },
          fogOfWar: {
            enabled: true,
            revealedCells: overrides.revealedCells ?? {},
          },
        },
      },
    },
    tokens: overrides.tokens ?? { folders: [], items: [] },
  };
}

// ===========================================================================
// normalizeFogOfWarState – pure data validation
// ===========================================================================

describe('normalizeFogOfWarState', () => {
  test('returns null for null input', () => {
    assert.equal(normalizeFogOfWarState(null), null);
  });

  test('returns null for undefined input', () => {
    assert.equal(normalizeFogOfWarState(undefined), null);
  });

  test('returns null for non-object input (string)', () => {
    assert.equal(normalizeFogOfWarState('enabled'), null);
  });

  test('returns null for non-object input (number)', () => {
    assert.equal(normalizeFogOfWarState(42), null);
  });

  test('preserves disabled fog with no revealed cells', () => {
    const result = normalizeFogOfWarState({ enabled: false, revealedCells: {} });
    assert.deepEqual(result, { enabled: false, revealedCells: {} });
  });

  test('returns object for enabled fog with empty revealed cells', () => {
    const result = normalizeFogOfWarState({ enabled: true, revealedCells: {} });
    assert.deepEqual(result, { enabled: true, revealedCells: {} });
  });

  test('preserves valid revealed cells', () => {
    const result = normalizeFogOfWarState({
      enabled: true,
      revealedCells: { '0,0': true, '3,5': true, '10,20': true },
    });
    assert.deepEqual(result.revealedCells, { '0,0': true, '3,5': true, '10,20': true });
  });

  test('rejects cell keys with negative coordinates', () => {
    const result = normalizeFogOfWarState({
      enabled: true,
      revealedCells: { '-1,0': true, '0,-2': true, '3,3': true },
    });
    assert.deepEqual(result.revealedCells, { '3,3': true });
  });

  test('rejects cell keys with non-integer parts', () => {
    const result = normalizeFogOfWarState({
      enabled: true,
      revealedCells: { 'abc,1': true, '1,xyz': true, '2,2': true },
    });
    assert.deepEqual(result.revealedCells, { '2,2': true });
  });

  test('rejects cell keys with wrong format (no comma)', () => {
    const result = normalizeFogOfWarState({
      enabled: true,
      revealedCells: { '5': true, '': true, '1,2': true },
    });
    assert.deepEqual(result.revealedCells, { '1,2': true });
  });

  test('rejects cell keys with extra comma segments', () => {
    const result = normalizeFogOfWarState({
      enabled: true,
      revealedCells: { '1,2,3': true, '4,5': true },
    });
    assert.deepEqual(result.revealedCells, { '4,5': true });
  });

  test('normalizes key format (strips whitespace from integer parse)', () => {
    const result = normalizeFogOfWarState({
      enabled: true,
      revealedCells: { '  3 , 4 ': true },
    });
    // parseInt trims leading whitespace; " 3 " → 3, " 4 " → 4
    // but split(',') gives [' 3 ', ' 4 '], each parsed to integers → '3,4'
    assert.ok(result.revealedCells['3,4']);
  });

  test('returns object for disabled fog that has revealed cells', () => {
    const result = normalizeFogOfWarState({
      enabled: false,
      revealedCells: { '1,1': true },
    });
    assert.equal(result.enabled, false);
    assert.deepEqual(result.revealedCells, { '1,1': true });
  });

  test('handles missing revealedCells property', () => {
    const result = normalizeFogOfWarState({ enabled: true });
    assert.deepEqual(result, { enabled: true, revealedCells: {} });
  });

  test('coerces truthy enabled to boolean', () => {
    const result = normalizeFogOfWarState({ enabled: 1, revealedCells: {} });
    assert.equal(result.enabled, true);
  });

  test('coerces falsy enabled to boolean', () => {
    const result = normalizeFogOfWarState({ enabled: 0, revealedCells: { '0,0': true } });
    assert.equal(result.enabled, false);
  });
});

// ===========================================================================
// getFogStateForScene – state retrieval
// ===========================================================================

describe('getFogStateForScene', () => {
  test('returns null for null state', () => {
    assert.equal(getFogStateForScene(null, 'scene-1'), null);
  });

  test('returns null for missing sceneId', () => {
    const state = makeFogState();
    assert.equal(getFogStateForScene(state, null), null);
    assert.equal(getFogStateForScene(state, ''), null);
  });

  test('returns null for nonexistent scene', () => {
    const state = makeFogState();
    assert.equal(getFogStateForScene(state, 'scene-999'), null);
  });

  test('returns fog state for existing scene', () => {
    const state = makeFogState({ revealedCells: { '1,2': true } });
    const fog = getFogStateForScene(state, 'scene-1');
    assert.equal(fog.enabled, true);
    assert.deepEqual(fog.revealedCells, { '1,2': true });
  });

  test('returns null when scene has no fogOfWar key', () => {
    const state = {
      boardState: {
        sceneState: {
          'scene-1': { grid: { size: 64 } },
        },
      },
    };
    assert.equal(getFogStateForScene(state, 'scene-1'), null);
  });

  test('returns null when sceneState is missing', () => {
    const state = { boardState: {} };
    assert.equal(getFogStateForScene(state, 'scene-1'), null);
  });
});

// ===========================================================================
// isPositionFogged – per-cell fog check (requires mount)
// ===========================================================================

describe('isPositionFogged (player view)', () => {
  let dom;

  beforeEach(() => {
    dom = createDom();
    // Mount as player (not GM)
    mountFogOfWar({ isGm: false });
  });

  test('returns true for unrevealed cell when fog is enabled', () => {
    const state = makeFogState();
    assert.equal(isPositionFogged(state, 5, 5), true);
  });

  test('returns false for manually revealed cell', () => {
    const state = makeFogState({ revealedCells: { '5,5': true } });
    assert.equal(isPositionFogged(state, 5, 5), false);
  });

  test('returns false when fog is disabled', () => {
    const state = makeFogState();
    state.boardState.sceneState['scene-1'].fogOfWar.enabled = false;
    assert.equal(isPositionFogged(state, 5, 5), false);
  });

  test('returns false when no active scene', () => {
    const state = makeFogState();
    state.boardState.activeSceneId = null;
    assert.equal(isPositionFogged(state, 5, 5), false);
  });

  test('floors fractional col/row values', () => {
    const state = makeFogState({ revealedCells: { '3,4': true } });
    // 3.7 floors to 3, 4.9 floors to 4
    assert.equal(isPositionFogged(state, 3.7, 4.9), false);
  });

  test('returns false for cell auto-revealed by PC token', () => {
    const state = makeFogState({
      placements: [
        { id: 'p1', tokenId: 'fighter-token', column: 2, row: 3, width: 1, height: 1 },
      ],
      tokens: {
        folders: [{ id: 'folder-pcs', name: "PC's" }],
        items: [{ id: 'fighter-token', name: 'Fighter', folderId: 'folder-pcs' }],
      },
    });
    // Cell 2,3 should be auto-revealed by the PC token
    assert.equal(isPositionFogged(state, 2, 3), false);
  });

  test('returns true for cell NOT occupied by PC token', () => {
    const state = makeFogState({
      placements: [
        { id: 'p1', tokenId: 'fighter-token', column: 2, row: 3, width: 1, height: 1 },
      ],
      tokens: {
        folders: [{ id: 'folder-pcs', name: "PC's" }],
        items: [{ id: 'fighter-token', name: 'Fighter', folderId: 'folder-pcs' }],
      },
    });
    // Cell 5,5 is not occupied by any PC token
    assert.equal(isPositionFogged(state, 5, 5), true);
  });

  test('ally combatTeam auto-reveals cell', () => {
    const state = makeFogState({
      placements: [
        { id: 'p1', tokenId: 'ally-token', column: 4, row: 6, width: 1, height: 1, combatTeam: 'ally' },
      ],
    });
    assert.equal(isPositionFogged(state, 4, 6), false);
  });

  test('enemy combatTeam does NOT auto-reveal cell', () => {
    const state = makeFogState({
      placements: [
        { id: 'p1', tokenId: 'enemy-token', column: 4, row: 6, width: 1, height: 1, combatTeam: 'enemy' },
      ],
    });
    assert.equal(isPositionFogged(state, 4, 6), true);
  });

  test('multi-cell PC token reveals all occupied cells', () => {
    const state = makeFogState({
      placements: [
        { id: 'p1', tokenId: 'large-pc', column: 1, row: 1, width: 2, height: 2 },
      ],
      tokens: {
        folders: [{ id: 'folder-pcs', name: "PC's" }],
        items: [{ id: 'large-pc', name: 'Giant', folderId: 'folder-pcs' }],
      },
    });
    // A 2x2 token at (1,1) should reveal cells: 1,1 / 2,1 / 1,2 / 2,2
    assert.equal(isPositionFogged(state, 1, 1), false);
    assert.equal(isPositionFogged(state, 2, 1), false);
    assert.equal(isPositionFogged(state, 1, 2), false);
    assert.equal(isPositionFogged(state, 2, 2), false);
    // Adjacent cell should still be fogged
    assert.equal(isPositionFogged(state, 3, 1), true);
  });

  test('returns false when state is null', () => {
    assert.equal(isPositionFogged(null, 0, 0), false);
  });
});

describe('isPositionFogged (GM view)', () => {
  let dom;

  beforeEach(() => {
    dom = createDom();
    mountFogOfWar({ isGm: true });
  });

  test('always returns false for GM', () => {
    const state = makeFogState();
    // Even unrevealed cells are not "fogged" for GM
    assert.equal(isPositionFogged(state, 0, 0), false);
    assert.equal(isPositionFogged(state, 99, 99), false);
  });
});

// ===========================================================================
// createFogChecker – batch fog-check factory
// ===========================================================================

describe('createFogChecker (player view)', () => {
  let dom;

  beforeEach(() => {
    dom = createDom();
    mountFogOfWar({ isGm: false });
  });

  test('returns null when fog is disabled', () => {
    const state = makeFogState();
    state.boardState.sceneState['scene-1'].fogOfWar.enabled = false;
    assert.equal(createFogChecker(state), null);
  });

  test('returns null when no active scene', () => {
    const state = makeFogState();
    state.boardState.activeSceneId = null;
    assert.equal(createFogChecker(state), null);
  });

  test('returns a function when fog is active', () => {
    const state = makeFogState();
    const checker = createFogChecker(state);
    assert.equal(typeof checker, 'function');
  });

  test('returned function returns true for fogged cells', () => {
    const state = makeFogState();
    const checker = createFogChecker(state);
    assert.equal(checker(5, 5), true);
  });

  test('returned function returns false for revealed cells', () => {
    const state = makeFogState({ revealedCells: { '3,3': true } });
    const checker = createFogChecker(state);
    assert.equal(checker(3, 3), false);
  });

  test('returned function handles PC auto-reveal', () => {
    const state = makeFogState({
      placements: [
        { id: 'p1', tokenId: 'pc1', column: 7, row: 8, width: 1, height: 1 },
      ],
      tokens: {
        folders: [{ id: 'f-pcs', name: "PC's" }],
        items: [{ id: 'pc1', name: 'Rogue', folderId: 'f-pcs' }],
      },
    });
    const checker = createFogChecker(state);
    assert.equal(checker(7, 8), false);
    assert.equal(checker(0, 0), true);
  });

  test('returned function floors fractional coordinates', () => {
    const state = makeFogState({ revealedCells: { '2,3': true } });
    const checker = createFogChecker(state);
    assert.equal(checker(2.9, 3.1), false);
  });
});

describe('createFogChecker (GM view)', () => {
  let dom;

  beforeEach(() => {
    dom = createDom();
    mountFogOfWar({ isGm: true });
  });

  test('always returns null for GM (fog never blocks GM)', () => {
    const state = makeFogState();
    assert.equal(createFogChecker(state), null);
  });
});

// ===========================================================================
// renderFog – canvas drawing
// ===========================================================================

describe('renderFog', () => {
  let dom;
  let viewState;

  beforeEach(() => {
    dom = createDom();
    viewState = {
      gridSize: 64,
      mapPixelSize: { width: 256, height: 256 },
      gridOffsets: { left: 0, top: 0 },
      scale: 1,
      translation: { x: 0, y: 0 },
    };
  });

  test('clears canvas when no active scene', () => {
    mountFogOfWar({ isGm: true, viewState });
    const state = makeFogState();
    state.boardState.activeSceneId = null;

    renderFog(state);
    // Should have called clearRect, no fillRect
    const fogCanvas = document.getElementById('vtt-fog-layer');
    const ctx = fogCanvas.getContext('2d');
    const fillCalls = ctx._calls.filter((c) => c.method === 'fillRect');
    assert.equal(fillCalls.length, 0);
  });

  test('clears canvas when fog is disabled', () => {
    mountFogOfWar({ isGm: true, viewState });
    const state = makeFogState();
    state.boardState.sceneState['scene-1'].fogOfWar.enabled = false;

    renderFog(state);
    const fogCanvas = document.getElementById('vtt-fog-layer');
    const ctx = fogCanvas.getContext('2d');
    const fillCalls = ctx._calls.filter((c) => c.method === 'fillRect');
    assert.equal(fillCalls.length, 0);
  });

  test('draws fog on all cells when none are revealed (GM alpha)', () => {
    mountFogOfWar({ isGm: true, viewState });
    const state = makeFogState();

    renderFog(state);
    const fogCanvas = document.getElementById('vtt-fog-layer');
    const ctx = fogCanvas.getContext('2d');

    // 256 / 64 = 4 cols, 4 rows = 16 cells
    const fillCalls = ctx._calls.filter((c) => c.method === 'fillRect');
    assert.equal(fillCalls.length, 16);

    // Check fill style uses GM alpha (0.7)
    const styleCalls = ctx._calls.filter(
      (c) => c.method === 'set fillStyle' && c.args[0].includes('0.7'),
    );
    assert.ok(styleCalls.length > 0, 'should use GM alpha 0.7');
  });

  test('draws fog with player alpha (1.0) for non-GM', () => {
    mountFogOfWar({ isGm: false, viewState });
    const state = makeFogState();

    renderFog(state);
    const fogCanvas = document.getElementById('vtt-fog-layer');
    const ctx = fogCanvas.getContext('2d');

    const styleCalls = ctx._calls.filter(
      (c) => c.method === 'set fillStyle' && c.args[0].includes(',1)'),
    );
    assert.ok(styleCalls.length > 0, 'should use player alpha 1.0');
  });

  test('skips revealed cells when drawing fog', () => {
    mountFogOfWar({ isGm: true, viewState });
    // Reveal cell 0,0
    const state = makeFogState({ revealedCells: { '0,0': true } });

    renderFog(state);
    const fogCanvas = document.getElementById('vtt-fog-layer');
    const ctx = fogCanvas.getContext('2d');

    // 16 total cells minus 1 revealed = 15 fog rectangles
    const fillCalls = ctx._calls.filter((c) => c.method === 'fillRect');
    assert.equal(fillCalls.length, 15);
  });

  test('skips cells auto-revealed by PC tokens', () => {
    mountFogOfWar({ isGm: true, viewState });
    const state = makeFogState({
      placements: [
        { id: 'p1', tokenId: 'pc1', column: 1, row: 1, width: 1, height: 1 },
      ],
      tokens: {
        folders: [{ id: 'f1', name: "PC's" }],
        items: [{ id: 'pc1', name: 'Fighter', folderId: 'f1' }],
      },
    });

    renderFog(state);
    const fogCanvas = document.getElementById('vtt-fog-layer');
    const ctx = fogCanvas.getContext('2d');

    // 16 total minus 1 PC-auto-revealed = 15
    const fillCalls = ctx._calls.filter((c) => c.method === 'fillRect');
    assert.equal(fillCalls.length, 15);
  });

  test('handles grid offsets in cell positioning', () => {
    viewState.gridOffsets = { left: 10, top: 10 };
    mountFogOfWar({ isGm: true, viewState });
    const state = makeFogState();

    renderFog(state);
    const fogCanvas = document.getElementById('vtt-fog-layer');
    const ctx = fogCanvas.getContext('2d');

    // First fillRect should start at offset position
    const fillCalls = ctx._calls.filter((c) => c.method === 'fillRect');
    assert.ok(fillCalls.length > 0);
    assert.equal(fillCalls[0].args[0], 10, 'x should include left offset');
    assert.equal(fillCalls[0].args[1], 10, 'y should include top offset');
  });

  test('clears canvas when map dimensions are zero', () => {
    viewState.mapPixelSize = { width: 0, height: 0 };
    mountFogOfWar({ isGm: true, viewState });
    const state = makeFogState();

    renderFog(state);
    const fogCanvas = document.getElementById('vtt-fog-layer');
    const ctx = fogCanvas.getContext('2d');
    const fillCalls = ctx._calls.filter((c) => c.method === 'fillRect');
    assert.equal(fillCalls.length, 0);
  });

  test('multiple revealed cells reduce fog count correctly', () => {
    mountFogOfWar({ isGm: true, viewState });
    const state = makeFogState({
      revealedCells: { '0,0': true, '1,0': true, '2,0': true, '3,0': true },
    });

    renderFog(state);
    const fogCanvas = document.getElementById('vtt-fog-layer');
    const ctx = fogCanvas.getContext('2d');

    // 16 total minus 4 revealed = 12
    const fillCalls = ctx._calls.filter((c) => c.method === 'fillRect');
    assert.equal(fillCalls.length, 12);
  });

  test('combined manual reveal and PC auto-reveal reduce fog', () => {
    mountFogOfWar({ isGm: true, viewState });
    const state = makeFogState({
      revealedCells: { '0,0': true, '0,1': true },
      placements: [
        { id: 'p1', tokenId: 'pc1', column: 2, row: 2, width: 1, height: 1 },
      ],
      tokens: {
        folders: [{ id: 'f1', name: "PC's" }],
        items: [{ id: 'pc1', name: 'Wizard', folderId: 'f1' }],
      },
    });

    renderFog(state);
    const fogCanvas = document.getElementById('vtt-fog-layer');
    const ctx = fogCanvas.getContext('2d');

    // 16 total minus 2 revealed minus 1 PC = 13
    const fillCalls = ctx._calls.filter((c) => c.method === 'fillRect');
    assert.equal(fillCalls.length, 13);
  });
});

// ===========================================================================
// renderFogSelection – selection overlay
// ===========================================================================

describe('renderFogSelection', () => {
  let dom;

  beforeEach(() => {
    dom = createDom();
  });

  test('does not draw when no cells are selected', () => {
    const viewState = {
      gridSize: 64,
      mapPixelSize: { width: 256, height: 256 },
      gridOffsets: { left: 0, top: 0 },
    };
    mountFogOfWar({ isGm: true, viewState });
    renderFogSelection();

    const selCanvas = document.getElementById('vtt-fog-selection-layer');
    const ctx = selCanvas.getContext('2d');
    const fillCalls = ctx._calls.filter((c) => c.method === 'fillRect');
    assert.equal(fillCalls.length, 0);
  });
});

// ===========================================================================
// toggleFogForScene – enable/disable fog per scene
// ===========================================================================

describe('toggleFogForScene', () => {
  let dom;

  beforeEach(() => {
    dom = createDom();
  });

  test('enables fog for a scene', () => {
    const state = {
      boardState: {
        activeSceneId: 'scene-1',
        placements: {},
        sceneState: {},
      },
      tokens: { folders: [], items: [] },
    };
    const api = createMockBoardApi(state);
    mountFogOfWar({ isGm: true, boardApi: api });

    toggleFogForScene('scene-1', true);

    const updated = api._getState();
    assert.equal(updated.boardState.sceneState['scene-1'].fogOfWar.enabled, true);
  });

  test('disables fog for a scene', () => {
    const state = makeFogState();
    const api = createMockBoardApi(state);
    mountFogOfWar({ isGm: true, boardApi: api });

    toggleFogForScene('scene-1', false);

    const updated = api._getState();
    assert.equal(updated.boardState.sceneState['scene-1'].fogOfWar.enabled, false);
  });

  test('creates sceneState entry if missing', () => {
    const state = {
      boardState: {
        activeSceneId: 'scene-new',
        placements: {},
        sceneState: {},
      },
      tokens: { folders: [], items: [] },
    };
    const api = createMockBoardApi(state);
    mountFogOfWar({ isGm: true, boardApi: api });

    toggleFogForScene('scene-new', true);

    const updated = api._getState();
    assert.ok(updated.boardState.sceneState['scene-new']);
    assert.equal(updated.boardState.sceneState['scene-new'].fogOfWar.enabled, true);
  });

  test('calls markSceneStateDirty when provided', () => {
    const state = makeFogState();
    const api = createMockBoardApi(state);
    mountFogOfWar({ isGm: true, boardApi: api });

    const dirtied = [];
    toggleFogForScene('scene-1', true, {
      markSceneStateDirty: (id) => dirtied.push(id),
    });

    assert.deepEqual(dirtied, ['scene-1']);
  });

  test('does nothing when sceneId is null', () => {
    const state = makeFogState();
    const api = createMockBoardApi(state);
    mountFogOfWar({ isGm: true, boardApi: api });

    // Should not throw
    toggleFogForScene(null, true);
    const updated = api._getState();
    // State unchanged
    assert.equal(updated.boardState.sceneState['scene-1'].fogOfWar.enabled, true);
  });

  test('does nothing when boardApi is not set', () => {
    mountFogOfWar({ isGm: true });
    // Should not throw
    toggleFogForScene('scene-1', true);
  });

  test('preserves existing revealedCells when toggling', () => {
    const state = makeFogState({ revealedCells: { '3,3': true, '4,4': true } });
    const api = createMockBoardApi(state);
    mountFogOfWar({ isGm: true, boardApi: api });

    toggleFogForScene('scene-1', false);
    toggleFogForScene('scene-1', true);

    const updated = api._getState();
    const cells = updated.boardState.sceneState['scene-1'].fogOfWar.revealedCells;
    assert.deepEqual(cells, { '3,3': true, '4,4': true });
  });
});

// ===========================================================================
// isFogSelectActive – select mode state
// ===========================================================================

describe('isFogSelectActive', () => {
  let dom;

  beforeEach(() => {
    dom = createDom();
  });

  test('returns false when fog select is not active', () => {
    mountFogOfWar({ isGm: true });
    assert.equal(isFogSelectActive(), false);
  });
});

// ===========================================================================
// PC token auto-reveal – integration tests through isPositionFogged
// ===========================================================================

describe('PC token auto-reveal', () => {
  let dom;

  beforeEach(() => {
    dom = createDom();
    mountFogOfWar({ isGm: false });
  });

  test('token in PC folder auto-reveals its cell', () => {
    const state = makeFogState({
      placements: [
        { id: 'p1', tokenId: 'tk-cleric', column: 5, row: 3, width: 1, height: 1 },
      ],
      tokens: {
        folders: [{ id: 'pcs', name: "PC's" }],
        items: [{ id: 'tk-cleric', name: 'Cleric', folderId: 'pcs' }],
      },
    });
    assert.equal(isPositionFogged(state, 5, 3), false);
  });

  test('token with inline folder metadata auto-reveals', () => {
    const state = makeFogState({
      placements: [
        { id: 'p1', tokenId: 'tk-ranger', column: 0, row: 0, width: 1, height: 1 },
      ],
      tokens: {
        folders: [],
        items: [
          { id: 'tk-ranger', name: 'Ranger', folderId: 'any', folder: { name: "PC's" } },
        ],
      },
    });
    assert.equal(isPositionFogged(state, 0, 0), false);
  });

  test('token in non-PC folder does NOT auto-reveal', () => {
    const state = makeFogState({
      placements: [
        { id: 'p1', tokenId: 'tk-goblin', column: 3, row: 3, width: 1, height: 1 },
      ],
      tokens: {
        folders: [
          { id: 'pcs', name: "PC's" },
          { id: 'monsters', name: 'Monsters' },
        ],
        items: [{ id: 'tk-goblin', name: 'Goblin', folderId: 'monsters' }],
      },
    });
    assert.equal(isPositionFogged(state, 3, 3), true);
  });

  test('large token (3x3) reveals a 3x3 area', () => {
    const state = makeFogState({
      placements: [
        { id: 'p1', tokenId: 'tk-dragon', column: 2, row: 2, width: 3, height: 3 },
      ],
      tokens: {
        folders: [{ id: 'pcs', name: "PC's" }],
        items: [{ id: 'tk-dragon', name: 'Dragon', folderId: 'pcs' }],
      },
    });

    // All 9 cells should be revealed
    for (let dc = 0; dc < 3; dc++) {
      for (let dr = 0; dr < 3; dr++) {
        assert.equal(
          isPositionFogged(state, 2 + dc, 2 + dr),
          false,
          `cell ${2 + dc},${2 + dr} should be revealed by 3x3 PC token`,
        );
      }
    }
    // Cell outside should be fogged
    assert.equal(isPositionFogged(state, 5, 5), true);
  });

  test('multiple PC tokens each reveal their cells independently', () => {
    const state = makeFogState({
      placements: [
        { id: 'p1', tokenId: 'tk-a', column: 0, row: 0, width: 1, height: 1 },
        { id: 'p2', tokenId: 'tk-b', column: 5, row: 5, width: 1, height: 1 },
      ],
      tokens: {
        folders: [{ id: 'pcs', name: "PC's" }],
        items: [
          { id: 'tk-a', name: 'Fighter', folderId: 'pcs' },
          { id: 'tk-b', name: 'Wizard', folderId: 'pcs' },
        ],
      },
    });

    assert.equal(isPositionFogged(state, 0, 0), false);
    assert.equal(isPositionFogged(state, 5, 5), false);
    assert.equal(isPositionFogged(state, 3, 3), true);
  });

  test('ally combatTeam token auto-reveals without being in PC folder', () => {
    const state = makeFogState({
      placements: [
        {
          id: 'p1',
          tokenId: 'tk-npc',
          column: 8,
          row: 2,
          width: 1,
          height: 1,
          combatTeam: 'ally',
        },
      ],
      tokens: {
        folders: [{ id: 'npcs', name: 'NPCs' }],
        items: [{ id: 'tk-npc', name: 'Helpful NPC', folderId: 'npcs' }],
      },
    });
    assert.equal(isPositionFogged(state, 8, 2), false);
  });

  test('placement with no matching token and no combatTeam does not reveal', () => {
    const state = makeFogState({
      placements: [
        { id: 'p1', tokenId: 'orphan-token', column: 1, row: 1, width: 1, height: 1 },
      ],
      tokens: {
        folders: [{ id: 'pcs', name: "PC's" }],
        items: [],
      },
    });
    assert.equal(isPositionFogged(state, 1, 1), true);
  });

  test('PC folder name matching is case-insensitive', () => {
    const state = makeFogState({
      placements: [
        { id: 'p1', tokenId: 'tk1', column: 4, row: 4, width: 1, height: 1 },
      ],
      tokens: {
        folders: [{ id: 'pcs', name: "pc's" }],
        items: [{ id: 'tk1', name: 'Bard', folderId: 'pcs' }],
      },
    });
    assert.equal(isPositionFogged(state, 4, 4), false);
  });
});

// ===========================================================================
// Edge cases and robustness
// ===========================================================================

describe('fog of war edge cases', () => {
  let dom;

  beforeEach(() => {
    dom = createDom();
  });

  test('isPositionFogged handles missing placements array gracefully', () => {
    mountFogOfWar({ isGm: false });
    const state = {
      boardState: {
        activeSceneId: 'scene-1',
        placements: {},
        sceneState: {
          'scene-1': {
            fogOfWar: { enabled: true, revealedCells: {} },
          },
        },
      },
      tokens: { folders: [], items: [] },
    };
    // Should not throw, returns true (fogged)
    assert.equal(isPositionFogged(state, 0, 0), true);
  });

  test('isPositionFogged handles missing tokens gracefully', () => {
    mountFogOfWar({ isGm: false });
    const state = {
      boardState: {
        activeSceneId: 'scene-1',
        placements: { 'scene-1': [] },
        sceneState: {
          'scene-1': {
            fogOfWar: { enabled: true, revealedCells: {} },
          },
        },
      },
    };
    // Missing tokens property
    assert.equal(isPositionFogged(state, 0, 0), true);
  });

  test('createFogChecker with null state returns null', () => {
    mountFogOfWar({ isGm: false });
    assert.equal(createFogChecker(null), null);
  });

  test('renderFog handles missing viewState gracefully', () => {
    mountFogOfWar({ isGm: true });
    const state = makeFogState();
    // Should not throw – viewState defaults to {}
    renderFog(state);
  });

  test('normalizeFogOfWarState handles revealedCells being a non-object', () => {
    const result = normalizeFogOfWarState({ enabled: true, revealedCells: 'invalid' });
    assert.deepEqual(result, { enabled: true, revealedCells: {} });
  });

  test('fog covers entire map when no cells are revealed and no PC tokens exist', () => {
    mountFogOfWar({ isGm: false });
    const state = makeFogState();

    // Check a spread of cells – all should be fogged
    for (let c = 0; c < 5; c++) {
      for (let r = 0; r < 5; r++) {
        assert.equal(
          isPositionFogged(state, c, r),
          true,
          `cell ${c},${r} should be fogged with no reveals`,
        );
      }
    }
  });

  test('fog with all cells revealed shows nothing as fogged', () => {
    mountFogOfWar({ isGm: false });
    const revealed = {};
    for (let c = 0; c < 10; c++) {
      for (let r = 0; r < 10; r++) {
        revealed[c + ',' + r] = true;
      }
    }
    const state = makeFogState({ revealedCells: revealed });

    for (let c = 0; c < 10; c++) {
      for (let r = 0; r < 10; r++) {
        assert.equal(
          isPositionFogged(state, c, r),
          false,
          `cell ${c},${r} should not be fogged when all cells revealed`,
        );
      }
    }
  });

  test('toggleFogForScene creates nested structure from empty sceneState', () => {
    const state = {
      boardState: {
        activeSceneId: 'scene-1',
        placements: {},
      },
      tokens: { folders: [], items: [] },
    };
    const api = createMockBoardApi(state);
    mountFogOfWar({ isGm: true, boardApi: api });

    toggleFogForScene('scene-1', true);

    const updated = api._getState();
    assert.ok(updated.boardState.sceneState);
    assert.ok(updated.boardState.sceneState['scene-1']);
    assert.ok(updated.boardState.sceneState['scene-1'].fogOfWar);
    assert.equal(updated.boardState.sceneState['scene-1'].fogOfWar.enabled, true);
    assert.deepEqual(updated.boardState.sceneState['scene-1'].fogOfWar.revealedCells, {});
  });
});

// ===========================================================================
// Fog of war / overlay interaction tests
// ===========================================================================

describe('fog of war and overlay interaction', () => {
  let dom;

  beforeEach(() => {
    dom = createDom();
  });

  test('fog state is independent of overlay state changes', () => {
    const state = makeFogState({ revealedCells: { '1,1': true, '2,2': true } });
    const api = createMockBoardApi(state);
    mountFogOfWar({ isGm: true, boardApi: api });

    // Simulate overlay-related state change (modify overlay without touching fog)
    api.updateState((draft) => {
      if (!draft.boardState.sceneState['scene-1'].overlay) {
        draft.boardState.sceneState['scene-1'].overlay = {};
      }
      draft.boardState.sceneState['scene-1'].overlay.mapUrl = 'http://example.com/overlay.png';
    });

    // Fog state should be unchanged after overlay modification
    const updated = api._getState();
    const fog = updated.boardState.sceneState['scene-1'].fogOfWar;
    assert.equal(fog.enabled, true, 'fog should remain enabled after overlay change');
    assert.deepEqual(fog.revealedCells, { '1,1': true, '2,2': true },
      'revealed cells should be preserved after overlay change');
  });

  test('fog remains enabled when overlay is toggled visible/hidden', () => {
    const state = makeFogState({ revealedCells: { '0,0': true, '3,3': true } });
    const api = createMockBoardApi(state);
    mountFogOfWar({ isGm: true, boardApi: api });

    // Simulate toggling overlay layer visibility
    api.updateState((draft) => {
      const scene = draft.boardState.sceneState['scene-1'];
      if (!scene.overlay) scene.overlay = {};
      if (!scene.overlay.layers) scene.overlay.layers = [];
      scene.overlay.layers.push({ id: 'layer-1', visible: false, mapUrl: 'test.png' });
    });

    // Toggle overlay layer back to visible
    api.updateState((draft) => {
      const layers = draft.boardState.sceneState['scene-1'].overlay.layers;
      if (layers && layers[0]) layers[0].visible = true;
    });

    // Fog should still be intact
    const updated = api._getState();
    const fog = updated.boardState.sceneState['scene-1'].fogOfWar;
    assert.equal(fog.enabled, true, 'fog should remain enabled');
    assert.deepEqual(fog.revealedCells, { '0,0': true, '3,3': true },
      'revealed cells should persist through overlay toggles');
  });

  test('revealed cells survive multiple overlay modifications', () => {
    const revealedCells = {};
    for (let c = 0; c < 5; c++) {
      for (let r = 0; r < 5; r++) {
        revealedCells[`${c},${r}`] = true;
      }
    }
    const state = makeFogState({ revealedCells });
    const api = createMockBoardApi(state);
    mountFogOfWar({ isGm: true, boardApi: api });

    // Do multiple overlay operations
    for (let i = 0; i < 5; i++) {
      api.updateState((draft) => {
        const scene = draft.boardState.sceneState['scene-1'];
        if (!scene.overlay) scene.overlay = {};
        scene.overlay.mapUrl = `overlay-${i}.png`;
      });
    }

    const updated = api._getState();
    const fog = updated.boardState.sceneState['scene-1'].fogOfWar;
    assert.equal(Object.keys(fog.revealedCells).length, 25,
      'all 25 revealed cells should survive overlay operations');
  });

  test('fog toggle via toggleFogForScene does not affect overlay', () => {
    const state = makeFogState();
    // Add overlay to state
    state.boardState.sceneState['scene-1'].overlay = {
      mapUrl: 'overlay.png',
      layers: [{ id: 'layer-1', visible: true, mapUrl: 'overlay.png' }],
    };
    const api = createMockBoardApi(state);
    mountFogOfWar({ isGm: true, boardApi: api });

    // Toggle fog off then on
    toggleFogForScene('scene-1', false);
    toggleFogForScene('scene-1', true);

    const updated = api._getState();
    const overlay = updated.boardState.sceneState['scene-1'].overlay;
    assert.equal(overlay.mapUrl, 'overlay.png', 'overlay mapUrl preserved after fog toggle');
    assert.equal(overlay.layers[0].visible, true, 'overlay layer visibility preserved after fog toggle');
  });

  test('renderFog produces correct output when overlay data exists alongside fog', () => {
    const viewState = {
      gridSize: 64,
      mapPixelSize: { width: 256, height: 256 },
      gridOffsets: { left: 0, top: 0 },
      scale: 1,
      translation: { x: 0, y: 0 },
    };
    mountFogOfWar({ isGm: true, viewState });

    // State has both overlay and fog data
    const state = makeFogState({ revealedCells: { '0,0': true, '1,1': true } });
    state.boardState.sceneState['scene-1'].overlay = {
      mapUrl: 'overlay.png',
      layers: [{ id: 'layer-1', visible: true, mapUrl: 'overlay.png' }],
    };

    renderFog(state);
    const fogCanvas = document.getElementById('vtt-fog-layer');
    const ctx = fogCanvas.getContext('2d');

    // 16 cells total, 2 revealed = 14 fog rectangles
    const fillCalls = ctx._calls.filter((c) => c.method === 'fillRect');
    assert.equal(fillCalls.length, 14,
      'fog should render correctly when overlay data is present');
  });

  test('fog remains editable (enabled) when scene has overlay', () => {
    const state = makeFogState({ revealedCells: { '2,2': true } });
    state.boardState.sceneState['scene-1'].overlay = {
      mapUrl: 'overlay.png',
      layers: [{ id: 'layer-1', visible: true, mapUrl: 'overlay.png' }],
    };
    const api = createMockBoardApi(state);
    mountFogOfWar({ isGm: true, boardApi: api });

    // Toggle fog off
    toggleFogForScene('scene-1', false);
    let updated = api._getState();
    assert.equal(updated.boardState.sceneState['scene-1'].fogOfWar.enabled, false);

    // Toggle fog back on - revealed cells should be preserved
    toggleFogForScene('scene-1', true);
    updated = api._getState();
    assert.equal(updated.boardState.sceneState['scene-1'].fogOfWar.enabled, true);
    assert.deepEqual(updated.boardState.sceneState['scene-1'].fogOfWar.revealedCells,
      { '2,2': true }, 'revealed cells preserved through fog toggle cycle');
  });

  test('isPositionFogged works correctly when overlay data exists', () => {
    mountFogOfWar({ isGm: false });
    const state = makeFogState({ revealedCells: { '5,5': true } });
    state.boardState.sceneState['scene-1'].overlay = {
      mapUrl: 'overlay.png',
      layers: [{ id: 'layer-1', visible: true }],
    };

    // Fogged cell should still be fogged even with overlay present
    assert.equal(isPositionFogged(state, 3, 3), true,
      'unrevealed cells remain fogged with overlay');
    // Revealed cell should not be fogged
    assert.equal(isPositionFogged(state, 5, 5), false,
      'revealed cells remain visible with overlay');
  });
});
