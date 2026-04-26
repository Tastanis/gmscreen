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
