import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { normalizeMonsterSnapshot } from '../normalize/monsters.js';

test('monster tier riders survive normalization, including rider-only tiers', () => {
  const monster = normalizeMonsterSnapshot({
    id: 'tier-riders', name: 'Siren',
    abilities: { action: [{ name: 'Undertow Song', has_test: true, test: {
      tier1: { damage_amount: '7', damage_type: 'psychic', tier_effect: ' pull 2 ',
        has_attribute_check: true, attribute: 'intuition', attribute_threshold: 1,
        attribute_effect: 'Enthralled (save ends)' },
      tier2: { tier_effect: 'pull 3' },
      tier3: { tierEffect: 'Enthralled (save ends)' },
    } }] },
  });
  assert.deepEqual(monster.abilities.action[0].test, {
    tier1: { damage_amount: '7', damage_type: 'psychic', tier_effect: 'pull 2',
      has_attribute_check: true, attribute: 'intuition', attribute_threshold: 1,
      attribute_effect: 'Enthralled (save ends)' },
    tier2: { tier_effect: 'pull 3' },
    tier3: { tier_effect: 'Enthralled (save ends)' },
  });
});

test('server normalization retains flat riders and rider-only tiers', () => {
  const helper = fileURLToPath(new URL('../../../../api/monster_helpers.php', import.meta.url));
  const tiers = { tier1: { damage_amount: '7', tier_effect: ' pull 2 ' },
    tier2: { tier_effect: 'the target gains 2 rage' }, tier3: { tier_effect: '  ' } };
  const normalized = JSON.parse(execFileSync(process.env.PHP_BINARY || 'php', ['-r',
    'require $argv[1]; echo json_encode(normalizeMonsterAbilityTest(json_decode($argv[2], true)));',
    helper, JSON.stringify(tiers)], { encoding: 'utf8' }));
  assert.deepEqual(normalized, { tier1: { damage_amount: '7', tier_effect: 'pull 2' },
    tier2: { tier_effect: 'the target gains 2 rage' } });
});

test('normalizeMonsterSnapshot preserves monster ability automation payloads', () => {
  const monster = normalizeMonsterSnapshot({
    id: 'm-1',
    name: 'Automated Horror',
    abilities: {
      action: [
        {
          name: 'Static Lash',
          effect: 'Zap a nearby target.',
          automation: {
            cards: [
              { type: 'damage', amount: '5' },
            ],
          },
        },
      ],
    },
  });

  assert.deepEqual(monster.abilities.action[0].automation, {
    cards: [
      { type: 'damage', amount: '5' },
    ],
  });
});

test('normalizeMonsterSnapshot preserves case-variant nested characteristics', () => {
  const monster = normalizeMonsterSnapshot({
    id: 'm-2',
    name: 'Imported Horror',
    Characteristics: {
      Might: 4,
      Agility: 2,
      Reason: -1,
      Intuition: 3,
      Presence: 1,
    },
  });

  assert.deepEqual(monster.attributes, {
    might: 4,
    agility: 2,
    reason: -1,
    intuition: 3,
    presence: 1,
  });
});

test('the organization and "With Captain" line of a minion travel with its token, in the browser and on the server', () => {
  const raw = { id: 'ghoul', name: 'Sluice Ghoul', organization: ' Minion ', role: 'Minion Harrier', with_captain: ' +1 damage bonus on strikes ' };
  const monster = normalizeMonsterSnapshot(raw);
  assert.equal(monster.organization, 'Minion');
  assert.equal(monster.with_captain, '+1 damage bonus on strikes');
  assert.equal(normalizeMonsterSnapshot({ id: 'g', name: 'G', withCaptain: 'Speed +2' }).with_captain, 'Speed +2');
  const plain = normalizeMonsterSnapshot({ id: 'wolf', name: 'Wolf', with_captain: '  ' });
  assert.equal('with_captain' in plain, false, 'an empty line is not carried');
  assert.equal('organization' in plain, false);
  // Normalizing an already-normalized snapshot keeps both.
  assert.deepEqual(normalizeMonsterSnapshot(monster), monster);
  const helper = fileURLToPath(new URL('../../../../api/monster_helpers.php', import.meta.url));
  const onServer = (value) => JSON.parse(execFileSync(process.env.PHP_BINARY || 'php', ['-r',
    'require $argv[1]; echo json_encode(normalizeMonsterSnapshot(json_decode($argv[2], true)));',
    helper, JSON.stringify(value)], { encoding: 'utf8' }));
  const fromServer = onServer(raw);
  assert.equal(fromServer.organization, 'Minion');
  assert.equal(fromServer.with_captain, '+1 damage bonus on strikes');
  assert.equal('with_captain' in onServer({ id: 'wolf', name: 'Wolf' }), false);
});

test('a monster keeps its immunities and weaknesses however many times the server tidies its record', () => {
  // A token's monster is tidied when the catalog is read and again when the token is saved.
  const helper = fileURLToPath(new URL('../../../../api/monster_helpers.php', import.meta.url));
  const raw = { id: 'drowner', name: 'Sluice Drowner', stamina: 40, stability: 1, free_strike: 3,
    immunities: [{ type: 'corruption', value: '4' }, { type: 'poison', value: '4' }], weaknesses: [{ type: 'fire', value: '3' }],
    immunity_type: 'corruption', immunity_value: '4', weakness_type: '', weakness_value: '' };
  const passes = JSON.parse(execFileSync(process.env.PHP_BINARY || 'php', ['-r',
    'require $argv[1]; $a = normalizeMonsterSnapshot(json_decode($argv[2], true)); $b = sanitizeMonsterSnapshot($a); $c = sanitizeMonsterSnapshot($b); echo json_encode([$a, $b, $c]);',
    helper, JSON.stringify(raw)], { encoding: 'utf8' }));
  const expected = { immunities: [{ type: 'corruption', value: '4' }, { type: 'poison', value: '4' }], immunity: { type: 'corruption', value: '4' },
    weaknesses: [{ type: 'fire', value: '3' }], weakness: { type: 'fire', value: '3' }, stability: 1, free_strike: 3 };
  assert.deepEqual(passes[0].defenses, expected);
  assert.deepEqual(passes[1].defenses, expected, 'the second pass (saving the token) used to drop them');
  assert.deepEqual(passes[2], passes[1], 'and it is stable from then on');
  // The browser reads the same record the same way, before and after.
  assert.deepEqual(normalizeMonsterSnapshot(passes[1]).defenses, expected);
  assert.deepEqual(normalizeMonsterSnapshot(normalizeMonsterSnapshot(raw)).defenses, expected);
  // A creature with none still has none; an old single-field record still counts.
  const plain = JSON.parse(execFileSync(process.env.PHP_BINARY || 'php', ['-r',
    'require $argv[1]; echo json_encode(sanitizeMonsterSnapshot(normalizeMonsterSnapshot(json_decode($argv[2], true))));',
    helper, JSON.stringify({ id: 'wolf', name: 'Wolf', immunities: [], weaknesses: [], immunity_type: '', weakness_type: 'fire', weakness_value: '2' })], { encoding: 'utf8' }));
  assert.equal('immunities' in (plain.defenses || {}), false);
  assert.deepEqual(plain.defenses.weaknesses, [{ type: 'fire', value: '2' }]);
});
