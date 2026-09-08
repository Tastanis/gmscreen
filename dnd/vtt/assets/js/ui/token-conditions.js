import {buildConditionIdentityKey,createConditionInstanceId,normalizeRiderExecutions,normalizeStoredConditionRiders} from '../state/normalize/condition-riders.js';

export function normalizePlacementCondition(value) {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    const name = value.trim();
    if (!name) {
      return null;
    }
    return { name, description: '', duration: { type: 'save-ends' } };
  }

  if (typeof value !== 'object') {
    return null;
  }

  const name = typeof value.name === 'string' ? value.name.trim() : '';
  if (!name) {
    return null;
  }

  const durationSource =
    typeof value.duration === 'string' || (value.duration && typeof value.duration === 'object')
      ? value.duration
      : value.mode ?? value.type ?? value.persist ?? null;

  const durationType = normalizeConditionDurationValue(
    typeof durationSource === 'string'
      ? durationSource
      : typeof durationSource?.type === 'string'
      ? durationSource.type
      : typeof durationSource?.value === 'string'
      ? durationSource.value
      : typeof durationSource?.mode === 'string'
      ? durationSource.mode
      : ''
  );

  const duration = { type: durationType };

  const description =
    typeof value.description === 'string'
      ? value.description.trim()
      : typeof value.text === 'string'
      ? value.text.trim()
      : '';

  const targetTokenId =
    typeof durationSource?.targetTokenId === 'string'
      ? durationSource.targetTokenId.trim()
      : typeof durationSource?.tokenId === 'string'
      ? durationSource.tokenId.trim()
      : typeof durationSource?.id === 'string'
      ? durationSource.id.trim()
      : typeof value.targetTokenId === 'string'
      ? value.targetTokenId.trim()
      : null;

  const targetTokenName =
    typeof durationSource?.targetTokenName === 'string'
      ? durationSource.targetTokenName.trim()
      : typeof durationSource?.tokenName === 'string'
      ? durationSource.tokenName.trim()
      : typeof value.targetTokenName === 'string'
      ? value.targetTokenName.trim()
      : typeof value.tokenName === 'string'
      ? value.tokenName.trim()
      : '';

  if (duration.type === 'end-of-turn') {
    if (targetTokenId) {
      duration.targetTokenId = targetTokenId;
    }
    if (targetTokenName) {
      duration.targetTokenName = targetTokenName;
    }
  }

  // Numeric riders for damageWeakness / damageImmunity. Preserve through
  // every normalize pass so they survive reload, save-sync, and dedup.
  const numericRider = name === 'damageWeakness' || name === 'damageImmunity';
  let amount = null;
  let damageType = '';
  if (numericRider) {
    const parsedAmount = Number.parseInt(value.amount, 10);
    if (Number.isFinite(parsedAmount) && parsedAmount > 0) {
      amount = parsedAmount;
    }
    if (typeof value.damageType === 'string') {
      const dt = value.damageType.trim().toLowerCase();
      if (dt && dt !== 'untyped') damageType = dt;
    }
  }

  const result = { name, description, duration };
  if (amount !== null) result.amount = amount;
  if (damageType) result.damageType = damageType;
  if (value.hidden || name.toLowerCase() === 'hiddeneffect') result.hidden = true;
  if (typeof value.label === 'string' && value.label.trim()) {
    result.label = value.label.trim();
  }
  if (value.rider && typeof value.rider === 'object') {
    result.rider = JSON.parse(JSON.stringify(value.rider));
  }
  if (typeof value.consume === 'string' && value.consume.trim()) {
    result.consume = value.consume.trim();
  }
  if (typeof value.sourceId === 'string' && value.sourceId.trim()) {
    result.sourceId = value.sourceId.trim();
  }
  if (typeof value.sourceName === 'string' && value.sourceName.trim()) {
    result.sourceName = value.sourceName.trim();
  }
  if (typeof value.sourceAbility === 'string' && value.sourceAbility.trim()) {
    result.sourceAbility = value.sourceAbility.trim();
  }
  const riders = normalizeStoredConditionRiders(value.riders);
  if (riders.length) {
    result.riders = riders;
    const instanceId = typeof value.instanceId === 'string' ? value.instanceId.trim() : '';
    if (instanceId) result.instanceId = instanceId;
    const executions = normalizeRiderExecutions(value.riderExecutions, riders.map((rider) => rider.id));
    if (Object.keys(executions).length) result.riderExecutions = executions;
  }
  return result;
}

export function ensurePlacementCondition(value) {
  const normalized = normalizePlacementCondition(value);
  if (!normalized) {
    return null;
  }

  const condition = { name: normalized.name };
  if (typeof normalized.description === 'string' && normalized.description.trim()) {
    condition.description = normalized.description.trim();
  }
  if (normalized.duration && typeof normalized.duration === 'object') {
    condition.duration = { type: normalized.duration.type };
    if (normalized.duration.targetTokenId) {
      condition.duration.targetTokenId = normalized.duration.targetTokenId;
    }
    if (normalized.duration.targetTokenName) {
      condition.duration.targetTokenName = normalized.duration.targetTokenName;
    }
  } else {
    condition.duration = { type: 'save-ends' };
  }

  if (Number.isFinite(normalized.amount) && normalized.amount > 0) {
    condition.amount = normalized.amount;
  }
  if (typeof normalized.damageType === 'string' && normalized.damageType) {
    condition.damageType = normalized.damageType;
  }
  if (normalized.hidden || normalized.name.toLowerCase() === 'hiddeneffect') {
    condition.hidden = true;
  }
  if (typeof normalized.label === 'string' && normalized.label) {
    condition.label = normalized.label;
  }
  if (normalized.rider && typeof normalized.rider === 'object') {
    condition.rider = JSON.parse(JSON.stringify(normalized.rider));
  }
  if (typeof normalized.consume === 'string' && normalized.consume) {
    condition.consume = normalized.consume;
  }
  if (typeof normalized.sourceId === 'string' && normalized.sourceId) {
    condition.sourceId = normalized.sourceId;
  }
  if (typeof normalized.sourceName === 'string' && normalized.sourceName) {
    condition.sourceName = normalized.sourceName;
  }
  if (typeof normalized.sourceAbility === 'string' && normalized.sourceAbility) {
    condition.sourceAbility = normalized.sourceAbility;
  }
  if (Array.isArray(normalized.riders) && normalized.riders.length) {
    condition.riders = JSON.parse(JSON.stringify(normalized.riders));
    condition.instanceId = normalized.instanceId || createConditionInstanceId(normalized);
    if (normalized.riderExecutions && typeof normalized.riderExecutions === 'object') {
      condition.riderExecutions = { ...normalized.riderExecutions };
    }
  }

  return condition;
}

export function normalizePlacementConditions(value) {
  if (value === null || value === undefined) {
    return [];
  }

  const queue = Array.isArray(value) ? [...value] : [value];
  const normalized = [];
  const seen = new Set();

  while (queue.length) {
    const current = queue.shift();
    if (current === null || current === undefined) {
      continue;
    }
    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    const condition = normalizePlacementCondition(current);
    if (!condition) {
      continue;
    }
    if (condition.riders?.length && !condition.instanceId) {
      condition.instanceId = createConditionInstanceId(condition, normalized.length);
    }

    const key = buildConditionKey(condition);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalized.push(condition);
  }

  return normalized;
}

export function ensurePlacementConditions(value) {
  return normalizePlacementConditions(value)
    .map((condition) => ensurePlacementCondition(condition))
    .filter(Boolean);
}

export function buildConditionKey(condition) {
  if (!condition || typeof condition !== 'object' || typeof condition.name !== 'string') {
    return '';
  }

  const name = condition.name.trim().toLowerCase();
  const type = normalizeConditionDurationValue(condition?.duration?.type ?? '');
  if (condition.instanceId || condition.riders?.length) {
    return buildConditionIdentityKey(condition);
  }
  // damageWeakness / damageImmunity carry numeric riders (amount + damageType)
  // that differentiate "weakness 5 fire" from "weakness 5 cold". Factor them
  // into the dedup key so applying both produces two distinct condition
  // entries rather than collapsing into one.
  if (name === 'damageweakness' || name === 'damageimmunity') {
    const amount = Number.isFinite(condition.amount) ? `${condition.amount}` : '0';
    const dt = typeof condition.damageType === 'string' ? condition.damageType.trim().toLowerCase() : '';
    return `${name}|${type}|${amount}|${dt}`;
  }
  if (name === 'hiddeneffect') {
    const label = typeof condition.label === 'string' ? condition.label.trim().toLowerCase() : '';
    const sourceId = typeof condition.sourceId === 'string' ? condition.sourceId.trim().toLowerCase() : '';
    const sourceAbility = typeof condition.sourceAbility === 'string' ? condition.sourceAbility.trim().toLowerCase() : '';
    const rider = condition.rider && typeof condition.rider === 'object'
      ? JSON.stringify(condition.rider)
      : '';
    return `${name}|${type}|${label}|${sourceId}|${sourceAbility}|${rider}`;
  }
  if (type === 'end-of-turn') {
    const targetId =
      typeof condition?.duration?.targetTokenId === 'string'
        ? condition.duration.targetTokenId.trim().toLowerCase()
        : '';
    const targetName =
      typeof condition?.duration?.targetTokenName === 'string'
        ? condition.duration.targetTokenName.trim().toLowerCase()
        : '';
    return `${name}|${type}|${targetId}|${targetName}`;
  }

  return `${name}|${type}`;
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
