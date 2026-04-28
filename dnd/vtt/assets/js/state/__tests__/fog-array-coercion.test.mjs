/**
 * Tests that fog of war revealedCells arrays from the server are coerced to
 * plain objects ({}) in all client-side code paths.
 *
 * Root cause: PHP's json_encode() turns empty PHP arrays into [] (JSON array)
 * instead of {} (JSON object). JavaScript treats [] as an Array, so setting
 * arr["36,66"] = true creates an "expando property" that JSON.stringify()
 * silently drops (non-numeric keys on arrays are ignored). Since getState()
 * uses JSON.parse(JSON.stringify(state)), all fog cells vanish.
 *
 * Per-level shape: fogOfWar.byLevel[levelId] = { enabled, revealedCells }.
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

describe('store normalization: legacy migration + array coercion', () => {
  test('legacy { enabled, revealedCells } migrates to byLevel["level-0"]', () => {
    initializeState({
      boardState: {
        activeSceneId: 'scene-1',
        sceneState: {
          'scene-1': {
            grid: { size: 64, locked: false, visible: true },
            fogOfWar: { enabled: true, revealedCells: { '5,5': true } },
          },
        },
      },
      user: { isGM: true, name: 'GM' },
    });

    const state = getState();
    const fog = state.boardState.sceneState['scene-1'].fogOfWar;
    assert.ok(fog && fog.byLevel, 'byLevel should exist');
    const level0 = fog.byLevel['level-0'];
    assert.ok(level0, 'legacy fog should migrate to Level 0');
    assert.equal(level0.enabled, true);
    assert.equal(level0.revealedCells['5,5'], true);
  });

  test('initializeState coerces byLevel revealedCells array to empty object', () => {
    initializeState({
      boardState: {
        activeSceneId: 'scene-1',
        sceneState: {
          'scene-1': {
            grid: { size: 64, locked: false, visible: true },
            fogOfWar: {
              byLevel: {
                'level-0': { enabled: true, revealedCells: [] },
              },
            },
          },
        },
      },
      user: { isGM: true, name: 'GM' },
    });

    const state = getState();
    const level0 = state.boardState.sceneState['scene-1'].fogOfWar.byLevel['level-0'];
    assert.ok(level0, 'level-0 fog should exist');
    assert.equal(level0.enabled, true);
    assert.ok(!Array.isArray(level0.revealedCells), 'revealedCells must not be an array');
    assert.equal(typeof level0.revealedCells, 'object');
    assert.deepEqual(level0.revealedCells, {}, 'empty array should become empty object');
  });

  test('cells added after array coercion survive getState round-trip', () => {
    initializeState({
      boardState: {
        activeSceneId: 'scene-1',
        sceneState: {
          'scene-1': {
            grid: { size: 64, locked: false, visible: true },
            fogOfWar: {
              byLevel: {
                'level-0': { enabled: true, revealedCells: [] },
              },
            },
          },
        },
      },
      user: { isGM: true, name: 'GM' },
    });

    updateState((draft) => {
      const level0 = draft.boardState.sceneState['scene-1'].fogOfWar.byLevel['level-0'];
      if (!level0.revealedCells || typeof level0.revealedCells !== 'object'
          || Array.isArray(level0.revealedCells)) {
        level0.revealedCells = {};
      }
      level0.revealedCells['36,66'] = true;
      level0.revealedCells['0,0'] = true;
    });

    const state = getState();
    const level0 = state.boardState.sceneState['scene-1'].fogOfWar.byLevel['level-0'];
    assert.equal(Object.keys(level0.revealedCells).length, 2);
    assert.equal(level0.revealedCells['36,66'], true);
    assert.equal(level0.revealedCells['0,0'], true);
  });

  test('JSON.parse(JSON.stringify()) preserves cells after coercion', () => {
    initializeState({
      boardState: {
        activeSceneId: 'scene-1',
        sceneState: {
          'scene-1': {
            grid: { size: 64, locked: false, visible: true },
            fogOfWar: {
              byLevel: {
                'level-0': { enabled: true, revealedCells: [] },
              },
            },
          },
        },
      },
      user: { isGM: true, name: 'GM' },
    });

    updateState((draft) => {
      const level0 = draft.boardState.sceneState['scene-1'].fogOfWar.byLevel['level-0'];
      if (Array.isArray(level0.revealedCells)) level0.revealedCells = {};
      level0.revealedCells['5,10'] = true;
      level0.revealedCells['20,30'] = true;
    });

    const state = getState();
    const roundTripped = JSON.parse(JSON.stringify(state));
    const level0 = roundTripped.boardState.sceneState['scene-1'].fogOfWar.byLevel['level-0'];

    assert.ok(!Array.isArray(level0.revealedCells), 'round-tripped revealedCells must not be array');
    assert.equal(Object.keys(level0.revealedCells).length, 2);
    assert.equal(level0.revealedCells['5,10'], true);
    assert.equal(level0.revealedCells['20,30'], true);
  });
});

// ---------------------------------------------------------------------------
// Demonstrates the original bug: expando properties on arrays are lost
// ---------------------------------------------------------------------------

describe('original bug demonstration', () => {
  test('expando properties on arrays are lost by JSON.stringify', () => {
    const arr = [];
    arr['36,66'] = true;
    arr['0,0'] = true;

    assert.equal(Object.keys(arr).length, 2, 'Object.keys sees expando properties');

    const json = JSON.stringify(arr);
    assert.equal(json, '[]', 'JSON.stringify drops non-numeric array keys');

    const parsed = JSON.parse(json);
    assert.equal(Object.keys(parsed).length, 0, 'data is lost after round-trip');
  });

  test('plain objects preserve string keys through JSON round-trip', () => {
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

describe('mergeBoardStateSnapshot: per-level array revealedCells coercion', () => {
  test('incoming array revealedCells on a level is coerced to object', () => {
    const existing = {
      activeSceneId: 'scene-1',
      sceneState: {
        'scene-1': {
          grid: { size: 64, locked: false, visible: true },
          fogOfWar: {
            byLevel: {
              'level-0': { enabled: true, revealedCells: { '5,5': true } },
            },
          },
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
          fogOfWar: {
            byLevel: {
              'level-0': { enabled: true, revealedCells: [] },
            },
          },
        },
      },
      placements: {},
      templates: {},
      drawings: {},
    };

    const merged = mergeBoardStateSnapshot(existing, incoming);
    const level0 = merged.sceneState['scene-1'].fogOfWar.byLevel['level-0'];

    assert.ok(!Array.isArray(level0.revealedCells),
      'merged revealedCells must not be an array');
    assert.equal(typeof level0.revealedCells, 'object');
    // Incoming is authoritative for that level — empty incoming means GM re-fogged
    // everything on Level 0.
    assert.deepStrictEqual(level0.revealedCells, {});
  });

  test('per-level merge: existing levels not in incoming are preserved', () => {
    const existing = {
      activeSceneId: 'scene-1',
      sceneState: {
        'scene-1': {
          grid: { size: 64, locked: false, visible: true },
          fogOfWar: {
            byLevel: {
              'level-0': { enabled: true, revealedCells: { '1,1': true } },
              'level-A': { enabled: true, revealedCells: { '2,2': true } },
            },
          },
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
          fogOfWar: {
            // Only level-0 in incoming — level-A should be preserved from existing.
            byLevel: {
              'level-0': { enabled: true, revealedCells: { '1,1': true, '3,3': true } },
            },
          },
        },
      },
      placements: {},
      templates: {},
      drawings: {},
    };

    const merged = mergeBoardStateSnapshot(existing, incoming);
    const byLevel = merged.sceneState['scene-1'].fogOfWar.byLevel;
    assert.deepStrictEqual(byLevel['level-0'].revealedCells, { '1,1': true, '3,3': true },
      'level-0 should reflect incoming');
    assert.ok(byLevel['level-A'], 'level-A should survive partial save');
    assert.deepStrictEqual(byLevel['level-A'].revealedCells, { '2,2': true });
  });

  test('new scene with byLevel arrays gets correct structure after merge', () => {
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
          fogOfWar: {
            byLevel: {
              'level-0': { enabled: true, revealedCells: [] },
            },
          },
        },
      },
      placements: {},
      templates: {},
      drawings: {},
    };

    const merged = mergeBoardStateSnapshot(existing, incoming);
    const level0 = merged.sceneState['new-scene'].fogOfWar.byLevel['level-0'];

    assert.ok(level0, 'level-0 fog should exist');
    assert.ok(!Array.isArray(level0.revealedCells),
      'revealedCells on new map must be a plain object');
  });
});
