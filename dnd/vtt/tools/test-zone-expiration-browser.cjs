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
    await command('combat.start',{encounterId:'zone-expiration',startingTeam:'ally'});
    const ids=[];
    for(const expiresAt of ['startOfTurn','startOfTurn','never']) {
      const result=await page.evaluate(expiresAt=>new Promise((resolve,reject)=>document.dispatchEvent(new CustomEvent('vtt:automation-register-persistent-zone',{detail:{resolve,reject,payload:{
        casterId:'floor-cal',abilityName:'Expiration '+expiresAt,expiresAt,tickAt:'never',effects:[],
        area:{template:{column:5,row:0,width:1,height:1,levelId:'level-0'}},
      }}}))),expiresAt);ids.push(result.zoneId);
    }
    const removals=[];
    page.on('request',request=>{
      if(!request.url().endsWith('/commands.php')||request.method()!=='POST')return;
      const data=request.postDataJSON();
      if(data.payload?.actions?.some(action=>Object.hasOwn(action.patch || {},'persistentZones')))removals.push(data);
    });
    await command('turn.start',{combatantId:'floor-cal',team:'ally'});
    await until(async()=>((await tokenState()).persistentZones || []).length===1);
    assert.deepEqual((await tokenState()).persistentZones.map(zone=>zone.id),[ids[2]]);
    assert.ok(removals.length>0);
    for(const removal of removals) {
      const actions=removal.payload.actions.filter(action=>Object.hasOwn(action.patch || {},'persistentZones'));
      assert.equal(actions.length,1);
      assert.deepEqual(actions[0].patch.persistentZones.map(zone=>zone.id),[ids[2]],'Each expiration update removes both matching zones together');
    }
    console.log('Expiration transport requests:',removals.length);
    await page.reload();await page.waitForFunction(()=>document.querySelector('[data-connection-status]')?.textContent.includes('Connected'));
    assert.deepEqual((await tokenState()).persistentZones.map(zone=>zone.id),[ids[2]]);
    assert.deepEqual(errors,[]);
    console.log('PASS: two matching zones expire together per update, unrelated zone survives and reload preserves the result.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
