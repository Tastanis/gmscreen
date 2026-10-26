import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// The page half of Upload Monsters: file shapes, the required-stat check and prepareUpload, in
// monster-json-import-normalize.js. The last tests run the real normalizeImportedMonsterJson
// (monster-builder.js, as the page and dnd/tools/site-upload.mjs run it) over the example files
// and the AI guide's examples.

const here = (path) => new URL(path, import.meta.url);
const plain = (value) => JSON.parse(JSON.stringify(value));
const context = vm.createContext({});
vm.runInContext(await readFile(here('../monster-json-import-normalize.js'), 'utf8'), context);
const shared = context.MonsterJsonImportNormalize;

const complete = {
  name: 'Ember Hulk', level: 5, role: 'Brute', types: 'Elemental', ev: 24, size: '2', speed: 6, stamina: 96, stability: 0, free_strike: 8,
  attributes: { might: 3, agility: 0, reason: -1, intuition: 1, presence: 2 },
  abilities: { action: [{ name: 'Slam', effect: 'Deals 5 damage.' }] },
};

test('accepts one monster, {monster}, a list and a package with tab/subTab', () => {
  let file = shared.readImportFile(complete);
  assert.equal(file.error, '');
  assert.equal(file.items.length, 1);
  assert.equal(file.items[0].source.name, 'Ember Hulk');
  assert.deepEqual(plain(file.package), { tab: '', subTab: '' });

  file = shared.readImportFile({ monster: complete, tab: 'Orchard' });
  assert.equal(file.items.length, 1);
  assert.equal(file.items[0].source.name, 'Ember Hulk');
  assert.equal(file.items[0].source.tab, 'Orchard', 'a wrapper\'s tab still counts');

  file = shared.readImportFile([complete, { ...complete, name: 'Second' }]);
  assert.deepEqual(file.items.map((item) => item.source.name), ['Ember Hulk', 'Second']);

  file = shared.readImportFile({ tab: ' Gravity Orchard ', subTab: 'Foes', monsters: [complete, { monster: { ...complete, name: 'Wrapped' }, id: 'wrapped_id', subTab: 'Bosses' }] });
  assert.deepEqual(plain(file.package), { tab: 'Gravity Orchard', subTab: 'Foes' });
  assert.equal(file.items[1].source.name, 'Wrapped');
  assert.equal(file.items[1].source.id, 'wrapped_id');
  assert.equal(file.items[1].source.subTab, 'Bosses', 'a per-monster subTab override is kept');
});

test('refuses what is not a monster file, and marks list items that are not monsters', () => {
  assert.match(shared.readImportFile('text').error, /monster object/);
  assert.match(shared.readImportFile(7).error, /monster object/);
  assert.match(shared.readImportFile([]).error, /no monsters/);
  assert.match(shared.readImportFile({ monsters: [] }).error, /no monsters/);
  const file = shared.readImportFile([complete, 'oops', null]);
  assert.equal(file.items.length, 3);
  assert.equal(file.items[1].source, null);
  assert.match(file.items[1].error, /Item 2 is not a monster object/);
});

test('required stats: complete passes (0 and negatives fine), aliases count, left-out ones are named', () => {
  assert.deepEqual(plain(shared.missingRequiredStats(complete)), []);
  assert.deepEqual(plain(shared.missingRequiredStats({
    name: 'Alias', level: '3', organization: 'Solo', type: 'Beast', ev: 60, size: '1L', speed: 7, hp: 300,
    defenses: { stability: 1, freeStrike: 6 }, Characteristics: [{ name: 'Might', value: 3 }, { name: 'agility', value: 2 }, { name: 'Reason', value: -1 }, { name: 'INTUITION', value: 0 }, { name: 'presence', value: '+1' }],
  })), [], 'every spelling the normaliser reads counts');
  const gaps = { ...complete, attributes: { might: 3, agility: 0, reason: -1, intuition: 1 } };
  delete gaps.stamina; delete gaps.free_strike;
  gaps.speed = 'fast';
  assert.deepEqual(plain(shared.missingRequiredStats(gaps)), ['speed', 'stamina', 'free_strike', 'presence']);
  assert.equal(shared.missingRequiredStats({ ...complete, name: '   ' })[0], 'name');
  assert.equal(shared.missingRequiredStats(null).length, 15);
});

test('prepareUpload: normalises each monster with the given normaliser, keeps refusals and automation warnings', () => {
  const normalize = (source) => {
    if (!source.name) throw new Error('Monster JSON must include a non-empty "name".');
    return { name: source.name, abilities: { action: [{ name: 'Slam', automation: { warnings: ['Missing schema id'] } }] }, traits: [{ name: 'Hide', automation: { warnings: ['odd'] } }] };
  };
  const prepared = shared.prepareUpload({ tab: 'T', monsters: [complete, { level: 1 }, 5] }, normalize);
  assert.equal(prepared.error, '');
  assert.deepEqual(plain(prepared.package), { tab: 'T', subTab: '' });
  assert.equal(prepared.entries.length, 3);
  assert.equal(prepared.entries[0].monster.name, 'Ember Hulk');
  assert.deepEqual(plain(prepared.entries[0].missing), []);
  assert.deepEqual(plain(prepared.entries[0].automationWarnings), ['Slam (action) automation: Missing schema id', 'Hide (trait) automation: odd']);
  assert.equal(prepared.entries[1].monster, null);
  assert.match(prepared.entries[1].normalizeError, /non-empty "name"/);
  assert.ok(prepared.entries[1].missing.includes('name'));
  assert.match(prepared.entries[2].normalizeError, /Item 3/);
});

// ---- with the real normaliser ---------------------------------------------------------------------
async function realNormalizer() {
  const require = createRequire(import.meta.url);
  const { JSDOM, VirtualConsole } = require('jsdom');
  const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only', url: 'https://monster-creator.invalid/', virtualConsole: new VirtualConsole() });
  dom.window.fetch = () => Promise.reject(new Error('offline'));
  for (const script of ['../../../../character_sheet/ability-automation/primitives.js', '../../../../character_sheet/ability-automation/schema.js', '../monster-json-import-normalize.js', '../monster-builder.js']) {
    dom.window.eval(await readFile(here(script), 'utf8'));
  }
  return dom.window;
}

test('the example import files and the AI guide\'s examples are complete under the real normaliser', async () => {
  const window = await realNormalizer();
  try {
    const files = (await readdir(here('../../imports/'))).filter((name) => name.endsWith('.json'));
    assert.ok(files.length >= 5);
    for (const name of files) {
      const prepared = window.MonsterJsonImportNormalize.prepareUpload(JSON.parse(await readFile(here(`../../imports/${name}`), 'utf8')), window.normalizeImportedMonsterJson);
      for (const entry of prepared.entries) {
        assert.equal(entry.normalizeError, '', name);
        assert.deepEqual(plain(entry.missing), [], `${name} leaves out stats`);
      }
    }
    const guide = await readFile(here('../../../../ai-reference/monsters/UPLOAD-GUIDE.md'), 'utf8');
    const blocks = [...guide.matchAll(/```json\n([\s\S]*?)```/g)].map((match) => JSON.parse(match[1]));
    assert.ok(blocks.length >= 2, 'the guide has a minimal and a package example');
    let monsters = 0;
    for (const block of blocks) {
      const prepared = window.MonsterJsonImportNormalize.prepareUpload(block, window.normalizeImportedMonsterJson);
      assert.equal(prepared.error, '');
      for (const entry of prepared.entries) {
        monsters++;
        assert.equal(entry.normalizeError, '');
        assert.deepEqual(plain(entry.missing), [], `${entry.source.name} leaves out stats`);
        assert.deepEqual(plain(entry.automationWarnings), [], `${entry.source.name} has automation warnings`);
      }
    }
    assert.ok(monsters >= 3);
    // The paste import's own normaliser is still the one exposed for dnd/tools/site-upload.mjs.
    assert.equal(typeof window.normalizeImportedMonsterJson, 'function');
  } finally {
    window.close();
  }
});

// The server's planner (includes/monster-import.php) over what the page would send for the same
// files: every example imports with no errors, and the guide's examples with no warnings either. Uploads never make
// tabs (October 2026), so the tabs the guide names are there.
test('the server planner accepts the example files and the guide examples as the page sends them', async (t) => {
  const php = process.env.PHP_BINARY || 'php';
  if (spawnSync(php, ['-v'], { encoding: 'utf8' }).status !== 0) { t.skip('php is not on PATH (set PHP_BINARY)'); return; }
  const window = await realNormalizer();
  try {
    const library = fileURLToPath(here('../../includes/monster-import.php'));
    const files = [];
    for (const name of (await readdir(here('../../imports/'))).filter((n) => n.endsWith('.json'))) files.push({ name, parsed: JSON.parse(await readFile(here(`../../imports/${name}`), 'utf8')), strict: false });
    const guide = await readFile(here('../../../../ai-reference/monsters/UPLOAD-GUIDE.md'), 'utf8');
    [...guide.matchAll(/```json\n([\s\S]*?)```/g)].forEach((match, index) => files.push({ name: `guide example ${index + 1}`, parsed: JSON.parse(match[1]), strict: true }));
    for (const file of files) {
      const prepared = window.MonsterJsonImportNormalize.prepareUpload(file.parsed, window.normalizeImportedMonsterJson);
      const request = plain({ fileName: file.name, package: prepared.package, entries: prepared.entries, defaultTab: { tabId: 't', subTabId: 's' } });
      const script = `require ${JSON.stringify(library)}; $plan = monsterImportPlan(['tabs' => ['t' => ['name' => 'T', 'subTabs' => ['s' => ['name' => 'S', 'monsters' => []]]], 'g' => ['name' => 'Gravity Orchard', 'subTabs' => ['f' => ['name' => 'Foes', 'monsters' => []]]]], 'monsters' => []], json_decode(stream_get_contents(STDIN), true), ['imagesDir' => sys_get_temp_dir()]); echo json_encode($plan['entries']);`;
      const run = spawnSync(php, ['-r', script], { input: JSON.stringify(request), encoding: 'utf8' });
      assert.equal(run.status, 0, run.stderr);
      for (const row of JSON.parse(run.stdout)) {
        assert.deepEqual(row.errors, [], `${file.name}: ${row.name}`);
        assert.equal(row.importable, true, `${file.name}: ${row.name}`);
        if (file.strict) assert.deepEqual(row.warnings, [], `${file.name}: ${row.name}`);
      }
    }
  } finally {
    window.close();
  }
});
