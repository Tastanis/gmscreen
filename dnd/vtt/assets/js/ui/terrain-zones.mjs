// Tagged terrain zones ("blood", "water"): shared read helpers for the board.
// A scene without zone data has no zones; nothing here invents any.
export const ZONE_DEFAULT_COST = 2;
export const BASE_LEVEL_ID = 'level-0';

const TAG_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const isSquare = (pair) => Array.isArray(pair) && pair.length === 2 && Number.isInteger(pair[0]) && Number.isInteger(pair[1]) && pair[0] >= 0 && pair[1] >= 0;

/** Accepts the stored field ({revision, value}) or its value. Returns clean, frozen-shape zones. */
export function normalizeZones(field) {
  const value = field && typeof field === 'object' && 'value' in field ? field.value : field;
  if (!value || typeof value !== 'object' || value.version !== 1 || !Array.isArray(value.zones)) return [];
  const zones = [];
  const seen = new Set();
  for (const zone of value.zones) {
    if (!zone || typeof zone !== 'object' || typeof zone.id !== 'string' || !zone.id || seen.has(zone.id)) continue;
    if (typeof zone.tag !== 'string' || !TAG_PATTERN.test(zone.tag) || !Array.isArray(zone.squares)) continue;
    const squares = zone.squares.filter(isSquare).map(([column, row]) => [column, row]);
    if (!squares.length) continue;
    seen.add(zone.id);
    zones.push({
      id: zone.id,
      tag: zone.tag,
      label: typeof zone.label === 'string' ? zone.label : '',
      levelId: typeof zone.levelId === 'string' && zone.levelId ? zone.levelId : BASE_LEVEL_ID,
      // null means "the floor's own height"; callers resolve it against the scene's floors.
      surfaceHeight: Number.isFinite(zone.surfaceHeight) ? zone.surfaceHeight : null,
      cost: Number.isInteger(zone.cost) && zone.cost >= 1 ? zone.cost : ZONE_DEFAULT_COST,
      gmOnly: zone.gmOnly === true,
      squares,
    });
  }
  return zones;
}

/** Zones of one scene from the board state (sceneState keyed by scene id). */
export function sceneZones(sceneState, sceneId) {
  return normalizeZones(sceneState?.[sceneId]?.environment?.zones ?? null);
}

const squareKey = (levelId, column, row) => `${levelId}|${column},${row}`;

/** Lookup table from a floor square to the zones covering it. */
export function buildZoneIndex(zones) {
  const index = new Map();
  for (const zone of zones || []) {
    for (const [column, row] of zone.squares) {
      const key = squareKey(zone.levelId, column, row);
      const list = index.get(key);
      if (list) list.push(zone); else index.set(key, [zone]);
    }
  }
  return index;
}

export function zonesAtSquare(index, column, row, levelId = BASE_LEVEL_ID) {
  return index?.get(squareKey(levelId || BASE_LEVEL_ID, Math.floor(column), Math.floor(row))) ?? [];
}

/** Highest movement multiplier among the zones on a square; 1 when the square is ordinary ground. */
export function squareCostMultiplier(index, column, row, levelId = BASE_LEVEL_ID) {
  let cost = 1;
  for (const zone of zonesAtSquare(index, column, row, levelId)) cost = Math.max(cost, zone.cost);
  return cost;
}
