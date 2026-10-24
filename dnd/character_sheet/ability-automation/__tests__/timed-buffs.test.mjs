import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createAbilityAutomationHarness } from './support/automation-harness.mjs';
import { getPowerRollSuggestions } from '../../../vtt/assets/js/ui/power-roll-suggestions.js';

// Phase 2 (Brandon, October 2026): timed buffs ("your next strike gets +2 damage", "edge on your next roll", "+1
// potency until end of turn") appear ticked in the roll window and are used up after that roll; untick to save it.
// Visible as a label on the token with an x to remove.

async function run(automation, options = {}) {
  const harness = await createAbilityAutomationHarness();
  try { return await harness.runAutomation({ automation, ...options }); } finally { harness.close(); }
}

test('a buff effect puts a shown hidden effect on the target with its bonuses', async () => {
  const automation = {
    schema: 'ability-automation/v3',
    cards: [{ type: 'effect', effects: [{ kind: 'buff', target: 'self', label: 'Poison the Blade', modifier: 'edge', damageBonus: 2, appliesTo: 'strikes' }] }],
  };
  const result = await run(automation);
  const call = result.calls.applyCondition[0];
  assert.equal(call.placementId, 'caster-1');
  assert.equal(call.condition.name, 'hiddenEffect');
  assert.equal(call.condition.shown, true, 'its label shows on the token');
  assert.equal(call.condition.label, 'Poison the Blade');
  assert.deepEqual(call.condition.rider, { type: 'rollBuff', appliesTo: { keywordsAll: ['Strike'] }, consume: 'nextMatchingRoll', modifier: 'edge', damageBonus: 2 });
});

const strike = {
  schema: 'ability-automation/v3',
  cards: [
    { type: 'target', name: 'primary', mode: 'token', predicate: 'creature', count: { value: 1, mode: 'exact' } },
    {
      type: 'powerRoll', target: 'primary', flatBonus: 2,
      tiers: {
        tier1: { effects: [{ kind: 'damage', amount: 3 }, { kind: 'potency', attribute: 'M', threshold: 1, onFail: [{ kind: 'condition', name: 'prone', duration: 'endOfTurn' }] }] },
        tier2: { effects: [{ kind: 'damage', amount: 5 }, { kind: 'potency', attribute: 'M', threshold: 1, onFail: [{ kind: 'condition', name: 'prone', duration: 'endOfTurn' }] }] },
        tier3: { effects: [{ kind: 'damage', amount: 7 }, { kind: 'potency', attribute: 'M', threshold: 1, onFail: [{ kind: 'condition', name: 'prone', duration: 'endOfTurn' }] }] },
      },
    },
  ],
};
const ref = { placementId: 'caster-1', conditionIndex: 0 };
const buffSuggestions = (active = true) => [
  { id: 'hidden-effect-caster-1-0', kind: 'edge', label: 'Poison the Blade', active, conditionRef: ref, consume: 'nextMatchingRoll' },
  { id: 'hidden-effect-caster-1-0-damage', kind: 'damage', amount: 2, label: 'Poison the Blade', active, conditionRef: ref, consume: 'nextMatchingRoll' },
  { id: 'hidden-effect-caster-1-0-potency', kind: 'potency', amount: 1, label: 'Poison the Blade', active, conditionRef: ref, consume: 'nextMatchingRoll' },
];

test('ticked +damage and +potency apply to the roll, and the buff is used up once', async () => {
  const consumed = [];
  const result = await run(strike, {
    powerRollTiers: ['tier2'],
    contextOverrides: {
      getPowerRollSuggestions: () => buffSuggestions(true),
      consumeRollRiders: (payload) => { consumed.push(payload.suggestions.map((s) => s.id)); return { removed: 1 }; },
    },
  });
  assert.equal(result.calls.applyDamage[0].amount, 7, '5 + 2 damage');
  assert.equal(result.calls.checkPotency[0].thresholdBonus, 1, '+1 potency');
  assert.deepEqual(consumed, [['hidden-effect-caster-1-0']], 'one condition, used up once');
  assert.ok(result.calls.postChat.some((call) => /\+2 damage \(Poison the Blade\), \+1 potency \(Poison the Blade\)/.test(call.message)));
});

test('unticked, the buff adds nothing and is kept', async () => {
  const consumed = [];
  const result = await run(strike, {
    powerRollTiers: ['tier2'],
    contextOverrides: {
      getPowerRollSuggestions: () => buffSuggestions(false),
      consumeRollRiders: (payload) => { consumed.push(payload); return { removed: 0 }; },
    },
  });
  assert.equal(result.calls.applyDamage[0].amount, 5);
  assert.equal(result.calls.checkPotency[0].thresholdBonus, undefined);
  assert.deepEqual(consumed, []);
});

test('the board makes one suggestion per bonus, and buffs on a target count for rolls against it', () => {
  const token = (id, team, column, extra = {}) => ({ id, name: id, team, column, row: 0, width: 1, height: 1, ...extra });
  const buffed = token('cal', 'ally', 0, { conditions: [{ name: 'hiddenEffect', hidden: true, shown: true, label: 'Poison the Blade', rider: { type: 'rollBuff', modifier: 'edge', damageBonus: 2, appliesTo: { keywordsAll: ['Strike'] }, consume: 'nextMatchingRoll' } }] });
  const gob = token('gob', 'enemy', 1);
  const list = getPowerRollSuggestions({ actor: buffed, targets: [gob], placements: [buffed, gob], context: { keywords: ['Melee', 'Strike'], rollEvent: 'powerRoll' } })
    .filter((entry) => entry.id.startsWith('hidden-effect'));
  assert.deepEqual(list.map((entry) => [entry.kind, entry.amount ?? null, entry.label, entry.active]), [['edge', null, 'Poison the Blade', true], ['damage', 2, 'Poison the Blade', true]]);
  // "Allies have an edge against this target": a buff on the target with side "against".
  const marked = token('gob', 'enemy', 1, { conditions: [{ name: 'hiddenEffect', hidden: true, shown: true, label: 'Marked', rider: { type: 'rollBuff', modifier: 'edge', side: 'against', consume: 'manual' } }] });
  const plain = token('sharon', 'ally', 0);
  const vs = getPowerRollSuggestions({ actor: plain, targets: [marked], placements: [plain, marked], context: { keywords: ['Ranged', 'Strike'], rollEvent: 'powerRoll' } });
  assert.ok(vs.some((entry) => entry.label === 'Marked' && entry.kind === 'edge'));
  // Not on the marked creature's own rolls.
  const own = getPowerRollSuggestions({ actor: marked, targets: [plain], placements: [plain, marked], context: { keywords: ['Melee', 'Strike'], rollEvent: 'powerRoll' } });
  assert.ok(!own.some((entry) => entry.label === 'Marked'));
});

test('shown buffs are on the token by name; the schema knows buff and rollBuff', async () => {
  const presentation = readFileSync(new URL('../../../vtt/assets/js/ui/token-status-presentation.js', import.meta.url), 'utf8');
  assert.match(presentation, /condition\?\.shown !== true/);
  const harness = await createAbilityAutomationHarness();
  try {
    const { normalized, issues } = harness.validateAutomation({ schema: 'ability-automation/v3', cards: [{ type: 'effect', effects: [{ kind: 'buff', label: 'Imbue', potencyBonus: 1, appliesTo: 'Strikes', consume: 'duration' }] }] }, { strict: false });
    assert.deepEqual(normalized.cards[0].effects[0], { kind: 'buff', label: 'Imbue', potencyBonus: 1, side: 'own', appliesTo: 'strikes', duration: 'endOfTurn', consume: 'duration' });
    assert.ok(!issues.length, issues.join(' | '));
    const empty = harness.validateAutomation({ schema: 'ability-automation/v3', cards: [{ type: 'effect', effects: [{ kind: 'buff' }] }] }, { strict: false });
    assert.ok(empty.issues.some((issue) => /no modifier, damageBonus or potencyBonus/.test(issue)));
  } finally { harness.close(); }
});
