import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  applySceneGridState,
  normalizeGridOffset,
  normalizeGridState,
} from '../normalize/grid.js';

describe('grid normalization', () => {
  test('keeps calibrated grid size and canonical origin offsets', () => {
    assert.deepEqual(
      normalizeGridState({
        size: '70.5',
        locked: true,
        visible: false,
        offsetX: 75,
        offsetY: -5,
      }),
      {
        size: 70.5,
        locked: true,
        visible: false,
        offsetX: 4.5,
        offsetY: 65.5,
      }
    );
  });

  test('normalizes equivalent offsets into the current grid square', () => {
    assert.equal(normalizeGridOffset(128, 64), 0);
    assert.equal(normalizeGridOffset(130.25, 64), 2.25);
    assert.equal(normalizeGridOffset(-1.5, 64), 62.5);
  });

  test('applies the active scene grid origin as the authoritative grid state', () => {
    const state = {
      scenes: {
        items: [
          {
            id: 'scene-1',
            grid: { size: 80, locked: false, visible: true, offsetX: 12, offsetY: 18 },
          },
        ],
      },
      boardState: {
        activeSceneId: 'scene-1',
        sceneState: {
          'scene-1': { grid: { size: 64, offsetX: 0, offsetY: 0 } },
        },
      },
      grid: { size: 64, locked: false, visible: true, offsetX: 0, offsetY: 0 },
    };

    applySceneGridState(state);

    assert.deepEqual(state.grid, {
      size: 80,
      locked: false,
      visible: true,
      offsetX: 12,
      offsetY: 18,
    });
    assert.deepEqual(state.boardState.sceneState['scene-1'].grid, state.grid);
  });
});
