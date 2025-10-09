const SVG_NS = 'http://www.w3.org/2000/svg';

let sharedState = null;

export function mountDragRuler() {
  const ruler = document.getElementById('vtt-distance-ruler');
  const rulerValue = ruler?.querySelector('.vtt-board__ruler-value');
  const measureButton = document.querySelector('[data-action="measure-distance"]');
  const mapSurface = document.getElementById('vtt-map-surface');
  const mapTransform = document.getElementById('vtt-map-transform');
  const grid = document.getElementById('vtt-grid-overlay');

  if (!ruler || !rulerValue || !measureButton || !mapSurface || !mapTransform || !grid) {
    return;
  }

  const overlay = createOverlay(mapTransform);
  const state = {
    active: false,
    measuring: false,
    pointerId: null,
    points: [],
    hoverPoint: null,
    overlay,
    ruler,
    rulerValue,
    measureButton,
    mapSurface,
    mapTransform,
    grid,
    overlaySize: { width: 0, height: 0 },
    mode: null,
  };

  sharedState = state;

  state.measureButton.setAttribute('aria-pressed', 'false');

  const resizeObserver =
    typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => syncOverlaySize(state))
      : null;
  resizeObserver?.observe(mapTransform);

  if (typeof MutationObserver === 'function') {
    const visibilityObserver = new MutationObserver(() => {
      if (mapTransform.hasAttribute('hidden')) {
        clearMeasurement(state);
      }
    });
    visibilityObserver.observe(mapTransform, { attributes: true, attributeFilter: ['hidden'] });
  }

  measureButton.addEventListener('click', () => {
    toggleMeasureMode(state, !state.active);
  });

  mapSurface.addEventListener(
    'pointerdown',
    (event) => {
      if (!state.active || event.button !== 0 || state.mode === 'external') {
        return;
      }

      if (isPointerOverToken(event)) {
        return;
      }

      const snapPoint = getSnappedPoint(state, event);
      if (!snapPoint) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      beginMeasurement(state, event.pointerId, snapPoint);
      try {
        mapSurface.setPointerCapture(event.pointerId);
      } catch (error) {
        // Ignore pointer capture errors – measurement will still function without it.
      }
    },
    true
  );

  mapSurface.addEventListener('pointermove', (event) => {
    if (!state.measuring || state.mode !== 'pointer' || event.pointerId !== state.pointerId) {
      return;
    }

    const snapPoint = getSnappedPoint(state, event);
    if (!snapPoint) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    updateHoverPoint(state, snapPoint);
  });

  mapSurface.addEventListener('pointerup', (event) => {
    if (!state.measuring || state.mode !== 'pointer' || event.pointerId !== state.pointerId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const snapPoint = getSnappedPoint(state, event);
    if (snapPoint) {
      commitHoverPoint(state, snapPoint);
    }
    endMeasurement(state);
    mapSurface.releasePointerCapture?.(event.pointerId);
  });

  mapSurface.addEventListener('pointercancel', (event) => {
    if (state.measuring && state.mode === 'pointer' && event.pointerId === state.pointerId) {
      event.stopPropagation();
      endMeasurement(state);
      mapSurface.releasePointerCapture?.(event.pointerId);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.active) {
      clearMeasurement(state);
      return;
    }

    if (event.key === 'Shift' && !event.repeat) {
      handleShiftKey(state);
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearMeasurement(state);
    }
  });

  syncOverlaySize(state);
}

function toggleMeasureMode(state, nextActive) {
  if (state.active === nextActive) {
    return;
  }

  state.active = nextActive;
  state.measureButton?.classList.toggle('is-active', state.active);
  if (state.measureButton) {
    state.measureButton.setAttribute('aria-pressed', state.active ? 'true' : 'false');
  }

  if (!state.active) {
    clearMeasurement(state);
  }
}

function beginMeasurement(state, pointerId, startPoint) {
  state.measuring = true;
  state.pointerId = pointerId;
  state.points = [startPoint];
  state.hoverPoint = startPoint;
  state.mode = 'pointer';
  updateOverlay(state);
}

function updateHoverPoint(state, hoverPoint) {
  state.hoverPoint = hoverPoint;
  updateOverlay(state);
}

function commitHoverPoint(state, snapPoint) {
  if (!state.points.length) {
    state.points = [snapPoint];
  } else {
    const lastPoint = state.points[state.points.length - 1];
    if (lastPoint.column !== snapPoint.column || lastPoint.row !== snapPoint.row) {
      state.points.push(snapPoint);
    }
  }
  state.hoverPoint = snapPoint;
  updateOverlay(state);
}

function endMeasurement(state) {
  state.measuring = false;
  state.pointerId = null;
  state.hoverPoint = null;
  if (state.mode === 'pointer') {
    state.mode = null;
  }
  updateOverlay(state);
}

function clearMeasurement(state) {
  if (state.pointerId !== null) {
    state.mapSurface.releasePointerCapture?.(state.pointerId);
  }
  state.measuring = false;
  state.pointerId = null;
  state.points = [];
  state.hoverPoint = null;
  state.mode = null;
  updateOverlay(state);
}

function handleShiftKey(state) {
  if (
    !state.measuring ||
    (state.mode !== 'pointer' && state.mode !== 'external')
  ) {
    return;
  }

  const snapshot = state.hoverPoint ?? state.points[state.points.length - 1];
  if (!snapshot) {
    return;
  }

  const duplicate = state.points.find(
    (point) => point.column === snapshot.column && point.row === snapshot.row
  );
  if (!duplicate) {
    state.points.push({ ...snapshot });
    updateOverlay(state);
  }
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

function getSnappedPoint(state, event) {
  const mapCoords = getMapCoordinates(state.mapTransform, event);
  if (!mapCoords) {
    return null;
  }

  const gridMetrics = getGridMetrics(state.grid, state.mapTransform);
  if (!gridMetrics) {
    return null;
  }

  syncOverlaySize(state);

  const { size, offsets, columns, rows } = gridMetrics;
  if (size <= 0 || columns <= 0 || rows <= 0) {
    return null;
  }

  const relativeX = mapCoords.x - offsets.left;
  const relativeY = mapCoords.y - offsets.top;

  const clampedColumn = clamp(Math.floor(relativeX / size), 0, columns - 1);
  const clampedRow = clamp(Math.floor(relativeY / size), 0, rows - 1);

  const centerX = offsets.left + (clampedColumn + 0.5) * size;
  const centerY = offsets.top + (clampedRow + 0.5) * size;

  return {
    mapX: centerX,
    mapY: centerY,
    column: clampedColumn,
    row: clampedRow,
  };
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

function getGridMetrics(grid, mapTransform) {
  const style = getComputedStyle(grid);
  const rawSize = parseFloat(style.getPropertyValue('--vtt-grid-size') || '0');
  const size = Number.isFinite(rawSize) && rawSize > 0 ? rawSize : 64;

  const offsets = {
    top: parseFloat(style.getPropertyValue('--vtt-grid-offset-top') || '0'),
    right: parseFloat(style.getPropertyValue('--vtt-grid-offset-right') || '0'),
    bottom: parseFloat(style.getPropertyValue('--vtt-grid-offset-bottom') || '0'),
    left: parseFloat(style.getPropertyValue('--vtt-grid-offset-left') || '0'),
  };

  const effectiveWidth = Math.max(
    0,
    mapTransform.offsetWidth - offsets.left - offsets.right
  );
  const effectiveHeight = Math.max(
    0,
    mapTransform.offsetHeight - offsets.top - offsets.bottom
  );

  const columns = size > 0 ? Math.floor(effectiveWidth / size) : 0;
  const rows = size > 0 ? Math.floor(effectiveHeight / size) : 0;

  return {
    size,
    offsets,
    columns: Math.max(columns, 0),
    rows: Math.max(rows, 0),
  };
}

function updateOverlay(state) {
  const points = getRenderablePoints(state);
  const segments = getSegments(points);
  const totalSquares = segments.reduce((sum, segment) => sum + segment.squares, 0);

  if (!segments.length) {
    state.overlay.svg.setAttribute('hidden', 'hidden');
    state.overlay.svg.style.display = 'none';
    state.overlay.path.setAttribute('points', '');
    state.overlay.nodes.innerHTML = '';
    state.overlay.labels.innerHTML = '';
    state.ruler.setAttribute('hidden', 'hidden');
    state.rulerValue.textContent = '0 squares';
    if (state.overlay.total) {
      state.overlay.total.setAttribute('hidden', 'hidden');
      state.overlay.total.style.display = 'none';
      state.overlay.total.textContent = '';
    }
    return;
  }

  state.overlay.svg.removeAttribute('hidden');
  state.overlay.svg.style.display = '';
  state.overlay.path.setAttribute(
    'points',
    points.map((point) => `${point.mapX},${point.mapY}`).join(' ')
  );

  syncNodeMarkers(state.overlay.nodes, points);
  syncSegmentLabels(state.overlay.labels, segments);

  state.ruler.removeAttribute('hidden');
  state.rulerValue.textContent =
    totalSquares === 1 ? '1 square' : `${totalSquares} squares`;

  const endPoint = points[points.length - 1];
  if (state.overlay.total && endPoint) {
    state.overlay.total.textContent =
      totalSquares === 1 ? '1 square' : `${totalSquares} squares`;
    state.overlay.total.setAttribute('x', endPoint.mapX);
    state.overlay.total.setAttribute('y', endPoint.mapY);
    state.overlay.total.removeAttribute('hidden');
    state.overlay.total.style.display = '';
  }
}

function getRenderablePoints(state) {
  if (!state.points.length) {
    return [];
  }

  if (state.measuring && state.hoverPoint) {
    const lastPoint = state.points[state.points.length - 1];
    if (
      !lastPoint ||
      lastPoint.column !== state.hoverPoint.column ||
      lastPoint.row !== state.hoverPoint.row
    ) {
      return [...state.points, state.hoverPoint];
    }
  }

  return state.points.slice();
}

function getSegments(points) {
  if (points.length < 2) {
    return [];
  }

  const segments = [];
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const squares = Math.max(
      Math.abs(end.column - start.column),
      Math.abs(end.row - start.row)
    );
    segments.push({ start, end, squares });
  }
  return segments;
}

function syncNodeMarkers(group, points) {
  const existing = Array.from(group.children);
  const desired = points.length;

  if (existing.length > desired) {
    existing.slice(desired).forEach((node) => node.remove());
  }

  const nodes = Array.from(group.children);
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    let circle = nodes[index];
    if (!circle) {
      circle = document.createElementNS(SVG_NS, 'circle');
      circle.classList.add('vtt-measure-overlay__node');
      circle.setAttribute('r', '10');
      circle.setAttribute('vector-effect', 'non-scaling-stroke');
      group.appendChild(circle);
      nodes.push(circle);
    }
    circle.setAttribute('cx', point.mapX);
    circle.setAttribute('cy', point.mapY);
  }
}

function syncSegmentLabels(group, segments) {
  const existing = Array.from(group.children);
  if (existing.length > segments.length) {
    existing.slice(segments.length).forEach((node) => node.remove());
  }

  const nodes = Array.from(group.children);
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    let text = nodes[index];
    if (!text) {
      text = document.createElementNS(SVG_NS, 'text');
      text.classList.add('vtt-measure-overlay__label');
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'middle');
      group.appendChild(text);
      nodes.push(text);
    }

    const midpoint = {
      x: (segment.start.mapX + segment.end.mapX) / 2,
      y: (segment.start.mapY + segment.end.mapY) / 2,
    };

    text.textContent = segment.squares === 1 ? '1 square' : `${segment.squares} squares`;
    text.setAttribute('x', midpoint.x);
    text.setAttribute('y', midpoint.y);
  }
}

function createOverlay(container) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.classList.add('vtt-measure-overlay');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('hidden', 'hidden');
  svg.style.pointerEvents = 'none';

  const path = document.createElementNS(SVG_NS, 'polyline');
  path.classList.add('vtt-measure-overlay__path');
  path.setAttribute('fill', 'none');
  path.setAttribute('vector-effect', 'non-scaling-stroke');
  svg.appendChild(path);

  const nodes = document.createElementNS(SVG_NS, 'g');
  nodes.classList.add('vtt-measure-overlay__nodes');
  svg.appendChild(nodes);

  const labels = document.createElementNS(SVG_NS, 'g');
  labels.classList.add('vtt-measure-overlay__labels');
  svg.appendChild(labels);

  const total = document.createElementNS(SVG_NS, 'text');
  total.classList.add('vtt-measure-overlay__label', 'vtt-measure-overlay__total');
  total.setAttribute('text-anchor', 'middle');
  total.setAttribute('dominant-baseline', 'middle');
  total.setAttribute('hidden', 'hidden');
  total.setAttribute('dy', '-28');
  svg.appendChild(total);

  container.appendChild(svg);

  return { svg, path, nodes, labels, total };
}

function syncOverlaySize(state) {
  const width = state.mapTransform.offsetWidth || 0;
  const height = state.mapTransform.offsetHeight || 0;
  if (state.overlaySize.width === width && state.overlaySize.height === height) {
    return;
  }

  const safeWidth = Math.max(width, 1);
  const safeHeight = Math.max(height, 1);
  state.overlay.svg.setAttribute('viewBox', `0 0 ${safeWidth} ${safeHeight}`);
  state.overlay.svg.setAttribute('width', String(safeWidth));
  state.overlay.svg.setAttribute('height', String(safeHeight));
  state.overlaySize = { width, height };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function clonePoint(point) {
  if (!point) {
    return null;
  }
  const { mapX, mapY, column, row } = point;
  if (
    !Number.isFinite(mapX) ||
    !Number.isFinite(mapY) ||
    !Number.isFinite(column) ||
    !Number.isFinite(row)
  ) {
    return null;
  }
  return {
    mapX,
    mapY,
    column,
    row,
  };
}

export function isMeasureModeActive() {
  return Boolean(sharedState?.active);
}

export function beginExternalMeasurement(point) {
  if (!sharedState || !sharedState.active) {
    return false;
  }
  const snapshot = clonePoint(point);
  if (!snapshot) {
    return false;
  }

  clearMeasurement(sharedState);
  sharedState.points = [snapshot];
  sharedState.hoverPoint = snapshot;
  sharedState.measuring = true;
  sharedState.mode = 'external';
  sharedState.pointerId = null;
  updateOverlay(sharedState);
  return true;
}

export function updateExternalMeasurement(point) {
  if (!sharedState || sharedState.mode !== 'external' || !sharedState.measuring) {
    return;
  }
  const snapshot = clonePoint(point);
  if (!snapshot) {
    return;
  }
  sharedState.hoverPoint = snapshot;
  updateOverlay(sharedState);
}

export function finalizeExternalMeasurement(point) {
  if (!sharedState || sharedState.mode !== 'external') {
    return;
  }

  const snapshot = clonePoint(point);
  if (snapshot) {
    const lastIndex = sharedState.points.length - 1;
    if (lastIndex < 0) {
      sharedState.points = [snapshot];
    } else {
      const lastPoint = sharedState.points[lastIndex];
      if (
        lastPoint &&
        lastPoint.column === snapshot.column &&
        lastPoint.row === snapshot.row
      ) {
        sharedState.points[lastIndex] = snapshot;
      } else {
        sharedState.points.push(snapshot);
      }
    }
  }

  sharedState.measuring = false;
  sharedState.pointerId = null;
  sharedState.hoverPoint = null;
  sharedState.mode = null;
  updateOverlay(sharedState);
}

export function cancelExternalMeasurement() {
  if (!sharedState) {
    return;
  }
  if (sharedState.mode === 'external') {
    clearMeasurement(sharedState);
  }
}
