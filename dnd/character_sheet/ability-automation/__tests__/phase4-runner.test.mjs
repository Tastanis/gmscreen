import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createAbilityAutomationHarness } from './support/automation-harness.mjs';

// Phase 4 (Brandon, October 2026): move other creatures (heroes get a popup and move themselves), grant actions as a
// chat reminder, use another ability (each use rolls), count creatures. Limits are JSON fields.

const tokens = [
  { id: 'caster-1', name: 'Warleader', team: 'enemy', monster: { role: 'Orc Leader' } },
  { id: 'gob', name: 'Goblin', team: 'enemy', monster: { role: 'Goblin Minion' }, hp: { current: 3, max: 10 } },
  { id: 'orc', name: 'Orc', team: 'enemy', monster: { role: 'Orc Brute' } },
  { id: 'rec', name: 'Recruit', team: 'enemy', monster: { role: 'Hobgoblin Recruit' } },
  { id: 'cal', name: 'Cal', team: 'ally', hp: { current: 10, max: 30 } },
  { id: 'zepha', name: 'Zepha', team: 'ally', hp: { current: 30, max: 30 } },
];
const squares = { 'cal|gob': 1, 'cal|rec': 1, 'cal|orc': 4, 'gob|rec': 1, 'caster-1|rec': 1, 'caster-1|gob': 2, 'cal|caster-1': 1 };
const distance = (a, b) => squares[`${a}|${b}`] ?? squares[`${b}|${a}`] ?? 9;
const bite = { name: 'Bite', automation: { schema: 'ability-automation/v3', cards: [
  { type: 'target', name: 'primary', mode: 'token', predicate: 'enemy', count: { value: 1, mode: 'exact' } },
  { type: 'powerRoll', target: 'primary', flatBonus: 2, tiers: { tier1: { effects: [{ kind: 'damage', amount: 3 }] }, tier2: { effects: [{ kind: 'damage', amount: 5 }] }, tier3: { effects: [{ kind: 'damage', amount: 7 }] } } },
] } };

async function run(automation, options = {}) {
  const harness = await createAbilityAutomationHarness({ targets: tokens });
  const heroAsks = [];
  try {
    const result = await harness.runAutomation({
      automation,
      sourcePlacement: { id: 'caster-1', name: 'Warleader' },
      contextOverrides: {
        getActiveScenePlacements: () => tokens,
        getDistanceBetween: distance,
        isHeroPlacement: (id) => id === 'cal' || id === 'zepha',
        getSpeed: (id) => ({ gob: 6, orc: 5, cal: 5, zepha: 7 }[id] ?? 5),
        requestHeroMove: (payload) => { heroAsks.push(payload); return { results: payload.moves.map((m) => ({ placementId: m.placementId, moved: m.placementId === 'cal' })) }; },
        getAbility: ({ placementId, name }) => (name.toLowerCase() === 'bite' || name === 'signature' ? { ...bite, placementId } : null),
        ...(options.overrides || {}),
      },
      ...options,
    });
    return { ...result, heroAsks, chat: result.calls.postChat.map((c) => c.message).join(' | ') };
  } finally { harness.close(); }
}

test('move: monsters are moved by the user with the own-move picker; heroes get asked and the ability waits', async () => {
  const automation = {
    schema: 'ability-automation/v3',
    cards: [
      { type: 'target', name: 'allies', mode: 'token', predicate: 'creature', count: 'all' },
      { type: 'effect', target: 'allies', effects: [{ kind: 'move', verb: 'shift', distance: 'speed', then: [{ kind: 'damage', amount: 1 }] }] },
    ],
  };
  const result = await run(automation, { targetSelections: [{ id: 'gob', name: 'Goblin' }, { id: 'cal', name: 'Cal' }, { id: 'zepha', name: 'Zepha' }, { done: true }] });
  const moves = result.calls.forceMove;
  assert.equal(moves.length, 1, 'only the goblin through the picker');
  assert.deepEqual([moves[0].targetId, moves[0].distance, moves[0].sourcePlacement.id, moves[0].walkKind], ['gob', 6, 'gob', 'shift'], 'its speed, as its own move');
  assert.deepEqual(result.heroAsks[0].moves.map((m) => [m.placementId, m.distance, m.verb]), [['cal', 5, 'shift'], ['zepha', 7, 'shift']]);
  assert.deepEqual(result.calls.applyDamage.map((c) => c.placementId), ['gob', 'cal'], 'then-effects only on those that moved');
  assert.match(result.chat, /Cal moved, Zepha stayed/);
});

test('move: half speed plus a bonus, a walk for "move", and teleport', async () => {
  const one = (effect) => ({ schema: 'ability-automation/v3', cards: [
    { type: 'target', name: 'primary', mode: 'token', predicate: 'creature', count: { value: 1, mode: 'exact' } },
    { type: 'effect', target: 'primary', effects: [{ kind: 'move', ...effect }] },
  ] });
  let result = await run(one({ verb: 'move', distance: 'halfSpeed', bonus: 1 }), { targetSelections: [{ id: 'gob', name: 'Goblin' }] });
  assert.deepEqual([result.calls.forceMove[0].distance, result.calls.forceMove[0].walkKind, result.calls.forceMove[0].verbLabel], [4, 'walk', 'Move']);
  result = await run(one({ verb: 'teleport', distance: 5 }), { targetSelections: [{ id: 'orc', name: 'Orc' }] });
  assert.deepEqual([result.calls.applyTeleport[0].placementId, result.calls.applyTeleport[0].distance], ['orc', 5]);
  result = await run(one({ distance: 2, heroesMove: false }), { targetSelections: [{ id: 'cal', name: 'Cal' }] });
  assert.equal(result.heroAsks.length, 0, 'heroesMove: false moves heroes with the picker too');
  assert.equal(result.calls.forceMove[0].targetId, 'cal');
});

test('grantAction is a chat reminder', async () => {
  const result = await run({ schema: 'ability-automation/v3', cards: [
    { type: 'target', name: 'primary', mode: 'token', predicate: 'creature', count: { value: 1, mode: 'exact' } },
    { type: 'effect', target: 'primary', effects: [{ kind: 'grantAction', grant: 'a main action', text: 'It can use it now.' }] },
  ] }, { targetSelections: [{ id: 'orc', name: 'Orc' }] });
  assert.match(result.chat, /Orc gets a main action\. It can use it now\./);
});

test('useAbility: "uses Bite twice" runs it twice, each with its own target and roll; sameTargets and the target using its own', async () => {
  let result = await run({ schema: 'ability-automation/v3', cards: [{ type: 'effect', effects: [{ kind: 'useAbility', ability: 'Bite', times: 2 }] }] },
    { targetSelections: [{ id: 'cal', name: 'Cal' }, { id: 'zepha', name: 'Zepha' }], powerRollTiers: ['tier2', 'tier3'] });
  assert.deepEqual(result.calls.applyDamage.map((c) => [c.placementId, c.amount]), [['cal', 5], ['zepha', 7]]);
  assert.match(result.chat, /uses Bite \(1 of 2\)/);
  result = await run({ schema: 'ability-automation/v3', cards: [
    { type: 'target', name: 'primary', mode: 'token', predicate: 'enemy', count: { value: 1, mode: 'exact' } },
    { type: 'effect', target: 'primary', effects: [{ kind: 'useAbility', ability: 'bite', sameTargets: true, edge: 1 }] },
  ] }, { targetSelections: [{ id: 'cal', name: 'Cal' }], powerRollTiers: ['tier1'] });
  assert.equal(result.calls.selectTarget.length, 1, 'no second pick');
  assert.deepEqual(result.calls.applyDamage.map((c) => c.placementId), ['cal']);
  // An unknown ability: a reminder.
  result = await run({ schema: 'ability-automation/v3', cards: [{ type: 'effect', effects: [{ kind: 'useAbility', ability: 'Tail Slam' }] }] });
  assert.match(result.chat, /uses Tail Slam \(by hand\)/);
});

test('count: per adjacent creature of a kind, around each target or the user, or among targets', async () => {
  const strike = (amountFrom) => ({ schema: 'ability-automation/v3', cards: [
    { type: 'target', name: 'primary', mode: 'token', predicate: 'creature', count: { value: 2, mode: 'exact' } },
    { type: 'effect', target: 'primary', effects: [{ kind: 'damage', amount: 0, amountFrom }] },
  ] });
  // "Each enemy takes 2 damage per adjacent goblin" (Kill!): goblins = the user's allies with "goblin" in their kind.
  let result = await run(strike({ source: 'count', predicate: 'ally', keyword: 'goblin', within: 1, multiplier: 2 }), { targetSelections: [{ id: 'cal', name: 'Cal' }, { id: 'zepha', name: 'Zepha' }] });
  assert.deepEqual(result.calls.applyDamage.map((c) => [c.placementId, c.amount]), [['cal', 2]], 'Cal has one goblin next to him; Zepha none (no 0-damage hit)');
  // Around the user: "+1 per adjacent recruit".
  result = await run(strike({ source: 'count', predicate: 'ally', keyword: 'recruit', around: 'self' }), { targetSelections: [{ id: 'cal', name: 'Cal' }, { id: 'zepha', name: 'Zepha' }] });
  assert.deepEqual(result.calls.applyDamage.map((c) => c.amount), [1, 1]);
  // Among the targets: "+5 for each winded target".
  result = await run(strike({ source: 'count', in: 'targets', stamina: 'winded', multiplier: 5 }), { targetSelections: [{ id: 'cal', name: 'Cal' }, { id: 'zepha', name: 'Zepha' }] });
  assert.deepEqual(result.calls.applyDamage.map((c) => c.amount), [5, 5], 'one of the two is winded');
});

test('ifTarget nearby: "an enemy adjacent to 2 or more of us"', async () => {
  const result = await run({ schema: 'ability-automation/v3', cards: [
    { type: 'target', name: 'primary', mode: 'token', predicate: 'creature', count: { value: 2, mode: 'exact' } },
    { type: 'effect', target: 'primary', effects: [{ kind: 'ifTarget', nearby: { predicate: 'ally', within: 1, min: 2 }, then: [{ kind: 'condition', name: 'slowed', duration: 'endOfTurn' }] }] },
  ] }, { targetSelections: [{ id: 'cal', name: 'Cal' }, { id: 'zepha', name: 'Zepha' }] });
  assert.deepEqual(result.calls.applyCondition.map((c) => c.placementId), ['cal'], 'Cal has the goblin and the recruit next to him (the user does not count)');
});

test('the schema knows the phase 4 fields', async () => {
  const harness = await createAbilityAutomationHarness();
  try {
    const { normalized, issues } = harness.validateAutomation({
      schema: 'ability-automation/v3',
      cards: [{ type: 'effect', effects: [
        { kind: 'move', verb: 'Move', distance: 'half speed', bonus: 1, then: [{ kind: 'freeStrike' }] },
        { kind: 'useAbility', ability: 'signature', who: 'target', times: 2, edge: 1, sameTargets: true },
        { kind: 'grantAction', grant: 'a maneuver' },
        { kind: 'buff', label: 'Quickened', speedBonus: 2, ignoreDifficultTerrain: true },
        { kind: 'heal', amount: 0, amountFrom: { source: 'count', predicate: 'ally', within: 2, around: 'self', max: 3 } },
      ] }],
      passives: [{ kind: 'movement', label: 'Fickle and Free', ignoreDifficultTerrain: true, noOpportunityAttacks: true, when: { winded: true } }],
    }, { strict: false });
    assert.ok(!issues.length, issues.join(' | '));
    const [move, use, , buff, heal] = normalized.cards[0].effects;
    assert.deepEqual([move.verb, move.distance, move.bonus, move.then.length], ['move', 'halfSpeed', 1, 1]);
    assert.deepEqual([use.who, use.times, use.edge, use.sameTargets], ['target', 2, 1, true]);
    assert.equal(buff.consume, 'duration', 'a movement-only buff lasts its duration');
    assert.deepEqual(heal.amountFrom, { source: 'count', predicate: 'ally', within: 2, around: 'self', max: 3 });
    assert.deepEqual(normalized.passives[0], { kind: 'movement', label: 'Fickle and Free', ignoreDifficultTerrain: true, noOpportunityAttacks: true, when: { winded: true } });
  } finally { harness.close(); }
});
