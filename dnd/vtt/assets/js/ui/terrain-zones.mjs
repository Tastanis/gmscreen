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

/** The GM's display switch: when true, players do not see the zone overlay (they still pay for the terrain). */
export function zonesHiddenFromPlayers(field) {
  const value = field && typeof field === 'object' && 'value' in field ? field.value : field;
  return value?.hiddenFromPlayers === true;
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

// ---- Standing in a zone -------------------------------------------------
// A token is in a zone when it is on the zone's floor, part of its footprint
// is on a zone square, and its feet are not clearly above the zone's surface.
// A flier, or a token on a bridge or deck over the zone, is therefore not in it.
export const ZONE_HEIGHT_TOLERANCE = 0.5;

export function zoneSurface(zone, floorElevation = 0) {
  return Number.isFinite(zone?.surfaceHeight) ? zone.surfaceHeight : floorElevation;
}

export function footprintSquares(placement) {
  const column = Number(placement?.column) || 0, row = Number(placement?.row) || 0;
  const width = Math.max(1, Number(placement?.width) || 1), height = Math.max(1, Number(placement?.height) || 1);
  const squares = [];
  for (let r = Math.floor(row + 1e-6); r < Math.ceil(row + height - 1e-6); r++) {
    for (let c = Math.floor(column + 1e-6); c < Math.ceil(column + width - 1e-6); c++) squares.push([c, r]);
  }
  return squares;
}

/**
 * @param index            from buildZoneIndex
 * @param placement        token ({column,row,width,height,levelId})
 * @param standingHeight   absolute height of the token's feet, in squares
 * @param floorElevationOf (levelId) => height of that floor, for zones with no surfaceHeight
 */
export function zonesForFootprint(index, placement, standingHeight, floorElevationOf = () => 0) {
  if (!index?.size || !placement) return [];
  const levelId = placement.levelId || BASE_LEVEL_ID;
  const height = Number.isFinite(standingHeight) ? standingHeight : Number(floorElevationOf(levelId)) || 0;
  const found = new Map();
  for (const [column, row] of footprintSquares(placement)) {
    for (const zone of zonesAtSquare(index, column, row, levelId)) {
      if (found.has(zone.id)) continue;
      if (height - zoneSurface(zone, Number(floorElevationOf(zone.levelId)) || 0) < ZONE_HEIGHT_TOLERANCE) found.set(zone.id, zone);
    }
  }
  return [...found.values()];
}

export const zoneTags = (zones) => [...new Set((zones || []).map((zone) => zone.tag))];

// ---- Movement cost --------------------------------------------------------
// Entering a difficult square costs its multiplier instead of 1 (x2 is the
// rulebook's "1 additional square"). Forced movement and teleports ignore it.
/**
 * Totals a walked route. `stepsBetween(a, b)` returns the per-square walk
 * from one waypoint to the next ({points, cost, extra}, as routeSteps does).
 * distance is the route without difficult terrain; cost is what it really costs.
 */
export function summarizeRoute(points, stepsBetween) {
  const summary = { distance: 0, cost: 0, extra: 0, difficult: [] };
  for (let i = 1; i < (points?.length || 0); i++) {
    const walked = stepsBetween(points[i - 1], points[i]);
    if (!walked) continue;
    const extra = Number(walked.extra) || 0;
    summary.cost += Number(walked.cost) || 0;
    summary.extra += extra;
    summary.distance += (Number(walked.cost) || 0) - extra;
    for (let k = 1; k < (walked.points?.length || 0); k++) {
      const step = walked.points[k];
      if (step.multiplier > 1) summary.difficult.push({ column: step.column, row: step.row, multiplier: step.multiplier, from: { column: walked.points[k - 1].column, row: walked.points[k - 1].row } });
    }
  }
  return summary;
}

// ---- Drawing --------------------------------------------------------------
const ZONE_COLORS = { blood: '#c1121f', water: '#1d6fd6', mud: '#8a5a2b', lava: '#f97316', fire: '#f97316', acid: '#65a30d', poison: '#65a30d', ice: '#7dd3fc', oil: '#6b21a8' };
export const zoneColor = (tag) => ZONE_COLORS[tag] || '#d4a017';

/**
 * Outline and fill for one zone. `corner(column, row)` maps a grid corner to
 * overlay pixels (it applies the terrain projection when the map has height).
 * Returns SVG path data: every square as a closed quad, and only the outer
 * edges for the outline, plus the square nearest the middle for a label.
 */
export function zoneGeometry(zone, corner) {
  const inZone = new Set(zone.squares.map(([column, row]) => `${column},${row}`));
  const fill = [], outline = [];
  const fmt = (p) => `${Math.round(p.x * 10) / 10},${Math.round(p.y * 10) / 10}`;
  let sumColumn = 0, sumRow = 0;
  for (const [column, row] of zone.squares) {
    const a = corner(column, row), b = corner(column + 1, row), c = corner(column + 1, row + 1), d = corner(column, row + 1);
    fill.push(`M${fmt(a)}L${fmt(b)}L${fmt(c)}L${fmt(d)}Z`);
    if (!inZone.has(`${column},${row - 1}`)) outline.push(`M${fmt(a)}L${fmt(b)}`);
    if (!inZone.has(`${column + 1},${row}`)) outline.push(`M${fmt(b)}L${fmt(c)}`);
    if (!inZone.has(`${column},${row + 1}`)) outline.push(`M${fmt(c)}L${fmt(d)}`);
    if (!inZone.has(`${column - 1},${row}`)) outline.push(`M${fmt(d)}L${fmt(a)}`);
    sumColumn += column; sumRow += row;
  }
  const middle = [sumColumn / zone.squares.length, sumRow / zone.squares.length];
  let labelSquare = zone.squares[0], best = Infinity;
  for (const square of zone.squares) {
    const distance = (square[0] - middle[0]) ** 2 + (square[1] - middle[1]) ** 2;
    if (distance < best) { best = distance; labelSquare = square; }
  }
  return { fill: fill.join(''), outline: outline.join(''), edges: outline.length, labelSquare };
}

/**
 * Where the corner control goes: the bottom left of the board, stepping to the right of, or
 * above, any panel that covers that corner. `blockerAt(left, top)` returns the rectangle of a
 * panel lying over the control when it is placed there, or null. Returns null when there is no
 * free place (a full-screen layer, or a narrow window the panel nearly fills): the control then
 * waits out of sight until the panel closes.
 */
export function placeCornerControl({frame, viewport, size, gap = 6, blockerAt = () => null} = {}) {
  let left = Math.max(gap, frame.left + gap), bottom = Math.max(gap, viewport.height - frame.bottom + gap);
  for (let attempt = 0; attempt < 6; attempt++) {
    const rect = blockerAt(left, viewport.height - bottom - size.height);
    if (!rect) break;
    if (rect.width >= viewport.width * 0.9 && rect.height >= viewport.height * 0.9) return null;
    if (rect.right + gap + size.width <= viewport.width - gap) left = rect.right + gap;
    else { left = Math.max(gap, frame.left + gap); bottom = Math.max(bottom + size.height + gap, viewport.height - rect.top + gap); }
  }
  if (viewport.height - bottom - size.height < 0 || left + size.width > viewport.width) return null;
  return {left: Math.round(left), bottom: Math.round(bottom)};
}
