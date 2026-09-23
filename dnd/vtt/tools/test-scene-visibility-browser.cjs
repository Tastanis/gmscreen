const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const origin = 'http://127.0.0.1:18767';
(async () => {
  assert.equal((await fetch(origin + '/diagnostic-manifest.json').then(r => r.json())).test_fixture, 'scene-visibility-regression');
  const browser = await chromium.launch({channel:'chrome',headless:true});
  try {
    const errors = [], pages = [];
    for (const user of ['GM','cal','sharon']) {
      const page = await browser.newPage({viewport:{width:1280,height:720}});
      page.on('pageerror', e => errors.push(e.message));
      await page.route('**/*', r => new URL(r.request().url()).origin === origin ? r.continue() : r.abort());
      await page.goto(origin + '/test-login.php?user=' + user);
      await page.waitForFunction(() => document.querySelector('[data-connection-status]')?.textContent.includes('Connected'));
      await page.locator('#vtt-map-image').waitFor({state:'visible'});
      pages.push(page);
    }
    const [gm,...players] = pages;
    const snapshot = async () => (await (await gm.request.get(origin+'/dnd/vtt/api/v2/snapshot.php')).json()).snapshot;
    const commands = [];
    gm.on('request', r => { if(r.url().endsWith('/commands.php') && r.method()==='POST') commands.push(r.postDataJSON()); });
    await gm.locator('[data-settings-launch="scenes"]').click();
    await gm.locator('details').filter({has:gm.locator('[data-scene-form]')}).locator(':scope > summary').click();
    await gm.locator('[data-scene-name-input]').fill('Saved scene regression');
    await gm.locator('[data-scene-form] [type="submit"]').click();
    await gm.waitForFunction(() => document.querySelector('[data-scene-feedback]')?.textContent === 'Scene saved successfully.');
    const saved = await snapshot();
    const sceneId = saved.state.routing.activeSceneId;
    const tokenId = 'test-enemy-' + sceneId;
    assert.notEqual(sceneId,'test-scene','Save scene must activate the new canonical scene');
    assert.ok(commands.some(c=>c.type==='scene.activate' && c.sceneId===sceneId));
    while(await gm.locator('.scene-group.is-collapsed [data-action="toggle-folder"]').count()) await gm.locator('.scene-group.is-collapsed [data-action="toggle-folder"]').first().click();
    await gm.locator(`[data-action="show-scene-to-players"][data-scene-id="${sceneId}"]`).click();
    for (const page of pages) await page.waitForFunction(async id => {
      const {getState}=await import('/dnd/vtt/assets/js/state/store.js');return getState().boardState.activeSceneId===id;
    }, sceneId);
    console.log('PASS Save scene and Show players: GM and two players share canonical scene');
    let seq=0;
    async function command(type,payload,entityId=null) {
      const s=await snapshot();
      const r=await gm.request.post(origin+'/dnd/vtt/api/v2/commands.php',{data:{type,payload,sceneId,entityId,
        baseRevision:s.revision,entityRevision:entityId ? s.state.placements[sceneId][entityId]._entityRevision : (s.state.sceneConfig[sceneId]?._revision??0),
        operationId:'visibility-'+Date.now()+'-'+ ++seq}});
      assert.equal(r.status(),200,await r.text());return r.json();
    }
    async function patch(patch) {
      const s=await snapshot();return command('placement.batch',{actions:[{kind:'patch',sceneId,placementId:tokenId,entityRevision:s.state.placements[sceneId][tokenId]._entityRevision,patch}]});
    }
    async function fog(enabled) {await command('fog.set',{fogOfWar:{byLevel:{'level-0':{enabled,revealedCells:{'4,4':true}}}}});}
    const token = page=>page.locator(`#vtt-token-layer [data-placement-id="${tokenId}"]`);
    await fog(true);
    await command('placement.batch',{actions:[{kind:'add',sceneId,placementId:tokenId,placement:{id:tokenId,name:'Test Enemy',imageUrl:'/dnd/vtt/storage/test.png',team:'enemy',width:1,height:1,column:2,row:2,levelId:'level-0',hidden:true,hp:{current:400,max:400}}}]});
    await patch({hidden:false});
    for (const p of players) {
      await p.waitForFunction(async ({sceneId,tokenId})=>{ const {getState}=await import('/dnd/vtt/assets/js/state/store.js');return getState().boardState.placements[sceneId]?.some(t=>t.id===tokenId&&!t.hidden); },{sceneId,tokenId});
      await token(p).waitFor({state:'detached'});
    }
    await command('token.move',{column:4,row:4,levelId:'level-0'},tokenId);
    for (const p of players) await token(p).waitFor({state:'visible'});
    console.log('PASS hidden token revealed in fog then moved out appears for two players without reload');
    await command('token.move',{column:2,row:2,levelId:'level-0'},tokenId);
    for (const p of players) await token(p).waitFor({state:'detached'});
    await fog(false);
    for (const p of players) await token(p).waitFor({state:'visible'});
    await fog(true);
    for (const p of players) await token(p).waitFor({state:'detached'});
    console.log('PASS movement into fog, fog clearing and re-covering update both players');
    await fog(false);
    await patch({hidden:true});
    for (const p of players) await token(p).waitFor({state:'detached'});
    await patch({hidden:false});
    for (const p of players) await token(p).waitFor({state:'visible'});
    console.log('PASS hide/reveal outside fog');
    // Exercise the real board callback from both GM and player contexts.
    for (const p of [gm,players[0]]) {
      const currentRevision=(await snapshot()).state.placements[sceneId][tokenId]._entityRevision;
      await p.waitForFunction(async ({sceneId,currentRevision,tokenId})=>{const {getState}=await import('/dnd/vtt/assets/js/state/store.js');return getState().boardState.placements[sceneId]?.find(t=>t.id===tokenId)?._syncV2EntityRevision===currentRevision;},{sceneId,currentRevision,tokenId});
      const damage=await p.evaluate(tokenId=>VTTBoardCallbacks.applyDamage({placementId:tokenId,amount:5,abilityName:'Privacy test'}),tokenId);
      assert.equal(damage.hideHitPointValues,true,'shared chat privacy cannot depend on GM execution');
      assert.equal(damage.amount,5);
    }
    await gm.locator('[data-action="close-settings"]').click();
    await gm.locator('[data-settings-launch="tokens"]').click();
    const summary=gm.locator('[data-token-creation] > summary');
    const styles=await summary.evaluate(el=>{const c=getComputedStyle(el);return {border:c.borderTopWidth,background:c.backgroundImage};});
    assert.equal(styles.border,'2px'); assert.notEqual(styles.background,'none');
    await summary.click();assert.equal(await gm.locator('[data-token-creation]').evaluate(e=>e.open),true);
    await summary.click();assert.equal(await gm.locator('[data-token-creation]').evaluate(e=>e.open),false);
    await gm.screenshot({path:'.playwright-mcp/scene-visibility-button.png'});
    const version = JSON.parse(require('node:fs').readFileSync(require('node:path').join(__dirname,'../../data/version.json'),'utf8'));
    assert.equal(await gm.evaluate(()=>window.vttConfig.assetsVersion),version.build_number,'updated asset cache version');
    assert.deepEqual(errors,[]);
    console.log('PASS enemy damage privacy callbacks for GM/player and Create a token button appearance/disclosure');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

