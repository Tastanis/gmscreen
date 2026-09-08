import {BASE_MAP_LEVEL_ID, resolvePlacementLevelId, normalizeMapLevelCutout} from '../state/normalize/map-levels.js';

export function resolveTemplateLevelPresentation(shape, view, levelContext, {pixelBounds = null} = {}) {
  const levels = Array.isArray(levelContext?.levels) ? levelContext.levels : [];
  const viewerLevelId = typeof levelContext?.viewerLevelId === 'string' && levelContext.viewerLevelId
    ? levelContext.viewerLevelId
    : BASE_MAP_LEVEL_ID;
  const templateLevelId = resolvePlacementLevelId(shape);
  const viewerIndex = levels.findIndex((level) => level?.id === viewerLevelId);
  const templateIndex = levels.findIndex((level) => level?.id === templateLevelId);
  const templateLevel = templateIndex >= 0 ? levels[templateIndex] : null;

  if (viewerIndex < 0 || templateIndex < 0 || templateLevel?.hidden === true) {
    return { visible: false };
  }

  if (templateIndex > viewerIndex) {
    return { visible: false };
  }

  if (templateIndex === viewerIndex) {
    return { visible: true, maskRects: null };
  }

  const blockingLevels = levels
    .slice(templateIndex + 1, viewerIndex + 1)
    .filter((level) => doesTemplateLevelBlockLowerVision(level));
  if (!blockingLevels.length) {
    return { visible: true, maskRects: null };
  }

  const maskRects = buildTemplateCutoutMaskRects(shape, view, blockingLevels, pixelBounds);
  return { visible: maskRects.length > 0, maskRects };
}

function doesTemplateLevelBlockLowerVision(level) {
  if (!level || typeof level !== 'object' || level.hidden === true) {
    return false;
  }
  if (level.blocksLowerLevelVision === false) {
    return false;
  }
  if (Number.isFinite(level.opacity) && level.opacity <= 0) {
    return false;
  }
  return typeof level.mapUrl === 'string' && level.mapUrl.trim().length > 0;
}

function buildTemplateCutoutMaskRects(shape, view, blockingLevels = [], pixelBounds = null) {
  const root = shape?.elements?.root;
  const rootWidth = parseCssPixelValue(pixelBounds?.width ?? root?.style?.width);
  const rootHeight = parseCssPixelValue(pixelBounds?.height ?? root?.style?.height);
  const rootLeft = parseCssPixelValue(pixelBounds?.left ?? root?.style?.left);
  const rootTop = parseCssPixelValue(pixelBounds?.top ?? root?.style?.top);
  if (rootWidth <= 0 || rootHeight <= 0) {
    return [];
  }

  let rects = [{ x: 0, y: 0, width: rootWidth, height: rootHeight }];
  for (const level of blockingLevels) {
    const cutoutRects = getLevelCutoutPixelRects(level, view)
      .map((rect) => ({
        x: rect.x - rootLeft,
        y: rect.y - rootTop,
        width: rect.width,
        height: rect.height,
      }))
      .map((rect) => intersectRects(rect, { x: 0, y: 0, width: rootWidth, height: rootHeight }))
      .filter(Boolean);

    if (!cutoutRects.length) {
      return [];
    }

    const nextRects = [];
    rects.forEach((current) => {
      cutoutRects.forEach((cutout) => {
        const intersection = intersectRects(current, cutout);
        if (intersection) {
          nextRects.push(intersection);
        }
      });
    });
    rects = nextRects;
    if (!rects.length) {
      return [];
    }
  }

  return rects;
}

function getLevelCutoutPixelRects(level, view) {
  const cutouts = Array.isArray(level?.cutouts) ? level.cutouts : [];
  const offsets = view?.gridOffsets ?? {};
  const offsetLeft = Number.isFinite(offsets.left) ? offsets.left : 0;
  const offsetTop = Number.isFinite(offsets.top) ? offsets.top : 0;
  const gridSize = Math.max(8, Number.isFinite(view?.gridSize) ? view.gridSize : 64);

  return cutouts
    .map((cutout) => {
      const normalized=normalizeMapLevelCutout(cutout);
      if(!normalized)return null;
      const {column,row,width,height}=normalized;
      return {
        x: offsetLeft + column * gridSize,
        y: offsetTop + row * gridSize,
        width: width * gridSize,
        height: height * gridSize,
      };
    })
    .filter(Boolean);
}

export function applyTemplateVisibilityMask(root, rects = []) {
  if (!root || !Array.isArray(rects) || rects.length === 0) {
    clearTemplateVisibilityMask(root);
    return;
  }
  const width = parseCssPixelValue(root.style.width);
  const height = parseCssPixelValue(root.style.height);
  if (width <= 0 || height <= 0) {
    clearTemplateVisibilityMask(root);
    return;
  }
  const rectPaths = rects
    .map((rect) => {
      const x = roundTemplateMaskNumber(rect.x);
      const y = roundTemplateMaskNumber(rect.y);
      const w = roundTemplateMaskNumber(rect.width);
      const h = roundTemplateMaskNumber(rect.height);
      if (w <= 0 || h <= 0) {
        return '';
      }
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="white"/>`;
    })
    .filter(Boolean)
    .join('');
  if (!rectPaths) {
    clearTemplateVisibilityMask(root);
    return;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${roundTemplateMaskNumber(width)} ${roundTemplateMaskNumber(height)}">${rectPaths}</svg>`;
  const mask = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  root.style.maskImage = mask;
  root.style.webkitMaskImage = mask;
  root.style.maskRepeat = 'no-repeat';
  root.style.webkitMaskRepeat = 'no-repeat';
  root.style.maskSize = '100% 100%';
  root.style.webkitMaskSize = '100% 100%';
}

export function clearTemplateVisibilityMask(root) {
  if (!root) {
    return;
  }
  root.style.maskImage = '';
  root.style.webkitMaskImage = '';
  root.style.maskRepeat = '';
  root.style.webkitMaskRepeat = '';
  root.style.maskSize = '';
  root.style.webkitMaskSize = '';
}

function intersectRects(a, b) {
  if (!a || !b) {
    return null;
  }
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  if (right <= left || bottom <= top) {
    return null;
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function parseCssPixelValue(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundTemplateMaskNumber(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.round(value * 100) / 100;
}

