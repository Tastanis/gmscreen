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
  for (const name of ['inventory_handler.php', 'AtomicJsonFile.php', 'InventoryEffectTable.php']) {
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

test('stale field edits are rejected while unrelated fields and accepted revision chains remain writable', async () => {
  const f=await fixture();
  try {
    await writeFile(f.data,JSON.stringify({cal:{items:[{id:'item',name:'Before',description:'Note',charges:2,hasCharges:true}]}}));
    const loaded=await f.request({action:'load'});
    const revisions=loaded.data.cal.items[0]._fieldRevisions;
    const edit=(field,value,revision)=>f.request({action:'update_item_field',tab:'cal',item_id:'item',field,value,expected_revision:revision});
    const first=await edit('name','Newest',revisions.name);assert.equal(first.success,true);
    const before=await readFile(f.data,'utf8');
    assert.equal((await edit('name','Stale overwrite',revisions.name)).success,false);
    assert.equal(await readFile(f.data,'utf8'),before);
    assert.equal((await edit('description','Independent note',revisions.description)).success,true);
    assert.equal((await edit('name','Next',first.field_revisions.name)).success,true);
    assert.equal((await edit('charges','1',revisions.charges)).success,true);
    assert.equal((await edit('hasCharges','false',revisions.hasCharges)).success,false);
    const saved=JSON.parse(await readFile(f.data,'utf8')).cal.items[0];
    assert.equal(saved.name,'Next');assert.equal(saved.description,'Independent note');
    assert.equal(saved.hasCharges,true);assert.equal(saved._fieldRevisions,undefined);
  } finally {await f.close();}
});

test('reviewed deletion and move reject an item changed since loading', async () => {
  const f=await fixture();
  try {
    await writeFile(f.data,JSON.stringify({cal:{items:[{id:'item',name:'Before'}]}}));
    const initial=(await f.request({action:'load'})).data.cal.items[0];
    await f.request({action:'update_item_field',tab:'cal',item_id:'item',field:'name',value:'Newer'});
    const before=await readFile(f.data,'utf8');
    for(const action of ['delete_item','share_item']) {
      const response=await f.request({action,tab:'cal',from_tab:'cal',to_tab:'shared',item_id:'item',expected_item_fields:JSON.stringify(initial._fieldRevisions)});
      assert.equal(response.success,false);assert.match(response.error,/another window/);
      assert.equal(await readFile(f.data,'utf8'),before);
    }
    for(const action of ['duplicate_item','save_item']) {
      const response=await f.request({action,tab:'cal',item_id:'item',item_data:JSON.stringify(initial),expected_item_fields:JSON.stringify(initial._fieldRevisions)});
      assert.equal(response.success,false);assert.equal(await readFile(f.data,'utf8'),before);
    }
    const current=(await f.request({action:'load'})).data.cal.items[0];
    const moved=await f.request({action:'share_item',from_tab:'cal',to_tab:'shared',item_id:'item',expected_item_fields:JSON.stringify(current._fieldRevisions)});
    assert.equal(moved.success,true);assert.equal(moved.item.name,'Newer');
    const removed=await f.request({action:'delete_item',tab:'shared',item_id:moved.item.id,expected_item_fields:JSON.stringify(moved.item._fieldRevisions)});
    assert.equal(removed.success,true);
    const saved=JSON.parse(await readFile(f.data,'utf8'));
    assert.equal(saved.cal.items.length,0);assert.equal(saved.shared.items.length,0);
  } finally {await f.close();}
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

test('load content revision changes even when filesystem timestamps are identical', async () => {
  const f = await fixture();
  try {
    const original = { cal: { items: [{ id: 'item', name: 'Before' }] } };
    await writeFile(f.data, JSON.stringify(original));
    const before = await f.request({ action: 'load' });
    await f.request({ action: 'update_item_field', tab: 'cal', item_id: 'item', field: 'name', value: 'After' });
    const { utimes } = await import('node:fs/promises');
    await utimes(f.data, before.last_modified, before.last_modified);
    const after = await f.request({ action: 'load' });
    assert.equal(after.last_modified, before.last_modified);
    assert.notEqual(after.content_revision, before.content_revision);
    assert.equal(after.data.cal.items[0].name, 'After');
    assert.equal((await f.request({ action: 'load' })).content_revision, after.content_revision);
  } finally { await f.close(); }
});

test('progression tables save independently and legacy text edits preserve them', async () => {
  const f = await fixture();
  try {
    const table = { headers: ['Level', 'Result'], rows: [['1', 'First'], ['2', 'Second']], selectedRow: 0 };
    const sections = [{ id: 'a', title: 'A', text: 'Keep notes', table }, { id: 'b', title: 'B', text: 'Other notes', table: { ...table, selectedRow: 1 } }];
    await writeFile(f.data, JSON.stringify({ cal: { items: [{ id: 'item', name: 'Staff' }] } }));
    const update = value => f.request({ action: 'update_item_field', tab: 'cal', item_id: 'item', field: 'effectSections', value: JSON.stringify(value) });
    assert.equal((await update(sections)).success, true);
    let saved = (await f.request({ action: 'load' })).data.cal.items[0];
    assert.equal(saved.effectSections[0].table.selectedRow, 0);
    assert.equal(saved.effectSections[1].table.selectedRow, 1);
    assert.deepEqual(saved.effectSections[0].table.rows, table.rows);
    assert.equal((await update(sections.map(({ table, ...section }) => ({ ...section, text: 'Legacy edit' })))).success, true);
    saved = (await f.request({ action: 'load' })).data.cal.items[0];
    assert.equal(saved.effectSections[1].table.selectedRow, 1);
    assert.equal(saved.effectSections[0].text, 'Legacy edit');
    const legacyItem = { ...saved, effectSections: saved.effectSections.map(({ table, ...section }) => section) };
    assert.equal((await f.request({ action: 'save_item', tab: 'cal', item_data: JSON.stringify(legacyItem) })).success, true);
    saved = (await f.request({ action: 'load' })).data.cal.items[0];
    assert.deepEqual(saved.effectSections[0].table, table);
    assert.equal((await update([{ ...saved.effectSections[0], table: null }, saved.effectSections[1]])).success, true);
    saved = (await f.request({ action: 'load' })).data.cal.items[0];
    assert.equal(saved.effectSections[0].table, undefined);
    assert.equal(saved.effectSections[1].table.selectedRow, 1);
  } finally { await f.close(); }
});

test('invalid table input cannot partially save an inventory edit', async () => {
  const f = await fixture();
  try {
    const original = JSON.stringify({ cal: { items: [{ id: 'item', name: 'Keep me', effectSections: [{ id: 'a', text: 'Keep notes' }] }] } });
    await writeFile(f.data, original);
    for (const table of [
      { headers: ['A', 'B'], rows: [['1']], selectedRow: 0 },
      { headers: ['A', 'B'], rows: [['1', '2']], selectedRow: 8 },
      { headers: ['A', 'B'], rows: [['1', 2]], selectedRow: 0 },
      { headers: ['A', 'B'], rows: [['1', '😀'.repeat(4001)]], selectedRow: 0 },
    ]) {
      const result = await f.request({ action: 'update_item_field', tab: 'cal', item_id: 'item', field: 'effectSections', value: JSON.stringify([{ id: 'a', text: 'Changed', table }]) });
      assert.equal(result.success, false);
      assert.equal(await readFile(f.data, 'utf8'), original);
    }
  } finally { await f.close(); }
});
