const {chromium}=require('playwright');
const {randomUUID}=require('node:crypto');
const assert=require('node:assert/strict');
const origin='http://127.0.0.1:8129';
(async()=>{
  assert.equal((await fetch(origin+'/diagnostic-manifest.json').then(r=>r.json())).test_fixture,'floor-regression');
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const page=await browser.newPage();
    await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
    await page.goto(origin+'/test-login.php?user=GM');
    const endpoint=origin+'/dnd/character_sheet/handler.php';
    const read=async()=> (await page.request.get(endpoint+'?action=sync-stamina&character=cal')).json();
    const before=await read();
    const operationId=randomUUID();
    const form={action:'sync-stamina',character:'cal',currentStamina:'12',operationId};
    const first=await (await page.request.post(endpoint,{form})).json();
    assert.equal(first.success,true);assert.equal(first.operationId,operationId);
    assert.equal(first.currentStamina,12);assert.equal(first.staminaMax,before.staminaMax);
    assert.equal(first.replayed,false);
    // Another accepted edit must never be overwritten by an old transport retry.
    assert.equal((await (await page.request.post(endpoint,{form:{...form,currentStamina:'19',operationId:randomUUID()}})).json()).success,true);
    const replay=await (await page.request.post(endpoint,{form})).json();
    assert.equal(replay.replayed,true);assert.equal(replay.currentStamina,12);
    assert.equal((await read()).currentStamina,19);
    const changed=await (await page.request.post(endpoint,{form:{...form,currentStamina:'7'}})).json();
    assert.equal(changed.success,false);assert.equal((await read()).currentStamina,19);
    const status=await (await page.request.get(endpoint+'?action=operation-status&character=cal&operationId='+operationId)).json();
    assert.equal(status.success,true);
    assert.equal(status.receipt.action,'sync-stamina');
    assert.equal(status.receipt.response.currentStamina,12);
    assert.equal((await read()).currentStamina,19);
    await page.reload();
    assert.equal((await read()).currentStamina,19);
    console.log('PASS stamina receipt: saved with value, read-only status, replay retains later edit, changed payload rejected, reload retained');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
