import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  cloneCombatantEntry,
  deriveCombatTokenInitials,
  refreshCombatantStateClasses,
  renderCombatTracker,
} from '../combat-renderer.js';

function createTrackerDom() {
  const documentRef = new FakeDocument();
  const root = documentRef.createElement('section');
  root.dataset.combatTracker = '';
  const waiting = documentRef.createElement('div');
  waiting.dataset.combatTrackerWaiting = '';
  const completed = documentRef.createElement('div');
  completed.dataset.combatTrackerCompleted = '';
  root.appendChild(waiting);
  root.appendChild(completed);

  return {
    documentRef,
    root,
    waiting,
    completed,
  };
}

function createCallbacks({
  isGm = true,
  combatActive = true,
  activeCombatantId = null,
  cache = {},
  teams = {},
  profiles = {},
  groups = {},
  displayRepresentatives = new Map(),
  hooks = {},
} = {}) {
  return {
    isGmUser: () => isGm,
    toBoolean: (value, fallback = false) => {
      if (typeof value === 'boolean') {
        return value;
      }
      return fallback;
    },
    getCombatantProfileId: (id) => profiles[id] ?? null,
    getRepresentativeIdFor: (id) => {
      const match = Object.entries(groups).find(([, members]) => members.includes(id));
      return match?.[0] ?? id;
    },
    getGroupMembers: (id) => groups[id] ?? [id],
    getVisibleGroupMembers: (id, visibleIds) => (groups[id] ?? [id]).filter((memberId) => visibleIds.has(memberId)),
    buildDisplayRepresentatives: () => displayRepresentatives,
    getCombatGroupColorAssignments: () => new Map(Object.keys(groups).map((id, index) => [id, index + 1])),
    getCombatantTeam: (id) => teams[id] ?? 'ally',
    getCombatActive: () => combatActive,
    getActiveCombatantId: () => activeCombatantId,
    setActiveCombatantId: (id) => {
      activeCombatantId = id;
      hooks.setActiveCombatantId?.(id);
    },
    setLastCombatTrackerEntries: (entries) => {
      cache.entries = entries;
    },
    setLastCombatTrackerActiveIds: (ids) => {
      cache.activeIds = ids;
    },
    pruneCombatGroups: hooks.pruneCombatGroups ?? (() => false),
    pruneCompletedCombatants: hooks.pruneCompletedCombatants ?? (() => {}),
    shouldSyncPrunedGroups: hooks.shouldSyncPrunedGroups ?? (() => false),
    syncCombatStateToStore: hooks.syncCombatStateToStore ?? (() => {}),
    updateBoardTokenHighlight: hooks.updateBoardTokenHighlight ?? (() => {}),
    attachTrackerHoverHandlers: hooks.attachTrackerHoverHandlers ?? (() => {}),
    refreshCombatantStateClasses: hooks.refreshCombatantStateClasses ?? (() => {}),
    updateCombatModeIndicators: hooks.updateCombatModeIndicators ?? (() => {}),
    cancelTrackerOverflowRefresh: hooks.cancelTrackerOverflowRefresh ?? (() => {}),
    refreshTrackerOverflowIndicators: hooks.refreshTrackerOverflowIndicators ?? (() => {}),
    setSectionOverflowState: hooks.setSectionOverflowState ?? (() => {}),
    scheduleTrackerOverflowRefresh: hooks.scheduleTrackerOverflowRefresh ?? (() => {}),
  };
}

describe('combat renderer helpers', () => {
  test('derives initials from token labels', () => {
    assert.equal(deriveCombatTokenInitials('  Iron Wolf  '), 'IW');
    assert.equal(deriveCombatTokenInitials('Solo'), 'S');
    assert.equal(deriveCombatTokenInitials(''), '?');
  });

  test('clones combatant entries without sharing hp objects', () => {
    const original = { id: 'token-1', hp: { current: 5, max: 10 } };
    const clone = cloneCombatantEntry(original);

    assert.deepEqual(clone, original);
    assert.notEqual(clone.hp, original.hp);
  });
});

describe('renderCombatTracker', () => {
  test('renders active and completed GM combatants into the right lists', () => {
    const { documentRef, root, waiting, completed } = createTrackerDom();
    const cache = {};
    let refreshCount = 0;
    const allyHp = { current: 9 };

    renderCombatTracker({
      elements: { root, waiting, completed },
      combatants: [
        { id: 'ally-1', name: 'Ally One', hp: allyHp },
        { id: 'enemy-1', name: 'Enemy One' },
      ],
      state: {
        combatantTeams: new Map(),
        completedCombatants: new Set(['enemy-1']),
        trackerHoverTokenIds: new Set(),
      },
      callbacks: createCallbacks({
        activeCombatantId: 'ally-1',
        cache,
        teams: { 'ally-1': 'ally', 'enemy-1': 'enemy' },
        hooks: {
          refreshCombatantStateClasses: () => {
            refreshCombatantStateClasses({
              root,
              combatActive: true,
              activeCombatantId: 'ally-1',
              completedCombatants: new Set(['enemy-1']),
              gmViewing: true,
              HTMLElementCtor: FakeElement,
            });
            refreshCount += 1;
          },
        },
      }),
      documentRef,
      HTMLElementCtor: FakeElement,
    });

    const activeToken = waiting.querySelector('[data-combatant-id="ally-1"]');
    const completedToken = completed.querySelector('[data-combatant-id="enemy-1"]');

    assert.equal(root.dataset.viewerRole, 'gm');
    assert.equal(waiting.dataset.empty, 'false');
    assert.equal(completed.dataset.empty, 'false');
    assert.equal(activeToken.classList.contains('is-active'), true);
    assert.equal(activeToken.getAttribute('aria-current'), 'true');
    assert.equal(completedToken.classList.contains('is-completed'), true);
    assert.equal(cache.entries.length, 2);
    assert.notEqual(cache.entries[0].hp, allyHp);
    assert.equal(refreshCount, 1);
  });

  test('filters hidden player entries and keeps player-owned tokens first', () => {
    const { documentRef, root, waiting, completed } = createTrackerDom();
    let scheduledOverflow = false;

    renderCombatTracker({
      elements: { root, waiting, completed },
      combatants: [
        { id: 'enemy-1', name: 'Enemy One', team: 'enemy' },
        { id: 'ally-1', name: 'Ally One', team: 'ally' },
        { id: 'pc-1', name: 'Player One', team: 'ally' },
        { id: 'hidden-1', name: 'Hidden Enemy', team: 'enemy', hidden: true },
      ],
      state: {
        combatantTeams: new Map(),
        completedCombatants: new Set(),
        trackerHoverTokenIds: new Set(),
      },
      callbacks: createCallbacks({
        isGm: false,
        combatActive: true,
        profiles: { 'pc-1': 'hero' },
        teams: { 'enemy-1': 'enemy', 'ally-1': 'ally', 'pc-1': 'ally', 'hidden-1': 'enemy' },
        hooks: {
          scheduleTrackerOverflowRefresh: () => {
            scheduledOverflow = true;
          },
        },
      }),
      documentRef,
      HTMLElementCtor: FakeElement,
    });

    const renderedIds = Array.from(waiting.querySelectorAll('[data-combatant-id]')).map(
      (node) => node.dataset.combatantId
    );

    assert.deepEqual(renderedIds, ['pc-1', 'ally-1', 'enemy-1']);
    assert.equal(waiting.querySelector('[data-combatant-id="hidden-1"]'), null);
    assert.equal(waiting.querySelector('[data-combatant-id="pc-1"]').getAttribute('tabindex'), '-1');
    assert.equal(completed.dataset.empty, 'true');
    assert.equal(scheduledOverflow, true);
  });

  test('uses a visible group member to render hidden player representatives', () => {
    const { documentRef, root, waiting, completed } = createTrackerDom();

    renderCombatTracker({
      elements: { root, waiting, completed },
      combatants: [
        { id: 'leader', name: 'Hidden Leader', hidden: true },
        { id: 'member', name: 'Visible Member' },
      ],
      state: {
        combatantTeams: new Map(),
        completedCombatants: new Set(),
        trackerHoverTokenIds: new Set(),
      },
      callbacks: createCallbacks({
        isGm: false,
        groups: { leader: ['leader', 'member'] },
        displayRepresentatives: new Map([['member', 'leader']]),
      }),
      documentRef,
      HTMLElementCtor: FakeElement,
    });

    const token = waiting.querySelector('[data-combatant-id="leader"]');

    assert.notEqual(token, null);
    assert.equal(token.getAttribute('aria-label'), 'Visible Member');
    assert.equal(token.querySelector('.vtt-combat-token__initials').textContent, 'VM');
  });
});

class FakeDocument {
  createElement(tagName) {
    return new FakeElement(tagName);
  }

  createDocumentFragment() {
    return new FakeDocumentFragment();
  }
}

class FakeDocumentFragment {
  constructor() {
    this.children = [];
    this.parentNode = null;
    this.nodeType = 11;
  }

  appendChild(child) {
    appendChild(this, child);
    return child;
  }
}

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.attributes = new Map();
    this.nodeType = 1;
    this._classList = new FakeClassList();
    this._className = '';
    this.textContent = '';
    this.title = '';
  }

  get className() {
    return this._className;
  }

  set className(value) {
    this._className = typeof value === 'string' ? value : '';
    this._classList = new FakeClassList(this._className.split(/\s+/).filter(Boolean));
  }

  get classList() {
    return this._classList;
  }

  get innerHTML() {
    return '';
  }

  set innerHTML(value) {
    this.children = [];
    this.textContent = typeof value === 'string' ? value : '';
  }

  appendChild(child) {
    appendChild(this, child);
    return child;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector) {
    const matches = [];
    walkChildren(this, (node) => {
      if (node instanceof FakeElement && matchesSelector(node, selector)) {
        matches.push(node);
      }
    });
    return matches;
  }
}

class FakeClassList {
  constructor(initial = []) {
    this.values = new Set(initial);
  }

  add(value) {
    this.values.add(value);
  }

  remove(value) {
    this.values.delete(value);
  }

  toggle(value, force) {
    if (force === true) {
      this.add(value);
      return true;
    }
    if (force === false) {
      this.remove(value);
      return false;
    }
    if (this.values.has(value)) {
      this.values.delete(value);
      return false;
    }
    this.values.add(value);
    return true;
  }

  contains(value) {
    return this.values.has(value);
  }
}

function appendChild(parent, child) {
  if (child instanceof FakeDocumentFragment) {
    child.children.forEach((fragmentChild) => {
      fragmentChild.parentNode = parent;
      parent.children.push(fragmentChild);
    });
    child.children = [];
    return;
  }

  child.parentNode = parent;
  parent.children.push(child);
}

function walkChildren(node, visitor) {
  node.children.forEach((child) => {
    visitor(child);
    walkChildren(child, visitor);
  });
}

function matchesSelector(node, selector) {
  if (selector.startsWith('.')) {
    return node.classList.contains(selector.slice(1));
  }

  const dataMatch = selector.match(/^\[data-([a-z0-9-]+)(?:="([^"]*)")?\]$/i);
  if (!dataMatch) {
    return false;
  }

  const key = dataAttributeToDatasetKey(dataMatch[1]);
  if (!Object.prototype.hasOwnProperty.call(node.dataset, key)) {
    return false;
  }

  return dataMatch[2] === undefined || node.dataset[key] === dataMatch[2];
}

function dataAttributeToDatasetKey(attributeName) {
  return attributeName.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}
