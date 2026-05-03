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

    const outer = rectToPixels(shape.outer, gridMetrics);
    element.appendChild(createRect(outer, 'vtt-token-movement-overlay__outline'));

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
