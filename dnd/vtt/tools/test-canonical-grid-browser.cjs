const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const origin='http://127.0.0.1:8129';
(async()=>{
  const manifest=await fetch(origin+'/diagnostic-manifest.json').then(r=>r.json());
  assert.equal(manifest.test_fixture,'floor-regression');
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    const errors=[];
    async function client(user){
      const page=await browser.newPage({viewport:{width:1280,height:720}});page.setDefaultTimeout(15000);
      page.on('pageerror',e=>errors.push(e.message));
      await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
      await page.goto(origin+'/test-login.php?user='+user);
      await page.waitForFunction(()=>document.querySelector('[data-connection-status]')?.textContent.includes('Connected'));
      return page;
    }
    const gm=await client('GM'),cal=await client('cal'),sharon=await client('sharon');
    const snapshot=async()=>(await(await gm.request.get(origin+'/dnd/vtt/api/v2/snapshot.php')).json()).snapshot;
    const before=await snapshot();
    const catalog=(await(await gm.request.get(origin+'/dnd/vtt/api/scenes.php')).json()).data;
    const source=catalog.items.find(scene=>scene.id===manifest.test_scene_id);
    const other=catalog.items.find(scene=>scene.id!==source.id);
    assert.ok(other);const size=Number(source.grid.size)===73.5?81.5:73.5;
    const grid={...before.state.sceneConfig[source.id].grid,size,offsetX:3,offsetY:5};
    const response=await gm.request.post(origin+'/dnd/vtt/api/v2/commands.php',{data:{
      type:'grid.set',operationId:'grid-reopen-'+Date.now(),sceneId:source.id,baseRevision:before.revision,
      entityRevision:before.state.sceneConfig[source.id]._revision??0,payload:{grid},
    }});
    assert.equal(response.status(),200,await response.text());
    async function visibleGrid(page){
      await page.waitForFunction(size=>Math.abs(parseFloat(document.querySelector('#vtt-map-surface').style.getPropertyValue('--vtt-grid-size'))-size)<0.001,size);
    }
    for(const page of [gm,cal,sharon])await visibleGrid(page);
    const unchangedCatalog=(await(await gm.request.get(origin+'/dnd/vtt/api/scenes.php')).json()).data;
    assert.deepEqual(unchangedCatalog.items.find(scene=>scene.id===source.id).grid,source.grid,'Test must exercise a stale catalog grid.');
    for(const page of [gm,cal,sharon]){
      await page.reload();await page.waitForFunction(()=>document.querySelector('[data-connection-status]')?.textContent.includes('Connected'));await visibleGrid(page);
    }
    await gm.locator('[data-settings-launch="scenes"]').click();
    async function open(id){
      const button=gm.locator(`[data-action="activate-scene"][data-scene-id="${id}"]`);
      const group=gm.locator('.scene-group').filter({has:button});
      if((await group.getAttribute('class')).includes('is-collapsed'))await group.locator('[data-action="toggle-folder"]').click();
      await button.click();
      await gm.waitForFunction(async id=>(await(await fetch('/dnd/vtt/api/v2/snapshot.php')).json()).snapshot.state.routing.activeSceneId===id,id);
    }
    await open(other.id);await open(source.id);
    for(const page of [gm,cal,sharon])await visibleGrid(page);
    const after=await snapshot();assert.equal(after.state.sceneConfig[source.id].grid.size,size);
    const positions=s=>Object.values(s.state.placements[source.id]).map(p=>[p.id,p.column,p.row,p.levelId]);
    assert.deepEqual(positions(after),positions(before));assert.deepEqual(errors,[]);
    console.log('PASS: canonical grid reaches GM/two players, survives reload and GM scene reopening despite stale catalog metadata, and preserves token coordinates.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
