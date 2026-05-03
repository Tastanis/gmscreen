import { toOptionalNumber } from './helpers.js';

export function normalizeMonsterSnapshot(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const id = typeof entry.id === 'string' ? entry.id.trim() : '';
  const fallbackId = typeof entry.monsterId === 'string' ? entry.monsterId.trim() : '';
  const resolvedId = id || fallbackId;
  if (!resolvedId) {
    return null;
  }

  const name = typeof entry.name === 'string' ? entry.name.trim() : '';
  if (!name) {
    return null;
  }

  const snapshot = { id: resolvedId, name };

  const role = sanitizeMonsterString(entry.role ?? entry.types ?? '');
  if (role) {
    snapshot.role = role;
  }

  const level = toOptionalNumber(entry.level);
  if (level !== null) {
    snapshot.level = level;
  }

  const size = sanitizeMonsterString(entry.size ?? '');
  if (size) {
    snapshot.size = size;
  }

  const footprint = sanitizeMonsterString(entry.footprint ?? '');
  if (footprint) {
    snapshot.footprint = footprint;
  }

  const stamina = toOptionalNumber(entry.stamina);
  if (stamina !== null) {
    snapshot.stamina = stamina;
    snapshot.hp = stamina;
  }

  const hp = toOptionalNumber(entry.hp);
  if (hp !== null) {
    snapshot.hp = hp;
    if (snapshot.stamina === undefined) {
      snapshot.stamina = hp;
    }
  }

  const movement = sanitizeMonsterString(entry.movement ?? '');
  if (movement) {
    snapshot.movement = movement;
  }

  const updatedAt = sanitizeMonsterString(entry.updatedAt ?? entry.updated_at ?? entry.updated ?? '');
  if (updatedAt) {
    snapshot.updatedAt = updatedAt;
  }

  const ev = toOptionalNumber(entry.ev);
  if (ev !== null) {
    snapshot.ev = ev;
  }

  const speed = toOptionalNumber(entry.speed);
  if (speed !== null) {
    snapshot.speed = speed;
  }

  const stability = toOptionalNumber(entry.stability);
  if (stability !== null) {
    snapshot.stability = stability;
  }

  const freeStrike = toOptionalNumber(entry.free_strike ?? entry.freeStrike);
  if (freeStrike !== null) {
    snapshot.free_strike = freeStrike;
  }

  const types = sanitizeMonsterString(entry.types ?? '');
  if (types) {
    snapshot.types = types;
  }

  const image = sanitizeMonsterString(entry.imageUrl ?? entry.image ?? '');
  if (image) {
    snapshot.imageUrl = image;
  }

  const defenses = normalizeMonsterDefenses(entry.defenses ?? entry);
  if (Object.keys(defenses).length > 0) {
    snapshot.defenses = defenses;
  }

  const attributes = normalizeMonsterAttributes(entry.attributes ?? entry);
  if (Object.keys(attributes).length > 0) {
    snapshot.attributes = attributes;
  }

  const abilities = normalizeMonsterAbilities(entry.abilities ?? {});
  if (Object.keys(abilities).length > 0) {
    snapshot.abilities = abilities;
  }

  return snapshot;
}

export function normalizeMonsterDefenses(raw) {
  if (!raw || typeof raw !== 'object') {
    return {};
  }

  const result = {};
  const immunitySource = raw.immunity && typeof raw.immunity === 'object' ? raw.immunity : raw;
  const immunityType = sanitizeMonsterString(immunitySource.type ?? immunitySource.immunity_type ?? '');
  const immunityValue = sanitizeMonsterString(immunitySource.value ?? immunitySource.immunity_value ?? '');
  if (immunityType || immunityValue) {
    result.immunity = {};
    if (immunityType) {
      result.immunity.type = immunityType;
    }
    if (immunityValue) {
      result.immunity.value = immunityValue;
    }
  }

  const weaknessSource = raw.weakness && typeof raw.weakness === 'object' ? raw.weakness : raw;
  const weaknessType = sanitizeMonsterString(weaknessSource.type ?? weaknessSource.weakness_type ?? '');
  const weaknessValue = sanitizeMonsterString(weaknessSource.value ?? weaknessSource.weakness_value ?? '');
  if (weaknessType || weaknessValue) {
    result.weakness = {};
    if (weaknessType) {
      result.weakness.type = weaknessType;
    }
    if (weaknessValue) {
      result.weakness.value = weaknessValue;
    }
  }

  const stability = toOptionalNumber(raw.stability ?? raw.stability_value);
  if (stability !== null) {
    result.stability = stability;
  }

  const freeStrike = toOptionalNumber(raw.free_strike ?? raw.freeStrike);
  if (freeStrike !== null) {
    result.free_strike = freeStrike;
  }

  return result;
}

export function normalizeMonsterAttributes(raw) {
  if (!raw || typeof raw !== 'object') {
    return {};
  }

  const result = {};
  ['might', 'agility', 'reason', 'intuition', 'presence'].forEach((key) => {
    const value = toOptionalNumber(raw[key]);
    if (value !== null) {
      result[key] = value;
    }
  });

  return result;
}

export function normalizeMonsterAbilities(raw) {
  if (!raw || typeof raw !== 'object') {
    return {};
  }

  const categories = ['passive', 'maneuver', 'action', 'triggered_action', 'villain_action', 'malice'];
  const normalized = {};

  categories.forEach((category) => {
    const abilities = Array.isArray(raw[category]) ? raw[category] : [];
    const sanitized = abilities
      .map((ability) => normalizeMonsterAbility(ability, category))
      .filter(Boolean);
    if (sanitized.length > 0) {
      normalized[category] = sanitized;
    }
  });

  return normalized;
}

export function normalizeMonsterAbility(ability, category) {
  if (!ability || typeof ability !== 'object') {
    return null;
  }

  const name = sanitizeMonsterString(ability.name ?? '');
  if (!name) {
    return null;
  }

  const normalized = { name };
  const keywords = sanitizeMonsterString(ability.keywords ?? '');
  if (keywords) {
    normalized.keywords = keywords;
  }

  const range = sanitizeMonsterString(ability.range ?? '');
  if (range) {
    normalized.range = range;
  }

  const targets = sanitizeMonsterString(ability.targets ?? '');
  if (targets) {
    normalized.targets = targets;
  }

  const effect = sanitizeMonsterString(ability.effect ?? '');
  if (effect) {
    normalized.effect = effect;
  }

  const additional = sanitizeMonsterString(ability.additional_effect ?? ability.additionalEffect ?? '');
  if (additional) {
    normalized.additional_effect = additional;
  }

  const trigger = sanitizeMonsterString(ability.trigger ?? '');
  if (trigger && category === 'triggered_action') {
    normalized.trigger = trigger;
  }

  const resourceCost = sanitizeMonsterString(ability.resource_cost ?? ability.cost ?? '');
  if (resourceCost && (category === 'villain_action' || category === 'malice')) {
    normalized.resource_cost = resourceCost;
  }

  const hasTest = ability.has_test === true || ability.hasTest === true;
  const test = normalizeMonsterAbilityTest(ability.test ?? {});
  if (hasTest && Object.keys(test).length > 0) {
    normalized.has_test = true;
    normalized.test = test;
  }

  return normalized;
}

export function normalizeMonsterAbilityTest(raw) {
  if (!raw || typeof raw !== 'object') {
    return {};
  }

  const tiers = ['tier1', 'tier2', 'tier3'];
  const normalized = {};

  tiers.forEach((tier) => {
    const data = raw[tier];
    if (!data || typeof data !== 'object') {
      return;
    }

    const tierEntry = {};
    const damageAmount = sanitizeMonsterString(data.damage_amount ?? data.damageAmount ?? '');
    if (damageAmount) {
      tierEntry.damage_amount = damageAmount;
    }

    const damageType = sanitizeMonsterString(data.damage_type ?? data.damageType ?? '');
    if (damageType) {
      tierEntry.damage_type = damageType;
    }

    const hasAttributeCheck = data.has_attribute_check === true || data.hasAttributeCheck === true;
    if (hasAttributeCheck) {
      tierEntry.has_attribute_check = true;
    }

    const attribute = sanitizeMonsterString(data.attribute ?? '');
    if (attribute) {
      tierEntry.attribute = attribute;
    }

    const threshold = toOptionalNumber(data.attribute_threshold ?? data.attributeThreshold);
    if (threshold !== null) {
      tierEntry.attribute_threshold = threshold;
    }

    const attributeEffect = sanitizeMonsterString(data.attribute_effect ?? data.attributeEffect ?? '');
    if (attributeEffect) {
      tierEntry.attribute_effect = attributeEffect;
    }

    if (Object.keys(tierEntry).length > 0) {
      normalized[tier] = tierEntry;
    }
  });

  return normalized;
}

export function stripMonsterSnapshot(entity, options = {}) {
  if (!entity || typeof entity !== 'object') {
    return entity;
  }

  const allowAllyMonster = Boolean(options?.allowAllyMonster);
  const sanitized = { ...entity };
  const canView = allowAllyMonster && canPlayersViewMonsterSnapshot(entity);

  if (!canView) {
    const movementSpeed = extractSafeMovementSpeed(sanitized);
    if (movementSpeed !== null) {
      sanitized.traits = {
        ...(sanitized.traits && typeof sanitized.traits === 'object' ? sanitized.traits : {}),
        speed: movementSpeed,
      };
    }
    if ('monster' in sanitized) {
      delete sanitized.monster;
    }
    if ('monsterId' in sanitized) {
      delete sanitized.monsterId;
    }

    if (sanitized.metadata && typeof sanitized.metadata === 'object') {
      const metadata = { ...sanitized.metadata };
      let mutated = false;
      if ('monster' in metadata) {
        delete metadata.monster;
        mutated = true;
      }
      if ('monsterId' in metadata) {
        delete metadata.monsterId;
        mutated = true;
      }
      if (mutated) {
        if (Object.keys(metadata).length > 0) {
          sanitized.metadata = metadata;
        } else {
          delete sanitized.metadata;
        }
      }
    }
  }

  return sanitized;
}

function extractSafeMovementSpeed(entity) {
  if (!entity || typeof entity !== 'object') {
    return null;
  }
  const metadata = entity.metadata && typeof entity.metadata === 'object' ? entity.metadata : null;
  const monster = entity.monster && typeof entity.monster === 'object' ? entity.monster : null;
  const metadataMonster = metadata?.monster && typeof metadata.monster === 'object' ? metadata.monster : null;
  const candidates = [
    entity.traits?.speed,
    entity.movementSpeed,
    entity.speed,
    entity.movement,
    metadata?.traits?.speed,
    metadata?.movementSpeed,
    metadata?.speed,
    metadata?.movement,
    monster?.speed,
    monster?.movement,
    metadataMonster?.speed,
    metadataMonster?.movement,
  ];

  for (const candidate of candidates) {
    const parsed = parseMovementSpeed(candidate);
    if (parsed !== null) {
      return parsed;
    }
  }
  return null;
}

function parseMovementSpeed(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value));
  }
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric)) {
    return Math.max(0, Math.trunc(numeric));
  }
  const match = trimmed.match(/-?\d+/);
  if (!match) {
    return null;
  }
  const parsed = Number.parseInt(match[0], 10);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
}

export function canPlayersViewMonsterSnapshot(entity) {
  return normalizePlacementCombatTeam(entity) === 'ally';
}

export function normalizePlacementCombatTeam(entity) {
  if (!entity || typeof entity !== 'object') {
    return null;
  }

  const teamValue =
    (typeof entity.combatTeam === 'string' ? entity.combatTeam : null) ??
    (typeof entity.team === 'string' ? entity.team : null);

  if (!teamValue) {
    return null;
  }

  const normalized = teamValue.trim().toLowerCase();
  if (normalized === 'ally') {
    return 'ally';
  }
  if (normalized === 'enemy') {
    return 'enemy';
  }
  return null;
}

export function sanitizeMonsterString(value) {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return '';
}
