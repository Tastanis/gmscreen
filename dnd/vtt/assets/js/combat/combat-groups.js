import { normalizeCombatGroups } from './combat-state.js';

export function applyCombatGroupsToState(state, rawGroups) {
  const { groups, representatives, missingCounts } = normalizeGroupState(state);
  const prepared = normalizeCombatGroups(rawGroups).map((group) => ({
    representativeId: group.representativeId,
    members: new Set(group.memberIds),
  }));

  let changed = groups.size !== prepared.length;

  if (!changed) {
    for (const { representativeId, members } of prepared) {
      const existing = groups.get(representativeId);
      if (!existing || existing.size !== members.size) {
        changed = true;
        break;
      }
      for (const memberId of members) {
        if (!existing.has(memberId)) {
          changed = true;
          break;
        }
      }
      if (changed) {
        break;
      }
    }
  }

  if (!changed) {
    const expectedRepresentatives = new Map();
    prepared.forEach(({ representativeId, members }) => {
      members.forEach((memberId) => {
        if (memberId !== representativeId) {
          expectedRepresentatives.set(memberId, representativeId);
        }
      });
    });

    if (representatives.size !== expectedRepresentatives.size) {
      changed = true;
    } else {
      for (const [memberId, repId] of expectedRepresentatives) {
        if (representatives.get(memberId) !== repId) {
          changed = true;
          break;
        }
      }
    }
  }

  if (!changed) {
    return false;
  }

  const preservedMissingCounts = new Map();
  const newMemberIds = new Set();
  prepared.forEach(({ members }) => {
    members.forEach((memberId) => newMemberIds.add(memberId));
  });
  missingCounts.forEach((count, tokenId) => {
    if (newMemberIds.has(tokenId)) {
      preservedMissingCounts.set(tokenId, count);
    }
  });

  groups.clear();
  representatives.clear();
  missingCounts.clear();

  prepared.forEach(({ representativeId, members }) => {
    const memberSet = new Set(members);
    groups.set(representativeId, memberSet);
    memberSet.forEach((memberId) => {
      if (memberId !== representativeId) {
        representatives.set(memberId, representativeId);
      }
    });
  });

  preservedMissingCounts.forEach((count, tokenId) => {
    missingCounts.set(tokenId, count);
  });

  return true;
}

export function pruneCombatGroupState(
  state,
  activeIds,
  { maxMissingTicks = 2 } = {}
) {
  const { groups, representatives, missingCounts } = normalizeGroupState(state);
  const activeSet = activeIds instanceof Set ? activeIds : new Set(activeIds ?? []);

  const representativesToDelete = [];
  let mutated = false;
  const resetMissingCount = (id) => {
    if (!id) {
      return;
    }
    missingCounts.delete(id);
  };

  const incrementMissingCount = (id) => {
    if (!id) {
      return 0;
    }
    const next = (missingCounts.get(id) ?? 0) + 1;
    missingCounts.set(id, next);
    return next;
  };

  groups.forEach((members, representativeId) => {
    const representativeActive = activeSet.has(representativeId);
    const representativeMissingCount = representativeActive
      ? 0
      : incrementMissingCount(representativeId);
    const representativeExpired = representativeMissingCount > maxMissingTicks;

    const filtered = new Set();

    members.forEach((memberId) => {
      if (memberId === representativeId) {
        return;
      }

      if (activeSet.has(memberId)) {
        resetMissingCount(memberId);
        filtered.add(memberId);
        return;
      }

      const missingCount = incrementMissingCount(memberId);
      if (missingCount <= maxMissingTicks) {
        filtered.add(memberId);
      } else {
        representatives.delete(memberId);
        missingCounts.delete(memberId);
        mutated = true;
      }
    });

    if (representativeActive) {
      resetMissingCount(representativeId);
      filtered.add(representativeId);
    } else if (!representativeExpired) {
      filtered.add(representativeId);
    }

    if (filtered.size <= 1 || representativeExpired) {
      filtered.forEach((memberId) => {
        if (memberId !== representativeId) {
          representatives.delete(memberId);
        }
      });
      missingCounts.delete(representativeId);
      representativesToDelete.push({
        representativeId,
        members: new Set(members),
      });
      mutated = true;
    } else {
      let changedForRep = filtered.size !== members.size;
      if (!changedForRep) {
        members.forEach((memberId) => {
          if (!filtered.has(memberId)) {
            changedForRep = true;
          }
        });
      }
      if (changedForRep) {
        groups.set(representativeId, filtered);
        mutated = true;
      }
    }
  });

  representativesToDelete.forEach(({ representativeId, members }) => {
    groups.delete(representativeId);
    missingCounts.delete(representativeId);
    members?.forEach((memberId) => missingCounts.delete(memberId));
    mutated = true;
  });

  Array.from(representatives.keys()).forEach((memberId) => {
    if (!activeSet.has(memberId)) {
      representatives.delete(memberId);
      missingCounts.delete(memberId);
      mutated = true;
    }
  });

  return mutated;
}

export function getRepresentativeIdForCombatant(combatantId, representatives) {
  if (!combatantId) {
    return null;
  }
  return representatives?.get?.(combatantId) || combatantId;
}

export function getCombatGroupMembers(groups, representativeId) {
  if (!representativeId) {
    return [];
  }
  const group = groups?.get?.(representativeId);
  if (!group || !group.size) {
    return [representativeId];
  }
  if (!group.has(representativeId)) {
    group.add(representativeId);
  }
  return Array.from(group);
}

export function getCombatGroupColorAssignments(groups, { maxColors = 7 } = {}) {
  const assignments = new Map();
  let index = 0;
  groups?.forEach?.((members, representativeId) => {
    if (!members || members.size <= 1) {
      return;
    }
    const colorIndex = (index % maxColors) + 1;
    assignments.set(representativeId, colorIndex);
    index += 1;
  });
  return assignments;
}

export function getVisibleCombatGroupMembers(groups, representativeId, visibleIds) {
  const members = getCombatGroupMembers(groups, representativeId);
  if (!visibleIds || !members.length) {
    return members;
  }
  return members.filter((memberId) => visibleIds.has(memberId));
}

export function buildCombatGroupDisplayRepresentatives(groups, visibleEntryIds) {
  const displayReps = new Map();
  if (!visibleEntryIds || !visibleEntryIds.size) {
    return displayReps;
  }

  groups?.forEach?.((members, representativeId) => {
    if (!members || members.size <= 1) {
      return;
    }
    if (visibleEntryIds.has(representativeId)) {
      return;
    }
    const visibleMembers = Array.from(members).filter((id) => visibleEntryIds.has(id));
    if (visibleMembers.length > 0) {
      displayReps.set(visibleMembers[0], representativeId);
    }
  });

  return displayReps;
}

export function removeTokenFromCombatGroups(state, tokenId) {
  if (!tokenId) {
    return false;
  }

  const { groups, representatives, missingCounts } = normalizeGroupState(state);
  let changed = false;

  if (missingCounts.delete(tokenId)) {
    changed = true;
  }

  if (groups.has(tokenId)) {
    const groupMembers = groups.get(tokenId);
    groupMembers.forEach((memberId) => {
      if (memberId !== tokenId) {
        if (representatives.delete(memberId)) {
          changed = true;
        }
        if (missingCounts.delete(memberId)) {
          changed = true;
        }
      }
    });
    groups.delete(tokenId);
    missingCounts.delete(tokenId);
    changed = true;
  }

  const representativeId = representatives.get(tokenId);
  if (!representativeId) {
    return changed;
  }

  const members = groups.get(representativeId);
  if (!members) {
    representatives.delete(tokenId);
    return true;
  }

  if (members.delete(tokenId)) {
    changed = true;
  }
  if (representatives.delete(tokenId)) {
    changed = true;
  }

  if (members.size <= 1) {
    members.forEach((memberId) => {
      if (memberId !== representativeId) {
        representatives.delete(memberId);
        missingCounts.delete(memberId);
      }
    });
    groups.delete(representativeId);
    missingCounts.delete(representativeId);
    changed = true;
  }

  return changed;
}

export function resetCombatGroupState(state) {
  const { groups, representatives, missingCounts } = normalizeGroupState(state);
  const changed = Boolean(groups.size || representatives.size || missingCounts.size);
  groups.clear();
  representatives.clear();
  missingCounts.clear();
  return changed;
}

function normalizeGroupState(state) {
  return {
    groups: state?.groups instanceof Map ? state.groups : new Map(),
    representatives: state?.representatives instanceof Map ? state.representatives : new Map(),
    missingCounts: state?.missingCounts instanceof Map ? state.missingCounts : new Map(),
  };
}
