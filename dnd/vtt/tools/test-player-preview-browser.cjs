const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const origin='http://127.0.0.1:8129';
(async()=>{
  const manifest=await fetch(origin+'/diagnostic-manifest.json').then(r=>r.json());
  assert.equal(manifest.test_fixture,'floor-regression');
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const contexts=[];
    for(const user of ['GM','cal','sharon']) {
      const context=await browser.newContext();contexts.push(context);
      await context.request.get(origin+'/test-login.php?user='+user);
    }
    const [gm,cal,sharon]=contexts;
    const endpoint=origin+'/dnd/vtt/api/v2/player-preview.php';
    const snapshot=async context=>(await(await context.request.get(origin+'/dnd/vtt/api/v2/snapshot.php')).json()).snapshot;
    const anonymous=await browser.newContext();
    assert.equal((await anonymous.request.get(endpoint+'?user=cal')).status(),401);
    assert.equal((await cal.request.get(endpoint+'?user=sharon')).status(),403);
    assert.equal((await gm.request.post(endpoint+'?user=cal',{data:{}})).status(),405);
    for(const query of ['gm','missing-profile','cal&user[]=sharon']) {
      assert.equal((await gm.request.get(endpoint+'?user='+query)).status(),422);
    }
    const before=await snapshot(gm);
    for(const [user,context] of [['cal',cal],['sharon',sharon]]) {
      const response=await gm.request.get(endpoint+'?user='+user);
      assert.equal(response.status(),200,await response.text());
      const {preview}=await response.json();
      assert.equal(preview.readOnly,true);assert.equal(preview.userId,user);
      assert.deepEqual(preview.snapshot,await snapshot(context));
    }
    assert.deepEqual(await snapshot(gm),before);
    // GM credentials still authorize another GM-only read after previewing players.
    assert.equal((await gm.request.get(endpoint+'?user=cal')).status(),200);
    console.log('PASS: player preview HTTP authentication, methods, identity validation, exact player projection and unchanged canonical state.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
