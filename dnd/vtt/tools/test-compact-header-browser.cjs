const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const origin='http://127.0.0.1:8129';
(async()=>{
  assert.equal((await fetch(origin+'/diagnostic-manifest.json').then(r=>r.json())).test_fixture,'floor-regression');
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    for(const user of ['GM','cal']) {
      const page=await browser.newPage({viewport:{width:1280,height:720}});
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
      await page.goto(origin+'/test-login.php?user='+user);
      await page.waitForFunction(()=>document.querySelector('[data-connection-status]')?.textContent==='Connected');
      assert.equal(await page.locator('[data-connection-status]').isVisible(),false);
      assert.equal(await page.locator('[data-map-navigation-root], [data-character-operation-review-open], .vtt-idle-tracker-summary').count(),0);
      for(const width of [1280,1920]) {
        await page.setViewportSize({width,height:800});
        const bounds=await page.locator('.vtt-board__scene-meta').boundingBox();
        assert.ok(bounds.height<=130,JSON.stringify(bounds));
        assert.ok(bounds.x+bounds.width<=width,JSON.stringify(bounds));
        assert.ok(await page.locator('.vtt-combat-tracker').isVisible());
        const actions=await page.locator('.vtt-board__actions').boundingBox();
        assert.ok(actions.width<300,JSON.stringify(actions));
      }
      if(user==='GM') {
        if(await page.locator('[data-combat-tracker]').getAttribute('data-combat-active')!=='true') await page.locator('[data-action="start-combat"]').click();
        await page.waitForFunction(()=>document.querySelector('[data-combat-tracker]').dataset.combatActive==='true');
        const bounds=await page.locator('.vtt-board__scene-meta').boundingBox();
        assert.ok(bounds.height<=130,JSON.stringify(bounds));
        await page.screenshot({path:'.playwright-mcp/compact-header-gm.png'});
        if(await page.locator('[data-action="view-map-level-up"]').isEnabled()) await page.locator('[data-action="view-map-level-up"]').click();
        await page.waitForFunction(()=>document.querySelector('[data-map-level-nav-name]').textContent.includes('Test'));
        await page.locator('[data-action="activate-map-level"]').click();
      } else await page.screenshot({path:'.playwright-mcp/compact-header-player.png'});
      await page.evaluate(()=>window.dispatchEvent(new Event('offline')));
      // Simulate browser connectivity without disrupting the test server.
      await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,value:false});window.dispatchEvent(new Event('offline'));});
      assert.equal(await page.locator('[data-connection-status]').isVisible(),true);
      assert.equal(await page.locator('[data-connection-status]').textContent(),'Offline');
      await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,value:true});window.dispatchEvent(new Event('online'));});
      assert.equal(await page.locator('[data-connection-status]').isVisible(),false);
      assert.deepEqual(errors,[]);
      await page.close();
    }
    console.log('PASS: compact GM/player headers at 1280/1920, tracker always visible, no tool section, combat start and floor controls, warning only offline, no browser errors.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
