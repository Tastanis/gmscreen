import { isCombatStateNewer } from './combat-state.js';

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
