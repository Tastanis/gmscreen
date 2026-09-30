const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const origin=process.env.VTT_TEST_ORIGIN||'http://127.0.0.1:18796';
if(!['127.0.0.1','localhost'].includes(new URL(origin).hostname))throw Error('Disposable loopback fixture required');
if(!process.env.VTT_TEST_PACKAGE)throw Error('VTT_TEST_PACKAGE must name a local scene package');
(async()=>{
 assert.equal((await(await fetch(origin+'/diagnostic-manifest.json')).json()).test_fixture,'vision-performance');
 const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[],calls=[];
 try{
  const admin=await browser.newContext();await admin.request.get(origin+'/test-login.php?user=GM');
  const snapshot=async()=>(await(await admin.request.get(origin+'/dnd/vtt/api/v2/snapshot.php')).json()).snapshot;
  const before=await snapshot(),pkg=JSON.parse(fs.readFileSync(process.env.VTT_TEST_PACKAGE,'utf8').replace(/^\uFEFF/,''));
  pkg.scene.name='Disposable Wall teleport';pkg.domains.placements={};pkg.domains.templates={};pkg.domains.drawings={};
  pkg.domains.sceneConfig={grid:{size:75,visible:true,locked:false,offsetX:0,offsetY:0},mapLevels:{levels:[]},userLevelState:{},fogOfWar:{automaticEnabled:true,byLevel:{}},environment:{terrain:{revision:1,value:{n:2,m:2,h:[0,0,0,0],bounds:{left:0,top:0,width:38,height:38}}},walls:{revision:1,value:{version:1,nodes:[],segments:[],roofs:[]}}}};
  const imported=await admin.request.post(origin+'/dnd/vtt/api/v2/scene-import.php',{data:{package:pkg,operationId:crypto.randomUUID(),allowPlayerBrowsing:true}});assert.equal(imported.status(),200,await imported.text());const scene=(await imported.json()).scene;
  async function cmd(type,payload,extra={}){const s=await snapshot();const response=await admin.request.post(origin+'/dnd/vtt/api/v2/commands.php',{data:{type,sceneId:scene.id,operationId:crypto.randomUUID(),baseRevision:s.revision,entityRevision:type==='routing.set'?s.state.routing._revision:0,payload,...extra}});assert.equal(response.status(),200,await response.text());}
  const squares=[];for(const column of [8,9])for(const elevation of [0,1,2])squares.push({column,row:8,elevation});
  await cmd('template.upsert',{template:{id:'qa-wall-stack',type:'wall',levelId:'level-0',wallColor:'stone',squares}},{entityId:'qa-wall-stack'});
  await cmd('placement.batch',{actions:[{kind:'add',sceneId:scene.id,placementId:'qa-wall-traveler',placement:{id:'qa-wall-traveler',name:'Wall traveler',profileId:'cal',visionOwners:['cal'],column:6,row:8,width:1,height:1,levelId:'level-0',team:'ally',movementMode:'ground',imageUrl:'/dnd/vtt/assets/images/terrain-walker.svg'}}]});
  await cmd('routing.set',{routing:{activeSceneId:scene.id,playerActiveSceneId:scene.id,mapUrl:scene.mapUrl,playerMapUrl:scene.mapUrl,playerMapDisabled:false}});
  async function client(user){const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/test-login.php?user='+user);await page.waitForFunction(()=>window.terrainPrototype?.active&&window.terrainContext?.().view.mapLoaded,null,{timeout:60000});return{context,page};}
  const gm=await client('GM'),cal=await client('cal'),sharon=await client('sharon'),clients=[gm,cal,sharon];
  cal.page.on('response',response=>{if(response.url().endsWith('/api/v2/commands.php'))calls.push({status:response.status(),command:response.request().postDataJSON()});});
  await cal.page.waitForFunction(()=>!document.documentElement.classList.contains('vtt-player-visibility-pending'),null,{timeout:60000});
  const selector='#vtt-token-layer [data-placement-id="qa-wall-traveler"]';
  const start=await cal.page.locator(selector).boundingBox();assert.ok(start);
  const end=await cal.page.evaluate(()=>{const c=terrainContext(),t=document.getElementById('vtt-map-transform'),r=t.getBoundingClientRect(),p=terrainPrototype.project((c.view.gridOffsets.left||0)+8.5*c.view.gridSize,(c.view.gridOffsets.top||0)+8.5*c.view.gridSize,0);return{x:r.left+p.x*r.width/t.offsetWidth,y:r.top+p.y*r.height/t.offsetHeight};});
  await cal.page.mouse.move(start.x+start.width/2,start.y+start.height/2);await cal.page.mouse.down();await cal.page.mouse.move(end.x,end.y,{steps:20});await cal.page.keyboard.down('Space');await cal.page.mouse.up();await cal.page.keyboard.up('Space');
  await cal.page.waitForFunction(()=>document.querySelector('[data-teleport-choice]')?.dataset.ready==='true',null,{timeout:15000});
  const options=await cal.page.locator('.vtt-teleport-choice__location').allTextContents();assert.deepEqual(options,['Wall4']);
  await cal.page.locator('[data-teleport-choice]').getByRole('button',{name:'Wall 4',exact:true}).click();
  await cal.page.waitForFunction(()=>terrainContext().state.boardState.placements[terrainContext().state.boardState.activeSceneId]?.find(p=>p.id==='qa-wall-traveler')?._supportSurfaceId==='template-cube:qa-wall-stack:8,8,2',null,{timeout:30000});
  const expected='template-cube:qa-wall-stack:8,8,2',landed=(await snapshot()).state.placements[scene.id]['qa-wall-traveler'];
  assert.equal(landed.column,8);assert.equal(landed.row,8);assert.equal(landed._supportSurfaceId,expected);assert.equal(landed.movementMode,'ground');
  const moves=calls.filter(c=>c.command.type==='token.move');assert.equal(moves.length,1);assert.equal(moves[0].status,200);assert.equal(moves[0].command.payload.movementKind,'teleport');assert.equal(moves[0].command.payload.teleportChoice.height,3);
  const receipt=await cal.context.request.get(origin+'/dnd/vtt/api/v2/collision-effects.php?operationId='+encodeURIComponent(moves[0].command.operationId));assert.equal(receipt.status(),200);assert.deepEqual((await receipt.json()).result,[],'Landing on chosen support creates no fall receipt.');
  for(const c of clients){await c.page.waitForFunction(expected=>{const p=terrainContext().state.boardState.placements[terrainContext().state.boardState.activeSceneId]?.find(p=>p.id==='qa-wall-traveler');return p?._supportSurfaceId===expected&&terrainPrototype.groundFor(p)===3;},expected,{timeout:30000});await c.page.reload();await c.page.waitForFunction(expected=>{const p=window.terrainContext?.().state.boardState.placements[terrainContext().state.boardState.activeSceneId]?.find(p=>p.id==='qa-wall-traveler');return terrainContext().view.mapLoaded&&p?._supportSurfaceId===expected&&terrainPrototype.groundFor(p)===3;},expected,{timeout:60000});assert.equal(await c.page.locator('.uik-modal').count(),0,'Reload does not invent a fall prompt.');}
  const after=await snapshot();assert.deepEqual(after.state.placements[scene.id]['qa-wall-traveler'],landed,'Reload does not mutate canonical landing.');for(const id of Object.keys(before.state.placements))assert.deepEqual(after.state.placements[id],before.state.placements[id]);for(const id of Object.keys(before.state.sceneConfig))assert.deepEqual(after.state.sceneConfig[id],before.state.sceneConfig[id]);assert.deepEqual(errors,[]);
  console.log('PASS actual player Space-drag → Wall4 → one accepted canonical height3 teleport, retained cube support/height on GM+Cal+Sharon and reload, no fall receipt/prompt, original scene state unchanged');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
