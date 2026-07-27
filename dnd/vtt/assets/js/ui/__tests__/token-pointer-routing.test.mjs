import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  applyCanonicalPrimaryTokenSelection,
  ensureTokenSettingsElementConnected,
  isTokenSettingsElementUsable,
  reconcileStaleTokenPointerTarget,
  resolveCanonicalTokenPointerTarget,
} from '../token-pointer-routing.js';

function createSelectionHarness({
  selected = [],
  placements = {},
} = {}) {
  const selectedTokenIds = new Set(selected);
  const calls = {
    pcDetails: [],
    monsterTray: [],
    monsterSummary: [],
    update: [],
    refresh: 0,
    render: 0,
  };

  function dispatchSelection() {
    calls.refresh += 1;
    const firstId = selectedTokenIds.values().next().value ?? null;
    const placement = firstId ? placements[firstId] ?? null : null;
    calls.pcDetails.push(
      placement?.characterId
        ? { characterId: placement.characterId, token: placement }
        : { characterId: null, token: null }
    );
    if (placement?.monster) {
      calls.monsterTray.push(placement.id);
      calls.monsterSummary.push(placement.id);
    }
  }

  function updateSelection(id, options) {
    calls.update.push({ id, options });
    if (options.toggle) {
      if (selectedTokenIds.has(id)) selectedTokenIds.delete(id);
      else selectedTokenIds.add(id);
    } else if (options.additive) {
      selectedTokenIds.add(id);
    } else {
      selectedTokenIds.clear();
      selectedTokenIds.add(id);
    }
    dispatchSelection();
    return true;
  }

  function primary(id, modifiers = {}) {
    const result = applyCanonicalPrimaryTokenSelection({
      placementId: id,
      selectedTokenIds,
      ...modifiers,
      updateSelection,
      refreshSelection: dispatchSelection,
    });
    if (result.selectionChanged) calls.render += 1;
    return result;
  }

  return { selectedTokenIds, calls, primary };
}

test('first canonical PC click selects and dispatches tray detail', () => {
  const pc = { id: 'pc-1', characterId: 'hero-1', name: 'Hero' };
  const harness = createSelectionHarness({ placements: { 'pc-1': pc } });

  assert.deepEqual(harness.primary('pc-1'), {
    selectionChanged: true,
    selectionRefreshed: false,
  });
  assert.deepEqual([...harness.selectedTokenIds], ['pc-1']);
  assert.deepEqual(harness.calls.pcDetails, [{ characterId: 'hero-1', token: pc }]);
  assert.equal(harness.calls.render, 1);
});

test('same already-selected PC click redispatches detail without a token render', () => {
  const pc = { id: 'pc-1', characterId: 'hero-1', name: 'Hero' };
  const harness = createSelectionHarness({
    selected: ['pc-1'],
    placements: { 'pc-1': pc },
  });

  assert.deepEqual(harness.primary('pc-1'), {
    selectionChanged: false,
    selectionRefreshed: true,
  });
  assert.deepEqual(harness.calls.pcDetails, [{ characterId: 'hero-1', token: pc }]);
  assert.equal(harness.calls.update.length, 0);
  assert.equal(harness.calls.render, 0);
});

test('same already-selected monster click reroutes both monster panels', () => {
  const monster = { id: 'monster-1', monster: { name: 'Goblin' } };
  const harness = createSelectionHarness({
    selected: ['monster-1'],
    placements: { 'monster-1': monster },
  });

  harness.primary('monster-1');

  assert.deepEqual(harness.calls.pcDetails, [{ characterId: null, token: null }]);
  assert.deepEqual(harness.calls.monsterTray, ['monster-1']);
  assert.deepEqual(harness.calls.monsterSummary, ['monster-1']);
  assert.equal(harness.calls.render, 0);
});

test('modifier and multiselect routing remains delegated to updateSelection', () => {
  const placements = {
    one: { id: 'one', characterId: 'hero-1' },
    two: { id: 'two', characterId: 'hero-2' },
  };
  const harness = createSelectionHarness({ selected: ['one'], placements });

  harness.primary('two', { shiftKey: true });
  assert.deepEqual([...harness.selectedTokenIds], ['one', 'two']);
  assert.deepEqual(harness.calls.update[0], {
    id: 'two',
    options: { additive: true, toggle: false },
  });

  harness.primary('one', { ctrlKey: true });
  assert.deepEqual([...harness.selectedTokenIds], ['two']);
  assert.deepEqual(harness.calls.update[1], {
    id: 'one',
    options: { additive: false, toggle: true },
  });
  assert.equal(harness.calls.refresh, 2);
  assert.equal(harness.calls.render, 2);
});

test('canonical rendered hit resolves to the active-scene placement for right-click settings', () => {
  const canonical = { id: 'token-1', name: 'Current token', column: 8 };
  let settingsOpenedFor = null;

  const target = resolveCanonicalTokenPointerTarget({
    renderedPlacement: { id: 'token-1', name: 'Old rendered token', column: 2 },
    getCanonicalPlacement: (id) => (id === 'token-1' ? canonical : null),
  });
  if (target.kind === 'canonical') settingsOpenedFor = target.placement;

  assert.equal(target.kind, 'canonical');
  assert.equal(settingsOpenedFor, canonical);
});

test('stale rendered hit requests reconciliation and never falls through to pan or drag', () => {
  const calls = { reconcile: [], pan: 0, drag: 0, settings: 0 };
  const target = resolveCanonicalTokenPointerTarget({
    renderedPlacement: { id: 'deleted-token' },
    getCanonicalPlacement: () => null,
    onStaleToken: (id) => calls.reconcile.push(id),
  });

  if (target.kind === 'empty') calls.pan += 1;
  if (target.kind === 'canonical') {
    calls.drag += 1;
    calls.settings += 1;
  }

  assert.equal(target.kind, 'stale');
  assert.deepEqual(calls, {
    reconcile: ['deleted-token'],
    pan: 0,
    drag: 0,
    settings: 0,
  });
});

test('stale recovery clears selection and drag without save or pan side effects', () => {
  const selectedTokenIds = new Set(['deleted-token', 'still-valid']);
  const calls = {
    closeSettings: 0,
    cancelDrag: 0,
    clearCandidate: 0,
    clearHover: [],
    refresh: [],
    rerender: 0,
    resync: [],
    dragCommit: 0,
    pan: 0,
    trayOpen: 0,
    settingsOpen: 0,
  };

  const result = reconcileStaleTokenPointerTarget({
    placementId: 'deleted-token',
    selectedTokenIds,
    activeSettingsId: 'deleted-token',
    dragState: { tokens: [{ id: 'deleted-token' }] },
    closeSettings: () => {
      calls.closeSettings += 1;
    },
    cancelActiveDrag: () => {
      calls.cancelDrag += 1;
    },
    clearDragCandidate: () => {
      calls.clearCandidate += 1;
    },
    clearHover: (id) => {
      calls.clearHover.push(id);
    },
    refreshSelection: (details) => {
      calls.refresh.push(details);
    },
    rerender: () => {
      calls.rerender += 1;
    },
    requestResync: (reason) => {
      calls.resync.push(reason);
    },
  });

  assert.deepEqual(result, {
    recovered: true,
    selectionChanged: true,
    activeDragCanceled: true,
  });
  assert.deepEqual([...selectedTokenIds], ['still-valid']);
  assert.deepEqual(calls, {
    closeSettings: 1,
    cancelDrag: 1,
    clearCandidate: 1,
    clearHover: ['deleted-token'],
    refresh: [{ selectionChanged: true }],
    rerender: 1,
    resync: ['stale-rendered-token'],
    dragCommit: 0,
    pan: 0,
    trayOpen: 0,
    settingsOpen: 0,
  });
});

test('repeated sync, rerender, reselect, and right-click cycles stay canonical', () => {
  const pc = { id: 'pc-1', characterId: 'hero-1', revision: 0 };
  const harness = createSelectionHarness({
    selected: ['pc-1'],
    placements: { 'pc-1': pc },
  });
  let settingsOpens = 0;
  let staleRecoveries = 0;

  for (let cycle = 1; cycle <= 500; cycle += 1) {
    pc.revision = cycle;
    const target = resolveCanonicalTokenPointerTarget({
      renderedPlacement: { id: 'pc-1', revision: cycle - 1 },
      getCanonicalPlacement: () => pc,
      onStaleToken: () => {
        staleRecoveries += 1;
      },
    });
    assert.equal(target.kind, 'canonical');
    harness.primary(target.placement.id);
    if (target.kind === 'canonical') settingsOpens += 1;
  }

  assert.equal(harness.calls.refresh, 500);
  assert.equal(harness.calls.pcDetails.length, 500);
  assert.equal(harness.calls.render, 0);
  assert.equal(settingsOpens, 500);
  assert.equal(staleRecoveries, 0);
});

test('token settings lifecycle accepts only connected menu elements', () => {
  assert.equal(isTokenSettingsElementUsable(null), false);
  assert.equal(isTokenSettingsElementUsable({ isConnected: false }), false);
  assert.equal(isTokenSettingsElementUsable({ isConnected: true }), true);

  const fallbackElement = {};
  const documentRef = {
    documentElement: {
      contains(element) {
        return element === fallbackElement;
      },
    },
  };
  assert.equal(isTokenSettingsElementUsable(fallbackElement, documentRef), true);
  assert.equal(isTokenSettingsElementUsable({}, documentRef), false);
});

test('detached settings menu reconnects the same element without duplicates', () => {
  let connected = false;
  const elements = new Set();
  const element = {
    get isConnected() {
      return connected;
    },
  };
  const documentRef = {
    documentElement: {
      contains(candidate) {
        return connected && candidate === element;
      },
    },
    body: {
      appendChild(candidate) {
        assert.strictEqual(candidate, element);
        elements.add(candidate);
        connected = true;
        return candidate;
      },
      contains(candidate) {
        return connected && elements.has(candidate);
      },
    },
  };

  for (let cycle = 0; cycle < 100; cycle += 1) {
    connected = false;
    assert.equal(ensureTokenSettingsElementConnected(element, documentRef), true);
    assert.equal(element.isConnected, true);
    assert.equal(elements.size, 1);
  }
});
