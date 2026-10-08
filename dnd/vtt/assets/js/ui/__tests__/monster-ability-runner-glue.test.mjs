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
  const runtime = createRuntime({ captainBonus: (placementId) => { asked.push(placementId); return { captainName: 'Ghoul Packmaster', text: '+1 damage bonus on strikes', strikeDamage: 1, byHand: [], manual: false, feature }; } });
  await runtime.window.MonsterAbilityRunner.start(ghoul, bite, 'action', { id: 'g1', hp: 32, maxHp: 32 });
  assert.deepEqual(asked, ['g1']);
  assert.deepEqual(JSON.parse(JSON.stringify(runtime.openCalls[0].features)), [feature]);
  assert.deepEqual(runtime.chat, [], 'a bonus the app applies needs no reminder');
});

test('the part of a "With Captain" line the app cannot apply is said in chat, and only that part', async () => {
  const stamina = createRuntime({ captainBonus: { captainName: 'Ghoul Packmaster', text: '+2 bonus to Stamina', byHand: ['+2 bonus to Stamina'], manual: true, feature: null } });
  await stamina.window.MonsterAbilityRunner.start(ghoul, bite, 'action', { id: 'g1' });
  assert.equal(stamina.openCalls[0].features, undefined);
  assert.deepEqual(stamina.chat, ['Sluice Ghoul - With Captain (Ghoul Packmaster), apply by hand: +2 bonus to Stamina']);
  const feature = { title: 'With Captain (Ghoul Packmaster)', automation: { modifiers: [] } };
  const mixed = createRuntime({ captainBonus: { captainName: 'Ghoul Packmaster', text: '+1 damage bonus on strikes; can use Howl', byHand: ['can use Howl'], manual: true, feature } });
  await mixed.window.MonsterAbilityRunner.start(ghoul, bite, 'action', { id: 'g1' });
  assert.equal(mixed.openCalls[0].features.length, 1);
  assert.deepEqual(mixed.chat, ['Sluice Ghoul - With Captain (Ghoul Packmaster), apply by hand: can use Howl']);
  // An edge is applied on the roll, so it needs no reminder.
  const edge = createRuntime({ captainBonus: { captainName: 'Ghoul Packmaster', text: 'Gain an edge on strikes', edge: 1, byHand: [], manual: false, feature: null } });
  await edge.window.MonsterAbilityRunner.start(ghoul, bite, 'action', { id: 'g1' });
  assert.deepEqual(edge.chat, []);
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

test('a monster is winded at half its Stamina or less, read from its token on the board', async () => {
  const runtime = createRuntime();
  const winded = runtime.window.MonsterAbilityRunner._isWinded;
  // Tokens keep Stamina as text in hp: { current, max }.
  assert.equal(winded({ id: 'k', hp: { current: '60', max: '120' } }), true, 'exactly half');
  assert.equal(winded({ id: 'k', hp: { current: '61', max: '120' } }), false);
  assert.equal(winded({ id: 'k', hp: { current: '7', max: '15' } }), true, 'half of 15 rounds down to 7');
  assert.equal(winded({ id: 'k', hp: { current: '8', max: '15' } }), false);
  assert.equal(winded({ id: 'k', hp: { current: '0', max: '40' } }), true);
  assert.equal(winded({ id: 'k', hp: { current: '-3', max: '40' } }), true);
  // Stamina that was never set is not zero, so not winded.
  assert.equal(winded({ id: 'k', hp: { current: '', max: '40' } }), false);
  assert.equal(winded({ id: 'k', hp: { current: '10', max: '' } }), false);
  assert.equal(winded({ id: 'k' }), false);
  assert.equal(winded(null), false);
  // The older number form still works.
  assert.equal(winded({ id: 'k', hp: 20, maxHp: 40 }), true);
  assert.equal(winded({ id: 'k', hp: 21, maxHp: 40 }), false);
  // The token as it is now wins over the copy the tray was opened with.
  runtime.window.VTTBoardCallbacks.getPlacementById = (id) => ({ id, hp: { current: '12', max: '120' } });
  assert.equal(winded({ id: 'k', hp: { current: '120', max: '120' } }), true);
  runtime.window.VTTBoardCallbacks.getPlacementById = () => { throw new Error('board'); };
  assert.equal(winded({ id: 'k', hp: { current: '120', max: '120' } }), false, 'a board that throws falls back to the copy');
  // The runner is given the same answer.
  runtime.window.VTTBoardCallbacks.getPlacementById = (id) => ({ id, hp: { current: '30', max: '120' } });
  await runtime.window.MonsterAbilityRunner.start(ghoul, bite, 'action', { id: 'k', hp: { current: '120', max: '120' } });
  assert.equal(runtime.openCalls.at(-1).isWinded(), true);
});

test('a refused Malice ability returns its Malice once and says so', async () => {
  const runtime = createRuntime();
  runtime.window.AbilityAutomationRunner.open = async (context) => {
    // The runner refuses (already used this encounter) and refunds; a second refund must not double it.
    await context.refundAbility({ refused: true });
    await context.refundAbility({ refused: true });
    return { aborted: true };
  };
  await runtime.window.MonsterAbilityRunner.start(
    { name: 'Kragen Thornwhisper', attributes: {} },
    { name: 'Up the Taproot', resource_cost: '3 Malice', automation: { schema: 'ability-automation/v3', cards: [{ type: 'effect', effects: [] }] } },
    'malice', { id: 'kragen' },
  );
  assert.deepEqual(runtime.spends, [3]);
  assert.deepEqual(runtime.refunds, [3]);
  assert.equal(runtime.getMalice(), 10);
  assert.ok(runtime.chat.some((line) => line === 'Up the Taproot was not used: 3 malice returned.'));
});
