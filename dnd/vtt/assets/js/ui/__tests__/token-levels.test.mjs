import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  getAdjacentTokenLevel,
  getOrderedTokenMapLevels,
  getTokenLevelControlState,
  resolveSceneTokenLevelState,
  resolveTokenLevelId,
} from '../token-levels.js';

describe('token level helpers', () => {
  test('orders map levels by z-index for up and down movement', () => {
    const levels = getOrderedTokenMapLevels([
      { id: 'roof', name: 'Roof', zIndex: 2 },
      { id: 'ground', name: 'Ground', zIndex: 0 },
      { id: 'upper', name: 'Upper', zIndex: 1 },
    ]);

    assert.deepEqual(levels.map((level) => level.id), ['ground', 'upper', 'roof']);
  });

  test('resolves explicit placement level before active fallback', () => {
    const mapLevels = {
      activeLevelId: 'upper',
      levels: [
        { id: 'ground', name: 'Ground', zIndex: 0 },
        { id: 'upper', name: 'Upper', zIndex: 1 },
      ],
    };

    assert.equal(resolveTokenLevelId({ levelId: ' ground ' }, mapLevels), 'ground');
    assert.equal(resolveTokenLevelId({ levelId: '', mapLevelId: 'ground' }, mapLevels), 'ground');
    assert.equal(resolveTokenLevelId({}, mapLevels), 'upper');
  });

  test('returns adjacent levels around the resolved current level', () => {
    const mapLevels = {
      activeLevelId: 'upper',
      levels: [
        { id: 'ground', name: 'Ground', zIndex: 0 },
        { id: 'upper', name: 'Upper', zIndex: 1 },
        { id: 'roof', name: 'Roof', zIndex: 2 },
      ],
    };

    assert.equal(getAdjacentTokenLevel(mapLevels, 'upper', 'down')?.id, 'ground');
    assert.equal(getAdjacentTokenLevel(mapLevels, 'upper', 'up')?.id, 'roof');
    assert.equal(getAdjacentTokenLevel(mapLevels, 'roof', 'up'), null);
  });

  test('builds GM menu control state for a placement', () => {
    const mapLevels = {
      activeLevelId: 'ground',
      levels: [
        { id: 'ground', name: 'Ground', zIndex: 0 },
        { id: 'upper', name: 'Upper', zIndex: 1 },
      ],
    };

    const controls = getTokenLevelControlState(mapLevels, { id: 'token-1', levelId: 'ground' });

    assert.equal(controls.hasLevels, true);
    assert.equal(controls.currentLevel?.id, 'ground');
    assert.equal(controls.canMoveDown, false);
    assert.equal(controls.canMoveUp, true);
  });

  test('resolves scene-scoped map level state from board state', () => {
    const mapLevels = resolveSceneTokenLevelState({
      boardState: {
        sceneState: {
          'scene-1': {
            grid: { size: 70, offsetX: 2, offsetY: 4 },
            mapLevels: {
              activeLevelId: 'upper',
              levels: [{ id: 'upper', name: 'Upper', zIndex: 1 }],
            },
          },
        },
      },
    }, 'scene-1');

    assert.equal(mapLevels.activeLevelId, 'upper');
    assert.equal(mapLevels.levels[0].id, 'upper');
  });
});
