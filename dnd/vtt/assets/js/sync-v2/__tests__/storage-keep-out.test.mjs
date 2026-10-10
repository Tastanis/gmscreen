import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// The rule files that keep visitors out of saved data. A mistake in one turns its whole folder into
// errors, and several of these folders also hold pages, scripts or pictures. So each file is pinned
// here line for line, and each may hold nothing but <Files> blocks with the two lines that
// dnd/data/.htaccess uses, which the host is known to accept.
const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(testDirectory, '../../../../../..');
const rule = (relativePath) => readFile(path.join(siteRoot, relativePath), 'utf8');
const lines = (text) => text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
const blocks = (patterns) => patterns.flatMap((pattern) => [`<Files ${pattern}>`, 'Order deny,allow', 'Deny from all', '</Files>']);

// Apache's <Files> wildcard: * is any run of characters, ? is one, and the whole name must match.
const matches = (pattern, name) => new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`).test(name);
const refused = (patterns, name) => patterns.some((pattern) => matches(pattern, name));

// folder: [patterns, names that must be refused, names that must still be served]
const RULES = {
  'dnd/vtt/storage': [['*.sqlite*', 'scenes.json', 'tokens.json', 'board-state.json'],
    ['sync-v2.sqlite', 'sync-v2.sqlite-wal', 'sync-v2.sqlite-shm', 'sync-v2.sqlite-journal', 'sync-v2.before-split-20261011-101500.sqlite',
      'sync-v2.before-split-20261011-101500.sqlite.part', 'sync-v2.sqlite.split.lock', 'scenes.json', 'tokens.json', 'board-state.json'],
    ['map.png', 'bundled-image-0.jpg', 'token.webp', '.gitkeep']],
  'dnd/vtt/config': [['*.json', '*.lock'], ['player-roster.json', 'player-roster.json.lock'], ['sync-v2.php']],
  'dnd/character_sheet/data': [['*.json', '*.lock'], ['character_sheets.json', 'character_sheets.lock', 'hero_tokens.json', 'character_sheets_latest.json', 'character_sheets_20260706_000945.json'], ['hireling.png', 'portrait.webp']],
  'dnd/strixhaven/students': [['*.json', 'error_log'], ['students.json', 'error_log'], ['index.php', 'students.js', 'students.css', 'portrait.png', 'thumb.webp']],
  'dnd/strixhaven/staff': [['*.json', 'error_log'], ['staff.json', 'error_log'], ['index.php', 'staff.js', 'staff.css', 'portrait.png', 'thumb.webp']],
  'dnd/strixhaven/locations': [['*.json'], ['locations.json'], ['index.php', 'locations.js', 'place.png']],
  'dnd/strixhaven/othernpcs': [['*.json', '*.lock'], ['othernpcs.json', 'othernpcs.lock', 'othernpcs_backup_20261001.json'], ['index.php', 'othernpcs.js', 'othernpcs.css']],
  'dnd/strixhaven/arcaneconstruction/data': [['*.json'], ['gm_data.json', 'zepha_data.json'], ['picture.png']],
  'dnd/strixhaven/monster-creator/data': [['*.json'], ['gm-monsters.json', 'gm-monsters_backup_latest.json'], ['picture.png']],
  'dnd/strixhaven/templates/data': [['*.json'], ['templates.json'], ['picture.png']],
  'dnd/strixhaven/map/data': [['*.json', '*.lock'], ['pings.json', 'player-path-overlay.json', 'player-path-overlay.lock'], ['picture.png']],
  'dnd/strixhaven/map/hex-data': [['*.json', '*.lock'], ['hex-26-19.json', 'hex-26-19.lock'], ['picture.png']],
  'dnd/strixhaven/gm/includes': [['*.bak'], ['backup-system.php.bak'], ['character-integration.php']],
  'dnd/strixhaven/gm': [['error_log'], ['error_log'], ['index.php', 'gm.js', 'gm.css', 'picture.png']],
  'dnd/strixhaven/inventory': [['error_log'], ['error_log'], ['index.php', 'inventory.js', 'item.png']],
  'dnd/schedule': [['error_log'], ['error_log'], ['index.php', 'schedule.js', 'schedule.css']],
};

for (const [folder, [patterns, mustRefuse, mustServe]] of Object.entries(RULES)) {
  test(`${folder}: the rule file refuses its saved data and nothing a browser needs`, async () => {
    assert.deepEqual(lines(await rule(`${folder}/.htaccess`)), blocks(patterns));
    for (const name of mustRefuse) assert.equal(refused(patterns, name), true, `${name} must be refused`);
    for (const name of mustServe) assert.equal(refused(patterns, name), false, `${name} must still be served`);
  });
}

test('the folder of old saved VTT copies refuses every visitor', async () => {
  assert.deepEqual(lines(await rule('dnd/vtt/storage/backups/.htaccess')), ['Order deny,allow', 'Deny from all']);
});

test('the rules are written as the ones this host already accepts', async () => {
  const model = lines(await rule('dnd/data/.htaccess'));
  assert.deepEqual(model.slice(0, 2), ['Order deny,allow', 'Deny from all']);
  assert.ok(model.includes('<Files *.php>'), 'the model has a <Files> block with a wildcard');
});

test('no rule file in a folder with pictures, pages or scripts refuses by anything but a named pattern', async () => {
  for (const folder of Object.keys(RULES)) {
    const text = lines(await rule(`${folder}/.htaccess`));
    let inside = false;
    for (const line of text) {
      if (line.startsWith('<Files ')) inside = true;
      else if (line === '</Files>') inside = false;
      else assert.equal(inside, true, `${folder}: "${line}" stands outside a <Files> block`);
    }
  }
});
