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
  const open=page.locator('[data-character-operation-review-open]');
  await open.click();
  const dialog=page.locator('[data-character-operation-review]');
  const row=dialog.locator('[data-character-operation-id="'+original.operationId+'"]');
  await row.getByRole('button',{name:'Check saved result'}).click();
  await row.locator('[data-character-operation-outcome]').filter({hasText:'Recorded surge count: '+(before+1)}).waitFor();
  assert.equal(await count('cal'),before+1);
  await row.getByRole('button',{name:'Check saved result'}).click();
  await row.locator('[data-character-operation-outcome]').filter({hasText:'Recorded surge count:'}).waitFor();
  assert.equal(await count('cal'),before+1);
  await page.screenshot({path:'.playwright-mcp/character-operation-review.png'});
  await row.getByRole('button',{name:'Mark reviewed'}).click();
  await dialog.getByRole('button',{name:'Close',exact:true}).click();
  await page.reload();assert.equal(await open.textContent(),'Action review');
  // Actor-scoped read access does not expose GM's receipt to a player.
  await page.goto(origin+'/test-login.php?user=cal');
  const denied=await(await page.request.get(endpoint+'?action=operation-status&character=cal&operationId='+original.operationId)).json();
  assert.equal(denied.recorded,false);assert.equal(await open.textContent(),'Action review');
  // A request interrupted before it reaches the server stays explicitly uncertain.
  await page.route(endpoint,async route=>{
   if(!route.request().postData()?.includes('action=sync-surges'))return route.continue();
   original=Object.fromEntries(new URLSearchParams(route.request().postData()));await route.abort();
  });
  await page.evaluate(()=>{window.receiptResult='pending';document.dispatchEvent(new CustomEvent('vtt:automation-apply-surge',{detail:{payload:{placementId:'floor-cal',amount:1},resolve:()=>window.receiptResult='resolved',reject:()=>window.receiptResult='rejected'}}));});
  await page.waitForFunction(()=>window.receiptResult==='rejected');await page.unroute(endpoint);await page.reload();
  await open.click();const missing=dialog.locator('[data-character-operation-id="'+original.operationId+'"]');
  await missing.getByRole('button',{name:'Check saved result'}).click();
  await missing.locator('[data-character-operation-outcome]').filter({hasText:'No receipt is recorded yet'}).waitFor();
  assert.equal(await count('cal'),before+1);
  assert.equal(await count('sharon'),other);assert.deepEqual(errors,[]);
  console.log('PASS: interrupted-action panel survives reload, reads saved outcomes without replay, isolates accounts and distinguishes missing receipts.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
