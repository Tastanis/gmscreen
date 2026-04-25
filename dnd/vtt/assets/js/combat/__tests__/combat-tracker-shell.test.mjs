import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  combatEffects,
  combatState,
  initializeCombatTracker,
} from '../../../../combat-tracker/assets/js/bootstrap.js';
import {
  combatService,
  createCombatService,
} from '../../../../combat-tracker/assets/js/services/combat-service.js';
import { createCombatTrackerStore } from '../../../../combat-tracker/assets/js/state/store.js';

describe('standalone combat tracker shell', () => {
  test('re-exports canonical live combat modules as namespaces', () => {
    assert.equal(combatState.TURN_PHASE.ACTIVE, 'active');
    assert.equal(combatEffects.TURN_EFFECT_TYPES.DRAW_STEEL, 'draw-steel');
  });

  test('initializes as an inactive disposable shell', () => {
    const warnings = [];
    const instance = initializeCombatTracker({
      logger: { warn: (message) => warnings.push(message) },
    });

    assert.equal(typeof instance.dispose, 'function');
    assert.equal(warnings.length, 1);
    instance.dispose();
  });

  test('service reads canonical scene combat state through injected board state', () => {
    const service = createCombatService({
      getBoardState: () => ({
        sceneState: {
          scene1: {
            combat: {
              active: true,
              activeCombatantId: 'token-1',
              completedCombatantIds: ['token-2'],
            },
          },
        },
      }),
    });

    assert.deepEqual(service.loadState('scene1'), {
      active: true,
      round: 0,
      activeCombatantId: 'token-1',
      completedCombatantIds: ['token-2'],
      startingTeam: 'ally',
      currentTeam: 'ally',
      lastTeam: 'ally',
      turnPhase: 'active',
      roundTurnCount: 0,
      malice: 0,
      updatedAt: 0,
      sequence: 0,
      turnLock: null,
      lastEffect: null,
      groups: [],
    });
  });

  test('default service has no standalone storage writer', async () => {
    await assert.rejects(
      () => combatService.saveState('scene1', { active: true }),
      /Standalone combat tracker storage is disabled/
    );
  });

  test('store normalizes canonical combat state and snapshots defensively', () => {
    const store = createCombatTrackerStore({
      active: true,
      completedCombatantIds: [' token-1 ', 'token-1'],
    });
    const first = store.getState();
    first.completedCombatantIds.push('leak');

    assert.deepEqual(store.getState().completedCombatantIds, ['token-1']);

    store.setState({ activeCombatantId: 'token-2' });
    assert.equal(store.getState().turnPhase, 'active');
  });
});
