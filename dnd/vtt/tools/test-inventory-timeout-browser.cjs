const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    for(const stage of ['request','body']) {
      const page=await browser.newPage();
      await page.route('**/*',r=>r.abort());
      await page.setContent('<body data-character="cal" data-user="GM" data-is-gm="1" class="edit-mode"><input id="edit-toggle"><div id="inventory-pane"></div></body>');
      await page.evaluate(()=>{
        const original=window.setTimeout;
        window.setTimeout=(fn,ms,...args)=>original(fn,ms===15000?300:ms,...args);
        window.requests=[];window.confirmations=0;window.confirm=()=>{confirmations++;return true;};
        window.fetch=(_url,options)=>new Promise(resolve=>requests.push({signal:options.signal,fields:Object.fromEntries(new URLSearchParams(options.body)),
          respond:result=>resolve({json:async()=>result}),
          stallBody:()=>resolve({json:()=>new Promise(resolve=>{window.releaseBody=resolve;})}),
        }));
      });
      await page.addScriptTag({path:path.resolve(__dirname,'../../character_sheet/inventory-tab.js')});
      await page.evaluate(()=>requests[0].respond({success:true,data:{cal:{items:[{id:'item',name:'Before',effectSections:[],_fieldRevisions:{name:'original'}}]}}}));
      await page.locator('[data-ci-action="open"]').click();
      await page.locator('[data-ci-field="name"]').fill('Unsaved draft');
      await page.locator('#edit-toggle').dispatchEvent('change');
      await page.waitForFunction(()=>requests.length===2);
      if(stage==='body')await page.evaluate(()=>requests[1].stallBody());
      await page.waitForFunction(()=>document.querySelector('#ci-status')?.textContent.includes('timed out'));
      assert.equal(await page.evaluate(()=>requests[1].signal.aborted),true);
      assert.equal(await page.locator('[data-ci-field="name"]').inputValue(),'Unsaved draft');
      await page.evaluate(stage=>{
        const result={success:true,field_revisions:{name:'late'}};
        if(stage==='body')releaseBody(result);else requests[1].respond(result);
      },stage);
      await page.locator('[data-ci-action="share"]').first().click();
      await page.waitForFunction(()=>document.querySelector('#ci-status')?.textContent.includes('unsaved edits'));
      assert.equal(await page.evaluate(()=>requests.length),2,'No retry or move after uncertainty');
      assert.equal(await page.evaluate(()=>confirmations),0);
      await page.close();
    }
    console.log('PASS inventory stalled request/body: bounded failure, retained draft, ignored late success, no replay or move');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
