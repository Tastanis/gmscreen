const assert=require('node:assert/strict'),fs=require('node:fs');
const origin=process.env.VTT_TEST_ORIGIN||'http://127.0.0.1:18796';
if(!['127.0.0.1','localhost'].includes(new URL(origin).hostname))throw Error('Loopback required');
const sourcePackage=process.env.VTT_TEST_SCENE_PACKAGE;
if(!sourcePackage)throw Error('Set VTT_TEST_SCENE_PACKAGE to the exact exported Bathhouse scene package.');
(async()=>{
 assert.equal((await(await fetch(origin+'/diagnostic-manifest.json')).json()).test_fixture,'vision-performance');
 async function login(user){const r=await fetch(origin+'/test-login.php?user='+user,{redirect:'manual'});const cookie=r.headers.get('set-cookie').split(';')[0];return async(path,data)=>{const r=await fetch(origin+path,{headers:{Cookie:cookie,...(data?{'Content-Type':'application/json'}:{})},...(data?{method:'POST',body:JSON.stringify(data)}:{})});return {status:r.status,body:await r.json()};};}
 const gm=await login('GM'),cal=await login('cal'),snap=async()=>(await gm('/dnd/vtt/api/v2/snapshot.php')).body.snapshot;
 const original=structuredClone((await snap()).state.placements);
 const pkg=JSON.parse(fs.readFileSync(sourcePackage,'utf8'));pkg.scene.name='Disposable exact Bathhouse HTTP latency';pkg.domains.placements={};pkg.domains.templates={};pkg.domains.drawings={};
 const imp=await gm('/dnd/vtt/api/v2/scene-import.php',{package:pkg,operationId:crypto.randomUUID(),allowPlayerBrowsing:true});assert.equal(imp.status,200,JSON.stringify(imp.body));const scene=imp.body.scene.id;
 const s=await snap();const add=await gm('/dnd/vtt/api/v2/commands.php',{type:'placement.batch',sceneId:scene,operationId:crypto.randomUUID(),baseRevision:s.revision,payload:{actions:[['blocked',7,18],['legal',13,8]].map(([id,column,row])=>({kind:'add',sceneId:scene,placementId:id,placement:{id,name:'Cal',profileId:'cal',team:'ally',column,row,width:1,height:1,levelId:'level-0',imageUrl:'/dnd/vtt/assets/images/terrain-walker.svg'}}))}});assert.equal(add.status,200,JSON.stringify(add.body));
 const results=[];
 for(const [id,column,row,expected] of [['blocked',20,18,422],['legal',25,8,200]]){
  const before=await snap(),receipts=await cal('/dnd/vtt/api/v2/collision-effects.php');const p=before.state.placements[scene][id],start=performance.now();const r=await cal('/dnd/vtt/api/v2/commands.php',{type:'token.move',sceneId:scene,entityId:id,operationId:crypto.randomUUID(),baseRevision:before.revision,entityRevision:p._entityRevision,payload:{column,row,movementKind:'walk',path:[]}});const elapsed=performance.now()-start;
  assert.equal(r.status,expected,JSON.stringify(r.body));const after=await snap();
  if(expected===422){assert.match(r.body.error,/wall/i);assert.equal(after.revision,before.revision);assert.deepEqual(after.state.placements[scene],before.state.placements[scene]);assert.deepEqual(await cal('/dnd/vtt/api/v2/collision-effects.php'),receipts);}
  else {assert.equal(after.state.placements[scene][id].column,column);assert.equal(after.state.placements[scene][id].row,row);assert.equal(after.state.placements[scene][id]._entityRevision,p._entityRevision+1);assert.equal(after.revision,before.revision+1);}
  results.push({id,httpMs:elapsed,status:r.status,error:r.body.error||null});
 }
 const final=(await snap()).state.placements;for(const [id,placements] of Object.entries(original))assert.deepEqual(final[id],placements,'preexisting scene '+id+' must remain unchanged');console.log(JSON.stringify({results,originalTokensUnchanged:true},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
