/**
 * Integration test: per-level fog revealedCells through the REAL store.
 * Verifies that updateState + getState round-trip preserves fog data.
 *
 * Per-level shape: fogOfWar.byLevel[levelId] = { enabled, revealedCells }.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  initializeState,
  getState,
  updateState,
  subscribe,
} from '../../state/store.js';

const LEVEL_0 = 'level-0';

function initWithLevel0Fog(extraInit = {}) {
  initializeState({
    boardState: {
      activeSceneId: 'scene-1',
      sceneState: {
        'scene-1': {
          grid: { size: 64, locked: false, visible: true },
          fogOfWar: {
            byLevel: {
              [LEVEL_0]: { enabled: true, revealedCells: {} },
            },
          },
        },
      },
    },
    user: { isGM: true, name: 'GM' },
    ...extraInit,
  });
}

describe('fog revealedCells through real store (per-level)', () => {
  test('cells on level-0 survive updateState + getState round-trip', () => {
    initWithLevel0Fog();

    updateState((draft) => {
      const level = draft.boardState.sceneState['scene-1'].fogOfWar.byLevel[LEVEL_0];
      level.revealedCells['5,5'] = true;
      level.revealedCells['6,6'] = true;
      level.revealedCells['10,20'] = true;
    });

    const state = getState();
    const level = state.boardState.sceneState['scene-1'].fogOfWar.byLevel[LEVEL_0];
    assert.equal(level.enabled, true);
    assert.equal(Object.keys(level.revealedCells).length, 3);
    assert.equal(level.revealedCells['5,5'], true);
    assert.equal(level.revealedCells['6,6'], true);
    assert.equal(level.revealedCells['10,20'], true);
  });

  test('cells on different levels are independent', () => {
    initializeState({
      boardState: {
        activeSceneId: 'scene-1',
        sceneState: {
          'scene-1': {
            grid: { size: 64, locked: false, visible: true },
            fogOfWar: {
              byLevel: {
                [LEVEL_0]: { enabled: true, revealedCells: {} },
                'level-A': { enabled: true, revealedCells: {} },
              },
            },
          },
        },
      },
      user: { isGM: true, name: 'GM' },
    });

    updateState((draft) => {
      const byLevel = draft.boardState.sceneState['scene-1'].fogOfWar.byLevel;
      byLevel[LEVEL_0].revealedCells['1,1'] = true;
      byLevel['level-A'].revealedCells['2,2'] = true;
    });

    const state = getState();
    const byLevel = state.boardState.sceneState['scene-1'].fogOfWar.byLevel;
    assert.equal(Object.keys(byLevel[LEVEL_0].revealedCells).length, 1);
    assert.equal(byLevel[LEVEL_0].revealedCells['1,1'], true);
    assert.equal(byLevel['level-A'].revealedCells['1,1'], undefined,
      'level-A should not have level-0 cell');
    assert.equal(Object.keys(byLevel['level-A'].revealedCells).length, 1);
    assert.equal(byLevel['level-A'].revealedCells['2,2'], true);
  });

  test('cells survive multiple updateState calls', () => {
    initWithLevel0Fog();

    updateState((draft) => {
      const level = draft.boardState.sceneState['scene-1'].fogOfWar.byLevel[LEVEL_0];
      for (let c = 0; c < 5; c++) {
        for (let r = 0; r < 5; r++) {
          level.revealedCells[c + ',' + r] = true;
        }
      }
    });

    let state = getState();
    assert.equal(
      Object.keys(state.boardState.sceneState['scene-1'].fogOfWar.byLevel[LEVEL_0].revealedCells).length,
      25,
    );

    updateState((draft) => {
      const level = draft.boardState.sceneState['scene-1'].fogOfWar.byLevel[LEVEL_0];
      for (let c = 10; c < 15; c++) {
        for (let r = 10; r < 16; r++) {
          level.revealedCells[c + ',' + r] = true;
        }
      }
    });

    state = getState();
    assert.equal(
      Object.keys(state.boardState.sceneState['scene-1'].fogOfWar.byLevel[LEVEL_0].revealedCells).length,
      55,
    );
  });

  test('cells survive when scene entry is created during toggle then modified', () => {
    initializeState({
      boardState: {
        activeSceneId: 'scene-new',
        sceneState: {},
      },
      user: { isGM: true, name: 'GM' },
    });

    // Simulate toggleFogForLevel creating the entry
    updateState((draft) => {
      if (!draft.boardState.sceneState) draft.boardState.sceneState = {};
      if (!draft.boardState.sceneState['scene-new']) {
        draft.boardState.sceneState['scene-new'] = { grid: { size: 64, locked: false, visible: true } };
      }
      const sceneEntry = draft.boardState.sceneState['scene-new'];
      if (!sceneEntry.fogOfWar) {
        sceneEntry.fogOfWar = { byLevel: {} };
      }
      if (!sceneEntry.fogOfWar.byLevel[LEVEL_0]) {
        sceneEntry.fogOfWar.byLevel[LEVEL_0] = { enabled: false, revealedCells: {} };
      }
      sceneEntry.fogOfWar.byLevel[LEVEL_0].enabled = true;
    });

    let state = getState();
    assert.ok(state.boardState.sceneState['scene-new']);
    assert.equal(state.boardState.sceneState['scene-new'].fogOfWar.byLevel[LEVEL_0].enabled, true);

    updateState((draft) => {
      const level = draft.boardState.sceneState['scene-new'].fogOfWar.byLevel[LEVEL_0];
      if (!level.revealedCells) level.revealedCells = {};
      for (let c = 0; c < 6; c++) {
        for (let r = 0; r < 5; r++) {
          level.revealedCells[c + ',' + r] = true;
        }
      }
    });

    state = getState();
    const level = state.boardState.sceneState['scene-new'].fogOfWar.byLevel[LEVEL_0];
    assert.equal(level.enabled, true);
    assert.equal(Object.keys(level.revealedCells).length, 30);
  });

  test('cells survive when subscriber triggers nested updateState', () => {
    initWithLevel0Fog();

    let subscriberCallCount = 0;
    const unsubscribe = subscribe(() => {
      subscriberCallCount++;
      if (subscriberCallCount === 1) {
        updateState((draft) => {
          if (!draft.boardState.metadata) draft.boardState.metadata = {};
          draft.boardState.metadata.lastSync = Date.now();
        });
      }
    });

    updateState((draft) => {
      const level = draft.boardState.sceneState['scene-1'].fogOfWar.byLevel[LEVEL_0];
      level.revealedCells['5,5'] = true;
      level.revealedCells['6,6'] = true;
    });

    const state = getState();
    const level = state.boardState.sceneState['scene-1'].fogOfWar.byLevel[LEVEL_0];
    assert.equal(Object.keys(level.revealedCells).length, 2);

    unsubscribe();
  });

  test('cells survive when subscriber naively replaces boardState (snapshot/restore)', () => {
    initWithLevel0Fog();

    let subscriberCallCount = 0;
    const unsubscribe = subscribe(() => {
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
                fogOfWar: {
                  byLevel: {
                    [LEVEL_0]: { enabled: true, revealedCells: {} }, // empty!
                  },
                },
              },
            },
          };
        });
      }
    });

    updateState((draft) => {
      const level = draft.boardState.sceneState['scene-1'].fogOfWar.byLevel[LEVEL_0];
      level.revealedCells['5,5'] = true;
      level.revealedCells['6,6'] = true;
    });

    const state = getState();
    const level = state.boardState?.sceneState?.['scene-1']?.fogOfWar?.byLevel?.[LEVEL_0];
    assert.ok(level, 'level-0 fog should exist');
    assert.equal(level.enabled, true);
    // The snapshot/restore in normalize/fog.js should restore the cells.
    assert.equal(Object.keys(level.revealedCells).length, 2,
      'cells should survive naive boardState replacement via snapshot/restore');

    unsubscribe();
  });
});
