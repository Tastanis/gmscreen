import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createAbilityAutomationHarness } from './support/automation-harness.mjs';

// Phase 1, target checks (Brandon, October 2026): "+4 damage against a prone target", "size 1 or smaller only",
// "if the target is winded", "+N if the roll had an edge". Facts come from the token; what the board can't tell is
// asked once. Each target gets the branch that fits it.

const goblin = { id: 'gob', name: 'Goblin', conditions: [{ name: 'prone', sourceId: 'caster-1' }], hp: { current: 4, max: 10 }, monster: { size: '1S', stability: 0, role: 'Goblin Minion' } };
const ogre = { id: 'ogre', name: 'Ogre', conditions: [{ name: 'wet' }], hp: { current: 50, max: 50 }, monster: { size: '2', stability: 2, role: 'Giant Brute' } };
const hero = { id: 'cal', name: 'Cal', conditions: [], hp: { current: 20, max: 30 }, width: 1 };
const caster = { id: 'caster-1', name: 'Bugbear', monster: { size: '1L', stability: 1 } };

async function run(options) {
  const harness = await createAbilityAutomationHarness({ targets: [goblin, ogre, hero, caster] });
  try { return await harness.runAutomation(options); } finally { harness.close(); }
}
const damage = (result) => result.calls.applyDamage.map((call) => [call.placementId, call.amount]);
const chat = (result) => result.calls.postChat.map((call) => call.message).join(' | ');
const strike = (check, extra = {}) => ({
  schema: 'ability-automation/v3',
  cards: [
    { type: 'target', name: 'targets', mode: 'token', predicate: 'creature', count: { value: 2, mode: 'exact' } },
    { type: 'effect', target: 'targets', effects: [{ kind: 'damage', amount: 5 }, { kind: 'ifTarget', ...check, then: [{ kind: 'damage', amount: 4 }], ...extra }] },
  ],
});
const pick = (...tokens) => tokens.map(({ id, name }) => ({ id, name }));

test('ifTarget: a condition, checked per target, custom conditions by name', async () => {
  let result = await run({ automation: strike({ condition: 'prone' }), targetSelections: pick(goblin, ogre) });
  assert.deepEqual(damage(result), [['gob', 5], ['ogre', 5], ['gob', 4]], 'only the prone goblin takes the extra 4');
  assert.match(chat(result), /Goblin is prone; Ogre is not\./);
  result = await run({ automation: strike({ condition: ['Slowed', 'wet'] }), targetSelections: pick(goblin, ogre) });
  assert.deepEqual(damage(result).slice(2), [['ogre', 4]], '"wet", a custom condition, counts by its name');
  // "from you": only conditions this creature applied.
  result = await run({ automation: strike({ condition: 'prone', conditionFrom: 'self' }), targetSelections: pick(goblin, ogre) });
  assert.deepEqual(damage(result).slice(2), [['gob', 4]]);
});

test('ifTarget: size limits, size against the user, and stability', async () => {
  let result = await run({ automation: strike({ sizeMax: 1 }), targetSelections: pick(goblin, ogre) });
  assert.deepEqual(damage(result).slice(2), [['gob', 4]], 'size 1 or smaller: the 1S goblin, not the size 2 ogre');
  result = await run({ automation: strike({ sizeMax: '1M' }), targetSelections: pick(goblin, hero) });
  assert.deepEqual(damage(result).slice(2), [['gob', 4], ['cal', 4]], 'a hero token one square wide counts as 1M');
  result = await run({ automation: strike({ sizeVsSelf: 'sameOrSmaller' }), targetSelections: pick(goblin, ogre) });
  assert.deepEqual(damage(result).slice(2), [['gob', 4]], 'the 1L bugbear: the goblin is smaller, the ogre is larger');
  result = await run({ automation: strike({ stabilityMax: 1 }), targetSelections: pick(goblin, ogre) });
  assert.deepEqual(damage(result).slice(2), [['gob', 4]]);
});

test('ifTarget: Stamina states and kinds of creature', async () => {
  let result = await run({ automation: strike({ stamina: 'winded' }), targetSelections: pick(goblin, ogre) });
  assert.deepEqual(damage(result).slice(2), [['gob', 4]]);
  result = await run({ automation: strike({ stamina: 'full' }), targetSelections: pick(goblin, ogre) });
  assert.deepEqual(damage(result).slice(2), [['ogre', 4]]);
  result = await run({ automation: strike({ keyword: 'giant' }), targetSelections: pick(goblin, ogre) });
  assert.deepEqual(damage(result).slice(2), [['ogre', 4]]);
  result = await run({ automation: strike({ notKeyword: 'giant' }), targetSelections: pick(goblin, ogre) });
  assert.deepEqual(damage(result).slice(2), [['gob', 4]]);
});

test('ifTarget asks once about what the board cannot tell, then uses the answer', async () => {
  // A hero's stability is on the sheet, not the token.
  const result = await run({ automation: strike({ stabilityMax: 1 }), targetSelections: pick(goblin, hero), promptAnswers: [true] });
  assert.deepEqual(damage(result).slice(2), [['gob', 4], ['cal', 4]]);
  assert.match(chat(result), /Is Cal stability 1 or less\? Yes/);
});

test('ifTarget else runs on the rest; who: self follows the user of the ability', async () => {
  let result = await run({ automation: strike({ condition: 'prone' }, { else: [{ kind: 'damage', amount: 1 }] }), targetSelections: pick(goblin, ogre) });
  assert.deepEqual(damage(result).slice(2), [['gob', 4], ['ogre', 1]]);
  result = await run({ automation: strike({ who: 'self', sizeMin: '1L' }), targetSelections: pick(goblin, ogre) });
  assert.deepEqual(damage(result).slice(2), [['gob', 4], ['ogre', 4]], 'the bugbear is 1L, so the whole group gets it');
});

test('a branch card can check a target: "if the target is grabbed by you"', async () => {
  const automation = {
    schema: 'ability-automation/v3',
    cards: [
      { type: 'target', name: 'primary', mode: 'token', predicate: 'creature', count: { value: 1, mode: 'exact' } },
      {
        type: 'branch',
        condition: { kind: 'target', condition: 'prone' },
        then: [{ type: 'effect', target: 'primary', effects: [{ kind: 'damage', amount: 9 }] }],
        else: [{ type: 'effect', target: 'primary', effects: [{ kind: 'damage', amount: 3 }] }],
      },
    ],
  };
  assert.deepEqual(damage(await run({ automation, targetSelections: pick(goblin) })), [['gob', 9]]);
  assert.deepEqual(damage(await run({ automation, targetSelections: pick(ogre) })), [['ogre', 3]]);
});

test('ifRoll: edge, critical and tier of the accepted roll', async () => {
  const rolled = (check) => ({
    schema: 'ability-automation/v3',
    cards: [
      { type: 'target', name: 'primary', mode: 'token', predicate: 'creature', count: { value: 1, mode: 'exact' } },
      {
        type: 'powerRoll', target: 'primary', flatBonus: 0,
        tiers: {
          tier1: { effects: [{ kind: 'damage', amount: 2 }, { kind: 'ifRoll', ...check, then: [{ kind: 'damage', amount: 10 }] }] },
          tier2: { effects: [{ kind: 'damage', amount: 5 }, { kind: 'ifRoll', ...check, then: [{ kind: 'damage', amount: 10 }] }] },
          tier3: { effects: [{ kind: 'damage', amount: 7 }, { kind: 'ifRoll', ...check, then: [{ kind: 'damage', amount: 10 }] }] },
        },
      },
    ],
  });
  // Dice of 10 and 10: a natural 20.
  let result = await run({ automation: rolled({ critical: true }), targetSelections: pick(ogre), randomValues: Array(12).fill(0.99) });
  assert.deepEqual(damage(result), [['ogre', 7], ['ogre', 10]], 'a natural 20 is a critical');
  result = await run({ automation: rolled({ critical: true }), targetSelections: pick(ogre), randomValues: [0.5, 0.5] });
  assert.deepEqual(damage(result).length, 1, 'no critical, no extra');
  result = await run({ automation: rolled({ tier: 'tier3' }), targetSelections: pick(ogre), randomValues: Array(12).fill(0.99) });
  assert.equal(damage(result).length, 2);
  result = await run({ automation: rolled({ edge: 'anyEdge' }), targetSelections: pick(ogre), randomValues: [0.5, 0.5] });
  assert.equal(damage(result).length, 1, 'no edge on a plain roll');
  result = await run({ automation: rolled({ edge: 'anyEdge' }), targetSelections: pick(ogre), powerRollEdges: [1] });
  assert.equal(damage(result).length, 2, 'an edge picked in the roll window counts');
  result = await run({ automation: rolled({ edge: 'doubleEdge' }), targetSelections: pick(ogre), powerRollEdges: [1] });
  assert.equal(damage(result).length, 1, 'a single edge is not a double edge');
});

test('the schema knows the checks and describes them plainly', async () => {
  const harness = await createAbilityAutomationHarness();
  try {
    const { normalized, issues } = harness.validateAutomation(strike({ condition: 'Prone, Grabbed', sizeMax: '1s', stamina: 'Winded', madeUp: 1 }), { strict: false });
    const effect = normalized.cards[1].effects[1];
    assert.deepEqual(effect.condition, ['prone', 'grabbed']);
    assert.equal(effect.sizeMax, '1S');
    assert.equal(effect.stamina, 'winded');
    assert.ok(issues.some((issue) => issue.includes('madeUp')));
    assert.ok(!issues.some((issue) => /unknown effect kind/.test(issue)), issues.join(' | '));
    const P = harness.window.AbilityAutomationPrimitives;
    assert.equal(P.describeTargetTest(effect), 'prone or grabbed and size 1S or smaller and winded');
    const nothing = harness.validateAutomation(strike({}), { strict: false });
    assert.ok(nothing.issues.some((issue) => /checks nothing/.test(issue)));
    const again = harness.validateAutomation(normalized, { strict: false }).normalized;
    assert.deepEqual(again.cards[1].effects[1], effect, 'normalizing twice changes nothing');
    const branch = harness.validateAutomation({ schema: 'ability-automation/v3', cards: [{ type: 'branch', condition: { kind: 'ifRoll', edge: 'double edge' }, then: [] }] }, { strict: false }).normalized;
    assert.deepEqual(branch.cards[0].condition, { kind: 'roll', edge: 'doubleEdge' });
  } finally {
    harness.close();
  }
});
