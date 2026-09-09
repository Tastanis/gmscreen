/** Floor heights in grid squares. Does not establish visibility or line of effect. */
export const BASE_FLOOR_ID = 'level-0';

export function floorElevations(raw = {}) {
  const config = Array.isArray(raw) ? {levels: raw} : raw?.mapLevels || raw || {};
  const levels = (config.levels || []).filter(level => level?.id && level.id !== BASE_FLOOR_ID)
    .map((level, index) => ({level, index}))
    .sort((a, b) => (Number(a.level.zIndex ?? a.index) - Number(b.level.zIndex ?? b.index)) || a.index - b.index);
  const elevations = new Map([[BASE_FLOOR_ID, 0]]);
  let previous = 0;
  for (const {level} of levels) {
    const explicit = level.elevationSquares;
    const elevation = typeof explicit === 'number' && Number.isSafeInteger(explicit) && explicit > 0
      ? explicit : previous + 1;
    elevations.set(level.id, elevation);
    previous = elevation;
  }
  return elevations;
}

export function verticalFloorDistance(a, b, config) {
  const heights = floorElevations(config);
  const aHeight = heights.get(a?.levelId || BASE_FLOOR_ID);
  const bHeight = heights.get(b?.levelId || BASE_FLOOR_ID);
  return aHeight === undefined || bHeight === undefined ? null : Math.abs(aHeight - bHeight);
}

/** Accept the existing horizontal footprint distance; never replace it with centre distance. */
export function distanceWithFloorHeight(horizontalDistance, a, b, config) {
  if (!Number.isFinite(horizontalDistance) || horizontalDistance < 0) return null;
  const vertical = verticalFloorDistance(a, b, config);
  return vertical === null ? null : Math.max(horizontalDistance, vertical);
}
