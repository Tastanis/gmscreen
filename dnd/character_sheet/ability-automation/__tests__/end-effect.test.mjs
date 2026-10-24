import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createAbilityAutomationHarness } from './support/automation-harness.mjs';
import { endEffectFor, endEffectFromText } from '../../../vtt/assets/js/ui/end-effect.mjs';

// Phase 1, End Effect (Brandon, October 2026): "In the save popup" — the save-ends popup at the end of a solo's or
// leader's turn gets "End it: take N damage" (the damage can't be reduced). Abilities can end conditions too
// (endCondition): "an ally ends one condition", "end one save-ends effect".

test('End Effect is read from the trait as the Monsters book writes it', () => {
  const dragon = { traits: [{ name: 'Solo Monster', text: 'End Effect: At the end of each of their turns, the dragon can take 20 damage to end one effect on them that can be ended by a saving throw. This damage can’t be reduced in any way.' }] };
  assert.deepEqual(endEffectFor(dragon), { damage: 20, count: 1, label: 'End Effect' });
  const ajax = { abilities: { passive: [{ name: 'End Effect', effect: 'At the end of each of his turns, Ajax can take 20 damage to end up to two save ends effects on him.' }] } };
  assert.deepEqual(endEffectFor(ajax), { damage: 20, count: 2, label: 'End Effect' });
  assert.equal(endEffectFromText('The chimera can take 5 damage to end one effect on them that can be ended by a saving throw.').damage, 5);
  assert.equal(endEffectFor({ traits: [{ name: 'Brute', text: 'Strikes hard.' }] }), null);
  assert.equal(endEffectFor(null), null);
});

test('an endEffect passive in the JSON wins over the words', () => {
  const monster = {
    traits: [{ name: 'End Effect', text: 'take 20 damage to end one effect', automation: { passives: [{ kind: 'endEffect', damage: 10, count: 2, label: 'Shake It Off' }] } }],
  };
  assert.deepEqual(endEffectFor(monster), { damage: 10, count: 2, label: 'Shake It Off' });
});

test('the save popup offers it and the damage ignores immunity', () => {
  const board = readFileSync(new URL('../../../vtt/assets/js/ui/board-interactions.js', import.meta.url), 'utf8');
  assert.match(board, /const endEffect = endEffectFor\(getPlacementFromStore\(placementId\)\?\.monster\);/);
  assert.match(board, /End it: take \$\{endEffect\.damage\} damage/);
  const handler = board.slice(board.indexOf('const handleEndEffectClick'), board.indexOf('const updateEndEffectButton'));
  assert.match(handler, /ignoreImmunity: true/);
  assert.match(handler, /applySaveEndsSuccess\(entry\)/);
});

const goblin = { id: 'gob', name: 'Goblin', conditions: [{ name: 'slowed', duration: 'save-ends' }, { name: 'bleeding', duration: { type: 'end-of-turn' } }, { name: 'hiddenEffect', duration: 'end-of-turn' }] };

async function run(automation, options = {}) {
  const harness = await createAbilityAutomationHarness({ targets: [goblin] });
  const removed = [];
  try {
    const result = await harness.runAutomation({
      automation,
      targetSelections: [{ id: 'gob', name: 'Goblin' }],
      contextOverrides: { removeCondition: (payload) => { removed.push([payload.placementId, payload.condition.name]); return { removed: true }; } },
      ...options,
    });
    return { ...result, removed, chat: result.calls.postChat.map((call) => call.message).join(' | ') };
  } finally { harness.close(); }
}
const ending = (effect) => ({
  schema: 'ability-automation/v3',
  cards: [
    { type: 'target', name: 'primary', mode: 'token', predicate: 'creature', count: { value: 1, mode: 'exact' } },
    { type: 'effect', target: 'primary', effects: [{ kind: 'endCondition', ...effect }] },
  ],
});

test('endCondition: the user picks which one ends when there is a choice', async () => {
  const result = await run(ending({}), { choiceSelections: ['c1'] });
  assert.deepEqual(result.removed, [['gob', 'bleeding']], 'hidden effects are never offered');
  assert.match(result.chat, /bleeding on Goblin ends\./);
});

test('endCondition: by name, by duration, and all at once', async () => {
  let result = await run(ending({ condition: 'slowed' }));
  assert.deepEqual(result.removed, [['gob', 'slowed']], 'one match needs no choice');
  result = await run(ending({ duration: 'saveEnds' }));
  assert.deepEqual(result.removed, [['gob', 'slowed']]);
  result = await run(ending({ pick: 'all' }));
  assert.deepEqual(result.removed, [['gob', 'slowed'], ['gob', 'bleeding']]);
  result = await run(ending({ condition: 'prone' }));
  assert.deepEqual(result.removed, []);
  assert.match(result.chat, /Goblin has nothing to end\./);
});

test('endCondition is known to the schema', async () => {
  const harness = await createAbilityAutomationHarness();
  try {
    const { normalized, issues } = harness.validateAutomation(ending({ condition: 'Slowed', duration: 'save ends', count: 2 }), { strict: false });
    const effect = normalized.cards[1].effects[0];
    assert.deepEqual(effect, { kind: 'endCondition', condition: ['slowed'], duration: 'saveEnds', pick: 'choose', count: 2 });
    assert.ok(!issues.length, issues.join(' | '));
    assert.equal(harness.window.AbilityAutomationPrimitives.describeEffect(effect), 'end up to 2 slowed');
  } finally { harness.close(); }
});
