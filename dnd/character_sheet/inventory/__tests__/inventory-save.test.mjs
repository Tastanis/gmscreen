import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'inventory-save-test-'));
  const sheet = path.join(root, 'character_sheet');
  const data = path.join(root, 'data', 'character_inventory.json');
  await mkdir(sheet);
  await mkdir(path.dirname(data));
  for (const name of ['inventory_handler.php', 'AtomicJsonFile.php']) {
    await copyFile(new URL('../../' + name, import.meta.url), path.join(sheet, name));
  }
  const wrapper = path.join(root, 'request.php');
  await writeFile(wrapper, `<?php
session_start();
$input = json_decode(stream_get_contents(STDIN), true);
$_SESSION = ['logged_in' => true, 'user' => $input['user'] ?? 'GM'];
$_POST = $input['post'];
require __DIR__ . '/character_sheet/inventory_handler.php';
`);
  const request = post => new Promise((resolve, reject) => {
    const child = spawn('php', [wrapper], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.on('data', chunk => out += chunk);
    child.stderr.on('data', chunk => err += chunk);
    child.on('error', reject);
    child.on('close', code => {
      try { assert.equal(code, 0, err); resolve(JSON.parse(out)); } catch (e) { reject(e); }
    });
    child.stdin.end(JSON.stringify({ post }));
  });
  return { root, data, request, async close() {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(tmpdir()));
    assert.ok(path.basename(root).startsWith('inventory-save-test-'));
    await rm(root, { recursive: true, force: true });
  } };
}

test('concurrent inventory edits to different items survive request-wide locking', async () => {
  const f = await fixture();
  try {
    const items = Array.from({ length: 30 }, (_, n) => ({ id: 'item-' + n, name: 'Before', description: 'Unchanged note', effectSections: [] }));
    await writeFile(f.data, JSON.stringify({ cal: { items } }));
    const results = await Promise.all(items.map((item, n) => f.request({ action: 'update_item_field', tab: 'cal', item_id: item.id, field: 'name', value: 'After ' + n })));
    assert.ok(results.every(r => r.success));
    const saved = JSON.parse(await readFile(f.data, 'utf8'));
    items.forEach((item, n) => {
      assert.equal(saved.cal.items[n].name, 'After ' + n);
      assert.equal(saved.cal.items[n].description, 'Unchanged note');
    });
    assert.equal((await f.request({ action: 'load' })).data.cal.items.length, 30);
  } finally { await f.close(); }
});

test('unreadable inventory JSON fails closed without replacing campaign data', async () => {
  const f = await fixture();
  try {
    const original = '{"cal":broken';
    await writeFile(f.data, original);
    const result = await f.request({ action: 'add_item', tab: 'cal' });
    assert.equal(result.success, false);
    assert.match(result.error, /could not be read/);
    assert.equal(await readFile(f.data, 'utf8'), original);
  } finally { await f.close(); }
});
