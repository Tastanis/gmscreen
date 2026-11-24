import { rampHeight } from './imported-ramps.mjs';
import { BASE_MAP_LEVEL_ID } from '../state/normalize/map-levels.js';
import { buildStairPerimeter, resolveSegmentColor } from './stairs-geometry.js';

let pickable = [];

let boardApi = null;

let getViewerLevelId = () => BASE_MAP_LEVEL_ID;
let isEditMode = () => false;
let getSelectedStairId = () => null;

let lastState = null;

export function mountStairsRenderer(options = {}) {
  boardApi = options.boardApi ?? null;

  if (typeof options.getViewerLevelId === 'function') {
    getViewerLevelId = options.getViewerLevelId;
  }
  if (typeof options.isEditMode === 'function') {
    isEditMode = options.isEditMode;
  }
  if (typeof options.getSelectedStairId === 'function') {
    getSelectedStairId = options.getSelectedStairId;
  }
  document.addEventListener('vtt3d:scene-built', refreshStairsRender);
}

/**
 * Force a re-render using the last state we saw. Called by the panel
 * when the edit mode or selection changes — these don't propagate as
 * board-state changes, so we'd otherwise paint a stale frame.
 */
export function refreshStairsRender() {
  if (lastState) renderStairs(lastState);
  else if (boardApi?.getState) renderStairs(boardApi.getState());
}

export function renderStairs(state) {
  lastState = state;
  pickable = [];
  paintStairs3d(state, getStairsOnViewerLevel(state), getSelectedStairId(), isEditMode());
}

// Use the same world points for drawing and picking so ramps and camera changes stay aligned.
export function pickStair(clientX, clientY) {
  const renderer = window.vtt3dRenderer;
  if (!renderer?.canvas) return null;
  const rect = renderer.canvas.getBoundingClientRect();
  const x = clientX - rect.left,
    y = clientY - rect.top;
  const project = (point) => renderer.project(point);
  const distance = (a, b) => {
    const dx = b.x - a.x,
      dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(x - a.x - t * dx, y - a.y - t * dy);
  };
  let edge = null,
    inside = null,
    nearest = 6;
  for (const stair of pickable) {
    if (stair.selected) {
      const index = stair.corners.findIndex((point) => {
        const p = project(point);
        return p?.visible && Math.hypot(x - p.x, y - p.y) <= 8;
      });
      if (index >= 0) return { stairId: stair.id, cornerIndex: index };
    }
    let crosses = false;
    for (const segment of stair.segments) {
      const a = project(segment.a),
        b = project(segment.b);
      if (!a?.visible || !b?.visible) continue;
      const d = distance(a, b);
      if (d < nearest) {
        nearest = d;
        edge = { stairId: stair.id, segmentId: segment.id };
      }
      if (a.y > y !== b.y > y && x < a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y)) crosses = !crosses;
    }
    if (crosses) inside = { stairId: stair.id };
  }
  return edge || inside;
}

function paintStairs3d(state, stairs, selectedId, editing) {
  const board3d = window.vtt3d?.active ? window.vtt3d : null;
  if (!board3d) return;
  const sceneId = state?.boardState?.activeSceneId ?? null;
  const viewerLevelId = sceneId ? getViewerLevelId(state, sceneId) : BASE_MAP_LEVEL_ID;
  const ramps = window.wallPrototype?.model?.ramps || [];
  const floor = board3d.helpers.levelHeight(viewerLevelId);
  const heightOf = (stair, x, y) => {
    const ramp = ramps.find((r) => r.id === stair.id);
    if (ramp) {
      const z = rampHeight(
        ramp,
        Math.max(ramp.left, Math.min(ramp.right, x)),
        Math.max(ramp.top, Math.min(ramp.bottom, y))
      );
      if (Number.isFinite(z)) return z;
    }
    if (viewerLevelId && viewerLevelId !== BASE_MAP_LEVEL_ID && Number.isFinite(floor)) return floor;
    return board3d.helpers.groundAt(x, y);
  };
  const at = (stair, cell) => ({ x: cell.column, y: cell.row, z: heightOf(stair, cell.column, cell.row) });
  const colors = { green: '#2ecc71', red: '#e74c3c' };
  const list = [];
  for (const stair of stairs) {
    const perimeter = buildStairPerimeter(stair.corners);
    if (editing)
      pickable.push({
        id: stair.id,
        selected: stair.id === selectedId,
        corners: stair.corners.map((cell) => at(stair, cell)),
        segments: perimeter.map((segment) => ({
          id: segment.id,
          a: at(stair, segment.from),
          b: at(stair, segment.to),
        })),
      });
    if (editing && perimeter.length)
      list.push({
        kind: 'line',
        points: [at(stair, perimeter[0].from), ...perimeter.map((segment) => at(stair, segment.to))],
        color: stair.id === selectedId ? '#facc15' : '#f8fafc',
        opacity: 0.55,
      });
    for (const segment of perimeter) {
      const color = resolveSegmentColor(stair.edgeColors, segment.id);
      if (!editing && color !== 'green' && color !== 'red') continue;
      list.push({
        kind: 'line',
        points: [at(stair, segment.from), at(stair, segment.to)],
        color: colors[color] || '#cbd5e1',
        opacity: 1,
      });
    }
    if (editing && stair.id === selectedId && Array.isArray(stair.corners))
      for (const corner of stair.corners)
        list.push({ kind: 'dot', ...at(stair, corner), r: 0.12, color: '#facc15', stroke: '#1f2937' });
  }
  board3d.setOverlay('stairs', list);
}

function getStairsOnViewerLevel(state) {
  const activeSceneId = state?.boardState?.activeSceneId ?? null;
  if (!activeSceneId) return [];
  const sceneState = state?.boardState?.sceneState?.[activeSceneId];
  if (!sceneState) return [];
  const viewerLevelId = getViewerLevelId(state, activeSceneId);
  if (viewerLevelId === BASE_MAP_LEVEL_ID) {
    const base = sceneState?.mapLevels?.baseStairs;
    return Array.isArray(base) ? base : [];
  }
  const levels = sceneState?.mapLevels?.levels ?? [];
  const match = levels.find((lvl) => lvl?.id === viewerLevelId);
  return Array.isArray(match?.stairs) ? match.stairs : [];
}
