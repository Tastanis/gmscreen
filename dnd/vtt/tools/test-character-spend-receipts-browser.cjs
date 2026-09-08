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
  const post=async form=>(await(await page.request.post(endpoint,{form:{source:'vtt',character:'cal',...form}})).json());
  const sheet=async character=>(await(await page.request.get(endpoint+'?action=summary&character='+character)).json()).data;
  const other=await sheet('sharon');
  for(const test of [
   {name:'recovery spend',action:'sync-vitals',fields:{spendRecoveries:'1'},seed:3,key:'spent',result:1,after:2},
   {name:'resource spend',action:'sync-resource',fields:{spend:'2'},seed:5,key:'paid',result:true,after:3},
   {name:'conditional resource',action:'sync-resource',fields:{value:'7',expectedValue:'5'},seed:5,key:'resource',result:7,after:7},
   {name:'insufficient recoveries',action:'sync-vitals',fields:{spendRecoveries:'1'},seed:0,key:'spent',result:0,after:0},
   {name:'insufficient resource',action:'sync-resource',fields:{spend:'2'},seed:0,key:'paid',result:false,after:0},
   {name:'stale resource',action:'sync-resource',fields:{value:'7',expectedValue:'5'},seed:3,key:'success',result:false,after:3},
  ]) {
   const recovery=test.action==='sync-vitals';
   const seed=async value=>{const r=await post(recovery?{action:'sync-vitals',currentRecoveries:String(value)}:{action:'sync-resource',value:String(value)});assert.equal(r.success,true);};
   const balance=async()=>{const data=await sheet('cal');return Number(recovery?data.hero.vitals.currentRecoveries:data.hero.resource.value);};
   await seed(test.seed);let original,writes=0;
   await page.route(endpoint,async route=>{
    if(!route.request().postData()?.includes('operationId='))return route.continue();
    writes++;original=Object.fromEntries(new URLSearchParams(route.request().postData()));
    const response=await route.fetch();assert.equal((await response.json()).operationId,original.operationId);
    await route.abort();
   });
   await page.evaluate(async ({action,fields})=>{
    const {confirmCharacterWrite}=await import('/dnd/vtt/assets/js/services/character-write.js');
    window.spendReceipt={status:'pending'};
    confirmCharacterWrite('/dnd/character_sheet/handler.php',action,{character:'cal',...fields})
     .then(()=>window.spendReceipt={status:'resolved'})
     .catch(error=>window.spendReceipt={status:'rejected',operationId:error.operationId});
   },test);
   await page.waitForFunction(()=>window.spendReceipt.status==='rejected');
   assert.equal(writes,1,test.name);assert.equal(await page.evaluate(()=>window.spendReceipt.operationId),original.operationId);
   assert.equal(await balance(),test.after,test.name);
   await page.unroute(endpoint);await page.reload();
   let result=await post(original);assert.equal(result.replayed,true,test.name);assert.equal(result[test.key],test.result,test.name);assert.equal(await balance(),test.after);
   await seed(9);result=await post(original);assert.equal(result.replayed,true);assert.equal(result[test.key],test.result);assert.equal(await balance(),9,'Old attempt must preserve later balance: '+test.name);
  }
  assert.deepEqual(await sheet('sharon'),other);assert.deepEqual(errors,[]);
  console.log('PASS: recovery/resource lost responses, replay after reload, persistent insufficient/stale outcomes and later-balance preservation.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
