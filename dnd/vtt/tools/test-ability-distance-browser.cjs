const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const origin = 'http://127.0.0.1:8129';
(async () => {
  assert.equal((await fetch(origin + '/diagnostic-manifest.json').then(r => r.json())).test_fixture, 'floor-regression');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', r => new URL(r.request().url()).origin === origin ? r.continue() : r.abort());
    await page.goto(origin + '/test-login.php?user=GM');
    const ready = () => page.waitForFunction(() => document.querySelector('[data-connection-status]')?.textContent === 'Connected');
    await ready();
    const distance = () => page.evaluate(() => VTTBoardCallbacks.getDistanceBetween('floor-cal', 'distance-large'));
    assert.equal(await distance(), 5, 'five vertical squares dominate one horizontal square');
    assert.equal(await page.evaluate(() => VTTBoardCallbacks.getDistanceBetween('distance-large', 'floor-cal')), 5);
    assert.equal(await page.evaluate(() => VTTBoardCallbacks.getDistanceBetween('floor-cal', 'missing')), null);
    await page.locator('[data-settings-launch="scenes"]').click();
    while (await page.locator('.scene-group.is-collapsed [data-action="toggle-folder"]').count()) {
      await page.locator('.scene-group.is-collapsed [data-action="toggle-folder"]').first().click();
    }
    const height = page.locator('[data-action="set-map-level-height"][data-map-level-id="test-upper"]');
    await height.fill('1');
    await height.press('Tab');
    await page.waitForFunction(() => VTTBoardCallbacks.getDistanceBetween('floor-cal', 'distance-large') === 1);
    await page.reload();
    await ready();
    assert.equal(await distance(), 1, 'large footprint edge remains adjacent after canonical reload');
    assert.deepEqual(errors, []);
    console.log('PASS actual board distance callback: maximum vertical distance, symmetry, missing target, nearest large-creature square, height edit and reload');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
