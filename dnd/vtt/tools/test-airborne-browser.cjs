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
    async function mode(value) {
      await pc.page.locator(selector).click({ button: 'right' });
      const control = pc.page.getByRole('combobox', { name: 'Token movement mode', exact: true });
      const response = pc.page.waitForResponse(r => r.url().endsWith('/commands.php'));
      await control.selectOption(value);
      assert.equal((await response).status(), 200);
      assert.equal((await placement()).movementMode, value);
      await pc.page.keyboard.press('Escape');
    }
    await mode('fly');
    await pc.page.locator(selector).hover();
    await drag(4, 0, 5, 'test-upper');
    assert.equal((await placement()).column, 6);
    await pc.page.reload();
    await pc.page.locator(selector).waitFor();
    assert.equal((await placement()).movementMode, 'fly');
    await mode('hover');
    await mode('ground');
    for (const { page } of [gm, pc, other]) await page.waitForFunction(selector => document.querySelector(selector)?.dataset.mapLevelId === 'level-0', selector);
    assert.equal((await snapshot()).state.sceneConfig[manifest.test_scene_id].userLevelState.cal.levelId, 'level-0');
    assert.deepEqual(errors, []);
    console.log('PASS: player flight control, drag across hole, reload persistence, hover selection and atomic landing across three clients.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
