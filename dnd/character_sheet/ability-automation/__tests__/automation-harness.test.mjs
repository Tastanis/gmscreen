import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createAbilityAutomationHarness } from './support/automation-harness.mjs';

async function loadLegacyNestedExtraFixture() {
  const source = await readFile(
    new URL('./fixtures/legacy-nested-extra.json', import.meta.url),
    'utf8'
  );
  return JSON.parse(source);
}

async function loadAuthoredCharacterAbility(relativePath, abilityName) {
  const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
  const escapedName = abilityName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const section = source.match(new RegExp(`### ${escapedName}[\\s\\S]*?\`\`\`json\\s*([\\s\\S]*?)\`\`\``));
  assert.ok(section, `found ${abilityName} JSON in ${relativePath}`);
  return JSON.parse(section[1]);
}

function extraChainDepth(node) {
  let depth = 0;
  let current = node;
  const seen = new Set();
  while (
    current
    && typeof current === 'object'
    && !Array.isArray(current)
    && current._extra
    && typeof current._extra === 'object'
    && !Array.isArray(current._extra)
    && !seen.has(current._extra)
  ) {
    seen.add(current._extra);
    depth += 1;
    current = current._extra;
  }
  return depth;
}

function assertCanonicalExtra(node, label) {
  assert.ok(node?._extra && typeof node._extra === 'object', `${label} keeps extras`);
  assert.equal(
    Object.prototype.hasOwnProperty.call(node._extra, '_extra'),
    false,
    `${label} has no nested _extra container`
  );
}

test('validation exposes schema warnings and unsupported extra fields', async () => {
  const harness = await createAbilityAutomationHarness();
  try {
    const { issues, normalized } = harness.validateAutomation({
      schema: 'ability-automation/v3',
      cards: [
        {
          type: 'effect',
          id: 'effect-1',
          target: 'primary',
          mysteryBlockField: true,
          effects: [
            { kind: 'damage', amount: 3, damageType: 'radiant', madeUpEffectField: 1 },
            { kind: 'explode', amount: 99 },
          ],
        },
      ],
    }, { strict: false });

    assert.ok(issues.some((issue) => issue.includes('damage type "radiant" not in registry')));
    assert.ok(issues.some((issue) => issue.includes('unknown effect kind "explode"')));
    assert.ok(issues.some((issue) => issue.includes('mysteryBlockField')));
    assert.ok(issues.some((issue) => issue.includes('madeUpEffectField')));
    assert.equal(normalized.cards[0].effects[1].kind, 'note');
  } finally {
    harness.close();
  }
});

test('target selection guides and persistent condition riders normalize idempotently', async () => {
  const harness = await createAbilityAutomationHarness();
  try {
    const input = {
      schema: 'ability-automation/v3',
      cards: [
        {
          type: 'target',
          id: 'target-1',
          name: 'primary',
          mode: 'token',
          range: 5,
          rangeOrigin: 'setupTarget',
        },
        {
          type: 'effect',
          id: 'effect-1',
          target: 'primary',
          effects: [{
            kind: 'condition',
            name: 'grabbed',
            duration: 'saveEnds',
            riders: [{
              id: 'crushing-grab',
              when: 'turnStart',
              target: 'bearer',
              effects: [{ kind: 'damage', amount: 5, damageType: 'fire' }],
            }],
          }],
        },
      ],
    };
    const once = harness.window.AbilityAutomationSchema.normalizeAutomation(input);
    let repeated = once;
    for (let index = 0; index < 100; index += 1) {
      repeated = harness.window.AbilityAutomationSchema.normalizeAutomation(repeated);
    }
    assert.deepEqual(repeated, once);
    assert.equal(once.cards[0].distance.value, 5);
    assert.equal(once.cards[0].rangeOrigin, 'setupTarget');
    const explicitGuide = harness.window.AbilityAutomationSchema.normalizeAutomation({
      schema: 'ability-automation/v3',
      cards: [{ type: 'target', mode: 'token', selectionGuide: { range: 8, form: 'ranged' } }],
    });
    assert.deepEqual(explicitGuide.cards[0].selectionGuide, { range: 8, form: 'ranged', enforce: false });
    assert.deepEqual(once.cards[1].effects[0].riders[0].effects[0], {
      kind: 'damage',
      amount: 5,
      amountDice: '',
      markBonusDice: '',
      markPredicate: '',
      attribute: '',
      damageType: 'fire',
    });
  } finally {
    harness.close();
  }
});

test('follow-up target ranges can originate at an earlier token or placed area', async () => {
  const harness = await createAbilityAutomationHarness();
  try {
    const tokenOrigin = await harness.runAutomation({
      automation: {
        schema: 'ability-automation/v3',
        cards: [
          {
            type: 'target',
            name: 'firstTarget',
            mode: 'token',
            count: { value: 1, mode: 'exact' },
          },
          {
            type: 'target',
            name: 'nearFirstTarget',
            mode: 'token',
            count: { value: 1, mode: 'exact' },
            distance: { form: 'ranged', value: 3 },
            rangeOrigin: 'firstTarget',
          },
        ],
      },
      sourcePlacement: { id: 'caster', name: 'Caster', column: 1, row: 1 },
      targetSelections: [
        { id: 'enemy-1', name: 'Enemy', placement: { id: 'enemy-1', column: 8, row: 9, width: 1, height: 1 } },
        { id: 'enemy-2', name: 'Nearby Enemy' },
      ],
    });
    assert.deepEqual(tokenOrigin.calls.selectTarget[1].sourcePlacement, {
      id: 'enemy-1',
      column: 8,
      row: 9,
      width: 1,
      height: 1,
    });

    const areaOrigin = await harness.runAutomation({
      automation: {
        schema: 'ability-automation/v3',
        cards: [
          {
            type: 'target',
            name: 'chosenLocation',
            mode: 'area',
            shape: 'cube',
            size: 1,
            count: { value: 1, mode: 'exact' },
          },
          {
            type: 'target',
            name: 'nearLocation',
            mode: 'token',
            count: { value: 1, mode: 'exact' },
            distance: { form: 'ranged', value: 5 },
            rangeOrigin: 'chosenLocation',
          },
        ],
      },
      areaSelections: [{
        targets: [],
        template: { column: 11, row: 12, width: 2, height: 3 },
      }],
      targetSelections: [{ id: 'enemy-3', name: 'Enemy Three' }],
    });
    assert.deepEqual(areaOrigin.calls.selectTarget.at(-1).sourcePlacement, {
      id: 'automation-area:chosenLocation',
      name: 'chosenLocation',
      column: 11,
      row: 12,
      width: 2,
      height: 3,
    });
  } finally {
    harness.close();
  }
});

test('multi-target selection exposes Done after one pick without canceling the ability', async () => {
  const harness = await createAbilityAutomationHarness();
  try {
    const result = await harness.runAutomation({
      automation: {
        schema: 'ability-automation/v3',
        cards: [
          {
            type: 'target',
            name: 'targets',
            mode: 'token',
            predicate: 'creatureOrObject',
            count: { value: 2, mode: 'exact' },
          },
          {
            type: 'effect',
            target: 'targets',
            effects: [{ kind: 'damage', amount: 4, damageType: 'fire' }],
          },
        ],
      },
      targetSelections: [
        { id: 'target-1', name: 'Only Target' },
        { done: true },
      ],
    });

    assert.equal(result.calls.selectTarget.length, 2);
    assert.equal(result.calls.selectTarget[0].showPrompt, true);
    assert.equal(result.calls.selectTarget[0].allowDone, false);
    assert.equal(result.calls.selectTarget[1].showPrompt, true);
    assert.equal(result.calls.selectTarget[1].allowDone, true);
    assert.equal(result.calls.applyDamage.length, 1);
    assert.equal(result.calls.applyDamage[0].placementId, 'target-1');
  } finally {
    harness.close();
  }
});

test('authored Materialize chains its strained range from the hit target', async () => {
  const harness = await createAbilityAutomationHarness();
  try {
    const materialize = await loadAuthoredCharacterAbility(
      '../../../ai-reference/characters/indigo-automations.md',
      'Materialize'
    );
    const branch = materialize.automation.cards.find((card) => card.type === 'branch');
    const adjacentPick = branch?.then?.find((card) => card.type === 'target');
    assert.equal(adjacentPick?.rangeOrigin, 'target');
    assert.deepEqual(adjacentPick?.distance, {
      form: 'melee',
      value: 1,
      secondary: 0,
      within: 0,
    });
    assert.deepEqual(
      harness.window.AbilityAutomationSchema.normalizeAutomation(materialize.automation).warnings,
      []
    );
  } finally {
    harness.close();
  }
});

test('authored Bifurcated Incineration can continue with one selected target', async () => {
  const harness = await createAbilityAutomationHarness();
  try {
    const bifurcated = await loadAuthoredCharacterAbility(
      '../../../ai-reference/characters/zepha-automations.md',
      'Bifurcated Incineration'
    );
    const result = await harness.runAutomation({
      automation: bifurcated.automation,
      targetSelections: [
        { id: 'target-1', name: 'Only Target' },
        { done: true },
      ],
      powerRollTiers: ['tier2'],
    });
    assert.equal(result.calls.selectTarget.length, 2);
    assert.equal(result.calls.selectTarget[1].allowDone, true);
    assert.equal(result.calls.applyDamage.length, 1);
    assert.equal(result.calls.applyDamage[0].placementId, 'target-1');
    assert.equal(result.calls.applyDamage[0].damageType, 'fire');
  } finally {
    harness.close();
  }
});

test('damage type options normalize case and duplicates into one canonical choice list', async () => {
  const harness = await createAbilityAutomationHarness();
  try {
    const input = {
      schema: 'ability-automation/v3',
      cards: [{
        type: 'effect',
        target: 'primary',
        effects: [{
          kind: 'damage',
          amount: 5,
          damageType: 'psychic',
          damageTypeOptions: [' Fire ', 'COLD', 'fire', 'radiant', '', null],
        }],
      }],
    };
    const once = harness.window.AbilityAutomationSchema.normalizeAutomation(input);
    const effect = once.cards[0].effects[0];

    assert.deepEqual([...effect.damageTypeOptions], ['fire', 'cold']);
    assert.equal(Object.hasOwn(effect, 'damageType'), false, 'options do not retain a silent scalar default');
    assert.ok(once.warnings.some((warning) => warning.includes('removed blank, duplicate, or unsupported')));
    assert.ok(once.warnings.some((warning) => warning.includes('damageType: ignored')));

    const canonicalInput = structuredClone(once);
    canonicalInput.warnings = [];
    const canonicalJson = JSON.stringify(canonicalInput);
    let repeated = canonicalInput;
    for (let pass = 0; pass < 100; pass += 1) {
      repeated = harness.window.AbilityAutomationSchema.normalizeAutomation(repeated);
      assert.deepEqual(repeated.warnings, [], `pass ${pass + 1} remains warning-free`);
      assert.equal(JSON.stringify(repeated), canonicalJson, `pass ${pass + 1} remains byte-stable`);
    }
  } finally {
    harness.close();
  }
});

test('single, empty, and malformed damage type option lists warn and never create a choice', async () => {
  const harness = await createAbilityAutomationHarness();
  try {
    const single = harness.window.AbilityAutomationSchema.normalizeAutomation({
      schema: 'ability-automation/v3',
      cards: [{
        type: 'effect',
        effects: [{ kind: 'damage', amount: 3, damageTypeOptions: [' HOLY '] }],
      }],
    });
    assert.equal(single.cards[0].effects[0].damageType, 'holy');
    assert.equal(Object.hasOwn(single.cards[0].effects[0], 'damageTypeOptions'), false);
    assert.ok(single.warnings.some((warning) => warning.includes('needs at least two valid')));

    const empty = harness.window.AbilityAutomationSchema.normalizeAutomation({
      schema: 'ability-automation/v3',
      cards: [{
        type: 'effect',
        effects: [{ kind: 'damage', amount: 3, damageType: 'fire', damageTypeOptions: [] }],
      }],
    });
    assert.equal(empty.cards[0].effects[0].damageType, 'fire');
    assert.equal(Object.hasOwn(empty.cards[0].effects[0], 'damageTypeOptions'), false);
    assert.ok(empty.warnings.some((warning) => warning.includes('needs at least two valid')));

    const malformed = harness.window.AbilityAutomationSchema.normalizeAutomation({
      schema: 'ability-automation/v3',
      cards: [{
        type: 'effect',
        effects: [{ kind: 'damage', amount: 3, damageType: 'cold', damageTypeOptions: 'fire,cold' }],
      }],
    });
    assert.equal(malformed.cards[0].effects[0].damageType, 'cold');
    assert.ok(malformed.warnings.some((warning) => warning.includes('must be an array')));
  } finally {
    harness.close();
  }
});

test('damage type choices are visible in unresolved and inspector-resolved summaries', async () => {
  const harness = await createAbilityAutomationHarness();
  try {
    const effect = {
      kind: 'damage',
      amount: 5,
      attribute: 'Might',
      damageTypeOptions: ['acid', 'cold'],
    };
    assert.equal(
      harness.window.AbilityAutomationPrimitives.describeEffect(effect),
      '5 + Might [choose acid / cold] damage'
    );
    assert.equal(
      harness.window.AbilityAutomationPrimitives.describeEffectResolved(effect, {
        getAttributeBonus: () => 2,
      }),
      '7 [choose acid / cold] damage'
    );
  } finally {
    harness.close();
  }
});

test('authored Hurl Element and Smolder records use their source-accurate damage type options', async () => {
  const harness = await createAbilityAutomationHarness();
  try {
    const hurl = await loadAuthoredCharacterAbility(
      '../../../ai-reference/characters/zepha-automations.md',
      'Hurl Element'
    );
    const smolder = await loadAuthoredCharacterAbility(
      '../../../ai-reference/characters/indigo-automations.md',
      'Smolder'
    );
    const expectedHurl = ['acid', 'cold', 'corruption', 'fire', 'lightning', 'poison', 'sonic'];
    const expectedSmolder = ['acid', 'corruption', 'fire'];

    for (const field of ['tier1DamageType', 'tier2DamageType', 'tier3DamageType']) {
      assert.equal(field in hurl.fields, false, `display field ${field} does not falsely pin Hurl Element to fire`);
    }
    for (const tier of Object.values(hurl.automation.cards[1].tiers)) {
      assert.deepEqual(tier.effects[0].damageTypeOptions, expectedHurl);
    }
    for (const tier of Object.values(smolder.automation.cards[2].tiers)) {
      assert.deepEqual(tier.effects[0].damageTypeOptions, expectedSmolder);
      const weakness = tier.effects[1].onFail.find((effect) => effect.name === 'damageWeakness');
      assert.equal(weakness.damageType, '', 'Smolder weakness inherits the selected damage type at runtime');
    }

    const normalizedHurl = harness.window.AbilityAutomationSchema.normalizeAutomation(hurl.automation);
    const normalizedSmolder = harness.window.AbilityAutomationSchema.normalizeAutomation(smolder.automation);
    assert.deepEqual(normalizedHurl.warnings, []);
    assert.deepEqual(normalizedSmolder.warnings, []);
  } finally {
    harness.close();
  }
});

test('schema normalization is idempotent for effect targets and preserved extras', async () => {
  const harness = await createAbilityAutomationHarness();
  try {
    const input = {
      schema: 'ability-automation/v3',
      customTopLevel: 'preserve-me',
      cards: [
        {
          type: 'effect',
          target: 'primary',
          effects: [
            { kind: 'damage', amount: 3, target: 'secondary', customEffectField: true },
          ],
        },
      ],
    };
    const once = harness.window.AbilityAutomationSchema.normalizeAutomation(input);
    const twice = harness.window.AbilityAutomationSchema.normalizeAutomation(once);

    assert.deepEqual(JSON.parse(JSON.stringify(twice)), JSON.parse(JSON.stringify(once)));
    assert.equal(once.cards[0].effects[0].target, 'secondary');
    assert.deepEqual(once.cards[0].effects[0]._extra, { customEffectField: true });
    assert.deepEqual(once._extra, { customTopLevel: 'preserve-me' });
  } finally {
    harness.close();
  }
});

test('legacy nested extras collapse once and stay byte-stable across 100 normalization passes', async () => {
  const harness = await createAbilityAutomationHarness();
  try {
    const input = await loadLegacyNestedExtraFixture();
    assert.ok(extraChainDepth(input) > 38, 'fixture represents the live deep-chain failure');

    const once = harness.window.AbilityAutomationSchema.normalizeAutomation(input);
    const canonicalJson = JSON.stringify(once);
    let repeated = once;
    for (let pass = 0; pass < 100; pass += 1) {
      repeated = harness.window.AbilityAutomationSchema.normalizeAutomation(repeated);
      assert.equal(JSON.stringify(repeated).length, canonicalJson.length, `pass ${pass + 1} keeps size stable`);
      assert.equal(extraChainDepth(repeated), 1, `pass ${pass + 1} keeps one top-level _extra`);
    }
    assert.deepEqual(JSON.parse(JSON.stringify(repeated)), JSON.parse(canonicalJson));

    assertCanonicalExtra(once, 'automation');
    assert.equal(once._extra.directTopUnknown, 'keep-direct');
    assert.equal(once._extra.topExtraOuter, 'keep-outer');
    assert.equal(once._extra.legacyDepth01, 'value-1');
    assert.equal(once._extra.legacyDepth45, 'value-45');
    assert.equal(once._extra.deepestLegacyUnknown, 'keep-deepest');

    const effectBlock = once.cards[0];
    const damageEffect = effectBlock.effects[0];
    const option = once.cards[1].options[0];
    const modifier = once.modifiers[0];
    const passive = once.passives[0];
    const usageLimit = once.usageLimit;
    [
      [effectBlock, 'effect block'],
      [damageEffect, 'damage effect'],
      [option, 'choice option'],
      [modifier, 'modifier'],
      [passive, 'passive'],
      [usageLimit, 'usage limit'],
    ].forEach(([node, label]) => assertCanonicalExtra(node, label));

    assert.deepEqual(effectBlock._extra, {
      blockDeepUnknown: 'keep-block-deep',
      blockOuterUnknown: 'keep-block-outer',
      directBlockUnknown: 'keep-block-direct',
    });
    assert.deepEqual(damageEffect._extra, {
      effectDeepUnknown: 'keep-effect-deep',
      effectOuterUnknown: 'keep-effect-outer',
      directEffectUnknown: 'keep-effect-direct',
    });
    assert.deepEqual(option._extra, {
      optionDeepUnknown: 'keep-option-deep',
      optionOuterUnknown: 'keep-option-outer',
      directOptionUnknown: 'keep-option-direct',
    });
    assert.equal(modifier._extra.modifierDeepUnknown, 'keep-modifier-deep');
    assert.equal(modifier._extra.directModifierUnknown, 'keep-modifier-direct');
    assert.equal(passive._extra.passiveDeepUnknown, 'keep-passive-deep');
    assert.equal(passive._extra.directPassiveUnknown, 'keep-passive-direct');
    assert.equal(usageLimit._extra.usageDeepUnknown, 'keep-usage-deep');
    assert.equal(usageLimit._extra.directUsageUnknown, 'keep-usage-direct');
  } finally {
    harness.close();
  }
});

test('every card normalizer canonicalizes its preserved extras', async () => {
  const harness = await createAbilityAutomationHarness();
  try {
    const legacyExtras = (label) => ({
      [`${label}OuterUnknown`]: `keep-${label}-outer`,
      _extra: { [`${label}DeepUnknown`]: `keep-${label}-deep` },
    });
    const cardInputs = [
      { type: 'target', id: 'target-extra', name: 'primary', mode: 'token', predicate: 'enemy' },
      { type: 'powerRoll', id: 'power-roll-extra', attribute: 'Might', tiers: {} },
      { type: 'effect', id: 'effect-extra', effects: [{ kind: 'note', text: 'Test' }] },
      { type: 'trigger', id: 'trigger-extra', condition: 'A test event occurs.', effects: [] },
      { type: 'persistent', id: 'persistent-extra', cost: 1, effects: [] },
      {
        type: 'branch',
        id: 'branch-extra',
        condition: { kind: 'prompt', question: 'Test?' },
        then: [],
        else: [],
      },
      {
        type: 'choice',
        id: 'choice-extra',
        name: 'choiceExtra',
        options: [{ id: 'choice-option', label: 'Choice option', cards: [] }],
      },
    ].map((card) => ({
      ...card,
      directCardUnknown: `keep-${card.type}-direct`,
      _extra: legacyExtras(card.type),
    }));

    const normalized = harness.window.AbilityAutomationSchema.normalizeAutomation({
      schema: 'ability-automation/v3',
      cards: cardInputs,
    });
    assert.equal(normalized.cards.length, cardInputs.length);
    normalized.cards.forEach((card) => {
      assertCanonicalExtra(card, `${card.type} card`);
      assert.equal(card._extra.directCardUnknown, `keep-${card.type}-direct`);
      assert.equal(card._extra[`${card.type}OuterUnknown`], `keep-${card.type}-outer`);
      assert.equal(card._extra[`${card.type}DeepUnknown`], `keep-${card.type}-deep`);
    });
  } finally {
    harness.close();
  }
});

test('character-sheet unchanged save cycles keep normalized automation metadata canonical', async () => {
  const harness = await createAbilityAutomationHarness();
  try {
    const sheetSource = await readFile(new URL('../../sheet.js', import.meta.url), 'utf8');
    assert.match(
      sheetSource,
      /automation:\s*normalizeAutomationBlock\(existingAction\?\.automation\)/,
      'captureActions routes saved action automation through schema normalization'
    );
    assert.match(
      sheetSource,
      /automation:\s*normalizeAutomationBlock\(existingFeature\?\.automation\)/,
      'captureFeatures routes saved feature automation through schema normalization'
    );

    const input = await loadLegacyNestedExtraFixture();
    const normalize = harness.window.AbilityAutomationSchema.normalizeAutomation;
    let action = { name: 'Unchanged text edit', automation: input };
    for (let save = 0; save < 100; save += 1) {
      action = { ...action, automation: normalize(action.automation) };
    }
    const savedJson = JSON.stringify(action.automation);
    action = { ...action, automation: normalize(action.automation) };
    assert.equal(JSON.stringify(action.automation), savedJson);
    assert.equal(extraChainDepth(action.automation), 1);
    assert.equal(action.automation._extra.deepestLegacyUnknown, 'keep-deepest');
  } finally {
    harness.close();
  }
});

test('character sheet persists the Shadow edge-cost resource toggle through autosave', async () => {
  const sheetSource = await readFile(
    new URL('../../sheet.js', import.meta.url),
    'utf8'
  );
  assert.match(sheetSource, /discountOnPowerRollEdge:\s*false/);
  assert.match(sheetSource, /merged\.hero\.resource\.discountOnPowerRollEdge\s*=\s*Boolean/);
  assert.match(sheetSource, /data-model="hero\.resource\.discountOnPowerRollEdge"/);
  assert.match(sheetSource, /setByPath\(\s*"hero\.resource\.discountOnPowerRollEdge"/);
});

test('v2 discard retains its migration warning', async () => {
  const harness = await createAbilityAutomationHarness();
  try {
    const normalized = harness.window.AbilityAutomationSchema.normalizeAutomation({
      schema: 'ability-automation/v2',
      cards: [{ type: 'effect', effects: [{ kind: 'damage', amount: 3 }] }],
    });
    assert.deepEqual(normalized.cards, []);
    assert.ok(normalized.warnings.some((warning) => warning.includes('v2 automation data was discarded')));
  } finally {
    harness.close();
  }
});

test('autoResolve validation warns when an effect requires the interactive runner', async () => {
  const harness = await createAbilityAutomationHarness();
  try {
    const { issues } = harness.validateAutomation({
      schema: 'ability-automation/v3',
      cards: [
        {
          type: 'trigger',
          match: { event: 'move', filter: { whose: 'enemy' } },
          autoResolve: true,
          effects: [
            { kind: 'forcedMovement', verb: 'push', distance: 2 },
            { kind: 'heal', recoveries: 1 },
          ],
        },
      ],
    }, { strict: false });
    assert.ok(issues.some((issue) => issue.includes('forcedMovement') && issue.includes('not supported')));
    assert.ok(issues.some((issue) => issue.includes('recovery and amountFrom calculations')));
  } finally {
    harness.close();
  }
});

test('validation normalizes top-level usage limits', async () => {
  const harness = await createAbilityAutomationHarness();
  try {
    const { issues, normalized } = harness.validateAutomation({
      schema: 'ability-automation/v3',
      usageLimit: {
        scope: 'round',
        key: 'hesitation-is-weakness',
        target: 'self',
        message: 'Hesitation Is Weakness can only be used once per round.',
      },
      cards: [],
    }, { strict: false });

    assert.deepEqual(issues, []);
    assert.deepEqual(normalized.usageLimit, {
      scope: 'round',
      key: 'hesitation-is-weakness',
      source: 'self',
      target: 'self',
      message: 'Hesitation Is Weakness can only be used once per round.',
    });
  } finally {
    harness.close();
  }
});

test('runner prompts for a target, accepts a power roll, and applies tier damage to that token', async () => {
  const harness = await createAbilityAutomationHarness({
    attributes: { Might: 2 },
    targets: [
      { id: 'enemy-1', name: 'Iron Imp' },
    ],
  });
  try {
    const automation = {
      schema: 'ability-automation/v3',
      cards: [
        {
          type: 'target',
          id: 'target-primary',
          name: 'primary',
          mode: 'token',
          predicate: 'enemy',
          count: { value: 1, mode: 'exact' },
          distance: { form: 'ranged', value: 5 },
        },
        {
          type: 'powerRoll',
          id: 'roll-strike',
          attribute: 'Might',
          target: 'primary',
          tiers: {
            tier1: { effects: [{ kind: 'damage', amount: 3, attribute: 'M', damageType: 'fire' }] },
            tier2: { effects: [{ kind: 'damage', amount: 6, attribute: 'M', damageType: 'fire' }] },
            tier3: { effects: [{ kind: 'damage', amount: 9, attribute: 'M', damageType: 'fire' }] },
          },
        },
      ],
    };

    const result = await harness.runAutomation({
      automation,
      action: { id: 'test-strike', name: 'Test Strike', actionLabel: 'Main Action' },
      targetSelections: [{ id: 'enemy-1', name: 'Iron Imp' }],
      // 6 + 6 on 2d10, plus Might 2 = 14, which is tier 2.
      randomValues: [0.5, 0.5],
    });

    assert.equal(result.calls.selectTarget.length, 1);
    assert.equal(result.calls.selectTarget[0].predicate, 'enemy');
    assert.equal(result.calls.applyDamage.length, 1);
    assert.deepEqual(result.calls.applyDamage[0], {
      placementId: 'enemy-1',
      sourceId: 'caster-1',
      amount: 8,
      damageType: 'fire',
      abilityName: 'Test Strike',
      actionId: 'test-strike',
      actionKind: 'main',
      cost: '',
      keywords: [],
    });
    assert.ok(result.calls.fireTriggerEvent.some((event) => event.eventType === 'powerRoll'));
  } finally {
    harness.close();
  }
});

test('ability tests add matching trained skill and extra skill bonus', async () => {
  const harness = await createAbilityAutomationHarness({
    attributes: { Agility: 2 },
    skills: { Hide: { level: 'Trained', bonus: '+2' } },
  });
  try {
    const automation = {
      schema: 'ability-automation/v3',
      cards: [
        {
          type: 'effect',
          id: 'hide-test',
          target: 'self',
          effects: [
            {
              kind: 'abilityTest',
              label: 'Hide maneuver',
              attribute: 'Agility',
              text: 'Roll to hide.',
            },
          ],
        },
      ],
    };

    const result = await harness.runAutomation({
      automation,
      action: { id: 'hide-test', name: 'Hide Test' },
      randomValues: [0.5, 0.5],
    });

    const roll = result.calls.postChat.find((entry) => entry.type === 'dice_roll');
    assert.equal(roll.payload.total, 18);
    assert.deepEqual(
      roll.payload.breakdown.filter((entry) => entry.type === 'modifier').map((entry) => entry.value),
      [2, 4]
    );
    assert.ok(roll.payload.breakdown.some((entry) => entry.label === 'Hide' && entry.value === 4));
  } finally {
    harness.close();
  }
});

test('freeStrike can run as a normal power roll before applying damage', async () => {
  const harness = await createAbilityAutomationHarness({
    attributes: { Might: 1, Agility: 3 },
    targets: [
      { id: 'enemy-1', name: 'Target Dummy' },
    ],
  });
  try {
    const automation = {
      schema: 'ability-automation/v3',
      cards: [
        {
          type: 'effect',
          id: 'free-strike-effect',
          target: 'self',
          effects: [
            {
              kind: 'freeStrike',
              against: 'enemy',
              asPowerRoll: true,
              text: 'Choose the creature who triggered the free strike.',
            },
          ],
        },
      ],
    };

    const result = await harness.runAutomation({
      automation,
      action: { id: 'free-strike-test', name: 'Free Strike Test' },
      targetSelections: [{ id: 'enemy-1', name: 'Target Dummy' }],
      randomValues: [0.5, 0.5],
    });

    assert.equal(result.calls.selectTarget.length, 1);
    assert.equal(result.calls.applyDamage.length, 1);
    assert.equal(result.calls.applyDamage[0].amount, 8);
    assert.equal(result.calls.applyDamage[0].abilityName, 'Free Strike');
    assert.ok(result.calls.postChat.some((entry) => entry.type === 'dice_roll' && entry.payload.total === 15));
  } finally {
    harness.close();
  }
});

test('power roll surges spend from the caster and add matching damage metadata', async () => {
  const harness = await createAbilityAutomationHarness({
    attributes: { Might: 2 },
    targets: [
      { id: 'enemy-1', name: 'Iron Imp' },
    ],
  });
  try {
    const automation = {
      schema: 'ability-automation/v3',
      cards: [
        {
          type: 'target',
          id: 'target-primary',
          name: 'primary',
          mode: 'token',
          predicate: 'enemy',
          count: { value: 1, mode: 'exact' },
        },
        {
          type: 'powerRoll',
          id: 'roll-surge-strike',
          attribute: 'Might',
          target: 'primary',
          tiers: {
            tier1: { effects: [{ kind: 'damage', amount: 3, attribute: 'M', damageType: 'fire' }] },
            tier2: { effects: [{ kind: 'damage', amount: 6, attribute: 'M', damageType: 'fire' }] },
            tier3: { effects: [{ kind: 'damage', amount: 9, attribute: 'M', damageType: 'fire' }] },
          },
        },
      ],
    };

    const result = await harness.runAutomation({
      automation,
      action: { id: 'surge-strike', name: 'Surge Strike', actionLabel: 'Main Action' },
      hero: { name: 'Harness Hero', surges: 2, resource: { value: 0 } },
      targetSelections: [{ id: 'enemy-1', name: 'Iron Imp' }],
      powerRollSurges: [2],
      randomValues: [0.5, 0.5],
    });

    assert.deepEqual(result.calls.applySurgeGain[0], {
      placementId: 'caster-1',
      amount: -2,
      abilityName: 'Surge Strike',
    });
    assert.equal(result.calls.applyDamage.length, 1);
    assert.deepEqual(result.calls.applyDamage[0], {
      placementId: 'enemy-1',
      sourceId: 'caster-1',
      amount: 12,
      damageType: 'fire',
      abilityName: 'Surge Strike',
      actionId: 'surge-strike',
      actionKind: 'main',
      cost: '',
      keywords: [],
      includesSurge: true,
      surgeSpent: 2,
      surgeDamage: 4,
    });
  } finally {
    harness.close();
  }
});

test('runner can arm a structured trigger and resolve it from a captured trigger payload', async () => {
  const harness = await createAbilityAutomationHarness();
  try {
    const automation = {
      schema: 'ability-automation/v3',
      cards: [
        {
          type: 'trigger',
          id: 'trigger-half-damage',
          condition: 'You take damage.',
          match: { event: 'damage', filter: { whose: 'self' } },
          effects: [
            { kind: 'halveTriggeringDamage', rounding: 'up' },
          ],
        },
      ],
    };

    const armed = await harness.runAutomation({
      automation,
      action: { id: 'half-damage', name: 'Half Damage', actionLabel: 'Triggered Action' },
      actionType: 'triggered',
    });

    assert.equal(armed.calls.registerTrigger.length, 1);
    assert.equal(armed.calls.registerTrigger[0].casterId, 'caster-1');
    assert.equal(armed.calls.registerTrigger[0].match.event, 'damage');
    assert.equal(armed.calls.registerTrigger[0].freeTriggered, false);
    assert.equal(armed.calls.applyHeal.length, 0);

    const resolved = await harness.runAutomation({
      automation,
      action: { id: 'half-damage', name: 'Half Damage', actionLabel: 'Triggered Action' },
      actionType: 'triggered',
      triggerPayload: {
        eventType: 'damage',
        payload: {
          placementId: 'caster-1',
          sourceId: 'enemy-1',
          amount: 11,
          damageType: 'corruption',
        },
      },
    });

    assert.equal(resolved.calls.applyHeal.length, 1);
    assert.deepEqual(resolved.calls.applyHeal[0], {
      placementId: 'caster-1',
      amount: 5,
      allowTempHp: false,
      abilityName: 'Half Damage',
    });
  } finally {
    harness.close();
  }
});

test('main-action delayed triggers register as free riders with executable fields', async () => {
  const harness = await createAbilityAutomationHarness();
  try {
    const result = await harness.runAutomation({
      automation: {
        schema: 'ability-automation/v3',
        cards: [
          {
            type: 'trigger',
            condition: 'The selected creature moves.',
            match: { event: 'move', filter: { whose: 'target' } },
            effectTarget: 'eventActor',
            autoResolve: true,
            effects: [{ kind: 'damage', amount: 2 }],
          },
        ],
      },
      action: { id: 'thorn-in-foot', name: 'Thorn In Foot', actionLabel: 'Main Action' },
      actionType: 'main',
    });

    assert.equal(result.calls.registerTrigger.length, 1);
    assert.equal(result.calls.registerTrigger[0].freeTriggered, true);
    assert.equal(result.calls.registerTrigger[0].autoResolve, true);
    assert.equal(result.calls.registerTrigger[0].effectTarget, 'eventActor');
  } finally {
    harness.close();
  }
});

test('numeric potency target normalizes to a literal threshold and reaches the board callback', async () => {
  const harness = await createAbilityAutomationHarness({
    targets: [{ id: 'enemy-1', name: 'Enemy' }],
  });
  try {
    const automation = {
      schema: 'ability-automation/v3',
      cards: [
        {
          type: 'target',
          name: 'primary',
          mode: 'token',
          predicate: 'enemy',
          count: { value: 1, mode: 'exact' },
        },
        {
          type: 'effect',
          target: 'primary',
          effects: [
            {
              kind: 'potency',
              attribute: 'M',
              target: 2,
              onFail: [{ kind: 'condition', name: 'prone' }],
            },
          ],
        },
      ],
    };
    const normalized = harness.window.AbilityAutomationSchema.normalizeAutomation(automation);
    assert.equal(normalized.cards[1].effects[0].threshold, 2);
    assert.equal(normalized.cards[1].effects[0].target, undefined);

    const result = await harness.runAutomation({
      automation,
      action: { id: 'stone-hit', name: 'Stone Hit', actionLabel: 'Main Action' },
      targetSelections: [{ id: 'enemy-1', name: 'Enemy' }],
      checkPotencyResults: [{ passes: true }],
    });
    assert.equal(result.calls.checkPotency[0].threshold, 2);
  } finally {
    harness.close();
  }
});

test('runner can spend the caster recovery and heal a different target', async () => {
  const harness = await createAbilityAutomationHarness({
    targets: [
      { id: 'ally-1', name: 'Ally' },
    ],
    sourcePlacement: { id: 'caster-1', name: 'Cal' },
  });
  try {
    const automation = {
      schema: 'ability-automation/v3',
      cards: [
        {
          type: 'target',
          id: 'target-heal',
          name: 'healTarget',
          mode: 'token',
          predicate: 'selfOrAlly',
          count: { value: 1, mode: 'exact' },
          distance: { form: 'ranged', value: 10 },
        },
        {
          type: 'effect',
          target: 'healTarget',
          effects: [
            { kind: 'heal', recoveries: 1, recoverySource: 'self' },
          ],
        },
      ],
    };

    const result = await harness.runAutomation({
      automation,
      action: { id: 'morelia', name: 'Morelia Punish and Defend', actionLabel: 'Main Action' },
      targetSelections: [{ id: 'ally-1', name: 'Ally' }],
      spendRecoveryResults: [{ spent: 1, recoveryValue: 31, currentRecoveries: 13, name: 'Cal' }],
    });

    assert.deepEqual(result.calls.spendRecoveryForTarget, [
      {
        placementId: 'caster-1',
        recoveries: 1,
        abilityName: 'Morelia Punish and Defend',
      },
    ]);
    assert.deepEqual(result.calls.applyHeal, [
      {
        placementId: 'ally-1',
        amount: 31,
        allowTempHp: false,
        abilityName: 'Morelia Punish and Defend',
      },
    ]);
  } finally {
    harness.close();
  }
});

test('runner forwards triggerable aura automation to the board', async () => {
  const harness = await createAbilityAutomationHarness({
    attributes: { Presence: 3 },
    sourcePlacement: { id: 'caster-1', name: 'Cal' },
  });
  try {
    const automation = {
      schema: 'ability-automation/v3',
      cards: [
        {
          type: 'effect',
          target: 'self',
          effects: [
            {
              kind: 'aura',
              radius: 3,
              color: '#facc15',
              affects: 'selfAndAlly',
              triggers: [
                { event: 'turnEnd', whose: 'self' },
                { event: 'actionUsed', filter: { whose: 'occupant', keywordsAny: ['Strike'] }, target: 'eventActor' },
              ],
              effects: [{ kind: 'surgeGain', amount: 1 }],
              expires: { event: 'combatEnd', whose: 'any', count: 1 },
            },
          ],
        },
      ],
    };

    const result = await harness.runAutomation({
      automation,
      action: { id: 'blessing-faithful', name: 'Blessing of the Faithful', actionLabel: 'Maneuver' },
    });

    assert.equal(result.calls.setAura.length, 1);
    assert.equal(result.calls.setAura[0].placementId, 'caster-1');
    assert.equal(result.calls.setAura[0].radius, 3);
    assert.deepEqual(result.calls.setAura[0].automation.triggers, [
      { event: 'turnEnd', whose: 'self' },
      { event: 'actionUsed', whose: 'occupant', target: 'eventActor', filter: { keywordsAny: ['Strike'] } },
    ]);
    assert.deepEqual(result.calls.setAura[0].automation.effects, [{ kind: 'surgeGain', amount: 1 }]);
    assert.equal(result.calls.setAura[0].automation.attributeBonuses.Presence, 3);
  } finally {
    harness.close();
  }
});

test('runner applies numeric damage weakness from a failed potency rider', async () => {
  const harness = await createAbilityAutomationHarness({
    attributes: { Might: 3 },
    hero: { name: 'Cal', stats: { might: 3, agility: -1, reason: 2, intuition: -1, presence: 3 } },
    targets: [
      { id: 'enemy-1', name: 'Enemy' },
    ],
  });
  try {
    const automation = {
      schema: 'ability-automation/v3',
      cards: [
        {
          type: 'target',
          id: 'target-primary',
          name: 'primary',
          mode: 'token',
          predicate: 'creature',
          count: { value: 1, mode: 'exact' },
          distance: { form: 'meleeOrRanged', value: 1, secondary: 5 },
        },
        {
          type: 'powerRoll',
          id: 'roll-purifying-fire',
          attribute: 'Might',
          target: 'primary',
          tiers: {
            tier1: {
              effects: [
                { kind: 'damage', amount: 7, attribute: 'M', damageType: 'holy' },
                {
                  kind: 'potency',
                  attribute: 'M',
                  level: 'weak',
                  onFail: [
                    { kind: 'condition', name: 'damageWeakness', amount: 3, damageType: 'fire', duration: 'saveEnds' },
                  ],
                },
              ],
            },
          },
        },
      ],
    };

    const result = await harness.runAutomation({
      automation,
      action: { id: 'purifying-fire', name: 'Purifying Fire', actionLabel: 'Main Action' },
      targetSelections: [{ id: 'enemy-1', name: 'Enemy' }],
      powerRollTiers: ['tier1'],
      checkPotencyResults: [{ passes: true, threshold: 1, attributeValue: 0 }],
    });

    assert.deepEqual(result.calls.applyCondition, [
      {
        placementId: 'enemy-1',
        condition: {
          name: 'damageWeakness',
          duration: 'save-ends',
          amount: 3,
          damageType: 'fire',
        },
        sourceId: 'caster-1',
        sourceName: 'Cal',
      },
    ]);
  } finally {
    harness.close();
  }
});

test('runner forwards persistent condition riders with source attribution', async () => {
  const harness = await createAbilityAutomationHarness({
    targets: [{ id: 'enemy-1', name: 'Enemy' }],
  });
  try {
    const automation = {
      schema: 'ability-automation/v3',
      cards: [
        { type: 'target', id: 'target-1', name: 'primary', mode: 'token', range: 5 },
        {
          type: 'effect',
          id: 'effect-1',
          target: 'primary',
          effects: [{
            kind: 'condition',
            name: 'grabbed',
            duration: 'saveEnds',
            riders: [{
              id: 'crushing-grab',
              when: 'turnStart',
              target: 'bearer',
              effects: [{ kind: 'damage', amount: 5, damageType: 'fire' }],
            }],
          }],
        },
      ],
    };
    const result = await harness.runAutomation({
      automation,
      action: { id: 'crushing-grip', name: 'Crushing Grip', actionLabel: 'Main Action' },
      targetSelections: [{ id: 'enemy-1', name: 'Enemy' }],
    });
    assert.equal(result.calls.applyCondition.length, 1);
    const applied = result.calls.applyCondition[0];
    assert.equal(applied.condition.sourceName, 'Harness Hero');
    assert.equal(applied.condition.sourceAbility, 'Crushing Grip');
    assert.deepEqual(applied.condition.riders[0], {
      id: 'crushing-grab',
      when: 'turnStart',
      target: 'bearer',
      effects: [{
        kind: 'damage',
        amount: 5,
        amountDice: '',
        markBonusDice: '',
        markPredicate: '',
        attribute: '',
        damageType: 'fire',
      }],
    });
  } finally {
    harness.close();
  }
});

test('runner dispatches floating text automation effects', async () => {
  const harness = await createAbilityAutomationHarness();
  try {
    const result = await harness.runAutomation({
      automation: {
        schema: 'ability-automation/v3',
        version: 3,
        cards: [
          {
            type: 'effect',
            id: 'banner',
            effects: [
              { kind: 'floatingText', text: 'HESITATION IS WEAKNESS!', audience: 'all', tone: 'danger' },
            ],
          },
        ],
      },
    });

    assert.deepEqual(result.calls.showFloatingText[0], {
      text: 'HESITATION IS WEAKNESS!',
      audience: 'all',
      tone: 'danger',
      sourceId: 'caster-1',
      sourceName: 'Harness Hero',
      abilityName: 'Ability Under Test',
      actionId: 'ability-under-test',
    });
  } finally {
    harness.close();
  }
});

test('runner preflights startTurn before spending ability resource', async () => {
  const harness = await createAbilityAutomationHarness();
  try {
    const result = await harness.runAutomation({
      automation: {
        schema: 'ability-automation/v3',
        version: 3,
        cards: [
          {
            type: 'effect',
            id: 'claim-turn',
            target: 'self',
            effects: [
              { kind: 'startTurn', target: 'self', condition: 'enemyPickNoActive' },
            ],
          },
        ],
      },
      action: { id: 'hesitation', name: 'Hesitation Is Weakness', cost: '1 Insight' },
    });

    assert.equal(result.calls.startTurn.length, 2);
    assert.equal(result.calls.startTurn[0].preflight, true);
    assert.equal(result.calls.spendResource.length, 1);
    assert.equal(result.calls.startTurn[1].preflightAccepted, true);
    assert.ok(
      result.callLog.findIndex((entry) => entry.name === 'startTurn' && entry.payload.preflight === true) <
        result.callLog.findIndex((entry) => entry.name === 'spendResource')
    );
  } finally {
    harness.close();
  }
});

test('runner applies double edge and double bane as tier shifts without +/-2 bonus', async () => {
  const harness = await createAbilityAutomationHarness();
  try {
    const {
      getEdgeState,
      getActiveEdgeControl,
      getTotalEdgeBaneCounts,
      setManualEdgeBaneSelection,
    } = harness.window.AbilityAutomationRunner.__testing;
    assert.deepEqual(
      getEdgeState(2, 0),
      { edge: 2, bane: 0, net: 2, bonus: 0, tierShift: 1, label: 'Double Edge (tier up)' }
    );
    assert.deepEqual(
      getEdgeState(0, 2),
      { edge: 0, bane: 2, net: -2, bonus: 0, tierShift: -1, label: 'Double Bane (tier down)' }
    );
    assert.deepEqual(
      getEdgeState(2, 1),
      { edge: 2, bane: 1, net: 1, bonus: 2, tierShift: 0, label: 'Edge (+2)' }
    );
    assert.deepEqual(
      getEdgeState(1, 2),
      { edge: 1, bane: 2, net: -1, bonus: -2, tierShift: 0, label: 'Bane (-2)' }
    );
    assert.deepEqual(getActiveEdgeControl(getEdgeState(2, 0)), { kind: 'edge', count: 2 });
    assert.deepEqual(getActiveEdgeControl(getEdgeState(2, 1)), { kind: 'edge', count: 1 });
    assert.deepEqual(getActiveEdgeControl(getEdgeState(1, 2)), { kind: 'bane', count: 1 });
    assert.deepEqual(getActiveEdgeControl(getEdgeState(0, 2)), { kind: 'bane', count: 2 });
    assert.equal(getActiveEdgeControl(getEdgeState(1, 1)), null);

    const manualState = { edgeCount: 0, baneCount: 0 };
    assert.deepEqual(setManualEdgeBaneSelection(manualState, 'edge', 1), { kind: 'edge', count: 1, active: true });
    assert.deepEqual(manualState, { edgeCount: 1, baneCount: 0 });
    assert.deepEqual(setManualEdgeBaneSelection(manualState, 'edge', 1), { kind: 'edge', count: 1, active: false });
    assert.deepEqual(manualState, { edgeCount: 0, baneCount: 0 });
    assert.deepEqual(setManualEdgeBaneSelection(manualState, 'bane', 2), { kind: 'bane', count: 2, active: true });
    assert.deepEqual(manualState, { edgeCount: 0, baneCount: 2 });

    assert.deepEqual(
      getTotalEdgeBaneCounts({
        edgeCount: 0,
        baneCount: 0,
        rollSuggestions: [
          { kind: 'edge', count: 1, active: true },
          { kind: 'edge', count: 1, active: true },
        ],
      }),
      { edge: 1, bane: 0 }
    );
    assert.deepEqual(
      getTotalEdgeBaneCounts({
        edgeCount: 1,
        baneCount: 0,
        rollSuggestions: [{ kind: 'edge', count: 1, active: true }],
      }),
      { edge: 1, bane: 0 }
    );
    assert.deepEqual(
      getTotalEdgeBaneCounts({
        edgeCount: 0,
        baneCount: 0,
        rollSuggestions: [{ kind: 'edge', count: 2, active: true }],
      }),
      { edge: 2, bane: 0 }
    );
  } finally {
    harness.close();
  }
});

test('runner forwards structured trigger lifetime metadata', async () => {
  const harness = await createAbilityAutomationHarness();
  try {
    const automation = {
      schema: 'ability-automation/v3',
      cards: [
        {
          type: 'trigger',
          condition: 'The target moves before the end of your next turn.',
          match: { event: 'move', filter: { whose: 'target', minDistance: 1 } },
          target: 'primary',
          expires: { event: 'turnEnd', whose: 'self', count: 1, skipCurrent: true },
          effects: [
            { kind: 'damage', amount: 1, damageType: 'psychic' },
          ],
        },
      ],
    };

    const result = await harness.runAutomation({
      automation,
      action: { id: 'thorn-foot', name: 'Thorn Foot', actionLabel: 'Main Action' },
    });

    assert.equal(result.calls.registerTrigger.length, 1);
    assert.deepEqual(result.calls.registerTrigger[0].expires, {
      event: 'turnEnd',
      whose: 'self',
      count: 1,
      skipCurrent: true,
    });
  } finally {
    harness.close();
  }
});
