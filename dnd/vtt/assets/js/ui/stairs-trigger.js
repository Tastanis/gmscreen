/**
 * Stair trigger detector + level-switch dispatcher.
 *
 * Listens to `vtt:token-moved` (fired on commit by
 * token-movement-controller.js with `kind: 'normal'`). For each moved
 * token, builds the path of token-center points across the move and
 * checks it against every stair on the token's pre-move level. If the
 * path enters one color and exits the opposite color (per stair
 * direction), the dispatcher:
 *
 *   1. Updates the placement's `levelId` to the stair's linked level.
 *   2. Sets the moving user's `userLevelState` to the linked level
 *      (silent switch, no prompt) — only the user who moved the token,
 *      not anyone else.
 *
 * Forced movement (push/pull/slide) goes through a different code path
 * that does not dispatch `vtt:token-moved`, so this trigger is only
 * fired by willing movement — matching the spec.
 */

import { BASE_MAP_LEVEL_ID } from '../state/normalize/map-levels.js';
import { buildStairPerimeter, resolveSegmentColor } from './stairs-geometry.js';
import { getCurrentMeasurementPoints } from './drag-ruler.js';

let boardApi = null;
let getCurrentUserId = () => null;

// Per-token tracking so square-by-square movement can detect an entry
// in one move event and an exit in a later one. Keyed by placementId;
// value is { stairId, entry: 'green'|'red'|'barrier' } — null when the
// token is currently outside every stair polygon on its level.
const tokenStairState = new Map();

export function mountStairsTrigger(options = {}) {
  boardApi = options.boardApi ?? null;
  if (typeof options.getCurrentUserId === 'function') {
    getCurrentUserId = options.getCurrentUserId;
  }
  if (!boardApi) return;

  document.addEventListener('vtt:token-moved', handleTokenMoved);
}

function handleTokenMoved(event) {
  const detail = event?.detail;
  if (!detail || detail.kind !== 'normal') return;
  const placementId = typeof detail.placementId === 'string' ? detail.placementId : '';
  const sceneId = typeof detail.sceneId === 'string' ? detail.sceneId : '';
  if (!placementId || !sceneId) return;
  const from = detail.from;
  const to = detail.to;
  if (!from || !to) return;

  const state = boardApi.getState?.() ?? {};
  const placement = findPlacement(state, sceneId, placementId);
  if (!placement) return;
  const fromLevelId = placement.levelId || BASE_MAP_LEVEL_ID;
  const sceneState = state?.boardState?.sceneState?.[sceneId];
  const stairs = getStairsForLevel(sceneState, fromLevelId);
  if (!stairs.length) return;

  const path = buildPathCenters(from, to);
  if (path.length < 2) return;

  // First, evaluate the stair the token is "currently mid-traversal of"
  // (if any) — this lets a token finish a multi-step traversal that
  // started in a previous move event.
  const existing = tokenStairState.get(placementId) ?? null;
  const orderedStairs = orderStairsWithPriorEntry(stairs, existing);

  for (const stair of orderedStairs) {
    const result = evaluateStairCrossing(path, stair, {
      priorEntry: existing && existing.stairId === stair.id ? existing.entry : null,
    });
    if (result.fired) {
      tokenStairState.delete(placementId);
      dispatchLevelChange({ sceneId, placementId, targetLevelId: stair.linkedLevelId });
      return; // only one stair can fire per move
    }
    // Persist tracking state for the next move event. We only keep
    // tracking for one stair at a time — whichever the token is most
    // recently inside of.
    if (result.endsInside) {
      tokenStairState.set(placementId, { stairId: stair.id, entry: result.entry });
      return;
    }
  }
  // The token ended this move outside every polygon — clear stale state.
  tokenStairState.delete(placementId);
}

function orderStairsWithPriorEntry(stairs, existing) {
  if (!existing) return stairs;
  const idx = stairs.findIndex((s) => s.id === existing.stairId);
  if (idx <= 0) return stairs;
  // Move the prior-entry stair to the front so its state is honored
  // before we evaluate any others (which would otherwise reset it).
  return [stairs[idx], ...stairs.slice(0, idx), ...stairs.slice(idx + 1)];
}

// ── Path construction ────────────────────────────────────────────

/**
 * Build the sequence of token-center points (in grid units) traced
 * during a move. Prefers the live drag-ruler waypoints — those follow
 * the actual drag path. Falls back to a straight line from `from`
 * center to `to` center for square-by-square / arrow-key moves.
 */
function buildPathCenters(from, to) {
  const fromCenter = footprintCenter(from);
  const toCenter = footprintCenter(to);
  if (!fromCenter || !toCenter) return [];

  // The drag-ruler tracks the user's actual drag path; each waypoint is
  // a cell-aligned position (column/row top-left of the footprint).
  // Convert each to footprint-center using the token's width/height.
  const rulerPoints = getCurrentMeasurementPoints();
  const width = Math.max(1, Number(from.width) || 1);
  const height = Math.max(1, Number(from.height) || 1);
  if (Array.isArray(rulerPoints) && rulerPoints.length >= 2) {
    const centers = rulerPoints.map((p) => ({
      x: p.column + width / 2,
      y: p.row + height / 2,
    }));
    // Sanity check: the ruler's last point should match `to`. If it
    // diverges by more than a cell, fall back to from/to centers.
    const last = centers[centers.length - 1];
    if (
      Math.abs(last.x - toCenter.x) <= width &&
      Math.abs(last.y - toCenter.y) <= height
    ) {
      return centers;
    }
  }
  return [fromCenter, toCenter];
}

function footprintCenter(footprint) {
  if (!footprint || typeof footprint !== 'object') return null;
  const col = Number(footprint.column ?? footprint.col ?? footprint.x);
  const row = Number(footprint.row ?? footprint.y);
  if (!Number.isFinite(col) || !Number.isFinite(row)) return null;
  const w = Math.max(1, Number(footprint.width ?? footprint.columns ?? footprint.w) || 1);
  const h = Math.max(1, Number(footprint.height ?? footprint.rows ?? footprint.h) || 1);
  return { x: col + w / 2, y: row + h / 2 };
}

// ── Crossing evaluator ──────────────────────────────────────────

/**
 * Walk the path and decide whether this stair's direction-specific
 * crossing pattern is met.
 *
 * Returns a small result envelope:
 *   { fired, entry, endsInside }
 *
 * `priorEntry` carries forward the entry color recorded in a previous
 * move event so square-by-square movement can complete an entry→exit
 * pattern across multiple steps.
 */
export function evaluateStairCrossing(pathCenters, stair, { priorEntry = null } = {}) {
  const result = { fired: false, entry: null, endsInside: false };
  if (!Array.isArray(pathCenters) || pathCenters.length < 2) return result;
  if (!stair || !Array.isArray(stair.corners) || stair.corners.length !== 4) return result;
  const perimeter = buildStairPerimeter(stair.corners);
  if (!perimeter.length) return result;
  const polygonVerts = polygonCornersFromPerimeter(perimeter);
  const startsInside = pointInPolygon(pathCenters[0], polygonVerts);

  // Initial entry state:
  //   - prior tracking from a previous move event takes precedence;
  //   - otherwise, starting "inside" with no record = under the stairs
  //     (barrier entry, can't trigger).
  let entry;
  if (priorEntry === 'green' || priorEntry === 'red' || priorEntry === 'barrier') {
    entry = priorEntry;
  } else {
    entry = startsInside ? 'barrier' : null;
  }

  for (let i = 0; i < pathCenters.length - 1 && !result.fired; i += 1) {
    const segStart = pathCenters[i];
    const segEnd = pathCenters[i + 1];
    const crossings = [];
    for (const polyEdge of perimeter) {
      const t = segmentIntersectionT(segStart, segEnd, polyEdge.from, polyEdge.to);
      if (t === null) continue;
      crossings.push({ t, color: resolveSegmentColor(stair.edgeColors, polyEdge.id) });
    }
    crossings.sort((a, b) => a.t - b.t);
    for (const crossing of crossings) {
      if (entry === null) {
        entry = crossing.color;
      } else if (
        stair.direction === 'down' &&
        entry === 'green' &&
        crossing.color === 'red'
      ) {
        result.fired = true;
        break;
      } else if (
        stair.direction === 'up' &&
        entry === 'red' &&
        crossing.color === 'green'
      ) {
        result.fired = true;
        break;
      } else {
        // Any other crossing pattern — reset state. The next crossing
        // (if any) becomes a fresh entry attempt.
        entry = null;
      }
    }
  }

  result.entry = entry;
  result.endsInside =
    !result.fired && pointInPolygon(pathCenters[pathCenters.length - 1], polygonVerts);
  return result;
}

function polygonCornersFromPerimeter(perimeter) {
  // The perimeter is an ordered cycle of unit segments. The first
  // segment's `from` is a corner; each subsequent segment's `to` is
  // either a corner or an intermediate stairstep point. For
  // point-in-polygon we don't need only the 4 corners — using every
  // perimeter vertex is correct and handles non-convex shapes too.
  if (!perimeter.length) return [];
  const verts = [{ x: perimeter[0].from.column, y: perimeter[0].from.row }];
  for (const seg of perimeter) {
    verts.push({ x: seg.to.column, y: seg.to.row });
  }
  return verts;
}

function pointInPolygon(point, verts) {
  if (!verts || verts.length < 3) return false;
  let inside = false;
  for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
    const xi = verts[i].x;
    const yi = verts[i].y;
    const xj = verts[j].x;
    const yj = verts[j].y;
    const intersects =
      (yi > point.y) !== (yj > point.y) &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/**
 * Standard 2D segment-segment intersection. Returns the parameter t
 * along p1->p2 where the intersection occurs, or null if no proper
 * intersection (parallel, outside either segment's [0,1] range).
 *
 * The grid-aligned polygon edges and the path segments together are
 * unlikely to be exactly parallel in practice; we treat any parallel
 * case as no-crossing (consistent with the spec's "side line means
 * barrier, you're under the stairs").
 */
function segmentIntersectionT(p1, p2, q1, q2) {
  const q1x = q1.column;
  const q1y = q1.row;
  const q2x = q2.column;
  const q2y = q2.row;
  const d1x = p2.x - p1.x;
  const d1y = p2.y - p1.y;
  const d2x = q2x - q1x;
  const d2y = q2y - q1y;
  const denom = d1x * d2y - d1y * d2x;
  if (denom === 0) return null;
  const t = ((q1x - p1.x) * d2y - (q1y - p1.y) * d2x) / denom;
  const u = ((q1x - p1.x) * d1y - (q1y - p1.y) * d1x) / denom;
  // Half-open rule on u so a path passing exactly through a polygon
  // vertex counts once, not twice or zero. The vertex sits at u=1 of
  // one edge and u=0 of the next — we accept u=0 and reject u=1.
  if (t < 0 || t > 1 || u < 0 || u >= 1) return null;
  return t;
}

// ── Dispatch ─────────────────────────────────────────────────────

function dispatchLevelChange({ sceneId, placementId, targetLevelId }) {
  if (!boardApi?.updateState || !sceneId || !placementId || !targetLevelId) return;
  const userId = (getCurrentUserId() ?? '').toLowerCase();
  const now = Date.now();

  boardApi.updateState((draft) => {
    if (!draft?.boardState) return;
    const placements = draft.boardState.placements?.[sceneId];
    if (Array.isArray(placements)) {
      const placement = placements.find((p) => p?.id === placementId);
      if (placement) placement.levelId = targetLevelId;
    }
    if (!userId) return;
    if (!draft.boardState.sceneState) draft.boardState.sceneState = {};
    if (!draft.boardState.sceneState[sceneId] || typeof draft.boardState.sceneState[sceneId] !== 'object') {
      draft.boardState.sceneState[sceneId] = {};
    }
    const sceneEntry = draft.boardState.sceneState[sceneId];
    if (!sceneEntry.userLevelState || typeof sceneEntry.userLevelState !== 'object') {
      sceneEntry.userLevelState = {};
    }
    sceneEntry.userLevelState[userId] = {
      levelId: targetLevelId,
      source: 'manual',
      updatedAt: now,
    };
  });

  if (typeof boardApi._markSceneStateDirty === 'function') {
    boardApi._markSceneStateDirty(sceneId);
  }
  if (typeof boardApi._persistBoardState === 'function') {
    boardApi._persistBoardState();
  }
}

function findPlacement(state, sceneId, placementId) {
  const placements = state?.boardState?.placements?.[sceneId];
  if (!Array.isArray(placements)) return null;
  return placements.find((p) => p?.id === placementId) ?? null;
}

function getStairsForLevel(sceneState, levelId) {
  if (!sceneState) return [];
  if (levelId === BASE_MAP_LEVEL_ID) {
    const base = sceneState?.mapLevels?.baseStairs;
    return Array.isArray(base) ? base : [];
  }
  const levels = sceneState?.mapLevels?.levels ?? [];
  const match = levels.find((lvl) => lvl?.id === levelId);
  return Array.isArray(match?.stairs) ? match.stairs : [];
}
