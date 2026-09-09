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
    for(const [column,amount] of [[3,4],[5,3]]) {
      const zone=await page.evaluate(({column,amount})=>new Promise(resolve=>document.dispatchEvent(new CustomEvent('vtt:automation-register-persistent-zone',{detail:{resolve,payload:{
        casterId:'floor-cal',abilityName:`Forced zone ${column}`,triggers:['onEnter'],tickAt:'never',effects:[{kind:'damage',amount}],
        area:{template:{column,row:0,width:1,height:1,levelId:'level-0'}},
      }}}))),{column,amount});assert.equal(zone.registered,true);
    }
    assert.equal((await tokenState()).persistentZones.length,2,'Registration callbacks confirm both zones are canonical before movement');
    const initial=Number((await tokenState()).hp.current),writes=[];
    page.on('request',request=>{if(request.url().endsWith('/commands.php')&&request.method()==='POST')writes.push(request.postDataJSON());});
    async function move(kind,column,expected='resolved') {
      const token=page.locator('#vtt-token-layer [data-placement-id="floor-cal"]');await token.hover();const box=await token.boundingBox(),from=(await tokenState()).column;
      await page.evaluate(kind=>{
        window.moveAck={status:'pending'};
        document.dispatchEvent(new CustomEvent(kind==='teleport'?'vtt:automation-apply-teleport':'vtt:automation-force-move',{detail:{
          payload:{targetId:'floor-cal',sourcePlacement:{id:'floor-cal'},distance:10,verb:'slide'},
          resolve:result=>{window.moveAck={status:'resolved',result};},reject:error=>{window.moveAck={status:'rejected',error:error.message};},
        }}));
      },kind);
      await page.locator('[data-automation-move-ghost]').waitFor();
      await page.mouse.click(box.x+box.width/2+(column-from)*box.width,box.y+box.height/2);
      await page.waitForFunction(()=>window.moveAck.status!=='pending');
      assert.equal(await page.evaluate(()=>window.moveAck.status),expected);await until(async()=>(await tokenState()).column===column);
    }
    await move('teleport',8);await new Promise(resolve=>setTimeout(resolve,500));
    assert.equal(Number((await tokenState()).hp.current),initial,'Teleporting across zones must not apply path damage');
    await page.evaluate(()=>{
      const hold=event=>{event.stopImmediatePropagation();document.removeEventListener('vtt:automation-apply-damage',hold,true);
        window.releaseZone=()=>document.dispatchEvent(new CustomEvent('vtt:automation-apply-damage',{detail:event.detail}));};
      document.addEventListener('vtt:automation-apply-damage',hold,true);
    });
    const arrival=move('teleport',5);
    arrival.catch(()=>{});
    try {await page.waitForFunction(()=>Boolean(window.releaseZone));}
    catch(error) {
      console.error('Held-effect setup:',JSON.stringify({move:await page.evaluate(()=>window.moveAck),token:await tokenState(),claims:await(await page.request.get(origin+'/dnd/vtt/api/v2/zone-entries.php')).json(),writes}));
      throw error;
    }
    assert.equal(await page.evaluate(()=>window.moveAck.status),'pending','Movement callback waits for its zone effects');
    assert.equal((await tokenState()).column,5,'Movement itself is already accepted');
    const countBefore=writes.length;
    const ghost=await page.locator('[data-automation-move-ghost]').boundingBox();
    await page.mouse.click(ghost.x+ghost.width/2,ghost.y+ghost.height/2);
    assert.equal(writes.length,countBefore,'A second click cannot submit another movement while resolving');
    await page.evaluate(()=>window.releaseZone());await arrival;
    assert.equal(Number((await tokenState()).hp.current),initial-3);
    await move('forced',2);await until(async()=>Number((await tokenState()).hp.current)===initial-7);
    await until(async()=>!(await(await page.request.get(origin+'/dnd/vtt/api/v2/zone-entries.php')).json()).claims.length);
    assert.ok(writes.some(w=>w.payload?.actions?.some(a=>a.movementKind==='teleport')));
    assert.ok(writes.some(w=>w.payload?.actions?.some(a=>a.movementKind==='forced')));
    await page.reload();await page.waitForFunction(()=>document.querySelector('[data-connection-status]')?.textContent.includes('Connected'));
    await move('forced',8);await new Promise(resolve=>setTimeout(resolve,700));
    assert.equal(Number((await tokenState()).hp.current),initial-7,'Forced entry claims survive reload and share the teleport boundary');
    await page.evaluate(()=>new Promise(resolve=>document.dispatchEvent(new CustomEvent('vtt:automation-register-persistent-zone',{detail:{resolve,payload:{
      casterId:'floor-cal',abilityName:'Rejected sheet sync',triggers:['onEnter'],tickAt:'never',effects:[{kind:'damage',amount:2}],
      area:{template:{column:6,row:0,width:1,height:1,levelId:'level-0'}},
    }}}))));
    const sheetUrl=origin+'/dnd/character_sheet/handler.php';
    const stallSheet=process.env.VTT_TEST_STALL_SHEET==='1';
    const loseSheetResponse=process.env.VTT_TEST_LOSE_SHEET_RESPONSE==='1';
    assert.ok(!(stallSheet && loseSheetResponse),'Choose either a stalled or lost response scenario');
    let heldWrite=null,sheetWrites=0;
    await page.route(sheetUrl,async route=>{
      if(route.request().method()!=='POST'||!route.request().postData()?.includes('action=sync-stamina'))return route.continue();
      sheetWrites++;
      if(loseSheetResponse) {
        const saved=await route.fetch();
        assert.equal((await saved.json()).success,true);
        await route.abort('failed');
        return;
      }
      if(stallSheet){heldWrite=route;return;}
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:false,error:'Injected sheet sync rejection'})});
    });
    await move('forced',5,loseSheetResponse?'resolved':'rejected');
    if(loseSheetResponse) {
      await until(async()=>!(await(await page.request.get(origin+'/dnd/vtt/api/v2/zone-entries.php')).json()).claims.length);
      assert.equal(Number((await tokenState()).hp.current),initial-9);
      assert.equal(Number((await(await page.request.get(sheetUrl+'?action=sync-stamina&character=cal')).json()).currentStamina),initial-9);
      assert.equal(sheetWrites,1,'Lost response recovery must not resend damage');
      await page.unroute(sheetUrl);
      await page.reload();
      await page.waitForFunction(()=>document.querySelector('[data-connection-status]')?.textContent.includes('Connected'));
      await move('forced',8);
      assert.equal(Number((await tokenState()).hp.current),initial-9,'Recovered completed entry cannot repeat after reload');
      assert.equal(Number((await(await page.request.get(sheetUrl+'?action=sync-stamina&character=cal')).json()).currentStamina),initial-9);
      assert.deepEqual(errors,[]);
      console.log('PASS real forced-zone damage recovers a lost sheet response, completes once, keeps sheet/token agreement and survives reload without repeat damage');
      return;
    }
    await until(async()=>(await(await page.request.get(origin+'/dnd/vtt/api/v2/zone-entries.php')).json()).claims.some(c=>c.status==='needs_review'));
    const review=(await(await page.request.get(origin+'/dnd/vtt/api/v2/zone-entries.php')).json()).claims.find(c=>c.status==='needs_review');
    assert.match(review.outcome.reason,/character stamina synchronization was not confirmed/);
    assert.equal(review.outcome.actorId,'GM');
    await page.locator('[data-settings-launch="scenes"]').click();
    const recovery=page.locator('[data-zone-entry-recovery]');
    await recovery.locator('summary').first().click();
    await page.locator('[data-zone-review-reason]').filter({hasText:review.outcome.reason}).waitFor({state:'visible'});
    assert.equal(Number((await tokenState()).hp.current),initial-9,'Board damage remains accepted when sheet sync fails');
    const sheet=await(await page.request.get(sheetUrl+'?action=sync-stamina&character=cal')).json();
    assert.equal(Number(sheet.currentStamina),initial-7,'Rejected sheet update must leave its previous value');
    assert.equal(sheetWrites,1,'An uncertain sheet write must not be retried');
    if(heldWrite)await heldWrite.abort().catch(()=>{});
    await page.unroute(sheetUrl);
    assert.deepEqual(errors,[]);
    console.log(`PASS: teleport/forced entry semantics, reload-safe completed damage and review on ${stallSheet?'stalled':'rejected'} character stamina synchronization.`);
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
