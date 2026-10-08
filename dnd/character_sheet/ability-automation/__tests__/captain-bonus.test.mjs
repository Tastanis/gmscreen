import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createAbilityAutomationHarness } from './support/automation-harness.mjs';
import { captainBonusFor, captainFeature } from '../../../vtt/assets/js/ui/minion-squads.mjs';

// A squad of two ghouls led by a Packmaster, as the board stores it.
const squad = { id: 'pm::ghoul', monsterId: 'ghoul', representativeId: 'pm', perMinionStamina: 8, maxPool: 16, initialMemberCount: 2, captainId: 'pm', withCaptain: '+1 damage bonus on strikes and +2 bonus to ranged distance' };
const scene = (captainStamina) => [
  { id: 'pm', name: 'Ghoul Packmaster', hp: { current: String(captainStamina), max: '40' }, monster: { id: 'packmaster', role: 'Horde Harrier' } },
  { id: 'g1', name: 'Sluice Ghoul', hp: { current: '16', max: '16' }, monster: { id: 'ghoul', role: 'Minion Harrier' }, squad },
  { id: 'g2', name: 'Sluice Ghoul', hp: { current: '16', max: '16' }, monster: { id: 'ghoul', role: 'Minion Harrier' }, squad },
];
const strike = (keywords, distance) => ({
  schema: 'ability-automation/v3',
  keywords,
  cards: [
    { type: 'target', name: 'primary', mode: 'token', predicate: 'enemy', count: { value: 1, mode: 'exact' }, ...(distance ? { distance: { type: 'ranged', value: distance } } : {}) },
    { type: 'powerRoll', flatBonus: 2, target: 'primary', tiers: {
      tier1: { effects: [{ kind: 'damage', amount: 2 }] },
      tier2: { effects: [{ kind: 'damage', amount: 4 }] },
      tier3: { effects: [{ kind: 'damage', amount: 5 }] },
    } },
    { type: 'effect', target: 'primary', effects: [{ kind: 'damage', amount: 1, damageType: 'corruption' }] },
  ],
});
const run = async (automation, features) => {
  const harness = await createAbilityAutomationHarness();
  try {
    const result = await harness.runAutomation({ automation, features, targetSelections: [{ id: 'cal', name: 'Cal' }], randomValues: [0.5, 0.5] });
    return result.calls.applyDamage.map((call) => call.amount);
  } finally {
    harness.close();
  }
};

test('a led minion deals its captain bonus on a strike, on rolled damage only', async () => {
  const feature = captainFeature(captainBonusFor(scene(40), 'g1'));
  const plain = await run(strike(['Melee', 'Strike', 'Weapon']), []);
  const led = await run(strike(['Melee', 'Strike', 'Weapon']), [feature]);
  assert.equal(led[0], plain[0] + 1, 'the rolled damage is one higher');
  assert.equal(led[1], plain[1], 'the flat rider damage is untouched');
});

test('the bonus is gone when the captain is down, and never applies to an ability that is not a strike', async () => {
  assert.equal(captainBonusFor(scene(0), 'g1'), null);
  const feature = captainFeature(captainBonusFor(scene(40), 'g1'));
  const plain = await run(strike(['Area', 'Magic']), []);
  assert.deepEqual(await run(strike(['Area', 'Magic']), [feature]), plain);
});
