import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { applyBoardStateOpLocally } from '../board-state-op-applier.js';
import { KNOWN_LEVEL_USER_IDS } from '../../state/normalize/map-levels.js';

// Levels v2 (Step 1): client-side op applier handlers for the new
// claim and user-level op types. Mirrors the server's `applyBoardStateOp`
// in `dnd/vtt/api/state.php`. These tests lock in the wire shape and
// scene-state mutation semantics; permission rules are enforced
// server-side and tested separately.

function seedBoardState() {
  return {
    placements: {
      'scene-1': [
        { id: 'hero', column: 1, row: 2 },
        { id: 'goblin', column: 5, row: 5 },
      ],
    },
    sceneState: {
      'scene-1': {
        mapLevels: { levels: [{ id: 'map-level-a' }], activeLevelId: null },
      },
    },
  };
}

describe('Board State Op Applier — claim.set / claim.clear', () => {
  test('sets a claim and writes the user id under the placement', () => {
    const state = seedBoardState();
    const mutated = applyBoardStateOpLocally(state, {
      type: 'claim.set',
      sceneId: 'scene-1',
      placementId: 'hero',
      userId: 'Indigo',
    });
    assert.equal(mutated, true);
    assert.equal(state.sceneState['scene-1'].claimedTokens.hero, 'indigo');
  });

  test('replacing an existing claim updates the user', () => {
    const state = seedBoardState();
    state.sceneState['scene-1'].claimedTokens = { hero: 'sharon' };
    const mutated = applyBoardStateOpLocally(state, {
      type: 'claim.set',
      sceneId: 'scene-1',
      placementId: 'hero',
      userId: 'frunk',
    });
    assert.equal(mutated, true);
    assert.equal(state.sceneState['scene-1'].claimedTokens.hero, 'frunk');
  });

  test('claim.set with same user is a no-op', () => {
    const state = seedBoardState();
    state.sceneState['scene-1'].claimedTokens = { hero: 'indigo' };
    const mutated = applyBoardStateOpLocally(state, {
      type: 'claim.set',
      sceneId: 'scene-1',
      placementId: 'hero',
      userId: 'indigo',
    });
    assert.equal(mutated, false);
  });

  test('claim.clear removes the claim', () => {
    const state = seedBoardState();
    state.sceneState['scene-1'].claimedTokens = { hero: 'indigo' };
    const mutated = applyBoardStateOpLocally(state, {
      type: 'claim.clear',
      sceneId: 'scene-1',
      placementId: 'hero',
    });
    assert.equal(mutated, true);
    assert.equal('hero' in state.sceneState['scene-1'].claimedTokens, false);
  });

  test('claim.clear on an unclaimed placement is a no-op', () => {
    const state = seedBoardState();
    const mutated = applyBoardStateOpLocally(state, {
      type: 'claim.clear',
      sceneId: 'scene-1',
      placementId: 'hero',
    });
    assert.equal(mutated, false);
  });

  test('rejects malformed claim.set ops', () => {
    const state = seedBoardState();
    assert.equal(
      applyBoardStateOpLocally(state, { type: 'claim.set', sceneId: 'scene-1' }),
      false
    );
    assert.equal(
      applyBoardStateOpLocally(state, {
        type: 'claim.set',
        sceneId: 'scene-1',
        placementId: 'hero',
      }),
      false
    );
    assert.equal(state.sceneState['scene-1'].claimedTokens, undefined);
  });
});

describe('Board State Op Applier — user-level.set', () => {
  test('writes a per-user level entry with manual default source', () => {
    const state = seedBoardState();
    const mutated = applyBoardStateOpLocally(state, {
      type: 'user-level.set',
      sceneId: 'scene-1',
      userId: 'indigo',
      levelId: 'level-0',
    });
    assert.equal(mutated, true);
    const entry = state.sceneState['scene-1'].userLevelState.indigo;
    assert.equal(entry.levelId, 'level-0');
    assert.equal(entry.source, 'manual');
    assert.ok(typeof entry.updatedAt === 'number' && entry.updatedAt > 0);
  });

  test('respects an explicit source and tokenId when provided', () => {
    const state = seedBoardState();
    applyBoardStateOpLocally(state, {
      type: 'user-level.set',
      sceneId: 'scene-1',
      userId: 'sharon',
      levelId: 'map-level-a',
      source: 'claim',
      tokenId: 'hero',
    });
    const entry = state.sceneState['scene-1'].userLevelState.sharon;
    assert.equal(entry.source, 'claim');
    assert.equal(entry.tokenId, 'hero');
  });

  test('coerces an unknown source string to manual', () => {
    const state = seedBoardState();
    applyBoardStateOpLocally(state, {
      type: 'user-level.set',
      sceneId: 'scene-1',
      userId: 'frunk',
      levelId: 'level-0',
      source: 'bogus',
    });
    assert.equal(state.sceneState['scene-1'].userLevelState.frunk.source, 'manual');
  });
});

describe('Board State Op Applier — user-level.activate', () => {
  test('writes the same level for every supplied user with source=activate', () => {
    const state = seedBoardState();
    const mutated = applyBoardStateOpLocally(state, {
      type: 'user-level.activate',
      sceneId: 'scene-1',
      levelId: 'map-level-a',
      userIds: ['indigo', 'Sharon', 'frunk'],
    });
    assert.equal(mutated, true);
    const entries = state.sceneState['scene-1'].userLevelState;
    assert.equal(entries.indigo.levelId, 'map-level-a');
    assert.equal(entries.indigo.source, 'activate');
    assert.equal(entries.sharon.source, 'activate');
    assert.equal(entries.frunk.source, 'activate');
  });

  test('returns false when userIds is empty or missing', () => {
    const state = seedBoardState();
    assert.equal(
      applyBoardStateOpLocally(state, {
        type: 'user-level.activate',
        sceneId: 'scene-1',
        levelId: 'map-level-a',
        userIds: [],
      }),
      false
    );
  });

  test('creates the sceneState entry if missing', () => {
    const state = { placements: {}, sceneState: {} };
    const mutated = applyBoardStateOpLocally(state, {
      type: 'user-level.activate',
      sceneId: 'scene-7',
      levelId: 'level-0',
      userIds: ['indigo'],
    });
    assert.equal(mutated, true);
    assert.equal(state.sceneState['scene-7'].userLevelState.indigo.levelId, 'level-0');
  });

  test('Step 4: activate with KNOWN_LEVEL_USER_IDS pulls every roster member to one level', () => {
    // The Activate button (§5.3) builds its op by passing
    // `userIds: [...KNOWN_LEVEL_USER_IDS]`. Every known user — including
    // the GM — must end up on the activated level with source=activate.
    const state = seedBoardState();
    state.sceneState['scene-1'].userLevelState = {
      // Pre-existing claim-driven state should be overwritten by Activate.
      indigo: { levelId: 'map-level-a', source: 'claim', tokenId: 'hero', updatedAt: 1 },
    };
    const mutated = applyBoardStateOpLocally(state, {
      type: 'user-level.activate',
      sceneId: 'scene-1',
      levelId: 'level-0',
      userIds: [...KNOWN_LEVEL_USER_IDS],
    });
    assert.equal(mutated, true);
    const entries = state.sceneState['scene-1'].userLevelState;
    for (const userId of KNOWN_LEVEL_USER_IDS) {
      assert.equal(entries[userId].levelId, 'level-0', `${userId} should be pulled to level-0`);
      assert.equal(entries[userId].source, 'activate', `${userId} should have source=activate`);
    }
    // The previous claim entry's tokenId should be dropped: activate
    // writes a fresh entry that intentionally omits tokenId so the
    // follow-token rule re-engages on the next claimed-token level
    // change.
    assert.equal(entries.indigo.tokenId, undefined);
  });
});
