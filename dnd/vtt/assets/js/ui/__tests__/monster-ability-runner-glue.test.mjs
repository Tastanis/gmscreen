import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../monster-ability-runner-glue.js', import.meta.url), 'utf8');

function createRuntime({ runnerResult } = {}) {
  const spends = [];
  const refunds = [];
  const openCalls = [];
  let malice = 10;
  const window = {
    confirm: () => true,
    UIKit: { confirm: async () => true },
    MaliceTracker: {
      get: () => malice,
      spend: (amount) => { spends.push(amount); malice -= amount; },
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
