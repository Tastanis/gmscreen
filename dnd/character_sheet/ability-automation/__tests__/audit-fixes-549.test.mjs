import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAbilityAutomationHarness } from './support/automation-harness.mjs';
import { buildAutomationTriggerPredicate } from '../../../vtt/assets/js/ui/automation-trigger-predicate.js';

// Build 549, from the automation audit (October 2026): JSON the paste box accepted but nothing acted on now works,
// or the paste box says it does nothing (Brandon: "Make each one work where it makes sense; where it doesn't, the
// paste box warns instead of staying silent").

const V3 = 'ability-automation/v3';

async function run(automation, options = {}) {
  const harness = await createAbilityAutomationHarness();
  try { return await harness.runAutomation({ automation, ...options }); } finally { harness.close(); }
}

test('a potency result keeps the named targets of the ability', async () => {
  const result = await run({ schema: V3, cards: [
    { type: 'target', name: 'friend', predicate: 'ally', count: 1 },
    { type: 'target', name: 'foe', predicate: 'enemy', count: 1 },
    { type: 'powerRoll', target: 'foe', attribute: 'Might', tiers: {
      tier1: { effects: [{ kind: 'potency', attribute: 'Might', level: 'weak', onFail: [{ kind: 'damage', amount: 2, target: 'friend' }] }] },
      tier2: { effects: [] }, tier3: { effects: [] } } },
  ] }, { targetSelections: [{ id: 'target-1', name: 'Friend' }, { id: 'target-2', name: 'Foe' }], powerRollTiers: ['tier1'], checkPotencyResults: [{ passes: true }] });
  assert.deepEqual((result.calls.applyDamage || []).map((c) => c.placementId), ['target-1'], 'the failed potency reaches the group named "friend"');
});

test('a "first time this round" flag is kept on the ability\'s target', async () => {
  const result = await run({ schema: V3, cards: [
    { type: 'target', name: 'foes', count: 1 },
    { type: 'effect', target: 'foes', effects: [{ kind: 'setScopedFlag', key: 'struck', scope: 'round' }] },
  ] }, { targetSelections: [{ id: 'target-2', name: 'Target Two' }] });
  assert.equal(result.calls.setScopedFlag?.[0]?.targetId, 'target-2', 'it used to key to nobody');
});

test('count "all": every creature picked, until Done; it stays "all" when saved again', async () => {
  const harness = await createAbilityAutomationHarness();
  try {
    const automation = { schema: V3, cards: [
      { type: 'target', name: 'all', count: 'all' },
      { type: 'effect', target: 'all', effects: [{ kind: 'damage', amount: 1 }] },
    ] };
    const once = harness.window.AbilityAutomationSchema.normalizeAutomation(automation);
    const twice = harness.window.AbilityAutomationSchema.normalizeAutomation(once);
    assert.equal(twice.cards[0].count.mode, 'all');
    const result = await harness.runAutomation({ automation: twice, targetSelections: [{ id: 'target-1', name: 'One' }, { id: 'target-2', name: 'Two' }, { done: true }] });
    assert.deepEqual(result.calls.applyDamage.map((c) => c.placementId), ['target-1', 'target-2']);
  } finally { harness.close(); }
});

test('an aura says so in chat', async () => {
  const result = await run({ schema: V3, cards: [{ type: 'effect', effects: [{ kind: 'aura', radius: 2 }] }] });
  assert.ok(result.calls.setAura?.length, 'the aura is set');
  assert.ok((result.calls.postChat || []).some((c) => /aura on, 2 squares/.test(c.message || '')), 'and chat says so');
});

test('the chat line for damage from the triggering move or dice has no "0"', async () => {
  const harness = await createAbilityAutomationHarness();
  try {
    const P = harness.window.AbilityAutomationPrimitives;
    assert.equal(P.describeEffect({ kind: 'damage', damageType: 'psychic', amountFrom: { source: 'triggeringForcedMovement' } }), 'psychic damage equal to triggering movement');
    assert.equal(P.describeEffect({ kind: 'damage', amountDice: '2d6', damageType: 'fire' }), '2d6 fire damage');
    assert.equal(P.describeEffect({ kind: 'damage', amount: 5, attribute: 'Might', damageType: 'holy' }), '5 + Might holy damage');
  } finally { harness.close(); }
});

test('the paste box: movement amount sources kept, autoResolve takes per-effect targets, spend timing warns', async () => {
  const harness = await createAbilityAutomationHarness();
  try {
    const S = harness.window.AbilityAutomationSchema;
    const moved = S.normalizeAutomation({ schema: V3, cards: [{ type: 'effect', effects: [{ kind: 'damage', amountFrom: { source: 'movedDistance' } }] }] });
    assert.equal(moved.cards[0].effects[0].amountFrom.source, 'triggeringForcedMovement', 'the distance moved, not "triggering damage"');
    const auto = S.normalizeAutomation({ schema: V3, cards: [{ type: 'trigger', autoResolve: true, match: { event: 'damage' }, effects: [{ kind: 'damage', amount: 1, target: 'eventSource' }] }] });
    assert.ok(!auto.warnings.some((w) => /per-effect target routing/.test(w)));
    const spend = S.normalizeAutomation({ schema: V3, cards: [{ type: 'effect', effects: [{ kind: 'spend', resource: 'Insight', amount: 1, timing: 'preRoll', effects: [] }] }] });
    assert.ok(spend.warnings.some((w) => /timing: "preRoll" does nothing/.test(w)));
  } finally { harness.close(); }
});

test('trigger filters: line of effect, the kind of move, who put the mark on', () => {
  const env = (los) => ({ hasLineOfEffect: () => los, getTeamForPlacementId: (id) => (id === 'enemy-1' ? 'enemy' : 'ally') });
  const rebuke = { casterId: 'cal', casterTeam: 'ally', match: { event: 'actionUsed', filter: { lineOfEffectTo: 'eventActor' } } };
  assert.equal(buildAutomationTriggerPredicate(rebuke, env(true))({ actorId: 'enemy-1' }), true);
  assert.equal(buildAutomationTriggerPredicate(rebuke, env(false))({ actorId: 'enemy-1' }), false, 'a wall between: no trigger');
  assert.equal(buildAutomationTriggerPredicate(rebuke, env(null))({ actorId: 'enemy-1' }), true, "can't tell: the trigger is not stopped");
  const shiftOnly = { casterId: 'cal', casterTeam: 'ally', match: { event: 'move', filter: { verb: 'shift' } } };
  assert.equal(buildAutomationTriggerPredicate(shiftOnly, env(true))({ placementId: 'enemy-1', kind: 'shift' }), true);
  assert.equal(buildAutomationTriggerPredicate(shiftOnly, env(true))({ placementId: 'enemy-1', kind: 'walk' }), false);
  const allyMarks = { casterId: 'cal', casterTeam: 'ally', match: { event: 'markApplied', filter: { source: 'ally' } } };
  assert.equal(buildAutomationTriggerPredicate(allyMarks, env(true))({ sourceId: 'indigo' }), true);
  assert.equal(buildAutomationTriggerPredicate(allyMarks, env(true))({ sourceId: 'enemy-1' }), false);
});

test('the sheet keeps a passives-only automation; auto-resolved effects go to their own targets', () => {
  const sheet = readFileSync(new URL('../../sheet.js', import.meta.url), 'utf8');
  assert.match(sheet, /const hasPassives = Array\.isArray\(automation\.passives\) && automation\.passives\.length > 0;\s*return hasCards \|\| hasModifiers \|\| hasPassives;/);
  const board = readFileSync(new URL('../../../vtt/assets/js/ui/board-interactions.js', import.meta.url), 'utf8');
  assert.match(board, /placements: resolveAutoTriggerPlacements\(key \? \{ \.\.\.entry, effectTarget: key \} : entry, payload\),/);
  assert.match(board, /target: Array\.isArray\(entry\?\.targetIds\) && entry\.targetIds\.length \? entry\.targetIds : \[entry\?\.tokenId \|\| ''\],/, '"target" is the ability\'s target, not the caster');
  assert.match(board, /getMarkedTarget: function \(payload\) \{/);
});
