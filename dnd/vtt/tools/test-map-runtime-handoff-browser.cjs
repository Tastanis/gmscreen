const {chromium}=require('playwright'),assert=require('node:assert/strict');
const base=process.env.VTT_TEST_ORIGIN||'http://127.0.0.1:18789';
if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw Error('Disposable loopback fixture only');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});let gm,scene;const errors=[];
try{
 const pages=[];for(const user of ['GM','cal','sharon']){const context=await browser.newContext({viewport:{width:1600,height:1000}}),page=await context.newPage();await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.dismiss());await page.goto(base+'/test-login.php?user='+user);pages.push(page);}
 [gm]=pages;const [_,cal,sharon]=pages;
 const snapshot=async(p=gm)=>(await(await p.request.get(base+'/dnd/vtt/api/v2/snapshot.php')).json()).snapshot;
 const source=(await snapshot()).state.routing.activeSceneId;
 const pkg=(await(await gm.request.get(base+'/dnd/vtt/api/v2/scene-export.php?sceneId='+source)).json()).package;
 pkg.scene.name='Disposable handoff regression';pkg.scene.playerVisible=true;pkg.domains.placements={};pkg.domains.drawings={};pkg.domains.templates={};
 pkg.domains.sceneConfig={grid:{size:150,visible:true,locked:false,offsetX:0,offsetY:0},mapLevels:{levels:[]}};
 const imp=await gm.request.post(base+'/dnd/vtt/api/v2/scene-import.php',{data:{package:pkg,operationId:crypto.randomUUID(),allowPlayerBrowsing:true}});assert.equal(imp.status(),200,await imp.text());scene=(await imp.json()).scene;
 async function cmd(type,payload,p=gm){const s=await snapshot(p),r=await p.request.post(base+'/dnd/vtt/api/v2/commands.php',{data:{type,sceneId:scene.id,operationId:crypto.randomUUID(),baseRevision:s.revision,entityRevision:type==='routing.set'?s.state.routing._revision:s.state.sceneConfig[scene.id]._revision,payload}});assert.equal(r.status(),200,await r.text());return r.json();}
 async function batch(actions,p=gm){const s=await snapshot(p);return cmd('placement.batch',{actions:actions.map(a=>({...a,sceneId:scene.id,entityRevision:s.state.placements[scene.id]?.[a.placementId]?._entityRevision}))},p);}
 await cmd('routing.set',{routing:{activeSceneId:scene.id,mapUrl:scene.mapUrl,playerMapDisabled:false,playerActiveSceneId:scene.id,playerMapUrl:scene.mapUrl}});
 for(const p of pages){await p.reload();await p.waitForFunction(()=>window.terrainContext?.()?.view.mapLoaded);}
 await gm.waitForTimeout(300);assert.equal(await gm.evaluate(()=>terrainPrototype.active),false);assert.equal((await snapshot()).state.sceneConfig[scene.id].environment,undefined);console.log('PASS plain map does not create terrain or enable height rendering');
 const field={n:21,m:21,h:Array(441).fill(0),bounds:{left:0,top:0,width:24,height:32}};
 const walls={version:1,nodes:[{id:'a',x:3,y:15},{id:'b',x:3,y:16}],segments:[{id:'portal',a:'a',b:'b',interaction:'door',secret:true,open:false}],roofs:[],ramps:[]};
 await cmd('environment.set',{field:'terrain',value:field,expectedRevision:0});await cmd('environment.set',{field:'walls',value:walls,expectedRevision:0});
 for(const p of pages)await p.waitForFunction(()=>window.wallPrototype?.model.segments.length===1);
 assert.equal((await snapshot(cal)).state.sceneConfig[scene.id].environment.walls.value.segments[0].interaction,'none');
 for(const open of [true,false,true]){const s=await snapshot();const r=await cmd('environment.portal.set',{segmentId:'portal',open,expectedRevision:s.state.sceneConfig[scene.id].environment.walls.revision});assert.ok(JSON.stringify(r.event).length<1000);for(const p of pages)await p.waitForFunction(open=>wallPrototype.model.segments[0].interaction===(open?'door':terrainContext().isGM?'door':'none'),open);}
 assert.equal(JSON.stringify((await snapshot(cal)).state.sceneConfig[scene.id].environment).includes('secret'),false);console.log('PASS small portal events and secret projection across GM and two players');
 // Real editor stroke, delayed acknowledgment, second stroke, then undo.
 await gm.locator('[data-action="map-edits"]').click();await gm.locator('[data-action="terrain-height"]').click();
 const box=await gm.locator('#vtt-board-canvas').boundingBox();const paint={x:box.x+box.width*.60,y:box.y+box.height*.60};
 let delayed=false;await gm.route('**/commands.php',async route=>{const d=route.request().postDataJSON();if(!delayed&&d?.type?.startsWith('environment.')){delayed=true;await new Promise(r=>setTimeout(r,700));}await route.continue();});
 await gm.mouse.move(paint.x,paint.y);await gm.mouse.down();await gm.waitForTimeout(150);await gm.mouse.up();
 await gm.mouse.move(paint.x+15,paint.y);await gm.mouse.down();await gm.waitForTimeout(150);await gm.mouse.up();
 await gm.waitForFunction(()=>document.querySelector('#terrain-undo')?.disabled===false);await gm.waitForTimeout(1800);
 assert.equal(await gm.locator('#terrain-undo').isEnabled(),true);const painted=(await snapshot()).state.sceneConfig[scene.id].environment.terrain;assert.ok(painted.revision>=3,'Both strokes saved');
 await gm.locator('#terrain-undo').click();await gm.waitForTimeout(1000);const undone=(await snapshot()).state.sceneConfig[scene.id].environment.terrain;assert.notDeepEqual(undone.value.h,painted.value.h);await gm.unroute('**/commands.php');await gm.getByRole('button',{name:'Close map height'}).click();console.log('PASS delayed save preserves the next stroke and own-ack Undo');
 // Flat test area, high origin and a lower landing; no automatic teleport movement before confirmation.
 await cmd('environment.set',{field:'terrain',value:field,expectedRevision:undone.revision});
 await cmd('levels.set',{mapLevels:{levels:[{id:'high',name:'High platform',elevationSquares:10,mapUrl:scene.mapUrl,cutouts:[{column:5,row:0,width:100,height:100}]}]}});
 await batch([{kind:'add',placementId:'traveler',placement:{id:'traveler',name:'Test traveler',visionOwners:['cal'],column:4,row:15,levelId:'high',width:1,height:1,team:'ally',traits:{agility:2},hp:{current:30,max:30},imageUrl:'/dnd/vtt/assets/images/terrain-walker.svg'}},{kind:'add',placementId:'marker',placement:{id:'marker',name:'Landing marker',column:6,row:15,width:1,height:1,levelId:'level-0',team:'ally',imageUrl:'/dnd/vtt/assets/images/terrain-walker.svg'}}]);
 await gm.reload();await gm.waitForSelector('#vtt-token-layer [data-placement-id="marker"]');
 async function choose(){await gm.evaluate(()=>{window.tpOutcome=null;document.dispatchEvent(new CustomEvent('vtt:automation-apply-teleport',{detail:{payload:{targetId:'traveler',distance:5},resolve:r=>window.tpOutcome={ok:true,result:r},reject:e=>window.tpOutcome={ok:false,error:e.message}}}));});await gm.waitForSelector('[data-skip-automation-move]');const box=await gm.locator('#vtt-token-layer [data-placement-id="marker"]').boundingBox();await gm.mouse.click(box.x+box.width/2,box.y+box.height/2);await gm.waitForSelector('[data-teleport-choice]');}
 await choose();let dialog=gm.locator('[data-teleport-choice]');await gm.waitForFunction(()=>document.querySelector('[data-teleport-choice]')?.dataset.ready==='true');assert.match(await dialog.innerText(),/Current height 11/);assert.equal(await dialog.getByRole('button',{name:'Go',exact:true}).isEnabled(),true);await dialog.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal((await snapshot()).state.placements[scene.id].traveler.column,4);console.log('PASS teleport range warning, +1 height labels and cancellation without movement');
 await choose();dialog=gm.locator('[data-teleport-choice]');await gm.waitForFunction(()=>document.querySelector('[data-teleport-choice]')?.dataset.ready==='true');await dialog.getByLabel('Teleport destination height').fill('6');assert.match(await dialog.innerText(),/Fall 5 squares/);await dialog.getByRole('button',{name:'Go',exact:true}).click();await gm.waitForFunction(()=>window.tpOutcome);assert.equal((await gm.evaluate(()=>tpOutcome)).ok,true);
 await gm.waitForSelector('[data-fall-review]',{timeout:15000});assert.equal(await cal.locator('[data-fall-review]').count(),0);assert.equal(await sharon.locator('[data-fall-review]').count(),0);await gm.reload();await gm.waitForSelector('[data-fall-review]',{timeout:15000});const fall=gm.locator('[data-fall-review]');assert.equal(await fall.locator('input').inputValue(),'6');await fall.getByRole('button',{name:'Apply',exact:true}).click();await gm.waitForFunction(()=>!document.querySelector('[data-fall-review]'));const landed=(await snapshot()).state.placements[scene.id].traveler;assert.equal(Number(landed.hp.current),24);assert.ok(landed.conditions.some(c=>(c.name||c)==='Prone'));console.log('PASS airborne teleport, actor-only fall prompt, reload, Agility and single damage/Prone application');
 await gm.screenshot({path:'.playwright-mcp/handoff-final.png'});assert.deepEqual(errors,[]);console.log('PASS no browser page errors');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
