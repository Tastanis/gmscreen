const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const origin = 'http://127.0.0.1:8129';
(async () => {
  const manifest = await fetch(origin + '/diagnostic-manifest.json').then(r => r.json());
  assert.equal(manifest.test_fixture, 'floor-regression');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const errors = [];
    async function client(user) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      page.setDefaultTimeout(12000);
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      await page.goto(origin + '/test-login.php?user=' + user);
      await page.waitForFunction(() => document.querySelector('[data-connection-status]')?.textContent.includes('Connected'));
      return page;
    }
    const gm = await client('GM'), pc = await client('cal'), other = await client('sharon');
    const snapshot = async () => (await (await gm.request.get(origin + '/dnd/vtt/api/v2/snapshot.php')).json()).snapshot;
    const tokens = snapshot => snapshot.state.placements[manifest.test_scene_id];
    const original = tokens(await snapshot());
    await gm.locator('[data-action="view-map-level-up"]').click();
    await gm.waitForFunction(() => document.querySelector('[data-map-level-indicator-value]')?.textContent === 'Test balcony');
    assert.equal(await pc.locator('[data-map-level-indicator-value]').textContent(), 'Level 0');
    await gm.getByRole('button', { name: 'Show players this floor', exact: true }).click();
    for (const page of [pc, other]) await page.waitForFunction(() => document.querySelector('[data-map-level-indicator-value]')?.textContent === 'Test balcony');
    await pc.reload();
    await pc.waitForFunction(() => document.querySelector('[data-connection-status]')?.textContent.includes('Connected'));
    assert.equal(await pc.locator('[data-map-level-indicator-value]').textContent(), 'Test balcony');
    await pc.getByRole('button', { name: "My token's floor", exact: true }).click();
    await pc.waitForFunction(() => document.querySelector('[data-map-level-indicator-value]')?.textContent === 'Level 0');
    assert.equal(await other.locator('[data-map-level-indicator-value]').textContent(), 'Test balcony');
    assert.deepEqual(tokens(await snapshot()), original, 'Viewing controls must not change token state.');
    await gm.getByRole('button', { name: 'Show players this floor', exact: true }).click();
    await pc.waitForFunction(() => document.querySelector('[data-map-level-indicator-value]')?.textContent === 'Test balcony');
    await other.context().setOffline(true);
    await gm.locator('[data-settings-launch="scenes"]').click();
    const hide = gm.locator('[data-action="toggle-map-level-hide"][data-map-level-id="test-upper"]');
    const folder = gm.locator('.scene-group').filter({ has: hide });
    if ((await folder.getAttribute('class')).includes('is-collapsed')) await folder.locator('[data-action="toggle-folder"]').click();
    const hideResponse = gm.waitForResponse(r => r.url().endsWith('/commands.php') && r.request().postDataJSON()?.type === 'levels.set');
    await hide.click();
    assert.equal((await hideResponse).status(), 200);
    const hidden = await snapshot();
    assert.equal(hidden.state.sceneConfig[manifest.test_scene_id].userLevelState.sharon.levelId, 'level-0');
    assert.deepEqual(tokens(hidden), original, 'Hiding a floor preserves token placement data.');
    await pc.waitForFunction(() => document.querySelector('[data-map-level-indicator-value]')?.textContent === 'Level 0');
    await other.context().setOffline(false); await other.reload();
    await other.waitForFunction(() => document.querySelector('[data-connection-status]')?.textContent.includes('Connected'));
    assert.equal(await other.locator('[data-map-level-indicator-value]').textContent(), 'Level 0');
    await gm.getByRole('button', { name: 'Unhide', exact: true }).click();
    await gm.screenshot({ path: '.playwright-mcp/floor-view-controls.png' });
    assert.deepEqual(errors, []);
    console.log('PASS: private GM browsing, player show/reload, own-token return, hidden-floor cleanup for an offline player, and unchanged tokens.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
