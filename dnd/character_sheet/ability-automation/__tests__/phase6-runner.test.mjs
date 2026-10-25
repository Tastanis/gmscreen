import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createAbilityAutomationHarness } from './support/automation-harness.mjs';

// Phase 6 (Brandon, October 2026): "when targeted" events, the creature I've grabbed as a target, knocked out of the
// sky, trample (effects along the path, pre-picked), opposed tests, and the schema for all phase 6 fields.

const tokens = [
  { id: 'caster-1', name: 'Ogre', team: 'enemy', monster: { role: 'Ogre Brute' } },
  { id: 'cal', name: 'Cal', team: 'ally', conditions: [{ name: 'Grabbed', sourceId: 'caster-1' }] },
  { id: 'zepha', name: 'Zepha', team: 'ally' },
  { id: 'gob', name: 'Goblin', team: 'enemy' },
];

async function run(automation, options = {}) {
  const harness = await createAbilityAutomationHarness({ targets: tokens });
  const extra = { landed: [] };
  try {
    const result = await harness.runAutomation({
      automation,
      sourcePlacement: { id: 'caster-1', name: 'Ogre' },
      contextOverrides: {
        getActiveScenePlacements: () => tokens,
        getPlacementById: (id) => tokens.find((token) => token.id === id) || null,
        landToken: ({ placementId }) => { extra.landed.push(placementId); return { landed: placementId !== 'gob' }; },
        ...(options.overrides || {}),
      },
      ...options,
    });
    return { ...result, extra, chat: result.calls.postChat.map((c) => c.message).join(' | ') };
  } finally { harness.close(); }
}

test('targeted: one event per picked target, before any roll, with the ability and its keywords', async () => {
  const result = await run({ schema: 'ability-automation/v3', cards: [
    { type: 'target', name: 'primary', mode: 'token', predicate: 'enemy', count: { value: 2, mode: 'exact' } },
    { type: 'effect', target: 'primary', effects: [{ kind: 'damage', amount: 2 }] },
  ] }, { targetSelections: [{ id: 'cal', name: 'Cal' }, { id: 'zepha', name: 'Zepha' }] });
  const targeted = result.calls.fireTriggerEvent.filter((call) => call.eventType === 'targeted');
  assert.deepEqual(targeted.map((call) => [call.payload.targetId, call.payload.sourceId, call.payload.targetCount]), [['cal', 'caster-1', 2], ['zepha', 'caster-1', 2]]);
  const firstDamage = result.calls.applyDamage[0];
  assert.ok(firstDamage, 'the ability went on (no pause)');
});

test('"grabbed": the creatures the user has grabbed', async () => {
  const result = await run({ schema: 'ability-automation/v3', cards: [
    { type: 'effect', target: 'grabbed', effects: [{ kind: 'damage', amount: 3 }] },
  ] });
  assert.deepEqual(result.calls.applyDamage.map((c) => [c.placementId, c.amount]), [['cal', 3]]);
});

test('land: flying targets fall out of the air', async () => {
  const result = await run({ schema: 'ability-automation/v3', cards: [
    { type: 'target', name: 'primary', mode: 'token', predicate: 'creature', count: { value: 2, mode: 'exact' } },
    { type: 'effect', target: 'primary', effects: [{ kind: 'land' }] },
  ] }, { targetSelections: [{ id: 'zepha', name: 'Zepha' }, { id: 'gob', name: 'Goblin' }] });
  assert.deepEqual(result.extra.landed, ['zepha', 'gob']);
  assert.match(result.chat, /Zepha falls out of the air/);
});

test('alongPath: the creatures passed are pre-picked; one dropped; the effects land on the rest', async () => {
  let asked = 0;
  const result = await run({ schema: 'ability-automation/v3', cards: [
    { type: 'effect', effects: [{ kind: 'move', verb: 'shift', distance: 5, alongPath: { through: [{ kind: 'damage', amount: 4 }], adjacent: [{ kind: 'condition', name: 'prone', duration: 'endOfTurn' }] } }] },
  ] }, {
    forceMove: () => ({ movedDistance: 5, throughIds: ['cal', 'zepha'], adjacentIds: ['gob'] }),
    // First confirm (through): drop Zepha, then Done. Second (adjacent): Done.
    targetSelections: [{ id: 'zepha', name: 'Zepha' }, { done: true }, { done: true }],
  });
  asked = result.calls.selectTarget.length;
  assert.equal(asked, 3);
  assert.deepEqual(result.calls.selectTarget[0].preselectedIds, ['cal', 'zepha'], 'pre-picked');
  assert.deepEqual(result.calls.applyDamage.map((c) => c.placementId), ['cal']);
  assert.deepEqual(result.calls.applyCondition.map((c) => c.placementId), ['gob']);
});

test('opposed test: the user rolls too; the higher total wins; win effects on that opponent', async () => {
  const result = await run({ schema: 'ability-automation/v3', cards: [
    { type: 'target', name: 'primary', mode: 'token', predicate: 'creature', count: { value: 2, mode: 'exact' } },
    { type: 'requestedTest', target: 'primary', attribute: 'Reason', opposed: { win: [{ kind: 'condition', name: 'dazed', duration: 'endOfTurn' }], lose: [{ kind: 'damage', amount: 1 }] } },
  ] }, {
    targetSelections: [{ id: 'cal', name: 'Cal' }, { id: 'zepha', name: 'Zepha' }],
    requestTest: (payload) => ({ results: [
      { requestId: 'a', rollerTokenId: 'caster-1', total: 15, tier: 'tier2' },
      { requestId: 'b', rollerTokenId: 'cal', total: 12, tier: 'tier2' },
      { requestId: 'c', rollerTokenId: 'zepha', total: 18, tier: 'tier3' },
    ], requestIds: ['a', 'b', 'c'], asked: payload.targets.map((t) => t.id) }),
  });
  assert.deepEqual(result.calls.requestTest[0].targets.map((t) => t.id), ['caster-1', 'cal', 'zepha'], 'the user is asked too');
  assert.deepEqual(result.calls.applyCondition.map((c) => c.placementId), ['cal'], 'Ogre 15 beats Cal 12');
  assert.deepEqual(result.calls.applyDamage.map((c) => c.placementId), ['zepha'], 'Zepha 18 beats Ogre 15');
  assert.match(result.chat, /15 vs Cal 12: .* wins/);
  assert.match(result.chat, /15 vs Zepha 18: Zepha wins/);
});

test('the schema knows the phase 6 fields', async () => {
  const harness = await createAbilityAutomationHarness();
  try {
    const { normalized, issues } = harness.validateAutomation({
      schema: 'ability-automation/v3',
      cards: [
        { type: 'trigger', condition: 'When targeted', match: { event: 'targeted', filter: { whose: 'self', keywordsAny: ['Strike'] } }, resolve: 'click' },
        { type: 'trigger', condition: 'A creature steps on it', match: { event: 'entersSpace', filter: { whose: 'any', within: 0 } }, resolve: 'run' },
        { type: 'trigger', condition: 'Becomes wet', match: { event: 'conditionGained', filter: { whose: 'self', conditionName: 'Wet' } } },
        { type: 'trigger', condition: 'Fails a save', match: { event: 'saveFailed', filter: { conditionName: ['dazed'] } } },
        { type: 'effect', effects: [
          { kind: 'land' },
          { kind: 'buff', label: 'Wings', fly: true, duration: 'endOfTurn' },
          { kind: 'move', verb: 'shift', distance: 'speed', alongPath: { through: [{ kind: 'damage', amount: 5 }], predicate: 'enemy', confirm: false } },
        ] },
      ],
      passives: [
        { kind: 'object', inTracker: true },
        { kind: 'conditionRule', name: 'Wet', description: 'Soaked.', rider: { type: 'rollModifier', modifier: 'bane', side: 'own' }, weakness: { type: 'lightning', amount: 3 }, speedBonus: -2 },
        { kind: 'movement', grabLimit: 2 },
      ],
    }, { strict: false });
    assert.ok(!issues.length, issues.join(' | '));
    const [targeted, enters, gained, failed] = normalized.cards;
    assert.equal(targeted.match.event, 'targeted');
    assert.deepEqual([enters.match.filter.within, enters.resolve], [0, 'run']);
    assert.deepEqual(gained.match.filter.conditionName, ['Wet'], 'matched without regard to case');
    assert.deepEqual(failed.match.filter.conditionName, ['dazed']);
    const [land, buff, move] = normalized.cards[4].effects;
    assert.deepEqual([land.kind, buff.fly, move.alongPath.predicate, move.alongPath.confirm, move.alongPath.through.length], ['land', true, 'enemy', false, 1]);
    const opposed = harness.validateAutomation({ schema: 'ability-automation/v3', cards: [
      { type: 'target', name: 'primary', mode: 'token', predicate: 'creature', count: { value: 1, mode: 'exact' } },
      { type: 'requestedTest', target: 'primary', attribute: 'Reason', opposed: { win: [{ kind: 'note', text: 'won' }] } },
    ] }, { strict: false });
    assert.ok(!opposed.issues.length, opposed.issues.join(' | '));
    assert.equal(opposed.normalized.cards[1].opposed.win.length, 1);
    const [object, rule, movement] = normalized.passives;
    assert.deepEqual(object, { kind: 'object', label: 'Object', inTracker: true });
    assert.deepEqual([rule.name, rule.weakness, rule.rider.modifier, rule.rider.speedBonus], ['wet', { amount: 3, type: 'lightning' }, 'bane', -2]);
    assert.equal(movement.grabLimit, 2);
  } finally { harness.close(); }
});
