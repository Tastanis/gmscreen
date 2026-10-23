import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Build 550, Brandon (October 2026): the Kit box shows what the kit's feature card carries, "so that we don't have
// different things". One source: the card's name and its melee/ranged damage and distance bonuses are shown from the
// card (not typed); the rest (weapon, armor, speed, disengage, stamina, stability) stays the box's own. The print
// sheet and Export Character Sheet use the same. Nothing is written into the saved box.

const sheet = readFileSync(new URL('../../sheet.js', import.meta.url), 'utf8');
const defaults = sheet.slice(sheet.indexOf('const DEFAULT_KIT_FIELDS'), sheet.indexOf('};', sheet.indexOf('const DEFAULT_KIT_FIELDS')) + 2);
const helpers = sheet.slice(sheet.indexOf('function kitFeatureOf('), sheet.indexOf('function defaultCommonThing('));
const { kitFeatureOf, kitValuesFromFeature, effectiveKit } = new Function(`let sheetState = null; ${defaults}\n${helpers}\nreturn { kitFeatureOf, kitValuesFromFeature, effectiveKit };`)();

const shining = { title: 'shining armor kit', automation: { modifiers: [{ match: { keywordsAll: ['Melee', 'Weapon'], reach: 'melee' }, apply: { damageBonus: 2, rangeBonus: 0 } }] } };
const whirlwind = { title: 'Whirlwind Kit', automation: { modifiers: [{ match: { keywordsAll: ['Melee', 'Weapon'] }, apply: { damageBonus: 1, rangeBonus: 1 } }] } };

test('the kit card: found by its title, the one with modifiers first', () => {
  assert.equal(kitFeatureOf({ features: [{ title: 'Judgment' }, shining] }), shining);
  assert.equal(kitFeatureOf({ features: [{ title: 'Kit- warrior Priest' }, whirlwind] }), whirlwind);
  assert.equal(kitFeatureOf({ features: [{ title: 'Kitchen duty' }] }), null, '"kit" as a word only');
});

test("what the card carries: the name, and +N damage and distance for its reach", () => {
  assert.deepEqual(kitValuesFromFeature(shining), { name: 'Shining Armor', meleeDamageLow: '+2', meleeDamageMid: '+2', meleeDamageHigh: '+2' });
  assert.deepEqual(kitValuesFromFeature(whirlwind), { name: 'Whirlwind', meleeDamageLow: '+1', meleeDamageMid: '+1', meleeDamageHigh: '+1', meleeDistance: '+1' });
  assert.deepEqual(kitValuesFromFeature({ title: 'Kit- warrior Priest' }), { name: 'Warrior Priest' });
});

test('one source: the card over the box for what it carries, the box for the rest; saved data untouched', () => {
  const state = { features: [shining], hero: { kit: { name: 'Typed by hand', stamina: '+6', stability: '+1' } } };
  const kit = effectiveKit(state);
  assert.equal(kit.values.name, 'Shining Armor');
  assert.equal(kit.values.meleeDamageMid, '+2');
  assert.equal(kit.values.stamina, '+6', 'what the card does not carry stays the box\'s own');
  assert.equal(state.hero.kit.name, 'Typed by hand', 'nothing is written into the saved box');
  assert.match(sheet, /kit: effectiveKit\(sheetState\)\.values,/, 'Export Character Sheet');
  assert.match(sheet, /const kit = effectiveKit\(sheetState\)\.values;/, 'the print sheet');
});
