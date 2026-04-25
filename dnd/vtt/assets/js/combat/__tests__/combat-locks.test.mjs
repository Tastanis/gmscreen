import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  TURN_LOCK_STALE_TIMEOUT_MS,
  acquireTurnLock,
  clearStaleTurnLock,
  createTurnLockState,
  isTurnLockStale,
  normalizeTurnLock,
  releaseTurnLock,
  serializeTurnLockState,
  updateTurnLockState,
} from '../combat-locks.js';

describe('combat turn lock normalization', () => {
  test('normalizes holder identity, name, combatant, and timestamp', () => {
    assert.deepEqual(
      normalizeTurnLock({
        holderId: ' PlayerOne ',
        holderName: ' Aria ',
        combatantId: ' token-1 ',
        lockedAt: 1234.9,
      }),
      {
        holderId: 'playerone',
        holderName: 'Aria',
        combatantId: 'token-1',
        lockedAt: 1234,
      }
    );
  });

  test('invalid or missing holder normalizes to null', () => {
    assert.equal(normalizeTurnLock(null), null);
    assert.equal(normalizeTurnLock({ holderName: 'orphan' }), null);
  });

  test('serialize uses normalized holder name fallback', () => {
    const state = {
      holderId: ' PlayerOne ',
      holderName: ' ',
      combatantId: 'token-1',
      lockedAt: 3000,
    };

    assert.deepEqual(serializeTurnLockState(state), {
      holderId: 'playerone',
      holderName: 'playerone',
      combatantId: 'token-1',
      lockedAt: 3000,
    });
  });
});

describe('combat turn lock state updates', () => {
  test('createTurnLockState and updateTurnLockState mutate the live state shape', () => {
    const state = createTurnLockState({
      holderId: 'PLAYER',
      holderName: 'Player',
      combatantId: 'token-1',
      lockedAt: 1000,
    });

    assert.deepEqual(state, {
      holderId: 'player',
      holderName: 'Player',
      combatantId: 'token-1',
      lockedAt: 1000,
    });

    updateTurnLockState(state, null);

    assert.deepEqual(state, {
      holderId: null,
      holderName: null,
      combatantId: null,
      lockedAt: 0,
    });
  });

  test('acquire succeeds for empty state and reports meaningful changes', () => {
    const state = createTurnLockState();
    const result = acquireTurnLock(state, 'Player', 'Player Name', 'token-1', {
      now: () => 5000,
    });

    assert.equal(result.acquired, true);
    assert.equal(result.changed, true);
    assert.deepEqual(state, {
      holderId: 'player',
      holderName: 'Player Name',
      combatantId: 'token-1',
      lockedAt: 5000,
    });
  });

  test('acquire blocks different holders unless forced', () => {
    const state = createTurnLockState({
      holderId: 'player-a',
      holderName: 'Player A',
      combatantId: 'token-a',
      lockedAt: 1000,
    });

    const blocked = acquireTurnLock(state, 'player-b', 'Player B', 'token-b', {
      now: () => 2000,
    });
    assert.equal(blocked.acquired, false);
    assert.equal(blocked.changed, false);
    assert.equal(state.holderId, 'player-a');
    assert.equal(state.combatantId, 'token-a');

    const forced = acquireTurnLock(state, 'player-b', 'Player B', 'token-b', {
      force: true,
      now: () => 3000,
    });
    assert.equal(forced.acquired, true);
    assert.equal(forced.changed, true);
    assert.equal(state.holderId, 'player-b');
    assert.equal(state.combatantId, 'token-b');
  });

  test('release allows owner or GM and blocks other non-GM requesters', () => {
    const state = createTurnLockState({
      holderId: 'player-a',
      holderName: 'Player A',
      combatantId: 'token-a',
      lockedAt: 1000,
    });

    const blocked = releaseTurnLock(state, 'player-b', { isGm: false });
    assert.equal(blocked.released, false);
    assert.equal(state.holderId, 'player-a');

    const releasedByGm = releaseTurnLock(state, 'gm', { isGm: true });
    assert.equal(releasedByGm.released, true);
    assert.equal(releasedByGm.changed, true);
    assert.equal(state.holderId, null);

    updateTurnLockState(state, {
      holderId: 'player-a',
      holderName: 'Player A',
      combatantId: 'token-a',
      lockedAt: 1000,
    });
    const releasedByOwner = releaseTurnLock(state, 'PLAYER-A', { isGm: false });
    assert.equal(releasedByOwner.released, true);
    assert.equal(state.holderId, null);
  });
});

describe('combat turn lock staleness', () => {
  test('detects stale locks using the configured timeout', () => {
    const lock = {
      holderId: 'player',
      holderName: 'Player',
      combatantId: 'token-1',
      lockedAt: 1000,
    };

    assert.equal(
      isTurnLockStale(lock, {
        now: () => 1000 + TURN_LOCK_STALE_TIMEOUT_MS,
      }),
      false
    );
    assert.equal(
      isTurnLockStale(lock, {
        now: () => 1001 + TURN_LOCK_STALE_TIMEOUT_MS,
      }),
      true
    );
  });

  test('clearStaleTurnLock clears state and reports stale combatant id', () => {
    const state = createTurnLockState({
      holderId: 'player',
      holderName: 'Player',
      combatantId: 'token-1',
      lockedAt: 1000,
    });

    const result = clearStaleTurnLock(state, {
      now: () => 1001 + TURN_LOCK_STALE_TIMEOUT_MS,
    });

    assert.equal(result.cleared, true);
    assert.equal(result.changed, true);
    assert.equal(result.staleCombatantId, 'token-1');
    assert.deepEqual(state, {
      holderId: null,
      holderName: null,
      combatantId: null,
      lockedAt: 0,
    });
  });
});
