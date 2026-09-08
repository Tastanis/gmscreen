import test from 'node:test';
import assert from 'node:assert/strict';
import { createTokenLibraryPreferences } from '../token-library-preferences.js';

test('token preferences persist per user and bound recent history without duplicates', () => {
  const data = new Map();
  const storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
  const gm = createTokenLibraryPreferences(storage, 'GM');
  gm.toggleFavorite('dragon');
  for (let i = 0; i < 25; i++) gm.recordUsed(`token-${i}`);
  gm.recordUsed('token-20');
  const reloaded = createTokenLibraryPreferences(storage, 'GM');
  assert.equal(reloaded.isFavorite('dragon'), true);
  assert.equal(reloaded.recentIds().length, 20);
  assert.equal(reloaded.recentIds()[0], 'token-20');
  assert.equal(new Set(reloaded.recentIds()).size, 20);
  assert.equal(createTokenLibraryPreferences(storage, 'cal').isFavorite('dragon'), false);
  reloaded.toggleFavorite('dragon');
  assert.equal(createTokenLibraryPreferences(storage, 'GM').isFavorite('dragon'), false);
});

test('unavailable or malformed storage leaves the library usable', () => {
  const prefs = createTokenLibraryPreferences({ getItem() { return '{broken'; }, setItem() { throw Error('blocked'); } });
  prefs.toggleFavorite('hero');
  prefs.recordUsed('hero');
  assert.equal(prefs.isFavorite('hero'), true);
  assert.deepEqual(prefs.recentIds(), ['hero']);
});
