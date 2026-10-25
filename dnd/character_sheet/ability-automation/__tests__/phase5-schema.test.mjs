import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createAbilityAutomationHarness } from './support/automation-harness.mjs';

// Phase 5 (Brandon, October 2026): zone fields (label, difficult terrain, tag, how long it lasts, ask before it
// ends), immunity "all" / stacking on the condition, the invisible and concealed conditions. Limits are JSON fields.

test('persistent zones: label, difficult terrain, tag, lasting until the end of the encounter or round', async () => {
  const harness = await createAbilityAutomationHarness();
  try {
    const zone = (extra) => harness.validateAutomation({ schema: 'ability-automation/v3', cards: [
      { type: 'target', name: 'area', mode: 'area', shape: 'cube', size: 3 },
      { type: 'persistent', target: 'area', tickAt: 'never', triggers: ['onEnter', 'onOccupantTurnStart'], effects: [{ kind: 'damage', amount: 3, damageType: 'fire' }], ...extra },
    ] }, { strict: false }).normalized.cards[1];
    let block = zone({ label: 'Burning ground', difficultTerrain: true, tag: 'Fire', expires: 'endOfEncounter' });
    assert.deepEqual([block.label, block.terrainCost, block.tag, block.expires.event, block.expiresAt], ['Burning ground', 2, 'fire', 'combatEnd', 'never']);
    assert.equal(block.askBeforeEnd, undefined, 'asks by default');
    block = zone({ expiresAt: 'endOfRound', difficultTerrain: 3, askBeforeEnd: false });
    assert.deepEqual([block.expires.event, block.expiresAt, block.terrainCost, block.askBeforeEnd], ['roundEnd', 'never', 3, false]);
    block = zone({ expires: { event: 'roundEnd', count: 2 } });
    assert.deepEqual([block.expires.event, block.expires.count], ['roundEnd', 2]);
    block = zone({ expires: 'endOfTurn' });
    assert.deepEqual([block.expiresAt, block.expires], ['endOfTurn', undefined]);
  } finally { harness.close(); }
});

test('conditions: immunity "all" and stacking; invisible and concealed', async () => {
  const harness = await createAbilityAutomationHarness();
  try {
    const { normalized, issues } = harness.validateAutomation({ schema: 'ability-automation/v3', cards: [{ type: 'effect', effects: [
      { kind: 'condition', name: 'damageImmunity', amount: 'all', damageType: 'poison' },
      { kind: 'condition', name: 'damageImmunity', amount: 2, damageType: 'fire', stacks: true },
      { kind: 'condition', name: 'Invisible', duration: 'endOfTurn' },
      { kind: 'condition', name: 'concealed', duration: 'endOfTurn' },
    ] }] }, { strict: false });
    assert.ok(!issues.length, issues.join(' | '));
    const [all, stacking, invisible, concealed] = normalized.cards[0].effects;
    assert.deepEqual([all.amount, stacking.amount, stacking.stacks], ['all', 2, true]);
    assert.deepEqual([invisible.name, concealed.name], ['invisible', 'concealed']);
  } finally { harness.close(); }
});
