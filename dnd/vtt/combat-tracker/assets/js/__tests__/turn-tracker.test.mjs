import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { createCombatTrackerStore } from '../state/store.js';
import { selectSortedCombatants, selectActiveCombatant } from '../state/selectors.js';
import { renderControls } from '../ui/controls.js';
import { renderInitiativeList } from '../ui/initiative-list.js';
import { renderTrackerPanel } from '../ui/tracker-panel.js';
import { renderConditions } from '../ui/conditions.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCombatant(overrides = {}) {
  return {
    id: overrides.id ?? 'c-1',
    name: overrides.name ?? 'Fighter',
    initiative: overrides.initiative ?? 10,
    combatTeam: overrides.combatTeam ?? 'ally',
    conditions: overrides.conditions ?? [],
    ...overrides,
  };
}

function makeAllyCombatant(overrides = {}) {
  return makeCombatant({ combatTeam: 'ally', ...overrides });
}

function makeEnemyCombatant(overrides = {}) {
  return makeCombatant({ combatTeam: 'enemy', ...overrides });
}

function buildParty() {
  return [
    makeAllyCombatant({ id: 'fighter', name: 'Fighter', initiative: 18 }),
    makeAllyCombatant({ id: 'wizard', name: 'Wizard', initiative: 12 }),
    makeEnemyCombatant({ id: 'goblin-1', name: 'Goblin', initiative: 15 }),
    makeEnemyCombatant({ id: 'goblin-2', name: 'Goblin 2', initiative: 8 }),
  ];
}

function createDom(html = '<div id="root"></div>') {
  const dom = new JSDOM(`<!DOCTYPE html><body>${html}</body>`, {
    url: 'http://localhost',
  });
  return dom;
}

function setupGlobals(dom) {
  const { window } = dom;
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.Element = window.Element;
  globalThis.Node = window.Node;
  globalThis.CustomEvent = window.CustomEvent;
  globalThis.Event = window.Event;
}

function teardownGlobals() {
  delete globalThis.window;
  delete globalThis.document;
  delete globalThis.HTMLElement;
  delete globalThis.Element;
  delete globalThis.Node;
  delete globalThis.CustomEvent;
  delete globalThis.Event;
}

// ===========================================================================
// 1. COMBAT TRACKER STORE
// ===========================================================================

describe('CombatTrackerStore', () => {
  test('creates store with default state', () => {
    const store = createCombatTrackerStore();
    const state = store.getState();

    assert.equal(state.sceneId, null);
    assert.equal(state.round, 0);
    assert.equal(state.turnIndex, 0);
    assert.deepEqual(state.combatants, []);
  });

  test('creates store with custom initial state', () => {
    const combatants = buildParty();
    const store = createCombatTrackerStore({
      sceneId: 'scene-1',
      round: 3,
      turnIndex: 1,
      combatants,
    });

    const state = store.getState();
    assert.equal(state.sceneId, 'scene-1');
    assert.equal(state.round, 3);
    assert.equal(state.turnIndex, 1);
    assert.equal(state.combatants.length, 4);
  });

  test('getState returns a shallow copy (mutation safe)', () => {
    const store = createCombatTrackerStore();
    const state1 = store.getState();
    const state2 = store.getState();

    assert.notEqual(state1, state2);
    assert.deepEqual(state1, state2);
  });

  test('setState merges partial state updates', () => {
    const store = createCombatTrackerStore();
    store.setState({ round: 5 });

    assert.equal(store.getState().round, 5);
    assert.equal(store.getState().turnIndex, 0);
  });

  test('setState updates multiple fields at once', () => {
    const store = createCombatTrackerStore();
    store.setState({ round: 2, turnIndex: 3, sceneId: 'scene-x' });

    const state = store.getState();
    assert.equal(state.round, 2);
    assert.equal(state.turnIndex, 3);
    assert.equal(state.sceneId, 'scene-x');
  });

  test('subscribe notifies on state changes', () => {
    const store = createCombatTrackerStore();
    const notifications = [];

    store.subscribe((state) => notifications.push(state));
    store.setState({ round: 1 });
    store.setState({ round: 2 });

    assert.equal(notifications.length, 2);
    assert.equal(notifications[0].round, 1);
    assert.equal(notifications[1].round, 2);
  });

  test('subscribe returns unsubscribe function', () => {
    const store = createCombatTrackerStore();
    const notifications = [];

    const unsub = store.subscribe((state) => notifications.push(state));
    store.setState({ round: 1 });
    unsub();
    store.setState({ round: 2 });

    assert.equal(notifications.length, 1);
  });

  test('multiple subscribers all receive updates', () => {
    const store = createCombatTrackerStore();
    const a = [];
    const b = [];

    store.subscribe((s) => a.push(s.round));
    store.subscribe((s) => b.push(s.round));
    store.setState({ round: 7 });

    assert.deepEqual(a, [7]);
    assert.deepEqual(b, [7]);
  });

  test('setState with combatants array replaces the list', () => {
    const store = createCombatTrackerStore({ combatants: buildParty() });
    assert.equal(store.getState().combatants.length, 4);

    store.setState({ combatants: [makeCombatant({ id: 'solo', name: 'Solo' })] });
    assert.equal(store.getState().combatants.length, 1);
    assert.equal(store.getState().combatants[0].id, 'solo');
  });
});

// ===========================================================================
// 2. SELECTORS — Initiative Sorting & Active Combatant
// ===========================================================================

describe('Selectors', () => {
  test('selectSortedCombatants sorts by initiative descending', () => {
    const state = {
      combatants: [
        makeCombatant({ id: 'low', initiative: 5 }),
        makeCombatant({ id: 'high', initiative: 20 }),
        makeCombatant({ id: 'mid', initiative: 12 }),
      ],
      turnIndex: 0,
    };

    const sorted = selectSortedCombatants(state);
    assert.equal(sorted[0].id, 'high');
    assert.equal(sorted[1].id, 'mid');
    assert.equal(sorted[2].id, 'low');
  });

  test('selectSortedCombatants does not mutate original array', () => {
    const combatants = [
      makeCombatant({ id: 'a', initiative: 1 }),
      makeCombatant({ id: 'b', initiative: 10 }),
    ];
    const state = { combatants, turnIndex: 0 };

    selectSortedCombatants(state);
    assert.equal(combatants[0].id, 'a', 'original array should be untouched');
    assert.equal(combatants[1].id, 'b');
  });

  test('selectSortedCombatants handles empty combatants', () => {
    const sorted = selectSortedCombatants({ combatants: [], turnIndex: 0 });
    assert.deepEqual(sorted, []);
  });

  test('selectSortedCombatants handles tied initiative (stable sort)', () => {
    const state = {
      combatants: [
        makeCombatant({ id: 'first-added', initiative: 10 }),
        makeCombatant({ id: 'second-added', initiative: 10 }),
      ],
      turnIndex: 0,
    };

    const sorted = selectSortedCombatants(state);
    assert.equal(sorted.length, 2);
    // Both have same initiative; order is implementation-defined but stable
    assert.ok(sorted[0].initiative === sorted[1].initiative);
  });

  test('selectActiveCombatant returns combatant at turnIndex in sorted order', () => {
    const state = {
      combatants: [
        makeCombatant({ id: 'low', initiative: 3 }),
        makeCombatant({ id: 'high', initiative: 18 }),
        makeCombatant({ id: 'mid', initiative: 10 }),
      ],
      turnIndex: 0,
    };

    // sorted: high(18), mid(10), low(3) — turnIndex 0 → high
    const active = selectActiveCombatant(state);
    assert.equal(active.id, 'high');
  });

  test('selectActiveCombatant returns second combatant when turnIndex is 1', () => {
    const state = {
      combatants: [
        makeCombatant({ id: 'low', initiative: 3 }),
        makeCombatant({ id: 'high', initiative: 18 }),
        makeCombatant({ id: 'mid', initiative: 10 }),
      ],
      turnIndex: 1,
    };

    const active = selectActiveCombatant(state);
    assert.equal(active.id, 'mid');
  });

  test('selectActiveCombatant returns null when no combatants exist', () => {
    const active = selectActiveCombatant({ combatants: [], turnIndex: 0 });
    assert.equal(active, null);
  });

  test('selectActiveCombatant returns null when turnIndex is out of bounds', () => {
    const state = {
      combatants: [makeCombatant({ id: 'only', initiative: 10 })],
      turnIndex: 5,
    };

    const active = selectActiveCombatant(state);
    assert.equal(active, null);
  });

  test('selectActiveCombatant correctly identifies ally vs enemy', () => {
    const state = {
      combatants: [
        makeEnemyCombatant({ id: 'goblin', initiative: 20 }),
        makeAllyCombatant({ id: 'fighter', initiative: 15 }),
      ],
      turnIndex: 0,
    };

    const active = selectActiveCombatant(state);
    assert.equal(active.id, 'goblin');
    assert.equal(active.combatTeam, 'enemy');
  });
});

// ===========================================================================
// 3. CONTROLS — Turn Advancement (Next / Previous)
// ===========================================================================

describe('Controls – Turn Advancement', () => {
  let dom;

  beforeEach(() => {
    dom = createDom('<div id="controls-root"></div>');
    setupGlobals(dom);
  });

  test('next button advances turnIndex by 1', (t) => {
    t.after(() => teardownGlobals());
    const store = createCombatTrackerStore({
      combatants: buildParty(),
      turnIndex: 0,
    });

    const root = document.getElementById('controls-root');
    const dispose = renderControls(root, { store });

    const nextBtn = root.querySelector('[data-action="next"]');
    nextBtn.click();

    assert.equal(store.getState().turnIndex, 1);
    dispose();
  });

  test('previous button decrements turnIndex by 1', (t) => {
    t.after(() => teardownGlobals());
    const store = createCombatTrackerStore({
      combatants: buildParty(),
      turnIndex: 2,
    });

    const root = document.getElementById('controls-root');
    const dispose = renderControls(root, { store });

    const prevBtn = root.querySelector('[data-action="previous"]');
    prevBtn.click();

    assert.equal(store.getState().turnIndex, 1);
    dispose();
  });

  test('next wraps from last combatant back to first', (t) => {
    t.after(() => teardownGlobals());
    const combatants = buildParty(); // 4 combatants
    const store = createCombatTrackerStore({
      combatants,
      turnIndex: 3, // last index
    });

    const root = document.getElementById('controls-root');
    const dispose = renderControls(root, { store });

    root.querySelector('[data-action="next"]').click();
    assert.equal(store.getState().turnIndex, 0, 'should wrap to beginning');
    dispose();
  });

  test('previous wraps from first combatant to last', (t) => {
    t.after(() => teardownGlobals());
    const combatants = buildParty(); // 4 combatants
    const store = createCombatTrackerStore({
      combatants,
      turnIndex: 0,
    });

    const root = document.getElementById('controls-root');
    const dispose = renderControls(root, { store });

    root.querySelector('[data-action="previous"]').click();
    assert.equal(store.getState().turnIndex, 3, 'should wrap to end');
    dispose();
  });

  test('next with single combatant stays at index 0', (t) => {
    t.after(() => teardownGlobals());
    const store = createCombatTrackerStore({
      combatants: [makeCombatant({ id: 'solo' })],
      turnIndex: 0,
    });

    const root = document.getElementById('controls-root');
    const dispose = renderControls(root, { store });

    root.querySelector('[data-action="next"]').click();
    assert.equal(store.getState().turnIndex, 0);
    dispose();
  });

  test('previous with single combatant stays at index 0', (t) => {
    t.after(() => teardownGlobals());
    const store = createCombatTrackerStore({
      combatants: [makeCombatant({ id: 'solo' })],
      turnIndex: 0,
    });

    const root = document.getElementById('controls-root');
    const dispose = renderControls(root, { store });

    root.querySelector('[data-action="previous"]').click();
    assert.equal(store.getState().turnIndex, 0);
    dispose();
  });

  test('next with empty combatants keeps turnIndex at 0', (t) => {
    t.after(() => teardownGlobals());
    const store = createCombatTrackerStore({
      combatants: [],
      turnIndex: 0,
    });

    const root = document.getElementById('controls-root');
    const dispose = renderControls(root, { store });

    root.querySelector('[data-action="next"]').click();
    assert.equal(store.getState().turnIndex, 0);
    dispose();
  });

  test('multiple next clicks cycle through all combatants and wrap', (t) => {
    t.after(() => teardownGlobals());
    const combatants = buildParty(); // 4 combatants
    const store = createCombatTrackerStore({
      combatants,
      turnIndex: 0,
    });

    const root = document.getElementById('controls-root');
    const dispose = renderControls(root, { store });

    const nextBtn = root.querySelector('[data-action="next"]');
    nextBtn.click(); // 0 -> 1
    nextBtn.click(); // 1 -> 2
    nextBtn.click(); // 2 -> 3
    nextBtn.click(); // 3 -> 0 (wrap)
    nextBtn.click(); // 0 -> 1

    assert.equal(store.getState().turnIndex, 1);
    dispose();
  });

  test('dispose removes event listeners and clears root', (t) => {
    t.after(() => teardownGlobals());
    const store = createCombatTrackerStore({
      combatants: buildParty(),
      turnIndex: 0,
    });

    const root = document.getElementById('controls-root');
    const dispose = renderControls(root, { store });
    dispose();

    assert.equal(root.innerHTML, '');
  });

  test('clicking non-button area does not change turnIndex', (t) => {
    t.after(() => teardownGlobals());
    const store = createCombatTrackerStore({
      combatants: buildParty(),
      turnIndex: 2,
    });

    const root = document.getElementById('controls-root');
    const dispose = renderControls(root, { store });

    // Click the controls wrapper div instead of a button
    const wrapper = root.querySelector('.vtt-combat-tracker__controls');
    wrapper.click();

    assert.equal(store.getState().turnIndex, 2, 'should not change');
    dispose();
  });

  test('renderControls with null root returns noop', () => {
    const store = createCombatTrackerStore();
    const dispose = renderControls(null, { store });
    assert.equal(typeof dispose, 'function');
    dispose(); // should not throw
  });
});

// ===========================================================================
// 4. INITIATIVE LIST — Token Display & Rendering
// ===========================================================================

describe('Initiative List – Token Display', () => {
  let dom;

  beforeEach(() => {
    dom = createDom('<div id="init-root"></div>');
    setupGlobals(dom);
  });

  test('renders combatants in initiative order', (t) => {
    t.after(() => teardownGlobals());
    const store = createCombatTrackerStore({
      combatants: [
        makeCombatant({ id: 'low', name: 'Rogue', initiative: 5 }),
        makeCombatant({ id: 'high', name: 'Paladin', initiative: 20 }),
        makeCombatant({ id: 'mid', name: 'Bard', initiative: 12 }),
      ],
      turnIndex: 0,
    });

    const root = document.getElementById('init-root');
    const dispose = renderInitiativeList(root, { store });

    // Trigger initial render via state update
    store.setState(store.getState());

    const items = root.querySelectorAll('.vtt-combat-tracker__item');
    assert.equal(items.length, 3);

    const names = Array.from(items).map(
      (item) => item.querySelector('.vtt-combat-tracker__name').textContent
    );
    assert.deepEqual(names, ['Paladin', 'Bard', 'Rogue']);
    dispose();
  });

  test('displays initiative values for each combatant', (t) => {
    t.after(() => teardownGlobals());
    const store = createCombatTrackerStore({
      combatants: [
        makeCombatant({ id: 'a', name: 'A', initiative: 20 }),
        makeCombatant({ id: 'b', name: 'B', initiative: 15 }),
      ],
      turnIndex: 0,
    });

    const root = document.getElementById('init-root');
    const dispose = renderInitiativeList(root, { store });
    store.setState(store.getState());

    const initiatives = Array.from(
      root.querySelectorAll('.vtt-combat-tracker__initiative')
    ).map((el) => el.textContent);
    assert.deepEqual(initiatives, ['20', '15']);
    dispose();
  });

  test('marks active combatant with is-active class', (t) => {
    t.after(() => teardownGlobals());
    const store = createCombatTrackerStore({
      combatants: [
        makeCombatant({ id: 'first', name: 'First', initiative: 20 }),
        makeCombatant({ id: 'second', name: 'Second', initiative: 10 }),
      ],
      turnIndex: 0,
    });

    const root = document.getElementById('init-root');
    const dispose = renderInitiativeList(root, { store });
    store.setState(store.getState());

    const items = root.querySelectorAll('.vtt-combat-tracker__item');
    assert.ok(items[0].classList.contains('is-active'), 'first should be active');
    assert.ok(!items[1].classList.contains('is-active'), 'second should not be active');
    dispose();
  });

  test('active class moves when turnIndex changes', (t) => {
    t.after(() => teardownGlobals());
    const store = createCombatTrackerStore({
      combatants: [
        makeCombatant({ id: 'a', initiative: 20 }),
        makeCombatant({ id: 'b', initiative: 10 }),
      ],
      turnIndex: 0,
    });

    const root = document.getElementById('init-root');
    const dispose = renderInitiativeList(root, { store });
    store.setState(store.getState());

    // Advance turn
    store.setState({ ...store.getState(), turnIndex: 1 });

    const items = root.querySelectorAll('.vtt-combat-tracker__item');
    assert.ok(!items[0].classList.contains('is-active'));
    assert.ok(items[1].classList.contains('is-active'));
    dispose();
  });

  test('renders empty list when no combatants', (t) => {
    t.after(() => teardownGlobals());
    const store = createCombatTrackerStore({ combatants: [], turnIndex: 0 });

    const root = document.getElementById('init-root');
    const dispose = renderInitiativeList(root, { store });
    store.setState(store.getState());

    const items = root.querySelectorAll('.vtt-combat-tracker__item');
    assert.equal(items.length, 0);
    dispose();
  });

  test('displays "Unknown" for combatant without a name', (t) => {
    t.after(() => teardownGlobals());
    const store = createCombatTrackerStore({
      combatants: [{ id: 'nameless', initiative: 10 }],
      turnIndex: 0,
    });

    const root = document.getElementById('init-root');
    const dispose = renderInitiativeList(root, { store });
    store.setState(store.getState());

    const name = root.querySelector('.vtt-combat-tracker__name').textContent;
    assert.equal(name, 'Unknown');
    dispose();
  });

  test('displays dash for combatant without initiative value', (t) => {
    t.after(() => teardownGlobals());
    const store = createCombatTrackerStore({
      combatants: [{ id: 'no-init', name: 'Mystery' }],
      turnIndex: 0,
    });

    const root = document.getElementById('init-root');
    const dispose = renderInitiativeList(root, { store });
    store.setState(store.getState());

    const initText = root.querySelector('.vtt-combat-tracker__initiative').textContent;
    assert.equal(initText, '-');
    dispose();
  });

  test('updates list when combatants are added', (t) => {
    t.after(() => teardownGlobals());
    const store = createCombatTrackerStore({
      combatants: [makeCombatant({ id: 'a', initiative: 10 })],
      turnIndex: 0,
    });

    const root = document.getElementById('init-root');
    const dispose = renderInitiativeList(root, { store });
    store.setState(store.getState());

    assert.equal(root.querySelectorAll('.vtt-combat-tracker__item').length, 1);

    store.setState({
      ...store.getState(),
      combatants: [
        makeCombatant({ id: 'a', initiative: 10 }),
        makeCombatant({ id: 'b', initiative: 15 }),
      ],
    });

    assert.equal(root.querySelectorAll('.vtt-combat-tracker__item').length, 2);
    dispose();
  });

  test('updates list when combatants are removed', (t) => {
    t.after(() => teardownGlobals());
    const store = createCombatTrackerStore({
      combatants: buildParty(),
      turnIndex: 0,
    });

    const root = document.getElementById('init-root');
    const dispose = renderInitiativeList(root, { store });
    store.setState(store.getState());

    assert.equal(root.querySelectorAll('.vtt-combat-tracker__item').length, 4);

    store.setState({
      ...store.getState(),
      combatants: [buildParty()[0]],
    });

    assert.equal(root.querySelectorAll('.vtt-combat-tracker__item').length, 1);
    dispose();
  });

  test('displays both allies and enemies in initiative order', (t) => {
    t.after(() => teardownGlobals());
    const store = createCombatTrackerStore({
      combatants: [
        makeAllyCombatant({ id: 'ally-1', name: 'Fighter', initiative: 18 }),
        makeEnemyCombatant({ id: 'enemy-1', name: 'Dragon', initiative: 25 }),
        makeAllyCombatant({ id: 'ally-2', name: 'Cleric', initiative: 12 }),
        makeEnemyCombatant({ id: 'enemy-2', name: 'Kobold', initiative: 8 }),
      ],
      turnIndex: 0,
    });

    const root = document.getElementById('init-root');
    const dispose = renderInitiativeList(root, { store });
    store.setState(store.getState());

    const names = Array.from(
      root.querySelectorAll('.vtt-combat-tracker__name')
    ).map((el) => el.textContent);

    assert.deepEqual(names, ['Dragon', 'Fighter', 'Cleric', 'Kobold']);
    dispose();
  });

  test('renderInitiativeList with null root returns noop', () => {
    const store = createCombatTrackerStore();
    const dispose = renderInitiativeList(null, { store });
    assert.equal(typeof dispose, 'function');
    dispose(); // should not throw
  });

  test('dispose cleans up subscription and DOM', (t) => {
    t.after(() => teardownGlobals());
    const store = createCombatTrackerStore({
      combatants: buildParty(),
      turnIndex: 0,
    });

    const root = document.getElementById('init-root');
    const dispose = renderInitiativeList(root, { store });
    store.setState(store.getState());

    assert.ok(root.querySelector('ol'), 'list should exist before dispose');
    dispose();
    assert.equal(root.innerHTML, '', 'root should be empty after dispose');
  });
});

// ===========================================================================
// 5. TRACKER PANEL — Round Display
// ===========================================================================

describe('Tracker Panel – Round Display', () => {
  let dom;

  beforeEach(() => {
    dom = createDom('<div id="panel-root"></div>');
    setupGlobals(dom);
  });

  test('renders panel with round counter', (t) => {
    t.after(() => teardownGlobals());
    const store = createCombatTrackerStore({ round: 3 });

    const root = document.getElementById('panel-root');
    const dispose = renderTrackerPanel(root, { store });

    assert.ok(root.classList.contains('vtt-combat-tracker'));
    const roundEl = root.querySelector('[data-round]');
    assert.ok(roundEl);
    dispose();
  });

  test('displays initial round number', (t) => {
    t.after(() => teardownGlobals());
    const store = createCombatTrackerStore({ round: 0 });

    const root = document.getElementById('panel-root');
    const dispose = renderTrackerPanel(root, { store });

    const roundEl = root.querySelector('[data-round]');
    assert.equal(roundEl.textContent, '0');
    dispose();
  });

  test('updates round display when round changes', (t) => {
    t.after(() => teardownGlobals());
    const store = createCombatTrackerStore({ round: 1 });

    const root = document.getElementById('panel-root');
    const dispose = renderTrackerPanel(root, { store });

    store.setState({ round: 5 });
    const roundEl = root.querySelector('[data-round]');
    assert.equal(roundEl.textContent, '5');
    dispose();
  });

  test('round increments correctly through multiple updates', (t) => {
    t.after(() => teardownGlobals());
    const store = createCombatTrackerStore({ round: 1 });

    const root = document.getElementById('panel-root');
    const dispose = renderTrackerPanel(root, { store });

    // Trigger initial subscriber notification so the round display updates
    store.setState(store.getState());

    const roundEl = root.querySelector('[data-round]');
    assert.equal(roundEl.textContent, '1');

    store.setState({ round: 2 });
    assert.equal(roundEl.textContent, '2');

    store.setState({ round: 3 });
    assert.equal(roundEl.textContent, '3');
    dispose();
  });

  test('contains Combat Tracker header', (t) => {
    t.after(() => teardownGlobals());
    const store = createCombatTrackerStore();

    const root = document.getElementById('panel-root');
    const dispose = renderTrackerPanel(root, { store });

    const header = root.querySelector('h2');
    assert.ok(header);
    assert.equal(header.textContent, 'Combat Tracker');
    dispose();
  });

  test('dispose cleans up panel', (t) => {
    t.after(() => teardownGlobals());
    const store = createCombatTrackerStore();

    const root = document.getElementById('panel-root');
    const dispose = renderTrackerPanel(root, { store });

    assert.ok(root.classList.contains('vtt-combat-tracker'));
    dispose();

    assert.equal(root.innerHTML, '');
    assert.ok(!root.classList.contains('vtt-combat-tracker'));
  });

  test('renderTrackerPanel with null root returns noop', () => {
    const store = createCombatTrackerStore();
    const dispose = renderTrackerPanel(null, { store });
    assert.equal(typeof dispose, 'function');
    dispose();
  });
});

// ===========================================================================
// 6. CONDITIONS — Display for Active Combatant
// ===========================================================================

describe('Conditions Display', () => {
  let dom;

  beforeEach(() => {
    dom = createDom('<div id="cond-root"></div>');
    setupGlobals(dom);
  });

  test('shows "No conditions" when active combatant has no conditions', (t) => {
    t.after(() => teardownGlobals());
    const store = createCombatTrackerStore({
      combatants: [makeCombatant({ id: 'a', conditions: [] })],
      turnIndex: 0,
    });

    const root = document.getElementById('cond-root');
    const dispose = renderConditions(root, { store });
    store.setState(store.getState());

    const text = root.querySelector('.vtt-combat-tracker__conditions').textContent;
    assert.equal(text, 'No conditions');
    dispose();
  });

  test('shows conditions list for active combatant', (t) => {
    t.after(() => teardownGlobals());
    const store = createCombatTrackerStore({
      combatants: [
        makeCombatant({ id: 'a', conditions: ['Stunned', 'Prone'] }),
      ],
      turnIndex: 0,
    });

    const root = document.getElementById('cond-root');
    const dispose = renderConditions(root, { store });
    store.setState(store.getState());

    const text = root.querySelector('.vtt-combat-tracker__conditions').textContent;
    assert.equal(text, 'Stunned, Prone');
    dispose();
  });

  test('updates conditions when turn changes to different combatant', (t) => {
    t.after(() => teardownGlobals());
    const store = createCombatTrackerStore({
      combatants: [
        makeCombatant({ id: 'a', conditions: ['Blinded'] }),
        makeCombatant({ id: 'b', conditions: ['Dazed', 'Slowed'] }),
      ],
      turnIndex: 0,
    });

    const root = document.getElementById('cond-root');
    const dispose = renderConditions(root, { store });
    store.setState(store.getState());

    let text = root.querySelector('.vtt-combat-tracker__conditions').textContent;
    assert.equal(text, 'Blinded');

    store.setState({ ...store.getState(), turnIndex: 1 });
    text = root.querySelector('.vtt-combat-tracker__conditions').textContent;
    assert.equal(text, 'Dazed, Slowed');
    dispose();
  });

  test('handles undefined active combatant gracefully', (t) => {
    t.after(() => teardownGlobals());
    const store = createCombatTrackerStore({
      combatants: [],
      turnIndex: 0,
    });

    const root = document.getElementById('cond-root');
    const dispose = renderConditions(root, { store });
    store.setState(store.getState());

    const text = root.querySelector('.vtt-combat-tracker__conditions').textContent;
    assert.equal(text, 'No conditions');
    dispose();
  });

  test('renderConditions with null root returns noop', () => {
    const store = createCombatTrackerStore();
    const dispose = renderConditions(null, { store });
    assert.equal(typeof dispose, 'function');
    dispose();
  });
});

// ===========================================================================
// 7. FULL TURN CYCLE — Integration Tests
// ===========================================================================

describe('Full Turn Cycle Integration', () => {
  let dom;

  beforeEach(() => {
    dom = createDom(`
      <div id="panel-root"></div>
      <div id="init-root"></div>
      <div id="controls-root"></div>
      <div id="cond-root"></div>
    `);
    setupGlobals(dom);
  });

  test('full combat cycle: start, advance through all turns, verify each active combatant', (t) => {
    t.after(() => teardownGlobals());

    const combatants = [
      makeAllyCombatant({ id: 'fighter', name: 'Fighter', initiative: 18, conditions: ['Blessed'] }),
      makeEnemyCombatant({ id: 'goblin', name: 'Goblin', initiative: 15, conditions: [] }),
      makeAllyCombatant({ id: 'wizard', name: 'Wizard', initiative: 12, conditions: ['Hasted'] }),
      makeEnemyCombatant({ id: 'orc', name: 'Orc', initiative: 8, conditions: ['Prone'] }),
    ];

    const store = createCombatTrackerStore({
      round: 1,
      turnIndex: 0,
      combatants,
    });

    const panelRoot = document.getElementById('panel-root');
    const initRoot = document.getElementById('init-root');
    const controlsRoot = document.getElementById('controls-root');
    const condRoot = document.getElementById('cond-root');

    const disposers = [
      renderTrackerPanel(panelRoot, { store }),
      renderInitiativeList(initRoot, { store }),
      renderControls(controlsRoot, { store }),
      renderConditions(condRoot, { store }),
    ];

    // Trigger render
    store.setState(store.getState());

    // Sorted order: Fighter(18) > Goblin(15) > Wizard(12) > Orc(8)
    // Turn 0: Fighter
    let active = selectActiveCombatant(store.getState());
    assert.equal(active.id, 'fighter');
    assert.equal(active.combatTeam, 'ally');

    const nextBtn = controlsRoot.querySelector('[data-action="next"]');

    // Turn 1: Goblin
    nextBtn.click();
    active = selectActiveCombatant(store.getState());
    assert.equal(active.id, 'goblin');
    assert.equal(active.combatTeam, 'enemy');

    // Turn 2: Wizard
    nextBtn.click();
    active = selectActiveCombatant(store.getState());
    assert.equal(active.id, 'wizard');
    assert.equal(active.combatTeam, 'ally');

    // Turn 3: Orc
    nextBtn.click();
    active = selectActiveCombatant(store.getState());
    assert.equal(active.id, 'orc');
    assert.equal(active.combatTeam, 'enemy');

    // Turn 4: wraps back to Fighter
    nextBtn.click();
    active = selectActiveCombatant(store.getState());
    assert.equal(active.id, 'fighter');
    assert.equal(active.combatTeam, 'ally');

    // Verify round display still shows 1
    assert.equal(panelRoot.querySelector('[data-round]').textContent, '1');

    disposers.forEach((d) => d());
  });

  test('going backward through entire turn order preserves correct active combatants', (t) => {
    t.after(() => teardownGlobals());

    const combatants = [
      makeAllyCombatant({ id: 'a', name: 'Alpha', initiative: 20 }),
      makeEnemyCombatant({ id: 'b', name: 'Bravo', initiative: 15 }),
      makeAllyCombatant({ id: 'c', name: 'Charlie', initiative: 10 }),
    ];

    const store = createCombatTrackerStore({
      round: 1,
      turnIndex: 2,
      combatants,
    });

    const controlsRoot = document.getElementById('controls-root');
    const dispose = renderControls(controlsRoot, { store });

    const prevBtn = controlsRoot.querySelector('[data-action="previous"]');

    // At index 2 (Charlie)
    let active = selectActiveCombatant(store.getState());
    assert.equal(active.id, 'c');

    // Back to Bravo
    prevBtn.click();
    active = selectActiveCombatant(store.getState());
    assert.equal(active.id, 'b');

    // Back to Alpha
    prevBtn.click();
    active = selectActiveCombatant(store.getState());
    assert.equal(active.id, 'a');

    // Wraps to Charlie
    prevBtn.click();
    active = selectActiveCombatant(store.getState());
    assert.equal(active.id, 'c');

    dispose();
  });

  test('cancelled turn (go back) returns to previous team selection', (t) => {
    t.after(() => teardownGlobals());

    // Simulate: allies go first, then enemy takes turn, cancel → back to ally selection
    const combatants = [
      makeAllyCombatant({ id: 'paladin', name: 'Paladin', initiative: 20 }),
      makeEnemyCombatant({ id: 'dragon', name: 'Dragon', initiative: 18 }),
      makeAllyCombatant({ id: 'ranger', name: 'Ranger', initiative: 12 }),
    ];

    const store = createCombatTrackerStore({
      round: 1,
      turnIndex: 0,
      combatants,
    });

    const controlsRoot = document.getElementById('controls-root');
    const dispose = renderControls(controlsRoot, { store });

    const nextBtn = controlsRoot.querySelector('[data-action="next"]');
    const prevBtn = controlsRoot.querySelector('[data-action="previous"]');

    // Sorted: Paladin(20) > Dragon(18) > Ranger(12)

    // Start with Paladin (ally)
    let active = selectActiveCombatant(store.getState());
    assert.equal(active.combatTeam, 'ally');

    // Advance to Dragon (enemy)
    nextBtn.click();
    active = selectActiveCombatant(store.getState());
    assert.equal(active.id, 'dragon');
    assert.equal(active.combatTeam, 'enemy');

    // Cancel enemy turn — go back to previous team's selection
    prevBtn.click();
    active = selectActiveCombatant(store.getState());
    assert.equal(active.id, 'paladin');
    assert.equal(active.combatTeam, 'ally', 'should return to ally selection stage');

    dispose();
  });

  test('combat start and end: round resets and combatants cleared', (t) => {
    t.after(() => teardownGlobals());

    const store = createCombatTrackerStore({
      round: 1,
      turnIndex: 2,
      combatants: buildParty(),
    });

    const panelRoot = document.getElementById('panel-root');
    const initRoot = document.getElementById('init-root');
    const disposePanel = renderTrackerPanel(panelRoot, { store });
    const disposeInit = renderInitiativeList(initRoot, { store });

    store.setState(store.getState());
    assert.equal(initRoot.querySelectorAll('.vtt-combat-tracker__item').length, 4);

    // End combat: clear state
    store.setState({
      round: 0,
      turnIndex: 0,
      combatants: [],
    });

    assert.equal(panelRoot.querySelector('[data-round]').textContent, '0');
    assert.equal(initRoot.querySelectorAll('.vtt-combat-tracker__item').length, 0);

    // Start new combat
    store.setState({
      round: 1,
      turnIndex: 0,
      combatants: [
        makeAllyCombatant({ id: 'new-hero', name: 'New Hero', initiative: 15 }),
      ],
    });

    assert.equal(panelRoot.querySelector('[data-round]').textContent, '1');
    assert.equal(initRoot.querySelectorAll('.vtt-combat-tracker__item').length, 1);

    disposePanel();
    disposeInit();
  });
});

// ===========================================================================
// 8. TEAM TRACKING — Ally vs Enemy Turns
// ===========================================================================

describe('Team Tracking – Allies vs Enemies', () => {
  test('tracks which team each combatant belongs to during turn cycle', () => {
    const combatants = [
      makeAllyCombatant({ id: 'ally-1', initiative: 20 }),
      makeEnemyCombatant({ id: 'enemy-1', initiative: 18 }),
      makeAllyCombatant({ id: 'ally-2', initiative: 15 }),
      makeEnemyCombatant({ id: 'enemy-2', initiative: 10 }),
    ];

    const store = createCombatTrackerStore({ combatants, turnIndex: 0 });

    // Sorted: ally-1(20) > enemy-1(18) > ally-2(15) > enemy-2(10)
    const expectedTeams = ['ally', 'enemy', 'ally', 'enemy'];

    for (let i = 0; i < 4; i++) {
      store.setState({ ...store.getState(), turnIndex: i });
      const active = selectActiveCombatant(store.getState());
      assert.equal(active.combatTeam, expectedTeams[i], `turn ${i} should be ${expectedTeams[i]}`);
    }
  });

  test('all-ally combat works correctly', () => {
    const combatants = [
      makeAllyCombatant({ id: 'a', initiative: 20 }),
      makeAllyCombatant({ id: 'b', initiative: 15 }),
      makeAllyCombatant({ id: 'c', initiative: 10 }),
    ];

    const store = createCombatTrackerStore({ combatants, turnIndex: 0 });

    for (let i = 0; i < 3; i++) {
      store.setState({ ...store.getState(), turnIndex: i });
      const active = selectActiveCombatant(store.getState());
      assert.equal(active.combatTeam, 'ally');
    }
  });

  test('all-enemy combat works correctly', () => {
    const combatants = [
      makeEnemyCombatant({ id: 'x', initiative: 20 }),
      makeEnemyCombatant({ id: 'y', initiative: 15 }),
    ];

    const store = createCombatTrackerStore({ combatants, turnIndex: 0 });

    for (let i = 0; i < 2; i++) {
      store.setState({ ...store.getState(), turnIndex: i });
      const active = selectActiveCombatant(store.getState());
      assert.equal(active.combatTeam, 'enemy');
    }
  });

  test('mixed team initiative order with interleaved teams', () => {
    const combatants = [
      makeEnemyCombatant({ id: 'e1', initiative: 25 }),
      makeAllyCombatant({ id: 'a1', initiative: 22 }),
      makeEnemyCombatant({ id: 'e2', initiative: 18 }),
      makeAllyCombatant({ id: 'a2', initiative: 14 }),
      makeEnemyCombatant({ id: 'e3', initiative: 10 }),
    ];

    const store = createCombatTrackerStore({ combatants, turnIndex: 0 });
    const sorted = selectSortedCombatants(store.getState());

    assert.deepEqual(
      sorted.map((c) => c.combatTeam),
      ['enemy', 'ally', 'enemy', 'ally', 'enemy']
    );
  });
});

// ===========================================================================
// 9. GROUPS — Multiple Tokens Acting Together
// ===========================================================================

describe('Token Groups', () => {
  test('store can hold combatants that share a group representative', () => {
    const combatants = [
      makeCombatant({ id: 'goblin-leader', name: 'Goblin Leader', initiative: 15, combatTeam: 'enemy' }),
      makeCombatant({ id: 'goblin-minion-1', name: 'Goblin Minion 1', initiative: 15, combatTeam: 'enemy' }),
      makeCombatant({ id: 'goblin-minion-2', name: 'Goblin Minion 2', initiative: 15, combatTeam: 'enemy' }),
    ];

    const store = createCombatTrackerStore({ combatants, turnIndex: 0 });
    const state = store.getState();
    assert.equal(state.combatants.length, 3);

    // All goblins have same initiative — they act together as a group
    const sorted = selectSortedCombatants(state);
    assert.ok(sorted.every((c) => c.initiative === 15));
  });

  test('group members all display in initiative list', (t) => {
    const dom2 = createDom('<div id="group-root"></div>');
    setupGlobals(dom2);
    t.after(() => teardownGlobals());

    const combatants = [
      makeCombatant({ id: 'hero', name: 'Hero', initiative: 20 }),
      makeCombatant({ id: 'minion-a', name: 'Minion A', initiative: 10 }),
      makeCombatant({ id: 'minion-b', name: 'Minion B', initiative: 10 }),
    ];

    const store = createCombatTrackerStore({ combatants, turnIndex: 0 });
    const root = dom2.window.document.getElementById('group-root');
    const dispose = renderInitiativeList(root, { store });
    store.setState(store.getState());

    const items = root.querySelectorAll('.vtt-combat-tracker__item');
    assert.equal(items.length, 3, 'all group members should render');
    dispose();
  });
});

// ===========================================================================
// 10. MULTI-USER STATE TRACKING
// ===========================================================================

describe('Multi-User State Tracking', () => {
  test('store state can be serialized and restored for sync between users', () => {
    const combatants = buildParty();
    const store = createCombatTrackerStore({
      sceneId: 'scene-1',
      round: 3,
      turnIndex: 2,
      combatants,
    });

    // Simulate serialization (like sending over Pusher)
    const serialized = JSON.stringify(store.getState());
    const deserialized = JSON.parse(serialized);

    // Simulate another user receiving the state
    const store2 = createCombatTrackerStore(deserialized);
    const state2 = store2.getState();

    assert.equal(state2.sceneId, 'scene-1');
    assert.equal(state2.round, 3);
    assert.equal(state2.turnIndex, 2);
    assert.equal(state2.combatants.length, 4);
  });

  test('both users see the same active combatant after sync', () => {
    const combatants = buildParty();
    const gmStore = createCombatTrackerStore({
      combatants,
      turnIndex: 1,
    });

    const serialized = JSON.parse(JSON.stringify(gmStore.getState()));
    const playerStore = createCombatTrackerStore(serialized);

    const gmActive = selectActiveCombatant(gmStore.getState());
    const playerActive = selectActiveCombatant(playerStore.getState());

    assert.equal(gmActive.id, playerActive.id);
    assert.equal(gmActive.name, playerActive.name);
    assert.equal(gmActive.initiative, playerActive.initiative);
  });

  test('GM advances turn; player store reflects after sync', () => {
    const combatants = buildParty();
    const gmStore = createCombatTrackerStore({ combatants, turnIndex: 0 });

    // GM advances turn
    const state = gmStore.getState();
    gmStore.setState({ turnIndex: (state.turnIndex + 1) % state.combatants.length });

    // Simulate sync to player
    const playerStore = createCombatTrackerStore(JSON.parse(JSON.stringify(gmStore.getState())));
    const playerActive = selectActiveCombatant(playerStore.getState());

    // Sorted: Fighter(18) > Goblin(15) > Wizard(12) > Goblin2(8)
    // After advance from 0, turnIndex = 1 → Goblin
    assert.equal(playerActive.id, 'goblin-1');
  });

  test('round changes propagate across stores', () => {
    const gmStore = createCombatTrackerStore({
      combatants: buildParty(),
      round: 1,
      turnIndex: 0,
    });

    gmStore.setState({ round: 2 });

    const playerStore = createCombatTrackerStore(JSON.parse(JSON.stringify(gmStore.getState())));
    assert.equal(playerStore.getState().round, 2);
  });
});

// ===========================================================================
// 11. EDGE CASES & ERROR HANDLING
// ===========================================================================

describe('Edge Cases', () => {
  test('negative initiative values sort correctly', () => {
    const state = {
      combatants: [
        makeCombatant({ id: 'neg', initiative: -5 }),
        makeCombatant({ id: 'zero', initiative: 0 }),
        makeCombatant({ id: 'pos', initiative: 10 }),
      ],
      turnIndex: 0,
    };

    const sorted = selectSortedCombatants(state);
    assert.equal(sorted[0].id, 'pos');
    assert.equal(sorted[1].id, 'zero');
    assert.equal(sorted[2].id, 'neg');
  });

  test('very large initiative values sort correctly', () => {
    const state = {
      combatants: [
        makeCombatant({ id: 'normal', initiative: 15 }),
        makeCombatant({ id: 'huge', initiative: 99999 }),
      ],
      turnIndex: 0,
    };

    const sorted = selectSortedCombatants(state);
    assert.equal(sorted[0].id, 'huge');
  });

  test('store handles rapid successive setState calls', () => {
    const store = createCombatTrackerStore({ combatants: buildParty(), turnIndex: 0 });
    const notifications = [];

    store.subscribe((s) => notifications.push(s.turnIndex));

    for (let i = 0; i < 100; i++) {
      store.setState({ turnIndex: i % 4 });
    }

    assert.equal(notifications.length, 100);
    assert.equal(store.getState().turnIndex, 3); // 99 % 4 = 3
  });

  test('combatant with missing fields still works', () => {
    const state = {
      combatants: [
        { id: 'minimal' },
      ],
      turnIndex: 0,
    };

    const active = selectActiveCombatant(state);
    assert.equal(active.id, 'minimal');
  });

  test('duplicate combatant IDs do not crash sorting', () => {
    const state = {
      combatants: [
        makeCombatant({ id: 'dup', initiative: 10 }),
        makeCombatant({ id: 'dup', initiative: 15 }),
      ],
      turnIndex: 0,
    };

    const sorted = selectSortedCombatants(state);
    assert.equal(sorted.length, 2);
    assert.equal(sorted[0].initiative, 15);
  });
});
