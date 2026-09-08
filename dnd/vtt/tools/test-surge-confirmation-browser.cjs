const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const origin='http://127.0.0.1:8129';
(async()=>{
  const manifest=await fetch(origin+'/diagnostic-manifest.json').then(r=>r.json());assert.equal(manifest.test_fixture,'floor-regression');
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    await page.goto(origin+'/test-login.php?user=GM');
    await page.waitForFunction(()=>document.querySelector('[data-connection-status]')?.textContent.includes('Connected'));
    const sceneId=manifest.test_scene_id;
    const snapshot=async()=>(await(await page.request.get(origin+'/dnd/vtt/api/v2/snapshot.php')).json()).snapshot;
    const tokenState=async()=>(await snapshot()).state.placements[sceneId]['floor-cal'];
    async function until(check){const end=Date.now()+15000;while(!await check()){if(Date.now()>end)throw Error('Timed out waiting for forced zone outcome');await new Promise(resolve=>setTimeout(resolve,100));}}


    const sheetUrl=origin+'/dnd/character_sheet/handler.php';
    const surges=async()=>Number((await(await page.request.get(sheetUrl+'?action=summary&character=cal')).json()).data.hero.surges || 0);
    const before=await surges();
    async function grant(){await page.evaluate(()=>{
      window.surgeAck={status:'pending'};
      document.dispatchEvent(new CustomEvent('vtt:automation-apply-surge',{detail:{payload:{placementId:'floor-cal',amount:1},
        resolve:result=>{window.surgeAck={status:'resolved',result};},reject:error=>{window.surgeAck={status:'rejected',error:error.message};},
      }}));
    });}
    await grant();await page.waitForFunction(()=>window.surgeAck.status==='resolved');
    assert.equal(await page.evaluate(()=>window.surgeAck.result.applied),1);
    assert.equal(await surges(),before+1);
    for(const mode of ['rejected','malformed','stalled']) {
      let writes=0,held=null;
      await page.route(sheetUrl,route=>{
        if(!route.request().postData()?.includes('action=sync-surges'))return route.continue();
        writes++;
        if(mode==='stalled'){held=route;return;}
        return route.fulfill({status:200,contentType:'application/json',body:mode==='rejected'?JSON.stringify({success:false,error:'Injected surge failure'}):'null'});
      });
      await grant();await page.waitForFunction(()=>window.surgeAck.status==='rejected');
      assert.equal(writes,1);assert.equal(await surges(),before+1);
      if(held)await held.abort().catch(()=>{});
      await page.unroute(sheetUrl);
    }
    assert.deepEqual(errors,[]);
    console.log('PASS: surge grants require confirmed saved counts; rejected, malformed and stalled responses reject without retry.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
