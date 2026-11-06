import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAbilityAutomationHarness } from './support/automation-harness.mjs';

// Impart Force (the Null): "for each square you push the target, they take 1 psychic damage" — counted from the squares
// the push really moved it (a wall or Stability can stop it short), not the distance written.
const impartForce = {
  schema: 'ability-automation/v3',
  cards: [
    { type: 'target', name: 'target', mode: 'token', predicate: 'creature', count: { value: 1, mode: 'exact' }, distance: { form: 'melee', value: 1 } },
    { type: 'powerRoll', attribute: 'Intuition', target: 'target', tiers: {
      tier1: { effects: [{ kind: 'forcedMovement', verb: 'push', distance: 3 }, { kind: 'damage', amount: 0, damageType: 'psychic', amountFrom: { source: 'pushedSquares' } }] },
      tier2: { effects: [{ kind: 'forcedMovement', verb: 'push', distance: 5 }, { kind: 'damage', amount: 0, damageType: 'psychic', amountFrom: { source: 'pushedSquares' } }] },
      tier3: { effects: [{ kind: 'forcedMovement', verb: 'push', distance: 7 }, { kind: 'damage', amount: 0, damageType: 'psychic', amountFrom: { source: 'pushedSquares' } }] },
    } },
  ],
};

test('damage per square pushed counts the squares the creature really moved', async () => {
  const harness = await createAbilityAutomationHarness({ attributes: { Intuition: 3 }, targets: [{ id: 'goblin', name: 'Goblin' }] });
  try {
    const result = await harness.runAutomation({
      automation: impartForce,
      action: { id: 'impart', name: 'Impart Force', actionLabel: 'Maneuver' },
      targetSelections: [{ id: 'goblin', name: 'Goblin' }],
      randomValues: [0.5, 0.5], // tier 2: push 5
      forceMove: (payload) => ({ name: 'Goblin', movedDistance: 2, stoppedBy: 'wall', slamDamage: 5 }), // a wall after 2
    });
    assert.equal(result.calls.forceMove[0].distance, 5);
    assert.equal(result.calls.applyDamage.length, 1);
    assert.equal(result.calls.applyDamage[0].amount, 2);
    assert.equal(result.calls.applyDamage[0].damageType, 'psychic');
    const moved = result.calls.fireTriggerEvent.find((event) => event.eventType === 'forcedMovement');
    assert.equal(moved.payload.movedDistance, 2);
    assert.equal(moved.payload.stoppedBy, 'wall');
    assert.equal(moved.payload.slamDamage, 5);
  } finally {
    harness.close();
  }
});

test('a push all taken by Stability is reported as resisted, and deals no per-square damage', async () => {
  const harness = await createAbilityAutomationHarness({ attributes: { Intuition: 3 }, targets: [{ id: 'ogre', name: 'Ogre' }] });
  try {
    const result = await harness.runAutomation({
      automation: impartForce,
      action: { id: 'impart', name: 'Impart Force', actionLabel: 'Maneuver' },
      targetSelections: [{ id: 'ogre', name: 'Ogre' }],
      randomValues: [0, 0], // tier 1: push 3
      forceMove: () => ({ name: 'Ogre', movedDistance: 0, resisted: true, stability: 3 }),
    });
    const moved = result.calls.fireTriggerEvent.find((event) => event.eventType === 'forcedMovement');
    assert.equal(moved.payload.resisted, true);
    assert.equal(moved.payload.movedDistance, 0);
    assert.equal(result.calls.applyDamage?.length || 0, 0);
    assert.ok(result.calls.postChat.some((entry) => /resists the push \(Stability 3\)/.test(entry.message)));
  } finally {
    harness.close();
  }
});
