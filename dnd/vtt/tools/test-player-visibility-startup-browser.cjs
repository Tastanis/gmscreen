const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const origin=process.env.VTT_TEST_ORIGIN||'http://127.0.0.1:18796';
if(!['127.0.0.1','localhost'].includes(new URL(origin).hostname))throw Error('Loopback required');
if(!process.env.VTT_TEST_PACKAGE)throw Error('VTT_TEST_PACKAGE must name the local scene package for this disposable audit');
(async()=>{
 assert.equal((await(await fetch(origin+'/diagnostic-manifest.json')).json()).test_fixture,'vision-performance');
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const gmContext=await browser.newContext(),api=gmContext.request;await api.get(origin+'/test-login.php?user=GM');
  const snapshot=async()=>(await(await api.get(origin+'/dnd/vtt/api/v2/snapshot.php')).json()).snapshot;
  const before=await snapshot(),pkg=JSON.parse(fs.readFileSync(process.env.VTT_TEST_PACKAGE,'utf8').replace(/^\uFEFF/,''));pkg.scene.name='Disposable startup visibility audit';pkg.domains.placements={};
  const imported=await api.post(origin+'/dnd/vtt/api/v2/scene-import.php',{data:{package:pkg,operationId:crypto.randomUUID(),allowPlayerBrowsing:true}});assert.equal(imported.status(),200,await imported.text());const scene=(await imported.json()).scene;
  async function command(type,payload){const s=await snapshot(),r=await api.post(origin+'/dnd/vtt/api/v2/commands.php',{data:{type,operationId:crypto.randomUUID(),sceneId:scene.id,baseRevision:s.revision,entityRevision:type==='routing.set'?s.state.routing._revision:0,payload}});assert.equal(r.status(),200,await r.text());}
  await command('routing.set',{routing:{activeSceneId:scene.id,mapUrl:scene.mapUrl,playerActiveSceneId:scene.id,playerMapUrl:scene.mapUrl,playerMapDisabled:false}});
  await command('placement.batch',{actions:[{kind:'add',sceneId:scene.id,placementId:'startup-sharon',placement:{id:'startup-sharon',name:'Startup visibility QA',profileId:'sharon',team:'ally',visionOwners:['sharon'],column:24,row:27,width:1,height:1,levelId:'level-0',imageUrl:'/dnd/vtt/assets/images/terrain-walker.svg'}}]});
  const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage(),errors=[];let release,held=new Promise(r=>release=r),delayed=0;
  page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin!==origin)return route.abort();if(u.pathname.endsWith('/terrain-prototype.js')){delayed++;await held;}return route.continue();});
  await page.addInitScript(()=>{window.startupExposure=[];const expectedHeight=!location.search.includes('qaFlat=1');const watch=()=>{const map=document.querySelector('#vtt-map-transform'),image=document.querySelector('#vtt-map-image');if(map&&image?.src&&getComputedStyle(map).opacity!=='0'&&!map.hidden){const c=window.terrainContext?.();if(!c?.view.mapLoaded||!window.visionPrototype||(expectedHeight&&!window.visionPrototype.stats.paints))startupExposure.push({ready:c?.view.mapLoaded,vision:typeof window.visionPrototype,paints:window.visionPrototype?.stats?.paints});}requestAnimationFrame(watch);};requestAnimationFrame(watch);});
  for(const reload of [false,true]){
   console.log(reload?'Checking delayed same-URL reload':'Checking delayed height-map startup');
   if(reload){held=new Promise(r=>release=r);await page.reload({waitUntil:'commit'});}else await page.goto(origin+'/test-login.php?user=sharon',{waitUntil:'commit'});
   await page.locator('#vtt-map-transform').waitFor({state:'attached'});
   await page.waitForTimeout(200);
   assert.equal(await page.locator('#vtt-map-transform').evaluate(n=>getComputedStyle(n).opacity),'0','map stays hidden while height renderer is delayed');
   assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('vtt-player-visibility-pending')),true);
   release();
   await page.waitForFunction(()=>!document.documentElement.classList.contains('vtt-player-visibility-pending'),null,{timeout:60000});
   assert.ok(await page.evaluate(()=>visionPrototype.stats.paints>0));
   assert.deepEqual(await page.evaluate(()=>startupExposure),[],'no frame reveals the map before masks exist');
  }
  const flat=structuredClone(pkg);flat.scene.name='Disposable flat startup visibility audit';flat.domains.sceneConfig.environment={};flat.domains.sceneConfig.mapLevels={activeLevelId:'level-0',levels:[]};flat.domains.sceneConfig.fogOfWar={byLevel:{}};flat.domains.sceneConfig.userLevelState={};flat.domains.placements={};
  console.log('Checking delayed ordinary flat-map startup');
  const flatImport=await api.post(origin+'/dnd/vtt/api/v2/scene-import.php',{data:{package:flat,operationId:crypto.randomUUID(),allowPlayerBrowsing:true}});assert.equal(flatImport.status(),200,await flatImport.text());const flatScene=(await flatImport.json()).scene,s=await snapshot();
  const routed=await api.post(origin+'/dnd/vtt/api/v2/commands.php',{data:{type:'routing.set',operationId:crypto.randomUUID(),sceneId:flatScene.id,baseRevision:s.revision,entityRevision:s.state.routing._revision,payload:{routing:{activeSceneId:flatScene.id,mapUrl:flatScene.mapUrl,playerActiveSceneId:flatScene.id,playerMapUrl:flatScene.mapUrl,playerMapDisabled:false}}}});assert.equal(routed.status(),200,await routed.text());
  held=new Promise(r=>release=r);await page.goto(origin+'/dnd/vtt/?qaFlat=1',{waitUntil:'commit'});await page.locator('#vtt-map-transform').waitFor({state:'attached'});await page.waitForTimeout(200);
  assert.equal(await page.locator('#vtt-map-transform').evaluate(n=>getComputedStyle(n).opacity),'0','ordinary map stays covered until renderer initializes');release();
  await page.waitForFunction(()=>!document.documentElement.classList.contains('vtt-player-visibility-pending'),null,{timeout:60000});assert.equal(await page.evaluate(()=>visionPrototype.stats.paints),0,'flat map opens through explicit no-height decision');assert.deepEqual(await page.evaluate(()=>startupExposure),[]);
  assert.equal(delayed,3,'initial load, same-URL reload and flat startup all delayed the height renderer');
  await command('routing.set',{routing:{activeSceneId:scene.id,mapUrl:scene.mapUrl,playerActiveSceneId:scene.id,playerMapUrl:scene.mapUrl,playerMapDisabled:false}});
  const after=await snapshot();for(const id of Object.keys(before.state.placements))assert.deepEqual(after.state.placements[id],before.state.placements[id],'original canonical tokens unchanged');
  assert.deepEqual(errors,[]);console.log('PASS delayed player height-map load/reload and ordinary flat-map startup; no exposure frames, page errors or original token changes');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
