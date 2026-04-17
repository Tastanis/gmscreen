import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { createMapPings } from '../map-pings.js';

function setupDom() {
  const dom = new JSDOM('<!DOCTYPE html><body></body>', { pretendToBeVisual: true });
  return { documentRef: dom.window.document, windowRef: dom.window };
}

function makeViewState() {
  return {
    scale: 1,
    translation: { x: 0, y: 0 },
    mapLoaded: true,
    mapPixelSize: { width: 1000, height: 800 },
  };
}

function makeBoardApi() {
  const state = { boardState: { activeSceneId: 'scene-1', pings: [] } };
  return {
    state,
    getState: () => state,
    updateState: (mutator) => mutator(state),
  };
}

test('createMapPings exposes the public surface', () => {
  const api = createMapPings();
  assert.equal(typeof api.handleMapPing, 'function');
  assert.equal(typeof api.processIncomingPings, 'function');
  assert.equal(typeof api.sanitizePingsForPersistence, 'function');
  assert.equal(typeof api.clonePingEntries, 'function');
  assert.equal(typeof api.normalizeIncomingPing, 'function');
});

test('handleMapPing queues a ping into board state and renders a pulse', () => {
  const { documentRef, windowRef } = setupDom();
  const pingLayer = documentRef.createElement('div');
  documentRef.body.appendChild(pingLayer);

  const board = documentRef.createElement('div');
  documentRef.body.appendChild(board);

  const boardApi = makeBoardApi();
  const persistCalls = [];
  const dirtyCalls = [];

  const mapPings = createMapPings({
    documentRef,
    windowRef,
    getBoardElement: () => board,
    getPingLayer: () => pingLayer,
    getViewState: makeViewState,
    applyTransform: () => {},
    getBoardState: boardApi.getState,
    updateBoardState: boardApi.updateState,
    getCurrentUserId: () => 'user-1',
    normalizeProfileId: (value) => value,
    getLocalMapPoint: () => ({ x: 500, y: 400 }),
    markPingsDirty: () => dirtyCalls.push(true),
    persistBoardStateSnapshot: () => persistCalls.push(true),
  });

  const ok = mapPings.handleMapPing({}, { focus: false });
  assert.equal(ok, true, 'handleMapPing should return true on success');
  assert.equal(boardApi.state.boardState.pings.length, 1);
  assert.equal(boardApi.state.boardState.pings[0].sceneId, 'scene-1');
  assert.equal(boardApi.state.boardState.pings[0].type, 'ping');
  assert.equal(dirtyCalls.length, 1);
  assert.equal(persistCalls.length, 1);
  assert.equal(pingLayer.children.length, 1, 'a ping pulse element should be appended');
});

test('handleMapPing returns false when the map is not loaded', () => {
  const { documentRef, windowRef } = setupDom();
  const mapPings = createMapPings({
    documentRef,
    windowRef,
    getBoardElement: () => null,
    getPingLayer: () => null,
    getViewState: () => ({ ...makeViewState(), mapLoaded: false }),
    applyTransform: () => {},
    getBoardState: () => ({}),
    updateBoardState: () => {},
    getCurrentUserId: () => null,
    normalizeProfileId: (v) => v,
    getLocalMapPoint: () => ({ x: 0, y: 0 }),
    markPingsDirty: () => {},
    persistBoardStateSnapshot: () => {},
  });

  assert.equal(mapPings.handleMapPing({}), false);
});

test('processIncomingPings dedupes by id and prunes stale entries', () => {
  const { documentRef, windowRef } = setupDom();
  const pingLayer = documentRef.createElement('div');
  documentRef.body.appendChild(pingLayer);

  const mapPings = createMapPings({
    documentRef,
    windowRef,
    getBoardElement: () => documentRef.body,
    getPingLayer: () => pingLayer,
    getViewState: makeViewState,
    applyTransform: () => {},
    getBoardState: () => ({}),
    updateBoardState: () => {},
    getCurrentUserId: () => null,
    normalizeProfileId: (v) => v,
    getLocalMapPoint: () => null,
    markPingsDirty: () => {},
    persistBoardStateSnapshot: () => {},
  });

  const fresh = { id: 'p1', x: 0.5, y: 0.5, createdAt: Date.now() };
  const stale = { id: 'p2', x: 0.1, y: 0.1, createdAt: Date.now() - 60_000 };
  const entries = [fresh, stale];

  mapPings.processIncomingPings(entries, 'scene-1');
  // The stale entry should have been removed from the input array in place.
  assert.equal(entries.length, 1);
  assert.equal(entries[0].id, 'p1');

  // Calling again with the same fresh ping should not render a duplicate.
  const beforeCount = pingLayer.children.length;
  mapPings.processIncomingPings([fresh], 'scene-1');
  assert.equal(pingLayer.children.length, beforeCount);
});

test('sanitizePingsForPersistence drops invalid entries and enforces history limit', () => {
  const mapPings = createMapPings();
  const now = Date.now();
  const entries = [];
  for (let i = 0; i < 12; i += 1) {
    entries.push({ id: `p${i}`, x: 0.5, y: 0.5, createdAt: now - i });
  }
  entries.push({ id: '', x: 0.5, y: 0.5, createdAt: now }); // invalid id
  entries.push(null);

  const result = mapPings.sanitizePingsForPersistence(entries);
  assert.ok(result.length <= 8, 'should cap at history limit (8)');
  for (const entry of result) {
    assert.ok(entry.id);
    assert.ok(Number.isFinite(entry.createdAt));
  }
});

test('normalizeIncomingPing returns null for malformed input', () => {
  const mapPings = createMapPings();
  assert.equal(mapPings.normalizeIncomingPing(null), null);
  assert.equal(mapPings.normalizeIncomingPing({}), null);
  assert.equal(mapPings.normalizeIncomingPing({ id: 'a' }), null);
  assert.equal(mapPings.normalizeIncomingPing({ id: 'a', x: 'no', y: 0 }), null);
});

test('clonePingEntries produces an independent copy', () => {
  const mapPings = createMapPings();
  const source = [{ id: 'a', x: 0.1, y: 0.2, createdAt: 1, type: 'ping' }];
  const clone = mapPings.clonePingEntries(source);
  clone[0].id = 'mutated';
  assert.equal(source[0].id, 'a');
});
