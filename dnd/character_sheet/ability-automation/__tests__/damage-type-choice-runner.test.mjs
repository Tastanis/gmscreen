import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createAbilityAutomationHarness } from './support/automation-harness.mjs';

function targetThenEffects(effects, count = 1) {
  return {
    schema: 'ability-automation/v3',
    cards: [
      {
        type: 'target',
        id: 'targets',
        name: 'primary',
        mode: 'token',
        predicate: 'enemy',
        count: { value: count, mode: 'exact' },
      },
      { type: 'effect', id: 'effects', target: 'primary', effects },
    ],
  };
}

test('single damageType remains prompt-free', async () => {
  const harness = await createAbilityAutomationHarness();
  try {
    const result = await harness.runAutomation({
      automation: targetThenEffects([{ kind: 'damage', amount: 5, damageType: 'fire' }]),
    });
    assert.equal(result.calls.chooseDamageType.length, 0);
    assert.equal(result.calls.applyDamage[0].damageType, 'fire');
  } finally {
    harness.close();
  }
});

test('one selected type applies to every target and an immediately following weakness', async () => {
  const harness = await createAbilityAutomationHarness({
    targets: [
      { id: 'enemy-1', name: 'One' },
      { id: 'enemy-2', name: 'Two' },
    ],
  });
  try {
    const result = await harness.runAutomation({
      automation: targetThenEffects([
        { kind: 'damage', amount: 5, damageTypeOptions: ['acid', 'corruption', 'fire'] },
        { kind: 'condition', name: 'damageWeakness', amount: 5, duration: 'saveEnds' },
      ], 2),
      targetSelections: [
        { id: 'enemy-1', name: 'One' },
        { id: 'enemy-2', name: 'Two' },
      ],
      damageTypeChoices: ['corruption'],
    });

    assert.equal(result.calls.chooseDamageType.length, 1);
    assert.deepEqual(result.calls.chooseDamageType[0].options, ['acid', 'corruption', 'fire']);
    assert.equal(result.calls.applyDamage.length, 2);
    assert.ok(result.calls.applyDamage.every((payload) => payload.damageType === 'corruption'));
    assert.equal(result.calls.applyCondition.length, 2);
    assert.ok(result.calls.applyCondition.every((payload) => payload.condition.damageType === 'corruption'));
    assert.ok(result.calls.postChat.some((entry) => String(entry.message || '').includes('corruption damage')));
    assert.ok(result.calls.postChat.some((entry) => (
      String(entry.message || '').toLowerCase().includes('corruption')
      && String(entry.message || '').toLowerCase().includes('weakness')
    )));
  } finally {
    harness.close();
  }
});

test('a later untyped damage clears choice inheritance before a universal weakness', async () => {
  const harness = await createAbilityAutomationHarness();
  try {
    const result = await harness.runAutomation({
      automation: targetThenEffects([
        { kind: 'damage', amount: 5, damageTypeOptions: ['acid', 'fire'] },
        { kind: 'damage', amount: 1, damageType: 'untyped' },
        { kind: 'condition', name: 'damageWeakness', amount: 2, duration: 'saveEnds' },
      ]),
      damageTypeChoices: ['fire'],
    });

    assert.equal(result.calls.applyDamage[0].damageType, 'fire');
    assert.equal(result.calls.applyDamage[1].damageType, '');
    assert.equal(
      Object.hasOwn(result.calls.applyCondition[0].condition, 'damageType'),
      false,
      'legacy universal weakness must not inherit a stale earlier choice'
    );
  } finally {
    harness.close();
  }
});

test('canceling the type picker is preflight-safe and applies or spends nothing', async () => {
  const harness = await createAbilityAutomationHarness();
  try {
    const result = await harness.runAutomation({
      automation: targetThenEffects([
        { kind: 'damage', amount: 5, damageTypeOptions: ['acid', 'fire'] },
        { kind: 'condition', name: 'damageWeakness', amount: 5 },
      ]),
      damageTypeChoices: [null],
      action: { id: 'cancel-test', name: 'Cancel Test', cost: '3' },
    });
    assert.equal(result.calls.chooseDamageType.length, 1);
    assert.equal(result.calls.spendResource.length, 0);
    assert.equal(result.calls.applyDamage.length, 0);
    assert.equal(result.calls.applyCondition.length, 0);
    assert.equal(result.calls.fireTriggerEvent.length, 0);
  } finally {
    harness.close();
  }
});

test('separate damage effects with the same options each receive their own choice', async () => {
  const harness = await createAbilityAutomationHarness();
  try {
    const result = await harness.runAutomation({
      automation: targetThenEffects([
        { kind: 'damage', amount: 2, damageTypeOptions: ['acid', 'fire'] },
        { kind: 'damage', amount: 3, damageTypeOptions: ['acid', 'fire'] },
      ]),
      damageTypeChoices: ['acid', 'fire'],
    });
    assert.equal(result.calls.chooseDamageType.length, 2);
    assert.deepEqual(result.calls.applyDamage.map((payload) => payload.damageType), ['acid', 'fire']);
  } finally {
    harness.close();
  }
});

test('damage-type modifiers match the chosen option and do not buff other choices', async () => {
  const feature = {
    title: 'Acolyte of Fire',
    automation: {
      modifiers: [{
        match: { damageType: 'fire' },
        apply: { damageBonus: 1 },
      }],
    },
  };
  const automation = {
    schema: 'ability-automation/v3',
    cards: [
      {
        type: 'target',
        name: 'primary',
        mode: 'token',
        predicate: 'enemy',
        count: { value: 1, mode: 'exact' },
      },
      {
        type: 'powerRoll',
        attribute: 'Might',
        target: 'primary',
        tiers: {
          tier1: { effects: [{ kind: 'damage', amount: 3, damageTypeOptions: ['acid', 'fire'] }] },
          tier2: { effects: [{ kind: 'damage', amount: 6, damageTypeOptions: ['acid', 'fire'] }] },
          tier3: { effects: [{ kind: 'damage', amount: 9, damageTypeOptions: ['acid', 'fire'] }] },
        },
      },
    ],
  };
  const harness = await createAbilityAutomationHarness();
  try {
    const fire = await harness.runAutomation({
      automation,
      features: [feature],
      damageTypeChoices: ['fire'],
      randomValues: [0.5, 0.5],
    });
    const fireDamage = { ...fire.calls.applyDamage.at(-1) };
    const promptsAfterFire = fire.calls.chooseDamageType.length;
    const acid = await harness.runAutomation({
      automation,
      features: [feature],
      damageTypeChoices: ['acid'],
      randomValues: [0.5, 0.5],
    });
    assert.equal(fireDamage.damageType, 'fire');
    assert.equal(fireDamage.amount, 4);
    assert.equal(promptsAfterFire, 1, 'tier variants share one logical damage-type choice');
    assert.equal(acid.calls.applyDamage.at(-1).damageType, 'acid');
    assert.equal(acid.calls.applyDamage.at(-1).amount, 3);
  } finally {
    harness.close();
  }
});
