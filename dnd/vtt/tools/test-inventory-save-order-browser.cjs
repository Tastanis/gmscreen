const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.route('**/*', r => r.abort());
    await page.setContent('<body data-character="cal" data-user="cal" class="edit-mode"><input id="edit-toggle"><div id="inventory-pane"></div></body>');
    await page.evaluate(() => {
      window.requests = [];
      window.fetch = (_url, options) => new Promise(resolve => requests.push({ fields: Object.fromEntries(new URLSearchParams(options.body)), respond: result => resolve({ json: async () => result }) }));
    });
    await page.addScriptTag({ path: path.resolve(__dirname, '../../character_sheet/inventory-tab.js') });
    await page.evaluate(() => requests[0].respond({ success: true, content_revision: 'initial', data: { cal: { items: [{ id: 'item', name: 'Initial', _fieldRevisions: {name:'revision-0'}, effectSections: [{ id: 'effect', title: 'Power', text: 'Original', table: { headers: ['Level', 'Result'], rows: [['1', 'First'], ['2', 'Second']], selectedRow: 1 } }] }] } } }));
    await page.locator('[data-ci-action="open"]').click();
    const input = page.locator('[data-ci-field="name"]');
    const edit = async value => { await input.fill(value); await page.locator('#edit-toggle').dispatchEvent('change'); };
    await edit('First');
    await page.waitForFunction(() => requests.length === 2);
    await edit('Second');
    await edit('Latest');
    assert.equal(await page.evaluate(() => requests.length), 2, 'same-field saves wait');
    await page.evaluate(() => requests[1].respond({ success: true, field_revisions: {name:'revision-1'} }));
    await page.waitForFunction(() => requests.length === 3);
    assert.equal(await page.evaluate(() => requests[2].fields.value), 'Latest', 'intermediate waiting value is coalesced');
    await edit('Unsaved latest');
    await page.evaluate(() => requests[2].respond({ success: false, error: 'Test failure' }));
    await page.waitForFunction(() => document.querySelector('#ci-status')?.textContent.includes('Test failure'));
    await page.waitForTimeout(900);
    assert.deepEqual(await page.evaluate(() => requests.map(r=>r.fields)), [{action:'load'}, {action:'update_item_field',tab:'cal',item_id:'item',field:'name',value:'First',expected_revision:'revision-0'}, {action:'update_item_field',tab:'cal',item_id:'item',field:'name',value:'Latest',expected_revision:'revision-1'}]);
    assert.equal(await input.inputValue(), 'Unsaved latest');
    await page.locator('[data-ci-sfield="text"]').fill('Edited effect notes');
    await page.locator('#edit-toggle').dispatchEvent('change');
    await page.waitForFunction(() => requests.length === 4);
    const effect = await page.evaluate(() => JSON.parse(requests[3].fields.value)[0]);
    assert.equal(effect.text, 'Edited effect notes');
    assert.deepEqual(effect.table, { headers: ['Level', 'Result'], rows: [['1', 'First'], ['2', 'Second']], selectedRow: 1 });
    console.log('PASS effect table preserved through ordinary text editing');
    console.log('PASS inventory field save ordering: one in flight, latest value queued, no automatic continuation after failure');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
