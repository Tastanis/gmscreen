const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const origin='http://127.0.0.1:8129';
(async()=>{
  const manifest=await fetch(origin+'/diagnostic-manifest.json').then(r=>r.json());
  assert.equal(manifest.test_fixture,'floor-regression');
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    for(const [user,theme] of [['GM','dark'],['cal','dark'],['cal','light'],['cal','diablo']]){
      const page=await browser.newPage({viewport:{width:1280,height:720}});
      page.setDefaultTimeout(15000);
      await page.addInitScript(theme=>{
        localStorage.setItem('vtt.theme',theme==='light'?'light':'dark');
        if(theme==='diablo')localStorage.setItem('dnd-dashboard-theme','diablo');else localStorage.removeItem('dnd-dashboard-theme');
      },theme);
      await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
      await page.goto(origin+'/test-login.php?user='+user);
      await page.waitForFunction(()=>document.querySelector('[data-connection-status]')?.textContent.includes('Connected'));
      if(user!=='GM') await page.locator('[data-action="return-token-floor"]').click();
      assert.equal(await page.locator('.mem-badge').count(),0);
      const selectors=user==='GM'?'.vtt-board__level-button, .vtt-board__level-activate':'.vtt-board__level-return, [data-floor-follow-mode]';
      const controls=await page.locator(selectors).evaluateAll(nodes=>nodes.map(node=>{
        const r=node.getBoundingClientRect();return {height:r.height,width:r.width,left:r.left,right:r.right,bottom:r.bottom,label:node.textContent.trim(),whiteSpace:getComputedStyle(node).whiteSpace};
      }));
      assert.ok(controls.length>=2);
      for(const control of controls){
        assert.ok(control.height>=26 && control.width>=28,JSON.stringify(control));
        assert.ok(control.left>=0 && control.right<=1280 && control.bottom<=720,JSON.stringify(control));
      }
      if(user==='GM'){
        await page.locator('[data-settings-launch="tokens"]').click();
        await page.waitForFunction(()=>Math.abs(document.querySelector('#vtt-settings-panel').getBoundingClientRect().left)<1);
        const color=await page.locator('#vtt-settings-panel').evaluate(node=>getComputedStyle(node).backgroundColor);
        assert.match(color,/^rgb\(/,'Settings panel must have an opaque base.');
      }else{
        await page.locator('#vtt-token-layer [data-placement-id="floor-cal"]').click();
        const panel=page.locator('#vtt-character-summary-panel');
        if(await panel.evaluate(el=>el.inert))await page.locator('#vtt-token-layer [data-placement-id="floor-cal"]').click();
        await page.waitForFunction(()=>Math.abs(document.querySelector('#vtt-character-summary-panel').getBoundingClientRect().left)<1);
        const color=await panel.evaluate(node=>getComputedStyle(node).backgroundColor);
        assert.match(color,/^rgb\(/,'Character panel must have an opaque base.');
      }
      await page.screenshot({path:`.playwright-mcp/readability-${user}-${theme}.png`});
      if(user==='GM'){
        await page.goto(origin+'/dnd/vtt/?diagnostics=1');
        await page.locator('.mem-badge').waitFor({state:'visible'});
      }
      await page.close();
    }
    console.log('PASS: GM/player 1280x720 floor targets and bounds, opaque settings/character panels in dark/light/Diablo, memory widget diagnostics-only.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
