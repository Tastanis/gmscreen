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
    const claimBefore=await snapshot();
    assert.equal((await pc.request.get(claimUrl)).status(),405);
    assert.equal((await gm.request.post(claimUrl,{data:claimData})).status(),422,'Another actor cannot claim the player movement');
    const reserved=await pc.request.post(claimUrl,{data:claimData});assert.equal(reserved.status(),200);
    const claim=await reserved.json();assert.equal(claim.claimed,true);assert.equal(claim.status,'pending');
    const duplicate=await(await pc.request.post(claimUrl,{data:claimData})).json();
    assert.equal(duplicate.claimed,false);assert.equal(duplicate.claimId,claim.claimId);
    assert.deepEqual(await snapshot(),claimBefore,'Claim reservations do not apply effects or change board state');
    await drag(-6,2);await pc.waitForTimeout(500);
    assert.equal(Number((await snapshot()).state.placements[sceneId]['floor-cal'].hp.current),before-3,'A second crossing in the same client/round does not tick again');
    assert.deepEqual(errors,[]);
    console.log('PASS: real long drag through a zone applies one damage tick, ends outside, and same-round reverse crossing does not repeat it.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
