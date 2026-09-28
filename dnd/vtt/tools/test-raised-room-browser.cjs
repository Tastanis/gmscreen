const {chromium}=require('playwright'),assert=require('node:assert/strict');
const base=process.env.VTT_TEST_ORIGIN||'http://127.0.0.1:18795';
if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw Error('Loopback fixture required');
(async()=>{assert.equal((await(await fetch(base+'/diagnostic-manifest.json')).json()).test_fixture,'playtest-fixes');const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disk-cache-size=1048576']});try{
 const errors=[],dialogs=[],pages=[];
 async function page(user){const c=await browser.newContext({viewport:{width:1600,height:1000}}),p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('dialog',async d=>{dialogs.push(d.message());await d.dismiss();});await p.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());await p.goto(base+'/test-login.php?user='+user);pages.push(p);return p;}
 const gm=await page('GM'),snapshot=async()=>(await(await gm.request.get(base+'/dnd/vtt/api/v2/snapshot.php')).json()).snapshot;
 const original=(await snapshot()).state.placements['scn_6229fb476a9c'];
 const pkg=(await(await gm.request.get(base+'/dnd/vtt/api/v2/scene-export.php?sceneId=scn_6229fb476a9c')).json()).package;
 pkg.scene.name='Disposable raised-room regression';pkg.domains.placements={};pkg.domains.templates={};pkg.domains.drawings={};pkg.domains.sceneConfig={grid:{size:150,visible:true,locked:false,offsetX:0,offsetY:0},mapLevels:{levels:[]}};
 const imp=await gm.request.post(base+'/dnd/vtt/api/v2/scene-import.php',{data:{package:pkg,operationId:crypto.randomUUID(),allowPlayerBrowsing:true}});assert.equal(imp.status(),200,await imp.text());const scene=(await imp.json()).scene;
 async function cmd(type,payload){const s=await snapshot(),r=await gm.request.post(base+'/dnd/vtt/api/v2/commands.php',{data:{type,sceneId:scene.id,operationId:crypto.randomUUID(),baseRevision:s.revision,entityRevision:type==='routing.set'?s.state.routing._revision:s.state.sceneConfig[scene.id]._revision,payload}});assert.equal(r.status(),200,await r.text());return r.json();}
 async function batch(actions){const s=await snapshot();return cmd('placement.batch',{actions:actions.map(a=>({...a,sceneId:scene.id,entityRevision:s.state.placements[scene.id]?.[a.placementId]?._entityRevision}))});}
 await cmd('routing.set',{routing:{activeSceneId:scene.id,mapUrl:scene.mapUrl,playerActiveSceneId:scene.id,playerMapUrl:scene.mapUrl,playerMapDisabled:false}});
 await gm.reload();await gm.waitForFunction(()=>window.terrainContext?.().view.mapLoaded);
 const bounds=await gm.evaluate(()=>{const v=terrainContext().view,i=document.getElementById('vtt-map-image');return{left:((v.mapInsets.left||0)-(v.gridOffsets.left||0))/v.gridSize,top:((v.mapInsets.top||0)-(v.gridOffsets.top||0))/v.gridSize,width:i.naturalWidth/v.gridSize,height:i.naturalHeight/v.gridSize};});

 await cmd('levels.set',{mapLevels:{levels:[{id:'room',name:'Ground room',elevationSquares:2,zIndex:0,imageUrl:scene.mapUrl,cutouts:[]}]}});
 const walls={version:1,nodes:[{id:'a',x:8,y:10},{id:'b',x:8,y:16}],segments:[{id:'door',a:'a',b:'b',baseMode:'fixed',base:2,height:3,interaction:'door',open:true}],roofs:[{id:'plate',kind:'floor',levelId:'room',height:2,points:[{x:8,y:10},{x:20,y:10},{x:20,y:16},{x:8,y:16}]}],ramps:[]};
 await cmd('environment.set',{field:'walls',expectedRevision:0,value:walls});
 const token={id:'room-walker',name:'Cal',profileId:'cal',team:'ally',visionOwners:['cal'],column:6,row:12,width:1,height:1,levelId:'level-0',imageUrl:'/dnd/vtt/assets/images/terrain-walker.svg'};
 await batch([{kind:'add',placementId:token.id,placement:token},...['room','level-0'].map((levelId,i)=>({kind:'add',placementId:'goblin-'+i,placement:{id:'goblin-'+i,name:'Goblin '+i,team:'enemy',column:16,row:12,width:1,height:1,levelId,imageUrl:token.imageUrl}}))]);
 const cal=await page('cal'),sharon=await page('sharon');
 const ready=p=>p.waitForFunction(()=>window.terrainPrototype?.active&&window.terrainContext&&terrainContext().view.mapLoaded);
 const check=async(height)=>{for(const p of pages)await p.waitForFunction(({scene,height})=>{const t=terrainContext().state.boardState.placements[scene]?.find(t=>t.id==='room-walker');return t?.levelId==='room'&&Math.abs(terrainPrototype.groundFor(t)-height)<1e-6;},{scene:scene.id,height});};
 async function reset(){await batch([{kind:'patch',placementId:token.id,movementKind:'teleport',patch:{column:6,row:12,levelId:'level-0',movementMode:'ground'}}]);await cal.waitForFunction(scene=>terrainContext().state.boardState.placements[scene]?.find(t=>t.id==='room-walker')?.column===6,scene.id);}
 async function move(kind){const s=await snapshot(),t=s.state.placements[scene.id][token.id],r=await cal.request.post(base+'/dnd/vtt/api/v2/commands.php',{data:{type:'token.move',sceneId:scene.id,entityId:t.id,operationId:crypto.randomUUID(),baseRevision:s.revision,entityRevision:t._entityRevision,payload:{column:14,row:12,movementKind:kind}}});assert.equal(r.status(),200,await r.text());}
 async function drag(){const box=await cal.locator('#vtt-token-layer [data-placement-id="room-walker"]').boundingBox();assert.ok(box);const end=await cal.evaluate(()=>{const v=terrainContext().view,t=document.getElementById('vtt-map-transform'),r=t.getBoundingClientRect(),x=(v.gridOffsets.left||0)+14.5*v.gridSize,y=(v.gridOffsets.top||0)+12.5*v.gridSize,q=terrainPrototype.project(x,y,terrainPrototype.heightAt(x,y));return{x:r.left+q.x*r.width/t.offsetWidth,y:r.top+q.y*r.height/t.offsetHeight};});await cal.mouse.move(box.x+box.width/2,box.y+box.height/2);await cal.mouse.down();await cal.mouse.move(end.x,end.y,{steps:20});await cal.mouse.up();}
 for(const [label,outside,inside,height] of [['flush',2,2,2],['slope',2,0,2],['basement',2,0,2],['lower plate',2,0,1.9],['higher outside',2.05,0,2],['negative basement',0,-2,0]]){
  const n=Math.ceil(bounds.width*8)+1,h=Array.from({length:n},(_,i)=>{const x=bounds.left+i*bounds.width/(n-1);return x<=8?outside:label==='slope'?Math.max(inside,outside-(x-8)/3):inside;});
  let s=await snapshot();await cmd('environment.set',{field:'terrain',expectedRevision:s.state.sceneConfig[scene.id].environment?.terrain?.revision||0,value:{n,m:2,h:[...h,...h],bounds}});
  walls.roofs[0].height=height;s=await snapshot();await cmd('environment.set',{field:'walls',expectedRevision:s.state.sceneConfig[scene.id].environment.walls.revision,value:walls});
  for(const p of pages){await p.reload();await ready(p);}
  for(const kind of ['walk','shift','forced']){await reset();await move(kind);await check(height);}
  await reset();await drag();await check(height);
  await batch([{kind:'patch',placementId:token.id,patch:{levelId:'level-0',movementMode:'fly',flightHeight:3}}]);
  await batch([{kind:'patch',placementId:token.id,patch:{movementMode:'ground'}}]);await check(height);
  await cal.reload();await ready(cal);await check(height);
  await cal.waitForFunction(()=>visionPrototype?.viewerTokenId==='room-walker'&&document.documentElement.classList.contains('height-vision-active')&&visionPrototype.stats.paints>0);
  assert.equal(await cal.evaluate(()=>visionPrototype.tokenVisible('goblin-0')),true,'Room enemy visible');
  if(label!=='flush')assert.equal(await cal.evaluate(()=>visionPrototype.tokenVisible('goblin-1')),false,'Basement enemy hidden');
  console.log('PASS',label,'walk/shift/forced, real drag, landing and reload on three clients');
 }
 assert.deepEqual((await snapshot()).state.placements['scn_6229fb476a9c'],original);assert.deepEqual(errors,[]);console.log('PASS original scene tokens unchanged; no page errors');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
