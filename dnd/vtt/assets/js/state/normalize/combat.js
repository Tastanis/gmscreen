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
  const encounterId = normalizeNullableString(raw.encounterId ?? raw.combatEncounterId ?? null);
  const turnLock = normalizeTurnLockEntry(raw.turnLock ?? null);
  const fallbackLastEffect = normalizeTurnEffectEntry(raw.lastEffect ?? raw.lastEvent ?? null);
  const lastEffects = normalizeTurnEffectsEntry(raw.lastEffects ?? raw.effects ?? null, fallbackLastEffect);
  const lastEffect = lastEffects.length > 0
    ? { ...lastEffects[lastEffects.length - 1] }
    : fallbackLastEffect;
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
    Boolean(encounterId) ||
    Boolean(turnLock) ||
    Boolean(lastEffect) ||
    lastEffects.length > 0 ||
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
    encounterId,
    updatedAt: Math.max(0, toInt(raw.updatedAt, Date.now())),
    sequence,
    turnLock,
    lastEffect,
    lastEffects,
    groups,
  };
}

export function normalizeTurnEffectEntry(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const type = typeof raw.type === 'string' ? raw.type.trim() : '';
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  const combatantId = typeof raw.combatantId === 'string' ? raw.combatantId.trim() : '';
  const placementId = typeof raw.placementId === 'string' ? raw.placementId.trim() : '';
  const initiatorId = typeof raw.initiatorId === 'string' ? raw.initiatorId.trim() : '';
  const text = typeof raw.text === 'string' ? raw.text.trim() : '';
  const tone = typeof raw.tone === 'string' ? raw.tone.trim().toLowerCase() : '';
  const audience = typeof raw.audience === 'string' ? raw.audience.trim().toLowerCase() : '';
  const durationMsRaw = Number(raw.durationMs);
  const triggeredAtRaw = Number(raw.triggeredAt ?? raw.timestamp ?? raw.at);
  const triggeredAt = Number.isFinite(triggeredAtRaw) ? Math.max(0, Math.trunc(triggeredAtRaw)) : Date.now();
  const payload = raw.payload && typeof raw.payload === 'object' ? raw.payload : null;
  const amountRaw = Number(raw.amount);
  const amount = Number.isFinite(amountRaw) ? Math.trunc(amountRaw) : null;
  const modeRaw = typeof raw.mode === 'string' ? raw.mode.trim().toLowerCase() : '';
  const mode = modeRaw === 'heal' ? 'heal' : modeRaw === 'damage' ? 'damage' : '';

  if (!type && !id && !combatantId && !placementId && !initiatorId && !text && !payload) {
    return null;
  }

  const effect = { triggeredAt };
  if (type) {
    effect.type = type;
  }
  if (id) {
    effect.id = id;
  }
  if (combatantId) {
    effect.combatantId = combatantId;
  }
  if (placementId) {
    effect.placementId = placementId;
  }
  if (initiatorId) {
    effect.initiatorId = initiatorId;
  }
  if (text) {
    effect.text = text;
  }
  if (tone) {
    effect.tone = tone;
  }
  if (audience) {
    effect.audience = audience;
  }
  if (Number.isFinite(durationMsRaw) && durationMsRaw > 0) {
    effect.durationMs = Math.trunc(durationMsRaw);
  }
  if (payload) {
    effect.payload = payload;
  }
  if (amount !== null) {
    effect.amount = amount;
  }
  if (mode) {
    effect.mode = mode;
  }

  return effect;
}

export function normalizeTurnEffectsEntry(rawEffects, fallbackEffect = null) {
  const source = Array.isArray(rawEffects) ? rawEffects : [];
  const effects = [];
  const seen = new Set();

  source.forEach((entry) => {
    const effect = normalizeTurnEffectEntry(entry);
    if (!effect) {
      return;
    }
    const signature = getTurnEffectEntrySignature(effect);
    if (signature && seen.has(signature)) {
      return;
    }
    if (signature) {
      seen.add(signature);
    }
    effects.push(effect);
  });

  if (effects.length === 0 && fallbackEffect) {
    const effect = normalizeTurnEffectEntry(fallbackEffect);
    if (effect) {
      effects.push(effect);
    }
  }

  return effects.slice(-12);
}

function getTurnEffectEntrySignature(effect) {
  if (!effect || typeof effect !== 'object') {
    return '';
  }
  const id = typeof effect.id === 'string' ? effect.id.trim() : '';
  if (id) {
    return `id:${id}`;
  }
  const type = typeof effect.type === 'string' ? effect.type.trim().toLowerCase() : '';
  const combatantId = typeof effect.combatantId === 'string' ? effect.combatantId.trim() : '';
  const placementId = typeof effect.placementId === 'string' ? effect.placementId.trim() : '';
  const triggeredAtRaw = Number(effect.triggeredAt);
  const triggeredAt = Number.isFinite(triggeredAtRaw) ? Math.max(0, Math.trunc(triggeredAtRaw)) : 0;
  return `${type}:${combatantId || placementId}:${triggeredAt}`;
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

function normalizeNullableString(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
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
