import {
  BASE_MAP_LEVEL_ID,
  normalizeMapLevelsState,
  resolvePlacementLevelId,
} from '../state/normalize/map-levels.js';

export function normalizeTokenLevelId(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

export function getOrderedTokenMapLevels(levels = []) {
  return (Array.isArray(levels) ? levels : [])
    .map((level, sourceIndex) => ({ level, sourceIndex }))
    .filter(({ level }) => level && typeof level === 'object' && normalizeTokenLevelId(level.id))
    .sort((left, right) => {
      const leftZ = Number.isFinite(left.level.zIndex) ? left.level.zIndex : left.sourceIndex;
      const rightZ = Number.isFinite(right.level.zIndex) ? right.level.zIndex : right.sourceIndex;
      if (leftZ !== rightZ) {
        return leftZ - rightZ;
      }
      return left.sourceIndex - right.sourceIndex;
    })
    .map(({ level }) => level);
}

// Levels v2: synthesize a virtual Level 0 entry for nav/control helpers.
// Level 0 is not persisted in `mapLevels.levels` (which still stores Level
// 1+ only); it is the scene's base map URL surfaced as a real, addressable
// level. Callers that opt into `includeBaseLevel` get this entry prepended
// to the ordered list so up/down navigation and token-settings move
// controls can target it.
function buildVirtualBaseLevelEntry() {
  return {
    id: BASE_MAP_LEVEL_ID,
    name: 'Level 0',
    visible: true,
    opacity: 1,
    zIndex: -Infinity,
    cutouts: [],
    blocksLowerLevelInteraction: false,
    blocksLowerLevelVision: false,
    defaultForPlayers: false,
    isBaseLevel: true,
  };
}

function getOrderedTokenMapLevelsWithBase(rawLevels = [], options = {}) {
  const stored = getOrderedTokenMapLevels(rawLevels);
  if (!options || !options.includeBaseLevel) {
    return stored;
  }
  return [buildVirtualBaseLevelEntry(), ...stored];
}

export function resolveSceneTokenLevelState(state = {}, sceneId = null) {
  const sceneKey = normalizeTokenLevelId(sceneId);
  if (!sceneKey) {
    return normalizeMapLevelsState(null);
  }

  const boardState = state?.boardState && typeof state.boardState === 'object'
    ? state.boardState
    : state;
  const sceneState = boardState?.sceneState && typeof boardState.sceneState === 'object'
    ? boardState.sceneState
    : {};
  const sceneEntry = sceneState[sceneKey] && typeof sceneState[sceneKey] === 'object'
    ? sceneState[sceneKey]
    : {};

  return normalizeMapLevelsState(sceneEntry.mapLevels ?? null, { sceneGrid: sceneEntry.grid ?? null });
}

export function resolveTokenLevelId(placement = {}, mapLevelsState = null, options = {}) {
  const levels = getOrderedTokenMapLevels(mapLevelsState?.levels ?? []);
  if (!levels.length) {
    return null;
  }

  const levelIds = new Set(levels.map((level) => level.id));
  const explicitId =
    normalizeTokenLevelId(placement?.levelId) ??
    normalizeTokenLevelId(placement?.mapLevelId) ??
    normalizeTokenLevelId(placement?.mapLevel) ??
    normalizeTokenLevelId(placement?.floorId);
  if (explicitId && levelIds.has(explicitId)) {
    return explicitId;
  }

  if (options.fallbackToActive !== false) {
    const activeLevelId = normalizeTokenLevelId(mapLevelsState?.activeLevelId);
    if (activeLevelId && levelIds.has(activeLevelId)) {
      return activeLevelId;
    }
  }

  const defaultLevel = levels.find((level) => level.defaultForPlayers && levelIds.has(level.id));
  if (defaultLevel) {
    return defaultLevel.id;
  }

  return levels[0]?.id ?? null;
}

export function resolvePlayerActiveMapLevelId(mapLevelsState = null) {
  const levels = getOrderedTokenMapLevels(mapLevelsState?.levels ?? []);
  if (!levels.length) {
    return null;
  }

  const activeLevelId = normalizeTokenLevelId(mapLevelsState?.activeLevelId);
  if (activeLevelId) {
    const activeLevel = levels.find((level) => level.id === activeLevelId) ?? null;
    return activeLevel && activeLevel.visible !== false ? activeLevel.id : null;
  }

  const defaultLevel = levels.find(
    (level) => level.defaultForPlayers && level.visible !== false
  );
  if (defaultLevel) {
    return defaultLevel.id;
  }

  return levels.find((level) => level.visible !== false)?.id ?? null;
}

export function getPlayerTokenMapLevelVisibility(placement = {}, mapLevelsState = null, options = {}) {
  const levels = getOrderedTokenMapLevels(mapLevelsState?.levels ?? []);
  if (!levels.length) {
    return createTokenMapLevelVisibilityResult({
      visible: true,
      fullyVisible: true,
      hasLevels: false,
    });
  }

  const activeLevelId = resolvePlayerActiveMapLevelId(mapLevelsState);
  if (!activeLevelId) {
    return createTokenMapLevelVisibilityResult({
      visible: false,
      hasLevels: true,
    });
  }

  const placementLevelId = resolveTokenLevelId(placement, mapLevelsState);
  const activeLevelIndex = levels.findIndex((level) => level.id === activeLevelId);
  const placementLevelIndex = levels.findIndex((level) => level.id === placementLevelId);
  const placementLevel = placementLevelIndex >= 0 ? levels[placementLevelIndex] : null;
  if (activeLevelIndex < 0 || placementLevelIndex < 0 || placementLevel?.visible === false) {
    return createTokenMapLevelVisibilityResult({
      visible: false,
      hasLevels: true,
      activeLevelId,
      levelId: placementLevelId,
      levelIndex: placementLevelIndex,
      activeLevelIndex,
    });
  }

  if (placementLevelIndex === activeLevelIndex) {
    return createTokenMapLevelVisibilityResult({
      visible: true,
      fullyVisible: true,
      hasLevels: true,
      activeLevelId,
      levelId: placementLevelId,
      levelIndex: placementLevelIndex,
      activeLevelIndex,
    });
  }

  if (placementLevelIndex > activeLevelIndex) {
    return createTokenMapLevelVisibilityResult({
      visible: false,
      hasLevels: true,
      activeLevelId,
      levelId: placementLevelId,
      levelIndex: placementLevelIndex,
      activeLevelIndex,
    });
  }

  const placementBounds = normalizePlacementBounds(placement);
  const cells = Array.isArray(options.cells)
    ? normalizePlacementCells(options.cells, placementBounds)
    : getPlacementCells(placementBounds);
  if (!cells.length) {
    return createTokenMapLevelVisibilityResult({
      visible: false,
      hasLevels: true,
      activeLevelId,
      levelId: placementLevelId,
      levelIndex: placementLevelIndex,
      activeLevelIndex,
      bounds: placementBounds,
    });
  }

  const mode = options.mode === 'interaction' ? 'interaction' : 'vision';
  const visibleCells = cells.filter((cell) =>
    isCellOpenThroughHigherMapLevels(levels, placementLevelIndex + 1, activeLevelIndex, cell, mode)
  );

  return createTokenMapLevelVisibilityResult({
    visible: visibleCells.length > 0,
    fullyVisible: visibleCells.length === cells.length,
    hasLevels: true,
    activeLevelId,
    levelId: placementLevelId,
    levelIndex: placementLevelIndex,
    activeLevelIndex,
    bounds: placementBounds,
    visibleCells,
  });
}

export function isPlacementOnPlayerVisibleMapLevel(placement = {}, mapLevelsState = null) {
  return getPlayerTokenMapLevelVisibility(placement, mapLevelsState).visible;
}

export function isPlacementInteractableOnPlayerMapLevel(placement = {}, mapLevelsState = null, options = {}) {
  if (!options.point) {
    return getPlayerTokenMapLevelVisibility(placement, mapLevelsState, {
      mode: 'interaction',
    }).visible;
  }

  const pointCell = normalizeMapCell(options.point);
  if (!pointCell) {
    return false;
  }

  return getPlayerTokenMapLevelVisibility(placement, mapLevelsState, {
    mode: 'interaction',
    cells: [pointCell],
  }).visible;
}

export function getAdjacentTokenLevel(
  mapLevelsState = null,
  currentLevelId = null,
  direction = 'up',
  options = {},
) {
  // Levels v2: callers (GM nav, token-settings move) pass
  // `includeBaseLevel: true` so up/down navigation can step into and out
  // of the virtual Level 0 entry. Callers that only browse stored
  // Level 1+ keep the prior behavior.
  const levels = getOrderedTokenMapLevelsWithBase(mapLevelsState?.levels ?? [], options);
  if (levels.length < 2) {
    return null;
  }

  const normalizedCurrentId = normalizeTokenLevelId(currentLevelId);
  let resolvedCurrentId = normalizedCurrentId;
  if (!resolvedCurrentId || !levels.some((level) => level.id === resolvedCurrentId)) {
    resolvedCurrentId = resolveTokenLevelId({}, mapLevelsState);
  }
  const currentIndex = levels.findIndex((level) => level.id === resolvedCurrentId);
  if (currentIndex < 0) {
    return null;
  }

  const offset = direction === 'down' ? -1 : 1;
  const targetIndex = currentIndex + offset;
  if (targetIndex < 0 || targetIndex >= levels.length) {
    return null;
  }

  return levels[targetIndex] ?? null;
}

export function getTokenLevelControlState(mapLevelsState = null, placement = {}, options = {}) {
  const levels = getOrderedTokenMapLevelsWithBase(mapLevelsState?.levels ?? [], options);
  // Levels v2: when Level 0 is in the navigation set, resolve a
  // placement's level via `resolvePlacementLevelId` so a token with
  // `levelId === BASE_MAP_LEVEL_ID` (or missing/blank) is recognized as
  // sitting on Level 0. The legacy `resolveTokenLevelId` would fall
  // through to a stored Level 1+ entry instead.
  const includeBase = Boolean(options?.includeBaseLevel);
  const currentLevelId = includeBase
    ? resolvePlacementLevelId(placement)
    : resolveTokenLevelId(placement, mapLevelsState);
  const currentLevel = levels.find((level) => level.id === currentLevelId) ?? null;

  return {
    hasLevels: levels.length > 0,
    levels,
    currentLevel,
    currentLevelId,
    canMoveDown: Boolean(getAdjacentTokenLevel(mapLevelsState, currentLevelId, 'down', options)),
    canMoveUp: Boolean(getAdjacentTokenLevel(mapLevelsState, currentLevelId, 'up', options)),
  };
}

export function getMapLevelNavigationControlState(mapLevelsState = null, options = {}) {
  const levels = getOrderedTokenMapLevelsWithBase(mapLevelsState?.levels ?? [], options);
  // Levels v2: callers (e.g. the GM nav) may pass an explicit
  // `currentLevelId` resolved from the per-user `userLevelState` so the
  // nav reflects the GM's per-user level instead of the legacy
  // `mapLevels.activeLevelId`. When omitted we keep the prior behavior.
  const overrideId = normalizeTokenLevelId(options?.currentLevelId);
  let currentLevelId;
  if (overrideId && levels.some((level) => level.id === overrideId)) {
    currentLevelId = overrideId;
  } else {
    currentLevelId = resolveTokenLevelId({}, mapLevelsState);
  }
  const currentLevel = levels.find((level) => level.id === currentLevelId) ?? null;

  return {
    hasLevels: levels.length > 0,
    levels,
    currentLevel,
    currentLevelId,
    canMoveDown: Boolean(getAdjacentTokenLevel(mapLevelsState, currentLevelId, 'down', options)),
    canMoveUp: Boolean(getAdjacentTokenLevel(mapLevelsState, currentLevelId, 'up', options)),
  };
}

function createTokenMapLevelVisibilityResult({
  visible,
  fullyVisible = false,
  hasLevels = false,
  activeLevelId = null,
  levelId = null,
  levelIndex = -1,
  activeLevelIndex = -1,
  bounds = null,
  visibleCells = null,
} = {}) {
  return {
    visible: Boolean(visible),
    fullyVisible: Boolean(fullyVisible),
    hasLevels: Boolean(hasLevels),
    activeLevelId,
    levelId,
    levelIndex,
    activeLevelIndex,
    bounds,
    visibleCells: Array.isArray(visibleCells) ? visibleCells : null,
  };
}

function normalizePlacementBounds(placement = {}) {
  return {
    column: normalizeNonNegativeInt(placement?.column ?? placement?.col ?? placement?.x, 0),
    row: normalizeNonNegativeInt(placement?.row ?? placement?.y, 0),
    width: Math.max(1, normalizeNonNegativeInt(placement?.width ?? placement?.columns ?? placement?.w, 1)),
    height: Math.max(1, normalizeNonNegativeInt(placement?.height ?? placement?.rows ?? placement?.h, 1)),
  };
}

function getPlacementCells(bounds = {}) {
  const column = normalizeNonNegativeInt(bounds.column, 0);
  const row = normalizeNonNegativeInt(bounds.row, 0);
  const width = Math.max(1, normalizeNonNegativeInt(bounds.width, 1));
  const height = Math.max(1, normalizeNonNegativeInt(bounds.height, 1));
  const cells = [];

  for (let dx = 0; dx < width; dx += 1) {
    for (let dy = 0; dy < height; dy += 1) {
      cells.push({ column: column + dx, row: row + dy });
    }
  }

  return cells;
}

function normalizePlacementCells(cells = [], placementBounds = null) {
  const bounds = placementBounds ?? normalizePlacementBounds({});
  const normalized = [];
  const seen = new Set();

  cells.forEach((cell) => {
    const normalizedCell = normalizeMapCell(cell);
    if (!normalizedCell) {
      return;
    }

    const insidePlacement =
      normalizedCell.column >= bounds.column &&
      normalizedCell.column < bounds.column + bounds.width &&
      normalizedCell.row >= bounds.row &&
      normalizedCell.row < bounds.row + bounds.height;
    if (!insidePlacement) {
      return;
    }

    const key = `${normalizedCell.column},${normalizedCell.row}`;
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    normalized.push(normalizedCell);
  });

  return normalized;
}

function normalizeMapCell(cell = {}) {
  if (!cell || typeof cell !== 'object') {
    return null;
  }

  const column = normalizeNonNegativeInt(cell.column ?? cell.col ?? cell.x, null);
  const row = normalizeNonNegativeInt(cell.row ?? cell.y, null);
  if (column === null || row === null) {
    return null;
  }

  return { column, row };
}

function isCellOpenThroughHigherMapLevels(levels, startIndex, endIndex, cell, mode) {
  for (let index = startIndex; index <= endIndex; index += 1) {
    const level = levels[index];
    if (!doesMapLevelBlockLowerLevels(level, mode)) {
      continue;
    }

    if (!isMapLevelCutOutAtCell(level, cell)) {
      return false;
    }
  }

  return true;
}

// Levels v2 §5.5.4: scale below-level tokens by 10% per level of distance,
// floored at 50%. Same-level and above-level tokens render at 100%.
export function getMapLevelDistanceScale(direction, distance) {
  if (direction !== 'below') {
    return 1;
  }
  const steps = Math.max(0, Math.trunc(Number.isFinite(distance) ? distance : 0));
  if (steps <= 0) {
    return 1;
  }
  return Math.max(0.5, 1 - steps * 0.1);
}

// Build the level list used by the v2 presentation pipeline:
// `[Level 0, ...stored Level 1+]` ordered by zIndex.
function getOrderedLevelsWithBase(rawLevels = []) {
  return [buildVirtualBaseLevelEntry(), ...getOrderedTokenMapLevels(rawLevels)];
}

// Levels v2 §5.5.4 step 5: expanded cutout cells are the raw cutout cells
// plus every cell sharing an edge or corner with a raw cell (8-neighborhood).
// Returned as a Set keyed by `${column},${row}` so callers can do O(1) lookups
// when intersecting across multiple blocking levels.
function buildExpandedCutoutCellSet(level) {
  const result = new Set();
  const cutouts = Array.isArray(level?.cutouts) ? level.cutouts : [];
  cutouts.forEach((cutout) => {
    const column = normalizeNonNegativeInt(cutout?.column ?? cutout?.col ?? cutout?.x, null);
    const row = normalizeNonNegativeInt(cutout?.row ?? cutout?.y, null);
    if (column === null || row === null) {
      return;
    }
    const width = Math.max(1, normalizeNonNegativeInt(cutout?.width ?? cutout?.columns ?? cutout?.w, 1));
    const height = Math.max(1, normalizeNonNegativeInt(cutout?.height ?? cutout?.rows ?? cutout?.h, 1));

    for (let dx = -1; dx < width + 1; dx += 1) {
      for (let dy = -1; dy < height + 1; dy += 1) {
        const cellColumn = column + dx;
        const cellRow = row + dy;
        if (cellColumn < 0 || cellRow < 0) {
          continue;
        }
        result.add(`${cellColumn},${cellRow}`);
      }
    }
  });
  return result;
}

// Levels v2 §5.5: compute a token's presentation relative to a viewer level.
// Inputs:
//   - placement: token data (column/row/width/height/levelId).
//   - mapLevelsState: scene's normalized map levels (Level 1+ only; Level 0
//     is virtual and always prepended internally).
//   - options.viewerLevelId: the per-user resolved active level. Defaults
//     to Level 0 when missing or unknown.
//   - options.gmViewing: GM bypass — every token is visible regardless of
//     cutouts (§5.5.2/§5.5.3).
//   - options.mode: 'vision' (default) or 'interaction' for click-through
//     gating; matches the Step 1 blocker semantics.
//   - options.cells: optional explicit cell list (used by interaction
//     point checks).
// Returns presentation metadata: {visible, fullyVisible, hasLevels,
// sameLevel, direction, distance, scale, indicator, levelId,
// activeLevelId, levelIndex, activeLevelIndex, bounds, visibleCells}.
// `visibleCells` is non-null only when same-level partial-cell visibility
// applies (legacy partial-mask behavior). Cross-level visibility is binary
// per §5.5.4.
export function getTokenLevelPresentation(placement = {}, mapLevelsState = null, options = {}) {
  const levels = getOrderedLevelsWithBase(mapLevelsState?.levels ?? []);
  const placementLevelId = resolvePlacementLevelId(placement);
  const placementLevelIndex = levels.findIndex((level) => level.id === placementLevelId);

  const viewerOverride = normalizeTokenLevelId(options?.viewerLevelId);
  const viewerLevelId = viewerOverride && levels.some((level) => level.id === viewerOverride)
    ? viewerOverride
    : BASE_MAP_LEVEL_ID;
  const viewerLevelIndex = levels.findIndex((level) => level.id === viewerLevelId);

  if (placementLevelIndex < 0 || viewerLevelIndex < 0) {
    return createTokenLevelPresentationResult({
      visible: false,
      hasLevels: levels.length > 1,
      levelId: placementLevelId,
      activeLevelId: viewerLevelId,
      levelIndex: placementLevelIndex,
      activeLevelIndex: viewerLevelIndex,
    });
  }

  const direction =
    placementLevelIndex === viewerLevelIndex
      ? 'same'
      : placementLevelIndex > viewerLevelIndex
        ? 'above'
        : 'below';
  const distance = Math.abs(placementLevelIndex - viewerLevelIndex);
  const scale = getMapLevelDistanceScale(direction, distance);
  const indicator = direction === 'same' ? null : { direction, distance };
  const gmViewing = Boolean(options?.gmViewing);
  const placementBounds = normalizePlacementBounds(placement);

  if (direction === 'same') {
    return createTokenLevelPresentationResult({
      visible: true,
      fullyVisible: true,
      hasLevels: true,
      sameLevel: true,
      direction,
      distance: 0,
      scale: 1,
      indicator: null,
      levelId: placementLevelId,
      activeLevelId: viewerLevelId,
      levelIndex: placementLevelIndex,
      activeLevelIndex: viewerLevelIndex,
      bounds: placementBounds,
    });
  }

  if (gmViewing) {
    return createTokenLevelPresentationResult({
      visible: true,
      fullyVisible: true,
      hasLevels: true,
      direction,
      distance,
      scale,
      indicator,
      levelId: placementLevelId,
      activeLevelId: viewerLevelId,
      levelIndex: placementLevelIndex,
      activeLevelIndex: viewerLevelIndex,
      bounds: placementBounds,
    });
  }

  const lower = Math.min(placementLevelIndex, viewerLevelIndex);
  const higher = Math.max(placementLevelIndex, viewerLevelIndex);
  const mode = options?.mode === 'interaction' ? 'interaction' : 'vision';
  const blockingExpandedSets = [];
  for (let index = lower + 1; index <= higher; index += 1) {
    const level = levels[index];
    if (!doesMapLevelBlockLowerLevels(level, mode)) {
      continue;
    }
    blockingExpandedSets.push(buildExpandedCutoutCellSet(level));
  }

  if (!blockingExpandedSets.length) {
    return createTokenLevelPresentationResult({
      visible: true,
      fullyVisible: true,
      hasLevels: true,
      direction,
      distance,
      scale,
      indicator,
      levelId: placementLevelId,
      activeLevelId: viewerLevelId,
      levelIndex: placementLevelIndex,
      activeLevelIndex: viewerLevelIndex,
      bounds: placementBounds,
    });
  }

  const cells = Array.isArray(options?.cells)
    ? normalizePlacementCells(options.cells, placementBounds)
    : getPlacementCells(placementBounds);

  if (!cells.length) {
    return createTokenLevelPresentationResult({
      visible: false,
      hasLevels: true,
      direction,
      distance,
      scale,
      indicator: null,
      levelId: placementLevelId,
      activeLevelId: viewerLevelId,
      levelIndex: placementLevelIndex,
      activeLevelIndex: viewerLevelIndex,
      bounds: placementBounds,
    });
  }

  const anyVisible = cells.some((cell) => {
    const key = `${cell.column},${cell.row}`;
    return blockingExpandedSets.every((set) => set.has(key));
  });

  return createTokenLevelPresentationResult({
    visible: anyVisible,
    fullyVisible: anyVisible,
    hasLevels: true,
    direction,
    distance,
    scale,
    indicator: anyVisible ? indicator : null,
    levelId: placementLevelId,
    activeLevelId: viewerLevelId,
    levelIndex: placementLevelIndex,
    activeLevelIndex: viewerLevelIndex,
    bounds: placementBounds,
  });
}

function createTokenLevelPresentationResult({
  visible,
  fullyVisible = false,
  hasLevels = false,
  sameLevel = false,
  direction = 'same',
  distance = 0,
  scale = 1,
  indicator = null,
  levelId = null,
  activeLevelId = null,
  levelIndex = -1,
  activeLevelIndex = -1,
  bounds = null,
  visibleCells = null,
} = {}) {
  return {
    visible: Boolean(visible),
    fullyVisible: Boolean(fullyVisible),
    hasLevels: Boolean(hasLevels),
    sameLevel: Boolean(sameLevel),
    direction,
    distance: Math.max(0, Math.trunc(Number.isFinite(distance) ? distance : 0)),
    scale: Number.isFinite(scale) && scale > 0 ? scale : 1,
    indicator: indicator && typeof indicator === 'object' ? indicator : null,
    levelId,
    activeLevelId,
    levelIndex,
    activeLevelIndex,
    bounds,
    visibleCells: Array.isArray(visibleCells) ? visibleCells : null,
  };
}

function doesMapLevelBlockLowerLevels(level, mode) {
  if (!level || typeof level !== 'object' || level.visible === false) {
    return false;
  }

  if (mode === 'interaction') {
    if (level.blocksLowerLevelInteraction === false) {
      return false;
    }
  } else if (level.blocksLowerLevelVision === false) {
    return false;
  }

  if (Number.isFinite(level.opacity) && level.opacity <= 0) {
    return false;
  }

  return typeof level.mapUrl === 'string' && level.mapUrl.trim().length > 0;
}

function isMapLevelCutOutAtCell(level, cell) {
  const cutouts = Array.isArray(level?.cutouts) ? level.cutouts : [];
  return cutouts.some((cutout) => cutoutContainsCell(cutout, cell));
}

function cutoutContainsCell(cutout = {}, cell = {}) {
  const column = normalizeNonNegativeInt(cutout.column ?? cutout.col ?? cutout.x, null);
  const row = normalizeNonNegativeInt(cutout.row ?? cutout.y, null);
  if (column === null || row === null) {
    return false;
  }

  const width = Math.max(1, normalizeNonNegativeInt(cutout.width ?? cutout.columns ?? cutout.w, 1));
  const height = Math.max(1, normalizeNonNegativeInt(cutout.height ?? cutout.rows ?? cutout.h, 1));
  return (
    cell.column >= column &&
    cell.column < column + width &&
    cell.row >= row &&
    cell.row < row + height
  );
}

function normalizeNonNegativeInt(value, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value));
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isFinite(parsed)) {
    return Math.max(0, parsed);
  }

  if (fallback === null) {
    return null;
  }

  return Math.max(0, Math.trunc(fallback));
}
