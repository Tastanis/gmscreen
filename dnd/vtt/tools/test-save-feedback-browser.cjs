const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const origin = 'http://127.0.0.1:8129';
(async () => {
  const manifest = await fetch(origin + '/diagnostic-manifest.json').then(r => r.json());
  assert.equal(manifest.test_fixture, 'floor-regression');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.setDefaultTimeout(10000);
    await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.goto(origin + '/test-login.php?user=cal');
    await page.waitForFunction(() => document.querySelector('#vtt-map-image')?.naturalWidth > 0);
    let held;
    await page.route('**/api/v2/commands.php', async route => {
      if (route.request().postDataJSON().type === 'token.move' && !held) held = route;
      else await route.continue();
    });
    async function drag() {
      const box = await page.locator('#vtt-token-layer [data-placement-id="floor-cal"]').boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height * 1.5, { steps: 12 });
      await page.mouse.up();
    }
    await drag();
    await page.waitForFunction(() => document.querySelector('[data-save-feedback] summary').textContent.startsWith('Saving'));
    assert.ok(held);
    await held.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ success: false, error: 'Test: this token is locked.' }) });
    await page.getByText('Token movement rejected: Test: this token is locked.', { exact: true }).waitFor();
    assert.doesNotMatch(await page.locator('[data-save-feedback]').textContent(), /session expired/);
    await drag();
    await page.getByText('Last accepted change: Token movement.', { exact: true }).waitFor();
    assert.match(await page.locator('[data-save-feedback-list]').textContent(), /this token is locked/);
    await page.locator('[data-dismiss-save-issues]').click();
    assert.equal(await page.locator('[data-save-feedback]').getAttribute('data-has-failure'), 'false');
    console.log('PASS: visible pending, exact rejection reason, unrelated accepted move retains issue, and explicit dismissal.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
