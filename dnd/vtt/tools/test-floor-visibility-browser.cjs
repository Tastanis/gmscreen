const { chromium } = require('playwright');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');
const origin = 'http://127.0.0.1:8129';
(async () => {
  const manifest = await fetch(origin + '/diagnostic-manifest.json').then(r => r.json());
  assert.equal(manifest.test_fixture, 'floor-regression');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const errors = [];
  try {
    async function client(user) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      page.setDefaultTimeout(15000);
      page.on('pageerror', e => errors.push(e.message));
      await page.route('**/*', r => new URL(r.request().url()).origin === origin ? r.continue() : r.abort());
      const response = await page.goto(origin + '/test-login.php?user=' + user);
      if (user !== 'GM') {
        const html = await response.text();
        for (const id of ['visibility-token', 'visibility-template', 'visibility-drawing']) assert.ok(!html.includes(id), 'Initial player HTML must exclude hidden-floor content.');
      }
      await page.waitForFunction(() => document.querySelector('[data-connection-status]')?.textContent.includes('Connected'));
      return page;
    }
    const gm = await client('GM');
    const snapshot = async () => (await (await gm.request.get(origin + '/dnd/vtt/api/v2/snapshot.php')).json()).snapshot;
    const sceneId = manifest.test_scene_id;
    async function command(type, payload, entityId = null) {
      const state = await snapshot();
      const response = await gm.request.post(origin + '/dnd/vtt/api/v2/commands.php', { data: {
        type, payload, entityId, sceneId, operationId: randomUUID(), baseRevision: state.revision,
        entityRevision: type === 'levels.set' ? state.state.sceneConfig[sceneId]._revision : 0,
      } });
      assert.equal(response.status(), 200);
    }
    const levels = (await snapshot()).state.sceneConfig[sceneId].mapLevels;
    levels.levels.find(x => x.id === 'test-upper').hidden = true;
    await command('levels.set', { mapLevels: levels });
    const imageUrl = (await snapshot()).state.placements[sceneId]['floor-cal'].imageUrl;
    await command('placement.batch', { actions: [{ kind: 'add', sceneId, placementId: 'visibility-token', placement: {
      id: 'visibility-token', name: 'Balcony marker', imageUrl, column: 4, row: 3, width: 1, height: 1, team: 'enemy', levelId: 'test-upper',
    } }] });
    await command('template.upsert', { template: { type: 'circle', center: { column: 5, row: 3 }, radius: 1, levelId: 'test-upper' } }, 'visibility-template');
    await command('drawing.upsert', { drawing: { points: [{ x: 100, y: 100 }, { x: 150, y: 150 }], levelId: 'test-upper' } }, 'visibility-drawing');
    const original = (await snapshot()).state.placements[sceneId]['visibility-token'];
    const players = [await client('cal'), await client('sharon')];
    const token = '[data-placement-id="visibility-token"]';
    const shape = '[data-template-id="visibility-template"]';
    for (const p of players) { assert.equal(await p.locator(token).count(), 0); assert.equal(await p.locator(shape).count(), 0); }
    await gm.locator('[data-settings-launch="scenes"]').click();
    const toggle = gm.locator('[data-action="toggle-map-level-hide"][data-map-level-id="test-upper"]');
    const folder = gm.locator('.scene-group').filter({ has: toggle });
    if ((await folder.getAttribute('class')).includes('is-collapsed')) await folder.locator('[data-action="toggle-folder"]').click();
    const floorDetails = toggle.locator('xpath=ancestor::details[1]');
    if (await floorDetails.getAttribute('open') === null) await floorDetails.locator('summary').click();
    for (const hidden of [false, true, false]) {
      const response = gm.waitForResponse(r => r.url().endsWith('/commands.php') && r.request().postDataJSON()?.type === 'levels.set');
      await toggle.click(); assert.equal((await response).status(), 200);
      if (!hidden) {
        if ((await gm.locator('[data-map-level-indicator-value]').textContent()) !== 'Test balcony') {
          await gm.locator('[data-action="view-map-level-up"]').click();
        }
        await gm.getByRole('button', { name: 'Show players this floor', exact: true }).click();
        for (const p of players) await p.waitForFunction(() => document.querySelector('[data-map-level-indicator-value]')?.textContent === 'Test balcony');
      }
      for (const p of players) {
        try { await p.locator(token).waitFor({ state: hidden ? 'detached' : 'attached' }); }
        catch (error) {
          console.error(await p.evaluate(async () => {
            const { getState } = await import('/dnd/vtt/assets/js/state/store.js');
            const state = getState(), scene = state.boardState.activeSceneId;
            return { scene, tokens: (state.boardState.placements[scene] || []).map(x => ({ id: x.id, levelId: x.levelId })),
              levels: state.boardState.sceneState[scene]?.mapLevels?.levels?.map(x => ({ id: x.id, hidden: x.hidden })) };
          }));
          throw error;
        }
        await p.locator(shape).waitFor({ state: hidden ? 'detached' : 'attached' });
      }
      assert.deepEqual((await snapshot()).state.placements[sceneId]['visibility-token'], original);
    }
    assert.deepEqual(errors, []);
    console.log('PASS: hidden-floor join, reveal/hide/reveal without player reload, focused token/template reconciliation and unchanged canonical token.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
