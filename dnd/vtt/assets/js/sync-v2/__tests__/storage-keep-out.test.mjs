import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const vttRoot = path.resolve(testDirectory, '../../../..');
const rule = (relativePath) => readFile(path.join(vttRoot, relativePath), 'utf8');
const lines = (text) => text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));

// Apache's <Files> wildcard: * is any run of characters, ? is one, and the whole name must match.
const matches = (pattern, name) => new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`).test(name);

test('the database folder refuses the database, its side files and its dated copies, and nothing else', async () => {
  const text = lines(await rule('storage/.htaccess'));
  // Only this one block: a mistake in a rule file turns the whole folder into errors, and the map pictures live under it.
  assert.deepEqual(text, ['<Files *.sqlite*>', 'Order deny,allow', 'Deny from all', '</Files>']);
  const pattern = '*.sqlite*';
  for (const name of ['sync-v2.sqlite', 'sync-v2.sqlite-wal', 'sync-v2.sqlite-shm', 'sync-v2.sqlite-journal',
    'sync-v2.before-split-20261011-101500.sqlite', 'sync-v2.before-split-20261011-101500.sqlite.part']) {
    assert.equal(matches(pattern, name), true, `${name} must be refused`);
  }
  for (const name of ['map.png', 'bundled-image-0.jpg', 'token.webp', 'scenes.json', '.gitkeep']) {
    assert.equal(matches(pattern, name), false, `${name} must not be caught by the database rule`);
  }
});

test('the folder of old saved copies refuses every visitor', async () => {
  assert.deepEqual(lines(await rule('storage/backups/.htaccess')), ['Order deny,allow', 'Deny from all']);
});

test('the rules are written as the ones this host already accepts', async () => {
  const model = lines(await readFile(path.join(vttRoot, '..', 'data', '.htaccess'), 'utf8'));
  assert.deepEqual(model.slice(0, 2), ['Order deny,allow', 'Deny from all']);
  assert.ok(model.includes('<Files *.php>'), 'the model has a <Files> block with a wildcard');
});
