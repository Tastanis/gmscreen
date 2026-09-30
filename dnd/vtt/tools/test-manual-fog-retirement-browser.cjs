const {chromium}=require('playwright'),assert=require('node:assert/strict');
const origin=process.env.VTT_TEST_ORIGIN||'http://127.0.0.1:18796';
if(!['127.0.0.1','localhost'].includes(new URL(origin).hostname))throw Error('Loopback required');
(async()=>{
 assert.equal((await(await fetch(origin+'/diagnostic-manifest.json')).json()).test_fixture,'vision-performance');
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const errors=[],commands=[];
  async function page(user){
   const p=await browser.newPage({viewport:{width:1280,height:900}});
   p.on('pageerror',e=>errors.push(e.message));
   p.on('request',r=>{if(r.url().includes('/commands.php'))commands.push(r.postDataJSON()?.type);});
   await p.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
   await p.goto(origin+'/test-login.php?user='+user);
   await p.waitForFunction(()=>window.terrainContext?.()?.view.mapLoaded,null,{timeout:60000});
   return p;
  }
  const gm=await page('GM');
  const snapshot=async()=>(await(await gm.request.get(origin+'/dnd/vtt/api/v2/snapshot.php')).json()).snapshot;
  const before=await snapshot();
  await gm.waitForFunction(()=>document.querySelector('#vtt-fog-panel [data-reset-explored]'),null,{timeout:30000});
  await gm.locator('[data-settings-launch="fog"]').evaluate(n=>n.click());
  assert.equal(await gm.locator('#vtt-fog-panel').isVisible(),true);
  assert.equal(await gm.locator('#vtt-fog-panel [data-reset-explored]').isVisible(),true);
  assert.equal(await gm.locator('[data-fog-toggle],[data-fog-select],[data-fog-clear],[data-fog-add]').count(),0);
  await gm.locator('[data-fog-close]').click();
  const player=await page('sharon');
  await player.waitForFunction(()=>!document.documentElement.classList.contains('vtt-player-visibility-pending'),null,{timeout:60000});
  const proof=await player.evaluate(async()=>{
   const fog=await import('/dnd/vtt/assets/js/ui/fog-of-war.js');
   const {state,view}=terrainContext(),copy=structuredClone(state),id=copy.boardState.activeSceneId;
   copy.boardState.sceneState[id].fogOfWar={byLevel:{'level-0':{enabled:true,revealedCells:{}}}};
   const preserved=JSON.stringify(copy.boardState.sceneState[id].fogOfWar);
   const active=document.getElementById('vtt-fog-layer'),passive=document.createElement('canvas');
   for(const canvas of [active,passive]){
    canvas.width=100;canvas.height=100;canvas.getContext('2d').fillRect(0,0,100,100);
   }
   fog.renderFog(copy);
   fog.renderFogSurface({state:copy,canvas:passive,view,sceneId:id,levelId:'level-0',gmViewing:false});
   return {activeAlpha:active.getContext('2d').getImageData(0,0,1,1).data[3],previewAlpha:passive.getContext('2d').getImageData(0,0,1,1).data[3],
    checker:fog.createFogChecker(copy,'level-0'),hidden:fog.isPositionFogged(copy,0,0,'level-0'),select:fog.isFogSelectActive(),
    unchanged:preserved===JSON.stringify(copy.boardState.sceneState[id].fogOfWar),heightPaints:window.visionPrototype?.stats.paints||0};
  });
  assert.deepEqual(proof,{activeAlpha:0,previewAlpha:0,checker:null,hidden:false,select:false,unchanged:true,heightPaints:proof.heightPaints});
  assert.ok(proof.heightPaints>0,'Automatic height vision remains active');
  assert.equal(commands.includes('fog.set'),false,'Opening/closing compatibility panel cannot write manual fog');
  const after=await snapshot();assert.deepEqual(after.state.sceneConfig,before.state.sceneConfig);assert.deepEqual(after.state.placements,before.state.placements);
  assert.deepEqual(errors,[]);console.log('PASS retired manual fog clears active/preview masks, keeps automatic vision/reset, removes gestures/controls, and sends no fog writes; canonical scene configuration/tokens unchanged');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
