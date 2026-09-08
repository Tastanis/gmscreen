const {chromium}=require('playwright');const assert=require('node:assert/strict');
const origin='http://127.0.0.1:8129';
(async()=>{
  const manifest=await fetch(origin+'/diagnostic-manifest.json').then(r=>r.json());assert.equal(manifest.test_fixture,'floor-regression');
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    const errors=[];const pages=[];
    for(const user of ['GM','cal','sharon']){
      const page=await browser.newPage({viewport:{width:1280,height:720}});page.setDefaultTimeout(15000);
      page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
      await page.goto(origin+'/test-login.php?user='+user);await page.waitForFunction(()=>document.querySelector('[data-connection-status]')?.textContent.includes('Connected'));pages.push(page);
    }
    const [gm,pc]=pages,sceneId=manifest.test_scene_id;
    const snapshot=async()=>(await(await gm.request.get(origin+'/dnd/vtt/api/v2/snapshot.php')).json()).snapshot;
    let sequence=0;
    async function command(type,payload,entityId=null){
      const s=await snapshot();const domain=type.startsWith('drawing.')?'drawings':type.startsWith('template.')?'templates':'sceneConfig';
      const entityRevision=entityId?(s.state[domain]?.[sceneId]?.[entityId]?._entityRevision??0):(s.state.sceneConfig[sceneId]._revision??0);
      const response=await gm.request.post(origin+'/dnd/vtt/api/v2/commands.php',{data:{type,payload,entityId,sceneId,entityRevision,baseRevision:s.revision,operationId:'layout-browser-'+Date.now()+'-'+ ++sequence}});
      assert.equal(response.status(),200,await response.text());
    }
    await command('drawing.upsert',{drawing:{id:'layout-line',levelId:'level-0',points:[{x:10,y:10},{x:30,y:30}]}},'layout-line');
    await command('template.upsert',{template:{id:'layout-zone',type:'circle',levelId:'level-0',center:{column:4,row:4},radius:2}},'layout-zone');
    await gm.locator('[data-settings-launch="scenes"]').click();const root=gm.locator('[data-scene-checkpoints]');await root.locator('summary').click();
    await root.locator('[data-checkpoint-name]').fill('Restore layout browser');await root.getByRole('button',{name:'Save checkpoint',exact:true}).click();
    const row=root.locator('[data-checkpoint-id]').filter({hasText:'Restore layout browser'});await row.waitFor();
    const id=await row.getAttribute('data-checkpoint-id');
    const captured=(await(await gm.request.get(origin+'/dnd/vtt/api/v2/checkpoints.php?id='+id)).json()).checkpoint;
    assert.equal((await pc.request.get(origin+'/dnd/vtt/api/v2/checkpoints.php?id='+id+'&preview=layout')).status(),403);
    await command('level.delete',{levelId:'test-upper'});
    await command('grid.set',{grid:{...captured.data.domains.sceneConfig.grid,size:79}});
    await command('drawing.remove',{},'layout-line');await command('template.remove',{},'layout-zone');
    await command('levels.set',{mapLevels:{levels:[{id:'new-floor',name:'Newer floor'}]}});
    let s=await snapshot();await command('placement.batch',{actions:[
      {kind:'patch',sceneId,placementId:'floor-cal',entityRevision:s.state.placements[sceneId]['floor-cal']._entityRevision??0,patch:{column:6,row:2,conditions:['Prone']}},
      {kind:'add',sceneId,placementId:'layout-newer',placement:{id:'layout-newer',name:'Newer token',column:4,row:4,levelId:'new-floor',hp:31,imageUrl:s.state.placements[sceneId]['floor-cal'].imageUrl}},
    ]});
    async function preview(){await row.getByRole('button',{name:'Preview layout',exact:true}).click();await gm.waitForFunction(()=>document.querySelector('[data-checkpoint-status]')?.textContent.includes('No changes applied'));}
    async function restore(){await row.getByRole('button',{name:'Restore this layout',exact:true}).click();await gm.getByRole('alertdialog').getByRole('button',{name:'Restore layout',exact:true}).click();}
    await preview();assert.match(await row.locator('[data-checkpoint-preview]').textContent(),/newer token/);
    await command('grid.set',{grid:{...captured.data.domains.sceneConfig.grid,size:81}});
    await restore();await gm.waitForFunction(()=>document.querySelector('[data-checkpoint-status]')?.textContent.includes('board changed'));
    await preview();await gm.screenshot({path:'.playwright-mcp/checkpoint-layout-preview.png'});
    const before=await snapshot();
    for(const page of pages)await page.evaluate(()=>{window.layoutWalking=[];document.addEventListener('vtt:token-moved',e=>window.layoutWalking.push(e.detail));});
    await restore();await gm.waitForFunction(()=>document.querySelector('[data-checkpoint-status]')?.textContent.includes('Restored scene layout'));
    const after=await snapshot();assert.equal(after.revision,before.revision+1);
    assert.equal(after.state.placements[sceneId]['layout-newer'].levelId,'level-0');assert.equal(after.state.placements[sceneId]['layout-newer'].hp,31);
    assert.deepEqual(after.state.placements[sceneId]['floor-cal'].conditions,before.state.placements[sceneId]['floor-cal'].conditions);
    const size=captured.data.domains.sceneConfig.grid.size;
    for(const page of pages){
      await page.locator('[data-drawing-id="layout-line"]').waitFor();await page.locator('[data-template-id="layout-zone"]').first().waitFor();
      await page.waitForFunction(size=>parseFloat(document.querySelector('#vtt-map-surface').style.getPropertyValue('--vtt-grid-size'))===size,size);
      assert.deepEqual(await page.evaluate(()=>window.layoutWalking),[]);
      await page.reload();await page.locator('[data-template-id="layout-zone"]').first().waitFor();
      await page.waitForFunction(size=>parseFloat(document.querySelector('#vtt-map-surface').style.getPropertyValue('--vtt-grid-size'))===size,size);
    }
    assert.deepEqual(errors,[]);console.log('PASS: layout preview/confirmation, player denial, stale review rejection, one atomic restore, newer-token relocation/resource preservation, GM/two-player content and grid convergence, reload, no walking hooks.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
