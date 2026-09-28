const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.VTT_TEST_ORIGIN||'http://127.0.0.1:18789';
if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw Error('Loopback only');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
const p=await browser.newPage({viewport:{width:1280,height:720}}),errors=[],writes=[];
p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(r.method()==='POST'&&/commands|environment|placement/.test(r.url()))writes.push(r.url());});
await p.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
await p.goto(base+'/test-login.php?user=GM');
await p.waitForFunction(()=>window.gmVision&&window.visionPrototype&&window.terrainPrototype?.active&&terrainContext().view.mapLoaded);
const snapshot=async()=>(await(await p.request.get(base+'/dnd/vtt/api/v2/snapshot.php')).json()).snapshot;
const before=await snapshot();
const initial=await p.evaluate(()=>({height:gmVision.height,scene:terrainContext().state.boardState.activeSceneId,levels:terrainContext().state.boardState.sceneState[terrainContext().state.boardState.activeSceneId].mapLevels}));
console.log(JSON.stringify({height:initial.height,scene:initial.scene}));
// Set the initial browser-only preference; no shared board writes.
await p.evaluate(()=>localStorage.setItem('gm-inspection-height:'+terrainContext().state.boardState.activeSceneId,JSON.stringify({height:-2})));
await p.reload();await p.waitForFunction(()=>window.gmVision?.height===-2&&window.visionPrototype?.stats.paints>0);
const results=[];
for(let h=-2;h<=8;h++){
await p.waitForFunction(h=>gmVision.height===h,h);
await p.waitForTimeout(250);
const row=await p.evaluate(()=>({height:gmVision.height,label:document.querySelector('[data-map-level-nav-name]').textContent,paints:visionPrototype.stats.paints,roof:document.querySelector('#roof-prototype').toDataURL(),floor:gmVision.playerFloorId}));
assert.equal(row.label,'Height '+h);if(results.length)assert.ok(row.paints>results.at(-1).paints);
results.push(row);if([0,1,2,3,4,6,8].includes(h))await p.screenshot({path:'.playwright-mcp/gm-height-'+h+'.png'});
if(h<8)await p.getByRole('button',{name:'Raise viewing height',exact:true}).click();
}
assert.notEqual(results.find(r=>r.height===0).roof,results.find(r=>r.height===2).roof);

for(let h=7;h>=-3;h--){await p.getByRole('button',{name:'Lower viewing height',exact:true}).click();await p.waitForFunction(h=>gmVision.height===h,h);}
await p.reload();await p.waitForFunction(()=>window.gmVision?.height===-3);
const after=await snapshot();assert.deepEqual(after.state,before.state);assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
fs.writeFileSync('.playwright-mcp/gm-height-results.json',JSON.stringify(results.map(({roof,...r})=>r),null,2));
console.log('PASS heights -3..8, intermediate redraws, basement/ground artwork, reload, unchanged canonical state and no command requests');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
