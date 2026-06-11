import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  applyTriggerReadyState,
  clearTriggerReadyState,
  shouldExpireReadyTriggerAtTurnEnd,
} from '../automation-trigger-ready.js';

describe('applyTriggerReadyState mark context', () => {
  test('stamps the round and active combatant the trigger fired during', () => {
    const placement = { id: 'hero-1' };
    const result = applyTriggerReadyState(placement, {
      abilityId: 'shield-block',
      markRound: 2,
      markCombatantId: 'monster-1',
    });

    assert.equal(result.hasReadyTrigger, true);
    assert.equal(placement.triggerMarkRound, 2);
    assert.equal(placement.triggerMarkCombatantId, 'monster-1');
    assert.equal(placement.triggerSetAtPhase, null);
  });

  test('stamps null combatant when no turn is active', () => {
    const placement = { id: 'hero-1' };
    applyTriggerReadyState(placement, {
      abilityId: 'shield-block',
      markRound: 2,
      markCombatantId: null,
    });

    assert.equal(placement.triggerMarkCombatantId, null);
  });

  test('scrubs a legacy phase-tick stamp', () => {
    const placement = { id: 'hero-1', triggerSetAtPhase: 14 };
    applyTriggerReadyState(placement, {
      abilityId: 'shield-block',
      markRound: 1,
      markCombatantId: 'monster-1',
    });

    assert.equal(placement.triggerSetAtPhase, null);
  });
});

describe('clearTriggerReadyState mark context', () => {
  test('clears mark context when the last ability is removed', () => {
    const placement = { id: 'hero-1' };
    applyTriggerReadyState(placement, {
      abilityId: 'shield-block',
      markRound: 2,
      markCombatantId: 'monster-1',
    });
    const result = clearTriggerReadyState(placement, 'shield-block');

    assert.equal(result.hasReadyTrigger, false);
    assert.equal(placement.triggerMarkRound, null);
    assert.equal(placement.triggerMarkCombatantId, null);
  });

  test('keeps mark context while other abilities remain ready', () => {
    const placement = { id: 'hero-1' };
    applyTriggerReadyState(placement, {
      abilityId: 'shield-block',
      markRound: 2,
      markCombatantId: 'monster-1',
    });
    applyTriggerReadyState(placement, {
      abilityId: 'counterspell',
      markRound: 2,
      markCombatantId: 'monster-1',
    });
    const result = clearTriggerReadyState(placement, 'shield-block');

    assert.equal(result.hasReadyTrigger, true);
    assert.equal(placement.triggerMarkCombatantId, 'monster-1');
  });
});

describe('shouldExpireReadyTriggerAtTurnEnd', () => {
  test('expires when the combatant it fired during ends their turn', () => {
    const placement = { id: 'hero-1' };
    applyTriggerReadyState(placement, {
      abilityId: 'shield-block',
      markRound: 2,
      markCombatantId: 'monster-1',
    });

    assert.equal(shouldExpireReadyTriggerAtTurnEnd(placement, 'monster-1'), true);
  });

  test('survives other combatants ending their turns', () => {
    const placement = { id: 'hero-1' };
    applyTriggerReadyState(placement, {
      abilityId: 'shield-block',
      markRound: 2,
      markCombatantId: 'monster-1',
    });

    assert.equal(shouldExpireReadyTriggerAtTurnEnd(placement, 'hero-2'), false);
  });

  test('no-active-turn markers expire at the next turn end (forgot-to-start-turn rule)', () => {
    const placement = { id: 'hero-1' };
    applyTriggerReadyState(placement, {
      abilityId: 'shield-block',
      markRound: 2,
      markCombatantId: null,
    });

    assert.equal(shouldExpireReadyTriggerAtTurnEnd(placement, 'anyone'), true);
  });

  test('legacy markers without mark context expire at the next turn end', () => {
    const placement = {
      id: 'hero-1',
      hasReadyTrigger: true,
      readyTriggerAbilities: ['shield-block'],
      triggerSetAtPhase: 7,
    };

    assert.equal(shouldExpireReadyTriggerAtTurnEnd(placement, 'anyone'), true);
  });

  test('ignores placements with no ready trigger', () => {
    assert.equal(shouldExpireReadyTriggerAtTurnEnd({ id: 'hero-1' }, 'monster-1'), false);
    assert.equal(shouldExpireReadyTriggerAtTurnEnd(null, 'monster-1'), false);
  });

  test('does not expire combatant-stamped markers on a turn end with no combatant id', () => {
    const placement = { id: 'hero-1' };
    applyTriggerReadyState(placement, {
      abilityId: 'shield-block',
      markRound: 2,
      markCombatantId: 'monster-1',
    });

    assert.equal(shouldExpireReadyTriggerAtTurnEnd(placement, null), false);
  });
});
