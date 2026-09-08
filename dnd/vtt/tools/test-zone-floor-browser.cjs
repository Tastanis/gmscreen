const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const origin='http://127.0.0.1:8129';
(async()=>{
  const manifest=await fetch(origin+'/diagnostic-manifest.json').then(r=>r.json());
  assert.equal(manifest.test_fixture,'floor-regression');
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const errors=[],pages=[];
    for(const user of ['GM','sharon']) {
      const page=await browser.newPage();page.on('pageerror',error=>errors.push(error.message));
      await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
      await page.goto(origin+'/test-login.php?user='+user);
      await page.waitForFunction(()=>document.querySelector('[data-connection-status]')?.textContent.includes('Connected'));
      pages.push(page);
    }
    const [gm,pc]=pages,sceneId=manifest.test_scene_id;
    const snapshot=async(page)=>(await(await page.request.get(origin+'/dnd/vtt/api/v2/snapshot.php')).json()).snapshot;
    const result=await gm.evaluate(()=>new Promise(resolve=>{
      document.dispatchEvent(new CustomEvent('vtt:automation-register-persistent-zone',{detail:{resolve,payload:{
        casterId:'floor-cal',abilityName:'Floor regression zone',effects:[],
        area:{shape:'cube',template:{column:6,row:5,width:2,height:2,levelId:'test-upper'}},
      }}}));
    }));
    assert.equal(result.registered,true);
    await gm.waitForFunction(async({sceneId,id})=>{
      const s=(await(await fetch('/dnd/vtt/api/v2/snapshot.php')).json()).snapshot;
      return s.state.placements?.[sceneId]?.['floor-cal']?.persistentZones?.some(z=>z.id===id);
    },{sceneId,id:result.zoneId});
    const zone=(await snapshot(gm)).state.placements[sceneId]['floor-cal'].persistentZones.find(z=>z.id===result.zoneId);
    assert.equal(zone.levelId,'test-upper','Registration retains the selected area floor, not the base-floor caster');
    assert.equal((await snapshot(gm)).state.placements[sceneId]['floor-cal'].levelId,'level-0');
    assert.deepEqual((await snapshot(pc)).state.placements[sceneId]['floor-cal'].persistentZones.find(z=>z.id===result.zoneId),zone);
    await gm.reload();await gm.waitForFunction(()=>document.querySelector('[data-connection-status]')?.textContent.includes('Connected'));
    assert.deepEqual((await snapshot(gm)).state.placements[sceneId]['floor-cal'].persistentZones.find(z=>z.id===result.zoneId),zone);
    assert.deepEqual(errors,[]);
    console.log('PASS: zone registration saves the selected area floor through canonical persistence, player projection and GM reload.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
