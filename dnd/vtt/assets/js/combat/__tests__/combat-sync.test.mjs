import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createCombatDirtyFieldTracker,
  getActiveSceneCombatState,
  getCombatStateMaliceSnapshot,
  hasCombatMaliceValue,
  haveCombatGroupsChanged,
  prepareCombatSnapshotForSync,
  shouldApplyRemoteCombatState,
  shouldProtectLocalCombatIntent,
} from '../combat-sync.js';

describe('combat sync scene selection', () => {
  test('returns combat state for the active scene key', () => {
    const result = getActiveSceneCombatState({
      boardState: {
        activeSceneId: ' scene-a ',
        placements: {
          'scene-a': [{ id: 'ally-1', team: 'ally' }],
        },
        sceneState: {
          'scene-a': {
            combat: { active: true, sequence: 4 },
          },
        },
      },
      scenes: { items: [{ id: 'scene-a' }] },
    });

    assert.equal(result.activeSceneId, 'scene-a');
    assert.deepEqual(result.combatState, { active: true, sequence: 4 });
  });

  test('returns an empty combat object when there is no active scene', () => {
    assert.deepEqual(getActiveSceneCombatState({ boardState: {} }), {
      activeSceneId: '',
      combatState: {},
    });
  });

  test('follows the canonical active encounter when player map routing differs', () => {
    const result = getActiveSceneCombatState({
      boardState: {
        activeSceneId: 'player-map',
        placements: {
          'player-map': [{ id: 'viewer-1' }],
          'gm-encounter': [{ id: 'enemy-1', team: 'enemy' }],
        },
        sceneState: {
          'player-map': { combat: { active: false } },
          'gm-encounter': {
            combat: { active: true, encounterId: 'enc-1', sequence: 8 },
          },
        },
      },
      scenes: { items: [{ id: 'player-map' }, { id: 'gm-encounter' }] },
    });

    assert.equal(result.activeSceneId, 'gm-encounter');
    assert.equal(result.combatState.encounterId, 'enc-1');
  });

  test('finds active combat even when player map display is disabled', () => {
    const result = getActiveSceneCombatState({
      boardState: {
        activeSceneId: null,
        placements: {
          'gm-encounter': [{ id: 'ally-1', team: 'ally' }],
        },
        sceneState: {
          'gm-encounter': {
            combat: { active: true, sequence: 3 },
          },
        },
      },
      scenes: { items: [{ id: 'gm-encounter' }] },
    });

    assert.equal(result.activeSceneId, 'gm-encounter');
    assert.equal(result.combatState.active, true);
  });

  test('prefers an active routed scene over other active registered scenes', () => {
    const result = getActiveSceneCombatState({
      scenes: { items: [{ id: 'routed' }, { id: 'newer' }] },
      boardState: {
        activeSceneId: 'routed',
        placements: {
          routed: [{ id: 'ally-1' }],
          newer: [{ id: 'enemy-1' }],
        },
        sceneState: {
          routed: { combat: { active: true, sequence: 2, updatedAt: 20 } },
          newer: { combat: { active: true, sequence: 50, updatedAt: 500 } },
        },
      },
    });

    assert.equal(result.activeSceneId, 'routed');
    assert.equal(result.combatState.sequence, 2);
  });

  test('ignores active records for deleted scenes and empty registered scenes', () => {
    const result = getActiveSceneCombatState({
      scenes: { items: [{ id: 'routed' }, { id: 'empty' }, { id: 'valid' }] },
      boardState: {
        activeSceneId: 'routed',
        placements: {
          valid: [{ id: 'ally-1', team: 'ally' }],
          empty: [],
          deleted: [{ id: 'ancient-enemy' }],
        },
        sceneState: {
          deleted: {
            combat: { active: true, sequence: 999, updatedAt: 9999 },
          },
          empty: {
            combat: { active: true, sequence: 500, updatedAt: 5000 },
          },
          routed: { combat: { active: false, sequence: 40 } },
          valid: {
            combat: { active: true, sequence: 41, updatedAt: 4100 },
          },
        },
      },
    });

    assert.equal(result.activeSceneId, 'valid');
    assert.equal(result.combatState.sequence, 41);
  });

  test('uses deterministic freshness rather than sceneState insertion order', () => {
    const base = {
      scenes: { items: [{ id: 'older' }, { id: 'newer' }, { id: 'tie-a' }, { id: 'tie-b' }] },
      boardState: {
        activeSceneId: 'inactive-route',
        placements: {
          older: [{ id: 'older-token' }],
          newer: [{ id: 'newer-token' }],
          'tie-a': [{ id: 'tie-a-token' }],
          'tie-b': [{ id: 'tie-b-token' }],
        },
        sceneState: {
          older: { combat: { active: true, sequence: 20, updatedAt: 9000 } },
          'tie-b': { combat: { active: true, sequence: 21, updatedAt: 8000 } },
          newer: { combat: { active: true, sequence: 21, updatedAt: 8500 } },
          'tie-a': { combat: { active: true, sequence: 21, updatedAt: 8000 } },
        },
      },
    };

    assert.equal(getActiveSceneCombatState(base).activeSceneId, 'newer');

    base.boardState.sceneState.newer.combat.updatedAt = 8000;
    assert.equal(getActiveSceneCombatState(base).activeSceneId, 'newer');

    delete base.boardState.sceneState.newer;
    assert.equal(getActiveSceneCombatState(base).activeSceneId, 'tie-a');
  });

  test('does not resurrect an unregistered active record when routed scene is inactive', () => {
    const result = getActiveSceneCombatState({
      scenes: { items: [{ id: 'current' }] },
      boardState: {
        activeSceneId: 'current',
        placements: {
          deleted: [{ id: 'ghost' }],
        },
        sceneState: {
          current: { combat: { active: false, sequence: 10 } },
          deleted: { combat: { active: true, sequence: 11 } },
        },
      },
    });

    assert.equal(result.activeSceneId, 'current');
    assert.equal(result.combatState.active, false);
  });

  test('long reload sequence never falls back to ancient deleted active records', () => {
    const state = {
      scenes: { items: [{ id: 'current-map' }, { id: 'encounter' }] },
      boardState: {
        activeSceneId: 'current-map',
        placements: {
          encounter: [{ id: 'ally-1' }, { id: 'enemy-1' }],
          'deleted-october': [{ id: 'missing-active-combatant' }],
        },
        sceneState: {
          'deleted-october': {
            combat: {
              active: true,
              activeCombatantId: 'missing-active-combatant',
              sequence: 900,
              updatedAt: 1750000000000,
            },
          },
          'current-map': { combat: { active: false, sequence: 101 } },
          encounter: {
            combat: {
              active: true,
              activeCombatantId: 'ally-1',
              sequence: 102,
              updatedAt: 1760000000000,
            },
          },
        },
      },
    };

    for (let reload = 0; reload < 250; reload += 1) {
      const roundTripped = JSON.parse(JSON.stringify(state));
      const result = getActiveSceneCombatState(roundTripped);
      assert.equal(result.activeSceneId, 'encounter');
      assert.equal(result.combatState.activeCombatantId, 'ally-1');
    }
  });
});

describe('combat sync freshness checks', () => {
  test('initial load applies even when versions match', () => {
    assert.equal(
      shouldApplyRemoteCombatState(
        { sequence: 0, updatedAt: 0, groups: [] },
        { currentVersion: 0, currentUpdatedAt: 0, currentGroups: new Map() }
      ),
      true
    );
  });

  test('newer remote combat state applies', () => {
    assert.equal(
      shouldApplyRemoteCombatState(
        { sequence: 12, updatedAt: 1000, groups: [] },
        { currentVersion: 11, currentUpdatedAt: 999, currentGroups: new Map() }
      ),
      true
    );
  });

  test('stale remote combat state is skipped when groups are unchanged', () => {
    const currentGroups = new Map([
      ['leader', new Set(['leader', 'member'])],
    ]);

    assert.equal(
      shouldApplyRemoteCombatState(
        {
          sequence: 10,
          updatedAt: 1000,
          groups: [{ representativeId: 'leader', memberIds: ['leader', 'member'] }],
        },
        { currentVersion: 11, currentUpdatedAt: 2000, currentGroups }
      ),
      false
    );
  });

  test('group changes apply even when combat version is unchanged', () => {
    const currentGroups = new Map([
      ['leader', new Set(['leader'])],
    ]);

    assert.equal(
      shouldApplyRemoteCombatState(
        {
          sequence: 11,
          updatedAt: 1000,
          groups: [{ representativeId: 'leader', memberIds: ['leader', 'member'] }],
        },
        { currentVersion: 11, currentUpdatedAt: 2000, currentGroups }
      ),
      true
    );
  });
});

describe('combat sync helpers', () => {
  test('tracks dirty combat fields without exposing mutable state', () => {
    const tracker = createCombatDirtyFieldTracker([' malice ', '', 42, 'groups']);

    assert.equal(tracker.size, 2);
    assert.equal(tracker.has('malice'), true);
    assert.equal(tracker.has('turnLock'), false);

    tracker.mark('turnLock');
    tracker.mark('turnLock');

    assert.deepEqual(tracker.snapshot(), ['malice', 'groups', 'turnLock']);
    assert.equal(tracker.size, 3);

    const snapshot = tracker.snapshot();
    snapshot.push('completedCombatantIds');

    assert.equal(tracker.has('completedCombatantIds'), false);

    tracker.clear();
    assert.equal(tracker.size, 0);
  });

  test('detects malice and legacy maliceCount fields', () => {
    assert.equal(hasCombatMaliceValue({ malice: 0 }), true);
    assert.equal(hasCombatMaliceValue({ maliceCount: 2 }), true);
    assert.equal(hasCombatMaliceValue({}), false);
  });

  test('compares normalized groups against the live tracker map', () => {
    const currentGroups = new Map([
      ['leader', new Set(['leader', 'member'])],
    ]);

    assert.equal(
      haveCombatGroupsChanged(
        [{ representativeId: 'leader', memberIds: ['leader', 'member'] }],
        currentGroups
      ),
      false
    );
    assert.equal(
      haveCombatGroupsChanged(
        [{ representativeId: 'leader', memberIds: ['leader', 'member', 'other'] }],
        currentGroups
      ),
      true
    );
  });

  test('reads non-GM fallback malice from the last serialized snapshot', () => {
    assert.equal(getCombatStateMaliceSnapshot('{"malice": 3.8}'), 3);
    assert.equal(getCombatStateMaliceSnapshot('{"malice": "nope"}'), null);
    assert.equal(getCombatStateMaliceSnapshot('not json'), null);
  });

  test('protects a fresh GM start intent from stale inactive snapshots', () => {
    assert.equal(
      shouldProtectLocalCombatIntent(
        { active: false, round: 0, activeCombatantId: null, sequence: 1, updatedAt: 1000 },
        {
          intent: {
            activeSceneId: 'scene-a',
            active: true,
            round: 1,
            activeCombatantId: null,
            startingTeam: 'ally',
            currentTeam: 'ally',
            lastTeam: null,
            recordedAt: 5000,
          },
          activeSceneId: 'scene-a',
          currentVersion: 2,
          currentUpdatedAt: 2000,
          now: 5500,
        }
      ),
      true
    );
  });

  test('protects GM end intent while a save is pending even when incoming version is newer', () => {
    assert.equal(
      shouldProtectLocalCombatIntent(
        { active: true, round: 3, activeCombatantId: 'enemy-1', sequence: 9, updatedAt: 9000 },
        {
          intent: {
            activeSceneId: 'scene-a',
            active: false,
            round: 0,
            activeCombatantId: null,
            startingTeam: null,
            currentTeam: null,
            lastTeam: null,
            recordedAt: 10000,
          },
          activeSceneId: 'scene-a',
          currentVersion: 8,
          currentUpdatedAt: 8000,
          hasPendingSave: true,
          now: 10100,
        }
      ),
      true
    );
  });

  test('protects fresh GM turn-side intent when completed combatants differ', () => {
    assert.equal(
      shouldProtectLocalCombatIntent(
        {
          active: true,
          round: 2,
          activeCombatantId: null,
          completedCombatantIds: ['old-completed'],
          roundTurnCount: 1,
          sequence: 8,
          updatedAt: 8000,
        },
        {
          intent: {
            activeSceneId: 'scene-a',
            active: true,
            round: 2,
            activeCombatantId: null,
            completedCombatantIds: ['new-completed'],
            roundTurnCount: 2,
            recordedAt: 10000,
          },
          activeSceneId: 'scene-a',
          currentVersion: 9,
          currentUpdatedAt: 9000,
          hasPendingSave: true,
          now: 10100,
        }
      ),
      true
    );
  });

  test('does not protect matching completed combatants in different order', () => {
    assert.equal(
      shouldProtectLocalCombatIntent(
        {
          active: true,
          round: 2,
          activeCombatantId: null,
          completedCombatantIds: ['b', 'a'],
          roundTurnCount: 2,
          sequence: 8,
          updatedAt: 8000,
        },
        {
          intent: {
            activeSceneId: 'scene-a',
            active: true,
            round: 2,
            activeCombatantId: null,
            completedCombatantIds: ['a', 'b'],
            roundTurnCount: 2,
            recordedAt: 10000,
          },
          activeSceneId: 'scene-a',
          currentVersion: 9,
          currentUpdatedAt: 9000,
          hasPendingSave: true,
          now: 10100,
        }
      ),
      false
    );
  });

  test('does not protect expired or matching GM combat intents', () => {
    assert.equal(
      shouldProtectLocalCombatIntent(
        { active: false, round: 0, activeCombatantId: null, sequence: 1, updatedAt: 1000 },
        {
          intent: {
            activeSceneId: 'scene-a',
            active: false,
            round: 0,
            activeCombatantId: null,
            recordedAt: 1000,
          },
          activeSceneId: 'scene-a',
          currentVersion: 2,
          currentUpdatedAt: 2000,
          now: 1500,
        }
      ),
      false
    );

    assert.equal(
      shouldProtectLocalCombatIntent(
        { active: false, round: 0, activeCombatantId: null, sequence: 1, updatedAt: 1000 },
        {
          intent: {
            activeSceneId: 'scene-a',
            active: true,
            round: 1,
            activeCombatantId: null,
            recordedAt: 1000,
          },
          activeSceneId: 'scene-a',
          currentVersion: 2,
          currentUpdatedAt: 2000,
          now: 12000,
          maxAgeMs: 10000,
        }
      ),
      false
    );
  });

});

describe('combat sync snapshot reconciliation', () => {
  test('newer remote state updates authoritative turn fields and merges same-round completions', () => {
    const result = prepareCombatSnapshotForSync(
      {
        active: true,
        round: 2,
        activeCombatantId: 'local-active',
        completedCombatantIds: ['local-done'],
        startingTeam: 'ally',
        currentTeam: 'ally',
        lastTeam: 'enemy',
        turnPhase: 'active',
        roundTurnCount: 1,
        malice: 2,
        sequence: 4,
        updatedAt: 1000,
        turnLock: { holderId: 'local', holderName: 'Local', combatantId: 'local-active', lockedAt: 900 },
        lastEffect: null,
        groups: [{ representativeId: 'local-group', memberIds: ['local-group', 'member'] }],
      },
      {
        existingCombatState: {
          active: true,
          round: 2,
          activeCombatantId: 'remote-active',
          completedCombatantIds: ['remote-done'],
          startingTeam: 'enemy',
          currentTeam: 'enemy',
          lastTeam: 'ally',
          turnPhase: 'pick',
          roundTurnCount: 3,
          malice: 5,
          sequence: 6,
          updatedAt: 2000,
          turnLock: { holderId: 'remote', holderName: 'Remote', combatantId: 'remote-active', lockedAt: 1500 },
          lastEffect: { type: 'draw-steel', triggeredAt: 1800 },
          groups: [{ representativeId: 'remote-group', memberIds: ['remote-group', 'member'] }],
        },
        currentVersion: 5,
        currentUpdatedAt: 1500,
        dirtyFields: [],
        isGm: true,
      }
    );

    assert.equal(result.isRemoteNewer, true);
    assert.equal(result.snapshot.sequence, 7);
    assert.equal(result.snapshot.activeCombatantId, 'remote-active');
    assert.deepEqual(result.snapshot.completedCombatantIds, ['local-done', 'remote-done']);
    assert.equal(result.snapshot.currentTeam, 'enemy');
    assert.equal(result.snapshot.malice, 5);
    assert.deepEqual(result.snapshot.turnLock, {
      holderId: 'remote',
      holderName: 'Remote',
      combatantId: 'remote-active',
      lockedAt: 1500,
    });
    assert.deepEqual(result.snapshot.groups, [
      { representativeId: 'remote-group', memberIds: ['remote-group', 'member'] },
    ]);
    assert.deepEqual(result.localStatePatch.completedCombatantIds, ['local-done', 'remote-done']);
    assert.equal(result.localStatePatch.applyMalice, true);
  });

  test('round changes use remote completed combatants instead of merging prior round state', () => {
    const result = prepareCombatSnapshotForSync(
      {
        active: true,
        round: 2,
        activeCombatantId: 'local-active',
        completedCombatantIds: ['old-round-done'],
        sequence: 4,
        updatedAt: 1000,
      },
      {
        existingCombatState: {
          active: true,
          round: 3,
          activeCombatantId: null,
          completedCombatantIds: ['new-round-done'],
          sequence: 6,
          updatedAt: 2000,
        },
        currentVersion: 5,
        currentUpdatedAt: 1500,
        isGm: true,
      }
    );

    assert.deepEqual(result.snapshot.completedCombatantIds, ['new-round-done']);
    assert.deepEqual(result.localStatePatch.completedCombatantIds, ['new-round-done']);
  });

  test('dirty local fields survive newer remote reconciliation', () => {
    const result = prepareCombatSnapshotForSync(
      {
        active: true,
        round: 2,
        activeCombatantId: 'local-active',
        completedCombatantIds: ['local-done'],
        malice: 9,
        sequence: 4,
        updatedAt: 1000,
        turnLock: { holderId: 'local', holderName: 'Local', combatantId: 'local-active', lockedAt: 900 },
        groups: [{ representativeId: 'local-group', memberIds: ['local-group', 'member'] }],
      },
      {
        existingCombatState: {
          active: true,
          round: 2,
          activeCombatantId: 'remote-active',
          completedCombatantIds: ['remote-done'],
          malice: 1,
          sequence: 6,
          updatedAt: 2000,
          turnLock: { holderId: 'remote', holderName: 'Remote', combatantId: 'remote-active', lockedAt: 1500 },
          groups: [{ representativeId: 'remote-group', memberIds: ['remote-group', 'member'] }],
        },
        currentVersion: 5,
        currentUpdatedAt: 1500,
        dirtyFields: new Set(['completedCombatantIds', 'malice', 'turnLock', 'groups']),
        isGm: true,
      }
    );

    assert.deepEqual(result.snapshot.completedCombatantIds, ['local-done']);
    assert.equal(result.snapshot.malice, 9);
    assert.equal(result.snapshot.turnLock.holderId, 'local');
    assert.deepEqual(result.snapshot.groups, [
      { representativeId: 'local-group', memberIds: ['local-group', 'member'] },
    ]);
    assert.equal(result.localStatePatch.applyCompletedCombatants, false);
    assert.equal(result.localStatePatch.applyMalice, false);
    assert.equal(result.localStatePatch.applyTurnLock, false);
    assert.equal(result.localStatePatch.applyGroups, false);
  });

  test('dirty local turn effects merge with newer remote effect queue', () => {
    const result = prepareCombatSnapshotForSync(
      {
        active: true,
        round: 2,
        sequence: 4,
        updatedAt: 1000,
        lastEffects: [
          {
            type: 'token-float',
            id: 'local-float',
            placementId: 'token-a',
            amount: 6,
            mode: 'damage',
            triggeredAt: 1100,
          },
        ],
      },
      {
        existingCombatState: {
          active: true,
          round: 2,
          sequence: 6,
          updatedAt: 2000,
          lastEffects: [
            {
              type: 'token-float',
              id: 'remote-float',
              placementId: 'token-b',
              amount: 3,
              mode: 'heal',
              triggeredAt: 1900,
            },
          ],
        },
        currentVersion: 5,
        currentUpdatedAt: 1500,
        dirtyFields: new Set(['turnEffects']),
        isGm: true,
      }
    );

    assert.equal(result.isRemoteNewer, true);
    assert.deepEqual(
      result.snapshot.lastEffects.map((effect) => effect.id),
      ['remote-float', 'local-float']
    );
    assert.equal(result.snapshot.lastEffect.id, 'local-float');
    assert.equal(result.localStatePatch.applyTurnEffects, false);
  });

  test('dirty GM encounter state survives newer remote reconciliation', () => {
    const result = prepareCombatSnapshotForSync(
      {
        active: false,
        round: 0,
        activeCombatantId: null,
        completedCombatantIds: [],
        startingTeam: null,
        currentTeam: null,
        lastTeam: null,
        turnPhase: 'idle',
        roundTurnCount: 0,
        malice: 0,
        sequence: 4,
        updatedAt: 1000,
      },
      {
        existingCombatState: {
          active: true,
          round: 3,
          activeCombatantId: 'remote-active',
          completedCombatantIds: ['remote-done'],
          startingTeam: 'enemy',
          currentTeam: 'ally',
          lastTeam: 'enemy',
          turnPhase: 'active',
          roundTurnCount: 6,
          malice: 5,
          sequence: 8,
          updatedAt: 2000,
        },
        currentVersion: 7,
        currentUpdatedAt: 1500,
        dirtyFields: new Set([
          'active',
          'round',
          'activeCombatantId',
          'teams',
          'turnPhase',
          'roundTurnCount',
          'completedCombatantIds',
          'malice',
        ]),
        isGm: true,
      }
    );

    assert.equal(result.isRemoteNewer, true);
    assert.equal(result.snapshot.sequence, 9);
    assert.equal(result.snapshot.active, false);
    assert.equal(result.snapshot.round, 0);
    assert.equal(result.snapshot.activeCombatantId, null);
    assert.deepEqual(result.snapshot.completedCombatantIds, []);
    assert.equal(result.snapshot.startingTeam, null);
    assert.equal(result.snapshot.currentTeam, null);
    assert.equal(result.snapshot.lastTeam, null);
    assert.equal(result.snapshot.turnPhase, 'idle');
    assert.equal(result.snapshot.roundTurnCount, 0);
    assert.equal(result.snapshot.malice, 0);
    assert.equal(result.localStatePatch.applyActive, false);
    assert.equal(result.localStatePatch.applyRound, false);
    assert.equal(result.localStatePatch.applyActiveCombatantId, false);
    assert.equal(result.localStatePatch.applyTeams, false);
    assert.equal(result.localStatePatch.applyTurnPhase, false);
    assert.equal(result.localStatePatch.applyRoundTurnCount, false);
  });

  test('non-GM snapshots keep server malice and groups unless locally dirty', () => {
    const clean = prepareCombatSnapshotForSync(
      {
        active: true,
        round: 1,
        completedCombatantIds: [],
        malice: 7,
        sequence: 10,
        updatedAt: 1000,
        groups: [{ representativeId: 'local', memberIds: ['local', 'member'] }],
      },
      {
        existingCombatState: {
          malice: 3,
          groups: [{ representativeId: 'remote', memberIds: ['remote', 'member'] }],
          sequence: 10,
          updatedAt: 1000,
        },
        currentVersion: 10,
        currentUpdatedAt: 1000,
        isGm: false,
      }
    );

    assert.equal(clean.snapshot.malice, 3);
    assert.deepEqual(clean.snapshot.groups, [
      { representativeId: 'remote', memberIds: ['remote', 'member'] },
    ]);

    const dirty = prepareCombatSnapshotForSync(
      {
        active: true,
        round: 1,
        completedCombatantIds: [],
        malice: 7,
        sequence: 10,
        updatedAt: 1000,
        groups: [{ representativeId: 'local', memberIds: ['local', 'member'] }],
      },
      {
        existingCombatState: {
          malice: 3,
          groups: [{ representativeId: 'remote', memberIds: ['remote', 'member'] }],
          sequence: 10,
          updatedAt: 1000,
        },
        currentVersion: 10,
        currentUpdatedAt: 1000,
        dirtyFields: ['malice', 'groups'],
        isGm: false,
      }
    );

    assert.equal(dirty.snapshot.malice, 7);
    assert.deepEqual(dirty.snapshot.groups, [
      { representativeId: 'local', memberIds: ['local', 'member'] },
    ]);
  });

  test('non-GM snapshots fall back to last serialized malice when server lacks malice', () => {
    const result = prepareCombatSnapshotForSync(
      {
        active: true,
        round: 1,
        completedCombatantIds: [],
        malice: 0,
        sequence: 10,
        updatedAt: 1000,
      },
      {
        existingCombatState: {
          sequence: 10,
          updatedAt: 1000,
        },
        currentVersion: 10,
        currentUpdatedAt: 1000,
        isGm: false,
        lastCombatStateSnapshot: '{"malice":4}',
      }
    );

    assert.equal(result.snapshot.malice, 4);
  });
});
