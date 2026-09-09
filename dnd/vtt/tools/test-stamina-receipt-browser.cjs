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
    const client=await page.evaluate(async()=>{
      const {writeSheetStamina}=await import('/dnd/vtt/assets/js/services/stamina-sync-service.js');
      const {getCharacterOperationJournal}=await import('/dnd/vtt/assets/js/services/character-operation-journal.js');
      const endpoint='/dnd/character_sheet/handler.php';
      const saved=await (await writeSheetStamina(endpoint,{character:'cal',currentStamina:18})).json();
      const journal=getCharacterOperationJournal();
      const cleared=!journal.list().some(e=>e.operationId===saved.operationId);
      const lostId=crypto.randomUUID();let writes=0;
      const recovered=await (await writeSheetStamina(endpoint,{character:'cal',currentStamina:17},{operationId:lostId,timeoutMs:1500,
        fetchImpl:async(...args)=>{if(args[1].method==='GET')return fetch(...args);writes++;await fetch(...args);return new Promise(()=>{});}})).json();
      return {cleared,lostId,writes,recovered,pending:journal.list().find(e=>e.operationId===lostId)};
    });
    assert.equal(client.cleared,true);assert.equal(client.writes,1);
    assert.equal(client.pending,undefined);assert.equal(client.recovered.currentStamina,17);
    assert.equal((await read()).currentStamina,17);
    const confirmed=await (await page.request.get(endpoint+'?action=operation-status&character=cal&operationId='+client.lostId)).json();
    assert.equal(confirmed.receipt.response.currentStamina,17);
    await page.reload();
    const retained=await page.evaluate(async id=>{
      const {getCharacterOperationJournal}=await import('/dnd/vtt/assets/js/services/character-operation-journal.js');
      return getCharacterOperationJournal().list().find(e=>e.operationId===id);
    },client.lostId);
    assert.equal(retained,undefined);
    assert.equal((await read()).currentStamina,17);
    console.log('PASS stamina receipt: saved with value, read-only status, replay retains later edit, changed payload rejected, reload retained');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
