const {chromium}=require('playwright'),assert=require('node:assert/strict');
const base=process.env.VTT_TEST_ORIGIN||'http://127.0.0.1:18795';
if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw Error('Loopback fixture required');
(async()=>{assert.equal((await(await fetch(base+'/diagnostic-manifest.json')).json()).test_fixture,'short-cliff');const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const errors=[];
 async function page(user){const p=await browser.newPage();p.on('pageerror',e=>errors.push(e.message));await p.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());await p.goto(base+'/test-login.php?user='+user);await p.waitForFunction(()=>window.terrainPrototype?.active&&window.terrainContext&&terrainContext().view.mapLoaded);return p;}
 const gm=await page('GM'),player=await page('sharon'),scene='scn_6229fb476a9c';
 const snap=async()=>(await(await gm.request.get(base+'/dnd/vtt/api/v2/snapshot.php')).json()).snapshot;
 const original=(await snap()).state.placements[scene]['bathhouse-test-vision-blue'];
 for(const row of [35,36]){
  const id='qa-short-cliff-'+row+'-'+Date.now();let s=await snap();
  const placement={id,name:'Short cliff QA',column:12,row,width:1,height:1,levelId:'level-0',movementMode:'ground',team:'ally',visionOwners:['sharon'],imageUrl:original.imageUrl};
  let r=await gm.request.post(base+'/dnd/vtt/api/v2/commands.php',{data:{type:'placement.batch',sceneId:scene,baseRevision:s.revision,operationId:crypto.randomUUID(),payload:{actions:[{kind:'add',sceneId:scene,placementId:id,placement}]}}});assert.equal(r.status(),200,await r.text());
  await player.reload();await player.waitForFunction(()=>window.terrainPrototype?.active&&window.terrainContext&&terrainContext().view.mapLoaded);
  const plan=await player.evaluate(async ({placement,row})=>{const {resolveForcedDrag}=await import('/dnd/vtt/assets/js/ui/forced-drag.js');return resolveForcedDrag(placement,{column:10,row},[],{wallBlocked:(a,b)=>wallPrototype.forcedBlockedMove(a,b),height:t=>terrainPrototype.groundFor(t)});},{placement,row});
  assert.equal(plan.wall,true);assert.equal(plan.damage,4);assert.equal(plan.destination.column,12);
  s=await snap();r=await player.request.post(base+'/dnd/vtt/api/v2/commands.php',{data:{type:'token.move',sceneId:scene,entityId:id,entityRevision:s.state.placements[scene][id]._entityRevision,baseRevision:s.revision,operationId:crypto.randomUUID(),payload:{column:10,row,movementKind:'forced'}}});assert.equal(r.status(),422,'server independently rejects bypass');
  const operationId=crypto.randomUUID();s=await snap();r=await player.request.post(base+'/dnd/vtt/api/v2/commands.php',{data:{type:'token.move',sceneId:scene,entityId:id,entityRevision:s.state.placements[scene][id]._entityRevision,baseRevision:s.revision,operationId,payload:{...plan.destination,movementKind:'forced',forcedDestination:{column:10,row}}}});assert.equal(r.status(),200,await r.text());
  const outcomes=await(await player.request.get(base+'/dnd/vtt/api/v2/collision-effects.php?operationId='+operationId)).json();assert.equal(outcomes.success,true);console.log('row',row,'client damage',plan.damage,'receipt',JSON.stringify(outcomes.result));
  await player.reload();assert.equal((await snap()).state.placements[scene][id].column,12);
 }
 assert.deepEqual((await snap()).state.placements[scene]['bathhouse-test-vision-blue'],original);assert.deepEqual(errors,[]);console.log('PASS browser collision planner, player command authority, canonical stop, reload and preserved user token');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
