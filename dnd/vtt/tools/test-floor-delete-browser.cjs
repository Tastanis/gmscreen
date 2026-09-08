const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const origin = process.env.VTT_TEST_ORIGIN || 'http://127.0.0.1:8129';
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname)) throw Error('Loopback required');
(async () => {
  const manifest = await fetch(origin + '/diagnostic-manifest.json').then(r => r.json());
  assert.equal(manifest.test_fixture, 'floor-regression');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const errors = [], calls = [];
  try {
    async function client(user) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      await context.addInitScript(() => {
        window.testMovementEvents = [];
        document.addEventListener('vtt:token-moved', event => window.testMovementEvents.push(event.detail));
      });
      await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      const page = await context.newPage(); page.setDefaultTimeout(15000);
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(origin + '/test-login.php?user=' + user);
      await page.waitForFunction(() => document.querySelector('#vtt-map-image')?.naturalWidth > 0);
      return { context, page };
    }
    const gm = await client('GM'), pc = await client('cal'), other = await client('sharon');
    const snapshot = async () => (await (await gm.context.request.get(origin + '/dnd/vtt/api/v2/snapshot.php')).json()).snapshot;
    const placement = async () => (await snapshot()).state.placements[manifest.test_scene_id]['floor-cal'];
    pc.page.on('response', response => { if (response.url().endsWith('/commands.php')) calls.push({ status: response.status(), command: response.request().postDataJSON() }); });
    const selector = '#vtt-token-layer [data-placement-id="floor-cal"]';
    async function drag(dx, dy, row, levelId) {
      const box = await pc.page.locator(selector).boundingBox(); assert.ok(box);
      await pc.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await pc.page.mouse.down();
      await pc.page.mouse.move(box.x + box.width / 2 + dx * box.width, box.y + box.height / 2 + dy * box.height, { steps: 25 });
      await pc.page.mouse.up();
      await pc.page.waitForFunction(({ selector, levelId }) => document.querySelector(selector)?.dataset.mapLevelId === levelId, { selector, levelId });
      await new Promise(resolve => setTimeout(resolve, 400));
      const token = await placement(); assert.equal(token.row, row); assert.equal(token.levelId, levelId);
    }
    await drag(0, 3, 3, 'level-0');
    assert.equal((await placement())._floorTraversal.entry, 'red');
    await pc.page.reload(); await pc.page.locator(selector).waitFor();
    await drag(0, 2, 5, 'test-upper');
    const stairEvents = await pc.page.evaluate(() => window.testMovementEvents);
    assert.equal(stairEvents.length, 1, 'Stair completion emits one normal movement event.');
    assert.equal(stairEvents[0].from.levelId, 'level-0');
    assert.equal(stairEvents[0].to.levelId, 'test-upper');
    let state = (await snapshot()).state;
    assert.equal(state.sceneConfig[manifest.test_scene_id].userLevelState.cal.levelId, 'test-upper');
    assert.equal(state.sceneConfig[manifest.test_scene_id].userLevelState.sharon.levelId, 'level-0');
    assert.match(await pc.page.locator('[data-map-level-indicator-value]').textContent(), /Test balcony/);
    async function seed(type, entityId, payload) {
      const current = await snapshot();
      const response = await gm.context.request.post(origin + '/dnd/vtt/api/v2/commands.php', { data: {
        type, operationId: require('node:crypto').randomUUID(), sceneId: manifest.test_scene_id, entityId,
        baseRevision: current.revision, entityRevision: type === 'fog.set' ? current.state.sceneConfig[manifest.test_scene_id]._revision : 0,
        payload,
      } });
      assert.equal(response.status(), 200);
    }
    for (const [suffix, levelId] of [['upper', 'test-upper'], ['base', 'level-0']]) {
      await seed('template.upsert', 'delete-template-' + suffix, { template: { type: 'circle', center: { column: 4, row: 3 }, radius: 1, levelId } });
      await seed('drawing.upsert', 'delete-drawing-' + suffix, { drawing: { points: [{ x: 100, y: 100 }, { x: 150, y: 150 }], levelId } });
    }
    await seed('fog.set', null, { fogOfWar: { byLevel: { 'test-upper': { enabled: false }, 'level-0': { enabled: false } } } });
    await pc.page.locator('[data-template-id="delete-template-upper"]').waitFor();
    await other.context.setOffline(true);
    await gm.page.locator('[data-settings-launch="scenes"]').click();
    const remove = gm.page.locator('[data-action="delete-map-level"][data-map-level-id="test-upper"]');
    const folder = gm.page.locator('.scene-group').filter({ has: remove });
    if ((await folder.getAttribute('class')).includes('is-collapsed')) await folder.locator('[data-action="toggle-folder"]').click();
    const beforeDelete = await snapshot();
    const deleteCalls = [];
    gm.page.on('response', r => { if (r.url().endsWith('/commands.php')) deleteCalls.push(r.request().postDataJSON().type); });
    await remove.click();
    const response = gm.page.waitForResponse(r => r.url().endsWith('/commands.php'));
    await gm.page.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click();
    assert.equal((await response).status(), 200);
    for (const { page } of [gm, pc]) await page.waitForFunction(selector => document.querySelector(selector)?.dataset.mapLevelId === 'level-0', selector);
    const after = await snapshot();
    assert.equal(after.revision, beforeDelete.revision + 1);
    assert.equal(after.state.placements[manifest.test_scene_id]['floor-cal'].row, 5);
    assert.deepEqual(after.state.placements[manifest.test_scene_id]['floor-cal']._movementUndo, []);
    assert.equal(after.state.sceneConfig[manifest.test_scene_id].userLevelState.cal.levelId, 'level-0');
    assert.ok(!after.state.sceneConfig[manifest.test_scene_id].mapLevels.levels.some(x => x.id === 'test-upper'));
    for (const domain of ['templates', 'drawings']) {
      const prefix = domain === 'templates' ? 'delete-template-' : 'delete-drawing-';
      assert.equal(after.state[domain][manifest.test_scene_id][prefix + 'upper'], undefined);
      assert.ok(after.state[domain][manifest.test_scene_id][prefix + 'base']);
    }
    assert.equal(after.state.sceneConfig[manifest.test_scene_id].fogOfWar.byLevel['test-upper'], undefined);
    assert.ok(after.state.sceneConfig[manifest.test_scene_id].fogOfWar.byLevel['level-0']);
    assert.equal(after.state.sceneConfig[manifest.test_scene_id].mapLevels.baseStairs[0].linkedLevelId, null);
    await pc.page.locator('[data-template-id="delete-template-upper"]').waitFor({ state: 'detached' });
    await remove.waitFor({ state: 'detached' });
    await other.context.setOffline(false); await other.page.reload();
    await other.page.waitForFunction(selector => document.querySelector(selector)?.dataset.mapLevelId === 'level-0', selector);
    assert.deepEqual(deleteCalls, ['level.delete'], 'Deletion must not send separate token or viewer saves.');
    assert.equal(await pc.page.evaluate(() => window.testMovementEvents.length), 1, 'Deletion cannot emit another walking hook.');
    assert.deepEqual(errors, []);
    console.log('PASS: GM confirmed floor deletion, one canonical command/revision, token landing, player view, offline recovery and no walking hooks.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
