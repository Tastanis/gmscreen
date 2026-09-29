const {chromium}=require('playwright'),assert=require('node:assert/strict');
const origin=process.env.VTT_TEST_ORIGIN||'http://127.0.0.1:18796';
if(!['127.0.0.1','localhost'].includes(new URL(origin).hostname))throw Error('Loopback fixture required');
(async()=>{assert.equal((await(await fetch(origin+'/diagnostic-manifest.json')).json()).test_fixture,'vision-performance');const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const errors=[],writes=[];async function client(user){const page=await browser.newPage({viewport:{width:1440,height:900}});await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/test-login.php?user='+user);await page.waitForFunction(()=>window.terrainContext?.().view.mapLoaded);return page;}
 const gm=await client('GM'),cal=await client('cal'),sharon=await client('sharon'),players=[gm,cal,sharon];
 const snap=async()=>(await(await gm.request.get(origin+'/dnd/vtt/api/v2/snapshot.php')).json()).snapshot;
 const before=await snap(),scene=before.state.routing.activeSceneId;
 const catalog=await(await gm.request.get(origin+'/dnd/vtt/api/scenes.php')).json();assert.ok(catalog.data.items.find(s=>s.id===scene)?.name.startsWith('Disposable'),'Only disposable audit scenes may be toggled');
 gm.on('request',r=>{if(r.url().endsWith('/api/v2/commands.php'))writes.push(JSON.parse(r.postData()));});
 await gm.locator('[data-settings-launch="fog"]').click();
 for(const enabled of [true,false]){writes.length=0;assert.equal(await gm.locator('[data-fog-toggle]').isChecked(),!enabled);await gm.locator('.vtt-fog-toggle').click();for(const page of players)await page.waitForFunction(({scene,enabled})=>terrainContext().state.boardState.sceneState[scene]?.fogOfWar?.byLevel?.['level-0']?.enabled===enabled,{scene,enabled});await gm.waitForTimeout(400);assert.deepEqual(writes.map(c=>c.type),['fog.set'],'toggle must not save floors or grid');}
 const after=await snap();assert.deepEqual(after.state.placements,before.state.placements);assert.deepEqual(after.state.sceneConfig[scene].mapLevels,before.state.sceneConfig[scene].mapLevels);assert.deepEqual(after.state.sceneConfig[scene].grid,before.state.sceneConfig[scene].grid);assert.deepEqual(errors,[]);console.log('PASS GM fog toggle sends only fog.set and converges in GM/Cal/Sharon without changing floors, grid or tokens');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
