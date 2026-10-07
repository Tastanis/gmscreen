import { rectToPixels } from './movement-math.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export function createMovementOverlay({ mapTransform } = {}) {
  let svg = null;
  let overlaySize = { width: 0, height: 0 };

  function ensure() {
    if (svg?.isConnected) {
      return svg;
    }
    if (!mapTransform || typeof document === 'undefined') {
      return null;
    }
    svg = document.createElementNS(SVG_NS, 'svg');
    svg.classList.add('vtt-token-movement-overlay');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('hidden', 'hidden');
    svg.style.pointerEvents = 'none';
    mapTransform.appendChild(svg);
    return svg;
  }

  function render(shape, gridMetrics) {
    const element = ensure();
    if (!element || !shape?.outer) {
      hide();
      return;
    }

    syncSize(element);
    while (element.firstChild) {
      element.removeChild(element.firstChild);
    }

    // The line is drawn in map pixels, so it is thickened on maps with large squares to stay visible.
    const size = Math.max(8, Number.isFinite(gridMetrics?.gridSize) ? gridMetrics.gridSize : 64);
    const strokeWidth = `${Math.max(3, size * 0.055)}px`;
    if (Array.isArray(shape.edges) && shape.edges.length) {
      // Terrain-aware reach: an outline along the squares that can really be reached.
      const left = Number.isFinite(gridMetrics?.offsets?.left) ? gridMetrics.offsets.left : 0;
      const top = Number.isFinite(gridMetrics?.offsets?.top) ? gridMetrics.offsets.top : 0;
      const corner = typeof gridMetrics?.projectCorner === 'function'
        ? gridMetrics.projectCorner
        : (column, row) => ({ x: left + column * size, y: top + row * size });
      const d = shape.edges.map(([c1, r1, c2, r2]) => {
        const a = corner(c1, r1);
        const b = corner(c2, r2);
        return `M${format(a.x)} ${format(a.y)}L${format(b.x)} ${format(b.y)}`;
      }).join('');
      const path = document.createElementNS(SVG_NS, 'path');
      path.classList.add('vtt-token-movement-overlay__reach');
      path.setAttribute('d', d);
      path.style.strokeWidth = strokeWidth;
      element.appendChild(path);
    } else {
      const outer = rectToPixels(shape.outer, gridMetrics);
      const outline = createRect(outer, 'vtt-token-movement-overlay__outline');
      outline.style.strokeWidth = strokeWidth;
      element.appendChild(outline);
    }

    const cutouts = Array.isArray(shape.cutouts) ? shape.cutouts : [];
    cutouts.forEach((cutout) => {
      const pixels = rectToPixels(cutout, gridMetrics);
      if (pixels.width > 0 && pixels.height > 0) {
        element.appendChild(createRect(pixels, 'vtt-token-movement-overlay__cutout'));
      }
    });

    element.removeAttribute('hidden');
    element.style.display = '';
  }

  function hide() {
    if (!svg) {
      return;
    }
    svg.setAttribute('hidden', 'hidden');
    svg.style.display = 'none';
    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }
  }

  function syncSize(element = svg) {
    if (!element || !mapTransform) {
      return;
    }
    const width = mapTransform.offsetWidth || 0;
    const height = mapTransform.offsetHeight || 0;
    if (overlaySize.width === width && overlaySize.height === height) {
      return;
    }
    const safeWidth = Math.max(width, 1);
    const safeHeight = Math.max(height, 1);
    element.setAttribute('viewBox', `0 0 ${safeWidth} ${safeHeight}`);
    element.setAttribute('width', String(safeWidth));
    element.setAttribute('height', String(safeHeight));
    overlaySize = { width, height };
  }

  return {
    render,
    hide,
    syncSize,
  };
}

function createRect(rect, className) {
  const node = document.createElementNS(SVG_NS, 'rect');
  node.classList.add(className);
  node.setAttribute('x', format(rect.x));
  node.setAttribute('y', format(rect.y));
  node.setAttribute('width', format(rect.width));
  node.setAttribute('height', format(rect.height));
  node.setAttribute('rx', '6');
  node.setAttribute('ry', '6');
  return node;
}

function format(value) {
  return Number.isFinite(value) ? String(Math.round(value * 100) / 100) : '0';
}
