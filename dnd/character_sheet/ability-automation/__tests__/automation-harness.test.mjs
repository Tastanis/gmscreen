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

test('validation normalizes top-level usage limits', async () => {
  const harness = await createAbilityAutomationHarness();
  try {
    const { issues, normalized } = harness.validateAutomation({
      schema: 'ability-automation/v3',
      usageLimit: {
        scope: 'round',
        key: 'hesitation-is-weakness',
        target: 'self',
        message: 'Hesitation Is Weakness can only be used once per round.',
      },
      cards: [],
    }, { strict: false });

    assert.deepEqual(issues, []);
    assert.deepEqual(normalized.usageLimit, {
      scope: 'round',
      key: 'hesitation-is-weakness',
      source: 'self',
      target: 'self',
      message: 'Hesitation Is Weakness can only be used once per round.',
    });
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

test('runner can spend the caster recovery and heal a different target', async () => {
  const harness = await createAbilityAutomationHarness({
    targets: [
      { id: 'ally-1', name: 'Ally' },
    ],
    sourcePlacement: { id: 'caster-1', name: 'Cal' },
  });
  try {
    const automation = {
      schema: 'ability-automation/v3',
      cards: [
        {
          type: 'target',
          id: 'target-heal',
          name: 'healTarget',
          mode: 'token',
          predicate: 'selfOrAlly',
          count: { value: 1, mode: 'exact' },
          distance: { form: 'ranged', value: 10 },
        },
        {
          type: 'effect',
          target: 'healTarget',
          effects: [
            { kind: 'heal', recoveries: 1, recoverySource: 'self' },
          ],
        },
      ],
    };

    const result = await harness.runAutomation({
      automation,
      action: { id: 'morelia', name: 'Morelia Punish and Defend', actionLabel: 'Main Action' },
      targetSelections: [{ id: 'ally-1', name: 'Ally' }],
      spendRecoveryResults: [{ spent: 1, recoveryValue: 31, currentRecoveries: 13, name: 'Cal' }],
    });

    assert.deepEqual(result.calls.spendRecoveryForTarget, [
      {
        placementId: 'caster-1',
        recoveries: 1,
        abilityName: 'Morelia Punish and Defend',
      },
    ]);
    assert.deepEqual(result.calls.applyHeal, [
      {
        placementId: 'ally-1',
        amount: 31,
        allowTempHp: false,
        abilityName: 'Morelia Punish and Defend',
      },
    ]);
  } finally {
    harness.close();
  }
});

test('runner forwards triggerable aura automation to the board', async () => {
  const harness = await createAbilityAutomationHarness({
    attributes: { Presence: 3 },
    sourcePlacement: { id: 'caster-1', name: 'Cal' },
  });
  try {
    const automation = {
      schema: 'ability-automation/v3',
      cards: [
        {
          type: 'effect',
          target: 'self',
          effects: [
            {
              kind: 'aura',
              radius: 3,
              color: '#facc15',
              affects: 'selfAndAlly',
              triggers: [
                { event: 'turnEnd', whose: 'self' },
                { event: 'actionUsed', filter: { whose: 'occupant', keywordsAny: ['Strike'] }, target: 'eventActor' },
              ],
              effects: [{ kind: 'surgeGain', amount: 1 }],
              expires: { event: 'combatEnd', whose: 'any', count: 1 },
            },
          ],
        },
      ],
    };

    const result = await harness.runAutomation({
      automation,
      action: { id: 'blessing-faithful', name: 'Blessing of the Faithful', actionLabel: 'Maneuver' },
    });

    assert.equal(result.calls.setAura.length, 1);
    assert.equal(result.calls.setAura[0].placementId, 'caster-1');
    assert.equal(result.calls.setAura[0].radius, 3);
    assert.deepEqual(result.calls.setAura[0].automation.triggers, [
      { event: 'turnEnd', whose: 'self' },
      { event: 'actionUsed', whose: 'occupant', target: 'eventActor', filter: { keywordsAny: ['Strike'] } },
    ]);
    assert.deepEqual(result.calls.setAura[0].automation.effects, [{ kind: 'surgeGain', amount: 1 }]);
    assert.equal(result.calls.setAura[0].automation.attributeBonuses.Presence, 3);
  } finally {
    harness.close();
  }
});

test('runner applies numeric damage weakness from a failed potency rider', async () => {
  const harness = await createAbilityAutomationHarness({
    attributes: { Might: 3 },
    hero: { name: 'Cal', stats: { might: 3, agility: -1, reason: 2, intuition: -1, presence: 3 } },
    targets: [
      { id: 'enemy-1', name: 'Enemy' },
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
          predicate: 'creature',
          count: { value: 1, mode: 'exact' },
          distance: { form: 'meleeOrRanged', value: 1, secondary: 5 },
        },
        {
          type: 'powerRoll',
          id: 'roll-purifying-fire',
          attribute: 'Might',
          target: 'primary',
          tiers: {
            tier1: {
              effects: [
                { kind: 'damage', amount: 7, attribute: 'M', damageType: 'holy' },
                {
                  kind: 'potency',
                  attribute: 'M',
                  level: 'weak',
                  onFail: [
                    { kind: 'condition', name: 'damageWeakness', amount: 3, damageType: 'fire', duration: 'saveEnds' },
                  ],
                },
              ],
            },
          },
        },
      ],
    };

    const result = await harness.runAutomation({
      automation,
      action: { id: 'purifying-fire', name: 'Purifying Fire', actionLabel: 'Main Action' },
      targetSelections: [{ id: 'enemy-1', name: 'Enemy' }],
      powerRollTiers: ['tier1'],
      checkPotencyResults: [{ passes: true, threshold: 1, attributeValue: 0 }],
    });

    assert.deepEqual(result.calls.applyCondition, [
      {
        placementId: 'enemy-1',
        condition: {
          name: 'damageWeakness',
          duration: 'save-ends',
          amount: 3,
          damageType: 'fire',
        },
        sourceId: 'caster-1',
        sourceName: 'Cal',
      },
    ]);
  } finally {
    harness.close();
  }
});

test('runner dispatches floating text automation effects', async () => {
  const harness = await createAbilityAutomationHarness();
  try {
    const result = await harness.runAutomation({
      automation: {
        schema: 'ability-automation/v3',
        version: 3,
        cards: [
          {
            type: 'effect',
            id: 'banner',
            effects: [
              { kind: 'floatingText', text: 'HESITATION IS WEAKNESS!', audience: 'all', tone: 'danger' },
            ],
          },
        ],
      },
    });

    assert.deepEqual(result.calls.showFloatingText[0], {
      text: 'HESITATION IS WEAKNESS!',
      audience: 'all',
      tone: 'danger',
      sourceId: 'caster-1',
      sourceName: 'Harness Hero',
      abilityName: 'Ability Under Test',
      actionId: 'ability-under-test',
    });
  } finally {
    harness.close();
  }
});

test('runner preflights startTurn before spending ability resource', async () => {
  const harness = await createAbilityAutomationHarness();
  try {
    const result = await harness.runAutomation({
      automation: {
        schema: 'ability-automation/v3',
        version: 3,
        cards: [
          {
            type: 'effect',
            id: 'claim-turn',
            target: 'self',
            effects: [
              { kind: 'startTurn', target: 'self', condition: 'enemyPickNoActive' },
            ],
          },
        ],
      },
      action: { id: 'hesitation', name: 'Hesitation Is Weakness', cost: '1 Insight' },
    });

    assert.equal(result.calls.startTurn.length, 2);
    assert.equal(result.calls.startTurn[0].preflight, true);
    assert.equal(result.calls.spendResource.length, 1);
    assert.equal(result.calls.startTurn[1].preflightAccepted, true);
    assert.ok(
      result.callLog.findIndex((entry) => entry.name === 'startTurn' && entry.payload.preflight === true) <
        result.callLog.findIndex((entry) => entry.name === 'spendResource')
    );
  } finally {
    harness.close();
  }
});

test('runner applies double edge and double bane as tier shifts without +/-2 bonus', async () => {
  const harness = await createAbilityAutomationHarness();
  try {
    const { getEdgeState, getActiveEdgeControl } = harness.window.AbilityAutomationRunner.__testing;
    assert.deepEqual(
      getEdgeState(2, 0),
      { edge: 2, bane: 0, net: 2, bonus: 0, tierShift: 1, label: 'Double Edge (tier up)' }
    );
    assert.deepEqual(
      getEdgeState(0, 2),
      { edge: 0, bane: 2, net: -2, bonus: 0, tierShift: -1, label: 'Double Bane (tier down)' }
    );
    assert.deepEqual(
      getEdgeState(2, 1),
      { edge: 2, bane: 1, net: 1, bonus: 2, tierShift: 0, label: 'Edge (+2)' }
    );
    assert.deepEqual(
      getEdgeState(1, 2),
      { edge: 1, bane: 2, net: -1, bonus: -2, tierShift: 0, label: 'Bane (-2)' }
    );
    assert.deepEqual(getActiveEdgeControl(getEdgeState(2, 0)), { kind: 'edge', count: 2 });
    assert.deepEqual(getActiveEdgeControl(getEdgeState(2, 1)), { kind: 'edge', count: 1 });
    assert.deepEqual(getActiveEdgeControl(getEdgeState(1, 2)), { kind: 'bane', count: 1 });
    assert.deepEqual(getActiveEdgeControl(getEdgeState(0, 2)), { kind: 'bane', count: 2 });
    assert.equal(getActiveEdgeControl(getEdgeState(1, 1)), null);
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
