import { afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { __testing as sceneManager } from '../scene-manager.js';
import { BASE_MAP_LEVEL_ID, MAP_LEVEL_MAX_LEVELS } from '../../state/normalize/map-levels.js';

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
  test('renders map level controls', () => {
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
    // Old overlay controls (add-overlay-layer, clear-overlay) are removed.
    assert.doesNotMatch(markup, /data-action="add-overlay-layer"/);
    assert.doesNotMatch(markup, /data-action="clear-overlay"/);
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

  test('normalizes opacity, upload URLs, ordering, hide flag, and active selection', () => {
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
      upper.hidden = true;
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
    assert.equal(getLevel(store, 'upper').hidden, true);
    assert.equal(getLevel(store, 'upper').zIndex, 0);
    assert.equal(getLevel(store, 'ground').opacity, 0.35);
    assert.equal(store.getState().boardState.sceneState['scene-1'].mapLevels.activeLevelId, 'upper');
  });

  test('Levels v3: createMapLevel defaults new levels to displayMode "auto" with hidden false', () => {
    const level = sceneManager.createMapLevel('Roof', []);
    assert.equal(level.displayMode, 'auto');
    assert.equal(level.hidden, false);
    assert.equal(Object.prototype.hasOwnProperty.call(level, 'visible'), false);
  });

  test('Levels v3: scene markup renders the mode toggle button and the hide button', () => {
    const state = createInitialState({
      mapLevels: {
        activeLevelId: 'upper',
        levels: [
          { id: 'ground', name: 'Ground', mapUrl: '/maps/ground.png', zIndex: 0 },
          {
            id: 'upper',
            name: 'Upper',
            mapUrl: '/maps/upper.png',
            zIndex: 1,
            displayMode: 'always',
            hidden: false,
          },
        ],
      },
    });

    const markup = sceneManager.buildSceneMarkup(
      state.scenes,
      'scene-1',
      state.boardState.sceneState,
      { mapLevelUploadsEnabled: true, mapLevelUploadPending: false, assetUploadPending: false }
    );

    assert.match(markup, /data-action="cycle-map-level-display-mode"/);
    assert.match(markup, /data-action="toggle-map-level-hide"/);
    assert.match(markup, /data-map-level-display-mode="always"/);
    // Hide is a button now, not a checkbox.
    assert.doesNotMatch(markup, /type="checkbox"[^>]*data-action="toggle-map-level-hide"/);
    assert.doesNotMatch(markup, /scene-level__hide-checkbox/);
    // Old single visibility checkbox is gone.
    assert.doesNotMatch(markup, /data-action="toggle-map-level-visibility"/);
  });
});

describe('Levels v2 — deleteSceneMapLevelCascade (Step 9)', () => {
  test('returns null when sceneId, levelId, or BASE level id is supplied', () => {
    const store = createStore(
      createInitialState({
        mapLevels: {
          activeLevelId: 'upper',
          levels: [
            { id: 'ground', name: 'Ground', mapUrl: '/maps/ground.png', zIndex: 0 },
            { id: 'upper', name: 'Upper', mapUrl: '/maps/upper.png', zIndex: 1 },
          ],
        },
      })
    );

    assert.equal(sceneManager.deleteSceneMapLevelCascade(store, '', 'upper'), null);
    assert.equal(sceneManager.deleteSceneMapLevelCascade(store, 'scene-1', ''), null);
    assert.equal(sceneManager.deleteSceneMapLevelCascade(store, 'scene-1', BASE_MAP_LEVEL_ID), null);
    assert.equal(sceneManager.deleteSceneMapLevelCascade(store, 'scene-1', 'unknown-id'), null);

    // No mutation occurred.
    const levels = store.getState().boardState.sceneState['scene-1'].mapLevels.levels;
    assert.deepEqual(levels.map((entry) => entry.id), ['ground', 'upper']);
  });

  test('remaps placements on the deleted level to the next lower stored level', () => {
    const store = createStore(
      createInitialState({
        mapLevels: {
          activeLevelId: 'upper',
          levels: [
            { id: 'ground', name: 'Ground', mapUrl: '/maps/ground.png', zIndex: 0 },
            { id: 'upper', name: 'Upper', mapUrl: '/maps/upper.png', zIndex: 1 },
            { id: 'attic', name: 'Attic', mapUrl: '/maps/attic.png', zIndex: 2 },
          ],
        },
        placements: [
          { id: 'p-attic', levelId: 'attic', column: 1, row: 1 },
          { id: 'p-upper', levelId: 'upper', column: 2, row: 2 },
          { id: 'p-ground', levelId: 'ground', column: 3, row: 3 },
          { id: 'p-base-legacy', column: 4, row: 4 }, // missing levelId → already on Level 0
        ],
      })
    );

    const result = sceneManager.deleteSceneMapLevelCascade(store, 'scene-1', 'upper');
    assert.ok(result, 'deletion summary returned');
    assert.equal(result.fallbackLevelId, 'ground');
    assert.deepEqual(result.remappedPlacementIds.sort(), ['p-upper']);

    const placements = store.getState().boardState.placements['scene-1'];
    const byId = (id) => placements.find((entry) => entry.id === id);
    assert.equal(byId('p-upper').levelId, 'ground');
    assert.equal(byId('p-attic').levelId, 'attic');
    assert.equal(byId('p-ground').levelId, 'ground');
    assert.equal(byId('p-base-legacy').levelId, undefined);
    assert.ok(typeof byId('p-upper')._lastModified === 'number');
  });

  test('falls back to BASE_MAP_LEVEL_ID when no lower stored level exists', () => {
    const store = createStore(
      createInitialState({
        mapLevels: {
          activeLevelId: 'ground',
          levels: [
            { id: 'ground', name: 'Ground', mapUrl: '/maps/ground.png', zIndex: 0 },
            { id: 'upper', name: 'Upper', mapUrl: '/maps/upper.png', zIndex: 1 },
          ],
        },
        placements: [
          { id: 'p-ground', levelId: 'ground', column: 1, row: 1 },
        ],
      })
    );

    const result = sceneManager.deleteSceneMapLevelCascade(store, 'scene-1', 'ground');
    assert.ok(result);
    assert.equal(result.fallbackLevelId, BASE_MAP_LEVEL_ID);

    const placements = store.getState().boardState.placements['scene-1'];
    assert.equal(placements.find((entry) => entry.id === 'p-ground').levelId, BASE_MAP_LEVEL_ID);
  });

  test('keeps surviving stored level ids stable; only zIndex is recomputed', () => {
    const store = createStore(
      createInitialState({
        mapLevels: {
          activeLevelId: 'upper',
          levels: [
            { id: 'ground', name: 'Ground', mapUrl: '/maps/ground.png', zIndex: 0 },
            { id: 'upper', name: 'Upper', mapUrl: '/maps/upper.png', zIndex: 1 },
            { id: 'attic', name: 'Attic', mapUrl: '/maps/attic.png', zIndex: 2 },
          ],
        },
      })
    );

    sceneManager.deleteSceneMapLevelCascade(store, 'scene-1', 'upper');

    const levels = store.getState().boardState.sceneState['scene-1'].mapLevels.levels;
    assert.deepEqual(levels.map((entry) => entry.id), ['ground', 'attic']);
    assert.equal(levels.find((entry) => entry.id === 'ground').zIndex, 0);
    assert.equal(levels.find((entry) => entry.id === 'attic').zIndex, 1);
  });

  test('clears legacy mapLevels.activeLevelId when it pointed at the deleted level', () => {
    const store = createStore(
      createInitialState({
        mapLevels: {
          activeLevelId: 'upper',
          levels: [
            { id: 'ground', name: 'Ground', mapUrl: '/maps/ground.png', zIndex: 0 },
            { id: 'upper', name: 'Upper', mapUrl: '/maps/upper.png', zIndex: 1 },
          ],
        },
      })
    );

    sceneManager.deleteSceneMapLevelCascade(store, 'scene-1', 'upper');

    const mapLevels = store.getState().boardState.sceneState['scene-1'].mapLevels;
    // The legacy field should not still reference the deleted id.
    assert.notEqual(mapLevels.activeLevelId, 'upper');
  });

  test('remaps userLevelState entries pointing at the deleted level (preserving source/tokenId)', () => {
    const store = createStore(
      createInitialState({
        mapLevels: {
          activeLevelId: 'upper',
          levels: [
            { id: 'ground', name: 'Ground', mapUrl: '/maps/ground.png', zIndex: 0 },
            { id: 'upper', name: 'Upper', mapUrl: '/maps/upper.png', zIndex: 1 },
          ],
        },
        userLevelState: {
          gm: { levelId: 'upper', source: 'manual', updatedAt: 100 },
          frunk: { levelId: 'upper', source: 'activate', updatedAt: 200 },
          sharon: { levelId: 'ground', source: 'manual', updatedAt: 300 },
        },
      })
    );

    const result = sceneManager.deleteSceneMapLevelCascade(store, 'scene-1', 'upper');
    assert.deepEqual(result.remappedUserIds.sort(), ['frunk', 'gm']);

    const userLevelState = store.getState().boardState.sceneState['scene-1'].userLevelState;
    assert.equal(userLevelState.gm.levelId, 'ground');
    assert.equal(userLevelState.gm.source, 'manual');
    assert.equal(userLevelState.frunk.levelId, 'ground');
    assert.equal(userLevelState.frunk.source, 'activate');
    assert.equal(userLevelState.sharon.levelId, 'ground'); // unchanged
    assert.equal(userLevelState.sharon.updatedAt, 300);
    assert.ok(userLevelState.gm.updatedAt >= 100);
  });

  test('claim-driven invariant: remapped claimed token overwrites claimant userLevelState to source: claim', () => {
    const store = createStore(
      createInitialState({
        mapLevels: {
          activeLevelId: 'upper',
          levels: [
            { id: 'ground', name: 'Ground', mapUrl: '/maps/ground.png', zIndex: 0 },
            { id: 'upper', name: 'Upper', mapUrl: '/maps/upper.png', zIndex: 1 },
          ],
        },
        placements: [
          { id: 'p-frunk', levelId: 'upper', column: 2, row: 2 },
        ],
        claimedTokens: {
          'p-frunk': 'frunk',
        },
        // Frunk's state happens to point at a non-deleted level. The claim-driven
        // invariant should still pull frunk to the fallback when the token moves.
        userLevelState: {
          frunk: { levelId: 'ground', source: 'manual', updatedAt: 100 },
        },
      })
    );

    const result = sceneManager.deleteSceneMapLevelCascade(store, 'scene-1', 'upper');
    assert.deepEqual(result.remappedClaimUserIds, ['frunk']);

    const userLevelState = store.getState().boardState.sceneState['scene-1'].userLevelState;
    assert.equal(userLevelState.frunk.levelId, 'ground');
    assert.equal(userLevelState.frunk.source, 'claim');
    assert.equal(userLevelState.frunk.tokenId, 'p-frunk');
    assert.ok(userLevelState.frunk.updatedAt > 100);
  });

  test('claim source overrides pass-A remap when the same user has both signals', () => {
    const store = createStore(
      createInitialState({
        mapLevels: {
          activeLevelId: 'upper',
          levels: [
            { id: 'ground', name: 'Ground', mapUrl: '/maps/ground.png', zIndex: 0 },
            { id: 'upper', name: 'Upper', mapUrl: '/maps/upper.png', zIndex: 1 },
          ],
        },
        placements: [
          { id: 'p-indigo', levelId: 'upper', column: 2, row: 2 },
        ],
        claimedTokens: {
          'p-indigo': 'indigo',
        },
        userLevelState: {
          // Indigo's state pointed at the deleted level AND the claim is on it.
          indigo: { levelId: 'upper', source: 'claim', tokenId: 'p-indigo', updatedAt: 100 },
        },
      })
    );

    sceneManager.deleteSceneMapLevelCascade(store, 'scene-1', 'upper');

    const userLevelState = store.getState().boardState.sceneState['scene-1'].userLevelState;
    assert.equal(userLevelState.indigo.levelId, 'ground');
    assert.equal(userLevelState.indigo.source, 'claim');
    assert.equal(userLevelState.indigo.tokenId, 'p-indigo');
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

function createInitialState({
  mapLevels = { levels: [], activeLevelId: null },
  placements = [],
  userLevelState = {},
  claimedTokens = {},
} = {}) {
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
      placements: { 'scene-1': placements },
      sceneState: {
        'scene-1': {
          grid: { size: 64, visible: true, locked: false, offsetX: 0, offsetY: 0 },
          overlay: { mapUrl: null, mask: { visible: true, polygons: [] }, layers: [], activeLayerId: null },
          mapLevels,
          userLevelState,
          claimedTokens,
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
