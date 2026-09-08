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
    await dialog.locator('[data-preview-placement-id="preview-open"]').waitFor();
    for(const surface of [pc,dialog]) {
      const masks=await surface.locator('.vtt-board__map-level').evaluateAll(nodes=>nodes.map(n=>decodeURIComponent(n.style.maskImage||n.style.webkitMaskImage||'')));
      assert.ok(masks.some(mask=>mask.includes('M 80 160 H 176 V 240 H 80 Z')),'Actual player and preview preserve the fractional map hole');
    }
    const describe=nodes=>nodes.map(n=>({id:n.dataset.previewPlacementId||n.dataset.placementId,
      width:n.style.width,height:n.style.height,transform:n.style.transform,zIndex:n.style.zIndex,
      level:n.dataset.mapLevelId,direction:n.dataset.mapLevelDirection||null,distance:n.dataset.mapLevelDistance||null,
      groupColor:n.dataset.groupColor||null,
      hp:n.querySelector('.vtt-token__hp-bar')?.outerHTML||null,ready:n.querySelector('.vtt-token__trigger-ready')?.textContent||null,
      condition:n.querySelector('.vtt-token__condition')?.textContent||null,mark:n.querySelector('.vtt-token__judgment-mark')?.textContent||null,
      hiddenEffect:n.querySelector('.vtt-token__hidden-effect')?.textContent||null,
      image:n.querySelector('img')?.src||null})).sort((a,b)=>a.id.localeCompare(b.id));
    const real=await pc.locator('#vtt-token-layer > .vtt-token').evaluateAll(describe);
    const preview=await dialog.locator('.vtt-token').evaluateAll(describe);
    assert.deepEqual(preview,real);
    assert.deepEqual(preview.map(t=>t.id),['preview-open','preview-upper']);
    assert.deepEqual(preview.map(t=>t.groupColor),['1','1'],'Visible members share their projected group color even with a hidden representative');
    assert.equal(await dialog.locator('[data-preview-placement-id="preview-open"] .vtt-token__hp-value').count(),0,'Enemy numbers stay hidden in a GM preview');
    assert.equal(await dialog.locator('[data-preview-placement-id="preview-upper"] .vtt-token__hp-temp-value').textContent(),'(+5)');
    assert.equal(await dialog.locator('[data-preview-placement-id="preview-upper"] .vtt-token__trigger-ready').textContent(),'!');
    assert.equal(await dialog.locator('[data-token-trigger-ready]').count(),0,'Preview readiness has no clear-action hook');
    assert.equal(await dialog.locator('[data-preview-placement-id="preview-open"] .vtt-token__condition').textContent(),'Prone');
    assert.equal(await dialog.locator('[data-preview-placement-id="preview-open"] .vtt-token__judgment-mark').getAttribute('aria-label'),'Judged by Cal.');
    assert.equal(await dialog.locator('[data-token-judgment-mark],[data-token-hidden-effect]').count(),0,'Preview effects have no removal hooks');
    const describeAuras=nodes=>nodes.map(n=>({id:n.dataset.previewAuraPlacementId||n.dataset.placementId,
      aura:n.dataset.auraId,width:n.style.width,height:n.style.height,transform:n.style.transform,
      background:n.style.background,shadow:n.style.boxShadow,mask:n.style.maskImage})).sort((a,b)=>(a.id+a.aura).localeCompare(b.id+b.aura));
    const actualAuras=await pc.locator('#vtt-aura-layer .vtt-token-aura').evaluateAll(describeAuras);
    assert.deepEqual(await dialog.locator('.vtt-token-aura').evaluateAll(describeAuras),actualAuras);
    assert.equal(actualAuras.length,4,'Only visible unfogged owners have manual and enabled automation auras');
    assert.deepEqual([...new Set(actualAuras.map(a=>a.id))],['preview-open','preview-upper']);
    const lowerAura=actualAuras.find(a=>a.id==='preview-open'&&a.aura==='manual');
    assert.match(decodeURIComponent(lowerAura.mask),/<rect x="128" y="128" width="128" height="128" fill="white"\/>/,'Lower aura clips exactly to the 2 by 2 balcony opening');
    assert.equal(actualAuras.find(a=>a.id==='preview-upper'&&a.aura==='manual').mask,'','Same-floor aura stays unmasked');
    const auraRepaint=await gm.evaluate(async({sceneId})=>{
      const {renderTokenAuras}=await import('/dnd/vtt/assets/js/ui/token-aura-renderer.js');
      const {normalizeMapLevelsState}=await import('/dnd/vtt/assets/js/state/normalize/map-levels.js');
      const snapshot=(await(await fetch('/dnd/vtt/api/v2/snapshot.php')).json()).snapshot;
      const config=snapshot.state.sceneConfig[sceneId],layer=document.createElement('div');
      const inputs={placements:[snapshot.state.placements[sceneId]['preview-open']],layer,
        view:{mapLoaded:true,gridSize:64,gridOffsets:{left:288,top:288}},
        tokenLevelState:normalizeMapLevelsState(config.mapLevels,{sceneGrid:config.grid}),passive:true};
      renderTokenAuras({...inputs,auraViewerLevelId:'test-upper'});
      const node=layer.firstElementChild,masked=Boolean(node.style.maskImage);
      renderTokenAuras({...inputs,auraViewerLevelId:'level-0'});
      const cleared=node.style.maskImage===''&&node.style.webkitMaskImage==='';
      renderTokenAuras({...inputs,auraViewerLevelId:'test-upper'});
      renderTokenAuras({...inputs,auraViewerLevelId:'test-upper',gmViewing:true});
      return {masked,cleared,gmCleared:node.style.maskImage==='',reused:node===layer.firstElementChild};
    },{sceneId});
    assert.deepEqual(auraRepaint,{masked:true,cleared:true,gmCleared:true,reused:true});
    const repaint=await gm.evaluate(async()=>{
      const {syncTokenHitPoints}=await import('/dnd/vtt/assets/js/ui/token-hit-points.js');
      const token=document.createElement('div'),placement={team:'enemy',showHp:true,hp:{current:25,max:20}};
      syncTokenHitPoints(token,placement,{isGm:true});
      const gmNumbers=token.querySelectorAll('.vtt-token__hp-value,.vtt-token__hp-temp-value').length;
      syncTokenHitPoints(token,placement);
      const playerNumbers=token.querySelectorAll('.vtt-token__hp-value,.vtt-token__hp-temp-value').length;
      const fill=token.querySelector('.vtt-token__hp-temp-fill').style.width;
      syncTokenHitPoints(token,{...placement,showHp:false});
      return {gmNumbers,playerNumbers,fill,remaining:token.children.length};
    });
    assert.deepEqual(repaint,{gmNumbers:2,playerNumbers:0,fill:'25%',remaining:0},'Repainting removes stale GM numbers and disabled bars');
    assert.match(preview.find(t=>t.id==='preview-upper').transform,/832px/,'8.5 cells plus 288px padding must remain fractional');
    assert.equal(await dialog.locator('[data-placement-id]').count(),0);
    assert.equal(await dialog.locator('.vtt-player-preview-map').evaluate(node=>node.inert),true);
    await pc.locator('#vtt-drawing-layer [data-drawing-id="preview-upper-line"]').waitFor();
    const paths=nodes=>nodes.map(node=>({id:node.dataset.previewDrawingId||node.dataset.drawingId,
      d:node.getAttribute('d'),stroke:node.getAttribute('stroke'),width:node.getAttribute('stroke-width')}));
    const actualPaths=await pc.locator('#vtt-drawing-layer path[data-drawing-id]').evaluateAll(paths);
    assert.deepEqual(await dialog.locator('path[data-preview-drawing-id]').evaluateAll(paths),actualPaths);
    assert.deepEqual(actualPaths.map(path=>path.id),['preview-upper-line']);
    assert.equal(await dialog.locator('[data-drawing-id]').count(),0);
    const zoom=()=>dialog.locator('.vtt-player-preview-map').evaluate(node=>Number(node.style.transform.match(/scale\(([^)]+)\)/)[1]));
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
    assert.deepEqual(await pc.locator('#vtt-token-layer > .vtt-token').evaluateAll(describe),real,'Reload keeps the same canonical geometry');
    assert.deepEqual(await pc.locator('#vtt-aura-layer .vtt-token-aura').evaluateAll(describeAuras),actualAuras);
    assert.deepEqual(await snapshot(),before);assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
    console.log('PASS: preview token geometry/visibility and drawing paths match the player board; local zoom/Fit and reload preserve canonical state; no preview writes.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
