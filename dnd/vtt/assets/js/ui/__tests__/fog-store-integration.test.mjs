/**
 * Integration test: fog revealedCells through the REAL store (not mock).
 * This tests whether the store's updateState + getState round-trip preserves fog data.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  initializeState,
  getState,
  updateState,
  subscribe,
} from '../../state/store.js';

describe('fog revealedCells through real store', () => {
  test('cells survive updateState + getState round-trip', () => {
    initializeState({
      boardState: {
        activeSceneId: 'scene-1',
        sceneState: {
          'scene-1': {
            grid: { size: 64, locked: false, visible: true },
            fogOfWar: { enabled: true, revealedCells: {} },
          },
        },
      },
      user: { isGM: true, name: 'GM' },
    });

    // Simulate applyFogChange: add cells inside updateState
    updateState((draft) => {
      const fog = draft.boardState.sceneState['scene-1'].fogOfWar;
      fog.revealedCells['5,5'] = true;
      fog.revealedCells['6,6'] = true;
      fog.revealedCells['10,20'] = true;
    });

    const state = getState();
    const fog = state.boardState.sceneState['scene-1'].fogOfWar;
    assert.equal(fog.enabled, true);
    assert.equal(Object.keys(fog.revealedCells).length, 3, 'should have 3 revealed cells');
    assert.equal(fog.revealedCells['5,5'], true);
    assert.equal(fog.revealedCells['6,6'], true);
    assert.equal(fog.revealedCells['10,20'], true);
  });

  test('cells survive multiple updateState calls', () => {
    initializeState({
      boardState: {
        activeSceneId: 'scene-1',
        sceneState: {
          'scene-1': {
            grid: { size: 64, locked: false, visible: true },
            fogOfWar: { enabled: true, revealedCells: {} },
          },
        },
      },
      user: { isGM: true, name: 'GM' },
    });

    // First batch
    updateState((draft) => {
      const fog = draft.boardState.sceneState['scene-1'].fogOfWar;
      for (let c = 0; c < 5; c++) {
        for (let r = 0; r < 5; r++) {
          fog.revealedCells[c + ',' + r] = true;
        }
      }
    });

    let state = getState();
    assert.equal(
      Object.keys(state.boardState.sceneState['scene-1'].fogOfWar.revealedCells).length,
      25,
      'first batch: 25 cells'
    );

    // Second batch (simulating another user selection)
    updateState((draft) => {
      const fog = draft.boardState.sceneState['scene-1'].fogOfWar;
      for (let c = 10; c < 15; c++) {
        for (let r = 10; r < 16; r++) {
          fog.revealedCells[c + ',' + r] = true;
        }
      }
    });

    state = getState();
    assert.equal(
      Object.keys(state.boardState.sceneState['scene-1'].fogOfWar.revealedCells).length,
      55,
      'after second batch: 55 cells total'
    );
  });

  test('cells survive when scene entry is created during toggleFog then modified', () => {
    // Start with NO sceneState entry for the scene (like a fresh map)
    initializeState({
      boardState: {
        activeSceneId: 'scene-new',
        sceneState: {},
      },
      user: { isGM: true, name: 'GM' },
    });

    // Simulate toggleFogForScene creating the entry
    updateState((draft) => {
      if (!draft.boardState.sceneState) draft.boardState.sceneState = {};
      if (!draft.boardState.sceneState['scene-new']) {
        draft.boardState.sceneState['scene-new'] = { grid: { size: 64, locked: false, visible: true } };
      }
      if (!draft.boardState.sceneState['scene-new'].fogOfWar) {
        draft.boardState.sceneState['scene-new'].fogOfWar = { enabled: false, revealedCells: {} };
      }
      draft.boardState.sceneState['scene-new'].fogOfWar.enabled = true;
    });

    // Verify toggle worked
    let state = getState();
    assert.ok(state.boardState.sceneState['scene-new'], 'scene entry should exist');
    assert.equal(state.boardState.sceneState['scene-new'].fogOfWar.enabled, true);

    // Now simulate applyFogChange
    updateState((draft) => {
      const fog = draft.boardState.sceneState['scene-new'].fogOfWar;
      if (!fog.revealedCells) fog.revealedCells = {};
      for (let c = 0; c < 6; c++) {
        for (let r = 0; r < 5; r++) {
          fog.revealedCells[c + ',' + r] = true;
        }
      }
    });

    state = getState();
    const fog = state.boardState.sceneState['scene-new'].fogOfWar;
    assert.equal(fog.enabled, true);
    assert.equal(
      Object.keys(fog.revealedCells).length,
      30,
      'should have 30 revealed cells after applyFogChange'
    );
  });

  test('cells survive when subscriber triggers nested updateState', () => {
    initializeState({
      boardState: {
        activeSceneId: 'scene-1',
        sceneState: {
          'scene-1': {
            grid: { size: 64, locked: false, visible: true },
            fogOfWar: { enabled: true, revealedCells: {} },
          },
        },
      },
      user: { isGM: true, name: 'GM' },
    });

    // Add a subscriber that triggers a nested updateState (like combat sync would)
    let subscriberCallCount = 0;
    const unsubscribe = subscribe((state) => {
      subscriberCallCount++;
      // On the first notification, trigger a nested updateState that modifies metadata
      if (subscriberCallCount === 1) {
        updateState((draft) => {
          if (!draft.boardState.metadata) draft.boardState.metadata = {};
          draft.boardState.metadata.lastSync = Date.now();
        });
      }
    });

    // Add fog cells
    updateState((draft) => {
      const fog = draft.boardState.sceneState['scene-1'].fogOfWar;
      fog.revealedCells['5,5'] = true;
      fog.revealedCells['6,6'] = true;
    });

    const state = getState();
    const fog = state.boardState.sceneState['scene-1'].fogOfWar;
    assert.equal(
      Object.keys(fog.revealedCells).length,
      2,
      'fog cells should survive nested updateState from subscriber'
    );

    unsubscribe();
  });

  test('cells survive when subscriber replaces boardState (simulating poller merge)', () => {
    initializeState({
      boardState: {
        activeSceneId: 'scene-1',
        sceneState: {
          'scene-1': {
            grid: { size: 64, locked: false, visible: true },
            fogOfWar: { enabled: true, revealedCells: {} },
          },
        },
      },
      user: { isGM: true, name: 'GM' },
    });

    // Add a subscriber that replaces draft.boardState (like the poller does)
    let subscriberCallCount = 0;
    const unsubscribe = subscribe((clonedState) => {
      subscriberCallCount++;
      if (subscriberCallCount === 1) {
        // Simulate the poller's updater: draft.boardState = mergedSnapshot
        updateState((draft) => {
          // This simulates what mergeBoardStateSnapshot does:
          // it creates a new boardState object but preserves fog data
          const existing = draft.boardState;
          const incoming = {
            activeSceneId: 'scene-1',
            sceneState: {
              'scene-1': {
                grid: { size: 64, locked: false, visible: true },
                // Server doesn't have fog data yet (save hasn't reached server)
              },
            },
            placements: {},
          };

          // Simulate mergeSceneStatePreservingGrid: clone incoming, preserve grid + fogOfWar from existing
          const mergedSceneState = {};
          const existingSceneState = existing.sceneState || {};
          const incomingSceneState = incoming.sceneState || {};
          const allSceneIds = new Set([...Object.keys(existingSceneState), ...Object.keys(incomingSceneState)]);
          allSceneIds.forEach((sceneId) => {
            const existingEntry = existingSceneState[sceneId];
            const incomingEntry = incomingSceneState[sceneId];
            if (!incomingEntry) {
              mergedSceneState[sceneId] = JSON.parse(JSON.stringify(existingEntry));
              return;
            }
            const mergedEntry = JSON.parse(JSON.stringify(incomingEntry));
            if (existingEntry?.grid) {
              mergedEntry.grid = JSON.parse(JSON.stringify(existingEntry.grid));
            }
            if (existingEntry?.fogOfWar) {
              if (!mergedEntry.fogOfWar) {
                mergedEntry.fogOfWar = JSON.parse(JSON.stringify(existingEntry.fogOfWar));
              }
            }
            mergedSceneState[sceneId] = mergedEntry;
          });

          // REPLACE draft.boardState entirely (like the poller does)
          draft.boardState = {
            activeSceneId: incoming.activeSceneId,
            placements: incoming.placements || existing.placements,
            sceneState: mergedSceneState,
            overlay: existing.overlay,
          };
        });
      }
    });

    // Add fog cells
    updateState((draft) => {
      const fog = draft.boardState.sceneState['scene-1'].fogOfWar;
      fog.revealedCells['5,5'] = true;
      fog.revealedCells['6,6'] = true;
      fog.revealedCells['7,7'] = true;
    });

    const state = getState();
    const fog = state.boardState?.sceneState?.['scene-1']?.fogOfWar;
    assert.ok(fog, 'fogOfWar should exist');
    assert.equal(fog.enabled, true);
    assert.equal(
      Object.keys(fog.revealedCells).length,
      3,
      'fog cells should survive poller-like boardState replacement in subscriber'
    );

    unsubscribe();
  });

  test('cells survive when subscriber replaces boardState WITHOUT fog merge (was a bug)', () => {
    initializeState({
      boardState: {
        activeSceneId: 'scene-1',
        sceneState: {
          'scene-1': {
            grid: { size: 64, locked: false, visible: true },
            fogOfWar: { enabled: true, revealedCells: {} },
          },
        },
      },
      user: { isGM: true, name: 'GM' },
    });

    // This subscriber naively replaces boardState (no fog preservation)
    let subscriberCallCount = 0;
    const unsubscribe = subscribe((clonedState) => {
      subscriberCallCount++;
      if (subscriberCallCount === 1) {
        updateState((draft) => {
          // Naively replace boardState without preserving fog
          draft.boardState = {
            activeSceneId: 'scene-1',
            placements: {},
            sceneState: {
              'scene-1': {
                grid: { size: 64, locked: false, visible: true },
                fogOfWar: { enabled: true, revealedCells: {} }, // empty!
              },
            },
          };
        });
      }
    });

    // Add fog cells
    updateState((draft) => {
      const fog = draft.boardState.sceneState['scene-1'].fogOfWar;
      fog.revealedCells['5,5'] = true;
      fog.revealedCells['6,6'] = true;
    });

    const state = getState();
    const fog = state.boardState?.sceneState?.['scene-1']?.fogOfWar;
    assert.ok(fog, 'fogOfWar should exist');
    // After the fix: the deep-copy snapshot + post-notify() restore should
    // protect fog cells even when a subscriber naively replaces boardState.
    assert.equal(fog.enabled, true);
    assert.equal(
      Object.keys(fog.revealedCells).length,
      2,
      'fog cells should survive naive boardState replacement in subscriber'
    );

    unsubscribe();
  });
});
