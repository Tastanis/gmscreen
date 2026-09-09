const {chromium}=require('playwright');
const {randomUUID}=require('node:crypto');
const assert=require('node:assert/strict');
const {waitForBrowserState}=require('./wait-for-browser-state.cjs');
const origin='http://127.0.0.1:8129';
(async()=>{
  const manifest=await fetch(origin+'/diagnostic-manifest.json').then(r=>r.json());
  assert.equal(manifest.test_fixture,'floor-regression');
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
    await page.goto(origin+'/test-login.php?user=GM');
    const connected=()=>page.waitForFunction(()=>document.querySelector('[data-connection-status]')?.textContent==='Connected');
    await connected();
    const sceneId=manifest.test_scene_id;
    const snapshot=async()=>(await(await page.request.get(origin+'/dnd/vtt/api/v2/snapshot.php')).json()).snapshot;
    async function batch(actions) {
      const s=await snapshot();
      const response=await page.request.post(origin+'/dnd/vtt/api/v2/commands.php',{data:{type:'placement.batch',sceneId,operationId:randomUUID(),baseRevision:s.revision,
        payload:{actions:actions.map(a=>({...a,sceneId,...(a.kind==='patch'?{entityRevision:s.state.placements[sceneId][a.placementId]._entityRevision}:{})}))}}});
      assert.equal(response.status(),200,await response.text());
    }
    const seed=(await snapshot()).state.placements[sceneId]['floor-cal'];
    await batch([
      {kind:'patch',placementId:'floor-cal',patch:{column:6,row:5}},
      ...[['aura-upper',6,'test-upper'],['aura-control',7,'level-0']].map(([id,column,levelId])=>({kind:'add',placementId:id,placement:{id,name:id,team:'enemy',column,row:5,width:1,height:1,levelId,movementMode:'fly',imageUrl:seed.imageUrl,hp:{current:30,max:30}}})),
    ]);
    await page.locator('#vtt-token-layer [data-placement-id="aura-upper"]').waitFor();
    await page.evaluate(()=>new Promise((resolve,reject)=>document.dispatchEvent(new CustomEvent('vtt:automation-set-aura',{detail:{resolve,reject,payload:{placementId:'floor-cal',radius:3,
      automation:{abilityId:'height-aura-test',abilityName:'Height aura',affects:'enemy',triggers:[{event:'actionUsed',whose:'self',target:'all'}],effects:[{kind:'damage',amount:2}]}}}}))));
    async function setHeight(n) {
      await page.locator('[data-settings-launch="scenes"]').click();
      while(await page.locator('.scene-group.is-collapsed [data-action="toggle-folder"]').count())await page.locator('.scene-group.is-collapsed [data-action="toggle-folder"]').first().click();
      const input=page.locator('[data-action="set-map-level-height"][data-map-level-id="test-upper"]');
      await input.fill(String(n));await input.press('Tab');
      await waitForBrowserState(page,async({sceneId,n})=>{
        const s=(await(await fetch('/dnd/vtt/api/v2/snapshot.php')).json()).snapshot;
        return s.state.sceneConfig[sceneId].mapLevels.levels.some(l=>l.id==='test-upper'&&l.elevationSquares===n);
      },{sceneId,n});
      // Reload also verifies that the saved aura and floor height are hydrated.
      await page.reload();await connected();
    }
    async function tick(expectedUpper,expectedControl) {
      await page.evaluate(()=>{
        window.testAuraFinished=false;
        const previous=window.dashboardChat.sendMessage.bind(window.dashboardChat);
        window.dashboardChat.sendMessage=payload=>{
          if(payload.message?.startsWith('Height aura aura ('))window.testAuraFinished=true;
          return previous(payload);
        };
        document.dispatchEvent(new CustomEvent('vtt:automation-fire-trigger-event',{detail:{payload:{eventType:'actionUsed',payload:{placementId:'floor-cal',actorId:'floor-cal'}}}}));
      });
      await page.waitForFunction(()=>window.testAuraFinished);
      const p=(await snapshot()).state.placements[sceneId];
      assert.equal(Number(p['aura-upper'].hp.current),expectedUpper);
      assert.equal(Number(p['aura-control'].hp.current),expectedControl,'Same-floor control proves the aura actually fired');
    }
    await setHeight(5);await tick(30,28);
    await setHeight(3);await tick(28,26);
    await batch([{kind:'patch',placementId:'floor-cal',patch:{column:5}},{kind:'patch',placementId:'aura-upper',patch:{column:5}}]);
    await page.reload();await connected();
    await tick(28,24);
    assert.deepEqual(errors,[]);
    console.log('PASS real aura damage: five-square gap excluded, three-square opening included, solid floor blocks, same-floor control and reload persistence');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
