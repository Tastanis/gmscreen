import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runAbilityScenario } from './support/ability-scenario-runner.mjs';

const judgmentWrathMeleeDamageTaunt = {
  fields: {
    name: 'Judgment - Wrath: Melee Damage Taunt',
    actionLabel: 'Free Triggered Action',
    keywords: 'FreeTriggered',
    cost: '1 Wrath',
    trigger: 'You damage a creature judged by you with a melee ability.',
    description: 'If you damage a creature judged by you with a melee ability, the creature is taunted by you until the end of their next turn.',
  },
  automation: {
    schema: 'ability-automation/v3',
    keywords: ['FreeTriggered'],
    cards: [
      {
        type: 'trigger',
        id: 'judgment-wrath-melee-damage-taunt',
        condition: 'You damage a creature judged by you with a melee ability.',
        match: {
          event: 'damageDealt',
          filter: {
            whose: 'self',
            targetWhose: 'judgedTarget',
            minAmount: 1,
            keywordsAny: ['Melee'],
          },
        },
        effectTarget: 'eventTarget',
        effects: [
          {
            kind: 'condition',
            name: 'taunted',
            duration: 'endOfTurn',
            text: 'Taunted by you until the end of their next turn.',
          },
        ],
      },
    ],
  },
};

const baseScenario = {
  caster: 'caster-1',
  tokens: [
    { id: 'caster-1', name: 'Censor', team: 'heroes' },
    { id: 'ally-1', name: 'Ally', team: 'heroes' },
    { id: 'enemy-1', name: 'Judged Enemy', team: 'monsters' },
    { id: 'enemy-2', name: 'Other Enemy', team: 'monsters' },
  ],
  marks: [
    { type: 'judgment', sourceId: 'caster-1', targetId: 'enemy-1' },
  ],
};

function damageDealtPayload(overrides = {}) {
  return {
    sourceId: 'caster-1',
    actorId: 'caster-1',
    placementId: 'enemy-1',
    targetId: 'enemy-1',
    amount: 5,
    damageType: 'holy',
    abilityName: 'Test Melee Strike',
    actionId: 'test-melee-strike',
    actionKind: 'main',
    keywords: ['Melee', 'Strike', 'Weapon'],
    ...overrides,
  };
}

test('ability scenario runner: Judgment/Wrath registers and resolves melee damage against judged target', async () => {
  const result = await runAbilityScenario({
    ability: judgmentWrathMeleeDamageTaunt,
    scenario: {
      ...baseScenario,
      event: {
        type: 'damageDealt',
        payload: damageDealtPayload(),
      },
    },
  });

  assert.deepEqual(result.validation.issues, []);
  assert.equal(result.registeredTriggers.length, 1);
  assert.equal(result.registeredTriggers[0].match.event, 'damageDealt');
  assert.deepEqual(result.registeredTriggers[0].match.filter, {
    whose: 'self',
    targetWhose: 'judgedTarget',
    minAmount: 1,
    keywordsAny: ['Melee'],
  });
  assert.equal(result.ready.length, 1);
  assert.equal(result.ready[0].placementId, 'caster-1');
  assert.equal(result.ready[0].abilityId, 'Judgment - Wrath: Melee Damage Taunt');
  assert.equal(result.ready[0].payload.targetId, 'enemy-1');

  const conditionCalls = result.resolved.calls.applyCondition;
  assert.equal(conditionCalls.length, 1);
  assert.deepEqual(conditionCalls[0], {
    placementId: 'enemy-1',
    condition: {
      name: 'taunted',
      duration: 'end-of-turn',
    },
    sourceId: 'caster-1',
  });
});

test('ability scenario runner: Judgment/Wrath does not fire for non-judged target', async () => {
  const result = await runAbilityScenario({
    ability: judgmentWrathMeleeDamageTaunt,
    scenario: {
      ...baseScenario,
      event: {
        type: 'damageDealt',
        payload: damageDealtPayload({
          placementId: 'enemy-2',
          targetId: 'enemy-2',
        }),
      },
    },
  });

  assert.equal(result.ready.length, 0);
  assert.equal(result.calls.applyCondition.length, 0);
});

test('ability scenario runner: Judgment/Wrath does not fire for non-melee damage', async () => {
  const result = await runAbilityScenario({
    ability: judgmentWrathMeleeDamageTaunt,
    scenario: {
      ...baseScenario,
      event: {
        type: 'damageDealt',
        payload: damageDealtPayload({ keywords: ['Ranged', 'Strike', 'Weapon'] }),
      },
    },
  });

  assert.equal(result.ready.length, 0);
  assert.equal(result.calls.applyCondition.length, 0);
});

test('ability scenario runner: Judgment/Wrath does not fire for zero damage', async () => {
  const result = await runAbilityScenario({
    ability: judgmentWrathMeleeDamageTaunt,
    scenario: {
      ...baseScenario,
      event: {
        type: 'damageDealt',
        payload: damageDealtPayload({ amount: 0 }),
      },
    },
  });

  assert.equal(result.ready.length, 0);
  assert.equal(result.calls.applyCondition.length, 0);
});

test('ability scenario runner: Judgment/Wrath does not fire when another actor deals the damage', async () => {
  const result = await runAbilityScenario({
    ability: judgmentWrathMeleeDamageTaunt,
    scenario: {
      ...baseScenario,
      event: {
        type: 'damageDealt',
        payload: damageDealtPayload({
          sourceId: 'ally-1',
          actorId: 'ally-1',
        }),
      },
    },
  });

  assert.equal(result.ready.length, 0);
  assert.equal(result.calls.applyCondition.length, 0);
});
