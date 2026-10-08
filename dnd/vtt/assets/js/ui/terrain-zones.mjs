// Tagged terrain zones ("blood", "water"): shared read helpers for the board.
// A scene without zone data has no zones; nothing here invents any.
import { intersectsFloor, resolveSupportSurfaces } from './floor-support.js';
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
const PLATE_GAP = 0.02; // a plate this little above a liquid already counts as out of it

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
 * @param options.onPlate  the token stands on a deck, plank or other plate
 * @param options.reach    0 (default): zones the token is in. 1: zones it is in or adjacent to,
 *                         meaning within one square of its space, sideways or above the surface.
 */
export function zonesForFootprint(index, placement, standingHeight, floorElevationOf = () => 0, { onPlate = false, reach = 0 } = {}) {
  if (!index?.size || !placement) return [];
  const levelId = placement.levelId || BASE_LEVEL_ID;
  const height = Number.isFinite(standingHeight) ? standingHeight : Number(floorElevationOf(levelId)) || 0;
  const near = Math.max(0, Math.trunc(Number(reach) || 0));
  const width = Math.max(1, Number(placement.width) || 1), depth = Math.max(1, Number(placement.height) || 1);
  const space = near
    ? { ...placement, column: (Number(placement.column) || 0) - near, row: (Number(placement.row) || 0) - near, width: width + near * 2, height: depth + near * 2 }
    : placement;
  const found = new Map();
  for (const [column, row] of footprintSquares(space)) {
    for (const zone of zonesAtSquare(index, column, row, levelId)) {
      if (found.has(zone.id)) continue;
      // On a deck, plank or other plate, any gap at all above the surface keeps the token out of
      // the zone. On plain ground the feet must be within half a square of the surface. Next to
      // a zone is looser: a deck one square above the blood is adjacent to it.
      const gap = height - zoneSurface(zone, Number(floorElevationOf(zone.levelId)) || 0);
      const limit = near ? near + ZONE_HEIGHT_TOLERANCE : (onPlate ? PLATE_GAP : ZONE_HEIGHT_TOLERANCE);
      if (gap < limit) found.set(zone.id, zone);
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
  const summary = { distance: 0, cost: 0, extra: 0, difficult: [], climbs: [], climbExtra: 0 };
  let entered = null; // the difficult square just walked into, until the route's next square is known
  for (let i = 1; i < (points?.length || 0); i++) {
    const walked = stepsBetween(points[i - 1], points[i]);
    if (!walked) continue;
    const extra = Number(walked.extra) || 0;
    summary.cost += Number(walked.cost) || 0;
    summary.extra += extra;
    summary.distance += (Number(walked.cost) || 0) - extra;
    for (let k = 1; k < (walked.points?.length || 0); k++) {
      const step = walked.points[k];
      const from = { column: walked.points[k - 1].column, row: walked.points[k - 1].row };
      // `next` is the square the route walks on to; the ruler ends its red stretch at that edge.
      if (entered) entered.next = { column: step.column, row: step.row };
      entered = null;
      if (step.multiplier > 1) summary.difficult.push(entered = { column: step.column, row: step.row, multiplier: step.multiplier, from });
      if (step.climb > 0) { summary.climbs.push({ column: step.column, row: step.row, rise: step.rise, extra: step.climb, from }); summary.climbExtra += step.climb; }
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

// ---- Who pays ---------------------------------------------------------------
/** Everything a token's record says about how it moves ("Climb", "Burrow, Climb", "Swim"). */
export function movementText(placement) {
  const monster = placement?.monster && typeof placement.monster === 'object' ? placement.monster : placement?.metadata?.monster;
  const modes = monster?.movement_modes;
  return [placement?.movement, placement?.traits?.movement, placement?.metadata?.movement, monster?.movement, ...(Array.isArray(modes) ? modes : [modes])]
    .filter((value) => typeof value === 'string').join(', ');
}
/** True when the token's movement text names this movement type as a whole word ("climb", "swim"). */
export function hasMovementType(placement, type) {
  return new RegExp(`\\b${String(type).replace(/[^a-z]/gi, '')}\\b`, 'i').test(movementText(placement));
}

// ---- Liquid, and who moves through it at full speed --------------------------
// THE ONE LIST of zone tags that are liquid. A creature with a swim speed pays no extra
// movement in a zone with one of these tags. Mud and lava are left out on purpose.
export const LIQUID_TAGS = new Set(['water', 'blood', 'liquid', 'oil', 'acid', 'slime', 'sewage']);
export const isLiquidTag = (tag) => LIQUID_TAGS.has(tag);

const waivers = new Map();
/**
 * What a token's movement lets it ignore, read from its movement text:
 *  - the word "swim" ("Swim", "Swim 4", "5 swim", "Swim, Climb"): every liquid zone;
 *  - "walks on X", "walks on X and Y" ("Walks on water and blood"): zones with those tags.
 * Items in the text are separated by commas, semicolons or full stops; the tags after
 * "walks on" by "and", "or", "&" or "/". Only the movement cost is waived: the token is
 * still in the zone, and still carries its tags.
 */
export function movementWaiver(placement) {
  const text = movementText(placement).toLowerCase();
  let waiver = waivers.get(text);
  if (!waiver) {
    const tags = new Set();
    for (const item of text.split(/[,;.]/)) {
      const list = item.match(/\bwalk(?:s|ing)?\s+on\s+(.+)$/)?.[1];
      for (const part of (list || '').split(/\s+and\s+|\s+or\s+|\s*&\s*|\s*\/\s*/)) {
        const tag = part.trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        if (tag) tags.add(tag);
      }
    }
    waiver = { liquids: /\bswim\b/.test(text), tags };
    if (waivers.size > 500) waivers.clear();
    waivers.set(text, waiver);
  }
  return waiver;
}
/** The movement multiplier this zone charges this mover: 1 when its movement waives the zone. */
export function zoneCostFor(zone, waiver = null) {
  return waiver && ((waiver.liquids && isLiquidTag(zone.tag)) || waiver.tags?.has(zone.tag)) ? 1 : zone.cost;
}

/**
 * True when a token with its feet at `feet` is standing on a deck, plank or other floor plate
 * rather than on the ground: a plate on its floor lies under its body at that height.
 * `model` is the scene's wall and floor design; `mapLevels` its floors.
 */
export function standsOnPlate(placement, feet, model, mapLevels = null) {
  if (!placement || !Number.isFinite(feet) || !model) return false;
  const levelId = placement.levelId || BASE_LEVEL_ID;
  const cuts = (mapLevels?.levels || []).find((level) => level.id === levelId)?.cutouts || [];
  return resolveSupportSurfaces(model).some((surface) => (surface.kind === 'floor' || surface.templateCube)
    && (surface.levelId || BASE_LEVEL_ID) === levelId && Math.abs(surface.height - feet) <= 0.03
    && intersectsFloor(placement, surface, cuts));
}
