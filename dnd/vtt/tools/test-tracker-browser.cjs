const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const origin = 'http://127.0.0.1:8129';
(async () => {
  const manifest = await fetch(origin + '/diagnostic-manifest.json').then(r => r.json());
  assert.equal(manifest.test_fixture, 'floor-regression');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.goto(origin + '/test-login.php?user=GM');
    await page.waitForFunction(() => document.querySelector('#vtt-map-image')?.naturalWidth > 0);
    if (await page.locator('[data-combat-tracker]').getAttribute('data-combat-active') === 'true') {
      await page.locator('[data-action="start-combat"]').click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'End combat', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('[data-combat-tracker]').dataset.combatActive === 'false');
    }
    assert.equal(await page.locator('[data-combat-tracker]').getAttribute('open'), null);
    await page.locator('.vtt-idle-tracker-summary').click();
    assert.equal(await page.locator('[data-combat-tracker] .vtt-combat-tracker').isVisible(), true);
    await page.locator('.vtt-idle-tracker-summary').click();
    await page.screenshot({ path: '.playwright-mcp/idle-tracker.png' });
    await page.locator('[data-action="start-combat"]').click();
    await page.waitForFunction(() => document.querySelector('[data-combat-tracker]').dataset.combatActive === 'true');
    assert.equal(await page.locator('[data-combat-tracker] .vtt-combat-tracker').isVisible(), true);
    assert.equal(await page.locator('.vtt-idle-tracker-summary').isVisible(), false);
    await page.locator('[data-action="start-combat"]').click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'End combat', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-combat-tracker]').dataset.combatActive === 'false');
    assert.equal(await page.locator('[data-combat-tracker]').getAttribute('open'), null);
    console.log('PASS: idle roster disclosure, actual combat start/end, and automatic tracker expansion/collapse.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
