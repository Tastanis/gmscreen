import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createAbilityAutomationHarness } from '../../../character_sheet/ability-automation/__tests__/support/automation-harness.mjs';

const monsterPath = new URL('../dean-embrose.json', import.meta.url);

function collectAbilities(monster) {
  return Object.entries(monster.abilities || {}).flatMap(([category, abilities]) =>
    (abilities || []).map((ability) => ({ category, ability })),
  );
}

test('Dean Embrose imports with valid v3 automation and free villain actions', async () => {
  const monster = JSON.parse(await readFile(monsterPath, 'utf8'));
  const harness = await createAbilityAutomationHarness();

  try {
    assert.equal(monster.name, 'Dean Embrose');
    assert.equal(monster.level, 10);
    assert.equal(monster.role, 'Solo Controller');

    const abilities = collectAbilities(monster);
    assert.ok(abilities.length >= 13);
    assert.deepEqual(
      monster.abilities.passive.map((ability) => ability.name),
      ['Solo Monster', 'Master of Inklings'],
    );

    for (const { category, ability } of abilities) {
      assert.ok(ability.name, `${category} ability needs a name`);
      assert.ok(
        ability.effect || ability.additional_effect,
        `${ability.name} needs visible action-tray rules text`,
      );
      if (ability.automation) harness.validateAutomation(ability.automation);
    }

    const villainActions = monster.abilities.villain_action;
    assert.deepEqual(
      villainActions.map((ability) => ability.name),
      [
        'The Ink Takes Attendance',
        'Consider Your Next Words Carefully',
        'Defend Your Thesis',
      ],
    );
    for (const ability of villainActions) {
      assert.equal(ability.resource_cost, undefined, `${ability.name} must not cost Malice`);
    }
  } finally {
    harness.close();
  }
});
