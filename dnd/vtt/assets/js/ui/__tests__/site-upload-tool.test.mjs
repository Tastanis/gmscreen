import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

// The command-line tool that uploads a map package or creature files to the site with a key in
// place of a login (docs/site-upload.md). The server's side is site-upload.test.php.
const tool = await import('../../../../../tools/site-upload.mjs');
const { parseArguments, iniBytes, requestLimit, siteAddress, call, setup, automationsIn, mapReport, creatureReport, prepareCreatures, main, Refused, ENDPOINT } = tool;
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../..');
const scratch = await mkdtemp(path.join(os.tmpdir(), 'site-upload-tool-'));
test.after(() => rm(scratch, { recursive: true, force: true }));

/** A stand-in for the site: answers from a list, and remembers what it was sent. */
function fakeSite(answers) {
  const seen = [];
  const fetcher = async (url, options) => {
    seen.push({ url, method: options.method, headers: { ...options.headers }, body: options.body, redirect: options.redirect });
    const next = typeof answers === 'function' ? answers(url, options) : answers.shift();
    return { status: next.status ?? 200, ok: (next.status ?? 200) < 400, json: async () => { if (next.body === undefined) throw new Error('not JSON'); return next.body; } };
  };
  return { fetcher, seen };
}

test('the command line: a file, and the flags that go with it', () => {
  assert.deepEqual(parseArguments(['map', 'C:\\maps\\Orchard.vttmap', '--folder', 'Prismari', '--replace']), { command: 'map', target: 'C:\\maps\\Orchard.vttmap', flags: { folder: 'Prismari', replace: true } });
  assert.deepEqual(parseArguments(['creature', 'folder', '--tab', 'Gravity Orchard', '--create-tab', '--force']).flags, { tab: 'Gravity Orchard', 'create-tab': true, force: true });
  assert.deepEqual(parseArguments([]), { command: '', target: '', flags: {} });
  assert.throws(() => parseArguments(['map', 'x', '--folder']), /--folder needs a value/);
  assert.throws(() => parseArguments(['map', 'x', '--folder', '--replace']), /--folder needs a value/);
});

test('the server\'s size limits, as PHP writes them', () => {
  assert.deepEqual(['2M', '64M', '1G', '512K', '8388608', '', '0', '-1'].map(iniBytes), [2097152, 67108864, 1073741824, 524288, 8388608, 0, 0, -1]);
  assert.equal(requestLimit({ upload_max_filesize: '8M', post_max_size: '64M' }, true), 8 * 1048576, 'a picture must fit the smaller of the two');
  assert.equal(requestLimit({ upload_max_filesize: '8M', post_max_size: '64M' }), 64 * 1048576, 'the design must fit a whole request');
  assert.equal(requestLimit({ upload_max_filesize: '0', post_max_size: '0' }, true), Infinity, 'zero means no limit');
});

test('only https, and plain http only to this PC when asked for', () => {
  assert.equal(siteAddress('https://bharmsasl.com'), 'https://bharmsasl.com');
  assert.equal(siteAddress('https://bharmsasl.com/'), 'https://bharmsasl.com');
  assert.throws(() => siteAddress('http://bharmsasl.com'), /must start with https/);
  assert.throws(() => siteAddress('http://bharmsasl.com', true), /must start with https/, 'the sandbox switch does not open plain http to a real site');
  assert.equal(siteAddress('http://127.0.0.1:18861', true), 'http://127.0.0.1:18861');
  assert.throws(() => siteAddress('http://127.0.0.1:18861'), /must start with https/);
  assert.throws(() => siteAddress('https://user:secret@bharmsasl.com'), /just the site/);
  assert.throws(() => siteAddress('https://bharmsasl.com/?key=abc'), /just the site/, 'nothing may ride in the address');
  assert.throws(() => siteAddress('bharmsasl'), /not a site address/);
});

test('the key goes in a header by POST, never in the address, and redirects are refused', async () => {
  const site = fakeSite([{ body: { success: true, result: { folders: [] } } }]);
  const result = await call({ site: 'https://example.test', key: 'K'.repeat(64) }, 'status', {}, site.fetcher);
  assert.deepEqual(result, { folders: [] });
  const sent = site.seen[0];
  assert.equal(sent.url, `https://example.test${ENDPOINT}?action=status`);
  assert.equal(sent.url.includes('K'.repeat(8)), false);
  assert.equal(sent.method, 'POST');
  assert.equal(sent.headers['X-GMScreen-Upload-Key'], 'K'.repeat(64));
  assert.equal(sent.redirect, 'error');
});

test('what the site says no in, in plain words, and never with the key', async () => {
  const connection = { site: 'https://example.test', key: 'K'.repeat(64) };
  const answer = async (reply) => { try { await call(connection, 'status', {}, fakeSite([reply]).fetcher); return ''; } catch (error) { assert.ok(error instanceof Refused); return error.message; } };
  assert.match(await answer({ status: 404, body: { success: false, error: 'Not found.' } }), /no upload here.*not deployed yet, or the server has no key file/s);
  assert.match(await answer({ status: 403, body: { success: false, error: 'Access denied.' } }), /refused the key.*do not match/s);
  assert.match(await answer({ status: 403, body: { success: false, error: 'HTTPS required.' } }), /HTTPS is required/);
  assert.match(await answer({ status: 429, body: { success: false, error: 'Too many wrong keys.' } }), /fifteen minutes/);
  assert.equal(await answer({ status: 422, body: { success: false, error: 'A scene named "X" already exists. Add --replace' } }), 'A scene named "X" already exists. Add --replace');
  assert.match(await answer({ status: 500 }), /answered 500 and no reason/);
  for (const reply of [{ status: 404, body: {} }, { status: 403, body: {} }, { status: 500 }]) assert.equal((await answer(reply)).includes('KKKK'), false);
  const down = async () => { throw new Error('getaddrinfo ENOTFOUND'); };
  await assert.rejects(call(connection, 'status', {}, down), /Could not reach https:\/\/example\.test/);
});

test('setup makes a key it never shows, and a server file that holds only its fingerprint', async () => {
  const folder = path.join(scratch, 'key-a'), said = [];
  assert.equal(await main(['setup', '--key-file', path.join(folder, 'key.txt')], { say: (text) => said.push(text) }), 0);
  const key = (await readFile(path.join(folder, 'key.txt'), 'utf8')).trim(), server = await readFile(path.join(folder, 'dnd-site-upload.php'), 'utf8');
  assert.ok(key.length >= 60 && /^[A-Za-z0-9_-]+$/.test(key), 'long and random');
  assert.equal(said.join('\n').includes(key), false, 'the key is not printed');
  assert.equal(server.includes(key), false, 'the server\'s file does not hold the key');
  assert.ok(server.includes(createHash('sha256').update(key).digest('hex')), 'it holds the key\'s fingerprint');
  assert.match(server, /'allow_loopback_http' => false/);
  assert.match(said.join('\n'), /next to public_html and NOT inside it/);
  // A second setup does not silently throw the key away.
  await assert.rejects(setup({ folder }), /A key already exists.*--new-key/s);
  assert.equal((await readFile(path.join(folder, 'key.txt'), 'utf8')).trim(), key);
  await setup({ folder, newKey: true });
  assert.notEqual((await readFile(path.join(folder, 'key.txt'), 'utf8')).trim(), key, 'asked to, it makes a new one');
  // Never inside the repository, where it could be committed.
  await assert.rejects(setup({ folder: path.join(repository, 'dnd', 'tools', 'keys') }), /must not be kept inside the repository/);
  await assert.rejects(setup({ folder: repository }), /must not be kept inside the repository/);
});

test('with no key file the tool says how to make one, and sends nothing', async () => {
  const site = fakeSite([]);
  await assert.rejects(main(['status', '--key-file', path.join(scratch, 'none', 'key.txt')], { say: () => {}, fetcher: site.fetcher }), /There is no key file.*setup/s);
  assert.equal(site.seen.length, 0);
  await mkdir(path.join(scratch, 'short'), { recursive: true });
  await writeFile(path.join(scratch, 'short', 'key.txt'), 'abc');
  await assert.rejects(main(['status', '--key-file', path.join(scratch, 'short', 'key.txt')], { say: () => {}, fetcher: site.fetcher }), /does not hold a key/);
  await assert.rejects(main(['delete-everything'], { say: () => {} }), /is not a command/);
  await assert.rejects(main(['map'], { say: () => {} }), /Say which file/);
});

test('a map: asked first, then its pictures, then the design; refused before anything is sent', async () => {
  const folder = path.join(scratch, 'key-map'); await setup({ folder });
  const key = (await readFile(path.join(folder, 'key.txt'), 'utf8')).trim();
  // A tiny map package with one real picture, built the way build-scene-map-package.py builds them.
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  const grid = { size: 100, locked: true, visible: false, offsetX: 0, offsetY: 0 };
  const scene = { format: 'gmscreen-scene/v1', sourceRevision: 0, scene: { id: 'scn-source-tool-test-0001', name: 'Tool Test Map', folderId: null, mapUrl: '/dnd/vtt/storage/uploads/bundled-image-0.jpg', thumbnailUrl: null, grid },
    folder: null, domains: { placements: {}, drawings: {}, templates: {}, sceneConfig: { grid, mapLevels: { baseStairs: [], levels: [] } } }, assetReferences: ['/dnd/vtt/storage/uploads/bundled-image-0.jpg'] };
  const bundle = { format: 'gmscreen-map/v1', package: scene, assets: [{ reference: '/dnd/vtt/storage/uploads/bundled-image-0.jpg', mime: 'image/png', sha256: createHash('sha256').update(png).digest('hex'), base64: png.toString('base64') }] };
  const file = path.join(scratch, 'tool-test.vttmap'); await writeFile(file, JSON.stringify(bundle));
  const limits = { upload_max_filesize: '40M', post_max_size: '48M', memory_limit: '128M', max_execution_time: '30' };
  const result = { action: 'created', scene: { id: 'scn-x', name: 'Tool Test Map' }, folder: 'Prismari', folderCreated: true, counts: { floors: 1, walls: 0, breakableWalls: 0, plates: 0, ramps: 0, zones: 0, tokens: 0 }, kept: null, onTheTable: false, idempotent: false };
  const site = fakeSite((url) => {
    if (url.endsWith('action=status')) return { body: { success: true, result: { folders: [], monsterTabs: [], limits } } };
    if (url.endsWith('action=map-image')) return { body: { success: true, data: { url: '/dnd/vtt/storage/uploads/abc123_1x1.png' } } };
    return { body: { success: true, result } };
  });
  const said = [];
  assert.equal(await main(['map', file, '--folder', 'Prismari', '--create-folder', '--site', 'https://example.test', '--key-file', path.join(folder, 'key.txt')], { say: (text) => said.push(text), fetcher: site.fetcher }), 0);
  assert.deepEqual(site.seen.map((s) => s.url.split('action=')[1]), ['status', 'map-import', 'map-image', 'map-import'], 'status, the question, the picture, the import');
  const asked = JSON.parse(site.seen[1].body), sent = JSON.parse(site.seen[3].body);
  assert.equal(asked.dryRun, true, 'the first import call only asks');
  assert.deepEqual([asked.folder, asked.createFolder, asked.replace], ['Prismari', true, false]);
  assert.equal(sent.dryRun, undefined);
  assert.equal(sent.operationId, asked.operationId, 'one upload, one id');
  assert.equal(sent.package.scene.mapUrl, '/dnd/vtt/storage/uploads/abc123_1x1.png', 'the design is sent pointing at the picture the server filed');
  assert.ok(site.seen.every((s) => s.headers['X-GMScreen-Upload-Key'] === key && !s.url.includes(key) && !String(typeof s.body === 'string' ? s.body : '').includes(key)));
  assert.match(said.join('\n'), /Will create "Tool Test Map" in the folder Prismari\.\nUploading image 1 of 1…\nCreated the scene "Tool Test Map" in the folder Prismari \(new folder\)\./);
  assert.equal(said.join('\n').includes(key), false);

  // The server says no when asked first: no picture is sent.
  const refusing = fakeSite((url) => (url.endsWith('action=status') ? { body: { success: true, result: { folders: [], monsterTabs: [], limits } } } : { status: 422, body: { success: false, error: 'A scene named "Tool Test Map" already exists. Add --replace to update it in place.' } }));
  await assert.rejects(main(['map', file, '--site', 'https://example.test', '--key-file', path.join(folder, 'key.txt')], { say: () => {}, fetcher: refusing.fetcher }), /already exists\. Add --replace/);
  assert.deepEqual(refusing.seen.map((s) => s.url.split('action=')[1]), ['status', 'map-import'], 'refused before any picture went up');

  // A picture larger than the server takes is refused on this PC, with the number.
  const small = fakeSite((url) => (url.endsWith('action=status') ? { body: { success: true, result: { folders: [], monsterTabs: [], limits: { ...limits, upload_max_filesize: '1' } } } } : { body: { success: true, result: { ...result, dryRun: true } } }));
  await assert.rejects(main(['map', file, '--site', 'https://example.test', '--key-file', path.join(folder, 'key.txt')], { say: () => {}, fetcher: small.fetcher }), /the server takes 0\.0 MB at most in one upload.*Nothing was sent.*MultiPHP INI Editor/s);
  assert.equal(small.seen.some((s) => s.url.endsWith('map-image')), false);

  // A file that is not a map package, or a bundle whose picture does not match its checksum.
  await writeFile(path.join(scratch, 'not-a-map.vttmap'), '{"hello":1}');
  await assert.rejects(tool.readMapFile(path.join(scratch, 'not-a-map.vttmap')), /not a map package/);
  await writeFile(path.join(scratch, 'bad-sum.vttmap'), JSON.stringify({ ...bundle, assets: [{ ...bundle.assets[0], sha256: 'a'.repeat(64) }] }));
  await assert.rejects(tool.readMapFile(path.join(scratch, 'bad-sum.vttmap')), /refused before sending: Bundled image checksum failed/);
  await assert.rejects(tool.readMapFile(path.join(scratch, 'no-such-file.vttmap')), /There is no file/);
});

test('the map report, in plain words', () => {
  const counts = { floors: 6, walls: 456, breakableWalls: 188, plates: 19, ramps: 23, zones: 85, tokens: 0 };
  assert.deepEqual(mapReport({ action: 'created', scene: { name: 'The Gravity Orchard' }, folder: 'Prismari', folderCreated: false, counts, kept: null }), [
    'Created the scene "The Gravity Orchard" in the folder Prismari.',
    'It has 6 floors, 456 walls (188 breakable), 19 plates, 23 ramps and 85 zones.',
    'Nobody was moved to it. Open it from the Scenes list.',
  ]);
  const replaced = mapReport({ action: 'replaced', scene: { name: 'The Gravity Orchard' }, folder: null, counts, onTheTable: true,
    kept: { tokens: 7, drawings: 1, templates: 0, brokenWalls: 4, tokensMovedToGround: 1, packageTokensNotAdded: 2 } });
  assert.deepEqual(replaced, [
    'Replaced the scene "The Gravity Orchard" (in no folder).',
    'It has 6 floors, 456 walls (188 breakable), 19 plates, 23 ramps and 85 zones.',
    'Kept as they were: 7 tokens, 1 drawing, 0 templates, fog memory, and 4 broken walls.',
    '1 token was on a floor the new map does not have and now stands on the ground floor.',
    'The package\'s own 2 tokens were not added, because the scene already has its tokens.',
    'This scene is the one on the table now; open browsers were sent the new map.',
  ]);
});

test('creatures go through the monster creator\'s own import and the strict checker before anything is sent', async () => {
  const good = path.join(repository, 'dnd/strixhaven/monster-creator/imports/werewolf-level-3-solo.json');
  const source = JSON.parse(await readFile(good, 'utf8'));
  // The same creature with a field the automation does not know.
  const odd = structuredClone(source), first = automationsIn(odd)[0];
  first.automation.cards[0].madeUpField = true;
  const oddFile = path.join(scratch, 'odd-wolf.json'); await writeFile(oddFile, JSON.stringify(odd));
  const junk = path.join(scratch, 'junk.json'); await writeFile(junk, '{not json');
  const nameless = path.join(scratch, 'nameless.json'); await writeFile(nameless, JSON.stringify({ level: 3 }));

  const prepared = await prepareCreatures([good, oddFile, junk, nameless]);
  assert.deepEqual(prepared.ready.map((r) => [r.file, r.monster.name, r.requestedId]), [['werewolf-level-3-solo.json', 'Werewolf', 'werewolf-level-3-solo']]);
  const wolf = prepared.ready[0].monster;
  assert.equal(wolf.stamina, 300);
  assert.deepEqual([wolf.might, wolf.agility, wolf.reason, wolf.intuition, wolf.presence], [3, 2, -1, 1, 1], 'read the way the monster creator reads it');
  assert.equal(Object.values(wolf.abilities).flat().length, 16);
  assert.deepEqual(prepared.refused.map((r) => r.file), ['odd-wolf.json', 'junk.json', 'nameless.json']);
  assert.match(prepared.refused[0].reason, /automation checker found 1 problem.*--force/);
  assert.match(prepared.refused[0].issues[0], /unsupported field\(s\): madeUpField/);
  assert.equal(prepared.refused[1].reason, 'It is not valid JSON.');
  assert.match(prepared.refused[2].reason, /monster creator's import refused it: Monster JSON must include a non-empty "name"/);
  // With --force the checker's problems are reported, and the file goes.
  const forced = await prepareCreatures([oddFile], { force: true });
  assert.equal(forced.ready.length, 1);
  assert.equal(forced.ready[0].warnings.length, 1);

  assert.deepEqual(creatureReport({ results: [{ file: 'a.json', name: 'Werewolf', action: 'replaced', abilities: 16, tab: 'Orchard / Foes' }, { file: 'b.json', name: 'Tender', action: 'refused', reason: 'A creature named "Tender" already exists. Add --replace to put this one in its place.' }],
    refused: prepared.refused.slice(1, 2), forced: [] }), [
    'a.json: replaced "Werewolf" (16 abilities), in Orchard / Foes.',
    'b.json: NOT uploaded. A creature named "Tender" already exists. Add --replace to put this one in its place.',
    'junk.json: NOT uploaded. It is not valid JSON.',
    '1 uploaded, 2 not.',
    'If the monster creator is open in a browser, reload it before saving there: its Save writes the whole list and would undo this upload.',
  ]);
});

test('every automation block in a creature file is found, with its ability\'s name', () => {
  const found = automationsIn({ name: 'Wolf', abilities: { action: [{ name: 'Bite', automation: { cards: [] } }, { name: 'Howl' }], malice: [{ name: 'Rend', fields: { name: 'Rend' }, automation: { cards: [1] } }] }, traits: [{ automation: 'not an object' }] });
  assert.deepEqual(found.map((f) => f.ability), ['Bite', 'Rend']);
  assert.deepEqual(automationsIn(null), []);
});
