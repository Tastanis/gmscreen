import { normalizeGridState } from './grid.js';
import { roundToPrecision, toBoolean, toNonNegativeInt } from './helpers.js';

export const MAP_LEVEL_MAX_LEVELS = 5;
export const MAP_LEVEL_ID_PREFIX = 'map-level-';

// Levels v3 display modes (replaces the old `visible` boolean):
//   - 'auto'   (default): the level image renders only for viewers whose
//                         own level is at or above this level's zIndex.
//                         Viewers below see through it — token-visibility
//                         still gated by the level's cutouts.
//   - 'always': the level image renders for every viewer regardless of
//                         their level (legacy "on" overlay behavior).
// `hidden: true` overrides both modes and skips the level for everyone.
export const MAP_LEVEL_DISPLAY_MODES = Object.freeze(['auto', 'always']);
export const MAP_LEVEL_DEFAULT_DISPLAY_MODE = 'auto';

// Levels v2: the first uploaded scene map is treated as Level 0. It is not
// persisted in `mapLevels.levels` (which still stores Level 1+ only); it is
// derived from the scene's base map URL when building the level view model.
// Placements without an explicit `levelId` resolve to this id.
export const BASE_MAP_LEVEL_ID = 'level-0';

// Levels v2 (§5.3): the GM's Activate button pulls every known user to the
// GM's current viewing level. The roster is the configured chat/player set
// (see dnd/index.php password map) normalized to lowercase profile ids — not
// only currently connected websocket clients — so reloads stay consistent.
export const KNOWN_LEVEL_USER_IDS = Object.freeze([
  'gm',
  'frunk',
  'sharon',
  'indigo',
  'zepha',
]);

// Levels v2 (§5.4): the four player-character profile ids in claim order. The
// GM's claim assignment dropdown iterates this list; PC auto-claim on first
// drag matches a token name against this set. `KNOWN_LEVEL_USER_IDS` includes
// `'gm'` for Activate's roster purpose, but the GM is never a claim target —
// unclaimed and GM-owned are equivalent per the plan.
export const PLAYER_CHARACTER_USER_IDS = Object.freeze([
  'frunk',
  'sharon',
  'indigo',
  'zepha',
]);

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
    displayMode: normalizeMapLevelDisplayMode(raw.displayMode),
    hidden: resolveMapLevelHidden(raw),
    opacity: normalizeMapLevelOpacity(raw.opacity),
    zIndex: normalizeMapLevelZIndex(raw.zIndex, index),
    grid: hasOwnGrid ? normalizeGridState({ ...(sceneGrid ?? {}), ...raw.grid }) : null,
    cutouts: normalizeMapLevelCutouts(raw.cutouts),
    blocksLowerLevelInteraction: toBoolean(raw.blocksLowerLevelInteraction, true),
    blocksLowerLevelVision: toBoolean(raw.blocksLowerLevelVision, true),
    defaultForPlayers: toBoolean(raw.defaultForPlayers, false),
  };
}

export function normalizeMapLevelDisplayMode(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    if (MAP_LEVEL_DISPLAY_MODES.includes(trimmed)) {
      return trimmed;
    }
  }
  return MAP_LEVEL_DEFAULT_DISPLAY_MODE;
}

// Migration: old saves stored `visible: true|false`. New model uses
// `hidden` (inverse) plus `displayMode`. When `hidden` is provided we
// trust it; otherwise fall back to the legacy `visible` field so
// previously-hidden levels stay hidden after the schema change.
function resolveMapLevelHidden(raw) {
  if (raw && Object.prototype.hasOwnProperty.call(raw, 'hidden')) {
    return toBoolean(raw.hidden, false);
  }
  if (raw && Object.prototype.hasOwnProperty.call(raw, 'visible')) {
    return !toBoolean(raw.visible, true);
  }
  return false;
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
    const firstVisible = levels.find((level) => level && level.hidden !== true) ?? levels[0];
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
    displayMode: 'always',
    hidden: false,
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
 * Levels v2 helper: return the id of the topmost (highest zIndex) level
 * in a scene. Falls back to `BASE_MAP_LEVEL_ID` when no stored levels
 * exist. Used to default the GM's active level on login / scene
 * activation when no prior `userLevelState` entry is saved.
 */
export function resolveTopmostLevelId({ baseMapUrl = null, mapLevels = null, sceneGrid = null } = {}) {
  const viewModel = buildLevelViewModel({ baseMapUrl, mapLevels, sceneGrid });
  if (!Array.isArray(viewModel) || viewModel.length === 0) {
    return BASE_MAP_LEVEL_ID;
  }
  const last = viewModel[viewModel.length - 1];
  const id = last && typeof last.id === 'string' ? last.id : '';
  return id || BASE_MAP_LEVEL_ID;
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
 * Login-time helper: resolve the level id of the user's claimed PC token
 * for a scene, matching board-interactions' name-based PC inference. A
 * placement is treated as a PC token when (a) it is claimed by `userId`
 * in `sceneState.claimedTokens` and (b) its `name`, normalized to
 * lowercased space-separated words, contains `userId` as a whole word
 * (the same rule as `matchProfileByName` / auto-claim on first drag).
 *
 * Returns the matching placement's level id only when exactly one PC
 * token exists for the user. With zero or two-plus PC matches we return
 * `null` so the caller can fall back to the existing
 * `resolveActiveLevelIdForUser` chain. This is intended to be called
 * once on session start (see bootstrap.js) to overwrite a stale
 * `userLevelState[userId]` entry — it is not a per-render resolver.
 */
export function resolvePcTokenLevelIdForUser({
  sceneState = null,
  userId = null,
  placements = null,
  validLevelIds = null,
} = {}) {
  const userKey = typeof userId === 'string' ? userId.trim().toLowerCase() : '';
  if (!userKey || !sceneState || typeof sceneState !== 'object') {
    return null;
  }
  const claims = sceneState.claimedTokens;
  if (!claims || typeof claims !== 'object' || !Array.isArray(placements)) {
    return null;
  }
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
  const namePattern = new RegExp(`(^|\\s)${userKey}(\\s|$)`);

  let matchedLevelId = null;
  let matchCount = 0;
  for (const placement of placements) {
    if (!placement || typeof placement !== 'object') continue;
    const placementId = typeof placement.id === 'string' ? placement.id : '';
    if (!placementId) continue;
    if (claims[placementId] !== userKey) continue;
    const rawName = typeof placement.name === 'string' ? placement.name : '';
    const normalizedName = rawName.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (!normalizedName || !namePattern.test(normalizedName)) continue;
    const placementLevelId = resolvePlacementLevelId(placement);
    if (!isValidLevelId(placementLevelId)) continue;
    matchCount += 1;
    if (matchCount > 1) {
      return null;
    }
    matchedLevelId = placementLevelId;
  }
  return matchCount === 1 ? matchedLevelId : null;
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

/**
 * Levels v2 (§5.4): resolve the claimant profile id for a placement from a
 * scene's `claimedTokens` map. Returns a normalized lowercase profile id, or
 * null when the placement is unclaimed (which the plan treats as GM-owned for
 * display and permission purposes).
 *
 * Accepts the per-scene `sceneState` entry (the same object passed to
 * `resolveActiveLevelIdForUser`) so callers do not need to know the storage
 * shape; an unstructured/missing scene entry resolves to null.
 */
export function getClaimedUserIdForPlacement(sceneState, placementId) {
  if (!sceneState || typeof sceneState !== 'object') {
    return null;
  }
  const placementKey = typeof placementId === 'string' ? placementId.trim() : '';
  if (!placementKey) {
    return null;
  }
  const claims = sceneState.claimedTokens;
  if (!claims || typeof claims !== 'object') {
    return null;
  }
  const value = claims[placementKey];
  if (typeof value !== 'string') {
    return null;
  }
  const userId = value.trim().toLowerCase();
  return userId || null;
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

  const visibleLevel = entries.find((level) => level && level.hidden !== true && level.id);
  if (visibleLevel) {
    return visibleLevel.id;
  }

  return entries.find((level) => level?.id)?.id ?? null;
}
