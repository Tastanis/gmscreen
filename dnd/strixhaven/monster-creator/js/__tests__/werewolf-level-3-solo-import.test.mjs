import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createAbilityAutomationHarness } from '../../../../character_sheet/ability-automation/__tests__/support/automation-harness.mjs';

const monsterUrl = new URL('../../imports/werewolf-level-3-solo.json', import.meta.url);

function collectAbilities(monster) {
  return Object.entries(monster.abilities || {}).flatMap(([category, abilities]) =>
    (abilities || []).map((ability) => ({ category, ability })),
  );
}

function collectStrings(value, output = []) {
  if (typeof value === 'string') output.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectStrings(item, output));
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => collectStrings(item, output));
  return output;
}

test('Level 3 Solo Werewolf import is complete and all authored automation validates', async () => {
  const monster = JSON.parse(await readFile(monsterUrl, 'utf8'));
  const harness = await createAbilityAutomationHarness();

  try {
    assert.equal(monster.id, 'werewolf-level-3-solo');
    assert.equal(monster.name, 'Werewolf');
    assert.equal(monster.level, 3);
    assert.equal(monster.role, 'Solo');
    assert.equal(monster.ev, 60);
    assert.equal(monster.size, '1M');
    assert.equal(monster.speed, 7);
    assert.equal(monster.stamina, 300);
    assert.equal(monster.stability, 1);
    assert.equal(monster.free_strike, 6);
    assert.deepEqual(monster.attributes, {
      might: 3,
      agility: 2,
      reason: -1,
      intuition: 1,
      presence: 1,
    });

    assert.deepEqual(
      monster.abilities.villain_action.map((ability) => ability.name),
      ['Howl — Villain Action 1', 'Rampage — Villain Action 3'],
    );
    assert.ok(!collectStrings(monster).some((text) => /full wolf/i.test(text)));
    assert.ok(!collectStrings(monster).some((text) => /bloodied|winded buff/i.test(text)));

    const abilities = collectAbilities(monster);
    assert.equal(abilities.length, 16);
    for (const { category, ability } of abilities) {
      assert.ok(ability.name, `${category} ability needs a name`);
      assert.ok(
        ability.effect || ability.additional_effect || ability.test,
        `${ability.name} needs complete visible rules text`,
      );
      if (ability.automation) harness.validateAutomation(ability.automation);
    }

    const facepalm = monster.abilities.triggered_action.find((ability) => ability.name === 'Facepalm and Head Slam');
    assert.ok(facepalm.trigger.includes('charging or moving 2 or more squares in a straight line'));
    assert.equal(facepalm.resource_cost, '2 Malice');
    assert.ok(!facepalm.automation.cards.some((card) => card.type === 'trigger'));

    const bite = monster.abilities.action.find((ability) => ability.name === 'Accursed Bite');
    assert.ok(bite.additional_effect.includes('P<0'));
    assert.ok(bite.additional_effect.includes('Each time the target is unaffected'));

    const rageText = collectStrings(monster).filter((text) => /rage/i.test(text)).join('\n');
    assert.match(rageText, /tracked manually/i);
    assert.match(rageText, /finishes a respite/i);
  } finally {
    harness.close();
  }
});

test('Level 3 Solo Werewolf uses the documented lowercase import attributes', async () => {
  const source = await readFile(new URL('../monster-json-import-normalize.js', import.meta.url), 'utf8');
  const context = vm.createContext({});
  vm.runInContext(source, context);
  const monster = JSON.parse(await readFile(monsterUrl, 'utf8'));
  const normalized = JSON.parse(JSON.stringify(context.MonsterJsonImportNormalize.normalizeAttributes(monster)));

  assert.deepEqual(normalized, {
    might: 3,
    agility: 2,
    reason: -1,
    intuition: 1,
    presence: 1,
  });
});
