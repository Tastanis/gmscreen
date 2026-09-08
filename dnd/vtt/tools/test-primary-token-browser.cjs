const { chromium } = require('playwright');
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
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      await page.goto(origin + '/test-login.php?user=' + user);
      await page.waitForFunction(() => document.querySelector('#vtt-map-image')?.naturalWidth > 0);
      return page;
    }
    const gm = await client('GM'), pc = await client('cal'), other = await client('sharon');
    const sceneId = manifest.test_scene_id;
    const snapshot = async () => (await (await gm.request.get(origin + '/dnd/vtt/api/v2/snapshot.php')).json()).snapshot;
    let initial = await snapshot();
    const original = initial.state.placements[sceneId]['floor-cal'];
    const response = await gm.request.post(origin + '/dnd/vtt/api/v2/commands.php', { data: {
      type: 'placement.batch', operationId: 'primary-browser-setup', baseRevision: initial.revision,
      payload: { actions: [
        {kind:'patch',sceneId,placementId:'floor-cal',entityRevision:original._entityRevision,patch:{column:10}},
        {kind:'add',sceneId,placementId:'primary-copy',placement:{...original,id:'primary-copy',column:2}}
      ] }
    } });
    assert.equal(response.status(), 200);
    const token = id => `#vtt-token-layer [data-placement-id="${id}"]`;
    await gm.locator(token('primary-copy')).waitFor();
    async function choose(id) {
      await gm.locator(token(id)).click({button:'right'});
      const checkbox = gm.locator('[data-token-primary-pc]');
      const result = gm.waitForResponse(r => r.url().endsWith('/commands.php') && r.request().postDataJSON()?.type === 'placement.batch');
      await checkbox.check();
      assert.equal((await result).status(), 200);
      await gm.keyboard.press('Escape');
    }
    await choose('floor-cal');
    const beforeSwitch = (await snapshot()).revision;
    await choose('primary-copy');
    const switched = await snapshot();
    assert.equal(switched.revision, beforeSwitch + 1);
    assert.equal(switched.state.placements[sceneId]['floor-cal'].primaryPc, false);
    assert.equal(switched.state.placements[sceneId]['primary-copy'].primaryPc, true);
    await gm.reload();
    await gm.locator(token('primary-copy')).click({button:'right'});
    assert.equal(await gm.locator('[data-token-primary-pc]').isChecked(), true);
    await gm.keyboard.press('Escape');
    await pc.locator(token('primary-copy')).click({button:'right'});
    assert.equal(await pc.locator('[data-token-primary-pc]').count(), 0);
    await pc.keyboard.press('Escape');
    async function drag(dy, expectedRow) {
      await pc.locator(token('primary-copy')).hover();
      const box = await pc.locator(token('primary-copy')).boundingBox();
      await pc.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await pc.mouse.down();
      await pc.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + dy * box.height, {steps:25});
      await pc.mouse.up();
      for (let i=0;i<60;i++) {
        if ((await snapshot()).state.placements[sceneId]['primary-copy'].row === expectedRow) return;
        await new Promise(resolve => setTimeout(resolve,100));
      }
      throw Error('Primary token drag did not save');
    }
    await drag(3,3);
    await pc.reload();
    await drag(2,5);
    await pc.waitForFunction(() => document.querySelector('[data-map-level-indicator-value]')?.textContent === 'Test balcony');
    const final = await snapshot();
    assert.equal(final.state.sceneConfig[sceneId].userLevelState.cal.tokenId, 'primary-copy');
    assert.equal(final.state.placements[sceneId]['floor-cal'].levelId, 'level-0');
    assert.equal(await other.locator('[data-map-level-indicator-value]').textContent(), 'Level 0', 'Another player keeps their own floor.');
    await gm.locator('[data-action="view-map-level-up"]').click();
    await gm.waitForFunction(() => document.querySelector('[data-map-level-indicator-value]')?.textContent === 'Test balcony');
    await gm.getByRole('button', { name: 'Show players this floor', exact: true }).click();
    await other.waitForFunction(selector => document.querySelector(selector)?.dataset.mapLevelId === 'test-upper', token('primary-copy'));
    async function hidden(value) {
      const current = await snapshot();
      const response = await gm.request.post(origin + '/dnd/vtt/api/v2/commands.php', {data:{
        type:'placement.batch',operationId:`primary-browser-hidden-${value}`,baseRevision:current.revision,
        payload:{actions:[{kind:'patch',sceneId,placementId:'primary-copy',entityRevision:current.state.placements[sceneId]['primary-copy']._entityRevision,patch:{hidden:value}}]}
      }});
      assert.equal(response.status(), 200);
    }
    await hidden(true);
    await pc.waitForFunction(async sceneId => {
      const {getState} = await import('/dnd/vtt/assets/js/state/store.js');
      return getState().boardState.sceneState[sceneId]?.pcTokenAssociations?.cal === null;
    }, sceneId);
    await pc.getByRole('button', {name:"My token's floor",exact:true}).click();
    assert.equal(await pc.locator('[data-map-level-indicator-value]').textContent(), 'Test balcony', 'Hidden primary does not fall back to base-floor duplicate.');
    const reload = await pc.reload();
    assert.equal((await reload.text()).includes('primary-copy'), false, 'Initial HTML does not reveal the hidden primary ID.');
    await pc.getByRole('button', {name:"My token's floor",exact:true}).click();
    assert.equal(await pc.locator('[data-map-level-indicator-value]').textContent(), 'Test balcony');
    await hidden(false);
    await pc.waitForFunction(async sceneId => {
      const {getState} = await import('/dnd/vtt/assets/js/state/store.js');
      return getState().boardState.sceneState[sceneId]?.pcTokenAssociations?.cal === 'primary-copy';
    }, sceneId);
    await gm.locator('[data-action="view-map-level-down"]').click();
    await gm.waitForFunction(() => document.querySelector('[data-map-level-indicator-value]')?.textContent === 'Level 0');
    await gm.getByRole('button', {name:'Show players this floor',exact:true}).click();
    await pc.waitForFunction(() => document.querySelector('[data-map-level-indicator-value]')?.textContent === 'Level 0');
    await pc.getByRole('button', {name:"My token's floor",exact:true}).click();
    await pc.waitForFunction(() => document.querySelector('[data-map-level-indicator-value]')?.textContent === 'Test balcony');
    assert.deepEqual(errors, []);
    console.log('PASS: primary switching, stairs/reload, hidden-primary privacy and no fallback, live reveal and restored floor return.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
