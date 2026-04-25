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
} from '../combat-sync.js';

describe('combat sync scene selection', () => {
  test('returns combat state for the active scene key', () => {
    const result = getActiveSceneCombatState({
      boardState: {
        activeSceneId: ' scene-a ',
        sceneState: {
          'scene-a': {
            combat: { active: true, sequence: 4 },
          },
        },
      },
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
