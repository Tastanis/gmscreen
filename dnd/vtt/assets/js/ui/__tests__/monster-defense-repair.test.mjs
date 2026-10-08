import { test } from 'node:test';
import assert from 'node:assert/strict';
import { declaredDefenses, monsterIdOf, lacksDefenses, restoredDefenses } from '../monster-defense-repair.mjs';

const catalog = { id: 'drowner', name: 'Sluice Drowner', defenses: { immunities: [{ type: 'corruption', value: '4' }, { type: 'poison', value: '4' }], immunity: { type: 'corruption', value: '4' }, stability: 1 } };
// A token as it was saved before the fix: the monster record kept stability and lost the rest.
const stripped = () => ({ id: 't1', name: 'Sluice Drowner', monsterId: 'drowner', monster: { id: 'drowner', name: 'Sluice Drowner', defenses: { stability: 1, free_strike: 3 } } });

test('what a monster record declares is read from every form it has been stored in', () => {
  assert.deepEqual(declaredDefenses(catalog).immunities.map((e) => e.type), ['corruption', 'poison']);
  assert.deepEqual(declaredDefenses({ immunities: [{ type: 'fire', value: 3 }], weaknesses: [] }), { immunities: [{ type: 'fire', value: 3 }], weaknesses: [] });
  assert.deepEqual(declaredDefenses({ defenses: { weakness: { type: 'cold', value: '2' } } }).weaknesses, [{ type: 'cold', value: '2' }]);
  assert.deepEqual(declaredDefenses({ immunity_type: 'holy', immunity_value: '5', weakness_type: '', weakness_value: '' }), { immunities: [{ type: 'holy', value: '5' }], weaknesses: [] });
  // Empty rows are not defenses.
  assert.deepEqual(declaredDefenses({ immunities: [{ type: '', value: '' }, null], weaknesses: [] }), { immunities: [], weaknesses: [] });
  assert.deepEqual(declaredDefenses(null), { immunities: [], weaknesses: [] });
});

test('only a token made from a monster, with no immunity and no weakness at all, is a candidate', () => {
  assert.equal(lacksDefenses(stripped()), true);
  assert.equal(monsterIdOf(stripped()), 'drowner');
  assert.equal(monsterIdOf({ id: 't', monster: { id: 'from-record' } }), 'from-record');
  assert.equal(lacksDefenses({ id: 'cal', name: 'Cal' }), false, 'a hero has no monster record');
  assert.equal(lacksDefenses({ id: 't', monsterId: 'x' }), false, 'no record on the token (a player’s view): leave it');
  assert.equal(lacksDefenses({ id: 't', monster: { id: 'd', defenses: { weaknesses: [{ type: 'fire', value: '3' }] } } }), false, 'one weakness is enough to leave it alone');
  assert.equal(lacksDefenses({ id: 't', monster: { id: 'd', immunity_type: 'fire', immunity_value: '2' } }), false);
});

test('missing immunities and weaknesses come back from the monster’s own record, the rest is kept', () => {
  const defenses = restoredDefenses(stripped(), catalog);
  assert.deepEqual(defenses, { stability: 1, free_strike: 3, immunities: [{ type: 'corruption', value: '4' }, { type: 'poison', value: '4' }], immunity: { type: 'corruption', value: '4' } });
  assert.equal('weaknesses' in defenses, false, 'nothing is invented');
  const both = restoredDefenses(stripped(), { immunities: [{ type: 'fire', value: 3 }], weaknesses: [{ type: 'cold', value: 2 }] });
  assert.deepEqual([both.immunity, both.weakness], [{ type: 'fire', value: '3' }, { type: 'cold', value: '2' }]);
  // The copy is the token's own: changing it later does not touch the record it came from.
  defenses.immunities[0].value = '99';
  assert.equal(catalog.defenses.immunities[0].value, '4');
});

test('nothing is restored when there is nothing to restore', () => {
  assert.equal(restoredDefenses(stripped(), { id: 'wolf', name: 'Wolf', defenses: { stability: 0 } }), null, 'the monster has none either');
  assert.equal(restoredDefenses(stripped(), null), null, 'the monster is no longer in the catalog');
  const whole = { id: 't', monster: { id: 'drowner', defenses: { immunities: [{ type: 'poison', value: '1' }] } } };
  assert.equal(restoredDefenses(whole, catalog), null, 'a token that has some keeps exactly what it has');
  assert.equal(restoredDefenses({ id: 'cal' }, catalog), null);
});
