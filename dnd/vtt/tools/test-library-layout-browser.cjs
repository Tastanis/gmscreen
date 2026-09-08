const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const origin = process.env.VTT_TEST_ORIGIN || 'http://127.0.0.1:8129';
if (!['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)) throw Error('Loopback required');
(async () => {
  const manifest = await fetch(origin + '/diagnostic-manifest.json').then(r => r.json());
  assert.ok(manifest.test_fixture, 'Disposable fixture required');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.setDefaultTimeout(10000);
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.goto(origin + '/test-login.php?user=GM');
    await page.waitForFunction(() => document.querySelector('#vtt-map-image')?.naturalWidth > 0);
    await page.locator('[data-settings-launch="tokens"]').click();
    await page.waitForFunction(() => document.querySelector('#vtt-settings-panel').getBoundingClientRect().x >= -0.1);
    await page.locator('#token-search').fill('Cal');
    await page.locator('.token-item h4').filter({ hasText: /^Cal$/ }).waitFor();
    const matches = await page.locator('.token-item').evaluateAll(items => items.map(item =>
      `${item.querySelector('h4').textContent} ${item.dataset.folderName}`.toLowerCase()));
    assert.ok(matches.length && matches.every(value => value.includes('cal')), JSON.stringify(matches));
    assert.equal(await page.locator('[data-token-creation]').getAttribute('open'), null);
    const library = await page.locator('#token-template-list').boundingBox();
    assert.ok(library.y < 400, `Library starts too low: ${library.y}`);
    await page.screenshot({ path: '.playwright-mcp/library-layout-tokens.png' });
    await page.locator('#token-search').fill('no-such-token-xyz');
    assert.match(await page.locator('#token-template-list').textContent(), /No matching tokens/);
    await page.locator('#token-search').fill('');
    assert.ok(await page.locator('.token-item').count() > 1);
    await page.locator('[data-token-creation] > summary').click();
    await page.locator('[data-token-name-input]').fill('Layout-only draft');
    assert.equal(await page.locator('[data-token-name-input]').inputValue(), 'Layout-only draft');
    await page.locator('[data-token-creation] > summary').click();
    await page.locator('[data-action="close-settings"]').click();
    assert.equal(await page.locator('#vtt-settings-panel').evaluate(el => el.inert), true);
    await page.locator('[data-settings-launch="scenes"]').click();
    await page.waitForFunction(() => document.querySelector('#vtt-settings-panel').getBoundingClientRect().x >= -0.1);
    assert.equal(await page.locator('[data-scene-creation]').getAttribute('open'), null);
    const scenes = await page.locator('#scene-manager').boundingBox();
    assert.ok(scenes.y < 300, `Scenes start too low: ${scenes.y}`);
    await page.screenshot({ path: '.playwright-mcp/library-layout-scenes.png' });
    await page.locator('[data-scene-creation] > summary').click();
    await page.locator('[data-scene-name-input]').fill('Layout-only draft');
    assert.deepEqual(errors, []);
    console.log('PASS: library-first GM panels, expandable creation forms, and closed-panel keyboard exclusion at 1280x720.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
