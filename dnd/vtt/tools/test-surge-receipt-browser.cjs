const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const origin='http://127.0.0.1:8129';
(async()=>{
 const manifest=await fetch(origin+'/diagnostic-manifest.json').then(r=>r.json());assert.equal(manifest.test_fixture,'floor-regression');
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  await page.goto(origin+'/test-login.php?user=GM');
  await page.waitForFunction(()=>document.querySelector('[data-connection-status]')?.textContent.includes('Connected'));
  const endpoint=origin+'/dnd/character_sheet/handler.php';
  const count=async character=>Number((await(await page.request.get(endpoint+'?action=summary&character='+character)).json()).data.hero.surges||0);
  const before=await count('cal'),other=await count('sharon');let original,writes=0;
  await page.route(endpoint,async route=>{
   if(!route.request().postData()?.includes('action=sync-surges'))return route.continue();
   writes++;original=Object.fromEntries(new URLSearchParams(route.request().postData()));
   const response=await route.fetch();assert.equal((await response.json()).operationId,original.operationId);
   await route.abort(); // Saved server-side; acknowledgement never reaches the hook.
  });
  await page.evaluate(()=>{
   window.receiptResult='pending';document.dispatchEvent(new CustomEvent('vtt:automation-apply-surge',{detail:{payload:{placementId:'floor-cal',amount:1},
    resolve:()=>window.receiptResult='resolved',reject:()=>window.receiptResult='rejected'}}));
  });
  await page.waitForFunction(()=>window.receiptResult==='rejected');
  assert.equal(writes,1);assert.ok(original.operationId);assert.equal(await count('cal'),before+1);
  await page.unroute(endpoint);await page.reload();
  const post=async form=>(await(await page.request.post(endpoint,{form})).json());
  let result=await post(original);assert.equal(result.success,true);assert.equal(result.replayed,true);assert.equal(result.surges,before+1);assert.equal(await count('cal'),before+1);
  result=await post({...original,operationId:crypto.randomUUID(),delta:'2'});assert.equal(result.success,true);assert.equal(await count('cal'),before+3);
  result=await post(original);assert.equal(result.surges,before+1);assert.equal(await count('cal'),before+3,'Replay must not overwrite later character edits.');
  result=await post({...original,delta:'9'});assert.equal(result.success,false);assert.equal(await count('cal'),before+3);
  await page.goto(origin+'/test-login.php?user=cal');result=await post(original);assert.equal(result.success,false);assert.equal(await count('cal'),before+3);
  assert.equal(await count('sharon'),other);assert.deepEqual(errors,[]);
  console.log('PASS: lost surge acknowledgement, replay after reload, later-write preservation and actor/payload collision rejection.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
