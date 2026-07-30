import test from 'node:test';
import assert from 'node:assert/strict';

import { createEntityStore } from '../entity-store.js';
import { createEventStream } from '../event-stream.js';
import { createRenderCoordinator } from '../render-coordinator.js';
import { createCombatRenderer } from '../renderers/combat-renderer.js';
import { createDrawingRenderer } from '../renderers/drawing-renderer.js';
import { createFogRenderer } from '../renderers/fog-renderer.js';
import { createSceneRenderer } from '../renderers/scene-renderer.js';
import { createTemplateRenderer } from '../renderers/template-renderer.js';
import { createTokenRenderer } from '../renderers/token-renderer.js';

function canonicalEvent(revision, type, overrides = {}) {
  return {
    revision,
    operationId: `operation-${revision}`,
    type,
    actorId: 'GM',
    sceneId: 'scene-1',
    entityId: null,
    entityRevision: null,
    payload: {},
    serverTime: 1000 + revision,
    ...overrides,
  };
}

function initialState() {
  return {
    activeSceneId: 'scene-1',
    placements: {
      'scene-1': {
        'token-1': {
          id: 'token-1',
          column: 1,
          row: 1,
          width: 1,
          height: 1,
          stamina: 10,
          conditions: [],
          _entityRevision: 1,
        },
        'token-2': {
          id: 'token-2',
          column: 5,
          row: 5,
          width: 1,
          height: 1,
          stamina: 12,
          conditions: [],
          _entityRevision: 1,
        },
      },
    },
    templates: { 'scene-1': {} },
    drawings: { 'scene-1': {} },
    fog: { 'scene-1': {} },
    combat: { 'scene-1': {} },
    levels: { 'scene-1': {} },
  };
}

function createDom() {
  class FakeClassList {
    constructor(node) {
      this.node = node;
      this.values = new Set();
    }
    toggle(name, enabled) {
      if (enabled) this.values.add(name);
      else this.values.delete(name);
    }
  }

  class FakeNode {
    constructor(tagName, id = '') {
      this.tagName = tagName.toUpperCase();
      this.id = id;
      this.dataset = {};
      this.style = {};
      this.attributes = {};
      this.children = [];
      this.parentNode = null;
      this.className = '';
      this.classList = new FakeClassList(this);
    }
    appendChild(node) {
      node.parentNode = this;
      this.children.push(node);
      return node;
    }
    remove() {
      if (this.parentNode) {
        this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
        this.parentNode = null;
      }
    }
    get outerHTML() {
      return JSON.stringify({
        tagName: this.tagName,
        id: this.id,
        dataset: this.dataset,
        style: this.style,
        attributes: this.attributes,
        className: this.className,
        classes: Array.from(this.classList.values).sort(),
        children: this.children.map((child) => child.outerHTML),
      });
    }
  }

  const nodes = new Map();
  const register = (tagName, id) => {
    const node = new FakeNode(tagName, id);
    nodes.set(id, node);
    return node;
  };
  const map = register('img', 'map');
  map.attributes.src = '/maps/keep-this-map.webp';
  const tokens = register('div', 'tokens');
  const tokenOne = new FakeNode('div');
  tokenOne.className = 'vtt-token';
  tokenOne.dataset.placementId = 'token-1';
  tokenOne.style.transform = 'translate3d(64px,64px,0)';
  tokens.appendChild(tokenOne);
  const tokenTwo = new FakeNode('div');
  tokenTwo.className = 'vtt-token';
  tokenTwo.dataset.placementId = 'token-2';
  tokenTwo.style.transform = 'translate3d(320px,320px,0)';
  tokens.appendChild(tokenTwo);
  for (const [tagName, id] of [
    ['div', 'templates'],
    ['svg', 'drawings'],
    ['canvas', 'fog'],
    ['div', 'combat'],
  ]) {
    register(tagName, id).dataset.unchanged = 'yes';
  }

  return {
    getElementById: (id) => nodes.get(id) ?? null,
    querySelector(selector) {
      const match = selector.match(/^\[data-placement-id="(.+)"\]$/);
      if (!match) return null;
      return tokens.children.find((node) => node.dataset.placementId === match[1]) ?? null;
    },
    createElement: (tagName) => new FakeNode(tagName),
  };
}

test('synthetic token.moved patches exactly one token and no broad surface', async () => {
  const documentRef = createDom();
  const store = createEntityStore({ revision: 0, state: initialState() });
  const dependencyCalls = { movement: 0, summary: 0, tracker: 0 };
  const forbiddenCalls = {
    combat: 0,
    fog: 0,
    templates: 0,
    drawings: 0,
    levels: 0,
    scenes: 0,
    snapshots: 0,
  };
  const tokenRenderer = createTokenRenderer({
    layer: documentRef.getElementById('tokens'),
    documentRef,
    gridSize: 64,
    dependencies: {
      movement: () => { dependencyCalls.movement += 1; },
      summary: () => { dependencyCalls.summary += 1; },
      tracker: () => { dependencyCalls.tracker += 1; },
    },
  });
  const coordinator = createRenderCoordinator({
    store,
    tokenRenderer,
    combatRenderer: createCombatRenderer({
      patchCombat: () => { forbiddenCalls.combat += 1; },
    }),
    fogRenderer: createFogRenderer({
      patchFog: () => { forbiddenCalls.fog += 1; },
    }),
    templateRenderer: createTemplateRenderer({
      upsertTemplate: () => { forbiddenCalls.templates += 1; },
    }),
    drawingRenderer: createDrawingRenderer({
      upsertDrawing: () => { forbiddenCalls.drawings += 1; },
    }),
    sceneRenderer: createSceneRenderer({
      activateScene: () => {
        forbiddenCalls.scenes += 1;
        return { mapLoaded: true };
      },
      patchLevel: () => { forbiddenCalls.levels += 1; },
    }),
    snapshotRenderer: () => { forbiddenCalls.snapshots += 1; },
  });
  const stream = createEventStream({ store, changeRouter: coordinator });

  const tokenTwoBefore = documentRef.querySelector('[data-placement-id="token-2"]').outerHTML;
  const mapBefore = documentRef.getElementById('map').outerHTML;
  const domainBefore = ['templates', 'drawings', 'fog', 'combat'].map(
    (id) => documentRef.getElementById(id).outerHTML
  );

  const result = await stream.ingest(canonicalEvent(1, 'token.moved', {
    entityId: 'token-1',
    entityRevision: 2,
    payload: { column: 2, row: 3 },
  }), 'synthetic-test');

  assert.equal(result.status, 'applied');
  assert.equal(
    documentRef.querySelector('[data-placement-id="token-1"]').style.transform,
    'translate3d(128px, 192px, 0)'
  );
  assert.equal(
    documentRef.querySelector('[data-placement-id="token-2"]').outerHTML,
    tokenTwoBefore
  );
  assert.equal(documentRef.getElementById('map').outerHTML, mapBefore);
  assert.deepEqual(
    ['templates', 'drawings', 'fog', 'combat'].map(
      (id) => documentRef.getElementById(id).outerHTML
    ),
    domainBefore
  );
  assert.deepEqual(dependencyCalls, { movement: 1, summary: 0, tracker: 0 });
  assert.deepEqual(forbiddenCalls, {
    combat: 0,
    fog: 0,
    templates: 0,
    drawings: 0,
    levels: 0,
    scenes: 0,
    snapshots: 0,
  });
  assert.deepEqual(coordinator.getMetrics(), {
    tokenAdds: 0,
    tokenPatches: 1,
    tokenRemovals: 0,
    combatPatches: 0,
    fogPatches: 0,
    templatePatches: 0,
    drawingPatches: 0,
    pingPatches: 0,
    levelPatches: 0,
    gridPatches: 0,
    sceneMounts: 0,
    mapLoads: 0,
    fullBoardReconciliations: 0,
  });
});

test('token movement structurally shares every unaffected state branch', async () => {
  const state = initialState();
  const store = createEntityStore({ revision: 0, state });
  const before = store.getConfirmedSnapshot();
  const stream = createEventStream({ store });

  await stream.ingest(canonicalEvent(1, 'token.moved', {
    entityId: 'token-1',
    entityRevision: 2,
    payload: { column: 7, row: 8 },
  }));
  const after = store.getConfirmedSnapshot();

  assert.notEqual(after.state, before.state);
  assert.notEqual(after.state.placements, before.state.placements);
  assert.notEqual(after.state.placements['scene-1'], before.state.placements['scene-1']);
  assert.notEqual(
    after.state.placements['scene-1']['token-1'],
    before.state.placements['scene-1']['token-1']
  );
  assert.equal(
    after.state.placements['scene-1']['token-2'],
    before.state.placements['scene-1']['token-2']
  );
  assert.equal(after.state.templates, before.state.templates);
  assert.equal(after.state.drawings, before.state.drawings);
  assert.equal(after.state.fog, before.state.fog);
  assert.equal(after.state.combat, before.state.combat);
  assert.equal(after.state.levels, before.state.levels);
});

test('focused domain events invoke only their matching renderer', async () => {
  const store = createEntityStore({ revision: 0, state: initialState() });
  const calls = [];
  const coordinator = createRenderCoordinator({
    store,
    tokenRenderer: {
      update: (id, snapshot, context) => {
        calls.push(`token:${context.event.type}:${id}`);
        return { patched: true };
      },
    },
    combatRenderer: {
      patch: (snapshot, context) => {
        calls.push(`combat:${context.event.type}`);
        return { patched: true };
      },
    },
    fogRenderer: {
      patch: () => {
        calls.push('fog');
        return { patched: true };
      },
    },
    templateRenderer: {
      patch: () => {
        calls.push('template');
        return { patched: true };
      },
    },
    drawingRenderer: {
      patch: () => {
        calls.push('drawing');
        return { patched: true };
      },
    },
    sceneRenderer: {
      patchLevel: () => {
        calls.push('level');
        return { patched: true };
      },
      activate: () => {
        calls.push('scene');
        return { patched: true, mapLoaded: true };
      },
    },
  });
  const stream = createEventStream({ store, changeRouter: coordinator });

  const events = [
    canonicalEvent(1, 'token.staminaChanged', {
      entityId: 'token-1',
      entityRevision: 2,
      payload: { stamina: 7 },
    }),
    canonicalEvent(2, 'turn.started', {
      payload: { activeCombatantId: 'token-1' },
    }),
    canonicalEvent(3, 'template.updated', {
      entityId: 'template-1',
      entityRevision: 1,
      payload: { template: { shape: 'burst' } },
    }),
    canonicalEvent(4, 'drawing.added', {
      entityId: 'drawing-1',
      entityRevision: 1,
      payload: { drawing: { path: 'M0 0L1 1' } },
    }),
    canonicalEvent(5, 'fog.patched', {
      payload: { revealedCells: ['1,1'] },
    }),
    canonicalEvent(6, 'level.changed', {
      payload: { activeLevelId: 'level-2' },
    }),
    canonicalEvent(7, 'scene.activated'),
  ];
  for (const event of events) {
    assert.equal((await stream.ingest(event)).status, 'applied');
  }

  assert.deepEqual(calls, [
    'token:token.staminaChanged:token-1',
    'combat:turn.started',
    'template',
    'drawing',
    'fog',
    'level',
    'scene',
  ]);
  assert.deepEqual(coordinator.getMetrics(), {
    tokenAdds: 0,
    tokenPatches: 1,
    tokenRemovals: 0,
    combatPatches: 1,
    fogPatches: 1,
    templatePatches: 1,
    drawingPatches: 1,
    pingPatches: 0,
    levelPatches: 1,
    gridPatches: 0,
    sceneMounts: 1,
    mapLoads: 1,
    fullBoardReconciliations: 0,
  });
});

test('full-board reconciliation is reserved for explicit snapshots', () => {
  const store = createEntityStore({ revision: 2, state: initialState() });
  let reconciliations = 0;
  const coordinator = createRenderCoordinator({
    store,
    snapshotRenderer: () => { reconciliations += 1; },
  });

  coordinator.route({ revision: 2, snapshot: true }, { source: 'recovery' });
  assert.equal(reconciliations, 1);
  assert.equal(coordinator.getMetrics().fullBoardReconciliations, 1);
});
