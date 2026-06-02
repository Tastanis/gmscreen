import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createAbilityAutomationHarness } from './support/automation-harness.mjs';

test('validation exposes schema warnings and unsupported extra fields', async () => {
  const harness = await createAbilityAutomationHarness();
  try {
    const { issues, normalized } = harness.validateAutomation({
      schema: 'ability-automation/v3',
      cards: [
        {
          type: 'effect',
          id: 'effect-1',
          target: 'primary',
          mysteryBlockField: true,
          effects: [
            { kind: 'damage', amount: 3, damageType: 'radiant', madeUpEffectField: 1 },
            { kind: 'explode', amount: 99 },
          ],
        },
      ],
    }, { strict: false });

    assert.ok(issues.some((issue) => issue.includes('damage type "radiant" not in registry')));
    assert.ok(issues.some((issue) => issue.includes('unknown effect kind "explode"')));
    assert.ok(issues.some((issue) => issue.includes('mysteryBlockField')));
    assert.ok(issues.some((issue) => issue.includes('madeUpEffectField')));
    assert.equal(normalized.cards[0].effects[1].kind, 'note');
  } finally {
    harness.close();
  }
});

test('runner prompts for a target, accepts a power roll, and applies tier damage to that token', async () => {
  const harness = await createAbilityAutomationHarness({
    attributes: { Might: 2 },
    targets: [
      { id: 'enemy-1', name: 'Iron Imp' },
    ],
  });
  try {
    const automation = {
      schema: 'ability-automation/v3',
      cards: [
        {
          type: 'target',
          id: 'target-primary',
          name: 'primary',
          mode: 'token',
          predicate: 'enemy',
          count: { value: 1, mode: 'exact' },
          distance: { form: 'ranged', value: 5 },
        },
        {
          type: 'powerRoll',
          id: 'roll-strike',
          attribute: 'Might',
          target: 'primary',
          tiers: {
            tier1: { effects: [{ kind: 'damage', amount: 3, attribute: 'M', damageType: 'fire' }] },
            tier2: { effects: [{ kind: 'damage', amount: 6, attribute: 'M', damageType: 'fire' }] },
            tier3: { effects: [{ kind: 'damage', amount: 9, attribute: 'M', damageType: 'fire' }] },
          },
        },
      ],
    };

    const result = await harness.runAutomation({
      automation,
      action: { id: 'test-strike', name: 'Test Strike', actionLabel: 'Main Action' },
      targetSelections: [{ id: 'enemy-1', name: 'Iron Imp' }],
      // 6 + 6 on 2d10, plus Might 2 = 14, which is tier 2.
      randomValues: [0.5, 0.5],
    });

    assert.equal(result.calls.selectTarget.length, 1);
    assert.equal(result.calls.selectTarget[0].predicate, 'enemy');
    assert.equal(result.calls.applyDamage.length, 1);
    assert.deepEqual(result.calls.applyDamage[0], {
      placementId: 'enemy-1',
      sourceId: 'caster-1',
      amount: 8,
      damageType: 'fire',
      abilityName: 'Test Strike',
      actionId: 'test-strike',
      actionKind: 'main',
      cost: '',
      keywords: [],
    });
    assert.ok(result.calls.fireTriggerEvent.some((event) => event.eventType === 'powerRoll'));
  } finally {
    harness.close();
  }
});

test('runner can arm a structured trigger and resolve it from a captured trigger payload', async () => {
  const harness = await createAbilityAutomationHarness();
  try {
    const automation = {
      schema: 'ability-automation/v3',
      cards: [
        {
          type: 'trigger',
          id: 'trigger-half-damage',
          condition: 'You take damage.',
          match: { event: 'damage', filter: { whose: 'self' } },
          effects: [
            { kind: 'halveTriggeringDamage', rounding: 'up' },
          ],
        },
      ],
    };

    const armed = await harness.runAutomation({
      automation,
      action: { id: 'half-damage', name: 'Half Damage', actionLabel: 'Triggered Action' },
      actionType: 'triggered',
    });

    assert.equal(armed.calls.registerTrigger.length, 1);
    assert.equal(armed.calls.registerTrigger[0].casterId, 'caster-1');
    assert.equal(armed.calls.registerTrigger[0].match.event, 'damage');
    assert.equal(armed.calls.applyHeal.length, 0);

    const resolved = await harness.runAutomation({
      automation,
      action: { id: 'half-damage', name: 'Half Damage', actionLabel: 'Triggered Action' },
      actionType: 'triggered',
      triggerPayload: {
        eventType: 'damage',
        payload: {
          placementId: 'caster-1',
          sourceId: 'enemy-1',
          amount: 11,
          damageType: 'corruption',
        },
      },
    });

    assert.equal(resolved.calls.applyHeal.length, 1);
    assert.deepEqual(resolved.calls.applyHeal[0], {
      placementId: 'caster-1',
      amount: 5,
      allowTempHp: false,
      abilityName: 'Half Damage',
    });
  } finally {
    harness.close();
  }
});

test('runner forwards structured trigger lifetime metadata', async () => {
  const harness = await createAbilityAutomationHarness();
  try {
    const automation = {
      schema: 'ability-automation/v3',
      cards: [
        {
          type: 'trigger',
          condition: 'The target moves before the end of your next turn.',
          match: { event: 'move', filter: { whose: 'target', minDistance: 1 } },
          target: 'primary',
          expires: { event: 'turnEnd', whose: 'self', count: 1, skipCurrent: true },
          effects: [
            { kind: 'damage', amount: 1, damageType: 'psychic' },
          ],
        },
      ],
    };

    const result = await harness.runAutomation({
      automation,
      action: { id: 'thorn-foot', name: 'Thorn Foot', actionLabel: 'Main Action' },
    });

    assert.equal(result.calls.registerTrigger.length, 1);
    assert.deepEqual(result.calls.registerTrigger[0].expires, {
      event: 'turnEnd',
      whose: 'self',
      count: 1,
      skipCurrent: true,
    });
  } finally {
    harness.close();
  }
});
