const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.route('http://inventory.test/**', async route => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('.mjs') || url.pathname.endsWith('.js')) return route.fulfill({ path: path.resolve(__dirname, '../../character_sheet', url.pathname.slice(1)), contentType: 'text/javascript' });
      return route.fulfill({ contentType: 'text/html', body: '<body data-character="cal" data-user="cal" class="edit-mode"><input id="edit-toggle"><div id="inventory-pane"></div></body>' });
    });
    await page.goto('http://inventory.test/');
    await page.evaluate(() => {
      window.requests = [];
      const table = { headers: ['Level', 'Result', 'Range', 'Duration'], rows: [['1', '<script>bad</script>', '2', '1 round'], ['2', 'Better', '3', '2 rounds']], selectedRow: 0 };
      window.fetch = async (_url, options) => {
        const fields = Object.fromEntries(new URLSearchParams(options.body)); requests.push(fields);
        return { json: async () => fields.action === 'load' ? { success: true, data: { cal: { items: [{ id: 'item', name: 'Test charm', effectSections: [{ id: 'a', title: 'First', table }, { id: 'b', title: 'Second', table: JSON.parse(JSON.stringify(table)) }] }] } } } : { success: true } };
      };
    });
    await page.addStyleTag({ path: path.resolve(__dirname, '../../character_sheet/inventory-tab.css') });
    await page.addScriptTag({ url: 'http://inventory.test/inventory-tab.js' });
    await page.locator('[data-ci-action="open"]').click();
    const first = page.locator('[data-section-id="a"]');
    assert.equal(await first.locator('th').count(), 4);
    assert.equal(await first.locator('tbody tr').count(), 1);
    await first.locator('[data-ci-table-level]').selectOption({ value: '1' });
    await page.waitForFunction(() => requests.some(r => r.field === 'effectSections'));
    const saved = await page.evaluate(() => JSON.parse(requests.find(r => r.field === 'effectSections').value));
    assert.equal(saved[0].table.selectedRow, 1); assert.equal(saved[1].table.selectedRow, 0);
    await first.locator('[data-ci-action="table-expand"]').click();
    assert.equal(await first.locator('tbody tr').count(), 2);
    assert.equal(await first.locator('script').count(), 0);
    await first.locator('[data-ci-action="table-edit"]').click();
    const dialog = page.getByRole('dialog'); await dialog.waitFor();
    await dialog.locator('[data-column]').click();
    await dialog.getByLabel('Heading column 5').fill('New column');
    await dialog.locator('[data-row]').click();
    await dialog.getByLabel('Row 3 column 2').fill('Third');
    await dialog.locator('[data-apply]').click();
    assert.equal(await first.locator('th').count(), 5);
    assert.equal(await first.locator('tbody tr').count(), 3);
    assert.equal(await first.locator('[data-ci-table-level]').inputValue(), '1');
    await first.locator('[data-ci-action="table-edit"]').click();
    await dialog.locator('summary').click();
    await dialog.locator('[data-paste]').fill('| Level | Effect |\n| --- | --- |\n| 1 | Pasted |');
    await dialog.locator('[data-import]').click();
    await dialog.locator('[data-cancel]').click();
    assert.equal(await first.locator('th').count(), 5, 'cancel leaves stored table intact');
    assert.deepEqual(errors, []);
    console.log('PASS independent levels, four/five columns, expansion, escaped text, cell edits, row/column addition and cancelled paste');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
