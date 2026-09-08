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
      const page=await browser.newPage({viewport:{width:1280,height:720}});
      page.on('pageerror',error=>errors.push(error.message));
      await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
      await page.goto(origin+'/test-login.php?user='+user);
      await page.waitForFunction(()=>document.querySelector('[data-connection-status]')?.textContent.includes('Connected'));
      pages.push(page);
    }
    const [gm,pc]=pages,sceneId=manifest.test_scene_id;
    const snapshot=async()=>(await(await gm.request.get(origin+'/dnd/vtt/api/v2/snapshot.php')).json()).snapshot;
    let seq=0;
    async function command(type,payload) {
      const s=await snapshot();const response=await gm.request.post(origin+'/dnd/vtt/api/v2/commands.php',{data:{
        type,payload,sceneId,baseRevision:s.revision,entityRevision:s.state.sceneConfig[sceneId]._revision,
        operationId:'preview-token-'+Date.now()+'-'+ ++seq,
      }});assert.equal(response.status(),200,await response.text());
    }
    const imageUrl=(await snapshot()).state.placements[sceneId]['floor-cal'].imageUrl;
    const seeds=[
      {id:'preview-open',column:6,row:5,levelId:'level-0'},
      {id:'preview-blocked',column:0,row:5,levelId:'level-0'},
      {id:'preview-upper',column:8.5,row:5,width:2,levelId:'test-upper'},
      {id:'preview-secret',column:8,row:5,levelId:'test-upper',hidden:true},
      {id:'preview-fogged',column:9,row:8,levelId:'test-upper'},
    ];
    await command('placement.batch',{actions:seeds.map(seed=>({kind:'add',sceneId,placementId:seed.id,placement:{
      imageUrl,name:seed.id,team:'enemy',width:1,height:1,...seed,
    }}))});
    await command('fog.set',{fogOfWar:{byLevel:{'test-upper':{enabled:true,revealedCells:{'6,5':true,'8,5':true}}}}});
    await command('level.user.set',{userId:'sharon',entry:{levelId:'test-upper',source:'manual',followToken:false}});
    await pc.waitForFunction(()=>document.querySelector('[data-map-level-indicator-value]')?.textContent==='Test balcony');
    await pc.locator('#vtt-token-layer [data-placement-id="preview-open"]').waitFor();
    const before=await snapshot(),writes=[];
    gm.on('request',request=>{if(request.method()!=='GET' && request.url().includes('/api/v2/commands.php'))writes.push(request.url());});
    await gm.locator('[data-settings-launch="scenes"]').click();
    const panel=gm.locator('[data-player-preview]');await panel.locator('summary').click();
    await panel.locator('[data-preview-status]').filter({hasText:'captured'}).waitFor();
    await panel.locator('select').selectOption('sharon');
    await panel.locator('[data-preview-details]').filter({hasText:'Test balcony'}).waitFor();
    await panel.getByRole('button',{name:'View map and fog'}).click();
    const dialog=gm.locator('.vtt-player-preview-dialog');
    await dialog.locator('[data-preview-placement-id="preview-open"]').waitFor();
    const describe=nodes=>nodes.map(n=>({id:n.dataset.previewPlacementId||n.dataset.placementId,
      width:n.style.width,height:n.style.height,transform:n.style.transform,zIndex:n.style.zIndex,
      level:n.dataset.mapLevelId,direction:n.dataset.mapLevelDirection||null,distance:n.dataset.mapLevelDistance||null,
      image:n.querySelector('img')?.src||null})).sort((a,b)=>a.id.localeCompare(b.id));
    const real=await pc.locator('#vtt-token-layer > .vtt-token').evaluateAll(describe);
    const preview=await dialog.locator('.vtt-token').evaluateAll(describe);
    assert.deepEqual(preview,real);
    assert.deepEqual(preview.map(t=>t.id),['preview-open','preview-upper']);
    assert.match(preview.find(t=>t.id==='preview-upper').transform,/832px/,'8.5 cells plus 288px padding must remain fractional');
    assert.equal(await dialog.locator('[data-placement-id]').count(),0);
    assert.equal(await dialog.locator('.vtt-player-preview-map').evaluate(node=>node.inert),true);
    await dialog.screenshot({path:'.playwright-mcp/player-token-preview.png'});
    await dialog.getByRole('button',{name:'Close preview'}).click();
    await pc.reload();
    await pc.waitForFunction(()=>document.querySelector('[data-connection-status]')?.textContent.includes('Connected'));
    assert.deepEqual(await pc.locator('#vtt-token-layer > .vtt-token').evaluateAll(describe),real,'Reload keeps the same canonical geometry');
    assert.deepEqual(await snapshot(),before);assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
    console.log('PASS: player preview matches live token IDs, fractional geometry, images, stack order and floor badges; hidden/fogged/blocked tokens absent; no writes.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
