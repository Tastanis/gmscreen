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

    const commandUrl=origin+'/dnd/vtt/api/v2/commands.php';
    let held=null;
    await page.route(commandUrl,route=>{held=route;});
    async function register() {
      await page.evaluate(()=>{
        window.registration={status:'pending'};
        document.dispatchEvent(new CustomEvent('vtt:automation-set-aura',{detail:{
          payload:{placementId:'floor-cal',radius:3,automation:{abilityId:'aura-save-test',abilityName:'Aura acknowledgment',affects:'enemy',triggers:[{event:'turnStart',whose:'self'}],effects:[{kind:'damage',amount:1}]}},
          resolve:result=>{window.registration={status:'resolved',result};},
          reject:error=>{window.registration={status:'rejected',error:error.message};},
        }}));
      });
    }
    const initial=(await tokenState()).automationAuras?.length || 0;
    await register();await until(async()=>Boolean(held));
    assert.equal(await page.evaluate(()=>window.registration.status),'pending');
    assert.equal((await tokenState()).automationAuras?.length || 0,initial);
    await held.continue();await page.waitForFunction(()=>window.registration.status==='resolved');
    assert.equal(await page.evaluate(()=>window.registration.result.applied),true);
    assert.equal((await tokenState()).automationAuras.length,initial+1);
    await page.unroute(commandUrl);
    await page.route(commandUrl,route=>route.fulfill({status:422,contentType:'application/json',body:JSON.stringify({success:false,error:'Injected aura registration failure'})}));
    await register();await page.waitForFunction(()=>window.registration.status==='rejected');
    assert.equal((await tokenState()).automationAuras.length,initial+1);
    await page.unroute(commandUrl);
    await page.reload();await page.waitForFunction(()=>document.querySelector('[data-connection-status]')?.textContent.includes('Connected'));
    assert.equal((await tokenState()).automationAuras.length,initial+1);
    assert.deepEqual(errors,[]);
    console.log('PASS: aura registration waits for canonical save, rejects failed persistence and survives reload.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
