import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  applyCombatGroupsToState,
  buildCombatGroupDisplayRepresentatives,
  getCombatGroupColorAssignments,
  getCombatGroupMembers,
  getRepresentativeIdForCombatant,
  getVisibleCombatGroupMembers,
  pruneCombatGroupState,
  removeTokenFromCombatGroups,
  resetCombatGroupState,
} from '../combat-groups.js';

function createState() {
  return {
    groups: new Map(),
    representatives: new Map(),
    missingCounts: new Map(),
  };
}

describe('combat group state application', () => {
  test('applies normalized groups and representative lookups', () => {
    const state = createState();
    const changed = applyCombatGroupsToState(state, [
      { representativeId: 'leader', memberIds: ['leader', 'member-1', 'member-2'] },
      { representativeId: 'solo', memberIds: ['solo'] },
    ]);

    assert.equal(changed, true);
    assert.deepEqual(Array.from(state.groups.keys()), ['leader']);
    assert.deepEqual(Array.from(state.groups.get('leader')), ['leader', 'member-1', 'member-2']);
    assert.equal(getRepresentativeIdForCombatant('member-1', state.representatives), 'leader');
    assert.equal(getRepresentativeIdForCombatant('leader', state.representatives), 'leader');
  });

  test('preserves missing counts for members that remain in synced groups', () => {
    const state = createState();
    applyCombatGroupsToState(state, [
      { representativeId: 'leader', memberIds: ['leader', 'member-1', 'member-2'] },
    ]);
    state.missingCounts.set('member-1', 2);
    state.missingCounts.set('stale', 2);

    const changed = applyCombatGroupsToState(state, [
      { representativeId: 'leader', memberIds: ['leader', 'member-1', 'member-3'] },
    ]);

    assert.equal(changed, true);
    assert.equal(state.missingCounts.get('member-1'), 2);
    assert.equal(state.missingCounts.has('stale'), false);
  });

  test('returns false when incoming groups match current maps', () => {
    const state = createState();
    applyCombatGroupsToState(state, [
      { representativeId: 'leader', memberIds: ['leader', 'member-1'] },
    ]);

    assert.equal(
      applyCombatGroupsToState(state, [
        { representativeId: 'leader', memberIds: ['leader', 'member-1'] },
      ]),
      false
    );
  });
});

describe('combat group pruning', () => {
  test('keeps missing members until the max missing tick is exceeded', () => {
    const state = createState();
    applyCombatGroupsToState(state, [
      { representativeId: 'leader', memberIds: ['leader', 'member-1', 'member-2'] },
    ]);

    assert.equal(
      pruneCombatGroupState(state, new Set(['leader', 'member-1']), { maxMissingTicks: 2 }),
      true
    );
    assert.deepEqual(Array.from(state.groups.get('leader')), ['leader', 'member-1', 'member-2']);
    assert.equal(state.missingCounts.has('member-2'), false);
    assert.equal(state.representatives.has('member-2'), false);

    pruneCombatGroupState(state, new Set(['leader', 'member-1']), { maxMissingTicks: 2 });
    pruneCombatGroupState(state, new Set(['leader', 'member-1']), { maxMissingTicks: 2 });
    const changed = pruneCombatGroupState(state, new Set(['leader', 'member-1']), {
      maxMissingTicks: 2,
    });

    assert.equal(changed, true);
    assert.deepEqual(Array.from(state.groups.get('leader')), ['member-1', 'leader']);
    assert.equal(state.representatives.has('member-2'), false);
  });

  test('removes an expired missing representative and its group', () => {
    const state = createState();
    applyCombatGroupsToState(state, [
      { representativeId: 'leader', memberIds: ['leader', 'member-1'] },
    ]);

    pruneCombatGroupState(state, new Set(['member-1']), { maxMissingTicks: 1 });
    const changed = pruneCombatGroupState(state, new Set(['member-1']), { maxMissingTicks: 1 });

    assert.equal(changed, true);
    assert.equal(state.groups.has('leader'), false);
    assert.equal(state.representatives.has('member-1'), false);
  });
});

describe('combat group lookup helpers', () => {
  test('returns group members, visible members, display representatives, and colors', () => {
    const state = createState();
    applyCombatGroupsToState(state, [
      { representativeId: 'leader', memberIds: ['leader', 'member-1', 'member-2'] },
      { representativeId: 'other', memberIds: ['other', 'other-member'] },
    ]);

    assert.deepEqual(getCombatGroupMembers(state.groups, 'leader'), [
      'leader',
      'member-1',
      'member-2',
    ]);
    assert.deepEqual(getVisibleCombatGroupMembers(state.groups, 'leader', new Set(['member-2'])), [
      'member-2',
    ]);
    assert.deepEqual(
      Array.from(buildCombatGroupDisplayRepresentatives(state.groups, new Set(['member-1']))),
      [['member-1', 'leader']]
    );
    assert.deepEqual(Array.from(getCombatGroupColorAssignments(state.groups, { maxColors: 1 })), [
      ['leader', 1],
      ['other', 1],
    ]);
  });
});

describe('combat group removal and reset', () => {
  test('removes a member from its group and collapses singletons', () => {
    const state = createState();
    applyCombatGroupsToState(state, [
      { representativeId: 'leader', memberIds: ['leader', 'member-1'] },
    ]);

    assert.equal(removeTokenFromCombatGroups(state, 'member-1'), true);
    assert.equal(state.groups.has('leader'), false);
    assert.equal(state.representatives.has('member-1'), false);
  });

  test('removes a representative group and resets all maps', () => {
    const state = createState();
    applyCombatGroupsToState(state, [
      { representativeId: 'leader', memberIds: ['leader', 'member-1', 'member-2'] },
    ]);
    state.missingCounts.set('member-1', 1);

    assert.equal(removeTokenFromCombatGroups(state, 'leader'), true);
    assert.equal(state.groups.size, 0);
    assert.equal(state.representatives.size, 0);
    assert.equal(state.missingCounts.size, 0);

    applyCombatGroupsToState(state, [
      { representativeId: 'other', memberIds: ['other', 'other-member'] },
    ]);
    assert.equal(resetCombatGroupState(state), true);
    assert.equal(resetCombatGroupState(state), false);
  });
});
