/**
 * Tests that fog of war revealedCells arrays from the server are coerced to
 * plain objects ({}) in all client-side code paths.
 *
 * Root cause: PHP's json_encode() turns empty PHP arrays into [] (JSON array)
 * instead of {} (JSON object). JavaScript treats [] as an Array, so setting
 * arr["36,66"] = true creates an "expando property" that JSON.stringify()
 * silently drops (non-numeric keys on arrays are ignored). Since getState()
 * uses JSON.parse(JSON.stringify(state)), all fog cells vanish.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  initializeState,
  getState,
  updateState,
} from '../store.js';

import { mergeBoardStateSnapshot } from '../../ui/board-interactions.js';

// ---------------------------------------------------------------------------
// store.js — normalizeFogOfWarEntry (via initializeState)
// ---------------------------------------------------------------------------

describe('store normalization: array revealedCells coercion', () => {
  test('initializeState coerces revealedCells array to empty object', () => {
    initializeState({
      boardState: {
        activeSceneId: 'scene-1',
        sceneState: {
          'scene-1': {
            grid: { size: 64, locked: false, visible: true },
            fogOfWar: { enabled: true, revealedCells: [] },
          },
        },
      },
      user: { isGM: true, name: 'GM' },
    });

    const state = getState();
    const fog = state.boardState.sceneState['scene-1'].fogOfWar;
    assert.ok(fog, 'fogOfWar should exist');
    assert.equal(fog.enabled, true);
    assert.ok(!Array.isArray(fog.revealedCells), 'revealedCells must not be an array');
    assert.equal(typeof fog.revealedCells, 'object');
    assert.deepEqual(fog.revealedCells, {}, 'empty array should become empty object');
  });

  test('cells added after array coercion survive getState round-trip', () => {
    initializeState({
      boardState: {
        activeSceneId: 'scene-1',
        sceneState: {
          'scene-1': {
            grid: { size: 64, locked: false, visible: true },
            fogOfWar: { enabled: true, revealedCells: [] },
          },
        },
      },
      user: { isGM: true, name: 'GM' },
    });

    // Simulate applyFogChange adding cells
    updateState((draft) => {
      const fog = draft.boardState.sceneState['scene-1'].fogOfWar;
      if (!fog.revealedCells || typeof fog.revealedCells !== 'object' || Array.isArray(fog.revealedCells)) {
        fog.revealedCells = {};
      }
      fog.revealedCells['36,66'] = true;
      fog.revealedCells['0,0'] = true;
    });

    const state = getState();
    const fog = state.boardState.sceneState['scene-1'].fogOfWar;
    assert.equal(Object.keys(fog.revealedCells).length, 2,
      'should have 2 revealed cells after adding to coerced object');
    assert.equal(fog.revealedCells['36,66'], true);
    assert.equal(fog.revealedCells['0,0'], true);
  });

  test('JSON.parse(JSON.stringify()) preserves cells after coercion', () => {
    initializeState({
      boardState: {
        activeSceneId: 'scene-1',
        sceneState: {
          'scene-1': {
            grid: { size: 64, locked: false, visible: true },
            fogOfWar: { enabled: true, revealedCells: [] },
          },
        },
      },
      user: { isGM: true, name: 'GM' },
    });

    updateState((draft) => {
      const fog = draft.boardState.sceneState['scene-1'].fogOfWar;
      if (Array.isArray(fog.revealedCells)) fog.revealedCells = {};
      fog.revealedCells['5,10'] = true;
      fog.revealedCells['20,30'] = true;
    });

    // This is exactly what getState() does internally
    const state = getState();
    const roundTripped = JSON.parse(JSON.stringify(state));
    const fog = roundTripped.boardState.sceneState['scene-1'].fogOfWar;

    assert.ok(!Array.isArray(fog.revealedCells), 'round-tripped revealedCells must not be array');
    assert.equal(Object.keys(fog.revealedCells).length, 2);
    assert.equal(fog.revealedCells['5,10'], true);
    assert.equal(fog.revealedCells['20,30'], true);
  });
});

// ---------------------------------------------------------------------------
// Demonstrates the original bug: expando properties on arrays are lost
// ---------------------------------------------------------------------------

describe('original bug demonstration', () => {
  test('expando properties on arrays are lost by JSON.stringify', () => {
    // This is exactly what happened before the fix
    const arr = [];
    arr['36,66'] = true;
    arr['0,0'] = true;

    // Object.keys sees the expando properties
    assert.equal(Object.keys(arr).length, 2, 'Object.keys sees expando properties');

    // But JSON.stringify silently drops them
    const json = JSON.stringify(arr);
    assert.equal(json, '[]', 'JSON.stringify drops non-numeric array keys');

    // After round-trip, the data is gone
    const parsed = JSON.parse(json);
    assert.equal(Object.keys(parsed).length, 0, 'data is lost after round-trip');
  });

  test('plain objects preserve string keys through JSON round-trip', () => {
    // This is the correct behavior after the fix
    const obj = {};
    obj['36,66'] = true;
    obj['0,0'] = true;

    const json = JSON.stringify(obj);
    const parsed = JSON.parse(json);

    assert.equal(Object.keys(parsed).length, 2, 'object keys survive round-trip');
    assert.equal(parsed['36,66'], true);
    assert.equal(parsed['0,0'], true);
  });
});

// ---------------------------------------------------------------------------
// mergeBoardStateSnapshot — mergeSceneStatePreservingGrid array coercion
// ---------------------------------------------------------------------------

describe('mergeBoardStateSnapshot: array revealedCells coercion', () => {
  test('incoming array revealedCells is coerced to object during merge', () => {
    const existing = {
      activeSceneId: 'scene-1',
      sceneState: {
        'scene-1': {
          grid: { size: 64, locked: false, visible: true },
          fogOfWar: { enabled: true, revealedCells: { '5,5': true } },
        },
      },
      placements: {},
      templates: {},
      drawings: {},
    };

    const incoming = {
      activeSceneId: 'scene-1',
      sceneState: {
        'scene-1': {
          grid: { size: 64, locked: false, visible: true },
          // Server returns [] for empty revealedCells (the PHP bug)
          fogOfWar: { enabled: true, revealedCells: [] },
        },
      },
      placements: {},
      templates: {},
      drawings: {},
    };

    const merged = mergeBoardStateSnapshot(existing, incoming);
    const fog = merged.sceneState['scene-1'].fogOfWar;

    assert.ok(!Array.isArray(fog.revealedCells),
      'merged revealedCells must not be an array');
    assert.equal(typeof fog.revealedCells, 'object');
    // Existing cells should be preserved (union merge)
    assert.equal(fog.revealedCells['5,5'], true,
      'existing revealed cell should be preserved');
  });

  test('both sides have array revealedCells — result is always object', () => {
    const existing = {
      activeSceneId: 'scene-1',
      sceneState: {
        'scene-1': {
          grid: { size: 64, locked: false, visible: true },
          fogOfWar: { enabled: true, revealedCells: [] },
        },
      },
      placements: {},
      templates: {},
      drawings: {},
    };

    const incoming = {
      activeSceneId: 'scene-1',
      sceneState: {
        'scene-1': {
          grid: { size: 64, locked: false, visible: true },
          fogOfWar: { enabled: true, revealedCells: [] },
        },
      },
      placements: {},
      templates: {},
      drawings: {},
    };

    const merged = mergeBoardStateSnapshot(existing, incoming);
    const fog = merged.sceneState['scene-1'].fogOfWar;

    assert.ok(!Array.isArray(fog.revealedCells),
      'revealedCells must be a plain object even when both sides are arrays');
    assert.deepEqual(fog.revealedCells, {});
  });

  test('new map with no fog data gets correct structure after merge', () => {
    const existing = {
      activeSceneId: 'new-scene',
      sceneState: {},
      placements: {},
      templates: {},
      drawings: {},
    };

    const incoming = {
      activeSceneId: 'new-scene',
      sceneState: {
        'new-scene': {
          grid: { size: 64, locked: false, visible: true },
          fogOfWar: { enabled: true, revealedCells: [] },
        },
      },
      placements: {},
      templates: {},
      drawings: {},
    };

    const merged = mergeBoardStateSnapshot(existing, incoming);
    const fog = merged.sceneState['new-scene'].fogOfWar;

    assert.ok(fog, 'fogOfWar should exist');
    assert.ok(!Array.isArray(fog.revealedCells),
      'revealedCells on new map must be a plain object');
  });
});
