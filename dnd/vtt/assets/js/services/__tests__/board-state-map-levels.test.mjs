import { test } from 'node:test';
import assert from 'node:assert/strict';

import { persistBoardState } from '../board-state-service.js';

test('persistBoardState serializes mapLevels under per-scene board state only', async (t) => {
  const originalFetch = globalThis.fetch;
  const capturedPayloads = [];

  globalThis.fetch = async (_url, options = {}) => {
    capturedPayloads.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ success: true, data: { _version: 7 } }) };
  };

  t.after(() => {
    if (originalFetch === undefined) {
      delete globalThis.fetch;
    } else {
      globalThis.fetch = originalFetch;
    }
  });

  await persistBoardState('/api/state', {
    activeSceneId: ' scene-1 ',
    mapLevels: { levels: [{ id: 'top-level-should-not-persist' }] },
    sceneState: {
      ' scene-1 ': {
        grid: { size: 70, offsetX: 75, offsetY: -5 },
        mapLevels: {
          activeLevelId: 'level-a',
          levels: [
            {
              id: 'level-a',
              name: ' Ground ',
              mapUrl: ' /maps/ground.png ',
              opacity: '0.333',
              cutouts: [{ x: '1', y: '2', w: '2', h: '3' }],
            },
          ],
        },
      },
    },
  });

  assert.equal(capturedPayloads.length, 1);
  const boardState = capturedPayloads[0].boardState;

  assert.equal(boardState.mapLevels, undefined, 'mapLevels must not be a top-level board field');
  assert.deepEqual(boardState.sceneState['scene-1'].mapLevels, {
    levels: [
      {
        id: 'level-a',
        name: 'Ground',
        mapUrl: '/maps/ground.png',
        visible: true,
        opacity: 0.33,
        zIndex: 0,
        grid: null,
        cutouts: [{ column: 1, row: 2, width: 2, height: 3 }],
        blocksLowerLevelInteraction: true,
        blocksLowerLevelVision: true,
        defaultForPlayers: true,
      },
    ],
    activeLevelId: 'level-a',
  });
});
