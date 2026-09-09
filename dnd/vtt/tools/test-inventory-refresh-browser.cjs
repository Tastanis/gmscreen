const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.route('**/*', r => r.abort());
    await page.setContent('<body data-character="cal" data-user="cal" data-is-gm="0"><input id="edit-toggle" type="checkbox"><div id="inventory-pane"></div></body>');
    await page.evaluate(() => {
      window.requests = [];
      const interval = window.setInterval;
      window.setInterval = (fn, ms) => interval(fn, ms === 4000 ? 100 : ms);
      window.fetch = (_url, options) => new Promise(resolve => {
        requests.push({ fields: Object.fromEntries(new URLSearchParams(options.body)), respond: result => resolve({ json: async () => result }) });
      });
      window.loaded = name => ({ success: true, last_modified: 100, content_revision: name,
        data: { cal: { items: [{ id: 'item', name, description: 'Notes', effectSections: [] }] } } });
    });
    await page.addScriptTag({ path: path.resolve(__dirname, '../../character_sheet/inventory-tab.js') });
    await page.waitForFunction(() => requests.length === 1);
    await page.evaluate(() => requests[0].respond(loaded('Before')));
    await page.locator('[data-ci-action="open"]').click();
    await page.waitForFunction(() => requests.length === 2);
    await page.evaluate(() => document.body.classList.add('edit-mode'));
    await page.locator('#edit-toggle').dispatchEvent('change');
    await page.locator('[data-ci-field="name"]').fill('Local draft');
    await page.evaluate(() => requests[1].respond(loaded('Stale remote')));
    assert.equal(await page.locator('[data-ci-field="name"]').inputValue(), 'Local draft');
    await page.waitForFunction(() => requests.some(r => r.fields.action === 'update_item_field'));
    await page.evaluate(() => requests.find(r => r.fields.action === 'update_item_field').respond({ success: false, error: 'Test failure' }));
    await page.waitForFunction(() => document.querySelector('#ci-status')?.textContent.includes('Test failure'));
    await page.evaluate(() => document.body.classList.remove('edit-mode'));
    await page.locator('#edit-toggle').dispatchEvent('change');
    const count = await page.evaluate(() => requests.length);
    await page.waitForTimeout(350);
    assert.equal(await page.evaluate(() => requests.length), count, 'failed draft blocks automatic replacement');
    assert.ok((await page.locator('#inventory-pane').textContent()).includes('Local draft'));
    // A fresh page verifies polling notices different content with the same timestamp.
    await page.reload();
    await page.setContent('<body data-character="cal" data-user="cal"><div id="inventory-pane"></div></body>');
    await page.evaluate(() => {
      const interval = setInterval;
      window.setInterval = (fn, ms) => interval(fn, ms === 4000 ? 100 : ms);
      let count = 0;
      window.fetch = async () => ({ json: async () => ({ success: true, last_modified: 100, content_revision: ++count === 1 ? 'a' : 'b',
        data: { cal: { items: [{ id: 'item', name: count === 1 ? 'First' : 'Second' }] } } }) });
    });
    await page.addScriptTag({ path: path.resolve(__dirname, '../../character_sheet/inventory-tab.js') });
    await page.waitForFunction(() => document.querySelector('#inventory-pane')?.textContent.includes('Second'));
    console.log('PASS inventory DOM: stale refresh cannot replace local edit, failed draft survives polling, same-second content changes refresh');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
