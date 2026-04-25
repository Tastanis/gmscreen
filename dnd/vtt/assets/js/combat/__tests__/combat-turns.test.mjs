import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { TURN_PHASE } from '../combat-state.js';
import {
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
