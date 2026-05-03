import { toNonNegativeInt, toBoolean } from './helpers.js';
import { normalizeMonsterSnapshot, stripMonsterSnapshot } from './monsters.js';

export function normalizePlacements(raw = {}) {
  if (!raw || typeof raw !== 'object') {
    return {};
  }

  const normalized = {};
  Object.keys(raw).forEach((sceneId) => {
    const placements = Array.isArray(raw[sceneId]) ? raw[sceneId] : [];
    normalized[sceneId] = placements
      .map((entry) => normalizePlacementEntry(entry))
      .filter(Boolean);
  });
  return normalized;
}

export function restrictPlacementsToPlayerView(placements = {}) {
  if (!placements || typeof placements !== 'object') {
    return {};
  }

  const filtered = {};
  Object.keys(placements).forEach((sceneId) => {
    const entries = Array.isArray(placements[sceneId]) ? placements[sceneId] : [];
    filtered[sceneId] = entries
      .filter((entry) => entry && typeof entry === 'object')
      .map((entry) => stripMonsterSnapshot(entry, { allowAllyMonster: true }));
  });

  return filtered;
}

export function normalizePlacementEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const id = typeof entry.id === 'string' ? entry.id : null;
  if (!id) {
    return null;
  }

  const tokenId = typeof entry.tokenId === 'string' ? entry.tokenId : null;
  const name = typeof entry.name === 'string' ? entry.name : '';
  const imageUrl = typeof entry.imageUrl === 'string' ? entry.imageUrl : '';
  const column = toNonNegativeInt(entry.column ?? entry.col ?? entry.x ?? 0);
  const row = toNonNegativeInt(entry.row ?? entry.y ?? 0);
  const width = Math.max(1, toNonNegativeInt(entry.width ?? entry.columns ?? entry.w ?? 1));
  const height = Math.max(1, toNonNegativeInt(entry.height ?? entry.rows ?? entry.h ?? 1));
  const size = typeof entry.size === 'string' && entry.size ? entry.size : `${width}x${height}`;
  const stackOrder = toOptionalNonNegativeInt(entry.stackOrder);
  const levelId =
    normalizePlacementLevelId(entry.levelId) ??
    normalizePlacementLevelId(entry.mapLevelId) ??
    normalizePlacementLevelId(entry.mapLevel) ??
    normalizePlacementLevelId(entry.floorId);

  const metadataSource =
    (entry.metadata && typeof entry.metadata === 'object' ? entry.metadata : null) ||
    (entry.meta && typeof entry.meta === 'object' ? entry.meta : null);
  const metadata = normalizePlacementMetadata(metadataSource);

  let monsterId = typeof entry.monsterId === 'string' ? entry.monsterId.trim() : '';
  if (!monsterId && typeof metadata?.monsterId === 'string') {
    monsterId = metadata.monsterId.trim();
  }

  const monsterSource =
    entry.monster ?? metadata?.monster ?? metadataSource?.monster ?? metadataSource?.monsterSnapshot ?? null;
  const monster = normalizeMonsterSnapshot(monsterSource);
  if (!monsterId && monster?.id) {
    monsterId = monster.id;
  }
  const traits = normalizePlacementTraits(entry.traits ?? metadata?.traits ?? null);
  const movementSpeed = toOptionalMovementSpeed(
    entry.movementSpeed ??
      entry.speed ??
      entry.movement ??
      metadata?.movementSpeed ??
      metadata?.speed ??
      metadata?.movement ??
      monster?.speed ??
      monster?.movement ??
      null
  );
  if (movementSpeed !== null) {
    traits.speed = movementSpeed;
  }
  const hp = normalizePlacementHitPoints(
    entry.hp ??
      entry.hitPoints ??
      entry?.overlays?.hitPoints ??
      entry?.overlays?.hitPoints?.value ??
      entry?.stats?.hp ??
      null
  );
  const showHp = Boolean(
    entry.showHp ?? entry.showHitPoints ?? entry?.overlays?.hitPoints?.visible ?? false
  );
  const showTriggeredAction = Boolean(
    entry.showTriggeredAction ?? entry?.overlays?.triggeredAction?.visible ?? false
  );
  const triggeredActionReady =
    entry.triggeredActionReady ?? entry?.overlays?.triggeredAction?.ready ?? true;
  const rawConditionSources = [];
  if (entry.conditions !== undefined) {
    rawConditionSources.push(entry.conditions);
  }
  if (entry?.overlays?.conditions !== undefined) {
    rawConditionSources.push(entry.overlays.conditions);
  }

  const legacyConditionSource =
    entry.condition ?? entry.status ?? entry?.overlays?.condition ?? null;
  if (legacyConditionSource !== null && legacyConditionSource !== undefined) {
    rawConditionSources.push(legacyConditionSource);
  }

  const conditions = normalizePlacementConditions(rawConditionSources);
  const condition = conditions[0] ?? null;
  const combatTeam = normalizeCombatTeam(
    entry.combatTeam ?? entry.team ?? entry?.tags?.team ?? entry?.faction ?? null
  );
  const hidden = toBoolean(entry.hidden ?? entry.isHidden ?? entry?.flags?.hidden ?? false, false);

  const normalized = {
    id,
    tokenId,
    name,
    imageUrl,
    column,
    row,
    width,
    height,
    size,
    hp,
    showHp,
    showTriggeredAction,
    triggeredActionReady: triggeredActionReady !== false,
    conditions,
    condition,
    combatTeam,
    hidden,
  };

  if (monsterId) {
    normalized.monsterId = monsterId;
  }

  if (stackOrder !== null) {
    normalized.stackOrder = stackOrder;
  }

  if (levelId) {
    normalized.levelId = levelId;
  }

  if (monster) {
    normalized.monster = monster;
  }

  if (Object.keys(traits).length > 0) {
    normalized.traits = traits;
  }

  if (metadata) {
    const sanitizedMetadata = { ...metadata };
    if (monster) {
      sanitizedMetadata.monster = monster;
    } else {
      delete sanitizedMetadata.monster;
    }
    if (monsterId) {
      sanitizedMetadata.monsterId = monsterId;
    } else {
      delete sanitizedMetadata.monsterId;
    }
    normalized.metadata = sanitizedMetadata;
  } else if (monster || monsterId) {
    const normalizedMetadata = {};
    if (monster) {
      normalizedMetadata.monster = monster;
    }
    if (monsterId) {
      normalizedMetadata.monsterId = monsterId;
    }
    normalized.metadata = normalizedMetadata;
  }

  return normalized;
}

function toOptionalNonNegativeInt(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value));
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isFinite(parsed)) {
    return Math.max(0, parsed);
  }

  return null;
}

function toOptionalMovementSpeed(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value));
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      return Math.max(0, Math.trunc(numeric));
    }
    const match = trimmed.match(/-?\d+/);
    if (match) {
      const parsed = Number.parseInt(match[0], 10);
      return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
    }
  }

  return null;
}

function normalizePlacementTraits(value) {
  const traits = {};
  if (!value || typeof value !== 'object') {
    return traits;
  }

  const speed = toOptionalMovementSpeed(value.speed ?? value.movement ?? null);
  if (speed !== null) {
    traits.speed = speed;
  }

  return traits;
}

function normalizePlacementLevelId(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeHitPointsValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  if (value && typeof value === 'object') {
    if (typeof value.value === 'number' && Number.isFinite(value.value)) {
      return String(Math.trunc(value.value));
    }
    if (typeof value.value === 'string') {
      return value.value.trim();
    }
  }

  return '';
}

export function normalizePlacementHitPoints(value, fallbackMax = '') {
  const normalized = { current: '', max: '' };

  if (value && typeof value === 'object') {
    const currentSource =
      value.current ?? value.value ?? value.hp ?? value.currentHp ?? value.hpCurrent ?? null;
    const maxSource =
      value.max ??
      value.maxHp ??
      value.total ??
      value.maximum ??
      value.value ??
      value.hp ??
      value.hitPoints ??
      null;

    normalized.current = normalizeHitPointsValue(currentSource);
    normalized.max = normalizeHitPointsValue(maxSource);
  } else {
    const parsed = normalizeHitPointsValue(value);
    normalized.current = parsed;
    normalized.max = parsed;
  }

  const fallback = normalizeHitPointsValue(fallbackMax);
  if (normalized.max === '' && fallback !== '') {
    normalized.max = fallback;
  }

  if (normalized.current === '' && normalized.max !== '') {
    normalized.current = normalized.max;
  }

  return normalized;
}

export function normalizeCombatTeam(value) {
  if (typeof value !== 'string') {
    return 'enemy';
  }
  const normalized = value.trim().toLowerCase();
  return normalized === 'ally' ? 'ally' : 'enemy';
}

function normalizeConditionDurationValue(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!normalized) {
    return 'save-ends';
  }
  if (normalized.includes('eot') || normalized.includes('end')) {
    return 'end-of-turn';
  }
  return 'save-ends';
}

export function normalizePlacementCondition(value) {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    const name = value.trim();
    if (!name) {
      return null;
    }
    return { name, duration: { type: 'save-ends' } };
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

  const normalized = { name, duration: { type: durationType } };

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

  if (normalized.duration.type === 'end-of-turn') {
    if (targetTokenId) {
      normalized.duration.targetTokenId = targetTokenId;
    }
    if (targetTokenName) {
      normalized.duration.targetTokenName = targetTokenName;
    }
  }

  return normalized;
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

    const key = buildConditionKey(condition);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalized.push(condition);
  }

  return normalized;
}

function buildConditionKey(condition) {
  const name = typeof condition?.name === 'string' ? condition.name.trim().toLowerCase() : '';
  const type = condition?.duration?.type ?? 'save-ends';
  const targetId =
    typeof condition?.duration?.targetTokenId === 'string'
      ? condition.duration.targetTokenId.trim().toLowerCase()
      : '';
  const targetName =
    typeof condition?.duration?.targetTokenName === 'string'
      ? condition.duration.targetTokenName.trim().toLowerCase()
      : '';
  const targetKey = type === 'end-of-turn' ? `${targetId}|${targetName}` : '';
  return `${name}|${type}|${targetKey}`;
}

export function normalizePlacementMetadata(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const metadata = {};
  Object.keys(entry).forEach((key) => {
    if (key === 'monster') {
      const monster = normalizeMonsterSnapshot(entry.monster);
      if (monster) {
        metadata.monster = monster;
      }
      return;
    }

    if (key === 'monsterId') {
      const id = typeof entry.monsterId === 'string' ? entry.monsterId.trim() : '';
      if (id) {
        metadata.monsterId = id;
      }
      return;
    }

    const cloned = cloneMetadataValue(entry[key]);
    if (cloned !== undefined) {
      metadata[key] = cloned;
    }
  });

  return Object.keys(metadata).length > 0 ? metadata : null;
}

function cloneMetadataValue(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'function' || typeof value === 'symbol' || value === undefined) {
      return undefined;
    }
    if (typeof value === 'bigint') {
      const asNumber = Number(value);
      return Number.isSafeInteger(asNumber) ? asNumber : value.toString();
    }
    return value;
  }

  if (seen.has(value)) {
    return undefined;
  }

  seen.add(value);

  if (Array.isArray(value)) {
    return value
      .map((item) => cloneMetadataValue(item, seen))
      .filter((item) => item !== undefined);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const output = {};
  Object.keys(value).forEach((key) => {
    const cloned = cloneMetadataValue(value[key], seen);
    if (cloned !== undefined) {
      output[key] = cloned;
    }
  });

  return output;
}
