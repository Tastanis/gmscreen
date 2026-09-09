const { waitForBrowserState } = require('./wait-for-browser-state.cjs');
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const origin='http://127.0.0.1:8129';
const duplicateMode=process.argv.includes('--duplicate');
(async()=>{
  const manifest=await fetch(origin+'/diagnostic-manifest.json').then(r=>r.json());
  assert.equal(manifest.test_fixture,'floor-regression');
  const endpoint=origin+'/dnd/vtt/api/v2/scene-import.php';
  assert.equal((await fetch(endpoint,{method:'POST'})).status,401);
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const errors=[];
    async function client(user){
      const page=await browser.newPage({viewport:{width:1280,height:720}}); page.setDefaultTimeout(15000);
      page.on('pageerror',e=>errors.push(e.message));
      await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
      await page.goto(origin+'/test-login.php?user='+user);
      await page.waitForFunction(()=>document.querySelector('[data-connection-status]')?.textContent.includes('Connected'));
      return page;
    }
    const gm=await client('GM'),pc=await client('cal');
    await gm.evaluate(()=>{window.sceneImportNavigationMarker='same-page';});
    const snapshot=async()=>(await(await gm.request.get(origin+'/dnd/vtt/api/v2/snapshot.php')).json()).snapshot;
    const before=await snapshot();
    const packageData=(await(await gm.request.get(origin+'/dnd/vtt/api/v2/scene-export.php?sceneId='+manifest.test_scene_id)).json()).package;
    const originalName=packageData.scene.name;
    packageData.scene.name='Import regression copy';
    assert.equal((await pc.request.post(endpoint,{data:{package:packageData,operationId:'denied-import-001',allowPlayerBrowsing:true}})).status(),403);
    assert.equal((await gm.request.get(endpoint)).status(),405);
    assert.equal((await gm.request.post(endpoint,{data:{package:packageData,operationId:'no-consent-001'}})).status(),422);
    const bad=structuredClone(packageData); bad.scene.mapUrl='data:text/html,<script>bad</script>';
    assert.equal((await gm.request.post(endpoint,{data:{package:bad,operationId:'bad-image-001',allowPlayerBrowsing:true}})).status(),422);
    assert.deepEqual(await snapshot(),before);
    await gm.locator('[data-settings-launch="scenes"]').click();
    if(duplicateMode){
      const duplicate=gm.locator(`[data-action="duplicate-scene"][data-scene-id="${manifest.test_scene_id}"]`);
      const group=gm.locator('.scene-group').filter({has:duplicate});
      if((await group.getAttribute('class')).includes('is-collapsed')) await group.locator('[data-action="toggle-folder"]').click();
      await duplicate.click();
    }else{
      await gm.locator('[data-scene-import-preview] > summary').click();
      await gm.locator('#vtt-scene-import-file').setInputFiles({name:'copy.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(packageData))});
    }
    await gm.waitForFunction(()=>document.querySelector('[data-scene-import-status]')?.textContent==='Scene package preview ready.');
    const panel=gm.locator('[data-scene-import-result]');
    const copyName=panel.getByRole('textbox',{name:'New scene name',exact:true});
    assert.equal(await copyName.inputValue(),duplicateMode?'Copy of '+originalName:'Import regression copy');
    await copyName.fill('Renamed reusable encounter');
    const install=panel.getByRole('button',{name:'Import as new scene',exact:true});
    assert.equal(await install.count(),1,await panel.textContent());
    assert.equal(await install.isDisabled(),true);
    await panel.getByRole('checkbox').check();
    let accepted,requests=0;
    await gm.route(endpoint,async route=>{
      requests++;
      if(requests===1){const response=await route.fetch(); accepted=await response.json(); assert.equal(response.status(),200,JSON.stringify(accepted)); await route.abort();}
      else await route.continue();
    });
    let catalogFailure=true;
    await gm.route(origin+'/dnd/vtt/api/scenes.php',async route=>{
      if(requests===2 && catalogFailure && route.request().method()==='GET'){
        catalogFailure=false; await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({success:false,error:'Test refresh failure'})});
      }else await route.continue();
    });
    await install.click();
    await gm.waitForFunction(()=>document.querySelector('[data-scene-import-status]')?.textContent.includes('Retry here'));
    assert.equal(await copyName.isDisabled(),true,'Retry cannot change an already accepted request.');
    await panel.getByRole('button',{name:'Retry import',exact:true}).click();
    await gm.waitForFunction(()=>document.querySelector('[data-scene-import-status]')?.textContent.includes('scene list could not be refreshed'));
    assert.equal(await panel.getByRole('button',{name:'Open copy for GM',exact:true}).count(),0);
    await panel.getByRole('button',{name:'Retry import',exact:true}).click();
    await gm.waitForFunction(()=>document.querySelector('[data-scene-import-status]')?.textContent.includes('Ready to open.'));
    const id=accepted.scene.id; const after=await snapshot();
    assert.equal(accepted.scene.name,'Renamed reusable encounter');
    assert.equal(after.revision,before.revision+1,'Lost response and retry create only one event.');
    assert.deepEqual(after.state.routing,before.state.routing);
    for(const domain of ['placements','sceneConfig','drawings','templates']){
      assert.deepEqual(after.state[domain]?.[manifest.test_scene_id],before.state[domain]?.[manifest.test_scene_id]);
      assert.ok(after.state[domain]?.[id]);
    }
    const oldIds=new Set(Object.keys(packageData.domains.placements));
    assert.ok(Object.keys(after.state.placements[id]).every(key=>!oldIds.has(key)));
    const catalog=(await(await gm.request.get(origin+'/dnd/vtt/api/scenes.php')).json()).data;
    assert.equal(catalog.items.filter(s=>s.id===id).length,1);
    await gm.screenshot({path:'.playwright-mcp/scene-import-result.png'});
    assert.equal(await gm.evaluate(()=>window.sceneImportNavigationMarker),'same-page','Import must not reload the browser.');
    await panel.getByRole('button',{name:'Open copy for GM',exact:true}).click();
    await waitForBrowserState(gm, async sceneId=>(await(await fetch('/dnd/vtt/api/v2/snapshot.php')).json()).snapshot.state.routing.activeSceneId===sceneId,id);
    const firstToken=Object.keys(after.state.placements[id])[0];
    await gm.locator(`[data-placement-id="${firstToken}"]`).first().waitFor({state:'visible'});
    assert.equal(await gm.evaluate(()=>window.sceneImportNavigationMarker),'same-page','Opening the copy must not reload the browser.');
    await gm.reload();
    await gm.waitForFunction(()=>document.querySelector('[data-connection-status]')?.textContent.includes('Connected'));
    const opened=await snapshot();
    assert.equal(opened.state.routing.activeSceneId,id);
    assert.deepEqual(opened.state.placements[id],after.state.placements[id],'Opening and reloading preserve copied tokens.');
    assert.deepEqual(opened.state.placements[manifest.test_scene_id],before.state.placements[manifest.test_scene_id]);
    assert.deepEqual(errors,[]);
    console.log(`PASS: isolated scene ${duplicateMode?'duplication':'import'}, naming, validation and permissions, lost-response/catalog-refresh retries, one copy, fresh IDs, unchanged original/routing, opening without reload, and later reload.`);
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
