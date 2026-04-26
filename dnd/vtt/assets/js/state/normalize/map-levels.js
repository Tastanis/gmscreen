import { normalizeGridState } from './grid.js';
import { roundToPrecision, toBoolean, toNonNegativeInt } from './helpers.js';

export const MAP_LEVEL_MAX_LEVELS = 5;
export const MAP_LEVEL_ID_PREFIX = 'map-level-';

// Levels v2: the first uploaded scene map is treated as Level 0. It is not
// persisted in `mapLevels.levels` (which still stores Level 1+ only); it is
// derived from the scene's base map URL when building the level view model.
// Placements without an explicit `levelId` resolve to this id.
export const BASE_MAP_LEVEL_ID = 'level-0';

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

/**
 * Levels v2 helper: resolve a placement's stored level id. Missing, blank,
 * or null values map to BASE_MAP_LEVEL_ID. This is intentionally separate
 * from `resolveActiveLevelId` because the user's active level must never be
 * used as a fallback for a token that lacks `levelId` — that would let
 * old tokens "follow" users between levels.
 */
export function resolvePlacementLevelId(placement) {
  if (!placement || typeof placement !== 'object') {
    return BASE_MAP_LEVEL_ID;
  }
  const raw = placement.levelId;
  if (typeof raw !== 'string') {
    return BASE_MAP_LEVEL_ID;
  }
  const trimmed = raw.trim();
  return trimmed || BASE_MAP_LEVEL_ID;
}

/**
 * Levels v2 helper: build the per-scene level view model. Returns an
 * ordered list with the virtual Level 0 entry first (derived from the
 * scene's base map URL) followed by stored Level 1+ entries sorted by
 * zIndex. Used by the renderer, the level selector, and visibility code
 * so they can treat Level 0 like any other level.
 */
export function buildLevelViewModel({ baseMapUrl = null, mapLevels = null, sceneGrid = null } = {}) {
  const trimmedBase = typeof baseMapUrl === 'string' ? baseMapUrl.trim() : '';
  const baseEntry = {
    id: BASE_MAP_LEVEL_ID,
    name: 'Level 0',
    mapUrl: trimmedBase || null,
    visible: true,
    opacity: 1,
    zIndex: -1,
    grid: sceneGrid && typeof sceneGrid === 'object' ? sceneGrid : null,
    cutouts: [],
    blocksLowerLevelInteraction: false,
    blocksLowerLevelVision: false,
    defaultForPlayers: false,
    isBaseLevel: true,
  };

  const storedLevels = Array.isArray(mapLevels?.levels) ? mapLevels.levels : [];
  const storedSorted = storedLevels
    .filter((level) => level && typeof level === 'object' && level.id)
    .slice()
    .sort((a, b) => {
      const aZ = Number.isFinite(a?.zIndex) ? a.zIndex : 0;
      const bZ = Number.isFinite(b?.zIndex) ? b.zIndex : 0;
      return aZ - bZ;
    })
    .map((level, index) => ({
      ...level,
      // Display labels for stored levels start at "Level 1".
      displayLabel: typeof level.name === 'string' && level.name.trim()
        ? level.name
        : `Level ${index + 1}`,
      isBaseLevel: false,
    }));

  return [baseEntry, ...storedSorted];
}

/**
 * Levels v2 helper: validate a level id against a built view model.
 * Returns the id if it exists in the view model, otherwise null.
 */
export function levelIdExistsInViewModel(levelId, viewModel = []) {
  if (typeof levelId !== 'string') {
    return false;
  }
  const trimmed = levelId.trim();
  if (!trimmed) {
    return false;
  }
  if (!Array.isArray(viewModel)) {
    return false;
  }
  return viewModel.some((entry) => entry && entry.id === trimmed);
}

const USER_LEVEL_STATE_SOURCES = new Set(['manual', 'activate', 'claim']);

/**
 * Levels v2: normalize a single user's active-level entry. Returns null
 * when the input cannot be coerced into a valid record so the caller can
 * drop it from the map.
 */
export function normalizeUserLevelStateEntry(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const levelIdSource = typeof raw.levelId === 'string' ? raw.levelId.trim() : '';
  if (!levelIdSource) {
    return null;
  }
  const sourceSource = typeof raw.source === 'string' ? raw.source.trim().toLowerCase() : '';
  const source = USER_LEVEL_STATE_SOURCES.has(sourceSource) ? sourceSource : 'manual';
  const tokenIdSource = typeof raw.tokenId === 'string' ? raw.tokenId.trim() : '';
  const updatedAtRaw = Number(raw.updatedAt);
  const updatedAt = Number.isFinite(updatedAtRaw) ? Math.max(0, Math.trunc(updatedAtRaw)) : 0;

  const entry = {
    levelId: levelIdSource,
    source,
    updatedAt,
  };
  if (tokenIdSource) {
    entry.tokenId = tokenIdSource;
  }
  return entry;
}

/**
 * Levels v2: normalize the full per-user active-level map for a scene.
 * Keys are normalized profile ids; values are entry records as produced by
 * `normalizeUserLevelStateEntry`. Invalid entries are dropped silently.
 */
export function normalizeUserLevelStateMap(raw) {
  if (!raw || typeof raw !== 'object') {
    return {};
  }
  const out = {};
  Object.keys(raw).forEach((key) => {
    if (typeof key !== 'string') {
      return;
    }
    const normalizedKey = key.trim().toLowerCase();
    if (!normalizedKey) {
      return;
    }
    const entry = normalizeUserLevelStateEntry(raw[key]);
    if (!entry) {
      return;
    }
    out[normalizedKey] = entry;
  });
  return out;
}

/**
 * Levels v2 helper: resolve a user's active level id for a scene,
 * following the priority chain in §4.2 of LEVELS_V2_PLAN.md:
 *   1. Valid `userLevelState[userId].levelId`
 *   2. Most recently modified claimed token's level (when claims drive
 *      view-follow). Requires `placements` to look up token levels.
 *   3. `BASE_MAP_LEVEL_ID`.
 *
 * The signature accepts a per-scene `sceneState` entry plus the user id.
 * `placements` is the per-scene placement list (boardState.placements[sceneId]).
 * `validLevelIds`, when provided, restricts resolution to known level ids
 * (including `BASE_MAP_LEVEL_ID`). Unknown/invalid stored ids fall through
 * to claim/base resolution. When `validLevelIds` is null/empty the
 * stored id is returned as-is unless it is missing, in which case we
 * still fall through.
 *
 * The resolver is intentionally separate from
 * `resolvePlacementLevelId(placement)`: a placement's stored level must
 * not be replaced by the user's active level (see §4.1).
 */
export function resolveActiveLevelIdForUser({
  sceneState = null,
  userId = null,
  placements = null,
  validLevelIds = null,
} = {}) {
  const userKey = typeof userId === 'string' ? userId.trim().toLowerCase() : '';
  const validSet = Array.isArray(validLevelIds)
    ? new Set(validLevelIds.filter((id) => typeof id === 'string' && id))
    : null;
  const isValidLevelId = (levelId) => {
    if (typeof levelId !== 'string' || !levelId) {
      return false;
    }
    if (!validSet || validSet.size === 0) {
      return true;
    }
    return validSet.has(levelId);
  };

  if (userKey && sceneState && typeof sceneState === 'object') {
    const userLevelState = sceneState.userLevelState;
    if (userLevelState && typeof userLevelState === 'object') {
      const entry = userLevelState[userKey];
      if (entry && typeof entry === 'object') {
        const levelId = typeof entry.levelId === 'string' ? entry.levelId.trim() : '';
        if (levelId && isValidLevelId(levelId)) {
          return levelId;
        }
      }
    }

    const claims = sceneState.claimedTokens;
    if (claims && typeof claims === 'object' && Array.isArray(placements)) {
      let bestLevelId = null;
      let bestModified = -Infinity;
      for (const placement of placements) {
        if (!placement || typeof placement !== 'object') continue;
        const placementId = typeof placement.id === 'string' ? placement.id : '';
        if (!placementId) continue;
        if (claims[placementId] !== userKey) continue;
        const modified = Number(placement._lastModified);
        const score = Number.isFinite(modified) ? modified : 0;
        if (score < bestModified) continue;
        const placementLevelId = resolvePlacementLevelId(placement);
        if (!isValidLevelId(placementLevelId)) continue;
        bestLevelId = placementLevelId;
        bestModified = score;
      }
      if (bestLevelId) {
        return bestLevelId;
      }
    }
  }

  return BASE_MAP_LEVEL_ID;
}

/**
 * Levels v2: normalize the per-scene `claimedTokens` map. Keys are
 * placement ids, values are normalized profile ids. Invalid entries are
 * dropped silently.
 */
export function normalizeClaimedTokensMap(raw) {
  if (!raw || typeof raw !== 'object') {
    return {};
  }
  const out = {};
  Object.keys(raw).forEach((key) => {
    if (typeof key !== 'string') {
      return;
    }
    const placementId = key.trim();
    if (!placementId) {
      return;
    }
    const value = raw[key];
    if (typeof value !== 'string') {
      return;
    }
    const userId = value.trim().toLowerCase();
    if (!userId) {
      return;
    }
    out[placementId] = userId;
  });
  return out;
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
