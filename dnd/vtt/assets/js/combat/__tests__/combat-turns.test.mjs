import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { TURN_PHASE } from '../combat-state.js';
import {
  advanceCombatRoundState,
  completeCombatantTurnState,
  getWaitingCombatantsByTeam,
  pickPlayerQuickStartCombatantId,
  pickNextCombatantId,
  validateTurnStartState,
} from '../combat-turns.js';

describe('combat turn start validation', () => {
  test('blocks turn starts when combat is inactive', () => {
    const result = validateTurnStartState({
      combatActive: false,
      combatantId: 'token-1',
      currentPhase: TURN_PHASE.PICK,
    });

    assert.equal(result.valid, false);
    assert.equal(result.requiresConfirmation, false);
  });

  test('requires confirmation before repeating a completed representative turn', () => {
    const result = validateTurnStartState({
      combatActive: true,
      combatantId: 'member-1',
      team: 'ally',
      representativeId: 'leader',
      currentPhase: TURN_PHASE.PICK,
      currentTurnTeam: 'ally',
      completedCombatantIds: new Set(['leader']),
    });

    assert.equal(result.valid, false);
    assert.equal(result.requiresConfirmation, true);
    assert.equal(result.confirmationType, 'repeat_completed_turn');
  });

  test('allows an explicit override to repeat a completed representative turn', () => {
    const result = validateTurnStartState(
      {
        combatActive: true,
        combatantId: 'member-1',
        team: 'ally',
        representativeId: 'leader',
        currentPhase: TURN_PHASE.PICK,
        currentTurnTeam: 'enemy',
        completedCombatantIds: new Set(['leader']),
      },
      { override: true }
    );

    assert.equal(result.valid, true);
    assert.equal(result.requiresConfirmation, false);
  });

  test('requires confirmation when another combatant holds the lock', () => {
    const result = validateTurnStartState({
      combatActive: true,
      combatantId: 'token-2',
      team: 'ally',
      currentPhase: TURN_PHASE.PICK,
      currentTurnTeam: 'ally',
      turnLockState: {
        holderId: 'player-a',
        combatantId: 'token-1',
      },
    });

    assert.equal(result.valid, false);
    assert.equal(result.requiresConfirmation, true);
    assert.equal(result.confirmationType, 'override_active_turn');
  });

  test('allows explicit override through active lock conflicts', () => {
    const result = validateTurnStartState(
      {
        combatActive: true,
        combatantId: 'token-2',
        team: 'ally',
        currentPhase: TURN_PHASE.PICK,
        currentTurnTeam: 'ally',
        turnLockState: {
          holderId: 'player-a',
          combatantId: 'token-1',
        },
      },
      { override: true }
    );

    assert.equal(result.valid, true);
    assert.equal(result.requiresConfirmation, false);
  });

  test('allows the current side to start during pick phase and the same active combatant to resume', () => {
    assert.equal(
      validateTurnStartState({
        combatActive: true,
        combatantId: 'token-1',
        team: 'ally',
        currentPhase: TURN_PHASE.PICK,
        currentTurnTeam: 'ally',
      }).valid,
      true
    );

    assert.equal(
      validateTurnStartState({
        combatActive: true,
        combatantId: 'token-1',
        currentPhase: TURN_PHASE.ACTIVE,
        activeCombatantId: 'token-1',
      }).valid,
      true
    );
  });

  test('requires explicit confirmation when the wrong side starts during pick phase', () => {
    const result = validateTurnStartState({
      combatActive: true,
      combatantId: 'ally-1',
      team: 'ally',
      currentPhase: TURN_PHASE.PICK,
      currentTurnTeam: 'enemy',
    });

    assert.equal(result.valid, false);
    assert.equal(result.requiresConfirmation, true);
    assert.equal(result.confirmationType, 'wrong_side_pick');
    assert.equal(result.team, 'ally');
    assert.equal(result.expectedTeam, 'enemy');
  });

  test('allows an explicit GM override to start the wrong side during pick phase', () => {
    const result = validateTurnStartState(
      {
        combatActive: true,
        combatantId: 'ally-1',
        team: 'ally',
        currentPhase: TURN_PHASE.PICK,
        currentTurnTeam: 'enemy',
      },
      { override: true }
    );

    assert.equal(result.valid, true);
    assert.equal(result.requiresConfirmation, false);
  });

  test('labels switching away from an active combatant as a turn switch', () => {
    const result = validateTurnStartState({
      combatActive: true,
      combatantId: 'token-2',
      currentPhase: TURN_PHASE.ACTIVE,
      activeCombatantId: 'token-1',
    });

    assert.equal(result.valid, false);
    assert.equal(result.requiresConfirmation, true);
    assert.equal(result.confirmationType, 'switch_active_turn');
  });
});

describe('combat turn state transitions', () => {
  test('completes the active representative and hands pick phase to the other team', () => {
    const result = completeCombatantTurnState({
      activeCombatantId: 'member-1',
      completedCombatantIds: new Set(['already-done', 'already-done']),
      roundTurnCount: 2,
      getRepresentativeIdFor: (id) => (id === 'member-1' ? 'leader' : id),
      getCombatantTeam: (id) => (id === 'leader' ? 'ally' : 'enemy'),
    });

    assert.equal(result.completed, true);
    assert.equal(result.finishedId, 'leader');
    assert.equal(result.finishedTeam, 'ally');
    assert.equal(result.nextTeam, 'enemy');
    assert.deepEqual(result.preferredTeams, ['enemy', 'ally']);
    assert.deepEqual(result.completedCombatantIds, ['already-done', 'leader']);
    assert.equal(result.roundTurnCount, 3);
  });

  test('complete turn state is a no-op without an active combatant', () => {
    const result = completeCombatantTurnState({
      activeCombatantId: null,
      completedCombatantIds: ['done'],
      roundTurnCount: 4,
    });

    assert.equal(result.completed, false);
    assert.deepEqual(result.completedCombatantIds, ['done']);
    assert.equal(result.roundTurnCount, 4);
  });

  test('advance round clears turn-local state and preserves starting team priority', () => {
    const result = advanceCombatRoundState({
      combatActive: true,
      combatRound: 2,
      startingTeam: 'enemy',
      currentTeam: 'ally',
    });

    assert.equal(result.advanced, true);
    assert.equal(result.round, 3);
    assert.equal(result.currentTeam, 'enemy');
    assert.deepEqual(result.preferredTeams, ['enemy', 'ally']);
    assert.deepEqual(result.completedCombatantIds, []);
    assert.equal(result.activeCombatantId, null);
    assert.equal(result.roundTurnCount, 0);
  });

  test('ending a round completes the active turn before resetting round state', () => {
    const completion = completeCombatantTurnState({
      activeCombatantId: 'ally-1',
      completedCombatantIds: ['enemy-1'],
      roundTurnCount: 1,
      getRepresentativeIdFor: (id) => id,
      getCombatantTeam: () => 'ally',
    });
    assert.equal(completion.completed, true);
    assert.deepEqual(completion.completedCombatantIds, ['enemy-1', 'ally-1']);
    assert.equal(completion.roundTurnCount, 2);

    const nextRound = advanceCombatRoundState({
      combatActive: true,
      combatRound: 4,
      startingTeam: 'enemy',
      currentTeam: completion.nextTeam,
    });
    assert.equal(nextRound.round, 5);
    assert.equal(nextRound.activeCombatantId, null);
    assert.deepEqual(nextRound.completedCombatantIds, []);
    assert.equal(nextRound.roundTurnCount, 0);
  });
});

describe('combat turn picking', () => {
  test('player quick start never falls back to a completed combatant', () => {
    assert.equal(
      pickPlayerQuickStartCombatantId({
        candidateIds: ['indigo'],
        livePlacementIds: ['indigo'],
        completedCombatantIds: ['indigo'],
        currentTurnTeam: 'ally',
        getCombatantTeam: () => 'ally',
      }),
      null
    );
  });

  test('player quick start still selects an allied combatant who is waiting', () => {
    assert.equal(
      pickPlayerQuickStartCombatantId({
        candidateIds: ['indigo'],
        livePlacementIds: ['indigo'],
        completedCombatantIds: [],
        currentTurnTeam: 'ally',
        getCombatantTeam: () => 'ally',
      }),
      'indigo'
    );
  });

  test('groups waiting combatants by team using representatives and completed state', () => {
    const waiting = getWaitingCombatantsByTeam({
      entries: [{ id: 'ally-1' }, { id: 'enemy-member' }, { id: 'enemy-leader' }, { id: 'done' }],
      completedCombatantIds: ['done'],
      getRepresentativeIdFor: (id) => (id === 'enemy-member' ? 'enemy-leader' : id),
      getCombatantTeam: (id) => (id.startsWith('enemy') ? 'enemy' : 'ally'),
    });

    assert.deepEqual(waiting, {
      ally: ['ally-1'],
      enemy: ['enemy-leader'],
    });
  });

  test('picks from preferred teams and returns the matching current team', () => {
    assert.deepEqual(
      pickNextCombatantId({
        waiting: { ally: ['ally-1'], enemy: ['enemy-1'] },
        preferredTeams: ['enemy', 'ally'],
      }),
      { combatantId: 'enemy-1', currentTurnTeam: 'enemy' }
    );
  });

  test('falls back ally first, then enemy, then null', () => {
    assert.deepEqual(
      pickNextCombatantId({ waiting: { ally: ['ally-1'], enemy: ['enemy-1'] } }),
      { combatantId: 'ally-1', currentTurnTeam: 'ally' }
    );
    assert.deepEqual(
      pickNextCombatantId({ waiting: { ally: [], enemy: ['enemy-1'] } }),
      { combatantId: 'enemy-1', currentTurnTeam: 'enemy' }
    );
    assert.deepEqual(
      pickNextCombatantId({ waiting: { ally: [], enemy: [] } }),
      { combatantId: null, currentTurnTeam: null }
    );
  });
});
