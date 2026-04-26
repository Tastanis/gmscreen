import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MAP_LEVEL_CLASS,
  MAP_LEVEL_STACK_ID,
  buildMapLevelCutoutMask,
  buildCssUrl,
  createMapLevelRenderer,
  getRenderableMapLevels,
  resolveSceneMapLevelsState,
} from '../map-level-renderer.js';

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.parentNode = null;
    this.attributes = new Map();
    this.dataset = {};
    this.style = {};
    this.hidden = false;
    this.id = '';
    this.className = '';
  }

  setAttribute(name, value) {
    const stringValue = String(value);
    this.attributes.set(name, stringValue);
    if (name === 'id') {
      this.id = stringValue;
    }
    if (name === 'class') {
      this.className = stringValue;
    }
  }

  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === 'hidden') {
      this.hidden = false;
    }
  }

  append(...nodes) {
    nodes.forEach((node) => {
      appendChild(this, node);
    });
  }

  prepend(...nodes) {
    nodes.reverse().forEach((node) => {
      appendChild(this, node, 0);
    });
  }

  insertBefore(node, referenceNode) {
    const index = this.children.indexOf(referenceNode);
    appendChild(this, node, index >= 0 ? index : this.children.length);
  }

  replaceChildren(...nodes) {
    this.children.forEach((child) => {
      child.parentNode = null;
    });
    this.children = [];
    this.append(...nodes);
  }

  remove() {
    if (!this.parentNode) {
      return;
    }
    const index = this.parentNode.children.indexOf(this);
    if (index >= 0) {
      this.parentNode.children.splice(index, 1);
    }
    this.parentNode = null;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector) {
    const matches = [];
    walkElementTree(this, (element) => {
      if (element !== this && elementMatchesSelector(element, selector)) {
        matches.push(element);
      }
    });
    return matches;
  }

  get nextElementSibling() {
    if (!this.parentNode) {
      return null;
    }
    const siblings = this.parentNode.children;
    const index = siblings.indexOf(this);
    return index >= 0 ? siblings[index + 1] ?? null : null;
  }
}

class FakeDocumentFragment {
  constructor() {
    this.children = [];
    this.parentNode = null;
    this.nodeType = 11;
  }

  append(...nodes) {
    nodes.forEach((node) => {
      appendChild(this, node);
    });
  }
}

class FakeDocument {
  constructor() {
    this.body = this.createElement('body');
  }

  createElement(tagName) {
    return new FakeElement(tagName, this);
  }

  createDocumentFragment() {
    return new FakeDocumentFragment();
  }

  getElementById(id) {
    let found = null;
    walkElementTree(this.body, (element) => {
      if (!found && element.id === id) {
        found = element;
      }
    });
    return found;
  }
}

function appendChild(parent, node, index = parent.children.length) {
  if (node instanceof FakeDocumentFragment) {
    const children = [...node.children];
    children.forEach((child, offset) => {
      appendChild(parent, child, index + offset);
    });
    node.children = [];
    return;
  }

  if (node.parentNode) {
    node.remove();
  }
  node.parentNode = parent;
  parent.children.splice(index, 0, node);
}

function walkElementTree(root, visitor) {
  if (!(root instanceof FakeElement)) {
    return;
  }
  visitor(root);
  root.children.forEach((child) => {
    walkElementTree(child, visitor);
  });
}

function elementMatchesSelector(element, selector) {
  if (selector.startsWith('.')) {
    const className = selector.slice(1);
    return element.className.split(/\s+/).includes(className);
  }

  const dataMatch = selector.match(/^\[data-([a-z0-9-]+)="([^"]+)"\]$/i);
  if (dataMatch) {
    const key = dataMatch[1].replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    return element.dataset[key] === dataMatch[2];
  }

  return false;
}

function createRendererHarness() {
  const documentRef = new FakeDocument();
  const mapTransform = documentRef.createElement('div');
  mapTransform.id = 'vtt-map-transform';
  const backdrop = documentRef.createElement('div');
  backdrop.id = 'vtt-map-backdrop';
  const overlay = documentRef.createElement('div');
  overlay.id = 'vtt-map-overlay';
  const grid = documentRef.createElement('div');
  grid.id = 'vtt-grid-overlay';
  mapTransform.append(backdrop, overlay, grid);
  documentRef.body.append(mapTransform);

  const renderer = createMapLevelRenderer({
    mapTransform,
    insertBefore: overlay,
    documentRef,
  });

  return { documentRef, mapTransform, overlay, renderer };
}

describe('map level renderer', () => {
  test('mounts a dedicated pointer-disabled level stack before the old overlay', () => {
    const { mapTransform, overlay, renderer } = createRendererHarness();
    const root = renderer.element;

    assert.equal(root.id, MAP_LEVEL_STACK_ID);
    assert.equal(root.parentNode, mapTransform);
    assert.equal(root.nextElementSibling, overlay);
    assert.equal(root.getAttribute('aria-hidden'), 'true');
    assert.equal(root.style.pointerEvents, 'none');
    assert.equal(root.hidden, true);
  });

  test('renders visible map levels in z-index order and leaves hidden levels out', () => {
    const { renderer } = createRendererHarness();

    renderer.sync({
      activeLevelId: 'upper',
      levels: [
        { id: 'roof', name: 'Roof', mapUrl: '/maps/roof.png', zIndex: 10, opacity: 0.5 },
        { id: 'hidden', mapUrl: '/maps/hidden.png', visible: false, zIndex: 0 },
        { id: 'upper', name: 'Upper', mapUrl: ' /maps/upper.png ', zIndex: 2, opacity: 0.75 },
      ],
    });

    const root = renderer.element;
    const levels = Array.from(root.querySelectorAll(`.${MAP_LEVEL_CLASS}`));

    assert.equal(root.hidden, false);
    assert.equal(root.dataset.activeMapLevelId, 'upper');
    assert.equal(root.dataset.mapLevelCount, '2');
    assert.deepEqual(
      levels.map((element) => element.dataset.mapLevelId),
      ['upper', 'roof']
    );
    assert.equal(levels[0].style.backgroundImage, 'url("/maps/upper.png")');
    assert.equal(levels[0].style.opacity, '0.75');
    assert.equal(levels[0].style.pointerEvents, 'none');
    assert.equal(levels[1].style.zIndex, '10');
  });

  test('applies saved cutout rectangles as a mask using the shared grid metrics', () => {
    const { renderer } = createRendererHarness();
    const view = {
      mapPixelSize: { width: 240, height: 200 },
      mapInsets: { top: 10, right: 20, bottom: 10, left: 20 },
      gridOrigin: { x: 4, y: 6 },
      gridSize: 32,
    };

    renderer.sync(
      {
        levels: [
          {
            id: 'upper',
            name: 'Upper',
            mapUrl: '/maps/upper.png',
            cutouts: [{ column: 1, row: 2, width: 2, height: 1 }],
          },
        ],
      },
      { view }
    );

    const level = renderer.element.querySelector('[data-map-level-id="upper"]');
    assert.equal(level.dataset.mapLevelCutoutCount, '1');
    assert.equal(level.dataset.mapLevelHasCutoutMask, 'true');
    assert.equal(level.style.maskRepeat, 'no-repeat');
    assert.equal(level.style.maskSize, '100% 100%');
    assert.match(decodeMaskUrl(level.style.maskImage), /viewBox="0 0 200 180"/);
    assert.match(decodeMaskUrl(level.style.maskImage), /M 36 70 H 100 V 102 H 36 Z/);
  });

  test('reuses existing level elements and removes stale levels on resync', () => {
    const { renderer } = createRendererHarness();

    renderer.sync({
      levels: [
        { id: 'ground', mapUrl: '/maps/ground.png' },
        { id: 'upper', mapUrl: '/maps/upper.png' },
      ],
    });
    const originalGroundElement = renderer.element.querySelector('[data-map-level-id="ground"]');

    renderer.sync({
      levels: [
        { id: 'ground', mapUrl: '/maps/ground-v2.png', opacity: 0.4 },
      ],
    });

    const levels = Array.from(renderer.element.querySelectorAll(`.${MAP_LEVEL_CLASS}`));
    assert.equal(levels.length, 1);
    assert.equal(levels[0], originalGroundElement);
    assert.equal(levels[0].style.backgroundImage, 'url("/maps/ground-v2.png")');
    assert.equal(levels[0].style.opacity, '0.4');
    assert.equal(renderer.element.querySelector('[data-map-level-id="upper"]'), null);
  });

  test('reset clears rendered levels and hides the stack', () => {
    const { renderer } = createRendererHarness();

    renderer.sync({ levels: [{ id: 'ground', mapUrl: '/maps/ground.png' }] });
    renderer.reset();

    assert.equal(renderer.element.hidden, true);
    assert.equal(renderer.element.dataset.activeMapLevelId, '');
    assert.equal(renderer.element.dataset.mapLevelCount, '0');
    assert.equal(renderer.element.querySelectorAll(`.${MAP_LEVEL_CLASS}`).length, 0);
  });

  test('helper functions keep rendering scene-scoped and URL-safe', () => {
    assert.deepEqual(
      getRenderableMapLevels({
        levels: [
          { id: 'b', mapUrl: '/b.png', visible: true, zIndex: 2 },
          { id: 'hidden', mapUrl: '/hidden.png', visible: false, zIndex: 0 },
          { id: 'a', mapUrl: '/a.png', visible: true, zIndex: 1 },
        ],
      }).map((level) => level.id),
      ['a', 'b']
    );

    assert.equal(
      resolveSceneMapLevelsState(
        {
          mapLevels: { levels: [{ id: 'top-level-ignored' }] },
          sceneState: {
            sceneA: { mapLevels: { levels: [{ id: 'scene-level' }] } },
          },
        },
        'sceneA'
      ).levels[0].id,
      'scene-level'
    );

    assert.equal(buildCssUrl('/maps/a"b\\c.png'), 'url("/maps/a\\"b\\\\c.png")');
    assert.equal(resolveSceneMapLevelsState({ mapLevels: { levels: [] } }, 'missing'), null);
    assert.equal(buildMapLevelCutoutMask([{ column: 1, row: 1 }], null), '');
  });
});

function decodeMaskUrl(maskValue) {
  const match = String(maskValue).match(/^url\("data:image\/svg\+xml,([^"]+)"\)$/);
  assert.ok(match, `Expected an encoded SVG mask URL, received ${maskValue}`);
  return decodeURIComponent(match[1]);
}
