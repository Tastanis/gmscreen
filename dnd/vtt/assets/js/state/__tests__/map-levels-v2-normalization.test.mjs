import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  BASE_MAP_LEVEL_ID,
  buildLevelViewModel,
  levelIdExistsInViewModel,
  normalizeClaimedTokensMap,
  normalizeUserLevelStateEntry,
  normalizeUserLevelStateMap,
  resolveActiveLevelIdForUser,
  resolvePlacementLevelId,
} from '../normalize/map-levels.js';
import { normalizeSceneBoardState } from '../normalize/scene-board-state.js';

// Levels v2 (Step 1): exercises the new constant, view-model helper, and
// per-scene normalization for claim and user-level state. The plan in
// `dnd/vtt/LEVELS_V2_PLAN.md` keeps Level 0 virtual (derived from the
// scene's base map URL) and stores Level 1+ in the existing levels array.

describe('Levels v2 — base level constant and placement resolution', () => {
  test('BASE_MAP_LEVEL_ID is the canonical level-0 id', () => {
    assert.equal(BASE_MAP_LEVEL_ID, 'level-0');
  });

  test('resolvePlacementLevelId returns Level 0 when missing/null/blank', () => {
    assert.equal(resolvePlacementLevelId({}), 'level-0');
    assert.equal(resolvePlacementLevelId({ levelId: null }), 'level-0');
    assert.equal(resolvePlacementLevelId({ levelId: '' }), 'level-0');
    assert.equal(resolvePlacementLevelId({ levelId: '   ' }), 'level-0');
  });

  test('resolvePlacementLevelId trims and returns a stored level id', () => {
    assert.equal(resolvePlacementLevelId({ levelId: '  map-level-a  ' }), 'map-level-a');
  });
});

describe('Levels v2 — buildLevelViewModel', () => {
  test('places a virtual Level 0 entry first with the scene base map url', () => {
    const view = buildLevelViewModel({
      baseMapUrl: '/maps/base.png',
      mapLevels: { levels: [{ id: 'a', name: 'Upper', zIndex: 1 }] },
      sceneGrid: { size: 80 },
    });
    assert.equal(view.length, 2);
    assert.equal(view[0].id, 'level-0');
    assert.equal(view[0].mapUrl, '/maps/base.png');
    assert.equal(view[0].isBaseLevel, true);
    assert.equal(view[0].grid.size, 80);
    assert.equal(view[1].id, 'a');
    assert.equal(view[1].isBaseLevel, false);
  });

  test('sorts stored levels by zIndex ascending', () => {
    const view = buildLevelViewModel({
      baseMapUrl: '/m.png',
      mapLevels: {
        levels: [
          { id: 'top', zIndex: 5 },
          { id: 'mid', zIndex: 2 },
          { id: 'low', zIndex: 0 },
        ],
      },
    });
    assert.deepEqual(
      view.map((entry) => entry.id),
      ['level-0', 'low', 'mid', 'top']
    );
  });

  test('handles missing baseMapUrl by setting null', () => {
    const view = buildLevelViewModel({ baseMapUrl: null, mapLevels: { levels: [] } });
    assert.equal(view.length, 1);
    assert.equal(view[0].mapUrl, null);
  });

  test('levelIdExistsInViewModel matches level-0 and stored ids', () => {
    const view = buildLevelViewModel({
      baseMapUrl: '/m.png',
      mapLevels: { levels: [{ id: 'a' }] },
    });
    assert.equal(levelIdExistsInViewModel('level-0', view), true);
    assert.equal(levelIdExistsInViewModel('a', view), true);
    assert.equal(levelIdExistsInViewModel('missing', view), false);
    assert.equal(levelIdExistsInViewModel('', view), false);
  });
});

describe('Levels v2 — normalizeUserLevelStateEntry', () => {
  test('rejects entries without a levelId', () => {
    assert.equal(normalizeUserLevelStateEntry({}), null);
    assert.equal(normalizeUserLevelStateEntry({ levelId: '' }), null);
  });

  test('coerces an unknown source to manual and clamps updatedAt', () => {
    const entry = normalizeUserLevelStateEntry({
      levelId: '  level-0  ',
      source: 'BoGuS',
      updatedAt: '12345',
    });
    assert.equal(entry.levelId, 'level-0');
    assert.equal(entry.source, 'manual');
    assert.equal(entry.updatedAt, 12345);
  });

  test('preserves a tokenId when present', () => {
    const entry = normalizeUserLevelStateEntry({
      levelId: 'a',
      source: 'claim',
      tokenId: ' placement-1 ',
    });
    assert.equal(entry.tokenId, 'placement-1');
  });
});

describe('Levels v2 — normalizeUserLevelStateMap and normalizeClaimedTokensMap', () => {
  test('normalizes profile id keys to lowercase and drops invalid entries', () => {
    const result = normalizeUserLevelStateMap({
      Indigo: { levelId: 'level-0' },
      '': { levelId: 'a' },
      sharon: 'not-an-object',
      bogus: { levelId: '' },
    });
    assert.deepEqual(Object.keys(result).sort(), ['indigo']);
    assert.equal(result.indigo.levelId, 'level-0');
  });

  test('normalizes claim map keys (placement ids) and values (profile ids)', () => {
    const result = normalizeClaimedTokensMap({
      'placement-1': 'Indigo',
      '': 'sharon',
      'placement-2': '',
      'placement-3': 'FRUNK',
    });
    assert.deepEqual(result, {
      'placement-1': 'indigo',
      'placement-3': 'frunk',
    });
  });
});

describe('Levels v2 — scene-board-state normalization preserves new fields', () => {
  test('claimedTokens and userLevelState round-trip through the scene normalizer', () => {
    const normalized = normalizeSceneBoardState({
      'scene-1': {
        grid: { size: 64 },
        claimedTokens: { 'placement-1': 'Indigo' },
        userLevelState: {
          Indigo: { levelId: 'level-0', source: 'claim', tokenId: 'placement-1', updatedAt: 100 },
        },
      },
    });
    assert.deepEqual(normalized['scene-1'].claimedTokens, { 'placement-1': 'indigo' });
    assert.deepEqual(normalized['scene-1'].userLevelState.indigo, {
      levelId: 'level-0',
      source: 'claim',
      updatedAt: 100,
      tokenId: 'placement-1',
    });
  });

  test('absent fields default to empty maps', () => {
    const normalized = normalizeSceneBoardState({
      'scene-1': { grid: { size: 64 } },
    });
    assert.deepEqual(normalized['scene-1'].claimedTokens, {});
    assert.deepEqual(normalized['scene-1'].userLevelState, {});
  });
});

describe('Levels v2 — resolveActiveLevelIdForUser', () => {
  test('returns BASE_MAP_LEVEL_ID when no scene state is provided', () => {
    assert.equal(
      resolveActiveLevelIdForUser({ userId: 'gm' }),
      BASE_MAP_LEVEL_ID,
    );
  });

  test('returns BASE_MAP_LEVEL_ID when the user has no entry', () => {
    const sceneState = { userLevelState: {} };
    assert.equal(
      resolveActiveLevelIdForUser({ sceneState, userId: 'sharon' }),
      BASE_MAP_LEVEL_ID,
    );
  });

  test('returns the stored level id from userLevelState (lowercased userId match)', () => {
    const sceneState = {
      userLevelState: { gm: { levelId: 'map-level-a', source: 'manual', updatedAt: 1 } },
    };
    assert.equal(
      resolveActiveLevelIdForUser({ sceneState, userId: 'GM' }),
      'map-level-a',
    );
  });

  test('rejects an unknown level id when validLevelIds is provided', () => {
    const sceneState = {
      userLevelState: { gm: { levelId: 'gone', source: 'manual', updatedAt: 1 } },
    };
    assert.equal(
      resolveActiveLevelIdForUser({
        sceneState,
        userId: 'gm',
        validLevelIds: ['level-0', 'map-level-a'],
      }),
      BASE_MAP_LEVEL_ID,
    );
  });

  test('falls back to the most recent claimed token level', () => {
    const sceneState = {
      claimedTokens: { 't1': 'indigo', 't2': 'indigo' },
      userLevelState: {},
    };
    const placements = [
      { id: 't1', levelId: 'map-level-a', _lastModified: 100 },
      { id: 't2', levelId: 'map-level-b', _lastModified: 500 },
    ];
    assert.equal(
      resolveActiveLevelIdForUser({
        sceneState,
        userId: 'indigo',
        placements,
        validLevelIds: ['level-0', 'map-level-a', 'map-level-b'],
      }),
      'map-level-b',
    );
  });

  test('userLevelState takes priority over claimed token level', () => {
    const sceneState = {
      claimedTokens: { 't1': 'indigo' },
      userLevelState: {
        indigo: { levelId: 'map-level-x', source: 'manual', updatedAt: 200 },
      },
    };
    const placements = [
      { id: 't1', levelId: 'map-level-a', _lastModified: 999 },
    ];
    assert.equal(
      resolveActiveLevelIdForUser({
        sceneState,
        userId: 'indigo',
        placements,
        validLevelIds: ['level-0', 'map-level-a', 'map-level-x'],
      }),
      'map-level-x',
    );
  });

  test('claim fallback skips other users tokens', () => {
    const sceneState = {
      claimedTokens: { 't1': 'sharon' },
      userLevelState: {},
    };
    const placements = [
      { id: 't1', levelId: 'map-level-a', _lastModified: 1 },
    ];
    assert.equal(
      resolveActiveLevelIdForUser({
        sceneState,
        userId: 'indigo',
        placements,
      }),
      BASE_MAP_LEVEL_ID,
    );
  });
});

