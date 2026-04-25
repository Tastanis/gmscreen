import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeMapLevelsState } from '../normalize/map-levels.js';
import { normalizeSceneBoardState } from '../normalize/scene-board-state.js';

describe('map level normalization', () => {
  test('normalizes scene-specific map levels with cutouts and inherited grid fields', () => {
    const sceneGrid = { size: 80, locked: true, visible: true, offsetX: 12, offsetY: 16 };

    const normalized = normalizeMapLevelsState(
      {
        activeLevelId: 'upper',
        levels: [
          {
            id: 'base',
            name: '  ',
            mapUrl: ' /maps/base.png ',
            visible: 'yes',
            opacity: '1.4',
            zIndex: '2.9',
            grid: { visible: false },
            cutouts: [
              { id: 'hole', column: '2.9', row: '-1', width: '0', height: '3' },
              { column: 'bad', row: 0 },
            ],
            blocksLowerLevelInteraction: 'false',
            blocksLowerLevelVision: '0',
          },
          {
            id: 'upper',
            name: 'Upper',
            visible: '0',
            opacity: '-0.2',
            defaultForPlayers: true,
          },
          { id: 'third' },
          { id: 'fourth' },
          { id: 'fifth' },
          { id: 'sixth' },
        ],
      },
      { sceneGrid }
    );

    assert.equal(normalized.levels.length, 5, 'map levels are capped at five entries');
    assert.equal(normalized.activeLevelId, 'upper');

    assert.deepEqual(normalized.levels[0], {
      id: 'base',
      name: 'Level 1',
      mapUrl: '/maps/base.png',
      visible: true,
      opacity: 1,
      zIndex: 2,
      grid: { size: 80, locked: true, visible: false, offsetX: 12, offsetY: 16 },
      cutouts: [{ column: 2, row: 0, width: 1, height: 3, id: 'hole' }],
      blocksLowerLevelInteraction: false,
      blocksLowerLevelVision: false,
      defaultForPlayers: false,
    });

    assert.equal(normalized.levels[1].defaultForPlayers, true);
    assert.equal(normalized.levels[1].visible, false);
    assert.equal(normalized.levels[1].opacity, 0);
  });

  test('adds mapLevels to each normalized scene board state entry', () => {
    const normalized = normalizeSceneBoardState({
      ' scene-1 ': {
        grid: { size: 72, offsetX: 9 },
        mapLevels: {
          levels: [{ id: 'ground', mapUrl: '/maps/ground.png' }],
        },
      },
    });

    assert.deepEqual(normalized['scene-1'].mapLevels, {
      levels: [
        {
          id: 'ground',
          name: 'Level 1',
          mapUrl: '/maps/ground.png',
          visible: true,
          opacity: 1,
          zIndex: 0,
          grid: null,
          cutouts: [],
          blocksLowerLevelInteraction: true,
          blocksLowerLevelVision: true,
          defaultForPlayers: true,
        },
      ],
      activeLevelId: 'ground',
    });
  });
});
