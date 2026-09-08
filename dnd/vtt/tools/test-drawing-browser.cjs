// Requires create-drawing-fixture.py + start-diagnostic.ps1 on a dedicated port.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const origin = process.env.VTT_TEST_ORIGIN || 'http://127.0.0.1:8128';
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(origin).hostname)) {
  throw new Error('Browser regression tests require loopback.');
}

(async () => {
  const manifest = await fetch(origin + '/diagnostic-manifest.json').then((response) => response.json());
  assert.equal(manifest.test_fixture, 'drawing-regression', 'Refusing to mutate a non-fixture app.');
  const sceneId = manifest.test_scene_id;
  const browser = await chromium.launch({
    ...(process.env.VTT_TEST_BROWSER ? { executablePath: process.env.VTT_TEST_BROWSER } : { channel: 'chrome' }),
    headless: true,
  });
  const errors = [];
  try {
    async function client(user) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      await context.route('**/*', (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(origin + '/test-login.php?user=' + user);
      await page.waitForFunction(() => document.querySelector('#vtt-map-image')?.naturalWidth > 0);
      await page.waitForFunction(() => document.querySelector('[data-connection-status]')?.textContent === 'Connected'
        && document.querySelector('#vtt-map-transform')?.hidden === false);
      return { context, page };
    }
    const gm = await client('GM');
    let sequence = 0;
    async function command(type, entityId, payload) {
      const snapshot = await gm.context.request.get(origin + '/dnd/vtt/api/v2/snapshot.php').then((response) => response.json());
      const state = snapshot.snapshot.state;
      const response = await gm.context.request.post(origin + '/dnd/vtt/api/v2/commands.php', { data: {
        type, entityId, sceneId, payload, operationId: 'drawing-browser-' + Date.now() + '-' + ++sequence,
        baseRevision: snapshot.snapshot.revision,
        entityRevision: type.startsWith('drawing.') ? state.drawings?.[sceneId]?.[entityId]?._entityRevision || 0 : state.sceneConfig?.[sceneId]?._revision || 0,
      } });
      assert.equal(response.status(), 200, await response.text());
    }
    const initial = await gm.context.request.get(origin + '/dnd/vtt/api/v2/snapshot.php').then((response) => response.json());
    for (const drawing of Object.values(initial.snapshot.state.drawings?.[sceneId] || {})) {
      await command('drawing.remove', drawing.id, {});
    }
    for (const user of ['cal', 'sharon', 'gm']) {
      await command('level.user.set', null, { userId: user, entry: { levelId: 'level-0', source: 'manual' } });
    }
    await gm.page.reload();
    const pc = await client('cal');
    const other = await client('sharon');
    const count = (page, number) => page.waitForFunction((number) => document.querySelectorAll('#vtt-drawing-layer path[data-drawing-id]').length === number, number);
    const saved = (page) => page.waitForFunction(() => document.querySelector('#vtt-drawing-layer').getAttribute('aria-busy') !== 'true');
    async function stroke(page) {
      await page.mouse.move(600, 500);
      await page.mouse.down();
      await page.mouse.move(780, 560, { steps: 14 });
      await page.mouse.up();
      await saved(page);
    }
    await pc.page.locator('[data-action="toggle-draw"]').click();
    await pc.page.locator('[data-action="measure-distance"]').click();
    assert.equal(await pc.page.locator('[data-action="toggle-draw"]').getAttribute('aria-pressed'), 'false');
    await pc.page.locator('[data-action="toggle-draw"]').click();
    assert.equal(await pc.page.locator('[data-action="measure-distance"]').getAttribute('aria-pressed'), 'false');
    await pc.page.locator('[data-action="draw-mode-erase"]').click();
    assert.equal(await pc.page.locator('[data-active-tool]').textContent(), 'Tool: Erase drawing');
    await pc.page.locator('[data-action="draw-mode-draw"]').click();
    await stroke(pc.page);
    await count(gm.page, 1); await count(other.page, 1);
    await pc.page.locator('[data-action="clear-drawings"]').click();
    await saved(pc.page); await count(gm.page, 0);
    await pc.page.keyboard.press('Control+z');
    await saved(pc.page); await count(gm.page, 1);
    await pc.page.reload(); await count(pc.page, 1);

    // Another player's clear cannot erase Cal's drawing.
    await other.page.locator('[data-action="toggle-draw"]').click();
    await other.page.locator('[data-action="clear-drawings"]').click();
    await count(other.page, 1);

    await command('level.user.set', null, { userId: 'cal', entry: { levelId: 'test-upper', source: 'manual' } });
    await count(pc.page, 0);
    await pc.page.locator('[data-action="toggle-draw"]').click();
    await stroke(pc.page); await count(pc.page, 1);
    await count(gm.page, 1); await count(other.page, 1);
    await command('level.user.set', null, { userId: 'gm', entry: { levelId: 'test-upper', source: 'manual' } });
    await gm.page.waitForFunction(() => document.querySelector('#vtt-drawing-layer path[data-drawing-id]'));
    await pc.page.locator('[data-action="draw-mode-erase"]').click();
    await pc.page.mouse.click(690, 530);
    await saved(pc.page); await count(pc.page, 2); await count(gm.page, 2);
    await pc.page.keyboard.press('Control+z');
    await saved(pc.page); await count(gm.page, 1);
    await command('level.user.set', null, { userId: 'gm', entry: { levelId: 'level-0', source: 'manual' } });
    await pc.page.reload(); await count(pc.page, 1);
    const final = await gm.context.request.get(origin + '/dnd/vtt/api/v2/snapshot.php').then((response) => response.json());
    assert.deepEqual(Object.values(final.snapshot.state.drawings[sceneId]).map((drawing) => drawing.levelId).sort(), ['level-0', 'test-upper']);

    // A rejected creation is removed locally and explains the actual reason.
    await pc.page.route('**/api/v2/commands.php', async (route) => {
      if (route.request().postDataJSON()?.type === 'drawing.upsert') {
        await route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ success: false, error: 'Synthetic drawing rejection' }) });
      } else await route.continue();
    });
    await pc.page.locator('[data-action="toggle-draw"]').click();
    await stroke(pc.page); await count(pc.page, 1);
    assert.match(await pc.page.locator('#active-scene-status').textContent(), /Synthetic drawing rejection/);
    assert.deepEqual(errors, []);
    console.log('PASS: GM + two players; save, erase, clear, undo, ownership, floor binding, reload and rejected-command rollback.');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
