import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { getPowerRollSuggestions, collectRollPassives } from '../power-roll-suggestions.js';

// Phase 2 (Brandon, October 2026): always-on edge/bane traits "should show up in the dice roller as just ticked on
// and with the name of why tied to that edge... It could say the ability name". Gates the board can read decide if
// the trait shows; a note it can't read ("outdoors") shows ticked with the note as its reason.

const token = (id, team, column, row, extra = {}) => ({ id, name: id, team, column, row, width: 1, height: 1, ...extra });
const lethe = { name: 'Lethe', automation: { passives: [{ kind: 'rollModifier', modifier: 'edge', side: 'both', appliesTo: 'strikes', when: { winded: true } }] } };
const wideGuard = { name: 'Wide Guard', automation: { passives: [{ kind: 'rollModifier', modifier: 'bane', scope: 'alliesWithin', within: 2, appliesTo: 'strikes' }] } };
const strike = { keywords: ['Melee', 'Strike', 'Weapon'], rollEvent: 'powerRoll' };
const passivesFor = (placement) => collectRollPassives(placement?.monster, placement?.sheet);
const traits = (suggestions) => suggestions.filter((entry) => entry.id.startsWith('trait-')).map((entry) => [entry.kind, entry.label, entry.active, entry.count]);

test('a winded demon with Lethe: its strikes have an edge, and so do strikes against it', () => {
  const demon = token('demon', 'enemy', 0, 0, { hp: { current: 10, max: 40 }, monster: { traits: [lethe] } });
  const cal = token('cal', 'ally', 1, 0, { hp: { current: 30, max: 30 } });
  assert.deepEqual(traits(getPowerRollSuggestions({ actor: demon, targets: [cal], placements: [demon, cal], context: strike, passivesFor })), [['edge', 'Lethe', true, 1]]);
  assert.deepEqual(traits(getPowerRollSuggestions({ actor: cal, targets: [demon], placements: [demon, cal], context: strike, passivesFor })), [['edge', 'Lethe', true, 1]]);
  // Not winded: no trait at all.
  const healthy = { ...demon, hp: { current: 40, max: 40 } };
  assert.deepEqual(traits(getPowerRollSuggestions({ actor: cal, targets: [healthy], placements: [healthy, cal], context: strike, passivesFor })), []);
  // Only strikes.
  assert.deepEqual(traits(getPowerRollSuggestions({ actor: demon, targets: [cal], placements: [demon, cal], context: { keywords: ['Magic', 'Area'], rollEvent: 'powerRoll' }, passivesFor })), []);
});

test('Wide Guard: strikes against allies within 2 of the guard take a bane', () => {
  const guard = token('guard', 'enemy', 0, 0, { monster: { traits: [wideGuard] } });
  const archer = token('archer', 'enemy', 2, 0);
  const far = token('far', 'enemy', 6, 0);
  const sharon = token('sharon', 'ally', 3, 0);
  const placements = [guard, archer, far, sharon];
  assert.deepEqual(traits(getPowerRollSuggestions({ actor: sharon, targets: [archer], placements, context: strike, passivesFor })), [['bane', 'Wide Guard', true, 1]]);
  assert.deepEqual(traits(getPowerRollSuggestions({ actor: sharon, targets: [guard], placements, context: strike, passivesFor })), [['bane', 'Wide Guard', true, 1]], 'the guard covers itself');
  assert.deepEqual(traits(getPowerRollSuggestions({ actor: sharon, targets: [far], placements, context: strike, passivesFor })), []);
});

test('condition gates, double edges, notes, and hero features', () => {
  const brute = token('brute', 'enemy', 0, 0, { monster: { abilities: { passive: [{ name: 'Crush the Fallen', automation: { passives: [{ kind: 'rollModifier', modifier: 'doubleEdge', when: { targetCondition: ['prone'] } }] } }] } } });
  const prone = token('cal', 'ally', 1, 0, { conditions: [{ name: 'prone' }] });
  const standing = token('cal', 'ally', 1, 0);
  assert.deepEqual(traits(getPowerRollSuggestions({ actor: brute, targets: [prone], placements: [brute, prone], context: strike, passivesFor })), [['edge', 'Crush the Fallen', true, 2]]);
  assert.deepEqual(traits(getPowerRollSuggestions({ actor: brute, targets: [standing], placements: [brute, standing], context: strike, passivesFor })), []);
  // A gate the board can't read shows ticked, the note as its reason.
  const elf = token('elf', 'enemy', 0, 0, { monster: { traits: [{ name: 'Forest Born', automation: { passives: [{ kind: 'rollModifier', modifier: 'edge', when: { note: 'Outdoors' } }] } }] } });
  const outdoors = getPowerRollSuggestions({ actor: elf, targets: [standing], placements: [elf, standing], context: strike, passivesFor }).find((entry) => entry.label === 'Forest Born');
  assert.equal(outdoors.active, true);
  assert.equal(outdoors.reason, 'Outdoors');
  // A hero's feature.
  const hero = token('zepha', 'ally', 0, 0, { sheet: { features: [{ title: 'Pack Tactics', automation: { passives: [{ kind: 'rollModifier', modifier: 'edge', when: { adjacentAlly: true } }] } }] } });
  const friend = token('friend', 'ally', 0, 1);
  const gob = token('gob', 'enemy', 1, 0);
  assert.deepEqual(traits(getPowerRollSuggestions({ actor: hero, targets: [gob], placements: [hero, friend, gob], context: strike, passivesFor })), [['edge', 'Pack Tactics', true, 1]]);
  assert.deepEqual(traits(getPowerRollSuggestions({ actor: hero, targets: [gob], placements: [hero, gob], context: strike, passivesFor })), []);
});

test('the board hands its tokens\' traits to the suggestions, and the schema keeps the passives', async () => {
  const board = readFileSync(new URL('../board-interactions.js', import.meta.url), 'utf8');
  assert.match(board, /passivesFor: \(placement\) => \{/);
  const { createAbilityAutomationHarness } = await import('../../../../../character_sheet/ability-automation/__tests__/support/automation-harness.mjs');
  const harness = await createAbilityAutomationHarness();
  try {
    const { normalized, issues } = harness.validateAutomation({
      schema: 'ability-automation/v3',
      passives: [
        { kind: 'rollModifier', label: 'Lethe', modifier: 'Double Edge', side: 'both', appliesTo: 'strikes', when: { winded: true, targetCondition: 'Prone' } },
        { kind: 'rollModifier', label: 'Wide Guard', modifier: 'bane', scope: 'alliesWithin', within: 2 },
        { kind: 'endEffect', damage: 20, count: 2 },
      ],
    }, { strict: false });
    assert.ok(!issues.length, issues.join(' | '));
    assert.deepEqual(normalized.passives[0], { kind: 'rollModifier', label: 'Lethe', modifier: 'doubleEdge', side: 'both', appliesTo: 'strikes', when: { winded: true, targetCondition: ['prone'] } });
    assert.deepEqual(normalized.passives[1], { kind: 'rollModifier', label: 'Wide Guard', modifier: 'bane', side: 'against', appliesTo: 'abilityRolls', scope: 'alliesWithin', within: 2 });
    assert.deepEqual(normalized.passives[2], { kind: 'endEffect', label: 'End Effect', damage: 20, count: 2 }, 'endEffect is kept (it used to be skipped)');
  } finally { harness.close(); }
});
