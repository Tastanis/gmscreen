// The universal actions (universal-actions.json): the main actions and maneuvers every creature has, added to every
// hero's ability tray and, where a monster can use them, to every monster's (Brandon, November 25, 2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createAbilityAutomationHarness } from './support/automation-harness.mjs';
import { universalActionsFor, heroUniversalActions, monsterUniversalAbilities, loadUniversalActions, setUniversalActionsData, universalActionsData } from '../../../vtt/assets/js/ui/universal-actions.js';

const data = JSON.parse(await readFile(new URL('../universal-actions.json', import.meta.url), 'utf8'));
const named = (name) => data.actions.find((action) => action.name === name);
const names = (list) => list.map((action) => action.name);

test('the file: every action is whole, named once, and for heroes, monsters or both', () => {
  assert.equal(data.format, 'universal-actions/v1');
  const ids = new Set(), seen = new Set();
  for (const action of data.actions) {
    assert.match(action.id, /^universal-[a-z-]+$/, action.name);
    assert.ok(!ids.has(action.id) && !seen.has(action.name), `${action.name} is listed once`);
    ids.add(action.id); seen.add(action.name);
    assert.ok(['Main', 'Maneuver', 'Move'].includes(action.type), `${action.name}: type`);
    assert.ok(Array.isArray(action.for) && action.for.length && action.for.every((who) => ['heroes', 'monsters'].includes(who)), `${action.name}: for`);
    assert.ok(typeof action.effect === 'string' && action.effect.length > 20, `${action.name}: its rule is written out`);
    if (action.roll) assert.ok(action.roll.characteristics.length && action.roll.tiers.length === 3, `${action.name}: three tiers`);
  }
  // Chapter 10: Combat. Free Strike is on every sheet and stat block already.
  assert.deepEqual(names(data.actions).sort(), ['Advance', 'Aid Attack', 'Catch Breath', 'Charge', 'Defend', 'Disengage', 'Escape Grab', 'Grab', 'Heal', 'Hide',
    'Knockback', 'Make or Assist a Test', 'Ride', 'Search for Hidden Creatures', 'Stand Up', 'Use Consumable']);
});

test('what spends a Recovery is for heroes only; a monster gets what a monster can use', () => {
  for (const name of ['Catch Breath', 'Heal']) assert.deepEqual(named(name).for, ['heroes'], `${name} spends a Recovery`);
  assert.deepEqual(names(universalActionsFor(data, 'monsters')), ['Charge', 'Defend', 'Aid Attack', 'Escape Grab', 'Grab', 'Hide', 'Knockback', 'Search for Hidden Creatures', 'Stand Up']);
  assert.ok(universalActionsFor(data, 'heroes').every((action) => action.type !== 'Move'), 'the move actions are kept for reference, not listed');
});

test("a hero's tray: main actions and maneuvers, shaped as the sheet's own cards", () => {
  const sheet = { hero: { stats: { might: '2', agility: 3, reason: 0, intuition: -1, presence: 1 } } };
  assert.deepEqual(names(heroUniversalActions(data, 'mains', sheet)), ['Charge', 'Defend', 'Heal']);
  assert.deepEqual(names(heroUniversalActions(data, 'maneuvers', sheet)),
    ['Aid Attack', 'Catch Breath', 'Escape Grab', 'Grab', 'Hide', 'Knockback', 'Make or Assist a Test', 'Search for Hidden Creatures', 'Stand Up', 'Use Consumable']);
  assert.deepEqual(heroUniversalActions(data, 'triggers', sheet), []);
  assert.deepEqual(heroUniversalActions(null, 'mains', sheet), [], 'before the list has arrived: none');

  const knockback = heroUniversalActions(data, 'maneuvers', sheet).find((action) => action.name === 'Knockback');
  assert.equal(knockback.id, 'universal-knockback');
  assert.equal(knockback._stableActionId, 'universal-knockback');
  assert.equal(knockback._universal, true);
  assert.equal(knockback.actionLabel, 'Maneuver');
  assert.deepEqual(knockback.tags, ['Melee', 'Weapon']);
  assert.equal(knockback.range, 'Melee 1');
  assert.equal(knockback.target, 'One creature');
  assert.equal(knockback.cost, '');
  assert.deepEqual(knockback.tests, [{ id: 'universal-knockback-roll', label: 'Power Roll · Might', rollMod: '2',
    tiers: { low: { damage: '', damageType: '', notes: 'Push 1' }, mid: { damage: '', damageType: '', notes: 'Push 2' }, high: { damage: '', damageType: '', notes: 'Push 3' } } }]);
  assert.equal(knockback.automation.schema, 'ability-automation/v3');
  // Might or Agility: the higher.
  assert.equal(heroUniversalActions(data, 'maneuvers', sheet).find((action) => action.name === 'Escape Grab').tests[0].rollMod, '3');
  // The card's text is text: nothing in the file can become markup.
  const odd = heroUniversalActions({ actions: [{ id: 'universal-x', name: 'X', type: 'Main', for: ['heroes'], effect: 'a <b>b</b> & c\nd' }] }, 'mains');
  assert.equal(odd[0].description, 'a &lt;b&gt;b&lt;/b&gt; &amp; c<br>d');
  // A copy each time: one hero's use never changes the list.
  knockback.automation.cards.length = 0;
  assert.equal(heroUniversalActions(data, 'maneuvers', sheet).find((action) => action.name === 'Knockback').automation.cards.length, 2);
});

test("a monster's tray: actions and maneuvers, shaped as a stat block's own, rolled with its own characteristic", () => {
  const ogre = { name: 'Ogre', attributes: { might: 4, agility: 1, reason: -1, intuition: 0, presence: 0 }, abilities: {} };
  assert.deepEqual(names(monsterUniversalAbilities(data, 'action', ogre)), ['Charge', 'Defend']);
  assert.deepEqual(names(monsterUniversalAbilities(data, 'maneuver', ogre)), ['Aid Attack', 'Escape Grab', 'Grab', 'Hide', 'Knockback', 'Search for Hidden Creatures', 'Stand Up']);
  for (const tab of ['passive', 'triggered_action', 'villain_action', 'malice']) assert.deepEqual(monsterUniversalAbilities(data, tab, ogre), []);
  const knockback = monsterUniversalAbilities(data, 'maneuver', ogre).find((ability) => ability.name === 'Knockback');
  assert.equal(knockback.universal, true);
  assert.equal(knockback.keywords, 'Melee, Weapon');
  assert.equal(knockback.targets, 'One creature');
  assert.equal(knockback.roll_bonus, 4);
  assert.equal(knockback.has_test, true);
  assert.deepEqual(knockback.test, { tier1: { damage_amount: '', damage_type: '', tier_effect: 'Push 1' }, tier2: { damage_amount: '', damage_type: '', tier_effect: 'Push 2' }, tier3: { damage_amount: '', damage_type: '', tier_effect: 'Push 3' } });
  assert.equal(knockback.automation.cards[1].attribute, 'Might', "the roll names Might; the runner takes the monster's own");
  assert.equal(monsterUniversalAbilities(data, 'action', ogre).find((ability) => ability.name === 'Charge').has_test, false);
  // A trap or a hazard is no creature: none of them.
  assert.deepEqual(monsterUniversalAbilities(data, 'maneuver', { name: 'Spike Trap', role: 'Trap Ambusher', attributes: {}, abilities: {} }), []);
  assert.deepEqual(monsterUniversalAbilities(data, 'action', { name: 'Ballista', attributes: {}, abilities: {}, traits: [{ name: 'Engine', automation: { passives: [{ kind: 'object' }] } }] }), []);
  assert.equal(monsterUniversalAbilities(data, 'action', { name: 'Golem', attributes: {}, abilities: {}, traits: [{ automation: { passives: [{ kind: 'object', object: false }] } }] }).length, 2, 'unless its passive says it is a creature after all');
});

test('every automation in the file is what the runner understands, with nothing left over', async () => {
  const harness = await createAbilityAutomationHarness();
  try {
    for (const action of data.actions.filter((entry) => entry.automation)) {
      const { issues } = harness.validateAutomation(action.automation, { strict: false });
      assert.deepEqual(issues, [], `${action.name}: ${issues.join('; ')}`);
    }
  } finally { harness.close(); }
});

test('Knockback pushes 1, 2 or 3 by the roll', async () => {
  for (const [tier, distance] of [[1, 1], [2, 2], [3, 3]]) {
    const harness = await createAbilityAutomationHarness({ attributes: { Might: 2 }, targets: [{ id: 'goblin', name: 'Goblin' }] });
    try {
      const result = await harness.runAutomation({
        automation: named('Knockback').automation,
        action: { id: 'universal-knockback', name: 'Knockback', actionLabel: 'Maneuver' },
        targetSelections: [{ id: 'goblin', name: 'Goblin' }],
        powerRollTiers: [`tier${tier}`],
        forceMove: () => ({ name: 'Goblin', movedDistance: distance }),
      });
      assert.equal(result.calls.forceMove.length, 1);
      assert.equal(result.calls.forceMove[0].distance, distance);
      assert.equal(result.calls.forceMove[0].verb, 'push');
      assert.equal(result.calls.applyDamage?.length || 0, 0, 'Knockback deals no damage of its own');
    } finally { harness.close(); }
  }
});

test('Grab: nothing on a low roll, grabbed on a high one, and the choice in between', async () => {
  const run = async (tier, promptAnswers = []) => {
    const harness = await createAbilityAutomationHarness({ attributes: { Might: 2 }, targets: [{ id: 'goblin', name: 'Goblin' }] });
    try {
      return await harness.runAutomation({
        automation: named('Grab').automation,
        action: { id: 'universal-grab', name: 'Grab', actionLabel: 'Maneuver' },
        targetSelections: [{ id: 'goblin', name: 'Goblin' }], powerRollTiers: [`tier${tier}`], promptAnswers,
      });
    } finally { harness.close(); }
  };
  const grabbed = (result) => (result.calls.applyCondition || []).filter((call) => String(call.condition?.name ?? call.name ?? '').toLowerCase() === 'grabbed');
  assert.equal(grabbed(await run(1)).length, 0, 'tier 1: no effect');
  assert.equal(grabbed(await run(3)).length, 1, 'tier 3: grabbed');
  assert.equal(grabbed(await run(2, [true])).length, 1, 'tier 2, yes: grabbed');
  assert.equal(grabbed(await run(2, [false])).length, 0, 'tier 2, no: not grabbed');
});

test('Defend, Aid Attack, Heal and Stand Up do what their cards say', async () => {
  const run = async (name, extra = {}) => {
    const harness = await createAbilityAutomationHarness({ attributes: { Might: 2 }, targets: [{ id: 'goblin', name: 'Goblin' }] });
    try {
      return await harness.runAutomation({ automation: named(name).automation, action: { id: named(name).id, name, actionLabel: 'Main Action' }, targetSelections: [{ id: 'goblin', name: 'Goblin' }], ...extra });
    } finally { harness.close(); }
  };
  const defend = (await run('Defend')).calls.applyCondition;
  assert.equal(defend.length, 1);
  assert.equal(defend[0].placementId, 'caster-1', 'on the one who defends');
  assert.equal(defend[0].condition.rider.modifier, 'doubleBane');
  assert.match(defend[0].condition.label, /^Defend/);
  const aid = (await run('Aid Attack')).calls.applyCondition;
  assert.equal(aid[0].placementId, 'goblin', 'on the enemy chosen');
  assert.equal(aid[0].condition.rider.modifier, 'edge');
  const healed = await run('Heal', { promptAnswers: [true] });
  assert.equal(healed.calls.applyHeal.length, 1, 'a Recovery spent: the adjacent creature is healed');
  assert.equal(healed.calls.applyHeal[0].placementId, 'goblin');
  const saved = await run('Heal', { promptAnswers: [false] });
  assert.equal(saved.calls.applyHeal?.length || 0, 0, 'a saving throw instead: no healing');
  assert.ok(saved.calls.postChat.some((entry) => /saving throw/.test(entry.message)));
  assert.ok((await run('Stand Up')).calls.postChat.length >= 1, 'Stand Up runs to its end');
});

test('Catch Breath spends one of the hero\'s own Recoveries', async () => {
  const harness = await createAbilityAutomationHarness({ attributes: { Might: 2 } });
  try {
    const result = await harness.runAutomation({
      automation: named('Catch Breath').automation,
      action: { id: 'universal-catch-breath', name: 'Catch Breath', actionLabel: 'Maneuver' },
    });
    assert.equal(result.calls.spendRecoveryForTarget?.length, 1, JSON.stringify(Object.fromEntries(Object.entries(result.calls).map(([k, v]) => [k, v.length]))));
  } finally { harness.close(); }
});

test('the page fetches the list once and tells the trays; a failed fetch is tried again', async () => {
  setUniversalActionsData(null);
  let fetched = 0, told = 0;
  const doc = { dispatchEvent: () => { told += 1; } };
  globalThis.CustomEvent ??= class { constructor(type) { this.type = type; } };
  assert.equal(await loadUniversalActions({ url: '/x.json', doc, fetcher: async () => { fetched += 1; return { ok: false }; } }), null);
  assert.equal(universalActionsData(), null);
  const first = loadUniversalActions({ url: '/x.json', doc, fetcher: async () => { fetched += 1; return { ok: true, json: async () => data }; } });
  const second = loadUniversalActions({ url: '/x.json', doc, fetcher: async () => { fetched += 1; return { ok: true, json: async () => data }; } });
  assert.equal(await first, data); assert.equal(await second, data);
  assert.equal(fetched, 2, 'one failed try, then one fetch shared by both callers');
  assert.equal(told, 1);
  assert.equal(await loadUniversalActions({ url: '/x.json', doc, fetcher: async () => { fetched += 1; return { ok: false }; } }), data);
  assert.equal(fetched, 2, 'not fetched again once here');
  setUniversalActionsData(null);
});
