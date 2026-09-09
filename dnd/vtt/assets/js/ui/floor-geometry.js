import { verticalFloorDistance } from '../state/normalize/floor-elevation.js';
import { hasOpenFloorPath } from './token-levels.js';
import { BASE_MAP_LEVEL_ID, buildLevelViewModel } from '../state/normalize/map-levels.js';

export function orderedPhysicalFloors(raw = []) {
  const mapLevels = Array.isArray(raw) ? { levels: raw } : raw?.mapLevels || raw || {};
  return buildLevelViewModel({ mapLevels: { ...mapLevels,
    levels: (mapLevels.levels || []).filter(level => level?.id !== BASE_MAP_LEVEL_ID),
  } }).filter(level => level.hidden !== true);
}

export function floorRelation(a, b, mapLevels = []) {
  const levels = orderedPhysicalFloors(mapLevels);
  const aIndex = levels.findIndex(level => level.id === (a?.levelId || BASE_MAP_LEVEL_ID));
  const bIndex = levels.findIndex(level => level.id === (b?.levelId || BASE_MAP_LEVEL_ID));
  if (aIndex < 0 || bIndex < 0) return 'unknown';
  return aIndex === bIndex ? 'same' : aIndex > bIndex ? 'above' : 'below';
}

/** Same-floor adjacency can be established in 2D; different floors need elevation/opening data. */
export function canConfirmPlanarAdjacency(a, b, mapLevels = []) {
  return Boolean(a && b && !a.hidden && !a.isHidden && !b.hidden && !b.isHidden
    && floorRelation(a, b, mapLevels) === 'same');
}

/** Combine with horizontal footprint/radius checks; this is not a wall/diagonal-ray model. */
export function canReachFloor(a, b, range, raw = {}) {
  if (!a || !b || !Number.isFinite(range) || range < 0) return false;
  const config = Array.isArray(raw) ? {levels:raw} : raw?.mapLevels || raw || {};
  const distance = verticalFloorDistance(a,b,config);
  return distance !== null && distance <= range && hasOpenFloorPath(a,b,config);
}
