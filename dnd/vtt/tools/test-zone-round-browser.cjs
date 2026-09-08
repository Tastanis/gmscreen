const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
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
      await page.waitForFunction(()=>document.querySelector('[data-connection-status]')?.textContent.includes('Connected'));
      pages.push(page);
    }
    const [gm,pc]=pages,sceneId=manifest.test_scene_id;
    const snapshot=async()=>(await(await gm.request.get(origin+'/dnd/vtt/api/v2/snapshot.php')).json()).snapshot;
    async function until(check) {const deadline=Date.now()+15000;while(!await check()) {if(Date.now()>deadline)throw Error('Timed out waiting for zone round state');await new Promise(resolve=>setTimeout(resolve,100));}}
    async function combat(type,payload={}) {
      const s=await snapshot();const response=await gm.request.post(origin+'/dnd/vtt/api/v2/commands.php',{data:{type,payload,sceneId,operationId:randomUUID(),baseRevision:s.revision}});
      assert.equal((await response.json()).success,true);
    }
    await combat('combat.start',{encounterId:'zone-round-regression'});
    for(const amount of [3,4]) {
      const zone=await gm.evaluate(amount=>new Promise(resolve=>document.dispatchEvent(new CustomEvent('vtt:automation-register-persistent-zone',{detail:{resolve,payload:{
        casterId:'floor-cal',abilityName:`Overlap ${amount}`,triggers:['onEnter'],tickAt:'never',effects:[{kind:'damage',amount}],
        area:{template:{column:5,row:0,width:1,height:1,levelId:'level-0'}},
      }}}))),amount);
      assert.equal(zone.registered,true);await pc.locator(`[data-zone-id="${zone.zoneId}"]`).waitFor();
    }
    const initial=Number((await snapshot()).state.placements[sceneId]['floor-cal'].hp.current);
    async function drag(dx,column,page=pc) {
      const token=page.locator('#vtt-token-layer [data-placement-id="floor-cal"]');
      await token.hover();const box=await token.boundingBox();
      await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
      await page.mouse.move(box.x+box.width/2+dx*box.width,box.y+box.height/2,{steps:30});await page.mouse.up();
      await until(async()=>(await snapshot()).state.placements[sceneId]['floor-cal'].column===column);
    }
    await drag(6,8);
    await until(async()=>Number((await snapshot()).state.placements[sceneId]['floor-cal'].hp.current)===initial-7);
    await until(async()=>!(await(await gm.request.get(origin+'/dnd/vtt/api/v2/zone-entries.php')).json()).claims.length);
    await drag(-6,2);await new Promise(resolve=>setTimeout(resolve,700));
    assert.equal(Number((await snapshot()).state.placements[sceneId]['floor-cal'].hp.current),initial-7,'Each overlapping zone applies once in the first round');
    await combat('round.advance');
    await pc.waitForFunction(()=>document.querySelector('[data-round-value]')?.textContent.trim()==='2');
    await drag(6,8);
    await until(async()=>Number((await snapshot()).state.placements[sceneId]['floor-cal'].hp.current)===initial-14);
    await until(async()=>!(await(await gm.request.get(origin+'/dnd/vtt/api/v2/zone-entries.php')).json()).claims.length);
    await drag(-6,2);await combat('round.advance');
    for(const page of pages)await page.waitForFunction(()=>document.querySelector('[data-round-value]')?.textContent.trim()==='3');
    await Promise.all([drag(6,8,pc),drag(6,8,gm)]);
    await until(async()=>Number((await snapshot()).state.placements[sceneId]['floor-cal'].hp.current)===initial-21);
    await until(async()=>!(await(await gm.request.get(origin+'/dnd/vtt/api/v2/zone-entries.php')).json()).claims.length);
    await new Promise(resolve=>setTimeout(resolve,1000));
    assert.equal(Number((await snapshot()).state.placements[sceneId]['floor-cal'].hp.current),initial-21,'Competing GM/player movement must not duplicate zone effects');
    assert.deepEqual(errors,[]);
    console.log('PASS: overlapping zones apply once per round across player round changes and competing GM/player drags.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
