import { normalizeMapLevelsState } from '../state/normalize/map-levels.js';

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

export function getAdjacentTokenLevel(mapLevelsState = null, currentLevelId = null, direction = 'up') {
  const levels = getOrderedTokenMapLevels(mapLevelsState?.levels ?? []);
  if (levels.length < 2) {
    return null;
  }

  const resolvedCurrentId = normalizeTokenLevelId(currentLevelId) ??
    resolveTokenLevelId({}, mapLevelsState);
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

export function getTokenLevelControlState(mapLevelsState = null, placement = {}) {
  const levels = getOrderedTokenMapLevels(mapLevelsState?.levels ?? []);
  const currentLevelId = resolveTokenLevelId(placement, mapLevelsState);
  const currentLevel = levels.find((level) => level.id === currentLevelId) ?? null;

  return {
    hasLevels: levels.length > 0,
    levels,
    currentLevel,
    currentLevelId,
    canMoveDown: Boolean(getAdjacentTokenLevel(mapLevelsState, currentLevelId, 'down')),
    canMoveUp: Boolean(getAdjacentTokenLevel(mapLevelsState, currentLevelId, 'up')),
  };
}

export function getMapLevelNavigationControlState(mapLevelsState = null) {
  const levels = getOrderedTokenMapLevels(mapLevelsState?.levels ?? []);
  const currentLevelId = resolveTokenLevelId({}, mapLevelsState);
  const currentLevel = levels.find((level) => level.id === currentLevelId) ?? null;

  return {
    hasLevels: levels.length > 0,
    levels,
    currentLevel,
    currentLevelId,
    canMoveDown: Boolean(getAdjacentTokenLevel(mapLevelsState, currentLevelId, 'down')),
    canMoveUp: Boolean(getAdjacentTokenLevel(mapLevelsState, currentLevelId, 'up')),
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
