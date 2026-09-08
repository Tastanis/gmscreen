import { diffDrawings, applyDrawingEdits, invertDrawingEdits, canEditDrawing } from './drawing-edits.js';
const SVG_NS = 'http://www.w3.org/2000/svg';

let sharedState = null;
let onDrawingChange = null;
let getCurrentUserId = null;
let getIsGM = () => false;

export function mountDrawingTool(options = {}) {
  const drawButton = document.querySelector('[data-action="toggle-draw"]');
  const drawingLayer = document.getElementById('vtt-drawing-layer');
  const settingsPanel = document.getElementById('vtt-drawing-settings');
  const colorInput = document.getElementById('vtt-draw-color');
  const strokeInput = document.getElementById('vtt-draw-stroke');
  const strokeValue = document.getElementById('vtt-draw-stroke-value');
  const clearButton = document.querySelector('[data-action="clear-drawings"]');
  const mapSurface = document.getElementById('vtt-map-surface');
  const mapTransform = document.getElementById('vtt-map-transform');

  if (!drawButton || !drawingLayer || !mapSurface || !mapTransform) {
    return;
  }

  onDrawingChange = options.onDrawingChange || null;
  getCurrentUserId = options.getCurrentUserId || null;
  getIsGM = options.getIsGM || (() => false);
  if (clearButton) {
    clearButton.textContent = getIsGM() ? 'Clear this floor' : 'Clear my drawings';
    clearButton.title = getIsGM() ? 'Remove drawings on the floor you are viewing.' : 'Remove your drawings on the floor you are viewing.';
  }

  const drawModeBtn = document.querySelector('[data-action="draw-mode-draw"]');
  const eraseModeBtn = document.querySelector('[data-action="draw-mode-erase"]');
  const colorRow = document.querySelector('[data-draw-color-row]');

  const state = {
    active: false,
    drawing: false,
    eraseMode: false,
    erasing: false,
    eraseDidChange: false,
    needsFullSync: false,
    pointerId: null,
    currentPath: null,
    currentPoints: [],
    color: colorInput?.value || '#ff0000',
    strokeWidth: parseInt(strokeInput?.value || '3', 10),
    drawings: [],
    undoStack: [],
    cursorIndicator: null,
    drawButton,
    drawingLayer,
    settingsPanel,
    colorInput,
    strokeInput,
    strokeValue,
    clearButton,
    drawModeBtn,
    eraseModeBtn,
    colorRow,
    mapSurface,
    mapTransform,
    layerSize: { width: 0, height: 0 },
    pendingSync: false,
    syncTimeout: null,
    sceneId: options.getContext?.()?.sceneId || '_default',
    levelId: options.getContext?.()?.levelId || 'level-0',
    confirmedDrawings: [],
    pendingEdits: null,
    editBefore: null,
  };

  sharedState = state;

  drawButton.setAttribute('aria-pressed', 'false');

  const resizeObserver =
    typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => syncLayerSize(state))
      : null;
  resizeObserver?.observe(mapTransform);

  if (typeof MutationObserver === 'function') {
    const visibilityObserver = new MutationObserver(() => {
      if (mapTransform.hasAttribute('hidden')) {
        cancelDrawing(state);
      }
    });
    visibilityObserver.observe(mapTransform, { attributes: true, attributeFilter: ['hidden'] });
  }

  drawButton.addEventListener('click', () => {
    toggleDrawMode(state, !state.active);
  });

  if (colorInput) {
    colorInput.addEventListener('input', () => {
      state.color = colorInput.value;
      updateCursorIndicatorStyle(state);
    });
  }

  if (strokeInput && strokeValue) {
    strokeInput.addEventListener('input', () => {
      state.strokeWidth = parseInt(strokeInput.value, 10);
      strokeValue.textContent = strokeInput.value;
      updateCursorIndicatorSize(state);
    });
  }

  if (clearButton) {
    clearButton.addEventListener('click', () => {
      clearAllDrawings(state);
    });
  }

  if (drawModeBtn) {
    drawModeBtn.addEventListener('click', () => {
      setEraseMode(state, false);
    });
  }

  if (eraseModeBtn) {
    eraseModeBtn.addEventListener('click', () => {
      setEraseMode(state, true);
    });
  }

  mapSurface.addEventListener(
    'pointerdown',
    (event) => {
      if (!state.active || state.pendingSync || event.button !== 0) {
        return;
      }

      if (isPointerOverToken(event)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (state.eraseMode) {
        beginErasing(state, event);
      } else {
        beginDrawing(state, event);
      }
      try {
        mapSurface.setPointerCapture(event.pointerId);
      } catch (error) {
        // Ignore pointer capture errors
      }
    },
    true
  );

  mapSurface.addEventListener('pointermove', (event) => {
    // Update cursor indicator whenever draw mode is active
    if (state.active) {
      updateCursorIndicatorPosition(state, event);
    }

    if (event.pointerId !== state.pointerId) {
      return;
    }

    if (state.erasing) {
      event.preventDefault();
      event.stopPropagation();
      continueErasing(state, event);
      return;
    }

    if (!state.drawing) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    continueDrawing(state, event);
  });

  mapSurface.addEventListener('pointerup', (event) => {
    if (event.pointerId !== state.pointerId) {
      return;
    }

    if (state.erasing) {
      event.preventDefault();
      event.stopPropagation();
      endErasing(state);
      mapSurface.releasePointerCapture?.(event.pointerId);
      return;
    }

    if (!state.drawing) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    endDrawing(state, event);
    mapSurface.releasePointerCapture?.(event.pointerId);
  });

  mapSurface.addEventListener('pointercancel', (event) => {
    if (state.erasing && event.pointerId === state.pointerId) {
      event.stopPropagation();
      endErasing(state);
      mapSurface.releasePointerCapture?.(event.pointerId);
      return;
    }
    if (state.drawing && event.pointerId === state.pointerId) {
      event.stopPropagation();
      cancelDrawing(state);
      mapSurface.releasePointerCapture?.(event.pointerId);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.active) {
      if (state.drawing) {
        cancelDrawing(state);
      } else {
        toggleDrawMode(state, false);
      }
    }

    // Handle Ctrl+Z / Cmd+Z for undo
    if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
      if (state.active && !state.drawing) {
        event.preventDefault();
        undoLastDrawing(state);
      }
    }

    // Handle [ and ] to adjust stroke size when draw panel is open
    if (state.active && !event.ctrlKey && !event.metaKey && !event.altKey) {
      if (event.key === '[') {
        event.preventDefault();
        adjustStrokeSize(state, -1);
      } else if (event.key === ']') {
        event.preventDefault();
        adjustStrokeSize(state, 1);
      }
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.drawing) {
      cancelDrawing(state);
    }
  });

  syncLayerSize(state);
}

function toggleDrawMode(state, nextActive) {
  if (state.active === nextActive) {
    return;
  }

  state.active = nextActive;
  state.drawButton?.classList.toggle('is-active', state.active);
  if (state.drawButton) {
    state.drawButton.setAttribute('aria-pressed', state.active ? 'true' : 'false');
  }

  if (state.drawingLayer) {
    state.drawingLayer.setAttribute('data-drawing-active', state.active ? 'true' : 'false');
  }

  if (state.settingsPanel) {
    state.settingsPanel.hidden = !state.active;
  }

  if (state.active) {
    createCursorIndicator(state);
  } else {
    cancelDrawing(state);
    if (state.erasing) {
      endErasing(state);
    }
    setEraseMode(state, false);
    removeCursorIndicator(state);
  }
}

function beginDrawing(state, event) {
  const point = getMapCoordinates(state.mapTransform, event);
  if (!point) {
    return;
  }

  state.drawing = true;
  state.pointerId = event.pointerId;
  state.currentPoints = [point];

  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('stroke', state.color);
  path.setAttribute('stroke-width', String(state.strokeWidth));
  path.setAttribute('d', `M ${point.x} ${point.y}`);
  state.drawingLayer.appendChild(path);
  state.currentPath = path;
}

function continueDrawing(state, event) {
  const point = getMapCoordinates(state.mapTransform, event);
  if (!point || !state.currentPath) {
    return;
  }

  state.currentPoints.push(point);
  updatePathFromPoints(state.currentPath, state.currentPoints);
}

function endDrawing(state, event) {
  const point = getMapCoordinates(state.mapTransform, event);
  if (point && state.currentPath) {
    state.currentPoints.push(point);
    updatePathFromPoints(state.currentPath, state.currentPoints);
  }

  if (state.currentPath && state.currentPoints.length >= 2) {
    // Save current state to undo stack before adding new drawing
    pushToUndoStack(state);

    const authorId = typeof getCurrentUserId === 'function' ? getCurrentUserId() : null;
    const drawing = {
      id: generateDrawingId(),
      points: state.currentPoints.map((p) => ({ x: round(p.x, 2), y: round(p.y, 2) })),
      color: state.color,
      strokeWidth: state.strokeWidth,
      levelId: state.levelId,
    };
    if (authorId) {
      drawing.authorId = authorId;
    }
    state.drawings.push(drawing);
    state.currentPath.dataset.drawingId = drawing.id;
    scheduleSyncDrawings(state);
  } else if (state.currentPath) {
    state.currentPath.remove();
  }

  state.drawing = false;
  state.pointerId = null;
  state.currentPath = null;
  state.currentPoints = [];
}

function cancelDrawing(state) {
  if (state.currentPath) {
    state.currentPath.remove();
  }

  state.drawing = false;
  state.pointerId = null;
  state.currentPath = null;
  state.currentPoints = [];
}

function setEraseMode(state, eraseMode) {
  state.eraseMode = eraseMode;

  if (state.drawModeBtn) {
    state.drawModeBtn.classList.toggle('is-active', !eraseMode);
  }
  if (state.eraseModeBtn) {
    state.eraseModeBtn.classList.toggle('is-active', eraseMode);
  }
  if (state.colorRow) {
    state.colorRow.hidden = eraseMode;
  }
  if (state.drawingLayer) {
    state.drawingLayer.setAttribute('data-erase-active', eraseMode ? 'true' : 'false');
  }
  updateCursorIndicatorStyle(state);
}

function beginErasing(state, event) {
  const point = getMapCoordinates(state.mapTransform, event);
  if (!point) {
    return;
  }

  state.erasing = true;
  state.pointerId = event.pointerId;
  state.eraseDidChange = false;

  // Save undo snapshot before any erasing happens
  pushToUndoStack(state);

  eraseAtPoint(state, point);
}

function continueErasing(state, event) {
  const point = getMapCoordinates(state.mapTransform, event);
  if (!point) {
    return;
  }

  eraseAtPoint(state, point);
}

function endErasing(state) {
  if (!state.eraseDidChange) {
    // Nothing was erased, remove the undo snapshot we saved
    state.editBefore = null;
  } else {
    // Erasing removes drawings — needs a full replace on the server, not a delta merge
    state.needsFullSync = true;
    scheduleSyncDrawings(state);
  }

  state.erasing = false;
  state.pointerId = null;
  state.eraseDidChange = false;
}

function eraseAtPoint(state, point) {
  const eraserRadius = state.strokeWidth / 2;
  const result = [];
  let changed = false;

  for (const drawing of state.drawings) {
    if (!isEditable(state, drawing) || !drawing.points || drawing.points.length < 2) {
      result.push(drawing);
      continue;
    }

    const halfStroke = (drawing.strokeWidth || 3) / 2;
    const hitRadius = eraserRadius + halfStroke;
    const hitRadiusSq = hitRadius * hitRadius;

    // Check each segment for intersection with the eraser
    const segmentCount = drawing.points.length - 1;
    let anyHit = false;

    for (let i = 0; i < segmentCount; i++) {
      if (distSqPointToSegment(point, drawing.points[i], drawing.points[i + 1]) <= hitRadiusSq) {
        anyHit = true;
        break;
      }
    }

    if (!anyHit) {
      result.push(drawing);
      continue;
    }

    changed = true;

    // Split into fragments: collect runs of consecutive non-erased segments
    let fragStart = null;
    for (let i = 0; i < segmentCount; i++) {
      const hit = distSqPointToSegment(point, drawing.points[i], drawing.points[i + 1]) <= hitRadiusSq;

      if (!hit) {
        if (fragStart === null) {
          fragStart = i;
        }
      } else {
        if (fragStart !== null) {
          // Points fragStart through i form the non-erased run
          const fragPoints = drawing.points.slice(fragStart, i + 1);
          if (fragPoints.length >= 2) {
            const frag = {
              id: generateDrawingId(),
              points: fragPoints,
              color: drawing.color,
              strokeWidth: drawing.strokeWidth,
              levelId: drawing.levelId || 'level-0',
            };
            if (drawing.authorId) {
              frag.authorId = drawing.authorId;
            }
            result.push(frag);
          }
          fragStart = null;
        }
      }
    }

    // Trailing non-erased run
    if (fragStart !== null) {
      const fragPoints = drawing.points.slice(fragStart, segmentCount + 1);
      if (fragPoints.length >= 2) {
        const frag = {
          id: generateDrawingId(),
          points: fragPoints,
          color: drawing.color,
          strokeWidth: drawing.strokeWidth,
          levelId: drawing.levelId || 'level-0',
        };
        if (drawing.authorId) {
          frag.authorId = drawing.authorId;
        }
        result.push(frag);
      }
    }
  }

  if (!changed) {
    return;
  }

  state.eraseDidChange = true;
  state.drawings = result;
  renderDrawings(state);
}

function distSqPointToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    // a and b are the same point
    const ex = p.x - a.x;
    const ey = p.y - a.y;
    return ex * ex + ey * ey;
  }

  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  const ex = p.x - projX;
  const ey = p.y - projY;
  return ex * ex + ey * ey;
}

function adjustStrokeSize(state, delta) {
  if (!state.strokeInput) {
    return;
  }

  const min = parseInt(state.strokeInput.min, 10) || 1;
  const max = parseInt(state.strokeInput.max, 10) || 20;
  const newValue = Math.max(min, Math.min(max, state.strokeWidth + delta));

  if (newValue === state.strokeWidth) {
    return;
  }

  state.strokeWidth = newValue;
  state.strokeInput.value = String(newValue);
  if (state.strokeValue) {
    state.strokeValue.textContent = String(newValue);
  }
  updateCursorIndicatorSize(state);
}

function isEditable(state, drawing) {
  return canEditDrawing(drawing, {
    userId: getCurrentUserId?.(), isGM: getIsGM(), levelId: state.levelId,
  });
}

function clearAllDrawings(state) {
  if (state.pendingSync || !state.drawings.some((drawing) => isEditable(state, drawing))) return;
  pushToUndoStack(state);
  state.drawings = state.drawings.filter((drawing) => !isEditable(state, drawing));
  renderDrawings(state);
  scheduleSyncDrawings(state);
}

const MAX_UNDO_STACK_SIZE = 10;

function pushToUndoStack(state) {
  state.editBefore = state.drawings.slice();
}

function undoLastDrawing(state) {
  if (state.pendingSync || !state.undoStack.length) return;
  const edits = state.undoStack.pop();
  state.editBefore = state.drawings.slice();
  state.drawings = applyDrawingEdits(state.drawings, invertDrawingEdits(edits));
  renderDrawings(state);
  scheduleSyncDrawings(state, false);
}

function updatePathFromPoints(pathElement, points) {
  if (points.length < 2) {
    pathElement.setAttribute('d', `M ${points[0].x} ${points[0].y}`);
    return;
  }

  let d = `M ${points[0].x} ${points[0].y}`;

  if (points.length === 2) {
    d += ` L ${points[1].x} ${points[1].y}`;
  } else {
    for (let i = 1; i < points.length - 1; i++) {
      const p0 = points[i - 1];
      const p1 = points[i];
      const p2 = points[i + 1];

      const midX1 = (p0.x + p1.x) / 2;
      const midY1 = (p0.y + p1.y) / 2;
      const midX2 = (p1.x + p2.x) / 2;
      const midY2 = (p1.y + p2.y) / 2;

      if (i === 1) {
        d += ` L ${midX1} ${midY1}`;
      }

      d += ` Q ${p1.x} ${p1.y} ${midX2} ${midY2}`;
    }

    const lastPoint = points[points.length - 1];
    d += ` L ${lastPoint.x} ${lastPoint.y}`;
  }

  pathElement.setAttribute('d', d);
}

function getMapCoordinates(mapTransform, event) {
  const rect = mapTransform.getBoundingClientRect();
  const baseWidth = mapTransform.offsetWidth;
  const baseHeight = mapTransform.offsetHeight;
  if (!baseWidth || !baseHeight) {
    return null;
  }

  const scaleX = rect.width / baseWidth;
  const scaleY = rect.height / baseHeight;
  if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY) || scaleX === 0 || scaleY === 0) {
    return null;
  }

  return {
    x: (event.clientX - rect.left) / scaleX,
    y: (event.clientY - rect.top) / scaleY,
  };
}

function isPointerOverToken(event) {
  const tokenLayer = document.getElementById('vtt-token-layer');
  if (!tokenLayer || tokenLayer.hidden) {
    return false;
  }

  const { clientX, clientY } = event;
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
    return false;
  }

  const tokens = tokenLayer.querySelectorAll('.vtt-token');
  if (!tokens.length) {
    return false;
  }

  for (const token of tokens) {
    if (!(token instanceof Element)) {
      continue;
    }
    const rect = token.getBoundingClientRect();
    if (
      rect.width > 0 &&
      rect.height > 0 &&
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    ) {
      return true;
    }
  }

  return false;
}

function syncLayerSize(state) {
  const width = state.mapTransform.offsetWidth || 0;
  const height = state.mapTransform.offsetHeight || 0;
  if (state.layerSize.width === width && state.layerSize.height === height) {
    return;
  }

  const safeWidth = Math.max(width, 1);
  const safeHeight = Math.max(height, 1);
  state.drawingLayer.setAttribute('viewBox', `0 0 ${safeWidth} ${safeHeight}`);
  state.drawingLayer.setAttribute('width', String(safeWidth));
  state.drawingLayer.setAttribute('height', String(safeHeight));
  state.layerSize = { width, height };
}

function scheduleSyncDrawings(state, remember = true) {
  const edits = diffDrawings(state.editBefore || [], state.drawings);
  state.editBefore = null;
  if (!edits.length) return;
  if (remember) {
    state.undoStack.push(edits);
    if (state.undoStack.length > MAX_UNDO_STACK_SIZE) state.undoStack.shift();
  }
  const pending = { sceneId: state.sceneId, edits };
  state.pendingEdits = pending;
  state.pendingSync = true;
  state.drawingLayer.setAttribute('aria-busy', 'true');
  Promise.resolve().then(() => {
    if (!onDrawingChange) throw new Error('Drawing command connection is unavailable.');
    return onDrawingChange(edits, { sceneId: pending.sceneId });
  }).catch((error) => {
    // The command adapter reports the precise server reason. Keep only the
    // accepted canonical portion if a multi-entity edit failed partway.
    console.warn('[VTT] Drawing edit was not fully accepted', error);
    if (state.pendingEdits === pending) state.undoStack = [];
  }).finally(() => {
    if (state.pendingEdits !== pending) return;
    state.pendingEdits = null;
    state.pendingSync = false;
    state.drawings = state.confirmedDrawings.slice();
    state.drawingLayer.setAttribute('aria-busy', 'false');
    renderDrawings(state);
  });
}

function generateDrawingId() {
  return 'drawing-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

function round(value, precision) {
  const factor = Math.pow(10, precision);
  return Math.round(value * factor) / factor;
}

// --- Cursor indicator (circle showing brush/eraser radius) ---

function createCursorIndicator(state) {
  if (state.cursorIndicator) {
    return;
  }

  const circle = document.createElementNS(SVG_NS, 'circle');
  circle.setAttribute('class', 'vtt-cursor-indicator');
  circle.setAttribute('r', String(state.strokeWidth / 2));
  circle.setAttribute('cx', '0');
  circle.setAttribute('cy', '0');
  circle.style.display = 'none';
  updateCursorIndicatorStyle(state);
  state.drawingLayer.appendChild(circle);
  state.cursorIndicator = circle;
}

function removeCursorIndicator(state) {
  if (state.cursorIndicator) {
    state.cursorIndicator.remove();
    state.cursorIndicator = null;
  }
}

function updateCursorIndicatorPosition(state, event) {
  if (!state.cursorIndicator) {
    return;
  }

  const point = getMapCoordinates(state.mapTransform, event);
  if (!point) {
    state.cursorIndicator.style.display = 'none';
    return;
  }

  state.cursorIndicator.setAttribute('cx', String(point.x));
  state.cursorIndicator.setAttribute('cy', String(point.y));
  state.cursorIndicator.style.display = '';
}

function updateCursorIndicatorSize(state) {
  if (!state.cursorIndicator) {
    return;
  }
  state.cursorIndicator.setAttribute('r', String(state.strokeWidth / 2));
}

function updateCursorIndicatorStyle(state) {
  if (!state.cursorIndicator) {
    return;
  }
  if (state.eraseMode) {
    state.cursorIndicator.setAttribute('stroke', 'rgba(255, 255, 255, 0.8)');
    state.cursorIndicator.setAttribute('fill', 'rgba(255, 255, 255, 0.1)');
  } else {
    state.cursorIndicator.setAttribute('stroke', state.color);
    state.cursorIndicator.setAttribute('fill', 'rgba(255, 255, 255, 0.15)');
  }
}

// --- Exports ---

export function consumeFullSyncNeeded() {
  if (!sharedState) {
    return false;
  }
  const needed = sharedState.needsFullSync;
  sharedState.needsFullSync = false;
  return needed;
}

export function isDrawModeActive() {
  return Boolean(sharedState?.active);
}

export function isDrawingInProgress() {
  return Boolean(sharedState?.drawing);
}

export function isDrawingSyncPending() {
  return Boolean(sharedState?.pendingSync);
}

export function getDrawings() {
  return sharedState?.drawings.slice() || [];
}

export function setDrawingContext({ sceneId = '_default', levelId = 'level-0' } = {}) {
  if (!sharedState) return;
  const state = sharedState;
  if (sceneId !== state.sceneId || levelId !== state.levelId) {
    cancelDrawing(state);
    state.erasing = false;
    state.editBefore = null;
    state.drawings = applyDrawingEdits(state.confirmedDrawings, state.pendingEdits?.edits || []);
    state.undoStack = [];
    if (sceneId !== state.sceneId) {
      state.pendingEdits = null;
      state.pendingSync = false;
      state.drawingLayer.setAttribute('aria-busy', 'false');
      state.drawings = [];
      state.confirmedDrawings = [];
    }
    state.sceneId = sceneId;
    state.levelId = levelId;
    renderDrawings(state);
  }
}

export function setDrawings(drawings) {
  if (!sharedState) return;
  const state = sharedState;
  state.confirmedDrawings = Array.isArray(drawings) ? drawings.slice() : [];
  let edits = state.pendingEdits?.edits || [];
  if (state.editBefore) {
    edits = diffDrawings(state.editBefore, state.drawings);
    state.editBefore = state.confirmedDrawings.slice();
  }
  state.drawings = applyDrawingEdits(state.confirmedDrawings, edits);
  if (!state.drawing) renderDrawings(state);
}

export function renderDrawings(state) {
  const targetState = state || sharedState;
  if (!targetState || !targetState.drawingLayer) {
    return;
  }

  // Remove all children except the cursor indicator
  const children = Array.from(targetState.drawingLayer.childNodes);
  for (const child of children) {
    if (child !== targetState.cursorIndicator) {
      targetState.drawingLayer.removeChild(child);
    }
  }

  for (const drawing of targetState.drawings) {
    if ((drawing.levelId || 'level-0') !== targetState.levelId || !drawing.points || drawing.points.length < 2) {
      continue;
    }

    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('stroke', drawing.color || '#ff0000');
    path.setAttribute('stroke-width', String(drawing.strokeWidth || 3));
    path.dataset.drawingId = drawing.id;
    updatePathFromPoints(path, drawing.points);
    targetState.drawingLayer.appendChild(path);
  }

  // Re-append cursor indicator so it stays on top
  if (targetState.cursorIndicator) {
    targetState.drawingLayer.appendChild(targetState.cursorIndicator);
  }
}

export function setDrawModeActive(active) {
  if (sharedState) {
    toggleDrawMode(sharedState, active);
  }
}

export function isDrawingToolMounted() {
  return sharedState !== null;
}
