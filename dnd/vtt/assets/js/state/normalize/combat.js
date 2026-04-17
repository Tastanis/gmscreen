import { toInt, uniqueStringList } from './helpers.js';

export function normalizeCombatStateEntry(raw = {}) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const active = Boolean(raw.active ?? raw.isActive);
  const round = Math.max(0, toInt(raw.round, 0));
  const activeCombatantId = typeof raw.activeCombatantId === 'string' ? raw.activeCombatantId.trim() : '';
  const completedCombatantIds = uniqueStringList(raw.completedCombatantIds ?? []);
  const startingTeam = normalizeCombatTeamValue(raw.startingTeam ?? raw.initialTeam ?? null);
  const currentTeam = normalizeCombatTeamValue(raw.currentTeam ?? raw.activeTeam ?? null);
  const lastTeam = normalizeCombatTeamValue(raw.lastTeam ?? raw.previousTeam ?? null);
  const roundTurnCount = Math.max(0, toInt(raw.roundTurnCount, 0));
  const malice = Math.max(0, toInt(raw.malice ?? raw.maliceCount ?? 0, 0));
  const turnLock = normalizeTurnLockEntry(raw.turnLock ?? null);
  const lastEffect = normalizeTurnEffectEntry(raw.lastEffect ?? raw.lastEvent ?? null);
  const groups = normalizeCombatGroupsEntry(
    raw.groups ?? raw.groupings ?? raw.combatGroups ?? raw.combatantGroups ?? []
  );
  const hasTimestamp = Number.isFinite(Number(raw.updatedAt));
  const hasMeaningfulState =
    active ||
    round > 0 ||
    Boolean(activeCombatantId) ||
    completedCombatantIds.length > 0 ||
    Boolean(startingTeam) ||
    Boolean(currentTeam) ||
    Boolean(lastTeam) ||
    roundTurnCount > 0 ||
    malice > 0 ||
    Boolean(turnLock) ||
    Boolean(lastEffect) ||
    groups.length > 0;

  if (!hasMeaningfulState && !hasTimestamp) {
    return null;
  }

  // Preserve the sequence counter for reliable cross-client ordering.
  // Sequence is immune to clock drift (unlike updatedAt) and is used by
  // applyCombatStateFromBoardState to decide whether incoming state is newer.
  const sequence = Math.max(0, toInt(raw.sequence, 0));

  return {
    active,
    round,
    activeCombatantId: activeCombatantId || null,
    completedCombatantIds,
    startingTeam,
    currentTeam,
    lastTeam,
    roundTurnCount,
    malice,
    updatedAt: Math.max(0, toInt(raw.updatedAt, Date.now())),
    sequence,
    turnLock,
    lastEffect,
    groups,
  };
}

export function normalizeTurnEffectEntry(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const type = typeof raw.type === 'string' ? raw.type.trim() : '';
  const combatantId = typeof raw.combatantId === 'string' ? raw.combatantId.trim() : '';
  const initiatorId = typeof raw.initiatorId === 'string' ? raw.initiatorId.trim() : '';
  const triggeredAtRaw = Number(raw.triggeredAt ?? raw.timestamp ?? raw.at);
  const triggeredAt = Number.isFinite(triggeredAtRaw) ? Math.max(0, Math.trunc(triggeredAtRaw)) : Date.now();
  const payload = raw.payload && typeof raw.payload === 'object' ? raw.payload : null;

  if (!type && !combatantId && !initiatorId && !payload) {
    return null;
  }

  const effect = { triggeredAt };
  if (type) {
    effect.type = type;
  }
  if (combatantId) {
    effect.combatantId = combatantId;
  }
  if (initiatorId) {
    effect.initiatorId = initiatorId;
  }
  if (payload) {
    effect.payload = payload;
  }

  return effect;
}

export function normalizeCombatGroupsEntry(rawGroups) {
  const source = Array.isArray(rawGroups)
    ? rawGroups
    : rawGroups && typeof rawGroups === 'object'
    ? Object.entries(rawGroups).map(([representativeId, memberIds]) => ({
        representativeId,
        memberIds: Array.isArray(memberIds) ? memberIds : [],
      }))
    : [];

  if (source.length === 0) {
    return [];
  }

  const groups = [];

  source.forEach((entry) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }

    const representativeSource =
      typeof entry.representativeId === 'string'
        ? entry.representativeId
        : typeof entry.id === 'string'
        ? entry.id
        : null;
    const representativeId = representativeSource ? representativeSource.trim() : '';
    if (!representativeId) {
      return;
    }

    const membersSource = Array.isArray(entry.memberIds)
      ? entry.memberIds
      : Array.isArray(entry.members)
      ? entry.members
      : Array.isArray(entry.ids)
      ? entry.ids
      : [];

    const normalizedMembers = [];
    membersSource.forEach((memberId) => {
      if (typeof memberId !== 'string') {
        return;
      }
      const trimmed = memberId.trim();
      if (!trimmed || normalizedMembers.includes(trimmed)) {
        return;
      }
      normalizedMembers.push(trimmed);
    });

    if (!normalizedMembers.includes(representativeId)) {
      normalizedMembers.push(representativeId);
    }

    if (normalizedMembers.length <= 1) {
      return;
    }

    groups.push({ representativeId, memberIds: normalizedMembers });
  });

  return groups;
}

export function normalizeCombatTeamValue(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'ally' || normalized === 'enemy') {
    return normalized;
  }

  return null;
}

export function normalizeTurnLockEntry(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const holderId = typeof raw.holderId === 'string' ? raw.holderId.trim().toLowerCase() : '';
  if (!holderId) {
    return null;
  }

  const holderName = typeof raw.holderName === 'string' ? raw.holderName.trim() : '';
  const combatantId = typeof raw.combatantId === 'string' ? raw.combatantId.trim() : '';

  return {
    holderId,
    holderName: holderName || holderId,
    combatantId: combatantId || null,
    lockedAt: Math.max(0, toInt(raw.lockedAt, Date.now())),
  };
}
