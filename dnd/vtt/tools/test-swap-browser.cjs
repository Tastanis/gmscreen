const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {waitForBrowserState}=require('./wait-for-browser-state.cjs');
const origin='http://127.0.0.1:8129';
(async()=>{
  const manifest=await fetch(origin+'/diagnostic-manifest.json').then(r=>r.json());
  assert.equal(manifest.test_fixture,'floor-regression');
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const gm=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
    gm.on('pageerror',error=>errors.push(error.message));
    await gm.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    await gm.goto(origin+'/test-login.php?user=GM');
    await gm.waitForFunction(()=>document.querySelector('[data-connection-status]')?.textContent.includes('Connected'));
    const sceneId=manifest.test_scene_id,commandUrl=origin+'/dnd/vtt/api/v2/commands.php';
    const snapshot=async()=>(await(await gm.request.get(origin+'/dnd/vtt/api/v2/snapshot.php')).json()).snapshot;
    const initial=await snapshot();
    const seed=await gm.request.post(commandUrl,{data:{type:'placement.batch',sceneId,operationId:randomUUID(),baseRevision:initial.revision,payload:{actions:[{
      kind:'add',sceneId,placementId:'swap-other',placement:{id:'swap-other',name:'Swap other',team:'ally',imageUrl:initial.state.placements[sceneId]['floor-cal'].imageUrl,
        column:8,row:4,width:1,height:1,levelId:'test-upper'},
    }]}}});assert.equal((await seed.json()).success,true);
    await gm.locator('#vtt-token-layer [data-placement-id="swap-other"]').waitFor();
    const players=[];
    for(const user of ['cal','sharon']) {
      const player=await browser.newPage({viewport:{width:1440,height:900}});
      player.on('pageerror',error=>errors.push(error.message));
      await player.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
      await player.goto(origin+'/test-login.php?user='+user);
      await player.waitForFunction(()=>document.querySelector('[data-connection-status]')?.textContent==='Connected');
      players.push(player);
    }
    async function checkReceived(page, expected) {
      await waitForBrowserState(page, async({sceneId,expected})=>{
        const {getState}=await import('/dnd/vtt/assets/js/state/store.js');
        const placements=getState().boardState.placements[sceneId]||[];
        return Object.entries(expected).every(([id,position])=>{
          const p=placements.find(p=>p.id===id);
          return p && JSON.stringify([p.column,p.row,p.levelId])===JSON.stringify(position);
        });
      },{sceneId,expected});
    }
    const startPositions={'floor-cal':[2,0,'level-0'],'swap-other':[8,4,'test-upper']};
    for(const player of players)await checkReceived(player,startPositions);
    await players[1].context().setOffline(true);
    await players[1].waitForFunction(()=>document.querySelector('[data-connection-status]')?.textContent==='Offline');
    await gm.evaluate(()=>{window.walkingHooks=0;document.addEventListener('vtt:token-moved',event=>{if(event.detail?.kind==='normal')window.walkingHooks++;});});
    async function swap() {
      await gm.evaluate(()=>{
        window.swapResult={status:'pending'};
        document.dispatchEvent(new CustomEvent('vtt:automation-apply-swap',{detail:{payload:{sourcePlacement:{id:'floor-cal'},targetId:'swap-other'},
          resolve:result=>{window.swapResult={status:'resolved',result};},reject:error=>{window.swapResult={status:'rejected',error:error.message};},
        }}));
      });
    }
    const before=await snapshot();let release,seen;const intercepted=new Promise(resolve=>{seen=resolve;});const gate=new Promise(resolve=>{release=resolve;});
    const writes=[];
    await gm.route(commandUrl,async route=>{const body=route.request().postDataJSON();writes.push(body);seen();await gate;await route.continue();});
    await swap();await intercepted;
    assert.equal(await gm.evaluate(()=>window.swapResult.status),'pending');
    assert.deepEqual((await snapshot()).state.placements,before.state.placements,'Held batch has not moved either token');
    assert.equal(writes.length,1);assert.equal(writes[0].type,'placement.batch');assert.equal(writes[0].payload.actions.length,2);
    assert.ok(writes[0].payload.actions.every(action=>action.movementKind==='teleport'));
    release();await gm.waitForFunction(()=>window.swapResult.status!=='pending');
    assert.equal(await gm.evaluate(()=>window.swapResult.status),'resolved');
    assert.equal(await gm.evaluate(()=>window.swapResult.result.skipped),undefined);
    const after=await snapshot(),p=after.state.placements[sceneId];
    assert.equal(after.revision,before.revision+1,'Swap is one canonical revision');
    assert.deepEqual([p['floor-cal'].column,p['floor-cal'].row,p['floor-cal'].levelId],[8,4,'test-upper']);
    assert.deepEqual([p['swap-other'].column,p['swap-other'].row,p['swap-other'].levelId],[2,0,'level-0']);
    const swappedPositions={'floor-cal':[8,4,'test-upper'],'swap-other':[2,0,'level-0']};
    await checkReceived(players[0],swappedPositions);
    await players[1].context().setOffline(false);
    await players[1].waitForFunction(()=>document.querySelector('[data-connection-status]')?.textContent==='Connected');
    await checkReceived(players[1],swappedPositions);
    await gm.unroute(commandUrl);
    await gm.route(commandUrl,route=>route.fulfill({status:422,contentType:'application/json',body:JSON.stringify({success:false,error:'Injected swap rejection'})}));
    await swap();await gm.waitForFunction(()=>window.swapResult.status!=='pending');assert.equal(await gm.evaluate(()=>window.swapResult.status),'rejected');
    assert.deepEqual((await snapshot()).state.placements,after.state.placements,'Rejected swap moves neither token');
    assert.equal(await gm.evaluate(()=>window.walkingHooks),0,'Swap never fires walking triggers');
    await gm.unroute(commandUrl);await gm.reload();
    await gm.waitForFunction(()=>document.querySelector('[data-connection-status]')?.textContent.includes('Connected'));
    assert.deepEqual((await snapshot()).state.placements,after.state.placements);
    for(const player of players) {
      await player.reload();
      await player.waitForFunction(()=>document.querySelector('[data-connection-status]')?.textContent==='Connected');
      await checkReceived(player,swappedPositions);
    }
    assert.deepEqual(errors,[]);
    console.log('PASS: cross-floor swap is one accepted batch, awaits persistence, rejects atomically, reaches both player stores including offline catch-up, survives all three reloads and emits no walking hooks.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
