const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const origin = process.env.VTT_TEST_ORIGIN || 'http://127.0.0.1:8129';
if (!['localhost','127.0.0.1','[::1]'].includes(new URL(origin).hostname)) throw Error('Loopback required');
const until = async fn => { for(let i=0;i<150;i++){ if(await fn())return; await new Promise(r=>setTimeout(r,100)); } throw Error('Condition timed out'); };
(async()=>{
 const manifest=await fetch(origin+'/diagnostic-manifest.json').then(r=>r.json());
 assert.equal(manifest.test_fixture,'floor-regression');
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const context=await browser.newContext({viewport:{width:1440,height:900}});
  await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  const page=await context.newPage(); const calls=[],errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.url().endsWith('/commands.php'))calls.push({status:r.status(),command:r.request().postDataJSON()});});
  await page.goto(origin+'/test-login.php?user=GM');
  const scene=manifest.test_scene_id;
  const snapshot=async()=>(await (await context.request.get(origin+'/dnd/vtt/api/v2/snapshot.php')).json()).snapshot;
  const command=async(actions)=>{
   const s=await snapshot();const r=await context.request.post(origin+'/dnd/vtt/api/v2/commands.php',{data:{type:'placement.batch',operationId:crypto.randomUUID(),baseRevision:s.revision,payload:{actions}}});
   assert.equal(r.status(),200,await r.text());
  };
  let s=await snapshot(); const base=s.state.placements[scene]['floor-cal'];
  await command([{kind:'add',sceneId:scene,placementId:'group-ally',placement:{...base,id:'group-ally',name:'Companion',profileId:'',column:3}}]);
  await page.goto(origin+'/test-login.php?user=cal');
  const token=id=>page.locator('#vtt-token-layer [data-placement-id="'+id+'"]');
  await token('group-ally').waitFor();
  const selectGroup=async()=>{await token('floor-cal').click();await token('group-ally').click({modifiers:['Shift']});};
  const drag=async()=>{
   await selectGroup();const box=await token('floor-cal').boundingBox();
   await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
   await page.mouse.move(box.x+box.width/2,box.y+box.height/2+5*box.height,{steps:25});await page.mouse.up();
   await until(async()=>{const p=(await snapshot()).state.placements[scene];return p['floor-cal'].row===5&&p['group-ally'].row===5;});
  };
  await drag();
  s=await snapshot();assert.equal(s.state.placements[scene]['floor-cal'].levelId,'test-upper');assert.equal(s.state.placements[scene]['group-ally'].levelId,'test-upper');assert.equal(s.state.sceneConfig[scene].userLevelState.cal.levelId,'test-upper');assert.equal(s.state.placements[scene]['floor-cal']._movementUndo.history.at(-1).groupMove,true);
  await page.reload();await token('group-ally').waitFor();await selectGroup();
  await page.locator('[data-action="undo-token-move"]').click();
  await until(async()=>{const p=(await snapshot()).state.placements[scene];return p['floor-cal'].row===0&&p['group-ally'].row===0;});
  s=await snapshot();assert.equal(s.state.placements[scene]['floor-cal'].levelId,'level-0');assert.equal(s.state.placements[scene]['group-ally'].levelId,'level-0');assert.equal(s.state.sceneConfig[scene].userLevelState.cal.levelId,'level-0');
  assert.equal(calls.filter(c=>c.command.type==='movement.undoGroup').length,1);
  assert.equal(calls.find(c=>c.command.type==='movement.undoGroup').status,200);
  await page.reload();await token('group-ally').waitFor();
  await drag();
  // A GM edit to one member invalidates the whole undo, including an unchanged anchor.
  await page.goto(origin+'/test-login.php?user=GM');s=await snapshot();
  await command([{kind:'patch',sceneId:scene,placementId:'group-ally',entityRevision:s.state.placements[scene]['group-ally']._entityRevision,patch:{name:'Edited companion'}}]);
  await page.goto(origin+'/test-login.php?user=cal');await token('floor-cal').waitFor();
  await token('floor-cal').click();const before=await snapshot();
  await page.locator('[data-action="undo-token-move"]').click();
  await until(()=>calls.filter(c=>c.command.type==='movement.undoGroup').length===2);
  assert.equal(calls.filter(c=>c.command.type==='movement.undoGroup')[1].status,422);
  const after=await snapshot();assert.deepEqual(after.state.placements[scene],before.state.placements[scene]);
  await page.reload();await token('floor-cal').waitFor();
  assert.equal((await snapshot()).state.placements[scene]['floor-cal'].row,5);
  assert.deepEqual(errors,[]);
  console.log('PASS: real group drag, group undo after reload, and stale-member rejection without partial restoration.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
