/**
 * Stairs normalization.
 *
 * A "stair" is a level-link object stored on each of the two levels it
 * connects. Both copies share the same `id` and `edgeColors`; only the
 * `direction` field flips (`'down'` on the upper level, `'up'` on the
 * lower one). Mutating one copy is expected to mutate the other through
 * matching board-state ops.
 *
 * Shape (per copy):
 *   {
 *     id: 'stair-...',           // shared with mirror
 *     direction: 'down' | 'up',  // perspective of THIS level
 *     corners: [                 // exactly 4, in clockwise polygon order
 *       { column, row }, { column, row },
 *       { column, row }, { column, row },
 *     ],
 *     edgeColors: {              // sparse map keyed by unit segment id
 *       '<x1>,<y1>-<x2>,<y2>': 'green' | 'red',
 *       ...                       // missing entries default to 'barrier'
 *     },
 *     linkedLevelId: '<id>',     // the OTHER level this stair connects to
 *   }
 *
 * Segment ids are canonical: the two grid-line endpoints sorted
 * lexicographically and joined with '-'. e.g. cell (3,5)'s south edge is
 * '3,6-4,6'.
 */

import { toBoolean, toNonNegativeInt } from './helpers.js';

export const STAIR_ID_PREFIX = 'stair-';
export const STAIR_DIRECTIONS = Object.freeze(['down', 'up']);
export const STAIR_EDGE_COLORS = Object.freeze(['green', 'red']);

const stairSeed = Date.now();
let stairSequence = 0;

export function createStairId() {
  stairSequence += 1;
  return `${STAIR_ID_PREFIX}${stairSeed.toString(36)}-${stairSequence.toString(36)}`;
}

export function normalizeStairList(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out = [];
  const seenIds = new Set();
  raw.forEach((entry) => {
    const normalized = normalizeStairEntry(entry);
    if (!normalized) return;
    if (seenIds.has(normalized.id)) return;
    seenIds.add(normalized.id);
    out.push(normalized);
  });
  return out;
}

export function normalizeStairEntry(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const corners = normalizeStairCorners(raw.corners);
  if (!corners) {
    return null;
  }
  const direction = normalizeStairDirection(raw.direction);
  if (!direction) {
    return null;
  }
  const linkedLevelId = normalizeStairLinkedLevelId(raw.linkedLevelId);
  if (!linkedLevelId) {
    return null;
  }
  const idSource = typeof raw.id === 'string' ? raw.id.trim() : '';
  const id = idSource || createStairId();
  const edgeColors = normalizeStairEdgeColors(raw.edgeColors);

  return {
    id,
    direction,
    corners,
    edgeColors,
    linkedLevelId,
  };
}

function normalizeStairCorners(raw) {
  if (!Array.isArray(raw) || raw.length !== 4) {
    return null;
  }
  const corners = raw.map((entry) => normalizeCellCoord(entry));
  if (corners.some((corner) => !corner)) {
    return null;
  }
  // Reject fully-degenerate quads (all 4 corners collapsed to one cell).
  const allSame = corners.every(
    (corner) => corner.column === corners[0].column && corner.row === corners[0].row
  );
  if (allSame) {
    return null;
  }
  return corners;
}

function normalizeCellCoord(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const columnRaw = raw.column ?? raw.col ?? raw.x;
  const rowRaw = raw.row ?? raw.y;
  const column = Number(columnRaw);
  const row = Number(rowRaw);
  if (!Number.isFinite(column) || !Number.isFinite(row)) {
    return null;
  }
  return {
    column: Math.max(0, Math.trunc(column)),
    row: Math.max(0, Math.trunc(row)),
  };
}

function normalizeStairDirection(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  const trimmed = raw.trim().toLowerCase();
  return STAIR_DIRECTIONS.includes(trimmed) ? trimmed : null;
}

function normalizeStairLinkedLevelId(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  const trimmed = raw.trim();
  return trimmed || null;
}

function normalizeStairEdgeColors(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') {
    return out;
  }
  Object.keys(raw).forEach((key) => {
    if (typeof key !== 'string') return;
    const canonical = canonicalizeSegmentKey(key);
    if (!canonical) return;
    const value = raw[key];
    if (typeof value !== 'string') return;
    const color = value.trim().toLowerCase();
    if (!STAIR_EDGE_COLORS.includes(color)) return;
    out[canonical] = color;
  });
  return out;
}

/**
 * Canonical id for a unit-length axis-aligned segment between two
 * grid-line points. The two endpoints are sorted (column asc, then row
 * asc) and joined with '-'. Returns null if the key is malformed or the
 * segment isn't unit-length axis-aligned.
 */
export function canonicalizeSegmentKey(rawKey) {
  if (typeof rawKey !== 'string') return null;
  const parts = rawKey.trim().split('-');
  if (parts.length !== 2) return null;
  const a = parseEndpoint(parts[0]);
  const b = parseEndpoint(parts[1]);
  if (!a || !b) return null;
  return makeSegmentKey(a, b);
}

function parseEndpoint(text) {
  if (typeof text !== 'string') return null;
  const [colStr, rowStr] = text.split(',');
  const column = Number(colStr);
  const row = Number(rowStr);
  if (!Number.isFinite(column) || !Number.isFinite(row)) return null;
  return { column: Math.trunc(column), row: Math.trunc(row) };
}

/**
 * Build a canonical segment id from two endpoints. Requires the segment
 * to be unit-length and axis-aligned, otherwise returns null.
 */
export function makeSegmentKey(a, b) {
  if (!a || !b) return null;
  const dCol = Math.abs(a.column - b.column);
  const dRow = Math.abs(a.row - b.row);
  if (!((dCol === 1 && dRow === 0) || (dCol === 0 && dRow === 1))) {
    return null;
  }
  const [first, second] =
    a.column < b.column || (a.column === b.column && a.row < b.row) ? [a, b] : [b, a];
  return `${first.column},${first.row}-${second.column},${second.row}`;
}

// Re-exports for downstream callers that don't need to know our helpers.
export { toBoolean as _toBoolean, toNonNegativeInt as _toNonNegativeInt };
