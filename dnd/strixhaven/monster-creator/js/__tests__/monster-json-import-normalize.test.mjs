import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(
  new URL('../monster-json-import-normalize.js', import.meta.url),
  'utf8',
);
const context = vm.createContext({});
vm.runInContext(source, context);
const normalize = context.MonsterJsonImportNormalize;

test('normalizes documented lowercase attributes without losing negatives or zero', () => {
  assert.deepEqual(
    JSON.parse(JSON.stringify(normalize.normalizeAttributes({
      attributes: {
        might: 3,
        agility: 0,
        reason: -2,
        intuition: 1,
        presence: 2,
      },
    }))),
    { might: 3, agility: 0, reason: -2, intuition: 1, presence: 2 },
  );
});

test('accepts common characteristic containers and case variants', () => {
  assert.deepEqual(
    JSON.parse(JSON.stringify(normalize.normalizeAttributes({
      Characteristics: {
        Might: '+4',
        Agility: '2',
        Reason: '-1',
        Intuition: 3,
        Presence: 1,
      },
    }))),
    { might: 4, agility: 2, reason: -1, intuition: 3, presence: 1 },
  );
});

test('documented nested attributes override legacy top-level zero placeholders', () => {
  assert.deepEqual(
    JSON.parse(JSON.stringify(normalize.normalizeAttributes({
      might: 0,
      agility: 0,
      reason: 0,
      intuition: 0,
      presence: 0,
      attributes: {
        might: 4,
        agility: 2,
        reason: -1,
        intuition: 3,
        presence: 1,
      },
    }))),
    { might: 4, agility: 2, reason: -1, intuition: 3, presence: 1 },
  );
});

test('accepts attribute arrays emitted by alternate JSON exporters', () => {
  assert.deepEqual(
    JSON.parse(JSON.stringify(normalize.normalizeAttributes({
      stats: [
        { name: 'Might', value: 2 },
        { name: 'Agility', score: 3 },
        { characteristic: 'Reason', modifier: -1 },
        { key: 'Intuition', amount: 4 },
        { attribute: 'Presence', value: 1 },
      ],
    }))),
    { might: 2, agility: 3, reason: -1, intuition: 4, presence: 1 },
  );
});

test('preserves the non-zero scores in the checked-in monster import examples', async () => {
  const names = [
    'already-damned-render.json',
    'radenwight-grand-meddle.json',
    'scree-prophet-vhosse.json',
    'tallish-line-bender.json',
  ];
  for (const name of names) {
    const raw = JSON.parse(await readFile(new URL(`../../imports/${name}`, import.meta.url), 'utf8'));
    const attributes = JSON.parse(JSON.stringify(normalize.normalizeAttributes(raw)));
    assert.ok(
      Object.values(attributes).some((value) => value !== 0),
      `${name} should retain at least one non-zero attribute`,
    );
  }
});
