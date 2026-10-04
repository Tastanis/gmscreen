import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../index.php', import.meta.url), 'utf8');
const slice = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const flush = () => new Promise(resolve => setImmediate(resolve));
function panel() {
  const calls = [], elements = Object.fromEntries(['pSave', 'pStatus', 'pGmTitle', 'pPlTitle', 'pNotes'].map(id => [id, { value: '', textContent: '', addEventListener() {} }]));
  const context = vm.createContext({
    cur: { q: 1, r: 1, data: { player: { notes: 'old' } }, dirty: true, lock: true },
    role: { gm: false }, pNotes: elements.pNotes, pGm: { value: '' }, FIELDS: [],
    $: id => elements[id], claim() {},
    hexApi(action, fields) { const request = deferred(); calls.push({ action, fields, ...request }); return request.promise; },
    release(record) { record.lock = false; },
    render() { if (!context.cur.dirty) elements.pNotes.value = context.cur.data.player.notes; }
  });
  vm.runInContext(slice('const reload = async', "$('pReveal').onclick"), context);
  return { context, calls, elements };
}

for (const replacement of ['other hex', 'closed panel', 'same hex reopened']) {
  test(`save response cannot affect ${replacement}`, async () => {
    const { context: c, calls, elements: e } = panel();
    const save = e.pSave.onclick();
    c.cur = replacement === 'closed panel' ? null : { q: replacement === 'other hex' ? 2 : 1, r: 1, dirty: true, lock: true };
    e.pNotes.value = 'new draft'; e.pStatus.textContent = 'Not saved yet';
    calls[0].resolve({ success: true, data: { player: { notes: 'saved original' } } }); await save;
    assert.equal(e.pNotes.value, 'new draft'); assert.equal(e.pStatus.textContent, 'Not saved yet');
    if (c.cur) { assert.equal(c.cur.dirty, true); assert.equal(c.cur.lock, true); }
    assert.equal(calls.length, 1);
  });
}
test('save preserves typing after submission and suppresses double submissions', async () => {
  const { context: c, calls, elements: e } = panel();
  const save = e.pSave.onclick(); await e.pSave.onclick(); assert.equal(calls.length, 1);
  c.cur.editRevision = 1; e.pNotes.value = 'newer draft';
  calls[0].resolve({ success: true, data: { player: { notes: 'submitted draft' } } }); await save;
  assert.equal(c.cur.dirty, true); assert.equal(c.cur.lock, true); assert.equal(e.pNotes.value, 'newer draft');
  assert.equal(c.cur.saving, false);
});
test('successful unchanged save confirms only the submitted draft; failure retains it', async () => {
  const { context: c, calls, elements: e } = panel();
  let save = e.pSave.onclick(); calls[0].resolve({ success: false, error: 'failed' }); await save;
  assert.equal(c.cur.dirty, true); assert.equal(c.cur.lock, true);
  save = e.pSave.onclick(); calls[1].resolve({ success: true, data: { player: { notes: 'saved' } } }); await save;
  assert.equal(c.cur.dirty, false); assert.equal(c.cur.lock, false); assert.equal(e.pNotes.value, 'saved');
});
test('reload cannot attach old hex data to a new selection or overwrite a later reload', async () => {
  const { context: c, calls } = panel();
  const first = vm.runInContext('reload()', c);
  c.cur = { q: 2, r: 2, dirty: true, data: { player: { notes: 'B' } } };
  calls[0].resolve({ success: true, data: { player: { notes: 'A' } } }); await first;
  assert.equal(c.cur.data.player.notes, 'B');
  const old = vm.runInContext('reload()', c), newer = vm.runInContext('reload()', c);
  calls[2].resolve({ success: true, data: { player: { notes: 'newer' } } }); await newer;
  calls[1].resolve({ success: true, data: { player: { notes: 'older' } } }); await old;
  assert.equal(c.cur.data.player.notes, 'newer');
});

function terrain() {
  const calls = [], PS = { pending: new Map([['1,1', 'red']]), terrain: {}, sig: null, brush: 0, diff: 'normal' };
  const c = vm.createContext({ PS, pathApi(action, fields) { const d = deferred(); calls.push({ action, fields, ...d }); return d.promise; },
    pathSay() {}, terrPaint() {}, drawPath() {}, pick: () => ({ x: 1, z: 1 }), worldToHex: () => ({ q: 1, r: 1 }),
    hexAt: () => ({ x: 0, z: 0 }), MAP_W: 100, MAP_D: 100, hexLine: () => [] });
  vm.runInContext(slice('let terrainSave = null;', 'const pathSay ='), c);
  vm.runInContext(slice('let paintLast = null;', "canvas.addEventListener('pointerdown', e => { if (!PS.on"), c);
  return { c, calls, PS, save: () => vm.runInContext('saveTerrain()', c) };
}
test('terrain changes during save are drained, including repainting the same cell', async () => {
  const { save, calls, PS } = terrain(); const saving = save(); assert.equal(save(), saving);
  PS.pending.set('1,1', 'yellow'); PS.pending.set('2,2', 'fast');
  calls[0].resolve({ success: true }); await flush();
  assert.deepEqual(JSON.parse(JSON.stringify(calls[1].fields.cells)), [{ q: 1, r: 1, difficulty: 'yellow' }, { q: 2, r: 2, difficulty: 'fast' }]);
  calls[1].resolve({ success: true }); assert.equal(await saving, true); assert.equal(PS.pending.size, 0);
});
test('painting back to the old server value during save submits the correction', async () => {
  const { c, save, calls, PS } = terrain(); const saving = save();
  vm.runInContext('paintAt(0, 0)', c); assert.equal(PS.pending.get('1,1'), 'normal');
  calls[0].resolve({ success: true }); await flush();
  assert.equal(calls[1].fields.cells[0].difficulty, 'normal'); calls[1].resolve({ success: true }); await saving;
});
test('failed terrain batch preserves pending values and allows an explicit retry', async () => {
  const { save, calls, PS } = terrain(); let saving = save();
  PS.pending.set('2,2', 'yellow'); calls[0].resolve(null); assert.equal(await saving, false);
  assert.equal(PS.pending.size, 2); saving = save(); calls[1].resolve({ success: true }); assert.equal(await saving, true);
  assert.equal(PS.pending.size, 0);
});
