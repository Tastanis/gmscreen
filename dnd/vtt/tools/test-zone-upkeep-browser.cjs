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


    async function command(type,payload={}) {
      const s=await snapshot();const response=await page.request.post(origin+'/dnd/vtt/api/v2/commands.php',{data:{type,payload,sceneId,operationId:require('node:crypto').randomUUID(),baseRevision:s.revision}});
      assert.equal(response.status(),200,await response.text());
    }


    await command('combat.start',{encounterId:'zone-upkeep',startingTeam:'ally'});
    const sheetUrl=origin+'/dnd/character_sheet/handler.php';
    const seed=await page.request.post(sheetUrl,{form:{action:'sync-resource',source:'vtt',character:'cal',value:'3'}});
    assert.equal((await seed.json()).success,true);
    const ids=[];
    for(let i=0;i<2;i++) {
      const result=await page.evaluate(()=>new Promise((resolve,reject)=>document.dispatchEvent(new CustomEvent('vtt:automation-register-persistent-zone',{detail:{resolve,reject,payload:{
        casterId:'floor-cal',abilityName:'Paid zone',expiresAt:'never',tickAt:'startOfTurn',upkeep:{cost:2},effects:[{kind:'damage',amount:1}],
        area:{template:{column:2,row:0,width:1,height:1,levelId:'level-0'}},
      }}}))));ids.push(result.zoneId);
    }
    const failed=process.env.VTT_TEST_FAIL_UPKEEP==='1',writes=[];
    await page.route(sheetUrl,route=>{
      const body=new URLSearchParams(route.request().postData() || '');
      if(body.has('spend')) {
        writes.push(Object.fromEntries(body));
        if(failed)return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:false,error:'Injected upkeep save failure'})});
      }
      return route.continue();
    });
    await new Promise(resolve=>setTimeout(resolve,1200));
    const seedAgain=await page.request.post(sheetUrl,{form:{action:'sync-resource',source:'vtt',character:'cal',value:'3'}});
    assert.equal((await seedAgain.json()).resource,3);
    const hp=Number((await tokenState()).hp.current);
    await command('turn.start',{combatantId:'floor-cal'});
    if(failed) {
      await page.waitForFunction(()=>document.body.textContent.includes('Zone turn processing needs review: Injected upkeep save failure'));
      assert.equal(Number((await tokenState()).hp.current),hp);
      assert.equal((await tokenState()).persistentZones.length,2);
      assert.equal(writes.length,1);
    } else {
      try {await until(async()=>((await tokenState()).persistentZones || []).length===1);}
      catch(error){console.error(JSON.stringify({writes,resource:(await(await page.request.get(sheetUrl+'?action=summary&character=cal')).json()).data?.hero?.resource?.value,zones:(await tokenState()).persistentZones}));throw error;}
      assert.deepEqual((await tokenState()).persistentZones.map(zone=>zone.id),[ids[0]]);
      assert.equal(Number((await tokenState()).hp.current),hp-1);
      assert.equal(writes.length,2);
    }
    for(const write of writes){assert.equal(write.character,'cal');assert.equal(write.action,'sync-resource');assert.equal(write.data,undefined);}
    const summary=await(await page.request.get(sheetUrl+'?action=summary&character=cal')).json();
    assert.equal(Number(summary.data.hero.resource.value),failed?3:1);
    await page.unroute(sheetUrl);
    await page.reload();await page.waitForFunction(()=>document.querySelector('[data-connection-status]')?.textContent.includes('Connected'));
    assert.equal(Number((await tokenState()).hp.current),failed?hp:hp-1);
    assert.deepEqual(errors,[]);
    console.log(`PASS: ${failed?'unconfirmed upkeep preserves zones without effects':'upkeep spends current resource once and ends only the unaffordable zone'}.`);
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
