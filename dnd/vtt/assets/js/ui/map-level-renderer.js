import { normalizeMapLevelsState } from '../state/normalize/map-levels.js';

export const MAP_LEVEL_STACK_ID = 'vtt-map-levels';
export const MAP_LEVEL_STACK_CLASS = 'vtt-board__map-levels';
export const MAP_LEVEL_STACK_INNER_CLASS = 'vtt-board__map-levels-stack';
export const MAP_LEVEL_CLASS = 'vtt-board__map-level';

export function createMapLevelRenderer({
  mapTransform = null,
  insertBefore = null,
  documentRef = typeof document !== 'undefined' ? document : null,
} = {}) {
  if (!mapTransform || !documentRef) {
    return createNoopMapLevelRenderer();
  }

  const root = ensureMapLevelRoot({ mapTransform, insertBefore, documentRef });
  const stack = ensureMapLevelStack(root, documentRef);
  const levelElements = new Map();
  let lastSignature = null;

  function sync(rawMapLevels = null, { sceneGrid = null, view = null } = {}) {
    const mapLevels = normalizeMapLevelsState(rawMapLevels, { sceneGrid });
    const renderableLevels = getRenderableMapLevels(mapLevels);
    const signature = safeStableStringify({
      activeLevelId: mapLevels.activeLevelId,
      cutoutView: buildMapLevelCutoutViewSignature(view),
      levels: renderableLevels,
    });

    if (signature === lastSignature) {
      return;
    }
    lastSignature = signature;

    root.dataset.activeMapLevelId = mapLevels.activeLevelId ?? '';
    root.dataset.mapLevelCount = String(renderableLevels.length);

    if (renderableLevels.length === 0) {
      clearRenderedLevels({ root, stack, levelElements });
      return;
    }

    root.hidden = false;
    root.removeAttribute('hidden');

    const fragment = documentRef.createDocumentFragment();
    const retained = new Set();

    renderableLevels.forEach((level, index) => {
      const levelId = level.id;
      retained.add(levelId);

      let element = levelElements.get(levelId);
      if (!element || element.parentNode !== stack) {
        element = documentRef.createElement('div');
        element.className = MAP_LEVEL_CLASS;
        element.setAttribute('aria-hidden', 'true');
        element.style.pointerEvents = 'none';
        levelElements.set(levelId, element);
      }

      element.dataset.mapLevelId = levelId;
      element.dataset.mapLevelName = level.name ?? '';
      element.dataset.mapLevelIndex = String(index);
      element.dataset.mapLevelZIndex = String(level.zIndex);
      element.dataset.mapLevelCutoutCount = String(
        Array.isArray(level.cutouts) ? level.cutouts.length : 0
      );
      element.style.backgroundImage = buildCssUrl(level.mapUrl);
      element.style.opacity = String(level.opacity);
      element.style.zIndex = String(level.zIndex);
      applyMapLevelCutoutMask(element, level.cutouts, view);
      element.hidden = false;
      element.removeAttribute('hidden');

      fragment.append(element);
    });

    levelElements.forEach((element, id) => {
      if (!retained.has(id)) {
        element.remove();
        levelElements.delete(id);
      }
    });

    stack.replaceChildren(fragment);
  }

  function reset() {
    lastSignature = null;
    root.dataset.activeMapLevelId = '';
    root.dataset.mapLevelCount = '0';
    clearRenderedLevels({ root, stack, levelElements });
  }

  return {
    element: root,
    sync,
    reset,
  };
}

export function applyMapLevelCutoutMask(element, cutouts = [], view = null) {
  if (!element) {
    return false;
  }

  clearMapLevelCutoutMask(element);
  const mask = buildMapLevelCutoutMask(cutouts, view);
  if (!mask) {
    element.dataset.mapLevelHasCutoutMask = 'false';
    return false;
  }

  element.dataset.mapLevelHasCutoutMask = 'true';
  element.style.maskImage = mask;
  element.style.webkitMaskImage = mask;
  element.style.maskRepeat = 'no-repeat';
  element.style.webkitMaskRepeat = 'no-repeat';
  element.style.maskSize = '100% 100%';
  element.style.webkitMaskSize = '100% 100%';
  return true;
}

export function clearMapLevelCutoutMask(element) {
  if (!element) {
    return;
  }

  element.style.maskImage = '';
  element.style.webkitMaskImage = '';
  element.style.maskRepeat = '';
  element.style.webkitMaskRepeat = '';
  element.style.maskSize = '';
  element.style.webkitMaskSize = '';
  delete element.dataset.mapLevelHasCutoutMask;
}

export function buildMapLevelCutoutMask(cutouts = [], view = null) {
  const metrics = resolveMapLevelCutoutMetrics(view);
  if (!metrics || !Array.isArray(cutouts) || cutouts.length === 0) {
    return '';
  }

  const rectangles = cutouts
    .map((cutout) => buildMapLevelCutoutRectangle(cutout, metrics))
    .filter(Boolean);

  if (!rectangles.length) {
    return '';
  }

  const outer = [
    'M 0 0',
    `H ${formatSvgNumber(metrics.innerWidth)}`,
    `V ${formatSvgNumber(metrics.innerHeight)}`,
    'H 0 Z',
  ].join(' ');
  const holes = rectangles
    .map((rect) =>
      [
        `M ${formatSvgNumber(rect.x)} ${formatSvgNumber(rect.y)}`,
        `H ${formatSvgNumber(rect.x + rect.width)}`,
        `V ${formatSvgNumber(rect.y + rect.height)}`,
        `H ${formatSvgNumber(rect.x)} Z`,
      ].join(' ')
    )
    .join(' ');
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${formatSvgNumber(metrics.innerWidth)} ${formatSvgNumber(metrics.innerHeight)}">`,
    `<path fill="white" fill-rule="evenodd" d="${outer} ${holes}"/>`,
    '</svg>',
  ].join('');

  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export function getRenderableMapLevels(mapLevelsState = null) {
  const levels = Array.isArray(mapLevelsState?.levels) ? mapLevelsState.levels : [];

  return levels
    .map((level, sourceIndex) => ({ level, sourceIndex }))
    .filter(({ level }) => {
      if (!level || typeof level !== 'object' || level.visible === false) {
        return false;
      }

      return typeof level.mapUrl === 'string' && level.mapUrl.trim().length > 0;
    })
    .sort((left, right) => {
      const leftZ = Number.isFinite(left.level.zIndex) ? left.level.zIndex : 0;
      const rightZ = Number.isFinite(right.level.zIndex) ? right.level.zIndex : 0;
      if (leftZ !== rightZ) {
        return leftZ - rightZ;
      }
      return left.sourceIndex - right.sourceIndex;
    })
    .map(({ level }) => level);
}

export function resolveSceneMapLevelsState(boardState = {}, sceneId = null) {
  if (!boardState || typeof boardState !== 'object') {
    return null;
  }

  const sceneEntries =
    boardState.sceneState && typeof boardState.sceneState === 'object'
      ? boardState.sceneState
      : {};
  const key = typeof sceneId === 'string' ? sceneId : '';

  if (key && sceneEntries[key] && typeof sceneEntries[key] === 'object') {
    return sceneEntries[key].mapLevels ?? null;
  }

  return null;
}

export function buildCssUrl(value) {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  const sanitized = trimmed.replace(/["\\\n\r]/g, (char) => {
    if (char === '"') {
      return '\\"';
    }
    if (char === '\\') {
      return '\\\\';
    }
    return '';
  });

  return `url("${sanitized}")`;
}

function ensureMapLevelRoot({ mapTransform, insertBefore, documentRef }) {
  let root = documentRef.getElementById(MAP_LEVEL_STACK_ID);

  if (!root) {
    root = documentRef.createElement('div');
    root.id = MAP_LEVEL_STACK_ID;
  }

  root.className = MAP_LEVEL_STACK_CLASS;
  root.setAttribute('aria-hidden', 'true');
  root.style.pointerEvents = 'none';
  root.hidden = true;
  root.setAttribute('hidden', '');

  if (root.parentNode !== mapTransform) {
    const target = insertBefore && insertBefore.parentNode === mapTransform ? insertBefore : null;
    if (target) {
      mapTransform.insertBefore(root, target);
    } else {
      mapTransform.append(root);
    }
  } else if (insertBefore && insertBefore.parentNode === mapTransform) {
    const siblings = Array.from(mapTransform.children);
    if (siblings.indexOf(root) > siblings.indexOf(insertBefore)) {
      mapTransform.insertBefore(root, insertBefore);
    }
  }

  return root;
}

function ensureMapLevelStack(root, documentRef) {
  let stack = root.querySelector(`.${MAP_LEVEL_STACK_INNER_CLASS}`);
  if (!stack) {
    stack = documentRef.createElement('div');
    stack.className = MAP_LEVEL_STACK_INNER_CLASS;
    root.prepend(stack);
  }
  stack.style.pointerEvents = 'none';
  return stack;
}

function clearRenderedLevels({ root, stack, levelElements }) {
  root.hidden = true;
  root.setAttribute('hidden', '');
  levelElements.forEach((element) => {
    clearMapLevelCutoutMask(element);
    element.remove();
  });
  levelElements.clear();
  stack.replaceChildren();
}

function createNoopMapLevelRenderer() {
  return {
    element: null,
    sync() {},
    reset() {},
  };
}

function safeStableStringify(value) {
  const seen = new WeakSet();

  function serialize(input) {
    if (input === null || typeof input !== 'object') {
      return input;
    }

    if (seen.has(input)) {
      return null;
    }
    seen.add(input);

    if (Array.isArray(input)) {
      return input.map((item) => serialize(item));
    }

    const result = {};
    Object.keys(input)
      .sort()
      .forEach((key) => {
        result[key] = serialize(input[key]);
      });
    return result;
  }

  try {
    return JSON.stringify(serialize(value));
  } catch (error) {
    return null;
  }
}

function buildMapLevelCutoutViewSignature(view = null) {
  const metrics = resolveMapLevelCutoutMetrics(view);
  if (!metrics) {
    return null;
  }

  return {
    innerWidth: metrics.innerWidth,
    innerHeight: metrics.innerHeight,
    originX: metrics.originX,
    originY: metrics.originY,
    gridSize: metrics.gridSize,
  };
}

function resolveMapLevelCutoutMetrics(view = null) {
  if (!view || typeof view !== 'object') {
    return null;
  }

  const mapPixelSize = view.mapPixelSize && typeof view.mapPixelSize === 'object'
    ? view.mapPixelSize
    : {};
  const mapWidth = toFiniteNumber(mapPixelSize.width, 0);
  const mapHeight = toFiniteNumber(mapPixelSize.height, 0);
  if (mapWidth <= 0 || mapHeight <= 0) {
    return null;
  }

  const insets = view.mapInsets && typeof view.mapInsets === 'object'
    ? view.mapInsets
    : view.gridOffsets && typeof view.gridOffsets === 'object'
      ? view.gridOffsets
      : {};
  const left = toFiniteNumber(insets.left, 0);
  const right = toFiniteNumber(insets.right, 0);
  const top = toFiniteNumber(insets.top, 0);
  const bottom = toFiniteNumber(insets.bottom, 0);
  const innerWidth = Math.max(0, mapWidth - left - right);
  const innerHeight = Math.max(0, mapHeight - top - bottom);
  if (innerWidth <= 0 || innerHeight <= 0) {
    return null;
  }

  const origin = view.gridOrigin && typeof view.gridOrigin === 'object' ? view.gridOrigin : {};
  return {
    innerWidth,
    innerHeight,
    originX: toFiniteNumber(origin.x, 0),
    originY: toFiniteNumber(origin.y, 0),
    gridSize: Math.max(8, toFiniteNumber(view.gridSize, 64)),
  };
}

function buildMapLevelCutoutRectangle(cutout = {}, metrics) {
  if (!cutout || typeof cutout !== 'object' || !metrics) {
    return null;
  }

  const column = Math.max(0, Math.trunc(toFiniteNumber(cutout.column ?? cutout.col ?? cutout.x, NaN)));
  const row = Math.max(0, Math.trunc(toFiniteNumber(cutout.row ?? cutout.y, NaN)));
  if (!Number.isFinite(column) || !Number.isFinite(row)) {
    return null;
  }

  const width = Math.max(1, Math.trunc(toFiniteNumber(cutout.width ?? cutout.columns ?? cutout.w, 1)));
  const height = Math.max(1, Math.trunc(toFiniteNumber(cutout.height ?? cutout.rows ?? cutout.h, 1)));
  const x1 = clamp(metrics.originX + column * metrics.gridSize, 0, metrics.innerWidth);
  const y1 = clamp(metrics.originY + row * metrics.gridSize, 0, metrics.innerHeight);
  const x2 = clamp(metrics.originX + (column + width) * metrics.gridSize, 0, metrics.innerWidth);
  const y2 = clamp(metrics.originY + (row + height) * metrics.gridSize, 0, metrics.innerHeight);
  const rectWidth = x2 - x1;
  const rectHeight = y2 - y1;
  if (rectWidth <= 0 || rectHeight <= 0) {
    return null;
  }

  return {
    x: roundToPrecision(x1, 2),
    y: roundToPrecision(y1, 2),
    width: roundToPrecision(rectWidth, 2),
    height: roundToPrecision(rectHeight, 2),
  };
}

function toFiniteNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function roundToPrecision(value, precision = 2) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const factor = 10 ** Math.max(0, Math.trunc(precision));
  return Math.round(value * factor) / factor;
}

function formatSvgNumber(value) {
  return String(roundToPrecision(value, 2));
}
