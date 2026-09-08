const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const origin = process.env.VTT_TEST_ORIGIN || 'http://127.0.0.1:8128';
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(origin).hostname)) throw new Error('Loopback required.');
(async () => {
  const manifest = await fetch(origin + '/diagnostic-manifest.json').then((response) => response.json());
  assert.equal(manifest.test_fixture, 'drawing-regression', 'Synthetic drawing/template fixture required.');
  const sceneId = manifest.test_scene_id;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const errors = [];
  try {
    async function client(user) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      await context.route('**/*', (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      const page = await context.newPage(); page.setDefaultTimeout(15000);
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(origin + '/test-login.php?user=' + user);
      await page.waitForFunction(() => document.querySelector('#vtt-map-image')?.naturalWidth > 0);
      return { context, page };
    }
    const gm = await client('GM');
    const snapshot = async () => (await gm.context.request.get(origin + '/dnd/vtt/api/v2/snapshot.php').then((response) => response.json())).snapshot;
    async function command(type, id, payload) {
      const state = await snapshot();
      const response = await gm.context.request.post(origin + '/dnd/vtt/api/v2/commands.php', { data: {
        type, sceneId, entityId: id, payload, operationId: 'template-browser-' + crypto.randomUUID(),
        baseRevision: state.revision,
        entityRevision: type.startsWith('template.') ? state.state.templates?.[sceneId]?.[id]?._entityRevision || 0 : state.state.sceneConfig?.[sceneId]?._revision || 0,
      } });
      assert.equal(response.status(), 200, await response.text());
    }
    for (const template of Object.values((await snapshot()).state.templates?.[sceneId] || {})) await command('template.remove', template.id, {});
    for (const user of ['cal', 'gm', 'sharon']) await command('level.user.set', null, { userId: user, entry: { levelId: 'level-0', source: 'manual' } });
    await command('template.upsert', 'gm-template', { template: { type: 'circle', center: { column: 3, row: 3 }, radius: 1, levelId: 'level-0' } });
    const pc = await client('cal'), other = await client('sharon');
    const calls = [];
    pc.page.on('response', (response) => { if (response.url().endsWith('/commands.php')) calls.push({ status: response.status(), command: response.request().postDataJSON() }); });
    await pc.page.locator('[data-action="open-templates"]').click();
    await pc.page.locator('.vtt-template-menu [data-template="circle"]').click();
    await pc.page.getByLabel('Radius (squares)').fill('2');
    await pc.page.locator('.vtt-template-menu__confirm').click();
    await pc.page.mouse.click(600, 500);
    await pc.page.waitForFunction(() => document.querySelector('#vtt-template-layer')?.getAttribute('aria-busy') === 'false');
    const templates = Object.values((await snapshot()).state.templates[sceneId]);
    assert.equal(templates.length, 2);
    const mine = templates.find((template) => template.authorId === 'cal');
    assert.ok(mine, 'The actual UI-created template must have server-assigned ownership.');
    for (const { page } of [gm, other]) await page.locator(`[data-template-id="${mine.id}"]`).waitFor();
    const nodeBounds = await pc.page.locator(`[data-template-node="${mine.id}"]`).boundingBox();
    await pc.page.mouse.move(nodeBounds.x + nodeBounds.width / 2, nodeBounds.y + nodeBounds.height / 2);
    await pc.page.mouse.down();
    await pc.page.mouse.move(nodeBounds.x + nodeBounds.width / 2 + 40, nodeBounds.y + nodeBounds.height / 2, { steps: 8 });
    await pc.page.mouse.up();
    await pc.page.waitForFunction(() => document.querySelector('#vtt-template-layer')?.getAttribute('aria-busy') === 'false');
    assert.notDeepEqual((await snapshot()).state.templates[sceneId][mine.id].center, mine.center);
    await pc.page.reload(); await pc.page.locator(`[data-template-id="${mine.id}"]`).waitFor();
    await pc.page.locator('[data-template-node="gm-template"]').press('Delete');
    assert.match(await pc.page.locator('#active-scene-status').textContent(), /own temporary templates/);
    assert.ok((await snapshot()).state.templates[sceneId]['gm-template']);
    await pc.page.locator(`[data-template-node="${mine.id}"]`).press('Delete');
    await pc.page.waitForFunction(() => document.querySelector('#vtt-template-layer')?.getAttribute('aria-busy') === 'false');
    for (const { page } of [gm, other]) await page.locator(`[data-template-id="${mine.id}"]`).waitFor({ state: 'detached' });
    assert.deepEqual(Object.keys((await snapshot()).state.templates[sceneId]), ['gm-template']);
    assert.deepEqual(calls.filter((call) => call.command.type.startsWith('template.')).map((call) => [call.command.type, call.command.entityId, call.status]), [
      ['template.upsert', mine.id, 200], ['template.upsert', mine.id, 200], ['template.remove', mine.id, 200],
    ]);
    assert.deepEqual(errors, []);
    console.log('PASS: actual player template creation, owner-only Delete, precise commands, reload, and GM/two-player replay.');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
