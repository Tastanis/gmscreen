const { waitForBrowserState } = require('./wait-for-browser-state.cjs');
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
    await page.waitForFunction(() => document.querySelector('[data-connection-status]')?.textContent === 'Connected');
    await page.locator('[data-settings-launch="scenes"]').click();
    while (await page.locator('.scene-group.is-collapsed [data-action="toggle-folder"]').count()) {
      await page.locator('.scene-group.is-collapsed [data-action="toggle-folder"]').first().click();
    }
    const height = page.locator('[data-action="set-map-level-height"][data-map-level-id="test-upper"]');
    const row = height.locator('xpath=ancestor::li[1]');
    async function setHeight(value) {
      await height.fill(String(value));
      await height.press('Tab');
      await waitForBrowserState(page, async n => {
        const s = await fetch('/dnd/vtt/api/v2/snapshot.php').then(r => r.json());
        return Object.values(s.snapshot.state.sceneConfig).some(c => c.mapLevels?.levels?.some(l => l.id === 'test-upper' && l.elevationSquares === n));
      }, value);
    }
    await setHeight(5);
    await row.locator('[data-action="view-floor"]').click();
    await page.waitForFunction(() => document.querySelector('[data-map-level-nav-name]').textContent.includes('Test balcony'));
    const start = async mode => page.evaluate(mode => {
      window.VTTBoardCallbacks.cancelTargetSelection();
      window.VTTBoardCallbacks.cancelAreaSelection();
      const config = { mode, sourcePlacement: { id: 'floor-cal', levelId: 'level-0', column: 2, row: 0 },
        range: 3, shape: 'cube', size: 1, distance: { form: mode === 'area' ? 'cube' : 'ranged', value: 3, within: 3 } };
      window.rangeTestPromise = mode === 'area' ? window.VTTBoardCallbacks.selectAreaTarget(config) : window.VTTBoardCallbacks.selectTarget(config);
    }, mode);
    await start('token');
    assert.equal(await page.locator('.vtt-automation-target-range').count(), 0);
    await setHeight(3);
    await page.locator('.vtt-automation-target-range').waitFor({ state: 'attached' });
    const width = await page.locator('.vtt-automation-target-range__box').evaluate(el => el.style.width);
    await setHeight(2);
    assert.equal(await page.locator('.vtt-automation-target-range__box').evaluate(el => el.style.width), width);
    await setHeight(5);
    await page.locator('.vtt-automation-target-range').waitFor({ state: 'detached' });
    await start('area');
    assert.equal(await page.locator('[data-automation-area-range]').isHidden(), true);
    await setHeight(3);
    await page.locator('[data-automation-area-range]').waitFor({ state: 'visible' });
    await setHeight(5);
    await page.locator('[data-automation-area-range]').waitFor({ state: 'hidden' });
    await page.evaluate(() => { VTTBoardCallbacks.cancelTargetSelection(); VTTBoardCallbacks.cancelAreaSelection(); });
    assert.deepEqual(errors, []);
    console.log('PASS token and area range guides: too high, exact height boundary, unchanged max-axis width, live floor-height changes');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
