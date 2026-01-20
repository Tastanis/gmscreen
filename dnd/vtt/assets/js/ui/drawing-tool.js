const SVG_NS = 'http://www.w3.org/2000/svg';

let sharedState = null;
let onDrawingChange = null;
let getCurrentUserId = null;

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

  const state = {
    active: false,
    drawing: false,
    pointerId: null,
    currentPath: null,
    currentPoints: [],
    color: colorInput?.value || '#ff0000',
    strokeWidth: parseInt(strokeInput?.value || '3', 10),
    drawings: [],
    undoStack: [],
    drawButton,
    drawingLayer,
    settingsPanel,
    colorInput,
    strokeInput,
    strokeValue,
    clearButton,
    mapSurface,
    mapTransform,
    layerSize: { width: 0, height: 0 },
    pendingSync: false,
    syncTimeout: null,
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
    });
  }

  if (strokeInput && strokeValue) {
    strokeInput.addEventListener('input', () => {
      state.strokeWidth = parseInt(strokeInput.value, 10);
      strokeValue.textContent = strokeInput.value;
    });
  }

  if (clearButton) {
    clearButton.addEventListener('click', () => {
      clearAllDrawings(state);
    });
  }

  mapSurface.addEventListener(
    'pointerdown',
    (event) => {
      if (!state.active || event.button !== 0) {
        return;
      }

      if (isPointerOverToken(event)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      beginDrawing(state, event);
      try {
        mapSurface.setPointerCapture(event.pointerId);
      } catch (error) {
        // Ignore pointer capture errors
      }
    },
    true
  );

  mapSurface.addEventListener('pointermove', (event) => {
    if (!state.drawing || event.pointerId !== state.pointerId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    continueDrawing(state, event);
  });

  mapSurface.addEventListener('pointerup', (event) => {
    if (!state.drawing || event.pointerId !== state.pointerId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    endDrawing(state, event);
    mapSurface.releasePointerCapture?.(event.pointerId);
  });

  mapSurface.addEventListener('pointercancel', (event) => {
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

  if (!state.active) {
    cancelDrawing(state);
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

function clearAllDrawings(state) {
  const currentUserId = typeof getCurrentUserId === 'function' ? getCurrentUserId() : null;

  // Find drawings that belong to the current user
  const userDrawings = currentUserId
    ? state.drawings.filter((d) => d.authorId === currentUserId)
    : state.drawings;

  // If user has no drawings to clear, do nothing
  if (userDrawings.length === 0) {
    return;
  }

  // Save current state to undo stack before clearing
  pushToUndoStack(state);

  if (currentUserId) {
    // Only remove drawings belonging to the current user
    const userDrawingIds = new Set(userDrawings.map((d) => d.id));
    state.drawings = state.drawings.filter((d) => !userDrawingIds.has(d.id));
  } else {
    // No user ID - clear all drawings (fallback behavior)
    state.drawings = [];
  }

  // Re-render remaining drawings
  renderDrawings(state);
  scheduleSyncDrawings(state);
}

const MAX_UNDO_STACK_SIZE = 10;

function pushToUndoStack(state) {
  // Clone the current drawings array
  const snapshot = state.drawings.map((d) => {
    const clone = {
      id: d.id,
      points: d.points.map((p) => ({ x: p.x, y: p.y })),
      color: d.color,
      strokeWidth: d.strokeWidth,
    };
    if (d.authorId) {
      clone.authorId = d.authorId;
    }
    return clone;
  });

  state.undoStack.push(snapshot);

  // Keep only the last 10 states
  if (state.undoStack.length > MAX_UNDO_STACK_SIZE) {
    state.undoStack.shift();
  }
}

function undoLastDrawing(state) {
  const currentUserId = typeof getCurrentUserId === 'function' ? getCurrentUserId() : null;

  if (currentUserId) {
    // Find the last drawing by the current user
    let lastUserDrawingIndex = -1;
    for (let i = state.drawings.length - 1; i >= 0; i--) {
      if (state.drawings[i].authorId === currentUserId) {
        lastUserDrawingIndex = i;
        break;
      }
    }

    if (lastUserDrawingIndex === -1) {
      // No drawings by this user to undo
      return;
    }

    // Save current state to undo stack before removing
    pushToUndoStack(state);

    // Remove the last drawing by this user
    state.drawings.splice(lastUserDrawingIndex, 1);

    // Re-render all drawings
    renderDrawings(state);

    // Sync to server
    scheduleSyncDrawings(state);
  } else {
    // Fallback to original behavior when no user ID
    if (state.undoStack.length === 0) {
      return;
    }

    // Pop the last saved state
    const previousDrawings = state.undoStack.pop();

    // Restore the drawings
    state.drawings = previousDrawings;

    // Re-render all drawings
    renderDrawings(state);

    // Sync to server
    scheduleSyncDrawings(state);
  }
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

function scheduleSyncDrawings(state) {
  if (state.syncTimeout) {
    clearTimeout(state.syncTimeout);
  }

  state.pendingSync = true;
  state.syncTimeout = setTimeout(() => {
    state.syncTimeout = null;
    if (onDrawingChange) {
      onDrawingChange(state.drawings.slice());
    }
    // Set pendingSync to false AFTER the callback completes
    // This ensures syncDrawingsFromState sees the sync is still pending
    // and doesn't overwrite the drawing tool state (which would clear undo)
    state.pendingSync = false;
  }, 100);
}

function generateDrawingId() {
  return 'drawing-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

function round(value, precision) {
  const factor = Math.pow(10, precision);
  return Math.round(value * factor) / factor;
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

export function setDrawings(drawings) {
  if (!sharedState) {
    return;
  }

  sharedState.drawings = Array.isArray(drawings) ? drawings.slice() : [];
  // Clear undo stack when drawings are loaded from external source
  sharedState.undoStack = [];
  renderDrawings(sharedState);
}

export function renderDrawings(state) {
  const targetState = state || sharedState;
  if (!targetState || !targetState.drawingLayer) {
    return;
  }

  while (targetState.drawingLayer.firstChild) {
    targetState.drawingLayer.removeChild(targetState.drawingLayer.firstChild);
  }

  for (const drawing of targetState.drawings) {
    if (!drawing.points || drawing.points.length < 2) {
      continue;
    }

    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('stroke', drawing.color || '#ff0000');
    path.setAttribute('stroke-width', String(drawing.strokeWidth || 3));
    path.dataset.drawingId = drawing.id;
    updatePathFromPoints(path, drawing.points);
    targetState.drawingLayer.appendChild(path);
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
