import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createAbilityAutomationHarness } from './support/automation-harness.mjs';

// Phase 3 (Brandon, October 2026): counters (rage, deathcount, charges) changed and read by abilities; rise again
// and "when it dies" written as JSON with defaults.

async function run(automation, options = {}) {
  const harness = await createAbilityAutomationHarness();
  const counters = { 'caster-1': { rage: 2 }, 'target-1': { deathcount: 4 } };
  const changes = [];
  try {
    const result = await harness.runAutomation({
      automation,
      contextOverrides: {
        getCounter: ({ placementId, name }) => counters[placementId]?.[name] ?? 0,
        changeCounter: (payload) => {
          changes.push(payload);
          const previous = counters[payload.placementId]?.[payload.name] ?? 0;
          const value = payload.op === 'set' ? payload.amount : payload.op === 'spend' ? Math.max(0, previous - payload.amount) : previous + payload.amount;
          counters[payload.placementId] = { ...(counters[payload.placementId] || {}), [payload.name]: value };
          return { value, previous, label: payload.name === 'rage' ? 'Rage' : payload.name };
        },
      },
      ...options,
    });
    return { ...result, changes, counters, chat: result.calls.postChat.map((c) => c.message).join(' | ') };
  } finally { harness.close(); }
}

test('counter effect: add on self by default, spend says when short', async () => {
  let result = await run({ schema: 'ability-automation/v3', cards: [{ type: 'effect', effects: [{ kind: 'counter', name: 'Rage', amount: 3 }] }] });
  assert.deepEqual(result.changes.map((c) => [c.placementId, c.name, c.op, c.amount]), [['caster-1', 'rage', 'add', 3]]);
  assert.match(result.chat, /Rage is now 5\./);
  result = await run({ schema: 'ability-automation/v3', cards: [{ type: 'effect', effects: [{ kind: 'counter', name: 'rage', op: 'spend', amount: 5 }] }] });
  assert.match(result.chat, /Rage is now 0 \(only had 2\)\./);
});

test('ifCounter and branch "counter" read the value', async () => {
  const automation = (test) => ({
    schema: 'ability-automation/v3',
    cards: [
      { type: 'target', name: 'primary', mode: 'token', predicate: 'creature', count: { value: 1, mode: 'exact' } },
      { type: 'effect', target: 'primary', effects: [{ kind: 'damage', amount: 5 }, { kind: 'ifCounter', ...test, then: [{ kind: 'damage', amount: 3 }], else: [{ kind: 'damage', amount: 1 }] }] },
    ],
  });
  let result = await run(automation({ name: 'rage', min: 2 }));
  assert.deepEqual(result.calls.applyDamage.map((c) => c.amount), [5, 3], 'self rage 2 is at least 2');
  result = await run(automation({ name: 'rage', min: 3 }));
  assert.deepEqual(result.calls.applyDamage.map((c) => c.amount), [5, 1]);
  result = await run(automation({ name: 'deathcount', who: 'target', max: 4 }));
  assert.deepEqual(result.calls.applyDamage.map((c) => c.amount), [5, 3], "the target's deathcount");
  const branch = {
    schema: 'ability-automation/v3',
    cards: [
      { type: 'target', name: 'primary', mode: 'token', predicate: 'creature', count: { value: 1, mode: 'exact' } },
      { type: 'branch', condition: { kind: 'counter', name: 'rage', min: 1 }, then: [{ type: 'effect', target: 'primary', effects: [{ kind: 'damage', amount: 9 }] }] },
    ],
  };
  result = await run(branch);
  assert.deepEqual(result.calls.applyDamage.map((c) => c.amount), [9]);
});

test('the schema: counter, ifCounter, deathRule and counter passives, trigger resolve', async () => {
  const harness = await createAbilityAutomationHarness();
  try {
    const { normalized, issues } = harness.validateAutomation({
      schema: 'ability-automation/v3',
      cards: [
        { type: 'trigger', condition: 'When the werewolf takes damage', match: { event: 'damage', filter: { whose: 'self' } }, resolve: 'auto', effects: [{ kind: 'counter', name: 'rage', amount: 1 }] },
        { type: 'trigger', condition: 'When it dies', match: { event: 'staminaZero', filter: { whose: 'self' } }, resolve: 'Popup', usesTriggeredAction: true, effects: [] },
      ],
      passives: [
        { kind: 'deathRule', notWhenDamageTypes: 'fire, holy' },
        { kind: 'deathRule', label: 'Relentless', uses: 'unlimited', setStamina: 5, conditions: [] },
        { kind: 'counter', name: 'Rage', max: 10 },
      ],
    }, { strict: false });
    assert.ok(!issues.length, issues.join(' | '));
    assert.equal(normalized.cards[0].resolve, 'auto');
    assert.equal(normalized.cards[0].autoResolve, true, 'auto is autoResolve');
    assert.equal(normalized.cards[1].resolve, 'popup');
    assert.equal(normalized.cards[1].usesTriggeredAction, true);
    assert.deepEqual(normalized.passives[0], { kind: 'deathRule', label: 'Rise Again', setStamina: 1, conditions: ['prone'], conditionDuration: 'endOfEncounter', uses: 1, resetAt: 'combatEnd', notWhenDamageTypes: ['fire', 'holy'] });
    assert.deepEqual(normalized.passives[1], { kind: 'deathRule', label: 'Relentless', setStamina: 5, conditions: [], conditionDuration: 'endOfEncounter', uses: 'unlimited', resetAt: 'combatEnd' });
    assert.deepEqual(normalized.passives[2], { kind: 'counter', name: 'rage', label: 'Rage', start: 0, min: 0, resetAt: 'combatEnd', max: 10 });
  } finally { harness.close(); }
});
