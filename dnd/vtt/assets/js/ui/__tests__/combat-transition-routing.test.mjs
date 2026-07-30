import assert from 'node:assert/strict';
import test from 'node:test';

import { getCombatAutomationBoundariesForUser } from '../board-interactions.js';

test('the turn initiator receives the selected token start boundary', () => {
  assert.deepEqual(
    getCombatAutomationBoundariesForUser({
      type: 'turn.start',
      combatantId: 'sharon-token',
      interactionOwnerId: 'GM',
    }, 'gm', { isGM: true }),
    ['turn-start'],
  );
});

test('an override routes both boundaries to the overriding user', () => {
  assert.deepEqual(
    getCombatAutomationBoundariesForUser({
      type: 'turn.start',
      combatantId: 'sharon-token',
      previousCombatantId: 'enemy-token',
      interactionOwnerId: 'player-a',
      turnEndInteractionOwnerId: 'player-a',
    }, 'PLAYER-A'),
    ['turn-end', 'turn-start'],
  );
});

test('another client receives no prompt-bearing boundary', () => {
  assert.deepEqual(
    getCombatAutomationBoundariesForUser({
      type: 'turn.complete',
      combatantId: 'sharon-token',
      turnEndInteractionOwnerId: 'player-a',
    }, 'player-b'),
    [],
  );
});

test('GM-only encounter transitions remain globally deduplicated', () => {
  assert.deepEqual(
    getCombatAutomationBoundariesForUser({ type: 'round.advance' }, 'gm', { isGM: true }),
    ['transition'],
  );
  assert.deepEqual(
    getCombatAutomationBoundariesForUser({ type: 'round.advance' }, 'player-a'),
    [],
  );
});
