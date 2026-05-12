/**
 * Geometry helpers for stair polygons.
 *
 * A stair is defined by 4 corner cells (integer grid coordinates). The
 * perimeter is built by walking from each corner to the next in
 * clockwise order. Between two corners we generate an axis-only
 * polyline of unit-length segments that approximates the straight line
 * between them — a "stairstep" — so the perimeter follows grid edges.
 *
 * Each emitted unit segment is identified by a canonical key
 * `"<col1>,<row1>-<col2>,<row2>"` with endpoints sorted (col asc, then
 * row asc). The same id is used by `edgeColors` so per-segment colors
 * survive corner moves: only segments that disappear from the perimeter
 * lose their color, new ones default to barrier.
 */

import { makeSegmentKey } from '../state/normalize/stairs.js';

/**
 * Build an axis-only polyline from cell A to cell B that stays as
 * close as possible to the ideal straight line. Returns a list of
 * cell-corner points (column/row pairs) starting with A and ending
 * with B. Adjacent points differ by exactly 1 in one coordinate.
 *
 * For A === B returns a single-point list.
 */
export function stairWalk(a, b) {
  if (!a || !b) return [];
  const start = { column: Math.trunc(a.column), row: Math.trunc(a.row) };
  const end = { column: Math.trunc(b.column), row: Math.trunc(b.row) };
  if (start.column === end.column && start.row === end.row) {
    return [start];
  }
  const dC = end.column - start.column;
  const dR = end.row - start.row;
  const signC = Math.sign(dC);
  const signR = Math.sign(dR);
  const nC = Math.abs(dC);
  const nR = Math.abs(dR);
  const total = nC + nR;

  const points = [{ ...start }];
  let h = 0;
  let v = 0;
  const cur = { ...start };

  for (let k = 1; k <= total; k += 1) {
    let stepH;
    if (h >= nC) {
      stepH = false;
    } else if (v >= nR) {
      stepH = true;
    } else {
      // Midpoint-comparison Bresenham variant for axis-only walks.
      // After step k the ideal H progress is k * nC / total. We step H
      // if the midpoint of the next H step (h + 0.5) is still behind
      // that ideal — otherwise step V. This produces juts at the right
      // proportional points (e.g. (0,0)→(1,6) juts at v=3, the middle).
      const idealH = (k * nC) / total;
      stepH = h + 0.5 < idealH;
    }
    if (stepH) {
      cur.column += signC;
      h += 1;
    } else {
      cur.row += signR;
      v += 1;
    }
    points.push({ ...cur });
  }

  return points;
}

/**
 * Build the ordered list of unit perimeter segments for a stair given
 * its 4 corners (clockwise). Returns an array of segment records:
 *   { id, from: {column,row}, to: {column,row} }
 *
 * Adjacent corners are connected by `stairWalk`. The walks share
 * endpoints (the closing corner of one walk is the opening corner of
 * the next), so the returned perimeter is a closed polyline. Each
 * record's `id` is the canonical segment key — duplicates are skipped
 * (which can only happen if two corners coincide, an edge case we
 * tolerate but don't expect).
 */
export function buildStairPerimeter(corners) {
  if (!Array.isArray(corners) || corners.length !== 4) return [];
  const segments = [];
  const seenIds = new Set();
  for (let i = 0; i < 4; i += 1) {
    const a = corners[i];
    const b = corners[(i + 1) % 4];
    const walk = stairWalk(a, b);
    for (let j = 0; j < walk.length - 1; j += 1) {
      const from = walk[j];
      const to = walk[j + 1];
      const id = makeSegmentKey(from, to);
      if (!id || seenIds.has(id)) continue;
      seenIds.add(id);
      segments.push({ id, from, to });
    }
  }
  return segments;
}

/**
 * Return the polygon outline as an ordered point list — the same
 * vertices as `buildStairPerimeter` produces, but as bare cell-corner
 * coordinates suitable for an SVG `points=` attribute. The first
 * vertex is repeated as the last so the polygon closes.
 */
export function buildStairPolygonPoints(corners) {
  if (!Array.isArray(corners) || corners.length !== 4) return [];
  const points = [];
  for (let i = 0; i < 4; i += 1) {
    const a = corners[i];
    const b = corners[(i + 1) % 4];
    const walk = stairWalk(a, b);
    // Skip the first point of subsequent walks — it equals the last
    // point of the previous walk.
    for (let j = i === 0 ? 0 : 1; j < walk.length; j += 1) {
      points.push(walk[j]);
    }
  }
  return points;
}

/**
 * Resolve a unit segment's color from a stair's `edgeColors` map.
 * Returns 'barrier' when the segment has no override.
 */
export function resolveSegmentColor(edgeColors, segmentId) {
  if (!edgeColors || typeof edgeColors !== 'object') return 'barrier';
  const color = edgeColors[segmentId];
  if (color === 'green' || color === 'red') return color;
  return 'barrier';
}
