/**
 * Stair interactive tool — owns all pointer interactions that mutate
 * stairs. The panel handles UI state (mode, selection); this module
 * translates pointer events into mutations through boardApi.
 *
 * Behaviors:
 *   - Placement mode (`place-up` / `place-down`): two clicks on the
 *     board define the rectangle. First click sets cell A; second
 *     click sets cell B; on commit we add the stair + mirror.
 *   - Edit mode (panel open, idle): clicks select stairs, segment
 *     clicks cycle color, corner drags resize. Clicks outside any
 *     stair deselect.
 */

import {
  BASE_MAP_LEVEL_ID,
} from '../state/normalize/map-levels.js';
import {
  addStairWithMirror,
  cycleSegmentColor,
  rectangleCornersFromCells,
  removeStairWithMirror,
  resolveLinkedLevelId,
  updateStairCorners,
  findStairById,
} from './stairs-mutations.js';
import {
  getStairsMode,
  isStairsEditMode,
  setStairsMode,
  setSelectedStairId,
  getSelectedStairId,
  subscribeStairsMode,
} from './stairs-panel.js';
import { refreshStairsRender } from './stairs-renderer.js';

let boardApi = null;
let viewStateRef = null;
let getViewerLevelId = () => BASE_MAP_LEVEL_ID;
let isGm = false;

let placementCellA = null;
let dragSession = null;

export function mountStairsTool(options = {}) {
  boardApi = options.boardApi ?? null;
  viewStateRef = options.viewState ?? null;
  isGm = Boolean(options.isGm);
  if (typeof options.getViewerLevelId === 'function') {
    getViewerLevelId = options.getViewerLevelId;
  }
  if (!isGm) return;

  const mapSurface = document.getElementById('vtt-map-surface');
  if (!mapSurface) return;

  mapSurface.addEventListener('pointerdown', handleMapPointerDown, true);

  // Pointermove / pointerup are tracked on the window so a corner drag
  // started inside the SVG continues even if the pointer leaves the
  // handle's hit box mid-drag.
  window.addEventListener('pointermove', handleWindowPointerMove, true);
  window.addEventListener('pointerup', handleWindowPointerUp, true);

  // Cancel pending placement when mode/panel resets.
  subscribeStairsMode(({ mode }) => {
    if (mode !== 'place-up' && mode !== 'place-down') {
      placementCellA = null;
    }
  });

  // The panel emits delete clicks as native button clicks; intercept
  // them here so the deletion logic stays in one place.
  const panel = document.getElementById('vtt-stairs-panel');
  if (panel) {
    panel.addEventListener('click', handlePanelActionClick);
  }
}

// ── Pointer routing ──────────────────────────────────────────────

function handleMapPointerDown(event) {
  if (!boardApi) return;
  if (event.button !== 0) return;

  const mode = getStairsMode();
  const editMode = isStairsEditMode();

  // Placement clicks: collect cell A then cell B and commit on B.
  if (mode === 'place-up' || mode === 'place-down') {
    const cell = pointerToGridCell(event);
    if (!cell) return;
    event.stopPropagation();
    event.preventDefault();
    if (!placementCellA) {
      placementCellA = cell;
      return;
    }
    commitPlacement(placementCellA, cell, mode === 'place-up' ? 'up' : 'down');
    placementCellA = null;
    setStairsMode('idle');
    return;
  }

  if (!editMode) return;

  const target = event.target;
  const targetEl = target instanceof Element ? target : null;
  const stairId = targetEl?.dataset?.stairId ?? null;
  const cornerIndex = targetEl?.dataset?.cornerIndex ?? null;
  const segmentId = targetEl?.dataset?.segmentId ?? null;

  if (stairId && cornerIndex !== null && targetEl.classList?.contains('vtt-stair-corner-handle')) {
    event.stopPropagation();
    event.preventDefault();
    beginCornerDrag(stairId, Number(cornerIndex), event);
    return;
  }

  if (stairId && segmentId && targetEl.classList?.contains('vtt-stair-segment')) {
    event.stopPropagation();
    event.preventDefault();
    setSelectedStairId(stairId);
    applyCycleSegmentColor(stairId, segmentId);
    return;
  }

  if (stairId && targetEl.classList?.contains('vtt-stair-fill')) {
    event.stopPropagation();
    event.preventDefault();
    setSelectedStairId(stairId);
    return;
  }

  // Click landed on the map outside any stair element while in edit
  // mode — deselect any selected stair. We don't preventDefault here so
  // other tools (drag-ruler etc.) still get the event normally.
  if (getSelectedStairId()) {
    setSelectedStairId(null);
  }
}

function handleWindowPointerMove(event) {
  if (!dragSession) return;
  const corner = pointerToGridCorner(event);
  if (!corner) return;
  if (
    dragSession.lastCorner &&
    corner.column === dragSession.lastCorner.column &&
    corner.row === dragSession.lastCorner.row
  ) {
    return;
  }
  dragSession.lastCorner = corner;
  dragSession.didMove = true;
  applyCornerDragLive(dragSession.stairId, dragSession.cornerIndex, corner);
}

function handleWindowPointerUp() {
  if (!dragSession) return;
  const moved = dragSession.didMove;
  dragSession = null;
  if (moved) {
    persistDirtyScene();
  }
}

// ── Mutations through boardApi ───────────────────────────────────

function commitPlacement(cellA, cellB, direction) {
  if (!boardApi?.updateState) return;
  const sceneId = currentSceneId();
  if (!sceneId) return;
  const levelId = currentViewerLevelId();
  const corners = rectangleCornersFromCells(cellA, cellB);

  let newStairId = null;
  boardApi.updateState((draft) => {
    const sceneState = ensureSceneState(draft, sceneId);
    if (!sceneState) return;
    if (!resolveLinkedLevelId(sceneState, levelId, direction)) {
      // No adjacent level — the panel should already prevent this for
      // bottom-level down-stairs, but we guard here too.
      return;
    }
    newStairId = addStairWithMirror(sceneState, {
      levelId,
      direction,
      corners,
      // No auto-coloring at placement — every segment starts as a
      // barrier. The GM paints green/red via segment clicks.
      edgeColors: {},
    });
  });
  if (newStairId) {
    setSelectedStairId(newStairId);
    markDirtyAndPersist(sceneId);
    refreshStairsRender();
  }
}

function beginCornerDrag(stairId, cornerIndex, event) {
  if (!Number.isInteger(cornerIndex) || cornerIndex < 0 || cornerIndex > 3) return;
  setSelectedStairId(stairId);
  dragSession = {
    stairId,
    cornerIndex,
    lastCorner: pointerToGridCorner(event),
    didMove: false,
  };
}

function applyCornerDragLive(stairId, cornerIndex, nextCorner) {
  if (!boardApi?.updateState) return;
  const sceneId = currentSceneId();
  if (!sceneId) return;
  const levelId = currentViewerLevelId();

  boardApi.updateState((draft) => {
    const sceneState = ensureSceneState(draft, sceneId);
    if (!sceneState) return;
    const stair = findStairById(sceneState, levelId, stairId);
    if (!stair || !Array.isArray(stair.corners)) return;
    const nextCorners = stair.corners.map((c, idx) =>
      idx === cornerIndex ? { column: nextCorner.column, row: nextCorner.row } : { ...c }
    );
    updateStairCorners(sceneState, levelId, stairId, nextCorners);
  });
  markSceneDirty(sceneId);
  refreshStairsRender();
}

function applyCycleSegmentColor(stairId, segmentId) {
  if (!boardApi?.updateState) return;
  const sceneId = currentSceneId();
  if (!sceneId) return;
  const levelId = currentViewerLevelId();
  boardApi.updateState((draft) => {
    const sceneState = ensureSceneState(draft, sceneId);
    if (!sceneState) return;
    cycleSegmentColor(sceneState, levelId, stairId, segmentId);
  });
  markDirtyAndPersist(sceneId);
  refreshStairsRender();
}

function deleteStair(stairId) {
  if (!boardApi?.updateState) return;
  const sceneId = currentSceneId();
  if (!sceneId) return;
  const levelId = currentViewerLevelId();
  boardApi.updateState((draft) => {
    const sceneState = ensureSceneState(draft, sceneId);
    if (!sceneState) return;
    removeStairWithMirror(sceneState, levelId, stairId);
  });
  if (getSelectedStairId() === stairId) {
    setSelectedStairId(null);
  }
  markDirtyAndPersist(sceneId);
  refreshStairsRender();
}

function handlePanelActionClick(event) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  const action = target.dataset?.stairsAction;
  if (!action) return;
  const item = target.closest('[data-stair-id]');
  const stairId = item?.dataset?.stairId;
  if (!stairId) return;
  if (action === 'delete') {
    deleteStair(stairId);
  } else if (action === 'edit') {
    setSelectedStairId(stairId);
  }
}

// ── Helpers ──────────────────────────────────────────────────────

function ensureSceneState(draft, sceneId) {
  if (!draft?.boardState) return null;
  if (!draft.boardState.sceneState || typeof draft.boardState.sceneState !== 'object') {
    draft.boardState.sceneState = {};
  }
  if (!draft.boardState.sceneState[sceneId]) {
    draft.boardState.sceneState[sceneId] = { mapLevels: { levels: [], baseStairs: [] } };
  }
  return draft.boardState.sceneState[sceneId];
}

function currentSceneId() {
  return boardApi?.getState?.()?.boardState?.activeSceneId ?? null;
}

function currentViewerLevelId() {
  const state = boardApi?.getState?.() ?? {};
  const sceneId = state?.boardState?.activeSceneId ?? null;
  return getViewerLevelId(state, sceneId) || BASE_MAP_LEVEL_ID;
}

function markSceneDirty(sceneId) {
  if (typeof boardApi?._markSceneStateDirty === 'function') {
    boardApi._markSceneStateDirty(sceneId);
  }
}

function persistDirtyScene() {
  if (typeof boardApi?._persistBoardState === 'function') {
    boardApi._persistBoardState();
  }
}

function markDirtyAndPersist(sceneId) {
  markSceneDirty(sceneId);
  persistDirtyScene();
}

// Pointer coords → integer cell coordinates (whole grid square).
function pointerToGridCell(event) {
  const mapSurface = document.getElementById('vtt-map-surface');
  if (!mapSurface) return null;
  const local = pointerToLocalCoords(event, mapSurface);
  if (!local) return null;
  return {
    column: Math.floor(local.x / local.gridSize),
    row: Math.floor(local.y / local.gridSize),
  };
}

// Pointer coords → nearest grid-line intersection (the corner of a
// cell). Used for corner-drag snapping.
function pointerToGridCorner(event) {
  const mapSurface = document.getElementById('vtt-map-surface');
  if (!mapSurface) return null;
  const local = pointerToLocalCoords(event, mapSurface);
  if (!local) return null;
  const column = Math.max(0, Math.round(local.x / local.gridSize));
  const row = Math.max(0, Math.round(local.y / local.gridSize));
  return { column, row };
}

function pointerToLocalCoords(event, mapSurface) {
  const view = viewStateRef ?? {};
  const scale = Number.isFinite(view.scale) && view.scale !== 0 ? view.scale : 1;
  const translation = view.translation ?? { x: 0, y: 0 };
  const offsetX = Number.isFinite(translation.x) ? translation.x : 0;
  const offsetY = Number.isFinite(translation.y) ? translation.y : 0;

  const rect = mapSurface.getBoundingClientRect();
  const pointerX = event.clientX - rect.left;
  const pointerY = event.clientY - rect.top;
  const localX = (pointerX - offsetX) / scale;
  const localY = (pointerY - offsetY) / scale;

  const gridSize = Math.max(8, Number.isFinite(view.gridSize) ? view.gridSize : 64);
  const offsets = view.gridOffsets ?? {};
  const gOffLeft = Number.isFinite(offsets.left) ? offsets.left : 0;
  const gOffTop = Number.isFinite(offsets.top) ? offsets.top : 0;
  const x = localX - gOffLeft;
  const y = localY - gOffTop;
  if (x < 0 || y < 0) return null;
  return { x, y, gridSize };
}
