import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createAbilityAutomationHarness } from './support/automation-harness.mjs';

// Phase 1 (Brandon, October 2026): Malice gained by abilities is added by itself and chat says why ("Add it, say
// so"); pushing a restrained creature warns but always lets you ("Warn, then let you"), and abilities that say
// they can ("a target restrained by a dwarf can be force moved") don't warn; monster abilities can give surges.

async function run(automation, options = {}) {
  const harness = await createAbilityAutomationHarness();
  try {
    const result = await harness.runAutomation({ automation, ...options });
    return { ...result, chat: result.calls.postChat.map((call) => call.message).join(' | ') };
  } finally { harness.close(); }
}
const malice = (effect) => ({ schema: 'ability-automation/v3', cards: [{ type: 'effect', effects: [{ kind: 'maliceGain', ...effect }] }] });

test('maliceGain adds to the counter and says so', async () => {
  const gained = [];
  const result = await run(malice({ amount: 2 }), { contextOverrides: { gainMalice: (payload) => { gained.push(payload.amount); return { added: payload.amount, current: 7 }; } } });
  assert.deepEqual(gained, [2]);
  assert.match(result.chat, /\+2 Malice \(now 7\)\./);
});

test('maliceGain on a client that does not keep the counter is a reminder', async () => {
  const result = await run(malice({}), { contextOverrides: { gainMalice: () => ({ skipped: true, reason: 'gm-only' }) } });
  assert.match(result.chat, /the Director gains 1 Malice \(add it by hand\)\./);
});

test('maliceGain is known to the schema, and allowed in triggers that resolve by themselves', async () => {
  const harness = await createAbilityAutomationHarness();
  try {
    const { normalized, issues } = harness.validateAutomation(malice({ amount: 3 }), { strict: false });
    assert.deepEqual(normalized.cards[0].effects[0], { kind: 'maliceGain', amount: 3 });
    assert.ok(!issues.length, issues.join(' | '));
    const trigger = harness.validateAutomation({
      schema: 'ability-automation/v3',
      cards: [{ type: 'trigger', condition: 'A demon dies within 10 squares', autoResolve: true, match: { event: 'staminaZero', filter: { whose: 'ally', withinSquares: 10 } }, effects: [{ kind: 'maliceGain', amount: 1 }] }],
    }, { strict: false });
    assert.ok(!trigger.issues.some((issue) => /not supported by trigger autoResolve/.test(issue)), trigger.issues.join(' | '));
  } finally { harness.close(); }
  const board = readFileSync(new URL('../../../vtt/assets/js/ui/board-interactions.js', import.meta.url), 'utf8');
  const ongoing = board.slice(board.indexOf('async function applyOngoingAutomationEffects'), board.indexOf("if (effect.kind === 'damage')", board.indexOf('async function applyOngoingAutomationEffects')));
  assert.match(ongoing, /effect\.kind === 'maliceGain'/, 'an auto-resolved trigger adds the Malice too');
});

test('forced movement passes ignoreRestrained on; the board only warns about restrained', async () => {
  const automation = (extra) => ({
    schema: 'ability-automation/v3',
    cards: [
      { type: 'target', name: 'primary', mode: 'token', predicate: 'creature', count: { value: 1, mode: 'exact' } },
      { type: 'effect', target: 'primary', effects: [{ kind: 'forcedMovement', verb: 'push', distance: 2, ...extra }] },
    ],
  });
  let result = await run(automation({ ignoreRestrained: true }));
  assert.equal(result.calls.forceMove[0].ignoreRestrained, true);
  result = await run(automation({}));
  assert.equal(result.calls.forceMove[0].ignoreRestrained, undefined);
  const board = readFileSync(new URL('../../../vtt/assets/js/ui/board-interactions.js', import.meta.url), 'utf8');
  const handler = board.slice(board.indexOf('async function handleAutomationForceMoveRequest'), board.indexOf('function resolveAutomationSourcePlacement'));
  assert.match(handler, /is restrained: normally can't be force moved\. Move it anyway or skip\./);
  assert.match(handler, /startAutomationMoveSelection\(/, 'the move picker still opens');
  assert.ok(!/targetRestrained[^\n]*return/.test(handler), 'nothing stops the move');
});

test('monster abilities get the surge and Malice hooks', () => {
  const glue = readFileSync(new URL('../../../vtt/assets/js/ui/monster-ability-runner-glue.js', import.meta.url), 'utf8');
  assert.match(glue, /applySurgeGain: board\.applySurgeGain/);
  assert.match(glue, /gainMalice: board\.gainMalice/);
});

test('flexibility review: Malice can be lost, zones and auras know "ends its turn there", buffs filter by keyword', async () => {
  const lost = [];
  const result = await run(malice({ amount: -2 }), { contextOverrides: { gainMalice: (payload) => { lost.push(payload.amount); return { added: -2, current: 3 }; } } });
  assert.deepEqual(lost, [-2]);
  assert.match(result.chat, /−2 Malice \(now 3\)\./);
  const harness = await createAbilityAutomationHarness();
  try {
    const { normalized, issues } = harness.validateAutomation({
      schema: 'ability-automation/v3',
      cards: [
        { type: 'target', name: 'area', mode: 'area', shape: 'cube', size: 3, predicate: 'creature' },
        { type: 'persistent', triggers: ['onOccupantTurnEnd'], effects: [{ kind: 'damage', amount: 2 }] },
        { type: 'effect', effects: [{ kind: 'aura', radius: 2, triggers: [{ event: 'occupantTurnEnd' }], effects: [{ kind: 'damage', amount: 1 }] }] },
        { type: 'effect', effects: [{ kind: 'buff', label: 'Arcane Focus', damageBonus: 2, keywordsAny: ['Magic'] }] },
      ],
    }, { strict: false });
    assert.ok(!issues.length, issues.join(' | '));
    assert.deepEqual(normalized.cards[1].triggers, ['onOccupantTurnEnd']);
    assert.equal(normalized.cards[3].effects[0].keywordsAny[0], 'Magic');
  } finally { harness.close(); }
  const buffed = await run({ schema: 'ability-automation/v3', cards: [{ type: 'effect', effects: [{ kind: 'buff', target: 'self', label: 'Arcane Focus', damageBonus: 2, keywordsAny: ['Magic'] }] }] });
  assert.deepEqual(buffed.calls.applyCondition[0].condition.rider.appliesTo, { rollEvent: 'powerRoll', keywordsAny: ['Magic'] });
});
