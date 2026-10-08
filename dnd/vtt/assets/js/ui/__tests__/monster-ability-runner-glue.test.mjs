import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../monster-ability-runner-glue.js', import.meta.url), 'utf8');

function createRuntime({ runnerResult, initialMalice = 10, captainBonus } = {}) {
  const chat = [];
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
      ...(captainBonus !== undefined ? { getCaptainBonus: (placementId) => (typeof captainBonus === 'function' ? captainBonus(placementId) : captainBonus) } : {}),
    },
    dashboardChat: { sendMessage: (entry) => { chat.push(entry.message); return Promise.resolve(); } },
  };
  vm.runInContext(source, vm.createContext({ window, console }));
  return { window, spends, refunds, openCalls, chat, getMalice: () => malice };
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

const bite = { name: 'Rotting Bite', keywords: 'Melee, Strike, Weapon', automation: { schema: 'ability-automation/v3', cards: [{ type: 'effect', effects: [] }] } };
const ghoul = { name: 'Sluice Ghoul', attributes: {} };

test('a minion with a living captain hands the runner its "With Captain" bonus as a feature', async () => {
  const feature = { title: 'With Captain (Ghoul Packmaster)', automation: { modifiers: [{ match: { keywordsAny: ['Strike'] }, apply: { damageBonus: 1 } }] } };
  const asked = [];
  const runtime = createRuntime({ captainBonus: (placementId) => { asked.push(placementId); return { captainName: 'Ghoul Packmaster', text: '+1 damage bonus on strikes', strikeDamage: 1, manual: false, edgeOnStrikes: false, feature }; } });
  await runtime.window.MonsterAbilityRunner.start(ghoul, bite, 'action', { id: 'g1', hp: 32, maxHp: 32 });
  assert.deepEqual(asked, ['g1']);
  assert.deepEqual(JSON.parse(JSON.stringify(runtime.openCalls[0].features)), [feature]);
  assert.deepEqual(runtime.chat, [], 'a bonus the app applies needs no reminder');
});

test('the part of a "With Captain" line the app cannot apply is said in chat', async () => {
  const edge = createRuntime({ captainBonus: { captainName: 'Ghoul Packmaster', text: 'Gain an edge on strikes', manual: true, edgeOnStrikes: true, feature: null } });
  await edge.window.MonsterAbilityRunner.start(ghoul, bite, 'action', { id: 'g1' });
  assert.equal(edge.openCalls[0].features, undefined);
  assert.deepEqual(edge.chat, ['Sluice Ghoul - With Captain (Ghoul Packmaster): Gain an edge on strikes (apply by hand)']);
  const feature = { title: 'With Captain (Ghoul Packmaster)', automation: { modifiers: [] } };
  const mixed = createRuntime({ captainBonus: { captainName: 'Ghoul Packmaster', text: '+1 damage bonus on strikes; can use Howl', manual: true, feature } });
  await mixed.window.MonsterAbilityRunner.start(ghoul, bite, 'action', { id: 'g1' });
  assert.equal(mixed.openCalls[0].features.length, 1);
  assert.match(mixed.chat[0], /can use Howl \(apply by hand what is not a number\)$/);
});

test('no captain, a board without squads, or a board that throws: the ability runs as before', async () => {
  for (const captainBonus of [null, undefined, () => { throw new Error('board'); }]) {
    const runtime = createRuntime({ captainBonus });
    const result = await runtime.window.MonsterAbilityRunner.start(ghoul, bite, 'action', { id: 'g1' });
    assert.equal(result.completed, true);
    assert.equal(runtime.openCalls[0].features, undefined);
    assert.deepEqual(runtime.chat, []);
  }
});
