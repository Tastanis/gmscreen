const {chromium}=require('playwright'),assert=require('node:assert/strict');
const origin=process.env.VTT_TEST_ORIGIN||'http://127.0.0.1:18795',baseline=process.env.VTT_AUDIT_BASELINE==='1';
if(!['127.0.0.1','localhost'].includes(new URL(origin).hostname))throw Error('Loopback required');
(async()=>{
 assert.equal((await(await fetch(origin+'/diagnostic-manifest.json')).json()).test_fixture,'combat-wall-audit');
 const browser=await chromium.launch({channel:'chrome',headless:true});const errors=[],calls=[];let victories={cal:0,sharon:0};
 try{
 async function client(user){const context=await browser.newContext({viewport:{width:1440,height:900}});await context.route('**/*',route=>{
  const u=new URL(route.request().url());if(u.origin!==origin)return route.abort();
  if(u.searchParams.get('action')==='fetch-victories')return route.fulfill({json:{success:true,victories:victories[u.searchParams.get('character')]||0}});
  return route.continue();});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().endsWith('/api/v2/commands.php'))calls.push({status:r.status(),command:r.request().postDataJSON()});});await page.goto(origin+'/test-login.php?user='+user);await page.waitForFunction(()=>window.terrainContext?.().view.mapLoaded);return {context,page};}
 const gm=await client('GM');const snapshot=async()=>(await(await gm.context.request.get(origin+'/dnd/vtt/api/v2/snapshot.php')).json()).snapshot;
 let snap=await snapshot();for(const [id,c] of Object.entries(snap.state.combat||{})){if(!c.active)continue;const r=await gm.context.request.post(origin+'/dnd/vtt/api/v2/commands.php',{data:{type:'combat.end',sceneId:id,baseRevision:snap.revision,entityRevision:c._revision,operationId:crypto.randomUUID(),payload:{}}});assert.equal(r.status(),200,await r.text());snap=await snapshot();}
 const original=structuredClone(snap.state.placements.scn_6229fb476a9c);
 const pkg=(await(await gm.context.request.get(origin+'/dnd/vtt/api/v2/scene-export.php?sceneId=scn_6229fb476a9c')).json()).package;
 pkg.scene.name='Disposable combat audit';pkg.domains.placements={};pkg.domains.templates={};pkg.domains.drawings={};pkg.domains.sceneConfig.environment={};pkg.domains.sceneConfig.fogOfWar={byLevel:{}};pkg.domains.sceneConfig.userLevelState={};pkg.domains.sceneConfig.mapLevels={activeLevelId:'level-0',levels:[]};
 const imported=await gm.context.request.post(origin+'/dnd/vtt/api/v2/scene-import.php',{data:{package:pkg,operationId:crypto.randomUUID(),allowPlayerBrowsing:true}});assert.equal(imported.status(),200,await imported.text());const scene=(await imported.json()).scene;
 async function command(type,payload,extra={},actor=gm){snap=await snapshot();const r=await actor.context.request.post(origin+'/dnd/vtt/api/v2/commands.php',{data:{type,sceneId:scene.id,operationId:crypto.randomUUID(),baseRevision:snap.revision,entityRevision:type==='routing.set'?snap.state.routing._revision:snap.state.combat[scene.id]?._revision||0,payload,...extra}});assert.equal(r.status(),200,await r.text());return r.json();}
 await command('routing.set',{routing:{activeSceneId:scene.id,mapUrl:scene.mapUrl,playerActiveSceneId:scene.id,playerMapUrl:scene.mapUrl,playerMapDisabled:false}});
 const token=(id,name,team,column,row,profileId)=>({id,name,team,column,row,width:1,height:1,levelId:'level-0',profileId,imageUrl:'/dnd/vtt/assets/images/terrain-walker.svg',hp:{current:50,max:50}});
 await command('placement.batch',{actions:[token('audit-cal','Cal','ally',3,3,'cal'),token('audit-sharon','Sharon','ally',5,3,'sharon'),token('audit-goblin','Goblin','enemy',9,3),token('audit-goblin2','Goblin 2','enemy',10,3),{...token('audit-hidden','Hidden goblin','enemy',12,3),hidden:true}].map(placement=>({kind:'add',sceneId:scene.id,placementId:placement.id,placement}))});
 await gm.page.reload();await gm.page.waitForFunction(()=>window.terrainContext?.().view.mapLoaded);const cal=await client('cal'),sharon=await client('sharon');const clients=[gm,cal,sharon];
 const combat=async()=>(await snapshot()).state.combat[scene.id];
 async function converged(){const expected=await combat();for(const c of clients)await c.page.waitForFunction(({scene,expected})=>{const b=terrainContext().state.boardState.sceneState?.[scene]?.combat||terrainContext().state.boardState.scenes?.[scene]?.combat;return b&&b.activeCombatantId===expected.activeCombatantId&&b.round===expected.round&&b.malice===expected.malice&&b.currentTeam===expected.currentTeam;},{scene:scene.id,expected});}
 await gm.page.locator('[data-action="start-combat"]').click();await gm.page.waitForTimeout(2000);console.log('Starting malice (zero Victories)',(await combat()).malice);
 if(!baseline)assert.equal((await combat()).malice,3,'two heroes plus first round, even at zero Victories');
 // Use a real GM tracker turn to reach PC pick if initiative chose the enemies.
 if((await combat()).currentTeam==='enemy'){await gm.page.locator('[data-combatant-id="audit-goblin"]').dblclick();await gm.page.locator('[data-turn-complete]').click();}
 await cal.page.locator('[data-player-start-turn]').click();await cal.page.locator('[data-turn-dialog]').waitFor();assert.equal((await combat()).activeCombatantId,'audit-cal');
 await cal.page.reload();await cal.page.waitForFunction(()=>window.terrainContext?.().view.mapLoaded);await cal.page.waitForTimeout(1200);console.log('Own turn prompt after reload',await cal.page.locator('[data-turn-dialog]').count());
 if(baseline){assert.equal(await cal.page.locator('[data-turn-dialog]').count(),0);assert.equal((await combat()).malice,0);console.log('REPRODUCED missing restored turn prompt and first-round malice');return;}
 await cal.page.locator('[data-turn-complete]').click();await gm.page.waitForTimeout(900);assert.equal((await combat()).activeCombatantId,null);assert.ok((await combat()).completedCombatantIds.includes('audit-cal'));await converged();
 assert.equal(await sharon.page.locator('[data-turn-dialog]').count(),0,'no other-player end prompt');
 for(const c of [cal,sharon])assert.equal(await c.page.locator('[data-combatant-id="audit-hidden"]').count(),0);
 console.log('PASS own turn reload/End Turn, hidden enemy projection and three-client convergence');
 // Early round: cancelling must write nothing; confirming twice rapidly must advance once.
 const oldRound=(await combat()).round,oldMalice=(await combat()).malice;
 await gm.page.locator('[data-action="end-round"]').click();await gm.page.locator('.uik-modal').waitFor();
 await gm.page.locator('.uik-modal .uik-btn:not(.uik-btn--danger):not(.uik-btn--primary)').click();assert.equal((await combat()).round,oldRound);
 await gm.page.locator('[data-action="end-round"]').click();await gm.page.locator('.uik-modal .uik-btn--danger, .uik-modal .uik-btn--primary').click();await gm.page.waitForTimeout(900);assert.equal((await combat()).round,oldRound+1);assert.equal((await combat()).malice,oldMalice+2+oldRound+1);await converged();
 console.log('PASS early End Round confirmation and atomic malice gain');
 await command('turn.start',{combatantId:'audit-cal',override:true}, {},cal);await cal.page.locator('[data-turn-complete]').waitFor();const activeRound=(await combat()).round,activeMalice=(await combat()).malice;
 await gm.page.locator('[data-action="end-round"]').click();await gm.page.locator('.uik-modal .uik-btn--danger, .uik-modal .uik-btn--primary').click();await gm.page.waitForTimeout(900);assert.equal((await combat()).round,activeRound+1);assert.equal((await combat()).activeCombatantId,null);assert.equal((await combat()).malice,activeMalice+2+activeRound+1);await converged();
 console.log('PASS End Round during active player turn advances once and clears prompt');
 await gm.page.locator('[data-action="start-combat"]').click();await gm.page.locator('.uik-modal .uik-btn--danger, .uik-modal .uik-btn--primary').click();await gm.page.waitForTimeout(900);assert.equal((await combat()).active,false);await converged();
 victories={cal:4,sharon:2};await gm.page.locator('[data-action="start-combat"]').click();await gm.page.waitForTimeout(1600);assert.equal((await combat()).malice,6,'fresh average of 3, two heroes plus round 1');await converged();
 console.log('PASS next encounter uses fresh Victories automatically');
 // Player read-only malice UI and server authority, followed by real GM pip edits.
 for(const c of [cal,sharon]){assert.equal(await c.page.locator('[data-malice]').isVisible(),true);assert.equal(await c.page.locator('[data-malice-button]').isDisabled(),true);assert.equal(await c.page.locator('[data-malice-panel]').isVisible(),false);}
 snap=await snapshot();const refused=await cal.context.request.post(origin+'/dnd/vtt/api/v2/commands.php',{data:{type:'combat.patch',sceneId:scene.id,operationId:crypto.randomUUID(),baseRevision:snap.revision,entityRevision:snap.state.combat[scene.id]._revision,payload:{patch:{malice:999}}}});assert.ok(refused.status()>=400,'server rejects player malice writes');assert.equal((await combat()).malice,6);
 await gm.page.locator('[data-malice-button]').click();await gm.page.locator('[data-malice-add]').click();await gm.page.locator('[data-malice-add]').click();await gm.page.locator('[data-malice-close]').click();await gm.page.waitForTimeout(900);assert.equal((await combat()).malice,8);await converged();
 await gm.page.locator('[data-malice-button]').click();await gm.page.locator('.vtt-malice-panel__pip').nth(0).click();await gm.page.locator('.vtt-malice-panel__pip').nth(1).click();await gm.page.locator('[data-malice-close]').click();await gm.page.waitForTimeout(900);assert.equal((await combat()).malice,6);await converged();console.log('PASS GM add/spend malice and player read-only authority');
 // Select two enemy tokens with the actual box gesture, then group using G.
 const boxes=await gm.page.locator('#vtt-token-layer [data-placement-id]').evaluateAll(nodes=>nodes.filter(n=>['audit-goblin','audit-goblin2'].includes(n.dataset.placementId)).map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};}));assert.equal(boxes.length,2);
 await gm.page.mouse.move(Math.min(...boxes.map(b=>b.x))-5,Math.min(...boxes.map(b=>b.y))-5);await gm.page.mouse.down();await gm.page.mouse.move(Math.max(...boxes.map(b=>b.right))+5,Math.max(...boxes.map(b=>b.bottom))+5,{steps:8});await gm.page.mouse.up();
 await gm.page.waitForFunction(()=>terrainContext().selectedIds.includes('audit-goblin')&&terrainContext().selectedIds.includes('audit-goblin2'));await gm.page.keyboard.press('g');await gm.page.waitForTimeout(900);
 const group=(await combat()).groups.find(g=>g.memberIds.includes('audit-goblin'));assert.ok(group&&group.memberIds.includes('audit-goblin2'),'box plus G creates one canonical group');await converged();
 for(const c of clients)assert.equal(await c.page.locator('[data-combatant-id="audit-goblin"], [data-combatant-id="audit-goblin2"]').count(),1,'group has one tracker entry on each screen');
 // Finish a natural round through tracker/player buttons. Hidden enemies remain GM-only.
 const naturalRound=(await combat()).round,naturalMalice=(await combat()).malice;
 const remaining=new Set(['audit-cal','audit-sharon',group.representativeId,'audit-hidden']);
 while(remaining.size){const current=await combat();let id=[...remaining].find(id=>(id.startsWith('audit-goblin')||id==='audit-hidden'?'enemy':'ally')===current.currentTeam)||[...remaining][0];
  if(id==='audit-cal'||id==='audit-sharon'){const actor=id==='audit-cal'?cal:sharon;const button=actor.page.locator('[data-player-start-turn]');if(await button.isVisible())await button.click();else await command('turn.start',{combatantId:id,override:true},{},actor);await actor.page.locator('[data-turn-complete]').click();}
  else{await gm.page.locator(`[data-combatant-id="${id}"]`).dblclick();await gm.page.locator('[data-turn-complete]').click();}
  remaining.delete(id);await gm.page.waitForTimeout(500);const now=await combat();assert.ok(now.completedCombatantIds.includes(id));
 }
 await gm.page.locator('.uik-modal').waitFor();assert.match(await gm.page.locator('.uik-modal').innerText(),/End combat round\?/);await gm.page.locator('.uik-modal .uik-btn--primary, .uik-modal .uik-btn--danger').click();await gm.page.waitForTimeout(900);assert.equal((await combat()).round,naturalRound+1);assert.equal((await combat()).malice,naturalMalice+2+naturalRound+1);assert.deepEqual((await combat()).completedCombatantIds,[]);await converged();
 await sharon.page.reload();await sharon.page.waitForFunction(()=>window.terrainContext?.().view.mapLoaded);await converged();console.log('PASS box/G grouping, grouped turn, natural round and reload recovery');
 assert.deepEqual((await snapshot()).state.placements.scn_6229fb476a9c,original);assert.deepEqual(errors,[]);console.log('PASS no page errors and original campaign tokens unchanged');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
