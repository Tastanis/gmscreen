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

    await command('combat.start',{encounterId:'zone-tick-failure',startingTeam:'ally'});
    const registered=await page.evaluate(()=>new Promise((resolve,reject)=>document.dispatchEvent(new CustomEvent('vtt:automation-register-persistent-zone',{detail:{resolve,reject,payload:{
      casterId:'floor-cal',abilityName:'Final tick failure',expiresAt:'endOfTurn',tickAt:'endOfTurn',
      effects:[{kind:'damage',amount:1},{kind:'condition',name:'Dazed',duration:'saveEnds'}],
      area:{template:{column:2,row:0,width:1,height:1,levelId:'level-0'}},
    }}}))));
    await command('turn.start',{combatantId:'floor-cal'});
    const beforeHp=Number((await tokenState()).hp.current);
    await page.route(origin+'/dnd/vtt/api/v2/commands.php',route=>route.request().postData()?.toLowerCase().includes('dazed')
      ?route.fulfill({status:422,contentType:'application/json',body:JSON.stringify({success:false,error:'Injected final tick condition failure'})}):route.continue());
    await command('turn.complete',{combatantId:'floor-cal'});
    await until(async()=>Number((await tokenState()).hp.current)===beforeHp-1);
    await page.waitForFunction(()=>document.body.textContent.includes('Zone turn processing needs review: Injected final tick condition failure'));
    assert.ok((await tokenState()).persistentZones.some(zone=>zone.id===registered.zoneId),'Failed final tick must not expire its zone');
    const sheet=await(await page.request.get(origin+'/dnd/character_sheet/handler.php?action=sync-stamina&character=cal')).json();
    assert.equal(Number(sheet.currentStamina),beforeHp-1);
    await page.unroute(origin+'/dnd/vtt/api/v2/commands.php');
    await page.reload();await page.waitForFunction(()=>document.querySelector('[data-connection-status]')?.textContent.includes('Connected'));
    await new Promise(resolve=>setTimeout(resolve,600));
    assert.equal(Number((await tokenState()).hp.current),beforeHp-1,'Reload must not replay the already claimed turn boundary');
    assert.ok((await tokenState()).persistentZones.some(zone=>zone.id===registered.zoneId));
    assert.deepEqual(errors,[]);
    console.log('PASS: failed final condition stops zone expiration, confirmed damage survives reload without replay.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
