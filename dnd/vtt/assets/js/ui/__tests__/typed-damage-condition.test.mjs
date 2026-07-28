import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDamageWeaknessCondition,
  calculateConditionDamageAdjustments,
  createDamageWeaknessDialogController,
  formatDamageWeaknessLabel,
  getCanonicalDamageTypes,
  getManualDamageTypeOptions,
  getWeaknessDamageTypeOptions,
} from '../typed-damage-condition.js';

const registry = {
  DAMAGE_TYPES: ['untyped', 'fire', 'cold', 'fire', 'psychic'],
};

test('weakness damage types reuse the canonical registry and expose supported universal damage', () => {
  assert.deepEqual(getCanonicalDamageTypes(registry), ['fire', 'cold', 'psychic']);
  assert.deepEqual(getWeaknessDamageTypeOptions(registry), [
    { value: 'all', label: 'All damage' },
    { value: 'fire', label: 'Fire' },
    { value: 'cold', label: 'Cold' },
    { value: 'psychic', label: 'Psychic' },
  ]);
  assert.deepEqual(
    getManualDamageTypeOptions(registry).slice(1).map(({ value }) => value),
    getWeaknessDamageTypeOptions(registry).slice(1).map(({ value }) => value)
  );
});

test('buildDamageWeaknessCondition requires a supported type and positive whole amount', () => {
  assert.equal(buildDamageWeaknessCondition({ damageType: '', amount: 5 }, registry).ok, false);
  assert.equal(buildDamageWeaknessCondition({ damageType: 'force', amount: 5 }, registry).ok, false);
  assert.equal(buildDamageWeaknessCondition({ damageType: 'fire', amount: 0 }, registry).ok, false);
  assert.equal(buildDamageWeaknessCondition({ damageType: 'fire', amount: 2.5 }, registry).ok, false);
  assert.deepEqual(
    buildDamageWeaknessCondition({
      damageType: ' FIRE ',
      amount: '5',
      duration: 'save-ends',
    }, registry),
    {
      ok: true,
      condition: {
        name: 'damageWeakness',
        amount: 5,
        damageType: 'fire',
        duration: { type: 'save-ends' },
      },
    }
  );
});

test('universal weakness uses the existing empty damageType canonical semantics', () => {
  assert.deepEqual(
    buildDamageWeaknessCondition({
      damageType: 'all',
      amount: 3,
      duration: 'end-of-turn',
    }, registry).condition,
    {
      name: 'damageWeakness',
      amount: 3,
      duration: { type: 'end-of-turn' },
    }
  );
  assert.equal(formatDamageWeaknessLabel({ name: 'damageWeakness', amount: 3 }), 'All damage weakness 3');
  assert.equal(formatDamageWeaknessLabel({ name: 'damageWeakness', damageType: 'fire', amount: 5 }), 'Fire weakness 5');
});

test('matching typed weaknesses stack once while wrong types do not apply', () => {
  const conditions = [
    { name: 'damageWeakness', damageType: 'fire', amount: 3 },
    { name: 'damageWeakness', damageType: 'fire', amount: 2 },
    { name: 'damageWeakness', damageType: 'cold', amount: 20 },
    { name: 'damageWeakness', amount: 1 },
    { name: 'damageImmunity', damageType: 'fire', amount: 4 },
    { name: 'prone', amount: 99 },
  ];
  assert.deepEqual(calculateConditionDamageAdjustments(conditions, 'fire'), {
    weakness: 6,
    immunity: 4,
  });
  assert.deepEqual(calculateConditionDamageAdjustments(conditions, 'cold'), {
    weakness: 21,
    immunity: 0,
  });
  assert.deepEqual(calculateConditionDamageAdjustments(conditions, 'psychic'), {
    weakness: 1,
    immunity: 0,
  });
});

test('weakness dialog controller validates and submits the full canonical condition once', () => {
  let submitted = null;
  const dialog = createDamageWeaknessDialogController({
    registry,
    duration: 'save-ends',
    onSubmit: (condition) => {
      submitted = condition;
    },
  });

  const missing = dialog.submit({ damageType: '', amount: 5 });
  assert.match(missing.error, /damage type/i);
  assert.equal(submitted, null);

  const invalid = dialog.submit({ damageType: 'fire', amount: 0 });
  assert.match(invalid.error, /greater than 0/i);
  assert.equal(submitted, null);

  dialog.submit({ damageType: 'fire', amount: 5 });
  assert.deepEqual(submitted, {
    name: 'damageWeakness',
    amount: 5,
    damageType: 'fire',
    duration: { type: 'save-ends' },
  });
  assert.equal(dialog.closed, true);
  assert.equal(dialog.submit({ damageType: 'cold', amount: 10 }).ok, false);
});

test('cancel never creates a half-formed weakness condition', () => {
  let submits = 0;
  let cancels = 0;
  const dialog = createDamageWeaknessDialogController({
    registry,
    onSubmit: () => { submits += 1; },
    onCancel: () => { cancels += 1; },
  });
  assert.equal(dialog.cancel(), true);
  assert.equal(dialog.cancel(), false);
  assert.equal(submits, 0);
  assert.equal(cancels, 1);
  assert.equal(dialog.submit({ damageType: 'fire', amount: 5 }).ok, false);
});

test('repeated dialog create/apply cycles remain independent', () => {
  const submitted = [];
  for (let index = 1; index <= 100; index += 1) {
    const dialog = createDamageWeaknessDialogController({
      registry,
      onSubmit: (condition) => submitted.push(condition),
    });
    dialog.submit({
      damageType: index % 2 ? 'fire' : 'cold',
      amount: String(index),
    });
    assert.equal(dialog.closed, true);
  }
  assert.equal(submitted.length, 100);
  assert.equal(submitted[0].damageType, 'fire');
  assert.equal(submitted[99].damageType, 'cold');
});
