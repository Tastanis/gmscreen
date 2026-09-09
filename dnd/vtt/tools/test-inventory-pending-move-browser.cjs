const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    for(const succeeds of [true,false]) {
      const page=await browser.newPage();
      await page.route('**/*',r=>r.abort());
      await page.setContent('<body data-character="cal" data-user="GM" data-is-gm="1" class="edit-mode"><input id="edit-toggle"><div id="inventory-pane"></div></body>');
      await page.evaluate(()=>{
        window.requests=[];window.confirmations=0;
        window.confirm=()=>{confirmations++;return true;};
        window.fetch=(_url,options)=>new Promise(resolve=>requests.push({fields:Object.fromEntries(new URLSearchParams(options.body)),respond:result=>resolve({json:async()=>result})}));
      });
      await page.addScriptTag({path:path.resolve(__dirname,'../../character_sheet/inventory-tab.js')});
      await page.evaluate(()=>requests[0].respond({success:true,data:{cal:{items:[{id:'item',name:'Before',effectSections:[],_fieldRevisions:{name:'before'}}]}}}));
      await page.locator('[data-ci-action="open"]').click();
      await page.locator('[data-ci-field="name"]').fill('Latest edit');
      await page.locator('[data-ci-action="share"]').first().click();
      await page.waitForFunction(()=>requests.length===2);
      assert.equal(await page.evaluate(()=>requests[1].fields.action),'update_item_field');
      assert.equal(await page.evaluate(()=>confirmations),0,'Move confirmation waits for the pending edit');
      await page.evaluate(succeeds=>requests[1].respond(succeeds?{success:true,field_revisions:{name:'accepted'}}:{success:false,error:'Injected failure'}),succeeds);
      if(succeeds) {
        await page.waitForFunction(()=>requests.length===3);
        const move=await page.evaluate(()=>requests[2].fields);
        assert.equal(move.action,'share_item');
        assert.equal(JSON.parse(move.expected_item_fields).name,'accepted');
        assert.equal(await page.evaluate(()=>confirmations),1);
      } else {
        await page.waitForFunction(()=>document.querySelector('#ci-status').textContent.includes('unsaved edits'));
        assert.equal(await page.evaluate(()=>requests.length),2);
        assert.equal(await page.evaluate(()=>confirmations),0);
        assert.equal(await page.locator('[data-ci-field="name"]').inputValue(),'Latest edit');
      }
      await page.close();
    }
    console.log('PASS move waits for pending edits and accepted revision; failed edit retains draft and sends no move');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
