import { normalizeTurnLock } from './combat-locks.js';
export { normalizeTurnLock } from './combat-locks.js';

export const TURN_PHASE = Object.freeze({
  IDLE: 'idle',
  PICK: 'pick',
  ACTIVE: 'active',
});

const VALID_TURN_PHASES = new Set(Object.values(TURN_PHASE));
export const MAX_TURN_EFFECT_HISTORY = 12;

export function normalizeCombatState(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const active = Boolean(source.active ?? source.isActive ?? false);
  const round = Math.max(0, toNonNegativeNumber(source.round ?? 0));
  const activeCombatantId =
    typeof source.activeCombatantId === 'string' ? source.activeCombatantId.trim() : '';
  const completedSource = Array.isArray(source.completedCombatantIds)
    ? source.completedCombatantIds
    : [];
  const completedCombatantIds = uniqueStringList(completedSource);
  const startingTeam = normalizeCombatTeam(source.startingTeam ?? source.initialTeam ?? null);
  const currentTeam = normalizeCombatTeam(source.currentTeam ?? source.activeTeam ?? null);
  const lastTeam = normalizeCombatTeam(source.lastTeam ?? source.previousTeam ?? null);
  const turnPhase = normalizeTurnPhase(source.turnPhase ?? source.phase ?? null, active, activeCombatantId);
  const roundTurnCount = Math.max(0, toNonNegativeNumber(source.roundTurnCount ?? 0));
  const malice = Math.max(0, toNonNegativeNumber(source.malice ?? source.maliceCount ?? 0));
  const encounterId = normalizeNullableString(
    source.encounterId ?? source.combatEncounterId ?? source.id ?? null
  );
  const updatedAtRaw = Number(source.updatedAt);
  const updatedAt = Number.isFinite(updatedAtRaw) ? Math.max(0, Math.trunc(updatedAtRaw)) : 0;
  const sequenceRaw = Number(source.sequence ?? source.seq ?? 0);
  const sequence = Number.isFinite(sequenceRaw) ? Math.max(0, Math.trunc(sequenceRaw)) : 0;
  const turnLock = normalizeTurnLock(source.turnLock ?? null);
  const fallbackLastEffect = normalizeTurnEffect(source.lastEffect ?? source.lastEvent ?? null);
  const lastEffects = normalizeTurnEffects(source.lastEffects ?? source.effects ?? null, fallbackLastEffect);
  const lastEffect = lastEffects.length > 0
    ? { ...lastEffects[lastEffects.length - 1] }
    : fallbackLastEffect;
  const groups = normalizeCombatGroups(
    source.groups ?? source.groupings ?? source.combatGroups ?? source.combatantGroups ?? null
  );

  return {
    active,
    round,
    activeCombatantId: activeCombatantId || null,
    completedCombatantIds,
    startingTeam,
    currentTeam,
    lastTeam,
    turnPhase,
    roundTurnCount,
    malice,
    encounterId,
    updatedAt,
    sequence,
    turnLock,
    lastEffect,
    lastEffects,
    groups,
  };
}

export function createCombatStateSnapshot({
  active = false,
  round = 0,
  activeCombatantId = null,
  completedCombatantIds = [],
  startingTeam = null,
  currentTeam = null,
  lastTeam = null,
  turnPhase = null,
  roundTurnCount = 0,
  malice = 0,
  encounterId = null,
  sequence = 0,
  turnLock = null,
  lastEffect = null,
  lastEffects = [],
  groups = [],
  updatedAt = Date.now(),
} = {}) {
  const normalizedActiveCombatantId =
    typeof activeCombatantId === 'string' && activeCombatantId ? activeCombatantId : null;
  const timestampRaw = Number(updatedAt);
  const timestamp = Number.isFinite(timestampRaw) ? Math.max(0, Math.trunc(timestampRaw)) : Date.now();
  const nextSequence = toNonNegativeNumber(sequence, 0) + 1;
  const normalizedLastEffects = normalizeTurnEffects(lastEffects, lastEffect);
  const effectSnapshot = normalizedLastEffects.length > 0
    ? { ...normalizedLastEffects[normalizedLastEffects.length - 1] }
    : lastEffect && typeof lastEffect === 'object'
    ? { ...lastEffect }
    : null;

  return {
    active: Boolean(active),
    round: toNonNegativeNumber(round, 0),
    activeCombatantId: normalizedActiveCombatantId,
    completedCombatantIds: uniqueStringList(completedCombatantIds),
    startingTeam: normalizeCombatTeam(startingTeam),
    currentTeam: normalizeCombatTeam(currentTeam),
    lastTeam: normalizeCombatTeam(lastTeam),
    turnPhase: normalizeTurnPhase(turnPhase, Boolean(active), normalizedActiveCombatantId),
    roundTurnCount: toNonNegativeNumber(roundTurnCount, 0),
    malice: toNonNegativeNumber(malice, 0),
    encounterId: normalizeNullableString(encounterId),
    updatedAt: timestamp,
    sequence: nextSequence,
    turnLock: normalizeTurnLock(turnLock),
    lastEffect: effectSnapshot,
    lastEffects: normalizedLastEffects,
    groups: normalizeCombatGroups(groups),
  };
}

export function getCombatStateVersion(state = {}) {
  const source = state && typeof state === 'object' ? state : {};
  const sequence = toNonNegativeNumber(source.sequence ?? 0, 0);
  if (sequence > 0) {
    return sequence;
  }
  return toNonNegativeNumber(source.updatedAt ?? 0, 0);
}

export function isCombatStateNewer(incoming = {}, current = {}) {
  const source = incoming && typeof incoming === 'object' ? incoming : {};
  const currentSource = current && typeof current === 'object' ? current : {};
  const sequence = toNonNegativeNumber(source.sequence ?? 0, 0);
  const updatedAt = toNonNegativeNumber(source.updatedAt ?? 0, 0);
  const currentVersion = toNonNegativeNumber(
    currentSource.version ?? currentSource.sequence ?? 0,
    0
  );
  const currentUpdatedAt = toNonNegativeNumber(currentSource.updatedAt ?? 0, 0);

  if (sequence > 0) {
    return (
      sequence > currentVersion ||
      (sequence === currentVersion && updatedAt > 0 && updatedAt > currentUpdatedAt)
    );
  }

  return updatedAt > 0 && updatedAt > currentUpdatedAt;
}

export function normalizeCombatTeam(value) {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (raw === 'ally') {
    return 'ally';
  }
  if (raw === 'enemy') {
    return 'enemy';
  }
  return null;
}

export function normalizeTurnPhase(value, active = false, activeCombatantId = '') {
  if (typeof value === 'string' && VALID_TURN_PHASES.has(value)) {
    return value;
  }
  return getTurnPhase({ active, activeCombatantId });
}

export function getTurnPhase({ active = false, activeCombatantId = '' } = {}) {
  if (!active) {
    return TURN_PHASE.IDLE;
  }
  if (activeCombatantId) {
    return TURN_PHASE.ACTIVE;
  }
  return TURN_PHASE.PICK;
}

export function normalizeCombatGroups(rawGroups) {
  const source = Array.isArray(rawGroups)
    ? rawGroups
    : rawGroups && typeof rawGroups === 'object'
    ? Object.entries(rawGroups).map(([representativeId, memberIds]) => ({
        representativeId,
        memberIds: Array.isArray(memberIds) ? memberIds : [],
      }))
    : [];

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

    const normalizedMembers = membersSource
      .map((memberId) => (typeof memberId === 'string' ? memberId.trim() : ''))
      .filter((memberId) => memberId.length > 0);

    if (!normalizedMembers.includes(representativeId)) {
      normalizedMembers.push(representativeId);
    }

    const uniqueMembers = Array.from(new Set(normalizedMembers));
    if (uniqueMembers.length <= 1) {
      return;
    }

    groups.push({ representativeId, memberIds: uniqueMembers });
  });

  return groups;
}

export function serializeCombatGroups(combatTrackerGroups) {
  if (!combatTrackerGroups || !combatTrackerGroups.size || typeof combatTrackerGroups.forEach !== 'function') {
    return [];
  }

  const entries = [];
  combatTrackerGroups.forEach((members, representativeId) => {
    if (typeof representativeId !== 'string' || representativeId.trim() === '') {
      return;
    }

    const normalizedRep = representativeId.trim();
    const memberSource =
      members && typeof members !== 'string' && typeof members[Symbol.iterator] === 'function'
        ? Array.from(members)
        : [];
    const normalizedMembers = memberSource
      .filter((id) => typeof id === 'string' && id.trim() !== '')
      .map((id) => id.trim());

    if (!normalizedMembers.includes(normalizedRep)) {
      normalizedMembers.push(normalizedRep);
    }

    const uniqueMembers = Array.from(new Set(normalizedMembers));
    if (uniqueMembers.length <= 1) {
      return;
    }

    entries.push({ representativeId: normalizedRep, memberIds: uniqueMembers });
  });

  return entries;
}

export function normalizeTurnEffect(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const typeRaw = typeof raw.type === 'string' ? raw.type.trim().toLowerCase() : '';
  if (!typeRaw) {
    return null;
  }

  const combatantId = typeof raw.combatantId === 'string' ? raw.combatantId.trim() : '';
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  const placementId = typeof raw.placementId === 'string' ? raw.placementId.trim() : '';
  const triggeredAtSource =
    raw.triggeredAt ?? raw.timestamp ?? raw.updatedAt ?? raw.time ?? raw.occurredAt ?? null;
  const triggeredAtRaw = Number(triggeredAtSource);
  const triggeredAt = Number.isFinite(triggeredAtRaw)
    ? Math.max(0, Math.trunc(triggeredAtRaw))
    : Date.now();
  const initiatorId = normalizeProfileId(raw.initiatorId ?? raw.profileId ?? null);

  const effect = {
    type: typeRaw,
    triggeredAt,
  };

  const text = typeof raw.text === 'string' ? raw.text.trim() : '';
  const tone = typeof raw.tone === 'string' ? raw.tone.trim().toLowerCase() : '';
  const audience = typeof raw.audience === 'string' ? raw.audience.trim().toLowerCase() : '';
  const durationMsRaw = Number(raw.durationMs);
  const amountRaw = Number(raw.amount);
  const amount = Number.isFinite(amountRaw) ? Math.trunc(amountRaw) : null;
  const modeRaw = typeof raw.mode === 'string' ? raw.mode.trim().toLowerCase() : '';
  const mode = modeRaw === 'heal' ? 'heal' : modeRaw === 'damage' ? 'damage' : '';

  if (combatantId) {
    effect.combatantId = combatantId;
  }

  if (id) {
    effect.id = id;
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

  if (amount !== null) {
    effect.amount = amount;
  }

  if (mode) {
    effect.mode = mode;
  }

  return effect;
}

export function normalizeTurnEffects(rawEffects, fallbackEffect = null) {
  const source = Array.isArray(rawEffects) ? rawEffects : [];
  const normalized = [];
  const seen = new Set();

  source.forEach((entry) => {
    const effect = normalizeTurnEffect(entry);
    if (!effect) {
      return;
    }
    const signature = getTurnEffectIdentity(effect);
    if (signature && seen.has(signature)) {
      return;
    }
    if (signature) {
      seen.add(signature);
    }
    normalized.push(effect);
  });

  if (normalized.length === 0 && fallbackEffect) {
    const effect = normalizeTurnEffect(fallbackEffect);
    if (effect) {
      normalized.push(effect);
    }
  }

  return normalized.slice(-MAX_TURN_EFFECT_HISTORY);
}

export function mergeTurnEffects(...effectGroups) {
  const merged = [];
  const seen = new Set();

  effectGroups.forEach((group) => {
    normalizeTurnEffects(group).forEach((effect) => {
      const signature = getTurnEffectIdentity(effect);
      if (signature && seen.has(signature)) {
        return;
      }
      if (signature) {
        seen.add(signature);
      }
      merged.push(effect);
    });
  });

  return merged.slice(-MAX_TURN_EFFECT_HISTORY);
}

function getTurnEffectIdentity(effect) {
  if (!effect || typeof effect !== 'object') {
    return '';
  }
  if (typeof effect.id === 'string' && effect.id.trim()) {
    return `id:${effect.id.trim()}`;
  }
  const type = typeof effect.type === 'string' ? effect.type.trim().toLowerCase() : '';
  const combatantId = typeof effect.combatantId === 'string' ? effect.combatantId.trim() : '';
  const placementId = typeof effect.placementId === 'string' ? effect.placementId.trim() : '';
  const triggeredAtRaw = Number(effect.triggeredAt);
  const triggeredAt = Number.isFinite(triggeredAtRaw) ? Math.max(0, Math.trunc(triggeredAtRaw)) : 0;
  return `${type}:${combatantId || placementId}:${triggeredAt}`;
}

function normalizeProfileId(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

function normalizeNullableString(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
}

function uniqueStringList(values) {
  const source =
    values && typeof values !== 'string' && typeof values[Symbol.iterator] === 'function'
      ? Array.from(values)
      : [];
  const seen = new Set();
  const result = [];

  source.forEach((value) => {
    if (typeof value !== 'string') {
      return;
    }

    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) {
      return;
    }

    seen.add(trimmed);
    result.push(trimmed);
  });

  return result;
}

function toNonNegativeNumber(value, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value));
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isFinite(parsed)) {
    return Math.max(0, parsed);
  }

  return Math.max(0, Math.trunc(fallback));
}
