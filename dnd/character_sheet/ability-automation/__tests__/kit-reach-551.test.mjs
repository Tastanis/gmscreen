import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAbilityAutomationHarness } from './support/automation-harness.mjs';

// Build 551, Brandon (October 2026), of a kit's melee damage bonus: "it should only apply if it's at short range".
// A modifier with `match.reach: "melee"` adds its bonus only to a target within the ability's melee distance, judged
// per target when the damage lands; `"ranged"` only beyond it. Without `reach` a kit works as before.

const ability = {
  schema: 'ability-automation/v3',
  keywords: ['Magic', 'Melee', 'Ranged', 'Strike', 'Weapon'],
  cards: [
    { type: 'target', name: 'target', count: 1, distance: { form: 'meleeOrRanged', value: 1, secondary: 5 } },
    { type: 'powerRoll', target: 'target', attribute: 'Might', tiers: {
      tier1: { effects: [{ kind: 'damage', amount: 5, damageType: 'holy' }] }, tier2: { effects: [] }, tier3: { effects: [] } } },
  ],
};
const kit = (reach) => ({ title: 'Shining Armor Kit', automation: { schema: 'ability-automation/v3', modifiers: [
  { match: { keywordsAll: ['Melee', 'Weapon'], ...(reach ? { reach } : {}) }, apply: { damageBonus: 2 }, label: 'Shining Armor' }] } });

async function damageAt(squares, reach) {
  const harness = await createAbilityAutomationHarness();
  try {
    const result = await harness.runAutomation({
      automation: ability, features: [kit(reach)], powerRollTiers: ['tier1'],
      targetSelections: [{ id: 'target-1', name: 'Target One' }],
      contextOverrides: { getDistanceBetween: () => squares },
    });
    return result.calls.applyDamage[0].amount;
  } finally { harness.close(); }
}

test('reach "melee": the kit bonus in melee only', async () => {
  assert.equal(await damageAt(1, 'melee'), 7, 'adjacent: 5 + 2');
  assert.equal(await damageAt(5, 'melee'), 5, 'at range: no kit bonus');
  assert.equal(await damageAt(null, 'melee'), 7, "distance can't be told: as before");
});

test('reach "ranged": only beyond melee; no reach: as before, at any distance', async () => {
  assert.equal(await damageAt(1, 'ranged'), 5);
  assert.equal(await damageAt(5, 'ranged'), 7);
  assert.equal(await damageAt(1, ''), 7);
  assert.equal(await damageAt(5, ''), 7);
});

test('the paste box keeps reach, and warns about a value it does not know', async () => {
  const harness = await createAbilityAutomationHarness();
  try {
    const S = harness.window.AbilityAutomationSchema;
    assert.equal(S.normalizeAutomation(kit('melee').automation).modifiers[0].match.reach, 'melee');
    const odd = S.normalizeAutomation(kit('close').automation);
    assert.equal(odd.modifiers[0].match.reach, undefined);
    assert.ok(odd.warnings.some((w) => /reach: "close" is not melee or ranged/.test(w)));
  } finally { harness.close(); }
});
