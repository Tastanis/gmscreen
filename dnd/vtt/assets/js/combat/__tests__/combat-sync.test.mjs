import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  getActiveSceneCombatState,
  getCombatStateMaliceSnapshot,
  hasCombatMaliceValue,
  haveCombatGroupsChanged,
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
