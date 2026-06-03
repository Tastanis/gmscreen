import {
  getCombatStateVersion,
  isCombatStateNewer,
  normalizeCombatState,
  normalizeCombatTeam,
} from './combat-state.js';

export function createCombatDirtyFieldTracker(initialFields = []) {
  const fields = new Set();
  const source =
    initialFields && typeof initialFields !== 'string' && typeof initialFields[Symbol.iterator] === 'function'
      ? Array.from(initialFields)
      : [];

  source.forEach((field) => {
    if (typeof field === 'string' && field.trim()) {
      fields.add(field.trim());
    }
  });

  return {
    mark(field) {
      if (typeof field === 'string' && field.trim()) {
        fields.add(field.trim());
      }
    },
    has(field) {
      return typeof field === 'string' && fields.has(field);
    },
    clear(targetFields = null) {
      if (
        targetFields &&
        typeof targetFields !== 'string' &&
        typeof targetFields[Symbol.iterator] === 'function'
      ) {
        Array.from(targetFields).forEach((field) => {
          if (typeof field === 'string' && field.trim()) {
            fields.delete(field.trim());
          }
        });
        return;
      }
      fields.clear();
    },
    snapshot() {
      return Array.from(fields);
    },
    get size() {
      return fields.size;
    },
  };
}

export function getActiveSceneCombatState(state = {}) {
  const boardState = state?.boardState ?? {};
  const activeSceneIdRaw = boardState.activeSceneId;
  const activeSceneId =
    typeof activeSceneIdRaw === 'string'
      ? activeSceneIdRaw
      : activeSceneIdRaw != null
      ? String(activeSceneIdRaw)
      : '';
  const activeSceneKey = activeSceneId.trim();
  if (!activeSceneKey) {
    return {
      activeSceneId: '',
      combatState: {},
    };
  }

  const sceneState =
    boardState.sceneState && typeof boardState.sceneState === 'object'
      ? boardState.sceneState
      : {};

  return {
    activeSceneId: activeSceneKey,
    combatState: sceneState[activeSceneKey]?.combat ?? {},
  };
}

export function hasCombatMaliceValue(combatState) {
  return Boolean(
    combatState &&
      typeof combatState === 'object' &&
      (Object.prototype.hasOwnProperty.call(combatState, 'malice') ||
        Object.prototype.hasOwnProperty.call(combatState, 'maliceCount'))
  );
}

export function haveCombatGroupsChanged(normalizedGroups = [], currentGroups) {
  const groups = Array.isArray(normalizedGroups) ? normalizedGroups : [];
  const currentSize =
    currentGroups && typeof currentGroups.size === 'number' ? currentGroups.size : 0;

  if (groups.length !== currentSize) {
    return true;
  }

  return groups.some((group) => {
    if (!group || typeof group !== 'object') {
      return true;
    }

    const existing = currentGroups?.get?.(group.representativeId);
    if (!existing) {
      return true;
    }

    const memberIds = Array.isArray(group.memberIds) ? group.memberIds : [];
    if (existing.size !== memberIds.length) {
      return true;
    }

    return memberIds.some((id) => !existing.has(id));
  });
}

export function shouldApplyRemoteCombatState(
  normalizedState,
  {
    currentVersion = 0,
    currentUpdatedAt = 0,
    currentGroups = null,
  } = {}
) {
  if (currentVersion === 0) {
    return true;
  }

  if (
    isCombatStateNewer(normalizedState, {
      version: currentVersion,
      updatedAt: currentUpdatedAt,
    })
  ) {
    return true;
  }

  return haveCombatGroupsChanged(normalizedState?.groups, currentGroups);
}

export function shouldProtectLocalCombatIntent(
  normalizedState,
  {
    intent = null,
    activeSceneId = '',
    currentVersion = 0,
    currentUpdatedAt = 0,
    hasPendingSave = false,
    now = Date.now(),
    maxAgeMs = 10000,
  } = {}
) {
  if (!intent || !normalizedState || typeof normalizedState !== 'object') {
    return false;
  }

  if (typeof intent.activeSceneId !== 'string' || intent.activeSceneId !== activeSceneId) {
    return false;
  }

  const recordedAt = Number(intent.recordedAt ?? 0);
  if (!Number.isFinite(recordedAt) || recordedAt <= 0 || now - recordedAt > maxAgeMs) {
    return false;
  }

  const mismatchesIntent =
    Boolean(normalizedState.active) !== Boolean(intent.active) ||
    Number(normalizedState.round ?? 0) !== Number(intent.round ?? 0) ||
    normalizeNullableTeam(normalizedState.startingTeam) !== normalizeNullableTeam(intent.startingTeam) ||
    normalizeNullableTeam(normalizedState.currentTeam) !== normalizeNullableTeam(intent.currentTeam) ||
    normalizeNullableTeam(normalizedState.lastTeam) !== normalizeNullableTeam(intent.lastTeam) ||
    normalizeNullableId(normalizedState.encounterId) !== normalizeNullableId(intent.encounterId) ||
    normalizeNullableId(normalizedState.activeCombatantId) !== normalizeNullableId(intent.activeCombatantId);

  if (!mismatchesIntent) {
    return false;
  }

  if (hasPendingSave) {
    return true;
  }

  return !isCombatStateNewer(normalizedState, {
    version: currentVersion,
    updatedAt: currentUpdatedAt,
  });
}

export function getCombatStateMaliceSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'string') {
    return null;
  }

  try {
    const parsed = JSON.parse(snapshot);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    const maliceValue = Number(parsed.malice);
    return Number.isFinite(maliceValue) ? Math.max(0, Math.trunc(maliceValue)) : null;
  } catch (error) {
    return null;
  }
}

export function prepareCombatSnapshotForSync(
  snapshot,
  {
    existingCombatState = null,
    currentVersion = 0,
    currentUpdatedAt = 0,
    dirtyFields = null,
    isGm = false,
    lastCombatStateSnapshot = null,
  } = {}
) {
  const existingNormalized = normalizeCombatState(existingCombatState ?? {});
  const existingHasMaliceValue = hasCombatMaliceValue(existingCombatState);
  const existingVersion = getCombatStateVersion(existingNormalized);
  const nextSnapshot = cloneCombatSnapshot(snapshot);
  const isDirty = (field) => isCombatFieldDirty(dirtyFields, field);
  const isRemoteNewer = isCombatStateNewer(existingNormalized, {
    version: currentVersion,
    updatedAt: currentUpdatedAt,
  });

  let localStatePatch = null;

  if (isRemoteNewer) {
    const roundChanged = existingNormalized.round !== nextSnapshot.round;
    const applyActive = !isDirty('active');
    const applyRound = !isDirty('round');
    const applyActiveCombatantId = !isDirty('activeCombatantId');
    const applyTeams = !isDirty('teams');
    const applyTurnPhase = !isDirty('turnPhase');
    const applyRoundTurnCount = !isDirty('roundTurnCount');
    const applyCompletedCombatants = !isDirty('completedCombatantIds');
    const applyMalice = !isDirty('malice') && (isGm || existingHasMaliceValue);
    const applyEncounterId = !isDirty('encounterId');
    const applyTurnLock = !isDirty('turnLock');
    const applyGroups = !isDirty('groups');

    if (applyActive) {
      nextSnapshot.active = existingNormalized.active;
    }
    if (applyRound) {
      nextSnapshot.round = existingNormalized.round;
    }
    if (applyActiveCombatantId) {
      nextSnapshot.activeCombatantId = existingNormalized.activeCombatantId;
    }

    if (applyCompletedCombatants) {
      if (roundChanged) {
        nextSnapshot.completedCombatantIds = [...existingNormalized.completedCombatantIds];
      } else {
        nextSnapshot.completedCombatantIds = Array.from(new Set([
          ...nextSnapshot.completedCombatantIds,
          ...existingNormalized.completedCombatantIds,
        ]));
      }
    }

    if (applyTeams) {
      nextSnapshot.startingTeam = existingNormalized.startingTeam;
      nextSnapshot.currentTeam = existingNormalized.currentTeam;
      nextSnapshot.lastTeam = existingNormalized.lastTeam;
    }
    if (applyTurnPhase) {
      nextSnapshot.turnPhase = existingNormalized.turnPhase;
    }
    if (applyRoundTurnCount) {
      nextSnapshot.roundTurnCount = existingNormalized.roundTurnCount;
    }

    if (!isDirty('malice')) {
      nextSnapshot.malice = existingNormalized.malice;
    }
    if (applyEncounterId) {
      nextSnapshot.encounterId = existingNormalized.encounterId;
    }
    if (applyTurnLock) {
      nextSnapshot.turnLock = cloneNullableObject(existingNormalized.turnLock);
    }

    nextSnapshot.lastEffect = cloneNullableObject(existingNormalized.lastEffect);

    if (applyGroups) {
      nextSnapshot.groups = cloneCombatGroups(existingNormalized.groups);
    }

    if (existingNormalized.sequence > nextSnapshot.sequence) {
      nextSnapshot.sequence = existingNormalized.sequence + 1;
    }

    localStatePatch = {
      active: nextSnapshot.active,
      round: nextSnapshot.round,
      activeCombatantId: nextSnapshot.activeCombatantId,
      completedCombatantIds: [...nextSnapshot.completedCombatantIds],
      startingTeam: nextSnapshot.startingTeam,
      currentTeam: nextSnapshot.currentTeam,
      lastTeam: nextSnapshot.lastTeam,
      turnPhase: nextSnapshot.turnPhase,
      roundTurnCount: nextSnapshot.roundTurnCount,
      malice: nextSnapshot.malice,
      encounterId: nextSnapshot.encounterId,
      turnLock: cloneNullableObject(nextSnapshot.turnLock),
      groups: cloneCombatGroups(nextSnapshot.groups),
      existingVersion,
      existingUpdatedAt: existingNormalized.updatedAt,
      applyActive,
      applyRound,
      applyActiveCombatantId,
      applyTeams,
      applyTurnPhase,
      applyRoundTurnCount,
      applyCompletedCombatants,
      applyMalice,
      applyEncounterId,
      applyTurnLock,
      applyGroups,
    };
  }

  if (!isGm) {
    if (!isDirty('malice')) {
      if (existingHasMaliceValue) {
        nextSnapshot.malice = existingNormalized.malice;
      } else {
        const fallbackMalice = getCombatStateMaliceSnapshot(lastCombatStateSnapshot);
        if (fallbackMalice !== null) {
          nextSnapshot.malice = fallbackMalice;
        }
      }
    }
    if (!isDirty('groups')) {
      nextSnapshot.groups = cloneCombatGroups(existingNormalized.groups);
    }
    if (!isDirty('encounterId')) {
      nextSnapshot.encounterId = existingNormalized.encounterId;
    }
  }

  return {
    snapshot: nextSnapshot,
    existingNormalized,
    existingVersion,
    existingHasMaliceValue,
    isRemoteNewer,
    localStatePatch,
  };
}

function isCombatFieldDirty(dirtyFields, field) {
  if (typeof field !== 'string' || !field) {
    return false;
  }

  if (typeof dirtyFields === 'function') {
    return Boolean(dirtyFields(field));
  }

  if (dirtyFields && typeof dirtyFields.has === 'function') {
    return Boolean(dirtyFields.has(field));
  }

  if (
    dirtyFields &&
    typeof dirtyFields !== 'string' &&
    typeof dirtyFields[Symbol.iterator] === 'function'
  ) {
    return Array.from(dirtyFields).includes(field);
  }

  return false;
}

function normalizeNullableTeam(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  return normalizeCombatTeam(value);
}

function normalizeNullableId(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function cloneCombatSnapshot(snapshot) {
  const source = snapshot && typeof snapshot === 'object' ? snapshot : {};
  return {
    ...source,
    completedCombatantIds: Array.isArray(source.completedCombatantIds)
      ? [...source.completedCombatantIds]
      : [],
    turnLock: cloneNullableObject(source.turnLock),
    lastEffect: cloneNullableObject(source.lastEffect),
    groups: cloneCombatGroups(source.groups),
  };
}

function cloneCombatGroups(groups) {
  return Array.isArray(groups)
    ? groups.map((group) => ({
        representativeId: group?.representativeId,
        memberIds: Array.isArray(group?.memberIds) ? [...group.memberIds] : [],
      }))
    : [];
}

function cloneNullableObject(value) {
  return value && typeof value === 'object' ? { ...value } : null;
}
