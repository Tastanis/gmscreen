/**
 * Pure stair mutations applied to a `sceneState` draft. These helpers
 * are intended to run inside `boardApi.updateState((draft) => { ... })`
 * so they mutate state in place. None of them touch the DOM, the panel,
 * or persistence — callers are responsible for marking the scene dirty
 * and triggering a save afterward.
 *
 * Every mutation here keeps the two copies of a stair (the one on its
 * own level + its mirror on the linked level) consistent by writing
 * the same `corners` and `edgeColors` to both, leaving `direction` and
 * `linkedLevelId` to differ.
 */

import {
  BASE_MAP_LEVEL_ID,
  buildLevelViewModel,
} from '../state/normalize/map-levels.js';
import { createStairId } from '../state/normalize/stairs.js';

const STAIR_EDGE_CYCLE = ['barrier', 'green', 'red'];

/**
 * Read the live stair list for a given level on a sceneState draft.
 * Returns the actual array reference (which the caller may mutate).
 * Creates the array on the level/mapLevels if absent so subsequent
 * mutations can push onto it.
 */
export function getStairListMut(sceneState, levelId) {
  if (!sceneState || typeof sceneState !== 'object') return null;
  if (!sceneState.mapLevels || typeof sceneState.mapLevels !== 'object') {
    sceneState.mapLevels = { levels: [], activeLevelId: null, baseStairs: [] };
  }
  if (levelId === BASE_MAP_LEVEL_ID) {
    if (!Array.isArray(sceneState.mapLevels.baseStairs)) {
      sceneState.mapLevels.baseStairs = [];
    }
    return sceneState.mapLevels.baseStairs;
  }
  const levels = Array.isArray(sceneState.mapLevels.levels) ? sceneState.mapLevels.levels : [];
  const level = levels.find((lvl) => lvl?.id === levelId);
  if (!level) return null;
  if (!Array.isArray(level.stairs)) level.stairs = [];
  return level.stairs;
}

export function findStairById(sceneState, levelId, stairId) {
  const list = getStairListMut(sceneState, levelId);
  if (!list) return null;
  return list.find((s) => s?.id === stairId) ?? null;
}

/**
 * Build the ordered list of level ids for a scene (with the virtual
 * Level 0 first), sorted by zIndex ascending. Used to find the
 * adjacent level above or below the current one.
 */
function getOrderedLevelIds(sceneState) {
  if (!sceneState || typeof sceneState !== 'object') return [BASE_MAP_LEVEL_ID];
  // buildLevelViewModel handles sort + base entry; we just need the ids.
  const view = buildLevelViewModel({
    baseMapUrl: '',
    mapLevels: sceneState.mapLevels ?? null,
    sceneGrid: sceneState.grid ?? null,
  });
  return view.map((entry) => entry.id);
}

/**
 * Resolve which level a stair would link to given its current level
 * and direction. Returns the adjacent level id or null when there is
 * no adjacent level in that direction.
 *
 *   direction 'down': returns the next level BELOW the current one.
 *   direction 'up'  : returns the next level ABOVE the current one.
 */
export function resolveLinkedLevelId(sceneState, fromLevelId, direction) {
  const ids = getOrderedLevelIds(sceneState);
  const idx = ids.indexOf(fromLevelId);
  if (idx === -1) return null;
  if (direction === 'down') {
    return idx > 0 ? ids[idx - 1] : null;
  }
  if (direction === 'up') {
    return idx < ids.length - 1 ? ids[idx + 1] : null;
  }
  return null;
}

/**
 * Add a new stair on `levelId` plus its mirror on the linked level.
 *
 * `corners` are 4 cell-corner points in clockwise order. `edgeColors`
 * is the initial sparse map for both copies. The mirror's direction is
 * the opposite of `direction`.
 *
 * Returns the new stair id (shared by both copies), or null when the
 * linked level couldn't be resolved (e.g. trying to place down-stairs
 * from the bottom level).
 */
export function addStairWithMirror(sceneState, {
  levelId,
  direction,
  corners,
  edgeColors = {},
} = {}) {
  if (!sceneState || !levelId || !direction || !Array.isArray(corners) || corners.length !== 4) {
    return null;
  }
  const linkedLevelId = resolveLinkedLevelId(sceneState, levelId, direction);
  if (!linkedLevelId) return null;

  const list = getStairListMut(sceneState, levelId);
  const mirrorList = getStairListMut(sceneState, linkedLevelId);
  if (!list || !mirrorList) return null;

  const id = createStairId();
  const mirrorDirection = direction === 'down' ? 'up' : 'down';

  list.push({
    id,
    direction,
    corners: corners.map((c) => ({ column: c.column, row: c.row })),
    edgeColors: { ...edgeColors },
    linkedLevelId,
  });
  mirrorList.push({
    id,
    direction: mirrorDirection,
    corners: corners.map((c) => ({ column: c.column, row: c.row })),
    edgeColors: { ...edgeColors },
    linkedLevelId: levelId,
  });
  return id;
}

/**
 * Remove a stair by id from both its own level and its mirror.
 * Returns true if anything was removed.
 */
export function removeStairWithMirror(sceneState, levelId, stairId) {
  const list = getStairListMut(sceneState, levelId);
  if (!list) return false;
  const idx = list.findIndex((s) => s?.id === stairId);
  if (idx === -1) return false;
  const linkedLevelId = list[idx].linkedLevelId;
  list.splice(idx, 1);
  if (linkedLevelId) {
    const mirror = getStairListMut(sceneState, linkedLevelId);
    if (mirror) {
      const mIdx = mirror.findIndex((s) => s?.id === stairId);
      if (mIdx !== -1) mirror.splice(mIdx, 1);
    }
  }
  return true;
}

/**
 * Replace the corner list of a stair (and its mirror).
 */
export function updateStairCorners(sceneState, levelId, stairId, nextCorners) {
  if (!Array.isArray(nextCorners) || nextCorners.length !== 4) return false;
  const stair = findStairById(sceneState, levelId, stairId);
  if (!stair) return false;
  const corners = nextCorners.map((c) => ({ column: c.column, row: c.row }));
  stair.corners = corners;
  if (stair.linkedLevelId) {
    const mirror = findStairById(sceneState, stair.linkedLevelId, stairId);
    if (mirror) mirror.corners = corners.map((c) => ({ ...c }));
  }
  return true;
}

/**
 * Cycle a single segment's color: barrier → green → red → barrier.
 * `segmentId` is a canonical key; absent in `edgeColors` is treated as
 * 'barrier'. Returns the new color or null when the stair wasn't found.
 */
export function cycleSegmentColor(sceneState, levelId, stairId, segmentId) {
  if (typeof segmentId !== 'string' || !segmentId) return null;
  const stair = findStairById(sceneState, levelId, stairId);
  if (!stair) return null;
  if (!stair.edgeColors || typeof stair.edgeColors !== 'object') stair.edgeColors = {};
  const current = stair.edgeColors[segmentId] ?? 'barrier';
  const idx = STAIR_EDGE_CYCLE.indexOf(current);
  const next = STAIR_EDGE_CYCLE[(idx + 1) % STAIR_EDGE_CYCLE.length];
  applySegmentColor(stair, segmentId, next);
  if (stair.linkedLevelId) {
    const mirror = findStairById(sceneState, stair.linkedLevelId, stairId);
    if (mirror) {
      if (!mirror.edgeColors || typeof mirror.edgeColors !== 'object') mirror.edgeColors = {};
      applySegmentColor(mirror, segmentId, next);
    }
  }
  return next;
}

function applySegmentColor(stair, segmentId, color) {
  if (color === 'barrier') {
    delete stair.edgeColors[segmentId];
  } else {
    stair.edgeColors[segmentId] = color;
  }
}

/**
 * Auto-assign green/red colors at placement time. Given the rectangle
 * defined by cells A and B (the user's two placement clicks), green is
 * painted on the polygon edge "nearest A" and red on the edge "nearest
 * B" — both are the short edges perpendicular to the A→B axis. The two
 * long sides remain barrier.
 *
 * Returns an `edgeColors` map. Coordinates are integer grid corners.
 */
export function buildPlacementEdgeColors({ cellA, cellB, corners }) {
  if (!cellA || !cellB || !Array.isArray(corners) || corners.length !== 4) {
    return {};
  }
  const minCol = Math.min(corners[0].column, corners[2].column);
  const maxCol = Math.max(corners[0].column, corners[2].column);
  const minRow = Math.min(corners[0].row, corners[2].row);
  const maxRow = Math.max(corners[0].row, corners[2].row);
  const width = maxCol - minCol;
  const height = maxRow - minRow;
  if (width <= 0 || height <= 0) return {};

  // Decide which axis is "long". Tie breaks on horizontal so a square
  // gets vertical short edges (top/bottom) by default.
  const horizontalIsLong = width >= height;
  const result = {};

  if (horizontalIsLong) {
    // Short edges are vertical (left at minCol, right at maxCol).
    // A's column determines which side is green; B's determines red.
    const aLeft = cellA.column <= cellB.column;
    const greenCol = aLeft ? minCol : maxCol;
    const redCol = aLeft ? maxCol : minCol;
    for (let r = minRow; r < maxRow; r += 1) {
      result[segKey(greenCol, r, greenCol, r + 1)] = 'green';
      result[segKey(redCol, r, redCol, r + 1)] = 'red';
    }
  } else {
    // Short edges are horizontal (top at minRow, bottom at maxRow).
    const aTop = cellA.row <= cellB.row;
    const greenRow = aTop ? minRow : maxRow;
    const redRow = aTop ? maxRow : minRow;
    for (let c = minCol; c < maxCol; c += 1) {
      result[segKey(c, greenRow, c + 1, greenRow)] = 'green';
      result[segKey(c, redRow, c + 1, redRow)] = 'red';
    }
  }
  return result;
}

function segKey(x1, y1, x2, y2) {
  const a = { column: x1, row: y1 };
  const b = { column: x2, row: y2 };
  const [first, second] =
    a.column < b.column || (a.column === b.column && a.row < b.row) ? [a, b] : [b, a];
  return `${first.column},${first.row}-${second.column},${second.row}`;
}

/**
 * Build the 4 axis-aligned rectangle corners from two cell-coordinate
 * clicks. Cell A and B can be in any orientation; result is in
 * clockwise order starting top-left.
 */
export function rectangleCornersFromCells(cellA, cellB) {
  const minCol = Math.min(cellA.column, cellB.column);
  const maxCol = Math.max(cellA.column, cellB.column) + 1;
  const minRow = Math.min(cellA.row, cellB.row);
  const maxRow = Math.max(cellA.row, cellB.row) + 1;
  return [
    { column: minCol, row: minRow },
    { column: maxCol, row: minRow },
    { column: maxCol, row: maxRow },
    { column: minCol, row: maxRow },
  ];
}
