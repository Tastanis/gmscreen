const { waitForBrowserState } = require('./wait-for-browser-state.cjs');
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
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      page.on('pageerror', e => errors.push(e.message));
      await page.route('**/*', r => new URL(r.request().url()).origin === origin ? r.continue() : r.abort());
      await page.goto(origin + '/test-login.php?user=' + user);
      await page.waitForFunction(() => document.querySelector('[data-connection-status]')?.textContent === 'Connected');
      return page;
    }
    const gm = await client('GM');
    const sceneId = manifest.test_scene_id;
    const snapshot = async () => (await (await gm.request.get(origin + '/dnd/vtt/api/v2/snapshot.php')).json()).snapshot;
    let s = await snapshot();
    const response = await gm.request.post(origin + '/dnd/vtt/api/v2/commands.php', { data: {
      type: 'placement.batch', sceneId, operationId: randomUUID(), baseRevision: s.revision,
      payload: { actions: [{ kind: 'patch', sceneId, placementId: 'floor-cal', entityRevision: s.state.placements[sceneId]['floor-cal']._entityRevision,
        patch: { column: 6, row: 5 } }] }
    } });
    assert.equal(response.status(), 200, await response.text());
    const original = (await snapshot()).state.placements[sceneId]['floor-cal'];
    const cal = await client('cal'), sharon = await client('sharon');
    await gm.locator('[data-settings-launch="scenes"]').click();
    while (await gm.locator('.scene-group.is-collapsed [data-action="toggle-folder"]').count()) await gm.locator('.scene-group.is-collapsed [data-action="toggle-folder"]').first().click();
    const height = gm.locator('[data-action="set-map-level-height"][data-map-level-id="test-upper"]');
    async function setHeight(n) {
      await height.fill(String(n)); await height.press('Tab');
      await waitForBrowserState(gm, async n => {
        const r = await fetch('/dnd/vtt/api/v2/snapshot.php').then(r => r.json());
        return Object.values(r.snapshot.state.sceneConfig).some(c => c.mapLevels?.levels?.some(l => l.id === 'test-upper' && l.elevationSquares === n));
      }, n);
    }
    await setHeight(5);
    await height.locator('xpath=ancestor::li[1]').locator('[data-action="view-floor"]').click();
    await gm.getByRole('button', { name: 'Show players this floor', exact: true }).click();
    const badge = '#vtt-token-layer [data-placement-id="floor-cal"] .vtt-token__level-indicator';
    async function check(page, n) {
      await page.waitForFunction(({ badge, n }) => document.querySelector(badge)?.getAttribute('aria-label') === `${n} squares below your viewed floor`, { badge, n });
      assert.equal(await page.locator(badge + ' .vtt-token__level-indicator-distance').textContent(), String(n));
      assert.equal(await page.locator(badge).isVisible(), true);
    }
    for (const page of [gm, cal, sharon]) await check(page, 5);
    await sharon.context().setOffline(true);
    await sharon.waitForFunction(() => document.querySelector('[data-connection-status]')?.textContent === 'Offline');
    await setHeight(8);
    for (const page of [gm, cal]) await check(page, 8);
    await sharon.context().setOffline(false);
    await sharon.waitForFunction(() => document.querySelector('[data-connection-status]')?.textContent === 'Connected');
    await check(sharon, 8);
    for (const page of [gm, cal, sharon]) {
      await page.reload();
      await page.waitForFunction(() => document.querySelector('[data-connection-status]')?.textContent === 'Connected');
      await check(page, 8);
    }
    assert.deepEqual((await snapshot()).state.placements[sceneId]['floor-cal'], original, 'Viewing and height edits do not mutate token state');
    assert.deepEqual(errors, []);
    console.log('PASS GM plus two players: numeric height badges through opening, live height update, offline catch-up without reload, persisted reload and unchanged token');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
