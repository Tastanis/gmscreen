const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const origin='http://127.0.0.1:8129';
(async()=>{
  const manifest=await fetch(origin+'/diagnostic-manifest.json').then(r=>r.json());
  assert.equal(manifest.test_fixture,'floor-regression');
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const pages=[],errors=[];
    for(const user of ['GM','sharon']) {
      const page=await browser.newPage();page.on('pageerror',error=>errors.push(error.message));
      await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
      await page.goto(origin+'/test-login.php?user='+user);
      await page.waitForFunction(()=>document.querySelector('[data-connection-status]')?.textContent.includes('Connected'));
      pages.push(page);
    }
    const [gm,pc]=pages,sceneId=manifest.test_scene_id;
    const snapshot=async()=>(await(await gm.request.get(origin+'/dnd/vtt/api/v2/snapshot.php')).json()).snapshot;
    let sequence=0;
    async function command(type,payload,entityId=null) {
      const s=await snapshot();const response=await gm.request.post(origin+'/dnd/vtt/api/v2/commands.php',{data:{
        type,payload,entityId,sceneId,baseRevision:s.revision,
        entityRevision:entityId?(s.state.templates?.[sceneId]?.[entityId]?._entityRevision ?? 0):s.state.sceneConfig[sceneId]._revision,
        operationId:'template-presentation-'+Date.now()+'-'+ ++sequence,
      }});assert.equal(response.status(),200,await response.text());
    }
    for(const [id,levelId] of [['lower-circle','level-0'],['upper-circle','test-upper']]) {
      await command('template.upsert',{template:{id,type:'circle',levelId,center:{column:7,row:6},radius:2,color:'#22aaff'}},id);
    }
    await command('level.user.set',{userId:'sharon',entry:{levelId:'test-upper',source:'manual',followToken:false}});
    const lower='#vtt-template-layer [data-template-id="lower-circle"]';
    const upper='#vtt-template-layer [data-template-id="upper-circle"]';
    await gm.locator(lower).waitFor();await pc.locator(upper).waitFor();await pc.locator(lower).waitFor();
    assert.equal(await gm.locator(upper).isHidden(),true,'Templates above the viewer are hidden');
    assert.equal(await gm.locator(lower).evaluate(node=>node.style.maskImage),'','Same-floor template is unmasked');
    assert.match(await pc.locator(lower).evaluate(node=>node.style.maskImage),/data:image\/svg\+xml/,'Lower template is clipped through upper cutout');
    assert.equal(await pc.locator(upper).evaluate(node=>node.style.maskImage),'');
    const before=await snapshot();
    await pc.reload();await pc.waitForFunction(()=>document.querySelector('[data-connection-status]')?.textContent.includes('Connected'));
    await pc.locator(lower).waitFor();
    assert.match(await pc.locator(lower).evaluate(node=>node.style.maskImage),/data:image\/svg\+xml/);
    assert.deepEqual(await snapshot(),before);assert.deepEqual(errors,[]);
    console.log('PASS: actual GM/player templates retain same-floor, above-floor and cutout-clipped behavior across reload.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
