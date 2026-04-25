import { normalizeGridState } from './grid.js';
import { roundToPrecision, toBoolean, toNonNegativeInt } from './helpers.js';

export const MAP_LEVEL_MAX_LEVELS = 5;
export const MAP_LEVEL_ID_PREFIX = 'map-level-';

const mapLevelSeed = Date.now();
let mapLevelSequence = 0;

export function createEmptyMapLevelsState() {
  return { levels: [], activeLevelId: null };
}

export function normalizeMapLevelsState(raw, { sceneGrid = null } = {}) {
  const mapLevels = createEmptyMapLevelsState();
  if (!raw || typeof raw !== 'object') {
    return mapLevels;
  }

  const levelSource = Array.isArray(raw.levels)
    ? raw.levels
    : Array.isArray(raw.items)
    ? raw.items
    : Array.isArray(raw)
    ? raw
    : [];

  mapLevels.levels = levelSource
    .slice(0, MAP_LEVEL_MAX_LEVELS)
    .map((entry, index) => normalizeMapLevelEntry(entry, index, sceneGrid))
    .filter(Boolean);

  normalizeDefaultPlayerLevel(mapLevels.levels);
  mapLevels.activeLevelId = resolveActiveLevelId(
    raw.activeLevelId ?? raw.activeLevel ?? raw.selectedLevelId ?? null,
    mapLevels.levels
  );

  return mapLevels;
}

export function normalizeMapLevelEntry(raw = {}, index = 0, sceneGrid = null) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const idSource = typeof raw.id === 'string' ? raw.id.trim() : '';
  const nameSource = typeof raw.name === 'string' ? raw.name.trim() : '';
  const mapUrlSource = typeof raw.mapUrl === 'string' ? raw.mapUrl.trim() : '';
  const hasOwnGrid = raw.grid && typeof raw.grid === 'object';

  return {
    id: idSource || createMapLevelId(),
    name: nameSource || `Level ${index + 1}`,
    mapUrl: mapUrlSource || null,
    visible: toBoolean(raw.visible, true),
    opacity: normalizeMapLevelOpacity(raw.opacity),
    zIndex: normalizeMapLevelZIndex(raw.zIndex, index),
    grid: hasOwnGrid ? normalizeGridState({ ...(sceneGrid ?? {}), ...raw.grid }) : null,
    cutouts: normalizeMapLevelCutouts(raw.cutouts),
    blocksLowerLevelInteraction: toBoolean(raw.blocksLowerLevelInteraction, true),
    blocksLowerLevelVision: toBoolean(raw.blocksLowerLevelVision, true),
    defaultForPlayers: toBoolean(raw.defaultForPlayers, false),
  };
}

function createMapLevelId() {
  mapLevelSequence += 1;
  return `${MAP_LEVEL_ID_PREFIX}${mapLevelSeed.toString(36)}-${mapLevelSequence.toString(36)}`;
}

function normalizeMapLevelOpacity(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 1;
  }
  return roundToPrecision(Math.max(0, Math.min(1, parsed)), 2);
}

function normalizeMapLevelZIndex(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isFinite(parsed)) {
    return parsed;
  }

  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return Math.trunc(numeric);
  }

  return Math.trunc(fallback);
}

function normalizeMapLevelCutouts(rawCutouts) {
  if (!Array.isArray(rawCutouts)) {
    return [];
  }

  return rawCutouts.map((entry) => normalizeMapLevelCutout(entry)).filter(Boolean);
}

function normalizeMapLevelCutout(raw = {}) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const column = normalizeRequiredCellCoordinate(raw.column ?? raw.col ?? raw.x);
  const row = normalizeRequiredCellCoordinate(raw.row ?? raw.y);
  if (column === null || row === null) {
    return null;
  }

  const cutout = {
    column,
    row,
    width: Math.max(1, toNonNegativeInt(raw.width ?? raw.columns ?? raw.w, 1)),
    height: Math.max(1, toNonNegativeInt(raw.height ?? raw.rows ?? raw.h, 1)),
  };

  if (typeof raw.id === 'string') {
    const id = raw.id.trim();
    if (id) {
      cutout.id = id;
    }
  }

  return cutout;
}

function normalizeRequiredCellCoordinate(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  return Math.max(0, Math.trunc(numeric));
}

function normalizeDefaultPlayerLevel(levels) {
  if (!Array.isArray(levels) || levels.length === 0) {
    return;
  }

  let assigned = false;
  levels.forEach((level) => {
    if (!level || typeof level !== 'object') {
      return;
    }

    if (level.defaultForPlayers && !assigned) {
      assigned = true;
      return;
    }

    level.defaultForPlayers = false;
  });

  if (!assigned) {
    const firstVisible = levels.find((level) => level && level.visible !== false) ?? levels[0];
    if (firstVisible) {
      firstVisible.defaultForPlayers = true;
    }
  }
}

function resolveActiveLevelId(preferredId, levels = []) {
  const entries = Array.isArray(levels) ? levels : [];
  if (!entries.length) {
    return null;
  }

  if (typeof preferredId === 'string') {
    const trimmed = preferredId.trim();
    if (trimmed && entries.some((level) => level?.id === trimmed)) {
      return trimmed;
    }
  }

  const defaultLevel = entries.find((level) => level && level.defaultForPlayers && level.id);
  if (defaultLevel) {
    return defaultLevel.id;
  }

  const visibleLevel = entries.find((level) => level && level.visible !== false && level.id);
  if (visibleLevel) {
    return visibleLevel.id;
  }

  return entries.find((level) => level?.id)?.id ?? null;
}
