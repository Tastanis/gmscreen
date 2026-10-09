// How a walk uses a stair or ramp, for previews (the ruler, the reach outline). The server decides
// the real move (FloorGeometry.php); this is the same rule, written out again so a preview can
// know that a walker who goes down a ramp arrives on the floor at its foot, not on the ground far
// below it. Pure: no board, no page. stair-walk.test.mjs checks it against answers from the server's code.
const EPSILON = 0.000001;
const BASE = 'level-0';

/** The stair's outline as unit edges, with the ids its edge colours are stored under. */
export function stairPerimeter(corners) {
  if (!Array.isArray(corners) || corners.length !== 4) return [];
  const segments = new Map();
  for (let i = 0; i < 4; i++) {
    const a = corners[i], b = corners[(i + 1) % 4];
    if (![a?.column, a?.row, b?.column, b?.row].every((value) => value !== undefined && value !== null)) return [];
    let x = Math.trunc(a.column), y = Math.trunc(a.row);
    const dx = Math.trunc(b.column) - x, dy = Math.trunc(b.row) - y;
    const nx = Math.abs(dx), ny = Math.abs(dy), total = nx + ny;
    if (total > 10000) return [];
    let h = 0, v = 0;
    for (let k = 1; k <= total; k++) {
      const from = { x, y };
      const horizontal = h >= nx ? false : (v >= ny || h + 0.5 < (k * nx) / total);
      if (horizontal) { x += Math.sign(dx); h++; } else { y += Math.sign(dy); v++; }
      const to = { x, y };
      const [first, last] = (from.x < x || (from.x === x && from.y < y)) ? [from, to] : [to, from];
      const id = `${first.x},${first.y}-${last.x},${last.y}`;
      segments.set(id, { id, from, to });
    }
  }
  return [...segments.values()];
}

function inside(point, edges) {
  let within = false;
  for (const { from: a, to: b } of edges) {
    if ((a.y > point.y) !== (b.y > point.y) && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) within = !within;
  }
  return within;
}

const colourOf = (stair, id) => stair.edgeColors?.[id] ?? 'barrier';

/**
 * Follows a path of {x, y} points (a token's centre) across one stair.
 * Returns {fired, entry, endsInside}: `fired` when the path went in by the stair's own end and out
 * by the other (the token changes floor); otherwise `entry` is how it came onto the stair, kept
 * while it is still on it.
 */
export function stairCrossing(path, stair, priorEntry = null) {
  const edges = stairPerimeter(stair?.corners);
  const result = { fired: false, entry: null, endsInside: false };
  if (!edges.length || path.length < 2) return result;
  let entry = ['red', 'green', 'barrier'].includes(priorEntry) ? priorEntry : (inside(path[0], edges) ? 'barrier' : null);
  let endsInside = inside(path[0], edges);
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
    if (length < EPSILON) continue;
    const hits = [];
    for (const edge of edges) {
      const q = edge.from, r = edge.to, ex = r.x - q.x, ey = r.y - q.y;
      const denominator = dx * ey - dy * ex;
      if (Math.abs(denominator) < EPSILON) continue;
      const t = ((q.x - a.x) * ey - (q.y - a.y) * ex) / denominator;
      const u = ((q.x - a.x) * dy - (q.y - a.y) * dx) / denominator;
      if (t < 0 || t > 1 || u < 0 || u >= 1) continue;
      hits.push({ t, color: colourOf(stair, edge.id) });
    }
    // Stable, like the server's sort of an already ordered list of equal keys.
    hits.sort((first, second) => first.t - second.t);
    for (const hit of hits) {
      const t = hit.t, delta = EPSILON / length;
      const before = inside({ x: a.x + (t - delta) * dx, y: a.y + (t - delta) * dy }, edges);
      const after = inside({ x: a.x + (t + delta) * dx, y: a.y + (t + delta) * dy }, edges);
      if (before === after) continue; // Touching the outline, not going in or out.
      // The bottom two squares of a stair may be entered from the side.
      if (hit.color === 'barrier' && ((!before && stair.direction === 'up') || (before && stair.direction === 'down' && entry === 'green'))) {
        const point = { x: a.x + t * dx, y: a.y + t * dy };
        for (const low of edges) {
          if (colourOf(stair, low.id) !== 'red') continue;
          const lo = low.from, hi = low.to, lx = hi.x - lo.x, ly = hi.y - lo.y, ll = lx * lx + ly * ly;
          const u = ll ? Math.max(0, Math.min(1, ((point.x - lo.x) * lx + (point.y - lo.y) * ly) / ll)) : 0;
          if (Math.hypot(point.x - lo.x - u * lx, point.y - lo.y - u * ly) <= 2 + EPSILON) { hit.color = 'red'; break; }
        }
      }
      endsInside = after;
      if (!before) {
        if (t > EPSILON || entry === null || (i === 1 && priorEntry === null)) entry = hit.color;
        continue;
      }
      const up = stair.direction === 'up';
      if ((up && entry === 'red' && hit.color === 'green') || (!up && stair.direction === 'down' && entry === 'green' && hit.color === 'red')) {
        return { fired: true, entry: null, endsInside: false };
      }
      entry = null;
    }
  }
  return { fired: false, entry: endsInside ? entry : null, endsInside };
}

/** Which way the stair runs: 'x' when its foot and head edges run north to south, 'y' when east to west, null when it is not straight. */
function stairAxis(stair) {
  let across = null;
  for (const edge of stairPerimeter(stair?.corners)) {
    if (!['red', 'green'].includes(colourOf(stair, edge.id))) continue;
    const axis = edge.from.y === edge.to.y ? 'x' : 'y';
    if (across !== null && across !== axis) return null;
    across = axis;
  }
  return across;
}

/**
 * The path a token walks a stair by. A token wider than the stair, or to one side of it, walks it
 * with the part of it that is on the stair: across the stair's width its point is moved onto the
 * stair's own squares. A token that fits inside the stair is unchanged.
 */
export function stairLane(path, stair, width, height) {
  const across = stairAxis(stair);
  if (across === null) return path;
  const size = across === 'x' ? width : height;
  const values = stair.corners.map((corner) => Number(corner[across === 'x' ? 'column' : 'row']));
  const min = Math.min(...values), max = Math.max(...values);
  return path.map((point) => {
    const start = point[across] - size / 2;
    const lo = Math.max(start, min), hi = Math.min(start + size, max);
    return hi - lo >= 1 - EPSILON ? { ...point, [across]: Math.max(lo + 0.5, Math.min(hi - 0.5, point[across])) } : point;
  });
}

/** The floors of a scene in order, with the ground first, as the server orders them. */
function orderedLevels(mapLevels) {
  const levels = (mapLevels?.levels || []).map((level, index) => ({ level, index }))
    .filter(({ level }) => level && typeof level === 'object' && level.id && level.id !== BASE);
  levels.sort((a, b) => ((a.level.zIndex ?? a.index) - (b.level.zIndex ?? b.index)) || (a.index - b.index));
  return [{ id: BASE, cutouts: [] }, ...levels.map(({ level }) => level)];
}

/**
 * One step of a walk, as far as stairs are concerned. `placement` is the token (or its ghost) with
 * its floor and any stair progress; `to` is {column, row}. Returns null when no stair is involved,
 * otherwise:
 *   {fired: true, levelId}              it walked off the far end and is on that floor now;
 *   {fired: false, traversal, carried}  it is on the stair; `carried` when the stair holds it up
 *                                       (it came on by the end that belongs to its floor).
 */
export function stairStep(placement, to, mapLevels) {
  const levelId = placement?.levelId || BASE;
  if (!mapLevels || ['fly', 'hover'].includes(placement?.movementMode)) return null;
  const levels = orderedLevels(mapLevels), byId = new Map(levels.map((level) => [level.id, level]));
  const own = byId.get(levelId);
  if (!own || own.hidden === true) return null;
  const stairs = levelId === BASE ? (mapLevels.baseStairs || []) : (own.stairs || []);
  if (!stairs.length) return null;
  const width = Math.max(1, Number(placement.width) || 1), height = Math.max(1, Number(placement.height) || 1);
  const path = [{ x: placement.column + width / 2, y: placement.row + height / 2 }, { x: to.column + width / 2, y: to.row + height / 2 }];
  for (const stair of stairs) {
    const target = stair.linkedLevelId ?? '';
    if (!byId.has(target) || target === levelId || byId.get(target).hidden === true) continue;
    const prior = placement._floorTraversal?.stairId === stair.id ? (placement._floorTraversal.entry ?? null) : null;
    const crossing = stairCrossing(stairLane(path, stair, width, height), stair, prior);
    if (crossing.fired) return { fired: true, levelId: target, stairId: stair.id };
    if (crossing.endsInside) {
      const carried = (stair.direction === 'down' && crossing.entry === 'green') || (stair.direction === 'up' && crossing.entry === 'red');
      return { fired: false, levelId, traversal: { stairId: stair.id, entry: crossing.entry }, carried };
    }
  }
  return null;
}

/** True when a step from the placement to `to` passes within a square of any stair of its floor. */
export function nearStair(placement, to, mapLevels) {
  const levelId = placement?.levelId || BASE;
  const stairs = levelId === BASE ? mapLevels?.baseStairs : (mapLevels?.levels || []).find((level) => level?.id === levelId)?.stairs;
  if (!stairs?.length) return false;
  const size = Math.max(1, Number(placement.width) || 1, Number(placement.height) || 1);
  const left = Math.min(placement.column, to.column) - 1, right = Math.max(placement.column, to.column) + size + 1;
  const top = Math.min(placement.row, to.row) - 1, bottom = Math.max(placement.row, to.row) + size + 1;
  return stairs.some((stair) => {
    const columns = (stair.corners || []).map((corner) => Number(corner.column)), rows = (stair.corners || []).map((corner) => Number(corner.row));
    return columns.length === 4 && Math.min(...columns) <= right && Math.max(...columns) >= left && Math.min(...rows) <= bottom && Math.max(...rows) >= top;
  });
}
