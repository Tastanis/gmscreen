const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const origin = 'http://127.0.0.1:8129';
(async () => {
  const manifest = await fetch(origin + '/diagnostic-manifest.json').then(r => r.json());
  assert.equal(manifest.test_fixture, 'floor-regression');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage(); page.setDefaultTimeout(10000);
    await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.goto(origin + '/test-login.php?user=cal');
    const waitLabel = label => page.waitForFunction(label => document.querySelector('[data-connection-status]').textContent === label, label);
    await waitLabel('Connected');
    await context.setOffline(true);
    await waitLabel('Offline');
    await context.setOffline(false);
    await waitLabel('Connected');
    await page.route('**/api/v2/sync.php?*', route => route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ success: false, error: 'Authentication required' }) }));
    await waitLabel('Sign in required');
    assert.equal(await page.locator('[data-save-feedback]').getAttribute('data-has-failure'), 'false');
    await page.unroute('**/api/v2/sync.php?*');
    await page.locator('[data-connection-status]').click();
    await waitLabel('Connected');
    console.log('PASS: actual offline/reconnect, session rejection, distinct save notices, and manual recovery.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
