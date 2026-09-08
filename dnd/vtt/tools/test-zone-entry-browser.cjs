const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const origin='http://127.0.0.1:8129';
(async()=>{
  const manifest=await fetch(origin+'/diagnostic-manifest.json').then(r=>r.json());
  assert.equal(manifest.test_fixture,'floor-regression');
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const errors=[],pages=[];
    for(const user of ['GM','cal']) {
      const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>errors.push(e.message));
      await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
      await page.goto(origin+'/test-login.php?user='+user);
      await page.waitForFunction(()=>document.querySelector('[data-connection-status]')?.textContent.includes('Connected'));
      pages.push(page);
    }
    const [gm,pc]=pages,sceneId=manifest.test_scene_id;
    async function waitUntil(predicate) {
      const deadline=Date.now()+12000;
      while(!await predicate()) {if(Date.now()>deadline)throw Error('Timed out waiting for canonical zone outcome');await new Promise(resolve=>setTimeout(resolve,100));}
    }
    const snapshot=async()=>(await(await gm.request.get(origin+'/dnd/vtt/api/v2/snapshot.php')).json()).snapshot;
    const zone=await gm.evaluate(()=>new Promise(resolve=>document.dispatchEvent(new CustomEvent('vtt:automation-register-persistent-zone',{detail:{resolve,payload:{
      casterId:'floor-cal',abilityName:'Entry regression',triggers:['onEnter'],tickAt:'never',effects:[{kind:'damage',amount:3}],
      area:{template:{column:5,row:0,width:1,height:1,levelId:'level-0'}},
    }}}))));
    assert.equal(zone.registered,true);await pc.locator(`[data-zone-id="${zone.zoneId}"]`).waitFor();
    const before=Number((await snapshot()).state.placements[sceneId]['floor-cal'].hp.current);
    const movementIds=[];pc.on('request',r=>{if(r.url().endsWith('/commands.php')&&r.method()==='POST'){
      const body=r.postDataJSON();if(body.type==='token.move')movementIds.push(body.operationId);
    }});
    const token=pc.locator('#vtt-token-layer [data-placement-id="floor-cal"]');
    async function drag(dx,column) {
      await token.hover();const box=await token.boundingBox();assert.ok(box);
      await pc.mouse.move(box.x+box.width/2,box.y+box.height/2);await pc.mouse.down();
      await pc.mouse.move(box.x+box.width/2+dx*box.width,box.y+box.height/2,{steps:30});await pc.mouse.up();
      await pc.waitForFunction(async({sceneId,column})=>{
        const s=(await(await fetch('/dnd/vtt/api/v2/snapshot.php')).json()).snapshot;
        return s.state.placements[sceneId]['floor-cal'].column===column;
      },{sceneId,column});
    }
    await drag(6,8);
    await pc.waitForFunction(async({sceneId,current})=>{
      const s=(await(await fetch('/dnd/vtt/api/v2/snapshot.php')).json()).snapshot;
      return Number(s.state.placements[sceneId]['floor-cal'].hp.current)===current;
    },{sceneId,current:before-3});
    const claimUrl=origin+'/dnd/vtt/api/v2/zone-entries.php';
    const claimData={sceneId,placementId:'floor-cal',zoneId:zone.zoneId,movementOperationId:movementIds.at(-1)};
    assert.equal((await pc.request.delete(claimUrl)).status(),405);
    await waitUntil(async()=>!(await(await pc.request.get(claimUrl)).json()).claims.length);
    assert.equal((await gm.request.post(claimUrl,{data:claimData})).status(),422,'Another actor cannot claim the player movement');
    const reserved=await pc.request.post(claimUrl,{data:claimData});assert.equal(reserved.status(),200);
    const firstClaim=await reserved.json();assert.equal(firstClaim.claimed,false);assert.equal(firstClaim.status,'completed');
    const duplicate=await(await pc.request.post(claimUrl,{data:claimData})).json();
    assert.equal(duplicate.claimed,false);assert.equal(duplicate.claimId,firstClaim.claimId);
    await pc.reload();
    await pc.waitForFunction(()=>document.querySelector('[data-connection-status]')?.textContent.includes('Connected'));
    await drag(-6,2);await pc.waitForTimeout(700);
    assert.equal(Number((await snapshot()).state.placements[sceneId]['floor-cal'].hp.current),before-3,'Reload must not allow the completed entry to execute again');
    const partial=await gm.evaluate(()=>new Promise(resolve=>document.dispatchEvent(new CustomEvent('vtt:automation-register-persistent-zone',{detail:{resolve,payload:{
      casterId:'floor-cal',abilityName:'Partial entry regression',triggers:['onEnter'],tickAt:'never',
      effects:[{kind:'damage',amount:2},{kind:'condition',name:'Dazed',duration:'saveEnds'}],
      area:{template:{column:5,row:0,width:1,height:1,levelId:'level-0'}},
    }}}))));
    await pc.locator(`[data-zone-id="${partial.zoneId}"]`).waitFor();
    const commandUrl=origin+'/dnd/vtt/api/v2/commands.php';
    await pc.route(commandUrl,route=>route.request().postData()?.toLowerCase().includes('dazed')
      ?route.fulfill({status:422,contentType:'application/json',body:JSON.stringify({success:false,error:'Injected condition rejection'})}):route.continue());
    await drag(6,8);
    await waitUntil(async()=> (await(await pc.request.get(claimUrl)).json()).claims.some(c=>c.status==='needs_review'));
    await pc.unroute(commandUrl);
    const claimBefore=await snapshot();
    assert.equal(Number(claimBefore.state.placements[sceneId]['floor-cal'].hp.current),before-5);
    assert.equal((claimBefore.state.placements[sceneId]['floor-cal'].conditions ?? []).some(c=>c.name==='Dazed'),false);
    const pending=(await(await pc.request.get(claimUrl)).json()).claims;
    const claim=pending[0];
    assert.equal(pending.length,1);assert.equal(pending[0].claimId,claim.claimId);
    assert.equal((await(await gm.request.get(claimUrl)).json()).claims.length,1);
    const finish={action:'finish',claimId:claim.claimId,status:'needs_review',reason:'Condition save unconfirmed after damage'};
    assert.equal((await pc.request.post(claimUrl,{data:{...finish,status:'dismissed'}})).status(),422);
    const reviewed=await(await pc.request.post(claimUrl,{data:finish})).json();
    assert.equal(reviewed.status,'needs_review',JSON.stringify(reviewed));
    assert.equal((await(await pc.request.get(claimUrl)).json()).claims[0].status,'needs_review');
    await gm.reload();
    await gm.waitForFunction(()=>document.querySelector('[data-connection-status]')?.textContent.includes('Connected'));
    await gm.locator('[data-settings-launch="scenes"]').click();
    const recovery=gm.locator('[data-zone-entry-recovery]');
    await recovery.locator('summary').first().click();
    const row=recovery.locator(`[data-zone-claim-id="${claim.claimId}"]`);
    await row.waitFor();
    assert.match(await row.innerText(),/Partial entry regression/);
    assert.match(await row.innerText(),/Needs review/);
    assert.ok(claim.outcome.reason.length>0);
    assert.ok((await row.locator('[data-zone-review-reason]').innerText()).includes(claim.outcome.reason),'First failure report survives retry and GM reload');
    assert.notEqual(claim.outcome.reason,finish.reason);
    await row.locator('summary').click();
    assert.match(await row.locator('pre').innerText(),/"kind": "damage"/);
    await row.getByRole('button',{name:'Mark resolved',exact:true}).click();
    await gm.waitForFunction(()=>document.querySelector('[data-zone-recovery-status]')?.textContent==='No unresolved zone entries.');
    assert.equal(await pc.locator('[data-zone-entry-recovery]').count(),0,'Recovery controls are GM-only');
    const completed={...finish,status:'completed'};
    assert.equal((await(await pc.request.post(claimUrl,{data:completed})).json()).status,'completed');
    assert.equal((await(await pc.request.post(claimUrl,{data:completed})).json()).idempotent,true);
    assert.equal((await gm.request.post(claimUrl,{data:finish})).status(),422);
    assert.deepEqual((await(await gm.request.get(claimUrl)).json()).claims,[]);
    assert.deepEqual(await snapshot(),claimBefore,'Claim reservations do not apply effects or change board state');
    await pc.reload();
    await pc.waitForFunction(()=>document.querySelector('[data-connection-status]')?.textContent.includes('Connected'));
    await drag(-6,2);await pc.waitForTimeout(700);
    assert.equal(Number((await snapshot()).state.placements[sceneId]['floor-cal'].hp.current),before-5,'Reviewed partial effects must not replay after reload');
    assert.deepEqual(errors,[]);
    console.log('PASS: real zone crossing applies one damage tick; claim recovery, review, completion, retry and immutable final outcomes preserve board state.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
