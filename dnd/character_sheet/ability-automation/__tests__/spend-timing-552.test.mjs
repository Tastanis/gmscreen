import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAbilityAutomationHarness } from './support/automation-harness.mjs';

// Build 552, Brandon (October 2026), of spend timing: "if you can just fix that, that'd be great". In an ability with a
// power roll, a "preRoll" spend is offered before the dice are rolled and the answer is used when the spend is
// reached; the same spend in each tier is asked once. "postResult" and abilities with no roll: as before.

const spend = (timing) => ({ kind: 'spend', resource: 'Wrath', amount: 1, timing, effects: [{ kind: 'damage', amount: 3 }] });
const rolled = (timing) => ({
  schema: 'ability-automation/v3',
  cards: [
    { type: 'target', name: 'target', count: 1 },
    { type: 'powerRoll', target: 'target', attribute: 'Might', tiers: {
      tier1: { effects: [{ kind: 'damage', amount: 2 }, spend(timing)] },
      tier2: { effects: [{ kind: 'damage', amount: 4 }, spend(timing)] },
      tier3: { effects: [{ kind: 'damage', amount: 6 }, spend(timing)] } } },
  ],
});

async function run(automation, spendHeroicResourceResults = []) {
  const harness = await createAbilityAutomationHarness();
  try {
    return await harness.runAutomation({ automation, powerRollTiers: ['tier2'], spendHeroicResourceResults, targetSelections: [{ id: 'target-1', name: 'Target One' }] });
  } finally { harness.close(); }
}
const order = (result) => result.callLog.map((entry) => entry.name).filter((hook) => ['spendHeroicResource', 'applyDamage'].includes(hook));

test('preRoll: asked once, before the roll; spent means its effects run when reached', async () => {
  const result = await run(rolled('preRoll'));
  assert.deepEqual(order(result), ['spendHeroicResource', 'applyDamage', 'applyDamage'], 'asked before any damage, once though it is in each tier');
  assert.deepEqual(result.calls.applyDamage.map((c) => c.amount), [4, 3]);
});

test('preRoll declined before the roll: its effects never run, and it is not asked again', async () => {
  const result = await run(rolled('preRoll'), [{ canceled: true }]);
  assert.equal(result.calls.spendHeroicResource.length, 1);
  assert.deepEqual(result.calls.applyDamage.map((c) => c.amount), [4]);
});

test('postResult: asked after the roll, as before; no roll: preRoll asked when reached', async () => {
  const post = await run(rolled('postResult'));
  assert.deepEqual(order(post), ['applyDamage', 'spendHeroicResource', 'applyDamage']);
  const noRoll = await run({ schema: 'ability-automation/v3', cards: [
    { type: 'target', name: 'target', count: 1 },
    { type: 'effect', target: 'target', effects: [{ kind: 'damage', amount: 1 }, spend('preRoll')] }] });
  assert.deepEqual(order(noRoll), ['applyDamage', 'spendHeroicResource', 'applyDamage']);
});
