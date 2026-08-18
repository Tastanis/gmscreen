import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  BASE_MAP_LEVEL_ID,
  KNOWN_LEVEL_USER_IDS,
  PLAYER_CHARACTER_USER_IDS,
  buildLevelViewModel,
  levelIdExistsInViewModel,
  normalizeUserLevelStateEntry,
  normalizeUserLevelStateMap,
  resolveActiveLevelIdForUser,
  resolvePcTokenForUser,
  resolvePcTokenLevelIdForUser,
  resolvePlacementLevelId,
  resolveTopmostLevelId,
} from '../normalize/map-levels.js';
import { normalizeSceneBoardState } from '../normalize/scene-board-state.js';

describe('map-level normalization', () => {
  test('uses the virtual base level for placements without an explicit level', () => {
    assert.equal(BASE_MAP_LEVEL_ID, 'level-0');
    assert.equal(resolvePlacementLevelId({}), BASE_MAP_LEVEL_ID);
    assert.equal(resolvePlacementLevelId({ levelId: ' upper ' }), 'upper');
  });

  test('builds a sorted view model with the base map first', () => {
    const view = buildLevelViewModel({
      baseMapUrl: '/maps/base.png',
      mapLevels: {
        levels: [
          { id: 'top', zIndex: 5 },
          { id: 'low', zIndex: 1 },
        ],
      },
      sceneGrid: { size: 80 },
    });
    assert.deepEqual(view.map((entry) => entry.id), ['level-0', 'low', 'top']);
    assert.equal(view[0].mapUrl, '/maps/base.png');
    assert.equal(view[0].grid.size, 80);
    assert.equal(levelIdExistsInViewModel('top', view), true);
    assert.equal(resolveTopmostLevelId({ mapLevels: { levels: view.slice(1) } }), 'top');
  });

  test('normalizes user level state without ownership metadata', () => {
    assert.deepEqual(
      normalizeUserLevelStateEntry({
        levelId: ' upper ',
        source: 'claim',
        tokenId: 'token-1',
        updatedAt: '12',
      }),
      { levelId: 'upper', source: 'manual', updatedAt: 12 },
    );
    assert.deepEqual(
      normalizeUserLevelStateMap({
        Indigo: { levelId: 'upper', source: 'activate', updatedAt: 4 },
        Zepha: { levelId: 'upper', source: 'token', tokenId: 'hero', updatedAt: 5 },
        '': { levelId: 'ignored' },
      }),
      {
        indigo: { levelId: 'upper', source: 'activate', updatedAt: 4 },
        zepha: { levelId: 'upper', source: 'token', tokenId: 'hero', updatedAt: 5 },
      },
    );
  });

  test('scene normalization drops obsolete token-claim state', () => {
    const normalized = normalizeSceneBoardState({
      'scene-1': {
        grid: { size: 64 },
        claimedTokens: { 'token-1': 'indigo' },
        userLevelState: {
          Indigo: { levelId: 'upper', source: 'manual', updatedAt: 10 },
        },
      },
    });
    assert.equal(Object.hasOwn(normalized['scene-1'], 'claimedTokens'), false);
    assert.deepEqual(
      normalized['scene-1'].userLevelState.indigo,
      { levelId: 'upper', source: 'manual', updatedAt: 10 },
    );
  });

  test('resolves a user level from explicit state and otherwise uses the base map', () => {
    assert.equal(
      resolveActiveLevelIdForUser({
        sceneState: {
          userLevelState: {
            indigo: { levelId: 'upper', source: 'manual', updatedAt: 1 },
          },
        },
        userId: 'INDIGO',
        validLevelIds: ['level-0', 'upper'],
      }),
      'upper',
    );
    assert.equal(
      resolveActiveLevelIdForUser({
        sceneState: {
          userLevelState: {
            indigo: { levelId: 'deleted', source: 'manual', updatedAt: 1 },
          },
        },
        userId: 'indigo',
        validLevelIds: ['level-0', 'upper'],
      }),
      BASE_MAP_LEVEL_ID,
    );
  });
});

describe('character profile association', () => {
  test('keeps the configured character profile roster', () => {
    assert.deepEqual(PLAYER_CHARACTER_USER_IDS, ['cal', 'sharon', 'indigo', 'zepha']);
    PLAYER_CHARACTER_USER_IDS.forEach((id) => assert.ok(KNOWN_LEVEL_USER_IDS.includes(id)));
  });

  test('resolves the matching character token without a claim map', () => {
    assert.equal(
      resolvePcTokenLevelIdForUser({
        userId: 'SHARON',
        placements: [
          { id: 'familiar', name: 'Inkfang', levelId: 'level-0' },
          { id: 'hero', name: 'Sharon Stormwind', levelId: 'upper' },
        ],
        validLevelIds: ['level-0', 'upper'],
      }),
      'upper',
    );
  });

  test('prefers explicit profile metadata when a token name differs', () => {
    const placements = [
      { id: 'hero', name: 'The Living Shadow', profileId: 'Indigo', levelId: 'upper' },
    ];
    assert.equal(
      resolvePcTokenLevelIdForUser({
        userId: 'indigo',
        placements,
        validLevelIds: ['level-0', 'upper'],
      }),
      'upper',
    );
    assert.deepEqual(
      resolvePcTokenForUser({
        userId: 'indigo',
        placements,
        validLevelIds: ['level-0', 'upper'],
      }),
      { placementId: 'hero', levelId: 'upper' },
    );
  });

  test('uses word boundaries and refuses ambiguous duplicate character tokens', () => {
    assert.equal(
      resolvePcTokenLevelIdForUser({
        userId: 'cal',
        placements: [{ id: 'lookalike', name: 'Calster', levelId: 'upper' }],
      }),
      null,
    );
    assert.equal(
      resolvePcTokenLevelIdForUser({
        userId: 'sharon',
        placements: [
          { id: 'one', name: 'Sharon', levelId: 'level-0' },
          { id: 'two', name: 'Sharon Illusion', levelId: 'upper' },
        ],
      }),
      null,
    );
  });

  test('does not fall back to a token name when explicit linkage names another profile', () => {
    assert.equal(
      resolvePcTokenLevelIdForUser({
        userId: 'zepha',
        placements: [
          { id: 'hero', name: 'Zepha', profileId: 'guest', levelId: 'upper' },
        ],
      }),
      null,
    );
  });
});
