import assert from 'node:assert/strict';
import test from 'node:test';
import { createAbilityAutomationHarness } from './support/automation-harness.mjs';

function powerRoll(id = 'roll-1') {
  return {
    type: 'powerRoll',
    id,
    attribute: 'Agility',
    target: 'self',
    tiers: {
      tier1: { effects: [] },
      tier2: { effects: [] },
      tier3: { effects: [] },
    },
  };
}

test('enabled Shadow resource refunds one Insight after an accepted edge roll', async () => {
  const harness = await createAbilityAutomationHarness();
  try {
    const result = await harness.runAutomation({
      hero: {
        name: 'Sharon',
        resource: {
          title: 'Insight',
          value: 7,
          discountOnPowerRollEdge: true,
        },
      },
      action: { id: 'get-in-get-out', name: 'Get In Get Out', cost: '3 Insight' },
      automation: { schema: 'ability-automation/v3', cards: [powerRoll()] },
      spendResourceResults: [{ spent: 3, resource: 'Insight', remaining: 4 }],
      powerRollEdges: [1],
      powerRollTiers: ['tier2'],
    });

    assert.equal(result.calls.spendResource.length, 1);
    assert.deepEqual(result.calls.applyResourceGain, [{
      amount: 1,
      resource: 'Insight',
      abilityName: 'Get In Get Out',
      reason: 'powerRollEdgeCostDiscount',
    }]);
    assert.ok(
      result.callLog.findIndex((entry) => entry.name === 'applyResourceGain')
        > result.callLog.findIndex((entry) => entry.name === 'spendResource'),
      'refund happens after the initial cost spend'
    );
  } finally {
    harness.close();
  }
});

test('double edge qualifies, but multiple qualifying rolls refund only once', async () => {
  const harness = await createAbilityAutomationHarness();
  try {
    const result = await harness.runAutomation({
      hero: {
        name: 'Sharon',
        resource: {
          title: 'Insight',
          value: 9,
          discountOnPowerRollEdge: true,
        },
      },
      action: { id: 'multi-roll', name: 'Multi Roll', cost: '5 Insight' },
      automation: {
        schema: 'ability-automation/v3',
        cards: [powerRoll('roll-1'), powerRoll('roll-2')],
      },
      spendResourceResults: [{ spent: 5, resource: 'Insight', remaining: 4 }],
      powerRollEdges: [2, 1],
      powerRollTiers: ['tier3', 'tier2'],
    });
    assert.equal(result.calls.applyResourceGain.length, 1);
  } finally {
    harness.close();
  }
});

test('normal roll, disabled toggle, and zero resource spend do not create a refund', async () => {
  const cases = [
    {
      hero: { name: 'Sharon', resource: { title: 'Insight', value: 7, discountOnPowerRollEdge: true } },
      powerRollEdges: [0],
      spendResourceResults: [{ spent: 3, resource: 'Insight', remaining: 4 }],
    },
    {
      hero: { name: 'Sharon', resource: { title: 'Insight', value: 7, discountOnPowerRollEdge: false } },
      powerRollEdges: [1],
      spendResourceResults: [{ spent: 3, resource: 'Insight', remaining: 4 }],
    },
    {
      hero: { name: 'Sharon', resource: { title: 'Insight', value: 0, discountOnPowerRollEdge: true } },
      powerRollEdges: [1],
      spendResourceResults: [{ spent: 0, resource: 'Insight', remaining: 0 }],
    },
  ];
  for (const entry of cases) {
    const harness = await createAbilityAutomationHarness();
    try {
      const result = await harness.runAutomation({
        ...entry,
        action: { id: 'test-ability', name: 'Test Ability', cost: '3 Insight' },
        automation: { schema: 'ability-automation/v3', cards: [powerRoll()] },
        powerRollTiers: ['tier2'],
      });
      assert.equal(result.calls.applyResourceGain.length, 0);
    } finally {
      harness.close();
    }
  }
});
