import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createAbilityAutomationHarness } from './support/automation-harness.mjs';

// A creature whose strike hits harder while it is winded, as the creature files declare it.
const automation = {
  schema: 'ability-automation/v3',
  keywords: ['Melee', 'Strike', 'Weapon'],
  cards: [
    { type: 'target', name: 'primary', mode: 'token', predicate: 'enemy', count: { value: 1, mode: 'exact' } },
    { type: 'powerRoll', flatBonus: 2, target: 'primary',
      tiers: {
        tier1: { effects: [{ kind: 'damage', amount: 4 }] },
        tier2: { effects: [{ kind: 'damage', amount: 6 }] },
        tier3: { effects: [{ kind: 'damage', amount: 8 }] },
      },
      whenWinded: { tiers: {
        tier1: { effects: [{ kind: 'damage', amount: 7 }] },
        tier2: { effects: [{ kind: 'damage', amount: 9 }] },
        tier3: { effects: [{ kind: 'damage', amount: 11 }] },
      } },
    },
  ],
};
const damage = async (winded) => {
  const harness = await createAbilityAutomationHarness();
  try {
    const result = await harness.runAutomation({ automation, winded, targetSelections: [{ id: 'cal', name: 'Cal' }], randomValues: [0.5, 0.5] });
    return result.calls.applyDamage.at(-1).amount;
  } finally {
    harness.close();
  }
};

test('a whenWinded override is used exactly when the host says the creature is winded', async () => {
  const fresh = await damage(false);
  const winded = await damage(true);
  assert.equal(winded, fresh + 3);
});
