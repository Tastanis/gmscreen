const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const origin='http://127.0.0.1:8129';
(async()=>{
  const manifest=await fetch(origin+'/diagnostic-manifest.json').then(r=>r.json());
  assert.equal(manifest.test_fixture,'floor-regression');
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const contexts=[];
    for(const user of ['GM','cal','sharon']) {
      const context=await browser.newContext();contexts.push(context);
      await context.request.get(origin+'/test-login.php?user='+user);
    }
    const [gm,cal,sharon]=contexts;
    const endpoint=origin+'/dnd/vtt/api/v2/player-preview.php';
    const snapshot=async context=>(await(await context.request.get(origin+'/dnd/vtt/api/v2/snapshot.php')).json()).snapshot;
    const anonymous=await browser.newContext();
    assert.equal((await anonymous.request.get(endpoint+'?user=cal')).status(),401);
    assert.equal((await cal.request.get(endpoint+'?user=sharon')).status(),403);
    assert.equal((await gm.request.post(endpoint+'?user=cal',{data:{}})).status(),405);
    for(const query of ['gm','missing-profile','cal&user[]=sharon']) {
      assert.equal((await gm.request.get(endpoint+'?user='+query)).status(),422);
    }
    const before=await snapshot(gm);
    for(const [user,context] of [['cal',cal],['sharon',sharon]]) {
      const response=await gm.request.get(endpoint+'?user='+user);
      assert.equal(response.status(),200,await response.text());
      const {preview}=await response.json();
      assert.equal(preview.readOnly,true);assert.equal(preview.userId,user);
      assert.deepEqual(preview.snapshot,await snapshot(context));
    }
    assert.deepEqual(await snapshot(gm),before);
    // GM credentials still authorize another GM-only read after previewing players.
    assert.equal((await gm.request.get(endpoint+'?user=cal')).status(),200);
    const page=await gm.newPage();const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    await page.goto(origin+'/dnd/vtt/');
    await page.waitForFunction(()=>document.querySelector('[data-connection-status]')?.textContent.includes('Connected'));
    const uiBefore=await snapshot(gm);const writes=[];
    page.on('request',request=>{if(request.method()!=='GET' && request.url().includes('/api/v2/commands.php'))writes.push(request.url());});
    await page.locator('[data-settings-launch="scenes"]').click();
    const panel=page.locator('[data-player-preview]');await panel.locator('summary').click();
    await panel.locator('[data-preview-status]').filter({hasText:'captured'}).waitFor();
    await panel.locator('select').selectOption('sharon');
    await panel.locator('[data-preview-status]').filter({hasText:'sharon · revision'}).waitFor();
    await panel.getByRole('button',{name:'Refresh player view'}).click();
    await panel.locator('[data-preview-status]').filter({hasText:'captured'}).waitFor();
    assert.match(await panel.locator('[data-preview-details]').innerText(),/Viewing: Level 0/);
    await panel.screenshot({path:'.playwright-mcp/player-view-details.png'});
    const liveParent=await page.locator('#vtt-map-levels').evaluate(node=>node.parentElement.id);
    await panel.getByRole('button',{name:'Open player preview'}).click();
    const dialog=page.locator('.vtt-player-preview-dialog');
    await dialog.locator('.vtt-player-preview-map canvas').waitFor();
    assert.equal(await page.locator('#vtt-map-levels').count(),1);
    assert.equal(await page.locator('#vtt-map-levels').evaluate(node=>node.parentElement.id),liveParent);
    assert.match(await dialog.locator('h2').innerText(),/sharon: Level 0/);
    await dialog.screenshot({path:'.playwright-mcp/player-map-preview.png'});
    await dialog.getByRole('button',{name:'Close preview'}).click();
    await page.locator('.vtt-player-preview-map').waitFor({state:'detached'});
    assert.equal(await page.locator('.vtt-player-preview-map').count(),0);
    assert.deepEqual(await snapshot(gm),uiBefore);assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
    for(const [type,payload] of [
      ['grid.set',{grid:{size:64,offsetX:5,offsetY:7,visible:true}}],
      ['fog.set',{fogOfWar:{byLevel:{'test-upper':{enabled:true,revealedCells:{'0,0':true}}}}}],
      ['level.user.set',{userId:'sharon',entry:{levelId:'test-upper',source:'manual',followToken:false}}],
    ]) {
      const s=await snapshot(gm);
      const response=await gm.request.post(origin+'/dnd/vtt/api/v2/commands.php',{data:{type,payload,
        sceneId:manifest.test_scene_id,baseRevision:s.revision,entityRevision:s.state.sceneConfig[manifest.test_scene_id]._revision,
        operationId:'preview-upper-'+type+'-'+Date.now()}});
      assert.equal(response.status(),200,await response.text());
    }
    const upperBefore=await snapshot(gm);
    await panel.getByRole('button',{name:'Refresh player view'}).click();
    await panel.locator('[data-preview-details]').filter({hasText:'Test balcony'}).waitFor();
    await panel.getByRole('button',{name:'Open player preview'}).click();
    await dialog.locator('[data-map-level-id="test-upper"]').waitFor();
    const upper=await dialog.evaluate(async node=>{
      const {buildMapLevelCutoutMask}=await import('/dnd/vtt/assets/js/ui/map-level-renderer.js');
      const canvas=node.querySelector('canvas'),level=node.querySelector('[data-map-level-id="test-upper"]');
      const style=getComputedStyle(node.querySelector('.vtt-board__map-backdrop'));
      const insets=Object.fromEntries(['top','right','bottom','left'].map(side=>[side,parseFloat(style.getPropertyValue('padding-'+side))||0]));
      const expected=buildMapLevelCutoutMask([{column:6,row:5,width:2,height:2}],{
        mapPixelSize:{width:canvas.width,height:canvas.height},mapInsets:insets,gridSize:64,gridOrigin:{x:5,y:7},
      });
      const probe=document.createElement('div');probe.style.maskImage=expected;
      return {maskMatches:level.style.maskImage===probe.style.maskImage,
        clear:canvas.getContext('2d').getImageData(insets.left+10,insets.top+10,1,1).data[3],
        fogged:canvas.getContext('2d').getImageData(canvas.width-1,canvas.height-1,1,1).data[3]};
    });
    assert.deepEqual(upper,{maskMatches:true,clear:0,fogged:255});
    await dialog.screenshot({path:'.playwright-mcp/player-map-upper-preview.png'});
    await dialog.getByRole('button',{name:'Close preview'}).click();
    assert.deepEqual(await snapshot(gm),upperBefore);assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
    console.log('PASS: player preview HTTP authentication, methods, identity validation, exact player projection and unchanged canonical state.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
