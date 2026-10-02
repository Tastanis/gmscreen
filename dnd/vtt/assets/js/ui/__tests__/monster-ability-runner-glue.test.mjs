import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../monster-ability-runner-glue.js', import.meta.url), 'utf8');

function createRuntime({ runnerResult, initialMalice = 10 } = {}) {
  const spends = [];
  const refunds = [];
  const openCalls = [];
  let malice = initialMalice;
  const window = {
    confirm: () => true,
    UIKit: { confirm: async () => true },
    MaliceTracker: {
      get: () => malice,
      spend: (amount) => { const spent = Math.min(amount, malice); if (spent > 0) spends.push(spent); malice -= spent; return { spent, remaining: malice }; },
      add: (amount) => { refunds.push(amount); malice += amount; },
    },
    AbilityAutomationRunner: {
      open: async (context) => {
        openCalls.push(context);
        if (runnerResult === 'refund') {
          await context.refundAbility({});
          return { aborted: true };
        }
        return { completed: true };
      },
    },
    VTTBoardCallbacks: {
      refundTriggeredAction: async () => ({ refunded: true }),
    },
  };
  vm.runInContext(source, vm.createContext({ window, console }));
  return { window, spends, refunds, openCalls, getMalice: () => malice };
}

test('Malice-costed monster triggered actions spend Malice when fired', async () => {
  const runtime = createRuntime();
  const result = await runtime.window.MonsterAbilityRunner.start(
    { name: 'Dean Embrose', attributes: {} },
    {
      name: 'You Must Have Confused Me with Someone Else',
      resource_cost: '2 Malice',
      automation: { schema: 'ability-automation/v3', cards: [{ type: 'effect', effects: [] }] },
    },
    'triggered_action',
    { id: 'embrose', hp: 650, maxHp: 650 },
  );

  assert.deepEqual(runtime.spends, [2]);
  assert.equal(runtime.getMalice(), 8);
  assert.equal(runtime.openCalls.length, 1);
  assert.equal(result.completed, true);
});

test('a canceled Malice-costed monster trigger refunds its exact spend', async () => {
  const runtime = createRuntime({ runnerResult: 'refund' });
  await runtime.window.MonsterAbilityRunner.start(
    { name: 'Dean Embrose', attributes: {} },
    {
      name: 'You Must Have Confused Me with Someone Else',
      resource_cost: '2 Malice',
      automation: { schema: 'ability-automation/v3', cards: [{ type: 'effect', effects: [] }] },
    },
    'triggered_action',
    { id: 'embrose', hp: 650, maxHp: 650 },
  );

  assert.deepEqual(runtime.spends, [2]);
  assert.deepEqual(runtime.refunds, [2]);
  assert.equal(runtime.getMalice(), 10);
});

test('canceling an over-budget monster ability restores only its actual Malice debit', async () => {
  const runtime = createRuntime({ runnerResult: 'refund', initialMalice: 2 });
  await runtime.window.MonsterAbilityRunner.start(
    { name: 'Goblin', attributes: {} },
    { name: 'Expensive attack', resource_cost: '5 Malice', automation: { schema: 'ability-automation/v3', cards: [{ type: 'effect', effects: [] }] } },
    'malice', { id: 'goblin' },
  );
  assert.deepEqual(runtime.spends, [2]);
  assert.deepEqual(runtime.refunds, [2]);
  assert.equal(runtime.openCalls[0].resourceReservation.maliceSpent, 2);
  assert.equal(runtime.getMalice(), 2);
});

test('an over-budget ability at zero Malice has no debit or refundable reservation', async () => {
  const runtime = createRuntime({ runnerResult: 'refund', initialMalice: 0 });
  await runtime.window.MonsterAbilityRunner.start(
    { name: 'Goblin', attributes: {} },
    { name: 'Expensive attack', resource_cost: '5 Malice', automation: { schema: 'ability-automation/v3', cards: [{ type: 'effect', effects: [] }] } },
    'malice', { id: 'goblin' },
  );
  assert.deepEqual(runtime.spends, []);
  assert.deepEqual(runtime.refunds, []);
  assert.equal(runtime.openCalls[0].resourceReservation.maliceSpent, 0);
  assert.equal(runtime.getMalice(), 0);
});

test('monster action events use canonical action kinds and initial costs are not spent twice', async () => {
  for (const [category, kind] of [['action', 'main'], ['maneuver', 'maneuver'], ['triggered_action', 'triggered'], ['villain_action', 'villain']]) {
    const runtime = createRuntime();
    await runtime.window.MonsterAbilityRunner.start({ name: 'Dummy' }, {
      name: 'Test', automation: { schema: 'ability-automation/v3', cards: [{ type: 'effect', effects: [] }] },
    }, category, { id: 'dummy' });
    const context = runtime.openCalls[0];
    assert.equal(context.action.actionKind, kind);
    assert.equal(context.spendResource(context.action).reason, 'handled-ability-cost');
    assert.deepEqual(runtime.spends, []);
  }
});
