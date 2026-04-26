import { afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { __testing as sceneManager } from '../scene-manager.js';
import { MAP_LEVEL_MAX_LEVELS } from '../../state/normalize/map-levels.js';

let originalLocalStorage;

beforeEach(() => {
  originalLocalStorage = global.localStorage;
  global.localStorage = {
    getItem() {
      return null;
    },
    setItem() {},
  };
});

afterEach(() => {
  global.localStorage = originalLocalStorage;
});

describe('scene manager map level controls', () => {
  test('renders map level controls without removing old overlay controls', () => {
    const state = createInitialState({
      mapLevels: {
        activeLevelId: 'upper',
        levels: [
          { id: 'ground', name: 'Ground', mapUrl: '/maps/ground.png', opacity: 1, zIndex: 0 },
          {
            id: 'upper',
            name: 'Upper',
            mapUrl: '/maps/upper.png',
            opacity: 0.65,
            zIndex: 1,
            cutouts: [{ column: 1, row: 1, width: 1, height: 2 }],
          },
        ],
      },
    });

    const markup = sceneManager.buildSceneMarkup(
      state.scenes,
      'scene-1',
      state.boardState.sceneState,
      {
        overlayUploadsEnabled: true,
        overlayUploadPending: false,
        mapLevelUploadsEnabled: true,
        mapLevelUploadPending: false,
        assetUploadPending: false,
      }
    );

    assert.match(markup, /scene-item__levels/);
    assert.match(markup, /data-action="add-map-level"/);
    assert.match(markup, /data-action="upload-map-level"/);
    assert.match(markup, /data-action="set-map-level-opacity"/);
    assert.match(markup, /data-action="edit-map-level-cutouts"/);
    assert.match(markup, /Cutouts\(1\)|Cutouts \(1\)/);
    assert.match(markup, /value="65"/);
    assert.match(markup, /data-action="add-overlay-layer"/);
    assert.match(markup, /data-action="clear-overlay"/);
  });

  test('adds scene-scoped map levels up to the configured cap', () => {
    const store = createStore(createInitialState());

    for (let index = 0; index < MAP_LEVEL_MAX_LEVELS; index += 1) {
      const changed = sceneManager.mutateSceneMapLevels(store, 'scene-1', (mapLevels) => {
        if (mapLevels.levels.length >= MAP_LEVEL_MAX_LEVELS) {
          return false;
        }

        const orderedLevels = sceneManager.reindexMapLevels(
          sceneManager.getOrderedMapLevels(mapLevels.levels)
        );
        const level = sceneManager.createMapLevel(`Level ${orderedLevels.length + 1}`, orderedLevels);
        orderedLevels.push(level);
        mapLevels.levels = sceneManager.reindexMapLevels(orderedLevels);
        mapLevels.activeLevelId = level.id;
        return true;
      });

      assert.equal(changed, true);
    }

    const mapLevels = store.getState().boardState.sceneState['scene-1'].mapLevels;
    assert.equal(mapLevels.levels.length, MAP_LEVEL_MAX_LEVELS);
    assert.equal(mapLevels.levels[0].name, 'Level 1');
    assert.equal(mapLevels.levels[4].name, 'Level 5');
    assert.equal(mapLevels.activeLevelId, mapLevels.levels[4].id);

    const changed = sceneManager.mutateSceneMapLevels(store, 'scene-1', (draftLevels) => {
      if (draftLevels.levels.length >= MAP_LEVEL_MAX_LEVELS) {
        return false;
      }
      draftLevels.levels.push(sceneManager.createMapLevel('Level 6', draftLevels.levels));
      return true;
    });

    assert.equal(changed, false);
    assert.equal(store.getState().boardState.sceneState['scene-1'].mapLevels.levels.length, 5);
  });

  test('normalizes opacity, upload URLs, ordering, visibility, and active selection', () => {
    const store = createStore(
      createInitialState({
        mapLevels: {
          activeLevelId: 'ground',
          levels: [
            { id: 'ground', name: 'Ground', mapUrl: '/maps/ground.png', zIndex: 0 },
            { id: 'upper', name: 'Upper', mapUrl: null, zIndex: 1 },
          ],
        },
      })
    );

    const changed = sceneManager.mutateSceneMapLevels(store, 'scene-1', (mapLevels) => {
      const upper = mapLevels.levels.find((level) => level.id === 'upper');
      const ground = mapLevels.levels.find((level) => level.id === 'ground');
      upper.name = 'Upper Gallery';
      upper.mapUrl = '/uploads/upper.png';
      upper.visible = false;
      ground.opacity = sceneManager.normalizeMapLevelOpacityInput('35');

      const orderedLevels = sceneManager.getOrderedMapLevels(mapLevels.levels);
      [orderedLevels[0], orderedLevels[1]] = [orderedLevels[1], orderedLevels[0]];
      mapLevels.levels = sceneManager.reindexMapLevels(orderedLevels);
      mapLevels.activeLevelId = 'upper';
      return true;
    });

    assert.equal(changed, true);
    assert.deepEqual(
      store.getState().boardState.sceneState['scene-1'].mapLevels.levels.map((level) => level.id),
      ['upper', 'ground']
    );
    assert.equal(getLevel(store, 'upper').name, 'Upper Gallery');
    assert.equal(getLevel(store, 'upper').mapUrl, '/uploads/upper.png');
    assert.equal(getLevel(store, 'upper').visible, false);
    assert.equal(getLevel(store, 'upper').zIndex, 0);
    assert.equal(getLevel(store, 'ground').opacity, 0.35);
    assert.equal(store.getState().boardState.sceneState['scene-1'].mapLevels.activeLevelId, 'upper');
  });
});

function createStore(initialState) {
  let state = structuredClone(initialState);
  return {
    getState() {
      return state;
    },
    updateState(updater) {
      updater(state);
    },
  };
}

function createInitialState({ mapLevels = { levels: [], activeLevelId: null } } = {}) {
  return {
    grid: { size: 64, visible: true, locked: false, offsetX: 0, offsetY: 0 },
    scenes: {
      folders: [],
      items: [
        {
          id: 'scene-1',
          name: 'Test Scene',
          mapUrl: '/maps/base.png',
          grid: { size: 64, visible: true, locked: false, offsetX: 0, offsetY: 0 },
        },
      ],
    },
    boardState: {
      activeSceneId: 'scene-1',
      mapUrl: '/maps/base.png',
      thumbnailUrl: null,
      placements: {},
      sceneState: {
        'scene-1': {
          grid: { size: 64, visible: true, locked: false, offsetX: 0, offsetY: 0 },
          overlay: { mapUrl: null, mask: { visible: true, polygons: [] }, layers: [], activeLayerId: null },
          mapLevels,
        },
      },
      overlay: { mapUrl: null, mask: { visible: true, polygons: [] }, layers: [], activeLayerId: null },
    },
  };
}

function getLevel(store, levelId) {
  const levels = store.getState().boardState.sceneState['scene-1'].mapLevels.levels;
  const level = levels.find((entry) => entry.id === levelId);
  assert.ok(level, `Expected map level ${levelId}`);
  return level;
}
