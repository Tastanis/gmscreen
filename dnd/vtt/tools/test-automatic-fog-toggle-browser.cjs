const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const origin=process.env.VTT_TEST_ORIGIN||'http://127.0.0.1:18796';
if(!['127.0.0.1','localhost'].includes(new URL(origin).hostname))throw Error('Loopback required');
if(!process.env.VTT_TEST_PACKAGE)throw Error('VTT_TEST_PACKAGE must name a local scene package');
(async()=>{
 assert.equal((await(await fetch(origin+'/diagnostic-manifest.json')).json()).test_fixture,'vision-performance');
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const admin=await browser.newContext();await admin.request.get(origin+'/test-login.php?user=GM');
  const snapshot=async()=>(await(await admin.request.get(origin+'/dnd/vtt/api/v2/snapshot.php')).json()).snapshot;
  const before=await snapshot(),pkg=JSON.parse(fs.readFileSync(process.env.VTT_TEST_PACKAGE,'utf8').replace(/^\uFEFF/,''));
  pkg.scene.name='Disposable automatic fog toggle';pkg.domains.placements={};pkg.domains.sceneConfig.userLevelState={};
  pkg.domains.sceneConfig.fogOfWar={automaticEnabled:true,byLevel:{'level-0':{enabled:true,revealedCells:{}}}};
  const imported=await admin.request.post(origin+'/dnd/vtt/api/v2/scene-import.php',{data:{package:pkg,operationId:crypto.randomUUID(),allowPlayerBrowsing:true}});
  const importText=await imported.text();assert.equal(imported.status(),200,importText);let importBody;try{importBody=JSON.parse(importText);}catch{throw Error('Fixture scene import returned invalid JSON: '+importText.slice(0,1800));}const scene=importBody.scene;
  async function command(type,payload){const s=await snapshot(),r=await admin.request.post(origin+'/dnd/vtt/api/v2/commands.php',{data:{type,sceneId:scene.id,operationId:crypto.randomUUID(),baseRevision:s.revision,entityRevision:type==='routing.set'?s.state.routing._revision:s.state.sceneConfig[scene.id]._revision,payload}});assert.equal(r.status(),200,await r.text());}
  await command('routing.set',{routing:{activeSceneId:scene.id,playerActiveSceneId:scene.id,mapUrl:scene.mapUrl,playerMapUrl:scene.mapUrl,playerMapDisabled:false}});
  await command('placement.batch',{actions:[{kind:'add',sceneId:scene.id,placementId:'fog-toggle-sharon',placement:{id:'fog-toggle-sharon',name:'Fog toggle QA',profileId:'sharon',visionOwners:['sharon'],team:'ally',column:24,row:27,width:1,height:1,levelId:'level-0',imageUrl:'/dnd/vtt/assets/images/terrain-walker.svg'}}]});
  const errors=[];
  async function page(user){const p=await browser.newPage({viewport:{width:1280,height:900}});p.on('pageerror',e=>errors.push(e.message));await p.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());await p.goto(origin+'/test-login.php?user='+user);await p.waitForFunction(()=>window.visionPrototype&&window.terrainContext?.().view.mapLoaded,null,{timeout:60000});return p;}
  const gm=await page('GM'),pc=await page('sharon');
  async function flag(value){await pc.waitForFunction(v=>terrainContext().state.boardState.sceneState[terrainContext().state.boardState.activeSceneId].fogOfWar.automaticEnabled===v,value,{timeout:60000});}
  async function mask(on){await pc.waitForFunction(expected=>{const c=document.getElementById('vision-prototype');if(!c||!c.width)return false;let opaque=false;if(!c.hidden){const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;for(let i=3;i<d.length;i+=4)if(d[i]){opaque=true;break;}}return opaque===expected&&!document.documentElement.classList.contains('vtt-player-visibility-pending');},on,{timeout:60000});}
  console.log('Checking initial automatic mask and portal glyphs');await mask(true);
  await pc.waitForFunction(()=>document.querySelector('#wall-portals [data-portal-type="door"]'),null,{timeout:60000});
  const portalProof=await pc.evaluate(()=>{
   const model=wallPrototype.model,nodes=new Map(model.nodes.map(n=>[n.id,n]));
   const near=model.segments.find(e=>e.interaction==='door'&&[nodes.get(e.a),nodes.get(e.b)].every(n=>n.y===26)&&Math.min(nodes.get(e.a).x,nodes.get(e.b).x)===23);
   const far=model.segments.find(e=>e.interaction==='window'&&[nodes.get(e.a),nodes.get(e.b)].every(n=>n.x===9)&&Math.min(nodes.get(e.a).y,nodes.get(e.b).y)===19);
   const glyph=id=>[...document.querySelectorAll('#wall-portals [data-portal-id]')].find(n=>n.dataset.portalId===id);
   return {nearVisible:!!glyph(near?.id),farHidden:!glyph(far?.id),readOnly:[...document.querySelectorAll('#wall-portals button')].every(n=>n.disabled)};
  });
  assert.deepEqual(portalProof,{nearVisible:true,farHidden:true,readOnly:true},'Visible doorway has a read-only player glyph; occluded window remains hidden');
  await gm.locator('[data-settings-launch="fog"]').evaluate(n=>n.click());
  const toggle=gm.locator('[data-automatic-fog]');assert.equal(await toggle.count(),1);assert.equal(await pc.locator('[data-automatic-fog]').count(),0);
  console.log('Checking synced fog off');await toggle.click();await flag(false);await mask(false);
  assert.equal(await pc.evaluate(()=>visionPrototype.tokenVisible('fog-toggle-sharon')),true);
  console.log('Checking off-state reload');await Promise.all([gm.reload(),pc.reload()]);await flag(false);await mask(false);assert.equal(await gm.locator('[data-automatic-fog]').isChecked(),false);
  await gm.locator('[data-settings-launch="fog"]').evaluate(n=>n.click());
  console.log('Checking restored fog');await gm.locator('[data-automatic-fog]').click();await flag(true);await mask(true);
  const prior=await snapshot(),bad=await pc.request.post(origin+'/dnd/vtt/api/v2/commands.php',{data:{type:'fog.set',sceneId:scene.id,operationId:crypto.randomUUID(),baseRevision:prior.revision,entityRevision:prior.state.sceneConfig[scene.id]._revision,payload:{fogOfWar:{automaticEnabled:false,byLevel:{}}}}});
  assert.ok(bad.status()>=400,await bad.text());assert.match((await bad.json()).error,/GM-only/);assert.equal((await snapshot()).state.sceneConfig[scene.id].fogOfWar.automaticEnabled,true);
  console.log('Checking no-viewer off/on and player authority');const removeState=await snapshot();
  await command('placement.batch',{actions:[{kind:'remove',sceneId:scene.id,placementId:'fog-toggle-sharon',entityRevision:removeState.state.placements[scene.id]['fog-toggle-sharon']._entityRevision}]});
  await pc.waitForFunction(()=>!terrainContext().state.boardState.placements[terrainContext().state.boardState.activeSceneId].some(p=>p.id==='fog-toggle-sharon'),null,{timeout:60000});await mask(true);
  await gm.locator('[data-automatic-fog]').click();await flag(false);await mask(false);
  assert.equal(await pc.evaluate(()=>visionPrototype.visible({x:0,y:0},0)),true,'Fog off exposes terrain without an owned viewer');
  await gm.locator('[data-automatic-fog]').click();await flag(true);await mask(true);
  await Promise.all([gm.reload(),pc.reload()]);await flag(true);await mask(true);assert.equal(await gm.locator('[data-automatic-fog]').isChecked(),true);
  const after=await snapshot();for(const id of Object.keys(before.state.placements))assert.deepEqual(after.state.placements[id],before.state.placements[id],'Original placements preserved');assert.deepEqual(errors,[]);
  console.log('PASS synced automatic fog off/on, no-viewer masks, reload persistence, GM-only control/authority, visible/read-only portal glyphs with occluded windows hidden, and original placement integrity');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
