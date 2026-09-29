const {chromium}=require('playwright'),assert=require('node:assert/strict');
const origin=process.env.VTT_TEST_ORIGIN||'http://127.0.0.1:18795';
if(!['127.0.0.1','localhost'].includes(new URL(origin).hostname))throw Error('Loopback required');
(async()=>{
 assert.equal((await(await fetch(origin+'/diagnostic-manifest.json')).json()).test_fixture,'combat-wall-audit');
 const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[];
 try{
 async function client(user){const context=await browser.newContext({viewport:{width:1440,height:900}});await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/test-login.php?user='+user);await page.waitForFunction(()=>window.terrainContext?.().view.mapLoaded);return{context,page};}
 const gm=await client('GM'),snapshot=async()=>(await(await gm.context.request.get(origin+'/dnd/vtt/api/v2/snapshot.php')).json()).snapshot;
 const original=(await snapshot()).state.placements.scn_6229fb476a9c;
 const pkg=(await(await gm.context.request.get(origin+'/dnd/vtt/api/v2/scene-export.php?sceneId=scn_6229fb476a9c')).json()).package;
 pkg.scene.name='Disposable cube audit';pkg.domains.placements={};pkg.domains.templates={};pkg.domains.drawings={};pkg.domains.sceneConfig={grid:{size:80,visible:true,locked:false,offsetX:0,offsetY:0},environment:{},fogOfWar:{byLevel:{}},mapLevels:{activeLevelId:'level-0',levels:[]}};
 const imp=await gm.context.request.post(origin+'/dnd/vtt/api/v2/scene-import.php',{data:{package:pkg,operationId:crypto.randomUUID(),allowPlayerBrowsing:true}});assert.equal(imp.status(),200,await imp.text());const scene=(await imp.json()).scene;
 async function cmd(type,payload,extra={},actor=gm){const s=await snapshot();const r=await actor.context.request.post(origin+'/dnd/vtt/api/v2/commands.php',{data:{type,sceneId:scene.id,operationId:crypto.randomUUID(),baseRevision:s.revision,entityRevision:type==='routing.set'?s.state.routing._revision:0,payload,...extra}});assert.equal(r.status(),200,await r.text());return r.json();}
 await cmd('routing.set',{routing:{activeSceneId:scene.id,mapUrl:scene.mapUrl,playerActiveSceneId:scene.id,playerMapUrl:scene.mapUrl,playerMapDisabled:false}});await gm.page.reload();await gm.page.waitForFunction(()=>terrainContext().view.mapLoaded);
 const cal=await client('cal'),sharon=await client('sharon'),clients=[gm,cal,sharon];
 await gm.page.locator('[data-action="open-templates"]').click();await gm.page.locator('.vtt-template-menu input').first().focus();await gm.page.keyboard.press('Escape');assert.equal(await gm.page.locator('.vtt-template-menu').isVisible(),false);await gm.page.locator('[data-action="open-templates"]').click();await gm.page.locator('[data-template="wall"]').click();await gm.page.locator('.vtt-template-menu input[name="squares"]').fill('5');await gm.page.locator('.vtt-template-menu [data-color-name="stone"]').click();await gm.page.locator('.vtt-template-menu__confirm').click();
 async function screen(column,row){return gm.page.evaluate(({column,row})=>{const v=terrainContext().view,r=document.querySelector('#vtt-map-transform').getBoundingClientRect();return{x:r.left+((v.gridOffsets.left||0)+column*v.gridSize)*v.scale,y:r.top+((v.gridOffsets.top||0)+row*v.gridSize)*v.scale};},{column,row});}
 const first=await screen(4.5,5.5);await gm.page.mouse.click(first.x,first.y);
 // Click the painted top, which is shifted from its terrain square by parallax.
 async function clickTop(column,row,elevation){const locator=gm.page.locator(`.vtt-template--preview [data-wall-column="${column}"][data-wall-row="${row}"][data-wall-elevation="${elevation}"]:not(.is-ghost) [data-cube-face="top"]`);await locator.waitFor();const p=await locator.evaluate(e=>{const r=e.getBoundingClientRect();return{x:r.x+r.width*.5,y:r.y+r.height*.5};});await gm.page.mouse.click(p.x,p.y);}
 const second=await screen(5.6,5.75);await gm.page.mouse.click(second.x,second.y);await clickTop(5,5,0);await clickTop(4,5,0);await clickTop(4,5,1);
 await gm.page.waitForFunction(()=>document.querySelectorAll('.vtt-template--wall:not(.vtt-template--preview) .vtt-wall__cube').length===5);
 let s=await snapshot(),wall=Object.values(s.state.templates[scene.id])[0];assert.equal(wall.squares.length,5);assert.deepEqual(wall.squares.map(q=>`${q.column},${q.row},${q.elevation||0}`).sort(),['4,5,0','4,5,1','4,5,2','5,5,0','5,5,1']);
 for(const c of clients)await c.page.waitForFunction(()=>document.querySelectorAll('.vtt-template--wall:not(.vtt-template--preview) .vtt-wall__cube').length===5);
 assert.equal(await gm.page.evaluate(()=>wallPrototype.model.segments.filter(e=>e.id.startsWith('template-cube:')).length),20);
 const top=gm.page.locator('.vtt-template--wall [data-wall-column="4"][data-wall-row="5"][data-wall-elevation="2"] [data-cube-face="top"]');await top.click();await gm.page.keyboard.press('Delete');
 await gm.page.waitForFunction(()=>document.querySelectorAll('.vtt-template--wall:not(.vtt-template--preview) .vtt-wall__cube').length===4);s=await snapshot();assert.equal(s.state.templates[scene.id][wall.id].squares.length,4);assert.ok(!s.state.templates[scene.id][wall.id].squares.some(q=>q.column===4&&q.row===5&&q.elevation===2));
 for(const c of clients){await c.page.reload();await c.page.waitForFunction(()=>window.terrainContext?.().view.mapLoaded);await c.page.waitForFunction(()=>document.querySelectorAll('.vtt-template--wall .vtt-wall__cube').length===4);}
 console.log('PASS five-cube mouse placement, parallax top stacking, individual Delete, three-client reload');
 // Existing material picker values must resolve to distinct generated assets.
 for(const [index,material] of ['dirt','metal','ice','fire'].entries()){const id='cube-material-'+material;await cmd('template.upsert',{template:{id,type:'wall',levelId:'level-0',wallColor:material,squares:[{column:7+index,row:5}]}},{entityId:id,entityRevision:0});}
 await gm.page.waitForFunction(()=>document.querySelectorAll('.vtt-wall__cube').length===8);
 for(const material of ['stone','dirt','metal','ice','fire']){assert.ok(await gm.page.locator(`.vtt-wall__cube image[href="/dnd/vtt/assets/images/wall-${material}.png"]`).count());assert.equal((await gm.context.request.get(origin+`/dnd/vtt/assets/images/wall-${material}.png`)).status(),200);}
 await gm.page.screenshot({path:'.playwright-mcp/wall-cube-preview.png',animations:'disabled'});
 assert.deepEqual((await snapshot()).state.placements.scn_6229fb476a9c,original);assert.deepEqual(errors,[]);console.log('PASS all five generated textures, no page errors, campaign tokens unchanged');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
