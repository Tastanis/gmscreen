import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  TURN_PHASE,
  createCombatStateSnapshot,
  getCombatStateVersion,
  isCombatStateNewer,
  normalizeCombatGroups,
  normalizeCombatState,
  normalizeCombatTeam,
  normalizeTurnEffect,
  serializeCombatGroups,
} from '../combat-state.js';

describe('combat state freshness', () => {
  test('newer sequence wins', () => {
    assert.equal(
      isCombatStateNewer({ sequence: 8, updatedAt: 1000 }, { version: 7, updatedAt: 999 }),
      true
    );
  });

  test('older sequence loses', () => {
    assert.equal(
      isCombatStateNewer({ sequence: 6, updatedAt: 5000 }, { version: 7, updatedAt: 1000 }),
      false
    );
  });

  test('equal sequence uses newer updatedAt', () => {
    assert.equal(
      isCombatStateNewer({ sequence: 7, updatedAt: 2000 }, { version: 7, updatedAt: 1000 }),
      true
    );
    assert.equal(
      isCombatStateNewer({ sequence: 7, updatedAt: 1000 }, { version: 7, updatedAt: 2000 }),
      false
    );
  });

  test('timestamp is used when sequence is missing', () => {
    assert.equal(
      isCombatStateNewer({ updatedAt: 3000 }, { version: 0, updatedAt: 2000 }),
      true
    );
    assert.equal(getCombatStateVersion({ updatedAt: 3000 }), 3000);
  });
});

describe('combat state normalization', () => {
  test('missing turnPhase derives from active state', () => {
    assert.equal(
      normalizeCombatState({ active: true, activeCombatantId: 'token-1' }).turnPhase,
      TURN_PHASE.ACTIVE
    );
    assert.equal(normalizeCombatState({ active: true }).turnPhase, TURN_PHASE.PICK);
    assert.equal(
      normalizeCombatState({ active: false, activeCombatantId: 'token-1' }).turnPhase,
      TURN_PHASE.IDLE
    );
  });

  test('completed combatants are trimmed and deduped', () => {
    const state = normalizeCombatState({
      completedCombatantIds: [' token-1 ', 'token-2', 'token-1', '', 42, 'token-2'],
    });

    assert.deepEqual(state.completedCombatantIds, ['token-1', 'token-2']);
  });

  test('combat team normalization preserves live board defaults', () => {
    assert.equal(normalizeCombatTeam('enemy'), 'enemy');
    assert.equal(normalizeCombatTeam('ally'), 'ally');
    assert.equal(normalizeCombatTeam(null), 'ally');
    assert.equal(normalizeCombatTeam('neutral'), 'ally');
  });
});

describe('combat group normalization', () => {
  test('groups serialize and normalize correctly', () => {
    const trackerGroups = new Map([
      [' leader ', new Set(['member-1', 'leader', 'member-1', ' member-2 '])],
      ['solo', new Set(['solo'])],
    ]);

    assert.deepEqual(serializeCombatGroups(trackerGroups), [
      { representativeId: 'leader', memberIds: ['member-1', 'leader', 'member-2'] },
    ]);

    assert.deepEqual(
      normalizeCombatGroups({
        leader: ['member-1', ' member-2 ', 'leader', 'member-1'],
        solo: ['solo'],
      }),
      [{ representativeId: 'leader', memberIds: ['member-1', 'member-2', 'leader'] }]
    );
  });
});

describe('combat snapshots', () => {
  test('snapshot increments sequence and dedupes completed combatants', () => {
    const snapshot = createCombatStateSnapshot({
      active: true,
      round: 2,
      activeCombatantId: 'token-1',
      completedCombatantIds: new Set(['token-2', 'token-2', ' token-3 ']),
      startingTeam: 'enemy',
      currentTeam: 'ally',
      lastTeam: 'enemy',
      sequence: 11,
      updatedAt: 1234,
      groups: [{ representativeId: 'leader', memberIds: ['member-1', 'leader'] }],
    });

    assert.equal(snapshot.sequence, 12);
    assert.equal(snapshot.updatedAt, 1234);
    assert.equal(snapshot.turnPhase, TURN_PHASE.ACTIVE);
    assert.deepEqual(snapshot.completedCombatantIds, ['token-2', 'token-3']);
    assert.deepEqual(snapshot.groups, [
      { representativeId: 'leader', memberIds: ['member-1', 'leader'] },
    ]);
  });
});

describe('turn effect normalization', () => {
  test('normalizes synced turn effect payloads', () => {
    assert.deepEqual(
      normalizeTurnEffect({
        type: ' Draw-Steel ',
        combatantId: ' token-1 ',
        timestamp: 4567.8,
        profileId: ' Sharon ',
      }),
      {
        type: 'draw-steel',
        combatantId: 'token-1',
        triggeredAt: 4567,
        initiatorId: 'sharon',
      }
    );
  });

  test('rejects turn effects without a type', () => {
    assert.equal(normalizeTurnEffect({ combatantId: 'token-1' }), null);
  });
});
