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
        document.dispatchEvent(new CustomEvent('vtt:automation-register-persistent-zone',{detail:{
          payload:{casterId:'floor-cal',abilityName:'Registration acknowledgment',triggers:['onEnter'],tickAt:'never',effects:[{kind:'damage',amount:1}],
            area:{template:{column:5,row:0,width:1,height:1,levelId:'level-0'}}},
          resolve:result=>{window.registration={status:'resolved',result};},
          reject:error=>{window.registration={status:'rejected',error:error.message};},
        }}));
      });
    }
    const initial=(await tokenState()).persistentZones?.length || 0;
    await register();await until(async()=>Boolean(held));
    assert.equal(await page.evaluate(()=>window.registration.status),'pending');
    assert.equal((await tokenState()).persistentZones?.length || 0,initial);
    await held.continue();await page.waitForFunction(()=>window.registration.status==='resolved');
    assert.equal(await page.evaluate(()=>window.registration.result.registered),true);
    assert.equal((await tokenState()).persistentZones.length,initial+1);
    held=null;
    await register();await until(async()=>Boolean(held));
    const current=await snapshot(),token=current.state.placements[sceneId]['floor-cal'];
    const concurrent={...token.persistentZones[0],id:'other-gm-zone',abilityName:'Other GM zone'};
    const other=await page.request.post(commandUrl,{data:{
      type:'placement.batch',operationId:require('node:crypto').randomUUID(),baseRevision:current.revision,
      payload:{actions:[{kind:'patch',sceneId,placementId:'floor-cal',entityRevision:token._entityRevision,
        patch:{persistentZones:[...token.persistentZones,concurrent]}}]},
    }});
    assert.equal(other.status(),200,await other.text());
    const writes=[];
    page.on('request',request=>{if(request.url()===commandUrl&&request.method()==='POST')writes.push(request);});
    await held.continue();await page.waitForFunction(()=>window.registration.status==='rejected');
    assert.match(await page.evaluate(()=>window.registration.error),/same fields/);
    assert.equal(writes.length,0,'Do not submit a blind retry over the concurrent zone list');
    assert.deepEqual((await tokenState()).persistentZones.map(zone=>zone.id),[token.persistentZones[0].id,'other-gm-zone']);
    await page.unroute(commandUrl);
    await page.reload();await page.waitForFunction(()=>document.querySelector('[data-connection-status]')?.textContent.includes('Connected'));
    assert.deepEqual((await tokenState()).persistentZones.map(zone=>zone.id),[token.persistentZones[0].id,'other-gm-zone']);
    assert.deepEqual(errors,[]);
    console.log('PASS: a conflicting registration preserves the other GM zone, rejects without retry and survives reload.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
