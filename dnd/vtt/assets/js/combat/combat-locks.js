export const TURN_LOCK_STALE_TIMEOUT_MS = 10 * 60 * 1000;

export function createTurnLockState(initialLock = null) {
  const state = {
    holderId: null,
    holderName: null,
    combatantId: null,
    lockedAt: 0,
  };
  updateTurnLockState(state, initialLock);
  return state;
}

export function normalizeTurnLock(raw, { now = Date.now } = {}) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const holderId = normalizeProfileId(raw.holderId ?? raw.id ?? null);
  if (!holderId) {
    return null;
  }

  const holderName = typeof raw.holderName === 'string' && raw.holderName.trim()
    ? raw.holderName.trim()
    : holderId;
  const combatantId = typeof raw.combatantId === 'string' && raw.combatantId.trim()
    ? raw.combatantId.trim()
    : null;
  const lockedAtRaw = Number(raw.lockedAt);
  const lockedAt = Number.isFinite(lockedAtRaw)
    ? Math.max(0, Math.trunc(lockedAtRaw))
    : Math.max(0, Math.trunc(now()));

  return {
    holderId,
    holderName,
    combatantId,
    lockedAt,
  };
}

export function updateTurnLockState(state, lock, { now = Date.now } = {}) {
  if (!state || typeof state !== 'object') {
    return null;
  }

  const normalized = normalizeTurnLock(lock, { now });
  if (!normalized) {
    state.holderId = null;
    state.holderName = null;
    state.combatantId = null;
    state.lockedAt = 0;
    return null;
  }

  state.holderId = normalized.holderId;
  state.holderName = normalized.holderName;
  state.combatantId = normalized.combatantId;
  state.lockedAt = normalized.lockedAt;
  return normalized;
}

export function serializeTurnLockState(state, { now = Date.now } = {}) {
  return normalizeTurnLock(state, { now });
}

export function acquireTurnLock(
  state,
  holderId,
  holderName,
  combatantId,
  { force = false, now = Date.now } = {}
) {
  if (!state || typeof state !== 'object') {
    return {
      acquired: false,
      changed: false,
      lock: null,
    };
  }

  const normalizedId = normalizeProfileId(holderId);
  if (!normalizedId) {
    return {
      acquired: false,
      changed: false,
      lock: serializeTurnLockState(state, { now }),
    };
  }

  const existingHolder = normalizeProfileId(state.holderId);
  if (existingHolder && existingHolder !== normalizedId && !force) {
    return {
      acquired: false,
      changed: false,
      lock: serializeTurnLockState(state, { now }),
    };
  }

  const previousHolder = state.holderId;
  const previousCombatantId = state.combatantId;
  const normalizedName = typeof holderName === 'string' && holderName.trim()
    ? holderName.trim()
    : normalizedId;
  const normalizedCombatantId = typeof combatantId === 'string' && combatantId
    ? combatantId
    : null;

  state.holderId = normalizedId;
  state.holderName = normalizedName;
  state.combatantId = normalizedCombatantId;
  state.lockedAt = Math.max(0, Math.trunc(now()));

  return {
    acquired: true,
    changed: state.holderId !== previousHolder || state.combatantId !== previousCombatantId,
    lock: serializeTurnLockState(state, { now }),
  };
}

export function releaseTurnLock(
  state,
  requesterId = null,
  { isGm = false, now = Date.now } = {}
) {
  if (!state || typeof state !== 'object' || !state.holderId) {
    return {
      released: false,
      changed: false,
      previousLock: null,
      lock: null,
    };
  }

  const previousLock = serializeTurnLockState(state, { now });
  const requester = normalizeProfileId(requesterId);
  if (state.holderId !== requester && requester && !isGm) {
    return {
      released: false,
      changed: false,
      previousLock,
      lock: previousLock,
    };
  }

  clearTurnLockState(state);

  return {
    released: true,
    changed: Boolean(previousLock?.holderId),
    previousLock,
    lock: null,
  };
}

export function isTurnLockStale(
  lock,
  { now = Date.now, staleTimeoutMs = TURN_LOCK_STALE_TIMEOUT_MS } = {}
) {
  if (!lock || !lock.holderId) {
    return false;
  }

  const lockedAt = Number.isFinite(lock.lockedAt) ? lock.lockedAt : 0;
  if (lockedAt <= 0) {
    return false;
  }

  return now() - lockedAt > staleTimeoutMs;
}

export function clearStaleTurnLock(
  state,
  { now = Date.now, staleTimeoutMs = TURN_LOCK_STALE_TIMEOUT_MS } = {}
) {
  if (!isTurnLockStale(state, { now, staleTimeoutMs })) {
    return {
      cleared: false,
      changed: false,
      previousLock: null,
      staleCombatantId: null,
    };
  }

  const previousLock = serializeTurnLockState(state, { now });
  const staleCombatantId = state.combatantId;
  clearTurnLockState(state);

  return {
    cleared: true,
    changed: Boolean(previousLock?.holderId),
    previousLock,
    staleCombatantId,
  };
}

export function normalizeProfileId(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

function clearTurnLockState(state) {
  state.holderId = null;
  state.holderName = null;
  state.combatantId = null;
  state.lockedAt = 0;
}
