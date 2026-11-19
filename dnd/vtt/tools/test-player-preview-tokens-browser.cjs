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
    async function command(type,payload,entityId=null) {
      const s=await snapshot();const response=await gm.request.post(origin+'/dnd/vtt/api/v2/commands.php',{data:{
        type,payload,sceneId,entityId,baseRevision:s.revision,entityRevision:entityId ? (s.state.drawings?.[sceneId]?.[entityId]?._entityRevision ?? 0) : s.state.sceneConfig[sceneId]._revision,
        operationId:'preview-token-'+Date.now()+'-'+ ++seq,
      }});assert.equal(response.status(),200,await response.text());
    }
    const imageUrl=(await snapshot()).state.placements[sceneId]['floor-cal'].imageUrl;
    const seeds=[
      {id:'preview-open',column:6,row:5,levelId:'level-0',showHp:true,hp:{current:-5,max:20},marks:{judgment:{sourceId:'floor-cal',sourceName:'Cal'}},conditions:['Prone','Prone']},
      {id:'preview-blocked',column:0,row:5,levelId:'level-0'},
      {id:'preview-upper',column:8.5,row:5,width:2,levelId:'test-upper',team:'ally',showHp:true,hp:{current:25,max:20},hasReadyTrigger:true,
        conditions:[{name:'Slowed',duration:'eot'},{name:'HiddenEffect',label:'Test effect',hidden:true}]},
      {id:'preview-secret',column:8,row:5,levelId:'test-upper',hidden:true},
      {id:'preview-fogged',column:9,row:8,levelId:'test-upper'},
    ];
    await command('placement.batch',{actions:seeds.map(seed=>({kind:'add',sceneId,placementId:seed.id,placement:{
      imageUrl,name:seed.id,team:'enemy',width:1,height:1,aura:{enabled:true,radius:2,color:'#11aa33'},...seed,
      automationAuras:[{id:'test-aura',radius:1,color:'#bb3377',automation:{abilityName:'Test aura'}},
        {id:'disabled-aura',enabled:false,radius:4,automation:{abilityName:'Disabled'}}],
    }}))});
    await command('combat.patch',{patch:{groups:[
      {representativeId:'preview-secret',memberIds:['preview-secret','preview-open','preview-upper']},
    ]}});
    const floorState=(await snapshot()).state.sceneConfig[sceneId].mapLevels;
    floorState.levels.find(level=>level.id==='test-upper').cutouts.push({column:1.25,row:2.5,width:1.5,height:1.25});
    await command('levels.set',{mapLevels:floorState});
    await command('fog.set',{fogOfWar:{byLevel:{'test-upper':{enabled:true,revealedCells:{'6,5':true,'8,5':true}}}}});
    await command('level.user.set',{userId:'sharon',entry:{levelId:'test-upper',source:'manual',followToken:false}});
    for(const [id,levelId] of [['preview-upper-line','test-upper'],['preview-base-line','level-0']]) {
      await command('drawing.upsert',{drawing:{id,levelId,color:'#4466ff',strokeWidth:4,
        points:[{x:650.5,y:600},{x:710,y:625.25},{x:780,y:610}]}},id);
    }
    await pc.waitForFunction(()=>document.querySelector('[data-map-level-indicator-value]')?.textContent==='Test balcony');
    await pc.locator('#vtt-token-layer [data-placement-id="preview-open"]').waitFor();
    const before=await snapshot(),writes=[];
    gm.on('request',request=>{if(request.method()!=='GET' && request.url().includes('/api/v2/commands.php'))writes.push(request.url());});
    await gm.locator('[data-settings-launch="scenes"]').click();
    const panel=gm.locator('[data-player-preview]');await panel.locator('summary').click();
    await panel.locator('[data-preview-status]').filter({hasText:'captured'}).waitFor();
    await panel.locator('select').selectOption('sharon');
    await panel.locator('[data-preview-details]').filter({hasText:'Test balcony'}).waitFor();
    await panel.getByRole('button',{name:'Open player preview'}).click();
    const dialog=gm.locator('.vtt-player-preview-dialog');
    const stage=dialog.locator('iframe[title="Captured player board"]');
    const frame=dialog.frameLocator('iframe[title="Captured player board"]');
    await frame.locator('#vtt-board3d canvas').waitFor();
    const captured = await (await stage.elementHandle()).contentFrame();
    await captured.waitForFunction(()=>window.vtt3dLayers?.auras && window.vtt3dLayers?.drawings);
    const describe=()=>window.vtt3dBridge.getContext().placements.filter(p=>!p.hidden)
      .map(p=>[p.id,p.column,p.row,p.width,p.height,p.levelId]).sort((a,b)=>a[0].localeCompare(b[0]));
    const real=await pc.evaluate(describe);
    assert.deepEqual(await captured.evaluate(describe),real);
    const counts=()=>({auras:window.vtt3dLayers.auras.summary().auras,strokes:window.vtt3dLayers.drawings.summary().strokes});
    assert.deepEqual(await captured.evaluate(counts),await pc.evaluate(counts));
    assert.equal(await stage.evaluate(node=>node.inert),true);
    assert.equal(await captured.evaluate(()=>window.vtt3dBridge.readOnly),true);
    const zoom=()=>stage.evaluate(node=>Number(node.style.transform.match(/scale\(([^)]+)/)[1]));
    const fitted=await zoom();
    await dialog.getByRole('button',{name:'Zoom in preview'}).click();
    assert.ok(Math.abs(await zoom()-fitted*1.5)<0.00001);
    await dialog.getByRole('button',{name:'Zoom out preview'}).click();
    assert.ok(Math.abs(await zoom()-fitted)<0.00001);
    await dialog.getByRole('button',{name:'Zoom in preview'}).click();
    await dialog.getByRole('button',{name:'Fit preview'}).click();
    assert.ok(Math.abs(await zoom()-fitted)<0.00001);
    await dialog.screenshot({path:'.playwright-mcp/player-token-preview.png'});
    await dialog.getByRole('button',{name:'Close preview'}).click();
    await pc.reload();
    await pc.waitForFunction(()=>document.querySelector('[data-connection-status]')?.textContent.includes('Connected'));
    assert.deepEqual(await pc.evaluate(describe),real);
    assert.deepEqual(await snapshot(),before);assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
    console.log('PASS: preview token geometry/visibility and drawing paths match the player board; local zoom/Fit and reload preserve canonical state; no preview writes.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
