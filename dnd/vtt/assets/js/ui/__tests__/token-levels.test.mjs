import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  getAdjacentTokenLevel,
  getMapLevelNavigationControlState,
  getOrderedTokenMapLevels,
  getPlayerTokenMapLevelVisibility,
  getTokenLevelControlState,
  isPlacementInteractableOnPlayerMapLevel,
  isPlacementOnPlayerVisibleMapLevel,
  resolvePlayerActiveMapLevelId,
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

  test('builds active map level navigation control state', () => {
    const mapLevels = {
      activeLevelId: 'upper',
      levels: [
        { id: 'roof', name: 'Roof', zIndex: 2 },
        { id: 'ground', name: 'Ground', zIndex: 0 },
        { id: 'upper', name: 'Upper', zIndex: 1 },
      ],
    };

    const controls = getMapLevelNavigationControlState(mapLevels);

    assert.equal(controls.hasLevels, true);
    assert.equal(controls.currentLevel?.id, 'upper');
    assert.equal(controls.canMoveDown, true);
    assert.equal(controls.canMoveUp, true);
    assert.deepEqual(controls.levels.map((level) => level.id), ['ground', 'upper', 'roof']);
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

  test('resolves the player active level only when it is visible', () => {
    const mapLevels = {
      activeLevelId: 'upper',
      levels: [
        { id: 'ground', name: 'Ground', visible: true, defaultForPlayers: true, zIndex: 0 },
        { id: 'upper', name: 'Upper', visible: false, zIndex: 1 },
      ],
    };

    assert.equal(resolvePlayerActiveMapLevelId(mapLevels), null);
    assert.equal(resolvePlayerActiveMapLevelId({ ...mapLevels, activeLevelId: null }), 'ground');
  });

  test('filters player-visible placements to the active visible map level', () => {
    const mapLevels = {
      activeLevelId: 'upper',
      levels: [
        { id: 'ground', name: 'Ground', visible: true, mapUrl: '/ground.png', zIndex: 0 },
        { id: 'upper', name: 'Upper', visible: true, mapUrl: '/upper.png', zIndex: 1 },
      ],
    };

    assert.equal(isPlacementOnPlayerVisibleMapLevel({ id: 'a', levelId: 'upper' }, mapLevels), true);
    assert.equal(isPlacementOnPlayerVisibleMapLevel({ id: 'b', levelId: 'ground' }, mapLevels), false);
    assert.equal(isPlacementOnPlayerVisibleMapLevel({ id: 'legacy' }, mapLevels), true);
    assert.equal(isPlacementOnPlayerVisibleMapLevel({ id: 'no-levels' }, { levels: [] }), true);
  });

  test('reveals lower-level placements only through blocking level cutouts', () => {
    const mapLevels = {
      activeLevelId: 'upper',
      levels: [
        { id: 'ground', name: 'Ground', visible: true, mapUrl: '/ground.png', zIndex: 0 },
        {
          id: 'upper',
          name: 'Upper',
          visible: true,
          mapUrl: '/upper.png',
          zIndex: 1,
          cutouts: [{ column: 2, row: 3, width: 1, height: 1 }],
        },
      ],
    };

    assert.equal(isPlacementOnPlayerVisibleMapLevel({ id: 'open', levelId: 'ground', column: 2, row: 3 }, mapLevels), true);
    assert.equal(isPlacementOnPlayerVisibleMapLevel({ id: 'covered', levelId: 'ground', column: 1, row: 3 }, mapLevels), false);
    assert.equal(isPlacementOnPlayerVisibleMapLevel({ id: 'upper', levelId: 'upper', column: 1, row: 3 }, mapLevels), true);
  });

  test('requires cutouts through every blocking level above a lower placement', () => {
    const mapLevels = {
      activeLevelId: 'roof',
      levels: [
        { id: 'ground', visible: true, mapUrl: '/ground.png', zIndex: 0 },
        {
          id: 'middle',
          visible: true,
          mapUrl: '/middle.png',
          zIndex: 1,
          cutouts: [{ column: 4, row: 4, width: 1, height: 1 }],
        },
        {
          id: 'roof',
          visible: true,
          mapUrl: '/roof.png',
          zIndex: 2,
          cutouts: [{ column: 5, row: 4, width: 1, height: 1 }],
        },
      ],
    };

    assert.equal(isPlacementOnPlayerVisibleMapLevel({ id: 'blocked-by-roof', levelId: 'ground', column: 4, row: 4 }, mapLevels), false);
    assert.equal(isPlacementOnPlayerVisibleMapLevel({ id: 'blocked-by-middle', levelId: 'ground', column: 5, row: 4 }, mapLevels), false);

    mapLevels.levels[1].cutouts.push({ column: 5, row: 4, width: 1, height: 1 });
    assert.equal(isPlacementOnPlayerVisibleMapLevel({ id: 'open-through-both', levelId: 'ground', column: 5, row: 4 }, mapLevels), true);
  });

  test('tracks partially visible cells for lower multi-cell placements', () => {
    const mapLevels = {
      activeLevelId: 'upper',
      levels: [
        { id: 'ground', visible: true, mapUrl: '/ground.png', zIndex: 0 },
        {
          id: 'upper',
          visible: true,
          mapUrl: '/upper.png',
          zIndex: 1,
          cutouts: [{ column: 3, row: 2, width: 1, height: 2 }],
        },
      ],
    };

    const visibility = getPlayerTokenMapLevelVisibility(
      { id: 'large', levelId: 'ground', column: 2, row: 2, width: 2, height: 2 },
      mapLevels
    );

    assert.equal(visibility.visible, true);
    assert.equal(visibility.fullyVisible, false);
    assert.deepEqual(visibility.visibleCells, [
      { column: 3, row: 2 },
      { column: 3, row: 3 },
    ]);
  });

  test('uses interaction blockers separately from vision blockers', () => {
    const mapLevels = {
      activeLevelId: 'upper',
      levels: [
        { id: 'ground', visible: true, mapUrl: '/ground.png', zIndex: 0 },
        {
          id: 'upper',
          visible: true,
          mapUrl: '/upper.png',
          zIndex: 1,
          blocksLowerLevelVision: false,
          blocksLowerLevelInteraction: true,
          cutouts: [{ column: 8, row: 8, width: 1, height: 1 }],
        },
      ],
    };

    const placement = { id: 'ground-token', levelId: 'ground', column: 7, row: 8 };
    assert.equal(isPlacementOnPlayerVisibleMapLevel(placement, mapLevels), true);
    assert.equal(isPlacementInteractableOnPlayerMapLevel(placement, mapLevels, { point: { column: 7, row: 8 } }), false);
    assert.equal(isPlacementInteractableOnPlayerMapLevel({ ...placement, column: 8 }, mapLevels, { point: { column: 8, row: 8 } }), true);
  });
});
