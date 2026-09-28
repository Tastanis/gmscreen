const {chromium}=require('playwright'),assert=require('node:assert/strict');
const base=process.env.VTT_TEST_ORIGIN||'http://127.0.0.1:18795';
if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw Error('Loopback fixture required');
(async()=>{assert.equal((await(await fetch(base+'/diagnostic-manifest.json')).json()).test_fixture,'short-cliff');const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const p=await browser.newPage({viewport:{width:1280,height:900}}),errors=[],commands=[];
 p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(r.url().endsWith('/api/v2/commands.php')&&r.method()==='POST')commands.push(r.postDataJSON());});
 await p.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());await p.goto(base+'/test-login.php?user=GM');
 const snap=async()=>(await(await p.request.get(base+'/dnd/vtt/api/v2/snapshot.php')).json()).snapshot;
 let s=await snap();const source=s.state.routing.activeSceneId,original=s.state.placements[source];
 const pkg=(await(await p.request.get(base+'/dnd/vtt/api/v2/scene-export.php?sceneId='+source)).json()).package;
 pkg.scene.name='Disposable movement pan regression';pkg.domains.placements={};pkg.domains.drawings={};pkg.domains.templates={};pkg.domains.sceneConfig={grid:{size:150,visible:true,locked:false,offsetX:0,offsetY:0},mapLevels:{levels:[]}};
 const imported=await p.request.post(base+'/dnd/vtt/api/v2/scene-import.php',{data:{package:pkg,operationId:crypto.randomUUID(),allowPlayerBrowsing:true}});assert.equal(imported.status(),200,await imported.text());const scene=(await imported.json()).scene.id;
 async function cmd(type,payload){s=await snap();const r=await p.request.post(base+'/dnd/vtt/api/v2/commands.php',{data:{type,sceneId:scene,baseRevision:s.revision,entityRevision:type==='routing.set'?s.state.routing._revision:s.state.sceneConfig[scene]._revision,operationId:crypto.randomUUID(),payload}});assert.equal(r.status(),200,await r.text());}
 await cmd('routing.set',{routing:{activeSceneId:scene,playerActiveSceneId:scene,playerMapDisabled:false}});
 await cmd('environment.set',{field:'terrain',expectedRevision:0,value:{n:2,m:2,h:[2,2,2,2],bounds:{left:0,top:0,width:38,height:38}}});
 await cmd('placement.batch',{actions:[['pan-traveler',5],['pan-source',2]].map(([id,column])=>({kind:'add',sceneId:scene,placementId:id,placement:{id,name:id,column,row:15,width:1,height:1,levelId:'level-0',team:'ally',imageUrl:'/dnd/vtt/assets/images/terrain-walker.svg'}}))});
 const ready=async()=>{try{await p.waitForFunction(()=>window.terrainPrototype?.active&&window.terrainContext&&terrainContext().view.mapLoaded);}catch(e){console.error('load diagnostics',errors,await p.evaluate(()=>({terrain:window.terrainPrototype?.active,view:window.terrainContext?.().view.mapLoaded,body:document.body.innerText.slice(0,400)})));throw e;}};
 await p.reload();await ready();
 async function reset(mode='ground'){s=await snap();await cmd('placement.batch',{actions:[{kind:'patch',sceneId:scene,placementId:'pan-traveler',entityRevision:s.state.placements[scene]['pan-traveler']._entityRevision,movementKind:'teleport',patch:{column:5,row:15,movementMode:mode,flightHeight:mode==='ground'?null:3}}]});await p.reload();await ready();}
 async function point(column,row,flat=false){return p.evaluate(({column,row,flat})=>{const v=terrainContext().view,t=document.getElementById('vtt-map-transform'),r=t.getBoundingClientRect(),x=(v.gridOffsets.left||0)+(column+.5)*v.gridSize,y=(v.gridOffsets.top||0)+(row+.5)*v.gridSize,q=flat?{x,y}:terrainPrototype.project(x,y,terrainPrototype.heightAt(x,y));return{x:r.left+q.x*r.width/t.offsetWidth,y:r.top+q.y*r.height/t.offsetHeight};},{column,row,flat});}
 const state=()=>p.evaluate(()=>{const v=terrainContext().view;return{translation:{...v.translation},drag:!!v.dragState,candidate:!!v.dragCandidate,panning:v.isPanning,cursor:v.dragState?.cursorSquare?[...v.dragState.cursorSquare]:null};});
 const movementCommands=()=>commands.filter(c=>c.type==='token.move'||(c.type==='placement.batch'&&c.payload.actions.some(a=>a.patch&&('column'in a.patch||'row'in a.patch))));
 async function panAt(q,{leftHeld=false,leftFirst=false}={}){
  const before=await state(),count=movementCommands().length;
  await p.mouse.down({button:'right'});await p.mouse.move(q.x+65,q.y+35,{steps:8});
  const during=await state();assert.ok(during.panning);assert.ok(Math.abs(during.translation.x-before.translation.x-65)<1);assert.ok(Math.abs(during.translation.y-before.translation.y-35)<1);
  if(leftHeld){assert.ok(during.drag);assert.deepEqual(during.cursor,before.cursor);}
  assert.equal(movementCommands().length,count,'pan must not commit');
  if(leftFirst)await p.mouse.up({button:'left'});
  await p.mouse.up({button:'right'});assert.equal((await state()).panning,false);
  if(leftHeld&&!leftFirst)assert.ok((await state()).drag,'right release preserves drag');
 }
 for(const [mode,key,kind] of [['ground',null,'walk'],['ground','Shift','shift'],['ground','Control','forced'],['ground','Space','teleport'],['fly',null,'walk'],['hover','Control','forced']]){
  await reset(mode);let start=await point(5,15);await p.mouse.move(start.x,start.y);await p.mouse.wheel(0,-100);start=await point(5,15);
  if(key)await p.keyboard.down(key);await p.mouse.move(start.x,start.y);await p.mouse.down();const middle=await point(6,15);await p.mouse.move(middle.x,middle.y,{steps:10});assert.ok((await state()).drag,mode+' '+kind);
  let waypoints;
  if(mode==='ground'&&kind==='walk'){await p.keyboard.press('Shift');waypoints=await p.evaluate(async()=>(await import('/dnd/vtt/assets/js/ui/drag-ruler.js')).getCurrentMeasurementPoints());assert.ok(waypoints.length>=2);}
  await panAt(middle,{leftHeld:true});
  if(waypoints)assert.deepEqual(await p.evaluate(async()=>(await import('/dnd/vtt/assets/js/ui/drag-ruler.js')).getCurrentMeasurementPoints()),waypoints);
  const end=await point(7,15);await p.mouse.move(end.x,end.y,{steps:10});const before=movementCommands().length;await p.mouse.up();if(key)await p.keyboard.up(key);
  if(kind==='teleport'&&await p.locator('[data-teleport-choice]').count()){await p.waitForFunction(()=>document.querySelector('[data-teleport-choice]')?.dataset.ready==='true');await p.locator('[data-teleport-choice]').getByRole('button',{name:/^Ground /}).click();}
  await p.waitForFunction(scene=>terrainContext().state.boardState.placements[scene].find(t=>t.id==='pan-traveler')?.column===7,scene);
  assert.equal(movementCommands().length,before+1,'exactly one move');const command=movementCommands().at(-1);assert.equal(command.payload.movementKind||command.payload.actions?.[0]?.movementKind,kind);
  console.log('PASS combined buttons',mode,kind);
 }
 await reset();let start=await point(5,15);await p.mouse.move(start.x,start.y);await p.mouse.down();let middle=await point(6,15);await p.mouse.move(middle.x,middle.y,{steps:10});await panAt(middle,{leftHeld:true,leftFirst:true});await p.waitForFunction(scene=>terrainContext().state.boardState.placements[scene].find(t=>t.id==='pan-traveler')?.column===6,scene);console.log('PASS left release first commits once');
 for(const verb of ['push','pull','slide','teleport']){
  await reset();await p.evaluate(({verb})=>{window.panResult=null;document.dispatchEvent(new CustomEvent(verb==='teleport'?'vtt:automation-apply-teleport':'vtt:automation-force-move',{detail:{payload:{targetId:'pan-traveler',sourcePlacement:{id:'pan-source'},distance:3,verb},resolve:r=>window.panResult=r,reject:e=>window.panResult={error:e.message}}}));},{verb});await p.waitForSelector('[data-automation-move-ghost]');
  const destination=verb==='pull'?4:6,q=await point(destination,15);await p.mouse.move(q.x,q.y);await panAt(q);assert.equal(await p.evaluate(()=>window.panResult),null,'pan preserves picker');
  const end=await point(destination,15);await p.mouse.move(end.x,end.y);const ghost=p.locator('[data-automation-move-ghost]');assert.equal(await ghost.getAttribute('data-column'),String(destination));
  const before=movementCommands().length;await p.mouse.click(end.x,end.y);
  if(verb==='teleport'){await p.waitForFunction(()=>document.querySelector('[data-teleport-choice]')?.dataset.ready==='true');await p.locator('[data-teleport-choice]').getByRole('button',{name:/^Ground /}).click();}
  await p.waitForFunction(()=>window.panResult!==null);assert.equal(await p.evaluate(()=>panResult.error),undefined);assert.equal((await snap()).state.placements[scene]['pan-traveler'].column,destination);assert.equal(movementCommands().length,before+1);console.log('PASS panning ability',verb);
 }
 await reset();start=await point(5,15);await p.mouse.move(start.x,start.y);await p.mouse.down();assert.ok((await state()).candidate);await panAt(start);assert.ok((await state()).candidate);middle=await point(6,15);await p.mouse.move(middle.x,middle.y,{steps:10});assert.ok((await state()).drag);
 let count=movementCommands().length;await p.evaluate(()=>{const v=terrainContext().view;document.getElementById('vtt-map-surface').dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerId:v.dragState.pointerId,pointerType:'mouse'}));});await p.mouse.up();assert.equal((await state()).drag,false);assert.equal(movementCommands().length,count);console.log('PASS pre-activation camera pan and canceled drag');
 await reset();await p.evaluate(()=>{window.panResult=null;document.dispatchEvent(new CustomEvent('vtt:automation-apply-teleport',{detail:{payload:{targetId:'pan-traveler',distance:3},resolve:r=>window.panResult=r,reject:e=>window.panResult={error:e.message}}}));});await p.waitForSelector('[data-automation-move-ghost]');middle=await point(6,15);await p.mouse.move(middle.x,middle.y);await panAt(middle);count=movementCommands().length;await p.keyboard.press('Escape');assert.equal(await p.locator('[data-automation-move-ghost]').count(),0);assert.equal(movementCommands().length,count);console.log('PASS picker Escape after panning');
 await reset();const sourcePoint=await point(2,15);await p.mouse.click(sourcePoint.x,sourcePoint.y);start=await point(5,15);await p.keyboard.down('Control');await p.mouse.click(start.x,start.y);await p.keyboard.up('Control');await p.mouse.move(start.x,start.y);await p.mouse.down();middle=await point(6,15);await p.mouse.move(middle.x,middle.y,{steps:10});assert.equal((await state()).cursor.length,2);await panAt(middle,{leftHeld:true});count=movementCommands().length;await p.mouse.up();await p.waitForFunction(scene=>terrainContext().state.boardState.placements[scene].find(t=>t.id==='pan-traveler')?.column===6,scene);s=await snap();assert.equal(s.state.placements[scene]['pan-source'].column,3);assert.equal(movementCommands().length,count+1);console.log('PASS selected group preserved and committed once');
 await reset();s=await snap();await cmd('placement.batch',{actions:[{kind:'patch',sceneId:scene,placementId:'pan-traveler',entityRevision:s.state.placements[scene]['pan-traveler']._entityRevision,patch:{visionOwners:['sharon']}}]});await p.goto(base+'/test-login.php?user=sharon');await ready();await p.evaluate(scene=>localStorage.setItem('last-owned-view:sharon:'+scene,'pan-traveler'),scene);await p.reload();await ready();start=await point(5,15);await p.mouse.move(start.x,start.y);await p.mouse.down();middle=await point(6,15);await p.mouse.move(middle.x,middle.y,{steps:10});assert.ok((await state()).drag);await panAt(middle,{leftHeld:true});count=movementCommands().length;await p.mouse.up();await p.waitForFunction(scene=>terrainContext().state.boardState.placements[scene].find(t=>t.id==='pan-traveler')?.column===6,scene);assert.equal(movementCommands().length,count+1);console.log('PASS actual player combined-button movement');
 await p.goto(base+'/test-login.php?user=GM');assert.deepEqual((await snap()).state.placements[source],original);assert.deepEqual(errors,[]);console.log('PASS unchanged original scene, no browser errors');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
