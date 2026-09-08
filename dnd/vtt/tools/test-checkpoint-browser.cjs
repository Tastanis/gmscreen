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
    await page.waitForFunction(() => document.querySelector('[data-connection-status]')?.textContent.includes('Connected'));
    const players = [];
    for (const user of ['cal', 'sharon']) {
      const player = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      player.on('pageerror', error => errors.push(error.message));
      await player.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      await player.goto(origin + '/test-login.php?user=' + user);
      await player.waitForFunction(() => document.querySelector('[data-connection-status]')?.textContent.includes('Connected'));
      players.push(player);
    }
    const selector = '#vtt-token-layer [data-placement-id="floor-cal"]';
    const originalStyles = await Promise.all([page, ...players].map(p => p.locator(selector).evaluate(el => el.style.transform)));
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
    await row.getByRole('button', { name: 'Preview positions', exact: true }).click();
    await row.locator('[data-checkpoint-preview]').waitFor();
    assert.match(await row.locator('[data-checkpoint-preview]').textContent(), /Positions and floors only/);
    await page.screenshot({ path: '.playwright-mcp/scene-checkpoints.png' });
    const downloadEvent = page.waitForEvent('download');
    await row.getByRole('button', { name: 'Download', exact: true }).click();
    const stream = await (await downloadEvent).createReadStream();
    let contents = ''; for await (const chunk of stream) contents += chunk.toString();
    const checkpoint = JSON.parse(contents);
    assert.equal(checkpoint.name, 'Before the ambush');
    assert.equal(checkpoint.data.sceneId, manifest.test_scene_id);
    assert.ok(checkpoint.data.domains.placements['floor-cal']);
    const snapshot = async () => (await (await page.request.get(origin + '/dnd/vtt/api/v2/snapshot.php')).json()).snapshot;
    async function movePlayer(dy) {
      // Background tabs can still be interpolating the preceding token move.
      // Locator hover waits for a stable hit target before measuring a raw drag.
      await players[0].locator(selector).hover();
      const box = await players[0].locator(selector).boundingBox(); assert.ok(box);
      const response = players[0].waitForResponse(r => r.url().endsWith('/commands.php'));
      await players[0].mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await players[0].mouse.down();
      await players[0].mouse.move(box.x + box.width / 2, box.y + box.height / 2 + dy * box.height, { steps: 25 });
      await players[0].mouse.up();
      assert.equal((await response).status(), 200);
    }
    const restore = async () => {
      await row.getByRole('button', { name: 'Restore these positions', exact: true }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Restore positions', exact: true }).click();
    };
    await movePlayer(3);
    await row.getByRole('button', { name: 'Preview positions', exact: true }).click();
    await row.getByRole('button', { name: 'Restore these positions', exact: true }).waitFor();
    await movePlayer(2);
    assert.equal((await snapshot()).state.placements[manifest.test_scene_id]['floor-cal'].levelId, 'test-upper');
    await restore();
    await page.waitForFunction(() => document.querySelector('[data-checkpoint-status]')?.textContent.includes('board changed'));
    await row.getByRole('button', { name: 'Preview positions', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('[data-checkpoint-preview] button')?.disabled);
    const beforeRestore = await snapshot();
    for (const p of [page, ...players]) await p.evaluate(() => {
      window.checkpointMovementEvents = [];
      document.addEventListener('vtt:token-moved', event => window.checkpointMovementEvents.push(event.detail));
    });
    await restore();
    await page.waitForFunction(() => document.querySelector('[data-checkpoint-status]')?.textContent.includes('Restored 1'));
    assert.equal((await snapshot()).revision, beforeRestore.revision + 1);
    const restored = (await snapshot()).state.placements[manifest.test_scene_id]['floor-cal'];
    assert.equal(restored.column, checkpoint.data.domains.placements['floor-cal'].column);
    for (const [index, p] of [page, ...players].entries()) {
      await p.waitForFunction(({ selector, expected }) => {
        const el = document.querySelector(selector);
        return el?.style.transform === expected;
      }, { selector, expected: originalStyles[index] });
      assert.deepEqual(await p.evaluate(() => window.checkpointMovementEvents), [], 'Restore cannot trigger walking automation.');
    }
    assert.equal(await players[0].locator('[data-map-level-indicator-value]').textContent(), 'Level 0');
    await page.screenshot({ path: '.playwright-mcp/checkpoint-restored.png' });
    await page.reload(); await open(); await row.waitFor();
    await row.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete checkpoint', exact: true }).click();
    await row.waitFor({ state: 'detached' });
    assert.match(await root.locator('[data-checkpoint-list]').textContent(), /No checkpoints/);
    assert.deepEqual(errors, []);
    console.log('PASS: checkpoint capture/download, stale review rejection, confirmed restore after player drags, three-client convergence, no walking hooks, reload and deletion.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
