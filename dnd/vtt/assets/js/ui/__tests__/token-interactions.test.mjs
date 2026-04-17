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
