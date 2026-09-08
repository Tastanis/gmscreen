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
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.goto(origin + '/test-login.php?user=GM');
    await page.waitForFunction(() => document.querySelector('#vtt-map-image')?.naturalWidth > 0);
    const label = page.locator('[data-active-tool]');
    assert.equal(await label.textContent(), 'Tool: Select');
    for (const [action, name] of [['toggle-draw','Draw'], ['measure-distance','Measure']]) {
      await page.locator(`[data-action="${action}"]`).click();
      assert.equal(await label.textContent(), `Tool: ${name}`);
      await page.locator(`[data-action="${action}"]`).click();
      assert.equal(await label.textContent(), 'Tool: Select');
    }
    await page.locator('[data-settings-launch="stairs"]').click();
    assert.equal(await label.textContent(), 'Tool: Edit stairs');
    await page.locator('[data-stairs-place-up]').click();
    assert.equal(await label.textContent(), 'Tool: Place stairs up');
    await page.locator('[data-settings-launch="stairs"]').click();
    assert.equal(await label.textContent(), 'Tool: Select');
    await page.locator('[data-action="open-templates"]').click();
    await page.locator('.vtt-template-menu [data-template="circle"]').click();
    await page.locator('.vtt-template-menu__confirm').click();
    assert.match(await label.textContent(), /Place circle/);
    await page.keyboard.press('Escape');
    assert.equal(await label.textContent(), 'Tool: Select');
    assert.deepEqual(errors, []);
    console.log('PASS: Draw, Measure, stairs editing/placement, template placement, and cancellation labels.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
