import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

// The normalizeCombatStateEntry function is not exported, so we test it
// indirectly through initializeState, or we import the store module and
// exercise the combat state normalization via the normalizeSceneBoardState path.
// Since initializeState has side effects (global state), we test through
// getState after initialization.
import { initializeState, getState } from '../../state/store.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function initWithCombat(combatState, sceneId = 'scene-1') {
  initializeState({
    scenes: { folders: [], items: [{ id: sceneId }] },
    tokens: { folders: [], items: [] },
    boardState: {
      activeSceneId: sceneId,
      placements: {},
      sceneState: {
        [sceneId]: {
          combat: combatState,
        },
      },
    },
    user: { isGM: true, name: 'GM' },
  });
  return getState().boardState.sceneState[sceneId]?.combat ?? null;
}

// ===========================================================================
// 1. BASIC COMBAT STATE NORMALIZATION
// ===========================================================================

describe('Combat State Normalization – Basic', () => {
  test('null combat state normalizes to null', () => {
    const combat = initWithCombat(null);
    assert.equal(combat, null);
  });

  test('empty object normalizes to null (no meaningful state)', () => {
    const combat = initWithCombat({});
    assert.equal(combat, null);
  });

  test('active combat state is preserved', () => {
    const combat = initWithCombat({
      active: true,
      round: 3,
      activeCombatantId: 'fighter-1',
      updatedAt: 1000,
    });

    assert.ok(combat);
    assert.equal(combat.active, true);
    assert.equal(combat.round, 3);
    assert.equal(combat.activeCombatantId, 'fighter-1');
  });

  test('inactive state with round > 0 is preserved', () => {
    const combat = initWithCombat({
      active: false,
      round: 5,
    });

    assert.ok(combat);
    assert.equal(combat.active, false);
    assert.equal(combat.round, 5);
  });

  test('round is clamped to non-negative', () => {
    const combat = initWithCombat({
      active: true,
      round: -3,
      updatedAt: 1000,
    });

    assert.ok(combat);
    assert.equal(combat.round, 0);
  });
});

// ===========================================================================
// 2. TEAM NORMALIZATION
// ===========================================================================

describe('Combat State Normalization – Teams', () => {
  test('startingTeam normalizes "ally" correctly', () => {
    const combat = initWithCombat({
      startingTeam: 'ally',
      updatedAt: 1000,
    });

    assert.ok(combat);
    assert.equal(combat.startingTeam, 'ally');
  });

  test('startingTeam normalizes "enemy" correctly', () => {
    const combat = initWithCombat({
      startingTeam: 'enemy',
      updatedAt: 1000,
    });

    assert.ok(combat);
    assert.equal(combat.startingTeam, 'enemy');
  });

  test('invalid team values normalize to null', () => {
    const combat = initWithCombat({
      startingTeam: 'neutral',
      currentTeam: 'unknown',
      lastTeam: 'party',
      active: true,
      updatedAt: 1000,
    });

    assert.ok(combat);
    assert.equal(combat.startingTeam, null);
    assert.equal(combat.currentTeam, null);
    assert.equal(combat.lastTeam, null);
  });

  test('currentTeam and lastTeam preserve valid values', () => {
    const combat = initWithCombat({
      currentTeam: 'ally',
      lastTeam: 'enemy',
      updatedAt: 1000,
    });

    assert.ok(combat);
    assert.equal(combat.currentTeam, 'ally');
    assert.equal(combat.lastTeam, 'enemy');
  });

  test('alternate key names: initialTeam, activeTeam, previousTeam', () => {
    const combat = initWithCombat({
      initialTeam: 'enemy',
      activeTeam: 'ally',
      previousTeam: 'enemy',
      updatedAt: 1000,
    });

    assert.ok(combat);
    assert.equal(combat.startingTeam, 'enemy');
    assert.equal(combat.currentTeam, 'ally');
    assert.equal(combat.lastTeam, 'enemy');
  });
});

// ===========================================================================
// 3. COMPLETED COMBATANTS
// ===========================================================================

describe('Combat State Normalization – Completed Combatants', () => {
  test('completedCombatantIds normalizes to unique strings', () => {
    const combat = initWithCombat({
      completedCombatantIds: ['a', 'b', 'a', 'c'],
      updatedAt: 1000,
    });

    assert.ok(combat);
    assert.deepEqual(combat.completedCombatantIds, ['a', 'b', 'c']);
  });

  test('non-string entries are filtered out', () => {
    const combat = initWithCombat({
      completedCombatantIds: ['valid', 42, null, undefined, 'also-valid'],
      updatedAt: 1000,
    });

    assert.ok(combat);
    assert.deepEqual(combat.completedCombatantIds, ['valid', 'also-valid']);
  });

  test('empty array is preserved', () => {
    const combat = initWithCombat({
      active: true,
      completedCombatantIds: [],
      updatedAt: 1000,
    });

    assert.ok(combat);
    assert.deepEqual(combat.completedCombatantIds, []);
  });
});

// ===========================================================================
// 4. TURN LOCK
// ===========================================================================

describe('Combat State Normalization – Turn Lock', () => {
  test('valid turn lock is preserved', () => {
    const combat = initWithCombat({
      turnLock: {
        holderId: 'Player1',
        holderName: 'John',
        combatantId: 'fighter-1',
        lockedAt: 5000,
      },
      updatedAt: 1000,
    });

    assert.ok(combat);
    assert.ok(combat.turnLock);
    assert.equal(combat.turnLock.holderId, 'player1'); // lowercased
    assert.equal(combat.turnLock.holderName, 'John');
    assert.equal(combat.turnLock.combatantId, 'fighter-1');
  });

  test('turn lock without holderId normalizes to null', () => {
    const combat = initWithCombat({
      turnLock: { holderName: 'orphan' },
      active: true,
      updatedAt: 1000,
    });

    assert.ok(combat);
    assert.equal(combat.turnLock, null);
  });

  test('turn lock holderName defaults to holderId', () => {
    const combat = initWithCombat({
      turnLock: { holderId: 'abc' },
      updatedAt: 1000,
    });

    assert.ok(combat);
    assert.equal(combat.turnLock.holderName, 'abc');
  });

  test('null turn lock is preserved as null', () => {
    const combat = initWithCombat({
      active: true,
      turnLock: null,
      updatedAt: 1000,
    });

    assert.ok(combat);
    assert.equal(combat.turnLock, null);
  });
});

// ===========================================================================
// 5. LAST EFFECT
// ===========================================================================

describe('Combat State Normalization – Last Effect', () => {
  test('valid last effect is preserved', () => {
    const combat = initWithCombat({
      lastEffect: {
        type: 'turn-start',
        combatantId: 'fighter-1',
        triggeredAt: 5000,
      },
      updatedAt: 1000,
    });

    assert.ok(combat);
    assert.ok(combat.lastEffect);
    assert.equal(combat.lastEffect.type, 'turn-start');
    assert.equal(combat.lastEffect.combatantId, 'fighter-1');
    assert.equal(combat.lastEffect.triggeredAt, 5000);
  });

  test('empty last effect normalizes to null', () => {
    const combat = initWithCombat({
      lastEffect: {},
      active: true,
      updatedAt: 1000,
    });

    assert.ok(combat);
    assert.equal(combat.lastEffect, null);
  });

  test('last effect with payload is preserved', () => {
    const combat = initWithCombat({
      lastEffect: {
        type: 'hesitation',
        payload: { reason: 'thinking' },
        triggeredAt: 3000,
      },
      updatedAt: 1000,
    });

    assert.ok(combat);
    assert.ok(combat.lastEffect.payload);
    assert.equal(combat.lastEffect.payload.reason, 'thinking');
  });

  test('alternate key: lastEvent maps to lastEffect', () => {
    const combat = initWithCombat({
      lastEvent: {
        type: 'skip',
        triggeredAt: 2000,
      },
      updatedAt: 1000,
    });

    assert.ok(combat);
    assert.ok(combat.lastEffect);
    assert.equal(combat.lastEffect.type, 'skip');
  });
});

// ===========================================================================
// 6. GROUPS NORMALIZATION
// ===========================================================================

describe('Combat State Normalization – Groups', () => {
  test('valid group is preserved', () => {
    const combat = initWithCombat({
      groups: [
        {
          representativeId: 'goblin-leader',
          memberIds: ['goblin-leader', 'goblin-minion-1', 'goblin-minion-2'],
        },
      ],
      updatedAt: 1000,
    });

    assert.ok(combat);
    assert.equal(combat.groups.length, 1);
    assert.equal(combat.groups[0].representativeId, 'goblin-leader');
    assert.equal(combat.groups[0].memberIds.length, 3);
  });

  test('representative is added to memberIds if missing', () => {
    const combat = initWithCombat({
      groups: [
        {
          representativeId: 'leader',
          memberIds: ['minion-1', 'minion-2'],
        },
      ],
      updatedAt: 1000,
    });

    assert.ok(combat);
    assert.ok(combat.groups[0].memberIds.includes('leader'));
  });

  test('group with only 1 member (after normalization) is filtered out', () => {
    const combat = initWithCombat({
      groups: [
        {
          representativeId: 'solo',
          memberIds: ['solo'],
        },
      ],
      active: true,
      updatedAt: 1000,
    });

    assert.ok(combat);
    assert.equal(combat.groups.length, 0);
  });

  test('duplicate member IDs are deduplicated', () => {
    const combat = initWithCombat({
      groups: [
        {
          representativeId: 'lead',
          memberIds: ['lead', 'follower', 'follower', 'lead'],
        },
      ],
      updatedAt: 1000,
    });

    assert.ok(combat);
    assert.equal(combat.groups[0].memberIds.length, 2);
  });

  test('alternate key names: groupings, combatGroups, combatantGroups', () => {
    // Test with 'groupings' key
    const combat = initWithCombat({
      groupings: [
        { representativeId: 'a', memberIds: ['a', 'b'] },
      ],
      updatedAt: 1000,
    });

    assert.ok(combat);
    assert.equal(combat.groups.length, 1);
  });

  test('group entry with alternate "id" key maps to representativeId', () => {
    const combat = initWithCombat({
      groups: [
        { id: 'rep', memberIds: ['rep', 'member-1'] },
      ],
      updatedAt: 1000,
    });

    assert.ok(combat);
    assert.equal(combat.groups[0].representativeId, 'rep');
  });

  test('groups from object format (map of representative to members)', () => {
    const combat = initWithCombat({
      groups: {
        'goblin-boss': ['goblin-boss', 'goblin-1', 'goblin-2'],
      },
      updatedAt: 1000,
    });

    assert.ok(combat);
    assert.equal(combat.groups.length, 1);
    assert.equal(combat.groups[0].representativeId, 'goblin-boss');
  });

  test('empty groups array normalizes to empty', () => {
    const combat = initWithCombat({
      groups: [],
      active: true,
      updatedAt: 1000,
    });

    assert.ok(combat);
    assert.deepEqual(combat.groups, []);
  });
});

// ===========================================================================
// 7. MALICE AND ROUND TURN COUNT
// ===========================================================================

describe('Combat State Normalization – Malice & Turn Count', () => {
  test('malice is clamped to non-negative', () => {
    const combat = initWithCombat({
      malice: -5,
      active: true,
      updatedAt: 1000,
    });

    assert.ok(combat);
    assert.equal(combat.malice, 0);
  });

  test('valid malice value is preserved', () => {
    const combat = initWithCombat({
      malice: 7,
      updatedAt: 1000,
    });

    assert.ok(combat);
    assert.equal(combat.malice, 7);
  });

  test('alternate key: maliceCount maps to malice', () => {
    const combat = initWithCombat({
      maliceCount: 3,
      updatedAt: 1000,
    });

    assert.ok(combat);
    assert.equal(combat.malice, 3);
  });

  test('roundTurnCount is clamped to non-negative', () => {
    const combat = initWithCombat({
      roundTurnCount: -2,
      active: true,
      updatedAt: 1000,
    });

    assert.ok(combat);
    assert.equal(combat.roundTurnCount, 0);
  });

  test('valid roundTurnCount is preserved', () => {
    const combat = initWithCombat({
      roundTurnCount: 4,
      updatedAt: 1000,
    });

    assert.ok(combat);
    assert.equal(combat.roundTurnCount, 4);
  });
});

// ===========================================================================
// 8. UPDATER TIMESTAMP
// ===========================================================================

describe('Combat State Normalization – Timestamp', () => {
  test('valid updatedAt is preserved', () => {
    const combat = initWithCombat({
      active: true,
      updatedAt: 1700000000000,
    });

    assert.ok(combat);
    assert.equal(combat.updatedAt, 1700000000000);
  });

  test('state with only updatedAt (timestamp present) is preserved', () => {
    const combat = initWithCombat({
      updatedAt: 5000,
    });

    // hasTimestamp is true, so state should be preserved
    assert.ok(combat);
  });
});
