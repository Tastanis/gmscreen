const { chromium } = require('playwright');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');
const origin='http://127.0.0.1:8129';
async function until(check) { for(let i=0;i<150;i++){if(await check())return;await new Promise(r=>setTimeout(r,100));}throw Error('Saved-state condition timed out');}
(async()=>{
 const manifest=await fetch(origin+'/diagnostic-manifest.json').then(r=>r.json());
 assert.equal(manifest.test_fixture,'floor-regression');
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const errors=[],calls=[];
  async function client(user){
   const p=await browser.newPage({viewport:{width:1440,height:900}});
   p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(r.url().includes('commands.php'))calls.push({user,body:r.postData()});});
   await p.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
   await p.goto(origin+'/test-login.php?user='+user);
   await p.waitForFunction(()=>document.querySelector('[data-connection-status]')?.textContent==='Connected');
   return p;
  }
  const gm=await client('GM');const sceneId=manifest.test_scene_id;
  const snapshot=async()=>(await (await gm.request.get(origin+'/dnd/vtt/api/v2/snapshot.php')).json()).snapshot;
  const s=await snapshot(), base=s.state.placements[sceneId]['floor-cal'];
  const r=await gm.request.post(origin+'/dnd/vtt/api/v2/commands.php',{data:{type:'placement.batch',sceneId,operationId:randomUUID(),baseRevision:s.revision,payload:{actions:[{kind:'add',sceneId,placementId:'stair-watcher',placement:{id:'stair-watcher',name:'Stair watcher',imageUrl:base.imageUrl,column:3,row:3,width:1,height:1,levelId:'level-0',team:'enemy'}}]}}});
  assert.equal(r.status(),200,await r.text());
  await gm.locator('[data-action="start-combat"]').click();
  await gm.waitForFunction(()=>document.querySelector('[data-combat-tracker]')?.dataset.combatActive==='true');
  const pc=await client('cal');const selector='#vtt-token-layer [data-placement-id="floor-cal"]';
  async function drag(rows,level){
   const b=await pc.locator(selector).boundingBox();assert.ok(b);
   await pc.mouse.move(b.x+b.width/2,b.y+b.height/2);await pc.mouse.down();
   await pc.mouse.move(b.x+b.width/2,b.y+b.height/2+rows*b.height,{steps:25});await pc.mouse.up();
   await until(async()=>{const t=(await snapshot()).state.placements[sceneId]['floor-cal'];return t.row===(level==='level-0'?3:5)&&t.levelId===level;});
  }
  await drag(3,'level-0');
  assert.ok(!((await snapshot()).state.placements[sceneId]['stair-watcher'].readyTriggerAbilities||[]).includes('__opportunityAttack__'));
  await drag(2,'test-upper');
  await until(async()=>((await snapshot()).state.placements[sceneId]['stair-watcher'].readyTriggerAbilities||[]).includes('__opportunityAttack__'));
  const watcher=(await snapshot()).state.placements[sceneId]['stair-watcher'];
  assert.equal(watcher.readyTriggerSources.__opportunityAttack__,'floor-cal',JSON.stringify({sources:watcher.readyTriggerSources,calls}));
  await gm.reload();await gm.waitForFunction(()=>document.querySelector('[data-connection-status]')?.textContent==='Connected');
  await gm.locator('[data-placement-id="stair-watcher"] [data-token-trigger-ready]').waitFor();
  assert.deepEqual(errors,[]);
  console.log('PASS real player stair move: entering adjacency does not trigger; leaving across floors persists enemy opportunity marker and source through GM reload');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
