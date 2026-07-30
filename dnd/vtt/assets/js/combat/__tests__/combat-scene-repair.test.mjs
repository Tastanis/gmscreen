import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { getCombatSceneRepairPlan } from '../combat-sync.js';
import { applyCombatSceneRepair } from '../../../../tools/repair-orphaned-combat-state.mjs';

describe('bounded combat scene repair', () => {
  test('deactivates only orphaned, deleted, and superseded active combats', () => {
    const boardState = {
      _version: 102,
      activeSceneId: 'current',
      placements: {
        current: [{ id: 'ally-1' }],
        older: [{ id: 'enemy-1' }],
        empty: [],
        deleted: [{ id: 'ghost-1' }],
      },
      sceneState: {
        current: {
          combat: { active: true, sequence: 30, updatedAt: 3000 },
          fogOfWar: { keep: 'current' },
        },
        older: {
          combat: { active: true, sequence: 29, updatedAt: 2900 },
          customData: { keep: 'older' },
        },
        empty: {
          combat: { active: true, isActive: true, sequence: 50, activeCombatantId: 'missing' },
          drawings: [{ id: 'keep-empty-drawing' }],
        },
        deleted: {
          combat: { active: true, sequence: 100, activeCombatantId: 'ghost-1' },
          customData: { keep: true },
        },
        inactive: {
          combat: { active: false, sequence: 500 },
          customData: { untouched: true },
        },
      },
      templates: { current: [{ id: 'keep-template' }] },
    };
    const scenes = {
      items: [{ id: 'current' }, { id: 'older' }, { id: 'empty' }, { id: 'inactive' }],
    };
    const plan = getCombatSceneRepairPlan({ boardState, scenes });

    assert.equal(plan.canonicalSceneId, 'current');
    assert.deepEqual(plan.deactivations, [
      { sceneId: 'deleted', reason: 'unregistered_scene' },
      { sceneId: 'empty', reason: 'orphaned_no_placements' },
      { sceneId: 'older', reason: 'superseded_active_encounter' },
    ]);

    const repaired = applyCombatSceneRepair(boardState, scenes, plan, 123456);
    assert.equal(repaired._version, 103);
    assert.equal(repaired.sceneState.current.combat.active, true);
    assert.equal(repaired.sceneState.older.combat.active, false);
    assert.equal(repaired.sceneState.empty.combat.active, false);
    assert.equal(repaired.sceneState.empty.combat.isActive, false);
    assert.equal(repaired.sceneState.deleted.combat.active, false);
    assert.equal(repaired.sceneState.deleted.combat.activeCombatantId, null);
    assert.equal(repaired.sceneState.deleted.combat.turnPhase, 'idle');
    assert.equal(repaired.sceneState.deleted.combat.sequence, 101);
    assert.equal(repaired.sceneState.deleted.combat.updatedAt, 123456);
    assert.deepEqual(repaired.sceneState.current.fogOfWar, { keep: 'current' });
    assert.deepEqual(repaired.sceneState.older.customData, { keep: 'older' });
    assert.deepEqual(repaired.sceneState.empty.drawings, [{ id: 'keep-empty-drawing' }]);
    assert.deepEqual(repaired.sceneState.deleted.customData, { keep: true });
    assert.deepEqual(repaired.sceneState.inactive, boardState.sceneState.inactive);
    assert.deepEqual(repaired.templates, boardState.templates);
    assert.equal(boardState._version, 102);
    assert.equal(boardState.sceneState.deleted.combat.active, true);
  });

  test('is a no-op when there are no extra active encounters', () => {
    const boardState = {
      _version: 9,
      activeSceneId: 'scene-a',
      placements: { 'scene-a': [{ id: 'a' }] },
      sceneState: { 'scene-a': { combat: { active: true, sequence: 2 } } },
    };
    const scenes = { items: [{ id: 'scene-a' }] };
    const plan = getCombatSceneRepairPlan({ boardState, scenes });
    const repaired = applyCombatSceneRepair(boardState, scenes, plan, 100);

    assert.deepEqual(plan, { canonicalSceneId: 'scene-a', deactivations: [] });
    assert.deepEqual(repaired, boardState);
  });
});
