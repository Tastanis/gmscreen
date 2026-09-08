const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const origin='http://127.0.0.1:8129';
(async()=>{
  const manifest=await fetch(origin+'/diagnostic-manifest.json').then(r=>r.json());
  assert.equal(manifest.test_fixture,'floor-regression');
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const page=await browser.newPage();const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    await page.goto(origin+'/test-login.php?user=GM');
    await page.waitForFunction(()=>document.querySelector('[data-connection-status]')?.textContent.includes('Connected'));
    const snapshot=async()=>(await(await page.request.get(origin+'/dnd/vtt/api/v2/snapshot.php')).json()).snapshot;
    const conditions=async()=>((await snapshot()).state.placements[manifest.test_scene_id]['floor-cal'].conditions ?? []).map(c=>c.name);
    async function request(name) {
      await page.evaluate(name=>{
        window.conditionAck={status:'pending'};
        document.dispatchEvent(new CustomEvent('vtt:automation-apply-condition',{detail:{
          payload:{placementId:'floor-cal',condition:{name,duration:'save-ends'}},
          resolve:result=>{window.conditionAck={status:'resolved',result};},
          reject:error=>{window.conditionAck={status:'rejected',message:error.message};},
        }}));
      },name);
    }
    let release,intercepted;
    const seen=new Promise(resolve=>{intercepted=resolve;});
    const gate=new Promise(resolve=>{release=resolve;});
    const commandUrl=origin+'/dnd/vtt/api/v2/commands.php';
    await page.route(commandUrl,async route=>{intercepted();await gate;await route.continue();});
    await request('Slowed');await seen;
    assert.equal(await page.evaluate(()=>window.conditionAck.status),'pending','Callback must wait for server acceptance');
    assert.equal((await conditions()).includes('Slowed'),false,'Held request has not changed canonical conditions');
    release();await page.waitForFunction(()=>window.conditionAck.status!=='pending');
    assert.equal(await page.evaluate(()=>window.conditionAck.result.applied),true);
    assert.equal((await conditions()).includes('Slowed'),true);
    await page.unroute(commandUrl);
    await page.route(commandUrl,route=>route.fulfill({status:422,contentType:'application/json',body:JSON.stringify({success:false,error:'Injected condition rejection'})}));
    await request('Dazed');await page.waitForFunction(()=>window.conditionAck.status!=='pending');
    assert.equal(await page.evaluate(()=>window.conditionAck.status),'rejected');
    assert.equal((await conditions()).includes('Dazed'),false);
    await page.unroute(commandUrl);await page.reload();
    await page.waitForFunction(()=>document.querySelector('[data-connection-status]')?.textContent.includes('Connected'));
    assert.equal((await conditions()).includes('Slowed'),true);
    assert.equal((await conditions()).includes('Dazed'),false);
    assert.deepEqual(errors,[]);
    console.log('PASS: condition callbacks wait for canonical acceptance, reject failed saves, and retain only accepted conditions after reload.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
