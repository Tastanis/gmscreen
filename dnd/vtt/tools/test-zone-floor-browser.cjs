const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const origin='http://127.0.0.1:8129';
(async()=>{
  const manifest=await fetch(origin+'/diagnostic-manifest.json').then(r=>r.json());
  assert.equal(manifest.test_fixture,'floor-regression');
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const errors=[],pages=[];
    for(const user of ['GM','sharon']) {
      const page=await browser.newPage();page.on('pageerror',error=>errors.push(error.message));
      await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
      await page.goto(origin+'/test-login.php?user='+user);
      await page.waitForFunction(()=>document.querySelector('[data-connection-status]')?.textContent.includes('Connected'));
      pages.push(page);
    }
    const [gm,pc]=pages,sceneId=manifest.test_scene_id;
    const snapshot=async(page)=>(await(await page.request.get(origin+'/dnd/vtt/api/v2/snapshot.php')).json()).snapshot;
    const result=await gm.evaluate(()=>new Promise(resolve=>{
      document.dispatchEvent(new CustomEvent('vtt:automation-register-persistent-zone',{detail:{resolve,payload:{
        casterId:'floor-cal',abilityName:'Floor regression zone',effects:[],
        area:{shape:'cube',template:{column:6,row:5,width:2,height:2,levelId:'test-upper'}},
      }}}));
    }));
    assert.equal(result.registered,true);
    await gm.waitForFunction(async({sceneId,id})=>{
      const s=(await(await fetch('/dnd/vtt/api/v2/snapshot.php')).json()).snapshot;
      return s.state.placements?.[sceneId]?.['floor-cal']?.persistentZones?.some(z=>z.id===id);
    },{sceneId,id:result.zoneId});
    const zone=(await snapshot(gm)).state.placements[sceneId]['floor-cal'].persistentZones.find(z=>z.id===result.zoneId);
    assert.equal(zone.levelId,'test-upper','Registration retains the selected area floor, not the base-floor caster');
    assert.equal((await snapshot(gm)).state.placements[sceneId]['floor-cal'].levelId,'level-0');
    await pc.waitForTimeout(600);
    assert.equal(await pc.locator(`[data-zone-id="${zone.id}"]`).count(),0,'An upper-floor zone is absent from the base-floor player view');
    assert.deepEqual((await snapshot(pc)).state.placements[sceneId]['floor-cal'].persistentZones.find(z=>z.id===result.zoneId),zone);
    await gm.reload();await gm.waitForFunction(()=>document.querySelector('[data-connection-status]')?.textContent.includes('Connected'));
    assert.deepEqual((await snapshot(gm)).state.placements[sceneId]['floor-cal'].persistentZones.find(z=>z.id===result.zoneId),zone);
    const lower=await gm.evaluate(()=>new Promise(resolve=>{
      document.dispatchEvent(new CustomEvent('vtt:automation-register-persistent-zone',{detail:{resolve,payload:{
        casterId:'floor-cal',abilityName:'Lower wall zone',effects:[],
        area:{shape:'wall',template:{column:5,row:5,width:3,height:1,levelId:'level-0',
          squares:[{column:5,row:5},{column:6,row:5},{column:7,row:5}]}},
      }}}));
    }));
    assert.equal(lower.registered,true);
    await gm.waitForFunction(async({sceneId,id})=>{
      const s=(await(await fetch('/dnd/vtt/api/v2/snapshot.php')).json()).snapshot;
      return s.state.placements[sceneId]['floor-cal'].persistentZones.some(z=>z.id===id);
    },{sceneId,id:lower.zoneId});
    const current=await snapshot(gm);
    const moved=await gm.request.post(origin+'/dnd/vtt/api/v2/commands.php',{data:{type:'level.user.set',sceneId,
      payload:{userId:'sharon',entry:{levelId:'test-upper',source:'manual',followToken:false}},
      baseRevision:current.revision,entityRevision:current.state.sceneConfig[sceneId]._revision,
      operationId:'zone-preview-floor-'+Date.now()}});
    assert.equal(moved.status(),200);
    await pc.waitForFunction(()=>document.querySelector('[data-map-level-indicator-value]')?.textContent==='Test balcony');
    await pc.locator(`[data-zone-id="${zone.id}"]`).waitFor();
    const describe=nodes=>nodes.map(n=>({id:n.dataset.previewZoneId||n.dataset.zoneId,
      left:n.style.left,top:n.style.top,width:n.style.width,height:n.style.height,mask:n.style.maskImage,
      label:n.querySelector('.vtt-persistent-zone__label')?.textContent||null}));
    const actual=await pc.locator('.vtt-persistent-zones > .vtt-persistent-zone').evaluateAll(describe);
    assert.equal(actual.filter(n=>n.id===lower.zoneId).length,2,'Only wall tiles inside the balcony cutout render');
    assert.equal(actual.find(n=>n.id===lower.zoneId).label,'Lower wall zone','First visible tile receives the label');
    assert.match(actual.find(n=>n.id===lower.zoneId).mask,/data:image\/svg/);
    const before=await snapshot(gm),writes=[];
    gm.on('request',r=>{if(r.method()!=='GET'&&r.url().includes('/api/v2/commands.php'))writes.push(r.url());});
    await gm.locator('[data-settings-launch="scenes"]').click();
    const panel=gm.locator('[data-player-preview]');await panel.locator('summary').click();
    await panel.locator('[data-preview-status]').filter({hasText:'captured'}).waitFor();
    await panel.locator('select').selectOption('sharon');await panel.locator('[data-preview-details]').filter({hasText:'Test balcony'}).waitFor();
    await panel.getByRole('button',{name:'View map and fog'}).click();
    const dialog=gm.locator('.vtt-player-preview-dialog');await dialog.locator('[data-preview-zone-id]').first().waitFor();
    assert.deepEqual(await dialog.locator('[data-preview-zone-id]').evaluateAll(describe),actual);
    assert.equal(await dialog.locator('[data-zone-end],[data-zone-id],[data-caster-id]').count(),0);
    await dialog.screenshot({path:'.playwright-mcp/player-zone-preview.png'});
    await dialog.getByRole('button',{name:'Close preview'}).click();
    await pc.reload();await pc.waitForFunction(()=>document.querySelector('[data-connection-status]')?.textContent.includes('Connected'));
    assert.deepEqual(await pc.locator('.vtt-persistent-zones > .vtt-persistent-zone').evaluateAll(describe),actual);
    assert.deepEqual(await snapshot(gm),before);assert.deepEqual(writes,[]);
    const zoneNode=pc.locator(`[data-zone-id="${zone.id}"]`);
    await zoneNode.locator('.vtt-persistent-zone__badge').hover();
    await zoneNode.locator('[data-zone-end]').click();
    await pc.waitForFunction(async({sceneId,id})=>{
      const s=(await(await fetch('/dnd/vtt/api/v2/snapshot.php')).json()).snapshot;
      return !s.state.placements[sceneId]['floor-cal'].persistentZones?.some(z=>z.id===id);
    },{sceneId,id:zone.id});
    assert.deepEqual(errors,[]);
    console.log('PASS: zone floor persistence, player clipping, first visible wall label, preview parity without End hooks, reload and canonical no-write checks.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
