const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const origin = 'http://127.0.0.1:8129';
(async () => {
  const manifest = await fetch(origin + '/diagnostic-manifest.json').then(r => r.json());
  assert.equal(manifest.test_fixture, 'floor-regression');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.setDefaultTimeout(12000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.goto(origin + '/test-login.php?user=GM');
    const root = page.locator('[data-scene-checkpoints]');
    async function open() {
      await page.locator('[data-settings-launch="scenes"]').click();
      await root.locator('summary').click();
    }
    await open();
    assert.match(await root.locator('[data-checkpoint-scene]').textContent(), /Witherbloom/);
    await root.locator('[data-checkpoint-name]').fill('Before the ambush');
    await root.getByRole('button', { name: 'Save checkpoint', exact: true }).click();
    const row = root.locator('[data-checkpoint-id]').filter({ hasText: 'Before the ambush' });
    await row.waitFor();
    await page.screenshot({ path: '.playwright-mcp/scene-checkpoints.png' });
    const downloadEvent = page.waitForEvent('download');
    await row.getByRole('button', { name: 'Download', exact: true }).click();
    const stream = await (await downloadEvent).createReadStream();
    let contents = ''; for await (const chunk of stream) contents += chunk.toString();
    const checkpoint = JSON.parse(contents);
    assert.equal(checkpoint.name, 'Before the ambush');
    assert.equal(checkpoint.data.sceneId, manifest.test_scene_id);
    assert.ok(checkpoint.data.domains.placements['floor-cal']);
    await page.reload(); await open(); await row.waitFor();
    await row.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete checkpoint', exact: true }).click();
    await row.waitFor({ state: 'detached' });
    assert.match(await root.locator('[data-checkpoint-list]').textContent(), /No checkpoints/);
    assert.deepEqual(errors, []);
    console.log('PASS: checkpoint UI create, download payload, reload persistence and confirmed deletion.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
