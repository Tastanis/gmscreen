import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createAbilityAutomationHarness } from './support/automation-harness.mjs';

// Phase 1 (Brandon, October 2026): "heals equal to the damage dealt" counts what the target took, after its
// immunity and weakness; splash targets ("each enemy adjacent to the target") are pre-picked and the user confirms;
// "the target loses a Recovery".

const tokens = [
  { id: 'caster-1', name: 'Troll', team: 'enemy' },
  { id: 'cal', name: 'Cal', team: 'ally' },
  { id: 'sharon', name: 'Sharon', team: 'ally' },
  { id: 'zepha', name: 'Zepha', team: 'ally' },
  { id: 'gob', name: 'Goblin', team: 'enemy' },
];
// Squares between tokens: Sharon and the goblin stand next to Cal; Zepha is far away.
const squares = { 'cal|sharon': 1, 'cal|gob': 1, 'cal|zepha': 6, 'cal|caster-1': 1 };
const distance = (a, b) => squares[`${a}|${b}`] ?? squares[`${b}|${a}`] ?? 9;

async function run(automation, options = {}) {
  const harness = await createAbilityAutomationHarness({ targets: tokens });
  try {
    const result = await harness.runAutomation({
      automation,
      sourcePlacement: { id: 'caster-1', name: 'Troll' },
      contextOverrides: {
        getActiveScenePlacements: () => tokens,
        getDistanceBetween: distance,
        ...(options.overrides || {}),
      },
      ...options,
    });
    return { ...result, chat: result.calls.postChat.map((call) => call.message).join(' | ') };
  } finally { harness.close(); }
}

test('lifesteal: heal equal to the damage the target took, after its immunity', async () => {
  const automation = {
    schema: 'ability-automation/v3',
    cards: [
      { type: 'target', name: 'primary', mode: 'token', predicate: 'enemy', count: { value: 1, mode: 'exact' } },
      { type: 'effect', target: 'primary', effects: [{ kind: 'damage', amount: 8 }] },
      { type: 'effect', effects: [{ kind: 'heal', target: 'self', amount: 0, amountFrom: { source: 'damageDealt' } }] },
    ],
  };
  // The target is immune to 3 of it: it takes 5, so the troll heals 5.
  const result = await run(automation, {
    targetSelections: [{ id: 'cal', name: 'Cal' }],
    overrides: { applyDamage: (payload) => ({ name: 'Cal', amount: payload.amount - 3, current: 10, max: 20 }) },
  });
  assert.equal(result.calls.applyHeal.length, 1);
  assert.equal(result.calls.applyHeal[0].placementId, 'caster-1');
  assert.equal(result.calls.applyHeal[0].amount, 5);
});

test('lifesteal: half, rounded down, across every target hit', async () => {
  const automation = {
    schema: 'ability-automation/v3',
    cards: [
      { type: 'target', name: 'primary', mode: 'token', predicate: 'enemy', count: { value: 2, mode: 'exact' } },
      { type: 'effect', target: 'primary', effects: [{ kind: 'damage', amount: 5 }] },
      { type: 'effect', effects: [{ kind: 'temporaryStamina', target: 'self', amount: 0, amountFrom: { source: 'damageDealt', fraction: 0.5 } }] },
    ],
  };
  const result = await run(automation, { targetSelections: [{ id: 'cal', name: 'Cal' }, { id: 'sharon', name: 'Sharon' }] });
  assert.equal(result.calls.applyHeal[0].amount, 5, 'half of 10');
  assert.equal(result.calls.applyHeal[0].allowTempHp, true);
});

const splash = (extra = {}) => ({
  schema: 'ability-automation/v3',
  cards: [
    { type: 'target', name: 'primary', mode: 'token', predicate: 'enemy', count: { value: 1, mode: 'exact' } },
    { type: 'effect', target: 'primary', effects: [{ kind: 'damage', amount: 6 }] },
    { type: 'target', name: 'splash', mode: 'token', predicate: 'enemy', near: { group: 'primary', within: 1 }, ...extra },
    { type: 'effect', target: 'splash', effects: [{ kind: 'damage', amount: 3 }] },
  ],
});
const hits = (result) => result.calls.applyDamage.map((call) => [call.placementId, call.amount]);

test('splash: the creatures next to the target are pre-picked; Done keeps them', async () => {
  const result = await run(splash(), { targetSelections: [{ id: 'cal', name: 'Cal' }, { done: true }] });
  assert.deepEqual(hits(result), [['cal', 6], ['sharon', 3]], 'Sharon is next to Cal and an enemy of the troll; the goblin is its ally; Zepha is far');
  const prompt = result.calls.selectTarget[1];
  assert.deepEqual(prompt.preselectedIds, ['sharon']);
  assert.equal(prompt.allowDone, true);
  assert.match(prompt.promptText, /1 picked\. Click a token to add or remove it, then Done\./);
});

test('splash: clicking a pre-picked token takes it out, clicking another adds it', async () => {
  const result = await run(splash(), {
    targetSelections: [{ id: 'cal', name: 'Cal' }, { id: 'sharon', name: 'Sharon' }, { id: 'zepha', name: 'Zepha' }, { done: true }],
  });
  assert.deepEqual(hits(result), [['cal', 6], ['zepha', 3]]);
});

test('splash: nobody near means no picker, only a chat line', async () => {
  const result = await run(splash({ near: { group: 'primary', within: 1 } }), {
    targetSelections: [{ id: 'zepha', name: 'Zepha' }],
  });
  assert.deepEqual(hits(result), [['zepha', 6]]);
  assert.equal(result.calls.selectTarget.length, 1);
  assert.match(result.chat, /nobody fits near Zepha\./);
});

test('loseRecoveries spends the target\'s Recoveries without healing', async () => {
  const automation = {
    schema: 'ability-automation/v3',
    cards: [
      { type: 'target', name: 'primary', mode: 'token', predicate: 'enemy', count: { value: 1, mode: 'exact' } },
      { type: 'effect', target: 'primary', effects: [{ kind: 'loseRecoveries', amount: 2 }] },
    ],
  };
  const result = await run(automation, { targetSelections: [{ id: 'cal', name: 'Cal' }], spendRecoveryResults: [{ spent: 2, currentRecoveries: 4, name: 'Cal' }] });
  assert.deepEqual(result.calls.spendRecoveryForTarget.map((call) => [call.placementId, call.recoveries]), [['cal', 2]]);
  assert.equal((result.calls.applyHeal || []).length, 0);
  assert.match(result.chat, /Cal loses 2 Recoveries \(4 left\)\./);
});

test('the schema keeps near and the new sources; the board pulses every pre-picked token', async () => {
  const harness = await createAbilityAutomationHarness();
  try {
    const { normalized, issues } = harness.validateAutomation(splash(), { strict: false });
    assert.deepEqual(normalized.cards[2].near, { group: 'primary', within: 1 });
    assert.ok(!issues.length, issues.join(' | '));
    const heal = harness.validateAutomation({ schema: 'ability-automation/v3', cards: [{ type: 'effect', effects: [{ kind: 'heal', target: 'self', amountFrom: { source: 'damageDealt', fraction: 0.5 } }, { kind: 'loseRecoveries' }] }] }, { strict: false });
    assert.equal(heal.normalized.cards[0].effects[0].amountFrom.source, 'damageDealt');
    assert.ok(!heal.issues.length, heal.issues.join(' | '));
  } finally { harness.close(); }
  const board = readFileSync(new URL('../../../vtt/assets/js/ui/board-interactions.js', import.meta.url), 'utf8');
  assert.match(board, /if \(preselectedIds\.length\) startSuggestedTargetPulse\(preselectedIds\);/);
});
