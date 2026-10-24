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

  test('does not clear the active turn during a skip-prune empty render', () => {
    const { documentRef, root, waiting, completed } = createTrackerDom();
    const cleared = [];

    renderCombatTracker({
      elements: { root, waiting, completed },
      combatants: [],
      options: { activeIds: [], skipPrune: true, skipCache: true },
      state: {
        combatantTeams: new Map(),
        completedCombatants: new Set(),
        trackerHoverTokenIds: new Set(),
      },
      callbacks: createCallbacks({
        activeCombatantId: 'hero',
        hooks: {
          setActiveCombatantId: (id) => cleared.push(id),
        },
      }),
      documentRef,
      HTMLElementCtor: FakeElement,
    });

    assert.deepEqual(cleared, []);
  });

  // The Director's page, reloaded in mid-round: the saved fight is applied before the tokens are drawn, and the
  // tracker is redrawn from the list it remembers, which is still empty (board-interactions.js,
  // applyCombatStateFromBoardState -> refreshCombatTracker). The tester, Build 505: "his turn-order strip shows
  // nobody as done... the Director double-clicks Gintaras in the waiting row and the server starts his turn again".
  test('a tracker with nobody on it yet does not forget who has acted, or whose turn it is', () => {
    const { documentRef, root, waiting, completed } = createTrackerDom();
    const done = new Set(['cal', 'gintaras']);
    const calls = { completed: [], groups: [], active: [] };
    const draw = (combatants, options) => renderCombatTracker({
      elements: { root, waiting, completed },
      combatants,
      options,
      state: { combatantTeams: new Map(), completedCombatants: done, trackerHoverTokenIds: new Set() },
      callbacks: createCallbacks({
        activeCombatantId: 'ogre',
        hooks: {
          // The Director's own tidy-up, as board-interactions.js has it: whoever is not on the tracker is dropped.
          pruneCompletedCombatants: (activeIds) => { calls.completed.push(activeIds.size); [...done].forEach((id) => { if (!activeIds.has(id)) done.delete(id); }); },
          pruneCombatGroups: (activeIds) => { calls.groups.push(activeIds.size); return false; },
          setActiveCombatantId: (id) => calls.active.push(id),
        },
      }),
      documentRef,
      HTMLElementCtor: FakeElement,
    });

    // The redraw from the remembered list, before any token has been drawn. No skipPrune: that is the path.
    draw([], { skipCache: true, activeIds: new Set() });
    assert.deepEqual([...done], ['cal', 'gintaras'], 'nobody is dropped from "has acted"');
    assert.deepEqual(calls, { completed: [], groups: [], active: [] }, 'nothing is tidied and the turn is not cleared');

    // The tokens arrive: both are drawn as done, and the ogre keeps its turn.
    const everyone = [{ id: 'cal', name: 'Cal' }, { id: 'gintaras', name: 'Gintaras' }, { id: 'ogre', name: 'Ogre' }];
    draw(everyone, { activeIds: new Set(['cal', 'gintaras', 'ogre']) });
    assert.deepEqual(completed.children.map((node) => node.dataset.combatantId).sort(), ['cal', 'gintaras']);
    assert.deepEqual(waiting.children.map((node) => node.dataset.combatantId), ['ogre']);
    assert.deepEqual(calls.active, []);

    // And the tidy-up still does its work once there is somebody to compare against: a token that was deleted.
    draw(everyone.slice(1), { activeIds: new Set(['gintaras', 'ogre']) });
    assert.deepEqual([...done], ['gintaras'], 'Cal\'s token is gone, so he leaves the list');
  });

  test('the page takes that path, and its own tidy-up holds to the same rule', async () => {
    const { readFileSync } = await import('node:fs');
    const board = readFileSync(new URL('../../ui/board-interactions.js', import.meta.url), 'utf8');
    const apply = board.slice(board.indexOf('  function applyCombatStateFromBoardState('), board.indexOf('  function resetTurnEffects('));
    assert.ok(apply.indexOf('normalized.completedCombatantIds.forEach((id) => completedCombatants.add(id));') > 0);
    assert.ok(apply.indexOf('refreshCombatTracker();') > apply.indexOf('completedCombatants.add(id)'), 'the saved list is put in place, then the tracker is redrawn from what it remembers');
    // That redraw no longer tidies at all: what the tracker remembers may be nothing yet, or another scene's tokens
    // (the Director changing the map he looks at in mid-fight). Only tokens being drawn tidy.
    assert.match(board, /function refreshCombatTracker\(\) \{[\s\S]{0,700}updateCombatTracker\(lastCombatTrackerEntries, \{\s*skipCache: true,\s*skipPrune: true,\s*activeIds: lastCombatTrackerActiveIds,\s*\}\);/);
    assert.match(board, /if \(!options\.skipTracker\) \{\s*updateCombatTracker\(trackerEntries, \{ activeIds: activeCombatantIds \}\);/, 'drawing the tokens still does');
    assert.match(board, /function pruneCompletedCombatants\(activeIds\) \{\s*const activeSet = [^\n]+\n[^\n]*\n\s*if \(!activeSet\.size\) return;/);
  });

  test('a redraw from another scene\'s remembered tokens does not drop this scene\'s list either', () => {
    const { documentRef, root, waiting, completed } = createTrackerDom();
    const done = new Set(['cal', 'gintaras']);
    let tidied = 0;
    renderCombatTracker({
      elements: { root, waiting, completed },
      combatants: [{ id: 'old-scene-goblin', name: 'Goblin' }],
      options: { skipCache: true, skipPrune: true, activeIds: new Set(['old-scene-goblin']) },      // as refreshCombatTracker now draws
      state: { combatantTeams: new Map(), completedCombatants: done, trackerHoverTokenIds: new Set() },
      callbacks: createCallbacks({ activeCombatantId: 'cal', hooks: {
        pruneCompletedCombatants: () => { tidied += 1; done.clear(); },
        setActiveCombatantId: () => { tidied += 1; },
      } }),
      documentRef,
      HTMLElementCtor: FakeElement,
    });
    assert.equal(tidied, 0);
    assert.deepEqual([...done], ['cal', 'gintaras']);
  });

  test('leaves an unknown team uncached so placement inference can run', () => {
    const { documentRef, root, waiting, completed } = createTrackerDom();
    const combatantTeams = new Map([['unknown', 'enemy']]);
    const callbacks = createCallbacks();
    callbacks.getCombatantTeam = () => null;

    renderCombatTracker({
      elements: { root, waiting, completed },
      combatants: [{ id: 'unknown', name: 'Unknown Team' }],
      state: {
        combatantTeams,
        completedCombatants: new Set(),
        trackerHoverTokenIds: new Set(),
      },
      callbacks,
      documentRef,
      HTMLElementCtor: FakeElement,
    });

    assert.equal(combatantTeams.has('unknown'), false);
  });

  // Phase 3 (Brandon, October 2026): a solo monster's extra turns show as faded copies in the tracker, "so it is clear
  // these are not extra monsters". Turn N is done once the monster has started N turns this round.
  test('a solo monster shows its extra turns as faded entries, done as they are taken', () => {
    const render = (taken, active = false) => {
      const { documentRef, root, waiting, completed } = createTrackerDom();
      const callbacks = createCallbacks({ teams: { dragon: 'enemy', cal: 'ally' }, activeCombatantId: active ? 'dragon' : null });
      callbacks.getSoloTurns = (id) => (id === 'dragon' ? { turns: 3, taken, active } : null);
      renderCombatTracker({
        elements: { root, waiting, completed },
        combatants: [{ id: 'dragon', name: 'Meteor Dragon' }, { id: 'cal', name: 'Cal' }],
        state: { combatantTeams: new Map(), completedCombatants: new Set(taken ? ['dragon'] : []), trackerHoverTokenIds: new Set() },
        callbacks,
        documentRef,
        HTMLElementCtor: FakeElement,
      });
      const extras = (list) => list.children.filter((node) => node.dataset.soloTurnOf === 'dragon').map((node) => node.dataset.soloTurn);
      return { waiting: extras(waiting), completed: extras(completed), nodes: [...waiting.children, ...completed.children].filter((n) => n.dataset.soloTurnOf) };
    };
    let view = render(0);
    assert.deepEqual(view.waiting, ['2', '3'], 'two extra turns waiting');
    assert.ok(view.nodes.every((node) => node.classList.contains('vtt-combat-token--solo-turn') && node.dataset.combatantId === undefined), 'faded, and not combatants of their own');
    assert.equal(view.nodes[0].title, 'Meteor Dragon: turn 2');
    view = render(2, true);
    assert.deepEqual(view.waiting, ['2', '3'], 'turn 2 going on now stays in waiting, lit');
    assert.ok(view.nodes.find((node) => node.dataset.soloTurn === '2').classList.contains('is-active'));
    view = render(3);
    assert.deepEqual(view.completed, ['2', '3']);
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
