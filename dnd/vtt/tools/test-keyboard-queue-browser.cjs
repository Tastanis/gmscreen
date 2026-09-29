const {chromium}=require('playwright'),assert=require('node:assert/strict');
const base=process.env.VTT_TEST_ORIGIN||'http://127.0.0.1:18795';
if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw Error('Loopback fixture required');
(async()=>{assert.equal((await(await fetch(base+'/diagnostic-manifest.json')).json()).test_fixture,'playtest-fixes');const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disk-cache-size=1048576']});try{
 const errors=[],dialogs=[],pages=[];
 async function page(user){const c=await browser.newContext({viewport:{width:1600,height:1000}}),p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('dialog',async d=>{dialogs.push(d.message());await d.dismiss();});await p.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());await p.goto(base+'/test-login.php?user='+user);pages.push(p);return p;}
 const gm=await page('GM'),snapshot=async()=>(await(await gm.request.get(base+'/dnd/vtt/api/v2/snapshot.php')).json()).snapshot;
 const original=(await snapshot()).state.placements['scn_6229fb476a9c'];
 const pkg=(await(await gm.request.get(base+'/dnd/vtt/api/v2/scene-export.php?sceneId=scn_6229fb476a9c')).json()).package;
 pkg.scene.name='Disposable keyboard queue';pkg.domains.placements={};pkg.domains.templates={};pkg.domains.drawings={};pkg.domains.sceneConfig={grid:{size:150,visible:true,locked:false,offsetX:0,offsetY:0},mapLevels:{levels:[]}};
 const imp=await gm.request.post(base+'/dnd/vtt/api/v2/scene-import.php',{data:{package:pkg,operationId:crypto.randomUUID(),allowPlayerBrowsing:true}});assert.equal(imp.status(),200,await imp.text());const scene=(await imp.json()).scene;
 async function cmd(type,payload){const s=await snapshot(),r=await gm.request.post(base+'/dnd/vtt/api/v2/commands.php',{data:{type,sceneId:scene.id,operationId:crypto.randomUUID(),baseRevision:s.revision,entityRevision:type==='routing.set'?s.state.routing._revision:s.state.sceneConfig[scene.id]._revision,payload}});assert.equal(r.status(),200,await r.text());return r.json();}
 async function batch(actions){const s=await snapshot();return cmd('placement.batch',{actions:actions.map(a=>({...a,sceneId:scene.id,entityRevision:s.state.placements[scene.id]?.[a.placementId]?._entityRevision}))});}
 await cmd('routing.set',{routing:{activeSceneId:scene.id,mapUrl:scene.mapUrl,playerActiveSceneId:scene.id,playerMapUrl:scene.mapUrl,playerMapDisabled:false}});
 await gm.reload();await gm.waitForFunction(()=>window.terrainContext?.().view.mapLoaded);
 const bounds=await gm.evaluate(()=>{const v=terrainContext().view,i=document.getElementById('vtt-map-image');return{left:((v.mapInsets.left||0)-(v.gridOffsets.left||0))/v.gridSize,top:((v.mapInsets.top||0)-(v.gridOffsets.top||0))/v.gridSize,width:i.naturalWidth/v.gridSize,height:i.naturalHeight/v.gridSize};});

 const a={id:'queue-a',name:'Queue A',team:'ally',visionOwners:['cal'],column:4,row:14,width:1,height:1,levelId:'level-0',imageUrl:'/dnd/vtt/assets/images/terrain-walker.svg'},b={...a,id:'queue-b',name:'Queue B',row:16};
 await batch([{kind:'add',placementId:a.id,placement:a},{kind:'add',placementId:b.id,placement:b}]);
 const cal=await page('cal');await cal.waitForFunction(()=>window.terrainContext?.().view.mapLoaded);
 let mode='ok',latency=0,calls=[];
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 await cal.route('**/api/v2/commands.php',async route=>{
  const body=route.request().postDataJSON();if(!['token.move','placement.batch'].includes(body.type)){await route.continue();return;}
  const record={body,time:Date.now(),done:false};calls.push(record);const kind=mode,delay=latency;
  if(kind==='reject'){await sleep(delay);await route.fulfill({status:422,contentType:'application/json',body:JSON.stringify({success:false,error:'Keyboard regression rejection'})});}
  else{const response=await route.fetch();record.status=response.status();await sleep(delay);if(kind==='timeout')await route.abort('timedout');else await route.fulfill({response});}
  record.done=true;
 });
 async function select(id,additive=false){if(additive)await cal.keyboard.down('Control');await cal.locator('#vtt-token-layer [data-placement-id="'+id+'"]').click();if(additive)await cal.keyboard.up('Control');await cal.locator('#vtt-board-canvas').focus();}
 async function reset(){mode='ok';latency=0;await batch([{kind:'patch',placementId:a.id,movementKind:'teleport',patch:{column:4,row:14}},{kind:'patch',placementId:b.id,movementKind:'teleport',patch:{column:4,row:16}}]);const expected=(await snapshot()).state.placements[scene.id];await cal.waitForFunction(({scene,expected})=>terrainContext().state.boardState.placements[scene].filter(p=>p.id.startsWith('queue-')).every(p=>p.column===4&&p.row===expected[p.id].row&&p._syncV2EntityRevision===expected[p.id]._entityRevision),{scene:scene.id,expected});await select(a.id);calls=[];}
 async function keys(list){for(const key of list)await cal.keyboard.press(key);return Date.now();}
 async function settled(ms=4500){await sleep(ms);assert.ok(calls.every(c=>c.done),'All test-delayed requests settled');}
 const unique=()=>[...new Set(calls.map(c=>c.body.operationId))];
 await reset();latency=1200;let released=await keys(Array(50).fill('ArrowRight'));await settled(5000);assert.ok(unique().length>=1&&unique().length<=4);assert.ok(calls.every(c=>c.time<=released+3100));assert.equal((await snapshot()).state.placements[scene.id][a.id].column,4+unique().length);console.log('PASS 50-arrow slow burst stops issuing within 3 seconds of release:',unique().length,'moves');
 await reset();released=await keys(['ArrowRight','ArrowRight','ArrowDown','ArrowLeft']);await settled(1800);assert.equal(unique().length,4);let saved=(await snapshot()).state.placements[scene.id][a.id];assert.equal(saved.column,5);assert.equal(saved.row,15);console.log('PASS short responsive burst and direction changes');
 await reset();latency=900;for(let i=0;i<60;i++){await cal.keyboard.down('ArrowRight');await sleep(40);}await cal.keyboard.up('ArrowRight');released=Date.now();await settled(4300);assert.ok(calls.every(c=>c.time<=released+3100));assert.ok(unique().length>2);console.log('PASS held auto-repeat expires after release');
 await reset();latency=1200;await keys(Array(20).fill('ArrowRight'));await select(b.id);await select(a.id);await settled(4000);assert.equal(unique().length,1);console.log('PASS selection away/back discards unsent inputs');
 await reset();await select(b.id,true);latency=1200;released=await keys(Array(50).fill('ArrowRight'));await settled(5000);assert.ok(unique().length>=1&&unique().length<=4);assert.ok(calls.every(c=>c.body.type==='placement.batch'&&c.time<=released+3100));saved=(await snapshot()).state.placements[scene.id];assert.equal(saved[a.id].column,saved[b.id].column);console.log('PASS group moves stay atomic with bounded backlog');
 await reset();mode='reject';latency=250;await keys(Array(10).fill('ArrowRight'));await settled(1800);assert.equal(unique().length,1);assert.equal((await snapshot()).state.placements[scene.id][a.id].column,4);console.log('PASS rejection clears pending arrows');
 await reset();mode='timeout';latency=1600;await keys(Array(10).fill('ArrowRight'));await settled(5200);assert.equal(unique().length,1,'Only the already-issued operation may receive its existing transport retry');assert.equal((await snapshot()).state.placements[scene.id][a.id].column,5,'Uncertain accepted move never applies twice');console.log('PASS lost response preserves accepted move and drops backlog');
 await reset();latency=1200;await keys(Array(10).fill('ArrowRight'));await cmd('routing.set',{routing:{activeSceneId:'scn_6229fb476a9c',playerActiveSceneId:'scn_6229fb476a9c',mapUrl:pkg.scene.mapUrl,playerMapUrl:pkg.scene.mapUrl,playerMapDisabled:false}});await settled(4000);assert.equal(unique().length,1);assert.deepEqual((await snapshot()).state.placements['scn_6229fb476a9c'],original);assert.deepEqual(errors,[]);console.log('PASS scene switch clears unsent arrows; original tokens unchanged; no page errors');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
