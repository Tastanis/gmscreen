const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const origin='http://127.0.0.1:8129';
(async()=>{
  const manifest=await fetch(origin+'/diagnostic-manifest.json').then(r=>r.json());
  assert.equal(manifest.test_fixture,'floor-regression');
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const pages=[];
    for(const user of ['GM','cal']) {
      const page=await browser.newPage();
      await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
      await page.goto(origin+'/test-login.php?user='+user);
      await page.waitForFunction(()=>document.querySelector('[data-connection-status]')?.textContent.includes('Connected'));
      pages.push(page);
    }
    const gm=pages[0];
    const snapshot=async()=>(await(await gm.request.get(origin+'/dnd/vtt/api/v2/snapshot.php')).json()).snapshot;
    const before=await snapshot(),sceneId=manifest.test_scene_id;
    const response=await gm.request.post(origin+'/dnd/vtt/api/v2/commands.php',{data:{
      type:'fog.set',operationId:'fog-surface-'+Date.now(),sceneId,baseRevision:before.revision,
      entityRevision:before.state.sceneConfig[sceneId]._revision,
      payload:{fogOfWar:{byLevel:{'level-0':{enabled:true,revealedCells:{'0,0':true}}}}},
    }});
    assert.equal(response.status(),200,await response.text());
    for(const [index,page] of pages.entries()) {
      await page.waitForFunction(()=>{
        const c=document.getElementById('vtt-fog-layer');
        return c?.width>10 && c.getContext('2d').getImageData(c.width-1,c.height-1,1,1).data[3]>0;
      });
      const result=await page.evaluate(async gmViewing=>{
        const {getState}=await import('/dnd/vtt/assets/js/state/store.js');
        const {renderFogSurface}=await import('/dnd/vtt/assets/js/ui/fog-of-war.js');
        const state=getState(),live=document.getElementById('vtt-fog-layer');
        const grid=getComputedStyle(document.getElementById('vtt-grid-overlay'));
        const num=name=>parseFloat(grid.getPropertyValue(name))||0;
        const view={mapPixelSize:{width:live.width,height:live.height},gridSize:num('--vtt-grid-size'),gridOffsets:{
          left:num('--vtt-grid-offset-left')+num('--vtt-grid-origin-x'),top:num('--vtt-grid-offset-top')+num('--vtt-grid-origin-y'),
          right:num('--vtt-grid-offset-right'),bottom:num('--vtt-grid-offset-bottom'),
        }};
        const original=live.toDataURL();
        const copy=document.createElement('canvas');
        renderFogSurface({state,canvas:copy,view,sceneId:state.boardState.activeSceneId,gmViewing});
        const exact=copy.toDataURL()===original;
        renderFogSurface({state,canvas:copy,view,sceneId:state.boardState.activeSceneId,gmViewing:!gmViewing});
        return {exact,unchanged:live.toDataURL()===original,different:copy.toDataURL()!==original};
      },index===0);
      assert.deepEqual(result,{exact:true,unchanged:true,different:true});
    }
    console.log('PASS: passive fog canvas exactly matches real GM/player rendering and does not alter either live canvas.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
