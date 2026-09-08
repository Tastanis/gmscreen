const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const origin = 'http://127.0.0.1:8129';
(async()=>{
  const manifest = await fetch(origin+'/diagnostic-manifest.json').then(r=>r.json());
  assert.equal(manifest.test_fixture,'floor-regression');
  const endpoint = origin+'/dnd/vtt/api/v2/scene-export.php?sceneId='+encodeURIComponent(manifest.test_scene_id);
  assert.equal((await fetch(endpoint)).status,401);
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const errors=[];
    async function client(user) {
      const page=await browser.newPage({viewport:{width:1280,height:720},acceptDownloads:true});
      page.setDefaultTimeout(15000); page.on('pageerror',e=>errors.push(e.message));
      await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
      await page.goto(origin+'/test-login.php?user='+user);
      await page.waitForFunction(()=>document.querySelector('[data-connection-status]')?.textContent.includes('Connected'));
      return page;
    }
    const gm=await client('GM'), pc=await client('cal');
    assert.equal((await pc.request.get(endpoint)).status(),403);
    assert.equal((await gm.request.post(endpoint)).status(),405);
    assert.equal((await gm.request.get(origin+'/dnd/vtt/api/v2/scene-export.php?sceneId=missing')).status(),404);
    const snapshot=async()=>(await(await gm.request.get(origin+'/dnd/vtt/api/v2/snapshot.php')).json()).snapshot;
    const before=await snapshot();
    await gm.locator('[data-settings-launch="scenes"]').click();
    const button=gm.locator(`[data-action="export-scene"][data-scene-id="${manifest.test_scene_id}"]`);
    const folder=gm.locator('.scene-group').filter({has:button});
    if ((await folder.getAttribute('class')).includes('is-collapsed')) await folder.locator('[data-action="toggle-folder"]').click();
    const downloaded=gm.waitForEvent('download'); await button.click();
    const download=await downloaded;
    assert.match(download.suggestedFilename(),/^scene-.*\.json$/);
    const data=JSON.parse(await fs.readFile(await download.path(),'utf8'));
    assert.equal(data.format,'gmscreen-scene/v1'); assert.equal(data.scene.id,manifest.test_scene_id);
    assert.equal(data.sourceRevision,before.revision);
    assert.deepEqual(data.domains.sceneConfig.mapLevels,before.state.sceneConfig[manifest.test_scene_id].mapLevels);
    assert.deepEqual(Object.keys(data.domains.placements).sort(),Object.keys(before.state.placements[manifest.test_scene_id]).sort());
    assert.ok(data.assetReferences.includes(data.scene.mapUrl));
    assert.equal(data.domains.sceneConfig.userLevelState,undefined);
    assert.deepEqual(await snapshot(),before,'Exporting never changes board state.');
    assert.match(await gm.locator('[data-scene-feedback]').textContent(),/Images are linked/);
    assert.deepEqual(errors,[]);
    console.log('PASS: actual scene download, GM-only access, coherent board domains, base-map references, and unchanged state.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
