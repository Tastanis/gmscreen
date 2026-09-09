import assert from 'node:assert/strict';
import test from 'node:test';
import { createAbilityAutomationHarness } from './support/automation-harness.mjs';

test('board suggestions refresh while manual choices survive absence and reset for another target', async () => {
  const h = await createAbilityAutomationHarness();
  try {
    const api = h.window.AbilityAutomationRunner.__testing;
    let available = true;
    const state = { sourcePlacement: { id: 'actor' }, action: { id: 'attack' },
      context: { getPowerRollSuggestions: () => available ? [{ id: 'height', kind: 'edge', label: 'High ground', active: true }] : [] } };
    const block = { id: 'roll', target: 'self' };
    api.refreshPowerRollSuggestions(state, block);
    assert.equal(state.rollSuggestions[0].active, true);
    api.setRollSuggestionActive(state, state.rollSuggestions[0], false);
    api.refreshPowerRollSuggestions(state, block);
    assert.equal(state.rollSuggestions[0].active, false);
    available = false;
    api.refreshPowerRollSuggestions(state, block);
    assert.equal(state.rollSuggestions.length, 0);
    available = true;
    api.refreshPowerRollSuggestions(state, block);
    assert.equal(state.rollSuggestions[0].active, false);
    state.sourcePlacement = { id: 'other' };
    api.refreshPowerRollSuggestions(state, block);
    assert.equal(state.rollSuggestions[0].active, true);
  } finally { h.close(); }
});

test('watch refreshes only before rolling and stops on close or detached host', async () => {
  const h = await createAbilityAutomationHarness();
  try {
    const api = h.window.AbilityAutomationRunner.__testing;
    let tick;
    let canceled = 0;
    h.window.setTimeout = callback => { tick = callback; return 1; };
    h.window.clearTimeout = () => { canceled++; };
    let active = true;
    let reads = 0;
    let paints = 0;
    const state = { sourcePlacement: { id: 'actor' }, action: {}, context: {
      getPowerRollSuggestions: () => { reads++; return [{ id: 'height', kind: 'edge', label: 'High ground', active }]; }
    } };
    const host = { isConnected: true };
    const stop = api.watchPowerRollSuggestions(host, state, { target: 'self' }, () => paints++);
    tick();
    assert.equal(paints, 1);
    tick();
    assert.equal(paints, 1, 'unchanged suggestions do not rebuild the controls');
    active = false;
    tick();
    assert.equal(paints, 2);
    state.roll = { total: 10 };
    active = true;
    tick();
    assert.equal(reads, 3, 'rolled results stay fixed');
    stop();
    tick();
    assert.equal(reads, 3);
    assert.equal(canceled, 1);
    state.roll = null;
    api.watchPowerRollSuggestions(host, state, { target: 'self' }, () => paints++);
    host.isConnected = false;
    tick();
    assert.equal(reads, 3);
  } finally { h.close(); }
});
