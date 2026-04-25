import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createTokenInteractions } from '../token-interactions.js';

function buildViewState(overrides = {}) {
  return {
    mapLoaded: true,
    scale: 1,
    translation: { x: 0, y: 0 },
    gridSize: 64,
    gridOffsets: { top: 0, right: 0, bottom: 0, left: 0 },
    mapPixelSize: { width: 640, height: 640 },
    selectionBoxState: null,
    dragCandidate: null,
    dragState: null,
    isPanning: false,
    pointerId: null,
    lastPointer: { x: 0, y: 0 },
    ...overrides,
  };
}

function stubEl() {
  return {
    style: {},
    hidden: false,
    classList: { add() {}, remove() {} },
    setPointerCapture() {},
    releasePointerCapture() {},
  };
}

function createTokenDragHarness({ measureActive = false } = {}) {
  const viewState = buildViewState();
  const placements = [
    { id: 'token-1', column: 1, row: 1, width: 1, height: 1 },
  ];
  const calls = {
    begin: [],
    update: [],
    finalize: [],
    cancel: 0,
    render: 0,
  };

  const ti = createTokenInteractions({
    mapSurface: stubEl(),
    tokenLayer: null,
    selectionBox: stubEl(),
    viewState,
    selectedTokenIds: new Set(),
    boardApi: {
      getState: () => ({
        boardState: {
          activeSceneId: 'scene-1',
          placements: { 'scene-1': placements },
        },
      }),
      updateState: () => {},
    },
    getLocalMapPoint: (event) => ({ x: event.localX, y: event.localY }),
    normalizePlacementForRender: (placement) => placement,
    getActiveScenePlacements: () => placements,
    clampPlacementToBounds: (column, row, width, height) => ({ column, row, width, height }),
    renderTokens: () => {
      calls.render += 1;
    },
    notifySelectionChanged: () => {},
    isMeasureModeActive: () => measureActive,
    beginExternalMeasurement: (point, options) => {
      calls.begin.push({ point, options });
      return true;
    },
    updateExternalMeasurement: (point) => {
      calls.update.push(point);
    },
    finalizeExternalMeasurement: (point) => {
      calls.finalize.push(point);
    },
    cancelExternalMeasurement: () => {
      calls.cancel += 1;
    },
    measurementPointFromToken: (position) => ({
      column: position.column,
      row: position.row,
      mapX: position.column * 64 + 32,
      mapY: position.row * 64 + 32,
    }),
    markPlacementDirty: () => {},
    ensureScenePlacementDraft: () => [],
    toNonNegativeNumber: (value, fallback = 0) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : fallback;
    },
    persistBoardStateSnapshot: () => {},
    windowRef: {
      requestAnimationFrame(callback) {
        callback();
        return 1;
      },
      cancelAnimationFrame() {},
    },
  });

  return { ti, viewState, placements, calls };
}

test('createTokenInteractions returns the expected public surface', () => {
  const ti = createTokenInteractions({
    mapSurface: stubEl(),
    tokenLayer: stubEl(),
    selectionBox: stubEl(),
    viewState: buildViewState(),
    selectedTokenIds: new Set(),
    boardApi: { getState: () => ({}), updateState: () => {} },
  });

  assert.equal(typeof ti.startSelectionBox, 'function');
  assert.equal(typeof ti.updateSelectionBox, 'function');
  assert.equal(typeof ti.finishSelectionBox, 'function');
  assert.equal(typeof ti.cancelSelectionBox, 'function');
  assert.equal(typeof ti.prepareTokenDrag, 'function');
  assert.equal(typeof ti.beginTokenDrag, 'function');
  assert.equal(typeof ti.updateTokenDrag, 'function');
  assert.equal(typeof ti.endTokenDrag, 'function');
  assert.equal(typeof ti.clearDragCandidate, 'function');
});

test('startSelectionBox populates selectionBoxState and captures the pointer', () => {
  const viewState = buildViewState();
  const capturedPointers = [];
  const mapSurface = {
    ...stubEl(),
    setPointerCapture(id) {
      capturedPointers.push(id);
    },
  };

  const ti = createTokenInteractions({
    mapSurface,
    tokenLayer: stubEl(),
    selectionBox: stubEl(),
    viewState,
    selectedTokenIds: new Set(),
    boardApi: { getState: () => ({}), updateState: () => {} },
    getLocalMapPoint: () => ({ x: 10, y: 20 }),
  });

  const ok = ti.startSelectionBox({ pointerId: 7, clientX: 0, clientY: 0 });
  assert.equal(ok, true);
  assert.deepEqual(capturedPointers, [7]);
  assert.ok(viewState.selectionBoxState, 'state set');
  assert.equal(viewState.selectionBoxState.pointerId, 7);
  assert.deepEqual(viewState.selectionBoxState.startLocal, { x: 10, y: 20 });
  assert.equal(viewState.selectionBoxState.active, false);
});

test('clearDragCandidate only clears when pointerId matches', () => {
  const viewState = buildViewState({
    dragCandidate: { pointerId: 3, tokens: [], originalPositions: new Map() },
  });

  const ti = createTokenInteractions({
    mapSurface: stubEl(),
    tokenLayer: stubEl(),
    selectionBox: stubEl(),
    viewState,
    selectedTokenIds: new Set(),
    boardApi: { getState: () => ({}), updateState: () => {} },
  });

  ti.clearDragCandidate(99);
  assert.ok(viewState.dragCandidate, 'unchanged when pointerId mismatches');

  ti.clearDragCandidate(3);
  assert.equal(viewState.dragCandidate, null);

  ti.clearDragCandidate();
  // No-op on an already-null candidate
  assert.equal(viewState.dragCandidate, null);
});

test('cancelSelectionBox clears state and hides the box element', () => {
  const viewState = buildViewState({
    selectionBoxState: { pointerId: 4, active: true, startLocal: { x: 0, y: 0 }, currentLocal: { x: 0, y: 0 } },
  });
  const selectionBox = { ...stubEl(), hidden: false };
  const released = [];
  const mapSurface = {
    ...stubEl(),
    releasePointerCapture(id) {
      released.push(id);
    },
  };

  const ti = createTokenInteractions({
    mapSurface,
    tokenLayer: stubEl(),
    selectionBox,
    viewState,
    selectedTokenIds: new Set(),
    boardApi: { getState: () => ({}), updateState: () => {} },
  });

  ti.cancelSelectionBox();

  assert.equal(selectionBox.hidden, true);
  assert.equal(viewState.selectionBoxState, null);
  assert.deepEqual(released, [4]);
});

test('token drag starts a temporary measurement when measure mode is inactive', () => {
  const { ti, viewState, placements, calls } = createTokenDragHarness({ measureActive: false });
  const startEvent = { pointerId: 1, clientX: 64, clientY: 64, localX: 64, localY: 64 };

  ti.prepareTokenDrag(startEvent, placements[0]);
  assert.equal(ti.beginTokenDrag(startEvent), true);

  assert.equal(calls.begin.length, 1);
  assert.equal(calls.begin[0].options?.allowInactive, true);
  assert.equal(viewState.dragState.measurement.temporary, true);

  ti.updateTokenDrag({ pointerId: 1, buttons: 1, localX: 128, localY: 64 });
  assert.ok(calls.update.length > 0);
  assert.deepEqual(calls.update.at(-1), { column: 2, row: 1, mapX: 160, mapY: 96 });

  ti.endTokenDrag({ commit: true, pointerId: 1 });
  assert.equal(calls.cancel, 1);
  assert.equal(calls.finalize.length, 0);
});

test('token drag finalizes measurement when measure mode is active', () => {
  const { ti, viewState, placements, calls } = createTokenDragHarness({ measureActive: true });
  const startEvent = { pointerId: 1, clientX: 64, clientY: 64, localX: 64, localY: 64 };

  ti.prepareTokenDrag(startEvent, placements[0]);
  assert.equal(ti.beginTokenDrag(startEvent), true);

  assert.equal(calls.begin.length, 1);
  assert.equal(calls.begin[0].options?.allowInactive, true);
  assert.equal(viewState.dragState.measurement.temporary, false);

  ti.updateTokenDrag({ pointerId: 1, buttons: 1, localX: 128, localY: 64 });
  ti.endTokenDrag({ commit: true, pointerId: 1 });

  assert.equal(calls.cancel, 0);
  assert.deepEqual(calls.finalize, [{ column: 2, row: 1, mapX: 160, mapY: 96 }]);
});
