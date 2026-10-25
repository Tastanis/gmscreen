import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Import JSON kept only a trait's name and text, so a passive written on a trait (rollModifier, deathRule,
// movement, conditionRule, object...) never reached an imported creature. Kept now, normalized like an ability's.

const builder = await readFile(new URL('../monster-builder.js', import.meta.url), 'utf8');
const start = builder.indexOf('function normalizeImportedTrait(');
const end = builder.indexOf('function toImportedInt(', start);
const normalizeImportedTrait = new Function('cleanText', 'cloneImportedPlainObject', 'window', `${builder.slice(start, end)}; return normalizeImportedTrait;`)(
  (value) => String(value ?? '').trim(),
  (value) => JSON.parse(JSON.stringify(value)),
  { AbilityAutomationSchema: { normalizeAutomation: (automation) => ({ ...automation, normalized: true }) } },
);

test('a trait keeps its automation on import, normalized', () => {
  const trait = normalizeImportedTrait({ name: 'Ghost Step', description: 'Moves through walls.', automation: { schema: 'ability-automation/v3', passives: [{ kind: 'movement', moveThroughCreatures: true }] } });
  assert.deepEqual(trait, { name: 'Ghost Step', text: 'Moves through walls.', automation: { schema: 'ability-automation/v3', passives: [{ kind: 'movement', moveThroughCreatures: true }], normalized: true } });
});

test('a trait without automation stays name and text', () => {
  assert.deepEqual(normalizeImportedTrait({ name: 'Hardy', text: 'Tough.' }), { name: 'Hardy', text: 'Tough.' });
  assert.deepEqual(normalizeImportedTrait({ name: 'Odd', automation: ['not', 'an', 'object'] }), { name: 'Odd', text: '' });
});
