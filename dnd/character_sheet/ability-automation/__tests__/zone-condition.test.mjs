import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createAbilityAutomationHarness } from './support/automation-harness.mjs';

const twoTargets = [
  { id: 'cal', name: 'Cal' },
  { id: 'sharon', name: 'Sharon' },
];
// Drag, as written for Kragen: slide the targets, and any that end in blood are also bleeding.
const dragInBlood = (effect = {}) => ({
  schema: 'ability-automation/v3',
  cards: [
    { type: 'target', name: 'targets', mode: 'token', predicate: 'creatureOrObject', count: { value: 2, mode: 'exact' } },
    {
      type: 'effect',
      target: 'targets',
      effects: [
        { kind: 'damage', amount: 6, damageType: 'untyped' },
        {
          kind: 'ifZone',
          tag: 'blood',
          then: [{ kind: 'condition', name: 'bleeding', duration: 'saveEnds' }],
          else: [{ kind: 'floatingText', text: 'Dry' }],
          ...effect,
        },
      ],
    },
  ],
});
// Each run gets its own harness: a harness keeps one running record of every call made through it.
async function run(options) {
  const harness = await createAbilityAutomationHarness();
  try { return await harness.runAutomation(options); } finally { harness.close(); }
}
const conditionsOn = (result) => result.calls.applyCondition.map((call) => [call.placementId || call.targetId, call.condition?.name || call.name]);
const chat = (result) => result.calls.postChat.map((call) => call.message);

test('ifZone gives each target the branch that fits where it stands', async () => {
  const result = await run({
    automation: dragInBlood(),
    targetSelections: twoTargets,
    zoneTags: { cal: ['blood'], sharon: [] },
  });
  assert.deepEqual(result.calls.getZoneTags, ['cal', 'sharon'], 'the board is asked about each target');
  assert.deepEqual(conditionsOn(result), [['cal', 'bleeding']], 'only the target in blood bleeds');
  assert.equal(result.calls.applyDamage.length, 2, 'both still take the damage');
  assert.ok(chat(result).some((line) => /Cal is in blood; Sharon is not in blood\./.test(line)), chat(result).join(' | '));
  assert.ok(!chat(result).some((line) => /\? (Yes|No)\./.test(line)), 'nobody is asked');
});

test('ifZone: everyone in, nobody in, and "any of these tags"', async () => {
  let result = await run({ automation: dragInBlood(), targetSelections: twoTargets, zoneTags: { cal: ['water', 'blood'], sharon: ['blood'] } });
  assert.deepEqual(conditionsOn(result), [['cal', 'bleeding'], ['sharon', 'bleeding']]);
  assert.ok(chat(result).some((line) => /Cal, Sharon are in blood\./.test(line)));
  result = await run({ automation: dragInBlood(), targetSelections: twoTargets, zoneTags: { cal: ['water'], sharon: [] } });
  assert.deepEqual(conditionsOn(result), []);
  assert.ok(chat(result).some((line) => /Cal, Sharon are not in blood\./.test(line)));
  // Any of several tags, written in any case.
  result = await run({ automation: dragInBlood({ tag: undefined, tags: ['Blood', 'WATER'] }), targetSelections: twoTargets, zoneTags: { cal: ['water'], sharon: ['mud'] } });
  assert.deepEqual(conditionsOn(result), [['cal', 'bleeding']]);
  assert.ok(chat(result).some((line) => /Cal is in blood or water; Sharon is not in blood or water\./.test(line)));
});

test('ifZone asks once, like ifPrompt, when the scene has no zones or the host cannot say', async () => {
  // A scene with no zone data.
  let result = await run({ automation: dragInBlood(), targetSelections: twoTargets, zoneTags: null, promptAnswers: [true] });
  assert.deepEqual(conditionsOn(result), [['cal', 'bleeding'], ['sharon', 'bleeding']], 'yes applies to every target, as a prompt always has');
  assert.ok(chat(result).some((line) => /Is Cal in blood\? Yes\./.test(line)), chat(result).join(' | '));
  result = await run({ automation: dragInBlood(), targetSelections: twoTargets, zoneTags: null, promptAnswers: [false] });
  assert.deepEqual(conditionsOn(result), []);
  // A host with no zone callback at all (an older board).
  result = await run({ automation: dragInBlood({ question: 'Does the slide end in blood?' }), targetSelections: twoTargets, promptAnswers: [true] });
  assert.equal(result.calls.getZoneTags.length, 0);
  assert.deepEqual(conditionsOn(result), [['cal', 'bleeding'], ['sharon', 'bleeding']]);
  assert.ok(chat(result).some((line) => /Does the slide end in blood\? Yes\./.test(line)), 'the author\'s own question is used');
});

test('ifZone with who: "self" follows where the user of the ability stands', async () => {
  const automation = dragInBlood({ who: 'self' });
  let result = await run({ automation, targetSelections: twoTargets, zoneTags: { 'caster-1': ['blood'], cal: [], sharon: [] } });
  assert.deepEqual(result.calls.getZoneTags, ['caster-1']);
  assert.deepEqual(conditionsOn(result), [['cal', 'bleeding'], ['sharon', 'bleeding']], 'the whole group follows the caster');
  result = await run({ automation, targetSelections: twoTargets, zoneTags: { 'caster-1': [], cal: ['blood'], sharon: ['blood'] } });
  assert.deepEqual(conditionsOn(result), []);
});

test('a branch card can turn on a zone: "while Kragen stands in blood"', async () => {
  const automation = {
    schema: 'ability-automation/v3',
    cards: [
      { type: 'target', name: 'primary', mode: 'token', predicate: 'creatureOrObject', count: { value: 1, mode: 'exact' } },
      {
        type: 'branch',
        condition: { kind: 'zone', who: 'self', tag: 'blood' },
        then: [{ type: 'effect', target: 'primary', effects: [{ kind: 'damage', amount: 9, damageType: 'untyped' }] }],
        else: [{ type: 'effect', target: 'primary', effects: [{ kind: 'damage', amount: 5, damageType: 'untyped' }] }],
      },
    ],
  };
  let result = await run({ automation, targetSelections: [{ id: 'cal', name: 'Cal' }], zoneTags: { 'caster-1': ['blood'] } });
  assert.equal(result.calls.applyDamage[0].amount, 9);
  result = await run({ automation, targetSelections: [{ id: 'cal', name: 'Cal' }], zoneTags: { 'caster-1': ['water'] } });
  assert.equal(result.calls.applyDamage[0].amount, 5);
  // The target's position decides when who is "target".
  const byTarget = JSON.parse(JSON.stringify(automation)); byTarget.cards[1].condition = { kind: 'ifZone', tag: 'blood' };
  result = await run({ automation: byTarget, targetSelections: [{ id: 'cal', name: 'Cal' }], zoneTags: { cal: ['blood'], 'caster-1': [] } });
  assert.equal(result.calls.applyDamage[0].amount, 9);
});

test('ifZone is known to the schema and reads plainly in the summary', async () => {
  const harness = await createAbilityAutomationHarness();
  try {
    const { issues, normalized } = harness.validateAutomation(dragInBlood({ tag: ' Blood ', madeUpField: 1 }), { strict: false });
    const effect = normalized.cards[1].effects[1];
    assert.equal(effect.kind, 'ifZone');
    assert.deepEqual(effect.tags, ['blood'], 'the tag is stored the way the map writes it');
    assert.equal(effect.who, 'target');
    assert.ok(!issues.some((issue) => /unknown effect kind/.test(issue)), issues.join(' | '));
    assert.ok(issues.some((issue) => issue.includes('madeUpField')), 'unknown fields are still reported');
    assert.equal(harness.window.AbilityAutomationPrimitives.describeEffect(effect), 'If target in blood: bleeding (save ends) else: floating text: Dry'.replace('bleeding (save ends)', harness.window.AbilityAutomationPrimitives.describeEffect(effect.then[0])));
    // No tag at all is allowed but warned about: it can only ever ask.
    const bare = harness.validateAutomation(dragInBlood({ tag: undefined }), { strict: false });
    assert.ok(bare.issues.some((issue) => /ifZone has no tag/.test(issue)));
    // Two words become one tag, as zone tags are written.
    assert.deepEqual(harness.validateAutomation(dragInBlood({ tag: 'Deep Water' }), { strict: false }).normalized.cards[1].effects[1].tags, ['deep-water']);
    // Normalizing twice changes nothing.
    const again = harness.validateAutomation(normalized, { strict: false }).normalized;
    assert.deepEqual(again.cards[1].effects[1], effect);
  } finally {
    harness.close();
  }
});

test('the worked example in AUTHORING.md runs exactly as written: extra damage only in blood', async () => {
  const guide = await readFile(new URL('../AUTHORING.md', import.meta.url), 'utf8');
  const block = guide.split('<!-- zone-example:start -->')[1].split('<!-- zone-example:end -->')[0];
  const automation = JSON.parse(block.replace(/```json|```/g, ''));
  const hits = async (options) => (await run({ automation, targetSelections: [{ id: 'cal', name: 'Cal' }], randomValues: [0.5, 0.5], ...options })).calls.applyDamage.map((call) => [call.amount, call.damageType]);
  const dry = await hits({ zoneTags: { cal: [] } });
  const inBlood = await hits({ zoneTags: { cal: ['blood'] } });
  assert.equal(dry.length, 1, 'the strike only');
  assert.deepEqual(inBlood, [dry[0], [3, 'corruption']], 'the strike, then 3 corruption for standing in blood');
  // A map with no zones asks instead, and the answer decides.
  assert.equal((await hits({ zoneTags: null, promptAnswers: [true] })).length, 2);
  assert.equal((await hits({ zoneTags: null, promptAnswers: [false] })).length, 1);
  // The guide's example is valid as written: the schema has nothing to say about it.
  const harness = await createAbilityAutomationHarness();
  try {
    assert.deepEqual(harness.validateAutomation(automation, { strict: false }).issues, []);
  } finally {
    harness.close();
  }
});
