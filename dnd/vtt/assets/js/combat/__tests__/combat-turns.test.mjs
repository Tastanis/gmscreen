import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { TURN_PHASE } from '../combat-state.js';
import {
  advanceCombatRoundState,
  completeCombatantTurnState,
  getWaitingCombatantsByTeam,
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

  test('blocks completed representative combatants', () => {
    const result = validateTurnStartState({
      combatActive: true,
      combatantId: 'member-1',
      representativeId: 'leader',
      currentPhase: TURN_PHASE.PICK,
      completedCombatantIds: new Set(['leader']),
    });

    assert.equal(result.valid, false);
  });

  test('requires confirmation when another combatant holds the lock', () => {
    const result = validateTurnStartState({
      combatActive: true,
      combatantId: 'token-2',
      currentPhase: TURN_PHASE.PICK,
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
        currentPhase: TURN_PHASE.PICK,
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

  test('allows pick phase and same active combatant starts', () => {
    assert.equal(
      validateTurnStartState({
        combatActive: true,
        combatantId: 'token-1',
        currentPhase: TURN_PHASE.PICK,
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
});

describe('combat turn picking', () => {
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
