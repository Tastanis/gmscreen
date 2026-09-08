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
        casterId:'floor-cal',abilityName:'Expiration '+expiresAt,expiresAt,tickAt:'startOfTurn',effects:[{kind:'damage',amount:1}],
        area:{template:{column:2,row:0,width:1,height:1,levelId:'level-0'}},
      }}}))),expiresAt);ids.push(result.zoneId);
    }
    const beforeHp=Number((await tokenState()).hp.current);
    let held=null;
    await page.route(origin+'/dnd/vtt/api/v2/commands.php',route=>{
      const data=route.request().postDataJSON();
      if(data.payload?.actions?.some(action=>Object.hasOwn(action.patch || {},'persistentZones'))) {held=route;return;}
      return route.continue();
    });
    const removals=[],responses=[];
    page.on('response',response=>{
      const request=response.request();
      if(!request.url().endsWith('/commands.php')||request.method()!=='POST')return;
      const data=request.postDataJSON();
      if(data.payload?.actions?.some(action=>Object.hasOwn(action.patch || {},'persistentZones'))) {
        responses.push({operationId:data.operationId,status:response.status()});
      }
    });
    page.on('request',request=>{
      if(!request.url().endsWith('/commands.php')||request.method()!=='POST')return;
      const data=request.postDataJSON();
      if(data.payload?.actions?.some(action=>Object.hasOwn(action.patch || {},'persistentZones')))removals.push(data);
    });
    await command('turn.start',{combatantId:'floor-cal',team:'ally'});
    await until(async()=>Boolean(held));
    await new Promise(resolve=>setTimeout(resolve,350));
    assert.equal(Number((await tokenState()).hp.current),beforeHp,'Tick damage cannot overtake expiration acknowledgment');
    await page.unroute(origin+'/dnd/vtt/api/v2/commands.php');
    await held.continue();
    await until(async()=>((await tokenState()).persistentZones || []).length===1);
    await until(async()=>Number((await tokenState()).hp.current)===beforeHp-1);
    assert.deepEqual((await tokenState()).persistentZones.map(zone=>zone.id),[ids[2]]);
    assert.ok(removals.length>0);
    for(const removal of removals) {
      const actions=removal.payload.actions.filter(action=>Object.hasOwn(action.patch || {},'persistentZones'));
      assert.equal(actions.length,1);
      assert.deepEqual(actions[0].patch.persistentZones.map(zone=>zone.id),[ids[2]],'Each expiration update removes both matching zones together');
    }
    await until(async()=>responses.length===removals.length);
    assert.equal(responses.filter(response=>response.status===200).length,1,'Only one expiration command is accepted');
    assert.ok(responses.every(response=>[200,409].includes(response.status)));
    assert.ok(responses.filter(response=>response.status===409).length<=1,'Only one confirmed conflict retry is allowed');
    console.log('Expiration HTTP outcomes:',responses.map(response=>response.status).join(', '));
    await page.reload();await page.waitForFunction(()=>document.querySelector('[data-connection-status]')?.textContent.includes('Connected'));
    assert.deepEqual((await tokenState()).persistentZones.map(zone=>zone.id),[ids[2]]);
    assert.deepEqual(errors,[]);
    console.log('PASS: start-of-turn ticks wait for expiration; only the retained zone deals damage.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
