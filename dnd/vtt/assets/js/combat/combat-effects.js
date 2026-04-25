import { normalizeCombatTeam, normalizeTurnEffect } from './combat-state.js';

export const TURN_EFFECT_MAX_AGE_MS = 10000;

export const TURN_EFFECT_TYPES = Object.freeze({
  DRAW_STEEL: 'draw-steel',
  SHARON_HESITATION: 'sharon-hesitation',
});

export const SHARON_PROFILE_ID = 'sharon';

export function getTurnEffectSignature(effect) {
  if (!effect || typeof effect !== 'object') {
    return '';
  }

  const type = typeof effect.type === 'string' ? effect.type.trim().toLowerCase() : '';
  const combatantId = typeof effect.combatantId === 'string' ? effect.combatantId.trim() : '';
  const triggeredAtRaw = Number(effect.triggeredAt);
  const triggeredAt = Number.isFinite(triggeredAtRaw) ? Math.max(0, Math.trunc(triggeredAtRaw)) : 0;

  return `${type}:${combatantId}:${triggeredAt}`;
}

export function recordLocalTurnEffect(effect) {
  const normalized = normalizeTurnEffect(effect);
  if (!normalized) {
    return {
      recorded: false,
      effect: null,
      signature: '',
    };
  }

  return {
    recorded: true,
    effect: normalized,
    signature: getTurnEffectSignature(normalized),
  };
}

export function prepareSyncedTurnEffect(effect, {
  lastProcessedTurnEffectSignature = null,
  lastTurnEffectSignature = null,
  maxAgeMs = TURN_EFFECT_MAX_AGE_MS,
  now = Date.now,
} = {}) {
  const normalized = normalizeTurnEffect(effect);
  if (!normalized) {
    return {
      valid: false,
      effect: null,
      signature: '',
      shouldStore: false,
      shouldMarkProcessed: false,
      shouldDisplay: false,
      displayType: null,
      duplicate: false,
    };
  }

  const signature = getTurnEffectSignature(normalized);
  const duplicate =
    Boolean(signature) && signature === (lastProcessedTurnEffectSignature || '');

  if (duplicate) {
    return {
      valid: true,
      effect: normalized,
      signature,
      shouldStore: signature !== (lastTurnEffectSignature || ''),
      shouldMarkProcessed: false,
      shouldDisplay: false,
      displayType: null,
      duplicate: true,
    };
  }

  const nowMs = typeof now === 'function' ? Number(now()) : Number(now);
  const triggeredAt = Number(normalized.triggeredAt);
  const effectAge = Number.isFinite(nowMs) && Number.isFinite(triggeredAt)
    ? nowMs - triggeredAt
    : Infinity;
  const shouldDisplay = effectAge <= maxAgeMs;

  return {
    valid: true,
    effect: normalized,
    signature,
    shouldStore: true,
    shouldMarkProcessed: true,
    shouldDisplay,
    displayType: shouldDisplay ? normalized.type : null,
    duplicate: false,
  };
}

export function shouldTriggerSharonHesitation({
  combatantProfileId = null,
  initiatorProfileId = null,
  expectedTeam = null,
  previousTeam = null,
  isFirstTurnOfRound = false,
  sharonProfileId = SHARON_PROFILE_ID,
} = {}) {
  const sharonId = normalizeProfileId(sharonProfileId);
  if (!sharonId) {
    return false;
  }

  if (normalizeProfileId(combatantProfileId) !== sharonId) {
    return false;
  }

  const initiatorId = normalizeProfileId(initiatorProfileId);
  if (initiatorId && initiatorId !== sharonId) {
    return false;
  }

  if (!expectedTeam || normalizeCombatTeam(expectedTeam) !== 'enemy') {
    return false;
  }

  if (isFirstTurnOfRound) {
    return false;
  }

  return Boolean(previousTeam) && normalizeCombatTeam(previousTeam) === 'ally';
}

export function normalizeConditionDurationValue(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!normalized) {
    return 'save-ends';
  }
  if (normalized.includes('save') || normalized === 'se') {
    return 'save-ends';
  }
  if (normalized.includes('eot') || normalized.includes('end')) {
    return 'end-of-turn';
  }
  return 'save-ends';
}

export function getConditionDurationType(condition) {
  if (!condition || typeof condition !== 'object') {
    return 'save-ends';
  }

  const source = condition.duration ?? condition.mode ?? condition.type ?? null;
  if (typeof source === 'string') {
    return normalizeConditionDurationValue(source);
  }
  if (source && typeof source.type === 'string') {
    return normalizeConditionDurationValue(source.type);
  }
  return normalizeConditionDurationValue('');
}

export function partitionEndOfTurnConditions(
  conditions,
  targetTokenId,
  { getDurationType = getConditionDurationType } = {}
) {
  const source = Array.isArray(conditions) ? conditions : [];
  const normalizedTargetId = typeof targetTokenId === 'string' ? targetTokenId : '';
  const durationResolver =
    typeof getDurationType === 'function' ? getDurationType : getConditionDurationType;
  const removed = [];
  const remaining = [];

  source.forEach((condition) => {
    const linkedId =
      typeof condition?.duration?.targetTokenId === 'string'
        ? condition.duration.targetTokenId
        : '';
    const shouldRemove =
      Boolean(normalizedTargetId) &&
      durationResolver(condition) === 'end-of-turn' &&
      linkedId === normalizedTargetId;

    if (shouldRemove) {
      removed.push(condition);
    } else {
      remaining.push(condition);
    }
  });

  return {
    removed,
    remaining,
    changed: removed.length > 0,
  };
}

function normalizeProfileId(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}
