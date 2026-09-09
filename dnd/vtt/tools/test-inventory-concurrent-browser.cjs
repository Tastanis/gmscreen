const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const origin='http://127.0.0.1:8129';
(async()=>{
  assert.equal((await fetch(origin+'/diagnostic-manifest.json').then(r=>r.json())).test_fixture,'floor-regression');
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const pages=[];
    for(let i=0;i<2;i++) {
      const p=await browser.newPage();
      await p.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
      await p.goto(origin+'/test-login.php?user=GM');
      await p.goto(origin+'/diagnostic-manifest.json');
      pages.push(p);
    }
    const endpoint=origin+'/dnd/character_sheet/inventory_handler.php';
    const created=await(await pages[0].request.post(endpoint,{form:{action:'add_item',tab:'cal'}})).json();
    assert.equal(created.success,true);const id=created.item.id;
    for(const p of pages) {
      await p.setContent(`<base href="${origin}/dnd/character_sheet/"><body data-character="cal" data-user="GM" data-is-gm="1" class="edit-mode"><input id="edit-toggle"><div id="inventory-pane"></div></body>`);
      // Hold each loaded draft stable, as in an editor that has not refreshed yet.
      await p.evaluate(()=>{window.setInterval=()=>0;});
      await p.addScriptTag({path:path.resolve(__dirname,'../../character_sheet/inventory-tab.js')});
      await p.locator(`[data-ci-action="open"][data-item-id="${id}"]`).click();
    }
    async function edit(p,field,value) {
      const response=p.waitForResponse(r=>r.url()===endpoint && r.request().postData()?.includes('action=update_item_field'));
      await p.locator(`[data-item-id="${id}"] [data-ci-field="${field}"]`).fill(value);
      await p.locator('#edit-toggle').dispatchEvent('change');
      return (await response).json();
    }
    assert.equal((await edit(pages[0],'name','Newest accepted name')).success,true);
    assert.equal((await edit(pages[1],'description','Independent second-window note')).success,true);
    pages[1].on('dialog',dialog=>dialog.accept());
    for(const action of ['delete','share']) {
      const expectedAction=action==='delete'?'delete_item':'share_item';
      const response=pages[1].waitForResponse(r=>r.url()===endpoint && r.request().postData()?.includes('action='+expectedAction));
      await pages[1].locator(`[data-ci-action="${action}"][data-item-id="${id}"]`).first().click();
      const rejected=await(await response).json();
      assert.equal(rejected.success,false);assert.match(rejected.error,/another window/);
      assert.equal(await pages[1].locator(`[data-item-id="${id}"] [data-ci-field="name"]`).count(),1);
    }
    const stale=await edit(pages[1],'name','My unsaved name');
    assert.equal(stale.success,false);assert.match(stale.error,/another window/);
    assert.equal(await pages[1].locator(`[data-item-id="${id}"] [data-ci-field="name"]`).inputValue(),'My unsaved name');
    assert.equal((await edit(pages[0],'name','Next accepted name')).success,true);
    const loaded=await(await pages[0].request.post(endpoint,{form:{action:'load'}})).json();
    const saved=loaded.data.cal.items.find(x=>x.id===id);
    assert.equal(saved.name,'Next accepted name');assert.equal(saved.description,'Independent second-window note');
    async function upload(p) {
      const chooser=p.waitForEvent('filechooser');
      await p.locator(`[data-ci-action="upload-image"][data-item-id="${id}"]`).click();
      const response=p.waitForResponse(r=>r.url()===endpoint && r.request().method()==='POST');
      await(await chooser).setFiles({name:'pixel.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1sAAAAASUVORK5CYII=','base64')});
      return(await response).json();
    }
    const firstImage=await upload(pages[0]);assert.equal(firstImage.success,true);
    const staleImage=await upload(pages[1]);assert.equal(staleImage.success,false);assert.match(staleImage.error,/another window/);
    const secondImage=await upload(pages[0]);assert.equal(secondImage.success,true);
    assert.notEqual(secondImage.image_path,firstImage.image_path,'Image replacements get distinct paths');
    const afterImages=await(await pages[0].request.post(endpoint,{form:{action:'load'}})).json();
    assert.equal(afterImages.data.cal.items.find(x=>x.id===id).image,secondImage.image_path);
    console.log('PASS two real inventory editors: stale field rejected, draft retained, unrelated field preserved, accepted revision chain continues');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
