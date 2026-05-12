/**
 * Stairs SVG renderer.
 *
 * Draws stair polygons on the GM's current level inside an SVG layer
 * (`#vtt-stairs-layer`) that sits over the board. Polygons are only
 * fully editable while the stairs panel is open (edit mode). Outside edit
 * mode only red/green directional segments remain visible, and pointer-events
 * are disabled.
 *
 * Each stair is rendered as:
 *   - a translucent fill (selectable / highlighted when selected)
 *   - one <line> element per unit perimeter segment, colored per
 *     `edgeColors` (green / red / barrier)
 *   - corner handle <rect> elements when the stair is selected
 *
 * Interaction events (click a segment, drag a corner, click outside to
 * deselect) are wired in stairs-tool.js — this module only paints.
 */

import { BASE_MAP_LEVEL_ID } from '../state/normalize/map-levels.js';
import { buildStairPerimeter, resolveSegmentColor } from './stairs-geometry.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

let boardApi = null;
let viewStateRef = null;
let getViewerLevelId = () => BASE_MAP_LEVEL_ID;
let isEditMode = () => false;
let getSelectedStairId = () => null;
let layerEl = null;
let lastState = null;

const HANDLE_SIZE = 12; // px in map-image space

export function mountStairsRenderer(options = {}) {
  boardApi = options.boardApi ?? null;
  viewStateRef = options.viewState ?? null;
  if (typeof options.getViewerLevelId === 'function') {
    getViewerLevelId = options.getViewerLevelId;
  }
  if (typeof options.isEditMode === 'function') {
    isEditMode = options.isEditMode;
  }
  if (typeof options.getSelectedStairId === 'function') {
    getSelectedStairId = options.getSelectedStairId;
  }
  layerEl = document.getElementById('vtt-stairs-layer');
  if (!layerEl) return;
  // Hidden by default — only edit mode reveals it.
  layerEl.setAttribute('aria-hidden', 'true');
  layerEl.style.display = 'none';
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

/**
 * Repaint the SVG layer for the current board state. Cheap to call on
 * every state tick; bails out early when the viewer has no scene loaded
 * or the panel isn't in edit mode.
 */
export function renderStairs(state) {
  if (!layerEl) return;
  if (state) lastState = state;

  const editing = Boolean(isEditMode());

  const view = viewStateRef ?? {};
  const mapW = Number(view.mapPixelSize?.width);
  const mapH = Number(view.mapPixelSize?.height);
  if (!Number.isFinite(mapW) || mapW <= 0 || !Number.isFinite(mapH) || mapH <= 0) {
    layerEl.replaceChildren();
    layerEl.style.display = 'none';
    return;
  }

  layerEl.style.display = '';
  layerEl.classList.toggle('is-edit-mode', editing);
  layerEl.setAttribute('aria-hidden', editing ? 'false' : 'true');
  layerEl.setAttribute('viewBox', `0 0 ${mapW} ${mapH}`);
  layerEl.setAttribute('width', String(mapW));
  layerEl.setAttribute('height', String(mapH));
  layerEl.style.width = `${mapW}px`;
  layerEl.style.height = `${mapH}px`;

  const gridSize = Math.max(8, Number.isFinite(view.gridSize) ? view.gridSize : 64);
  const offsets = view.gridOffsets ?? {};
  const offsetLeft = Number.isFinite(offsets.left) ? offsets.left : 0;
  const offsetTop = Number.isFinite(offsets.top) ? offsets.top : 0;

  const cellToPx = (cell) => ({
    x: offsetLeft + cell.column * gridSize,
    y: offsetTop + cell.row * gridSize,
  });

  const stairs = getStairsOnViewerLevel(state);
  const selectedId = getSelectedStairId();

  // Build a fresh tree each render; the layer is small (a few stairs
  // each with a few dozen segments) so the GC pressure is negligible
  // and we avoid stale-state bugs from incremental updates.
  const fragment = document.createDocumentFragment();
  stairs.forEach((stair) => {
    const group = document.createElementNS(SVG_NS, 'g');
    group.dataset.stairId = stair.id;
    group.classList.add('vtt-stair');
    let hasRenderableElement = false;

    // Polygon fill outlines the stair body for hit-testing & visual grouping
    // in edit mode. During normal play, only red/green directional edges show.
    const perimeter = buildStairPerimeter(stair.corners);
    if (editing && perimeter.length > 0) {
      const points = [];
      perimeter.forEach((segment, idx) => {
        if (idx === 0) {
          const from = cellToPx(segment.from);
          points.push(`${from.x},${from.y}`);
        }
        const to = cellToPx(segment.to);
        points.push(`${to.x},${to.y}`);
      });
      const polygon = document.createElementNS(SVG_NS, 'polygon');
      polygon.setAttribute('points', points.join(' '));
      polygon.classList.add('vtt-stair-fill');
      if (stair.id === selectedId) polygon.classList.add('is-selected');
      group.appendChild(polygon);
      hasRenderableElement = true;
    }

    // One <line> per unit segment, colored per edgeColors map.
    perimeter.forEach((segment) => {
      const color = resolveSegmentColor(stair.edgeColors, segment.id);
      if (!editing && color !== 'green' && color !== 'red') {
        return;
      }

      const from = cellToPx(segment.from);
      const to = cellToPx(segment.to);
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', String(from.x));
      line.setAttribute('y1', String(from.y));
      line.setAttribute('x2', String(to.x));
      line.setAttribute('y2', String(to.y));
      line.classList.add('vtt-stair-segment', `vtt-stair-segment--${color}`);
      line.dataset.stairId = stair.id;
      line.dataset.segmentId = segment.id;
      line.dataset.segmentColor = color;
      group.appendChild(line);
      hasRenderableElement = true;
    });

    // Corner handles for the selected stair only in edit mode.
    if (editing && stair.id === selectedId && Array.isArray(stair.corners)) {
      stair.corners.forEach((corner, cornerIndex) => {
        const center = cellToPx(corner);
        const half = HANDLE_SIZE / 2;
        const rect = document.createElementNS(SVG_NS, 'rect');
        rect.setAttribute('x', String(center.x - half));
        rect.setAttribute('y', String(center.y - half));
        rect.setAttribute('width', String(HANDLE_SIZE));
        rect.setAttribute('height', String(HANDLE_SIZE));
        rect.classList.add('vtt-stair-corner-handle');
        rect.dataset.stairId = stair.id;
        rect.dataset.cornerIndex = String(cornerIndex);
        group.appendChild(rect);
        hasRenderableElement = true;
      });
    }

    if (hasRenderableElement) {
      fragment.appendChild(group);
    }
  });
  if (!fragment.childNodes.length) {
    layerEl.replaceChildren();
    layerEl.style.display = 'none';
    return;
  }
  layerEl.replaceChildren(fragment);
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
