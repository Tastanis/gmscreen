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

  function sync(rawMapLevels = null, { sceneGrid = null } = {}) {
    const mapLevels = normalizeMapLevelsState(rawMapLevels, { sceneGrid });
    const renderableLevels = getRenderableMapLevels(mapLevels);
    const signature = safeStableStringify({
      activeLevelId: mapLevels.activeLevelId,
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
