const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const origin='http://127.0.0.1:8129';
(async()=>{
  const manifest=await fetch(origin+'/diagnostic-manifest.json').then(r=>r.json());
  assert.equal(manifest.test_fixture,'floor-regression');
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const pages=[],errors=[];
    for(const user of ['GM','cal']) {
      const page=await browser.newPage({viewport:{width:1440,height:900}});
      page.on('pageerror',error=>errors.push(error.message));
      await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
      await page.goto(origin+'/test-login.php?user='+user);
      await page.waitForFunction(()=>document.querySelector('[data-connection-status]')?.textContent.includes('Connected'));pages.push(page);
    }
    const [gm,pc]=pages,sceneId=manifest.test_scene_id;
    const snapshot=async()=>(await(await gm.request.get(origin+'/dnd/vtt/api/v2/snapshot.php')).json()).snapshot;
    const claims=async()=>(await(await gm.request.get(origin+'/dnd/vtt/api/v2/zone-entries.php')).json()).claims;
    async function until(check) {const deadline=Date.now()+15000;while(!await check()){if(Date.now()>deadline)throw Error('Timed out waiting for queued zone cancellation');await new Promise(resolve=>setTimeout(resolve,100));}}
    const zones=[];
    for(const amount of [3,4]) {
      const zone=await gm.evaluate(amount=>new Promise(resolve=>document.dispatchEvent(new CustomEvent('vtt:automation-register-persistent-zone',{detail:{resolve,payload:{
        casterId:'floor-cal',abilityName:`Queued ${amount}`,triggers:['onEnter'],tickAt:'never',effects:[{kind:'damage',amount}],
        area:{template:{column:5,row:0,width:1,height:1,levelId:'level-0'}},
      }}}))),amount);
      assert.equal(zone.registered,true);zones.push(zone);await pc.locator(`[data-zone-id="${zone.zoneId}"]`).waitFor();
    }
    const initial=Number((await snapshot()).state.placements[sceneId]['floor-cal'].hp.current);
    await pc.evaluate(()=>{
      const hold=event=>{
        event.stopImmediatePropagation();document.removeEventListener('vtt:automation-apply-damage',hold,true);
        window.heldZoneName=event.detail.payload.abilityName;
        window.releaseZoneEffect=()=>document.dispatchEvent(new CustomEvent('vtt:automation-apply-damage',{detail:event.detail}));
      };
      document.addEventListener('vtt:automation-apply-damage',hold,true);
    });
    const token=pc.locator('#vtt-token-layer [data-placement-id="floor-cal"]');await token.hover();const box=await token.boundingBox();
    await pc.mouse.move(box.x+box.width/2,box.y+box.height/2);await pc.mouse.down();
    await pc.mouse.move(box.x+box.width/2+6*box.width,box.y+box.height/2,{steps:30});await pc.mouse.up();
    await pc.waitForFunction(()=>Boolean(window.releaseZoneEffect));
    await until(async()=>(await claims()).length===2);
    const heldName=await pc.evaluate(()=>window.heldZoneName);
    const heldAmount=heldName.includes('Queued 3')?3:4;
    const removed=zones[heldAmount===3?1:0];
    const node=gm.locator(`[data-zone-id="${removed.zoneId}"]`);await node.locator('.vtt-persistent-zone__badge').hover();
    await node.locator('[data-zone-end]').click();
    await pc.locator(`[data-zone-id="${removed.zoneId}"]`).waitFor({state:'detached'});
    await pc.evaluate(()=>window.releaseZoneEffect());
    await until(async()=>(await claims()).some(claim=>claim.zoneId===removed.zoneId&&claim.status==='needs_review'));
    await until(async()=>(await claims()).length===1);
    assert.equal(Number((await snapshot()).state.placements[sceneId]['floor-cal'].hp.current),initial-heldAmount,'Ended queued zone must not damage the creature');
    await pc.reload();await pc.waitForFunction(()=>document.querySelector('[data-connection-status]')?.textContent.includes('Connected'));
    assert.equal((await claims())[0].zoneId,removed.zoneId,'Ended-zone evidence remains available after reload');
    assert.deepEqual(errors,[]);
    console.log('PASS: ending a queued zone stops its undispatched damage and preserves an unresolved recovery record after reload.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
