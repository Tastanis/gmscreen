const {chromium}=require('playwright'),assert=require('node:assert/strict');
const base=process.env.VTT_TEST_ORIGIN||'http://127.0.0.1:18795';
if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw Error('Loopback fixture required');
(async()=>{assert.equal((await(await fetch(base+'/diagnostic-manifest.json')).json()).test_fixture,'playtest-fixes');const b=await chromium.launch({channel:'chrome',headless:true,args:['--disk-cache-size=1048576']});try{
 const errors=[],pages=[],scene='scn_6229fb476a9c',id='qa-basement-'+Date.now();
 async function page(user){const c=await b.newContext({viewport:{width:1440,height:1000}}),p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));await p.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());await p.goto(base+'/test-login.php?user='+user);pages.push(p);await p.waitForFunction(()=>window.terrainPrototype?.active&&terrainContext().view.mapLoaded);return p;}
 const gm=await page('GM'),snap=async()=>(await(await gm.request.get(base+'/dnd/vtt/api/v2/snapshot.php')).json()).snapshot;
 const old=await snap(),stale=Object.values(old.state.placements[scene]).filter(p=>p.id.startsWith('qa-basement-'));
 if(stale.length){const r=await gm.request.post(base+'/dnd/vtt/api/v2/commands.php',{data:{type:'placement.batch',operationId:crypto.randomUUID(),baseRevision:old.revision,payload:{actions:stale.map(p=>({kind:'remove',sceneId:scene,placementId:p.id,entityRevision:p._entityRevision}))}}});assert.equal(r.status(),200,await r.text());}
 const original=(await snap()).state.placements[scene],source=original['bathhouse-test-vision-blue'];
 const token={id,name:'Basement QA',team:'ally',visionOwners:['cal'],column:16,row:9,width:1,height:1,levelId:'bath-level-0',imageUrl:source.imageUrl};
 const s=await snap(),add=await gm.request.post(base+'/dnd/vtt/api/v2/commands.php',{data:{type:'placement.batch',operationId:crypto.randomUUID(),baseRevision:s.revision,payload:{actions:[{kind:'add',sceneId:scene,placementId:id,placement:token}]}}});assert.equal(add.status(),200,await add.text());
 const cal=await page('cal'),sharon=await page('sharon');await cal.evaluate(({scene,id})=>localStorage.setItem('last-owned-view:cal:'+scene,id),{scene,id});await cal.reload();await cal.waitForFunction(id=>window.visionPrototype?.viewerTokenId===id,id);
 async function drag(column,row){const box=await cal.locator('#vtt-token-layer [data-placement-id="'+id+'"]').boundingBox();assert.ok(box);
 const end=await cal.evaluate(({id,column,row})=>{const c=terrainContext(),v=c.view,t=document.getElementById('vtt-map-transform'),r=t.getBoundingClientRect(),p=c.state.boardState.placements[c.state.boardState.activeSceneId].find(p=>p.id===id),x=(v.gridOffsets.left||0)+(column+.5)*v.gridSize,y=(v.gridOffsets.top||0)+(row+.5)*v.gridSize,z=row>=13?0:terrainPrototype.groundFor({...p,column,row}),q=terrainPrototype.project(x,y,z);return{x:r.left+q.x*r.width/t.offsetWidth,y:r.top+q.y*r.height/t.offsetHeight};},{id,column,row});
 await cal.mouse.move(box.x+box.width/2,box.y+box.height/2);await cal.mouse.down();await cal.mouse.move(end.x,end.y,{steps:22});await cal.mouse.up();
 try{await cal.waitForFunction(({id,column,row})=>{const t=terrainContext().state.boardState.placements[terrainContext().state.boardState.activeSceneId].find(p=>p.id===id);return t.column===column&&t.row===row;},{id,column,row},{timeout:12000});}catch(e){console.log('MOVE FAILED',column,row,(await snap()).state.placements[scene][id]);throw e;}}
 await drag(16,11);assert.equal((await snap()).state.placements[scene][id]._floorTraversal.entry,'green');
 await drag(16,13);
 for(const [column,row] of [[16,14],[16,15],[15,15]])await drag(column,row);
 for(const p of pages)await p.waitForFunction(({scene,id})=>{const t=terrainContext().state.boardState.placements[scene].find(p=>p.id===id);return t.levelId==='level-0'&&t._supportSurfaceId==='bath-floor--1-0'&&terrainPrototype.groundFor(t)===0;},{scene,id});
 const inspect=()=>cal.evaluate(async(id)=>{const c=terrainContext(),t=c.state.boardState.placements[c.state.boardState.activeSceneId].find(p=>p.id===id),{teleportSurfaces}=await import('/dnd/vtt/assets/js/ui/teleport-choice.js');const choices=teleportSurfaces({from:t,to:{column:15,row:14},context:c,ground:(x,y)=>{const v=c.view;return terrainPrototype.heightAt((v.gridOffsets.left||0)+x*v.gridSize,(v.gridOffsets.top||0)+y*v.gridSize);}});return {choices,sight:visionPrototype.visible({x:14.5,y:14.5},.01),support:terrainPrototype.groundFor(t)};},id);
 await cal.waitForFunction(id=>visionPrototype.viewerTokenId===id&&visionPrototype.stats.paints>0,id);
 let view=await inspect();assert.ok(view.sight,'Basement floor visible');assert.equal(view.choices.filter(c=>Math.round(c.height)+1===1).length,1,'One accessible basement landing');assert.equal(view.choices.find(c=>c.height===0).surfaceId,'bath-floor--1-0');
 await cal.reload();await cal.waitForFunction(id=>window.visionPrototype?.viewerTokenId===id&&visionPrototype.stats.paints>0,id);view=await inspect();assert.equal(view.support,0);assert.ok(view.sight);
 const falls=(await(await gm.request.get(base+'/dnd/vtt/api/v2/collision-effects.php')).json()).result;assert.equal(falls.filter(f=>f.targetId===id&&f.kind==='fall').length,0,'No false fall');
 const after=(await snap()).state.placements[scene];delete after[id];assert.deepEqual(after,original);assert.deepEqual(errors,[]);
 await cal.screenshot({path:'.playwright-mcp/basement-support-fixed.png'});
 console.log('PASS actual Bathhouse stair descent, basement walking, exact support on three clients, visible floor, one landing choice, reload, no false falls, original tokens unchanged');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});
