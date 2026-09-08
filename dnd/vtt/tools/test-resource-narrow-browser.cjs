const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const origin='http://127.0.0.1:8129';
(async()=>{
  const manifest=await fetch(origin+'/diagnostic-manifest.json').then(r=>r.json());assert.equal(manifest.test_fixture,'floor-regression');
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    await page.goto(origin+'/test-login.php?user=GM');
    await page.waitForFunction(()=>document.querySelector('[data-connection-status]')?.textContent.includes('Connected'));
    const sceneId=manifest.test_scene_id;
    const snapshot=async()=>(await(await page.request.get(origin+'/dnd/vtt/api/v2/snapshot.php')).json()).snapshot;
    const tokenState=async()=>(await snapshot()).state.placements[sceneId]['floor-cal'];
    async function until(check){const end=Date.now()+15000;while(!await check()){if(Date.now()>end)throw Error('Timed out waiting for forced zone outcome');await new Promise(resolve=>setTimeout(resolve,100));}}


    async function command(type,payload={}) {
      const s=await snapshot();const response=await page.request.post(origin+'/dnd/vtt/api/v2/commands.php',{data:{type,payload,sceneId,operationId:require('node:crypto').randomUUID(),baseRevision:s.revision}});
      assert.equal(response.status(),200,await response.text());
    }

    const sheetUrl=origin+'/dnd/character_sheet/handler.php';
    const summary=async()=>(await(await page.request.get(sheetUrl+'?action=summary&character=cal')).json()).data;
    const initial=await summary();
    await page.request.post(sheetUrl,{form:{action:'sync-resource',source:'vtt',character:'cal',value:'5'}});
    let held=null,body=null,resourceWrites=0;
    await page.route(sheetUrl,route=>{
      const form=new URLSearchParams(route.request().postData() || '');
      if(form.get('action')==='sync-resource' && form.has('expectedValue')){held=route;body=form;resourceWrites++;return;}
      return route.continue();
    });
    await command('combat.start',{encounterId:'resource-narrow',startingTeam:'ally'});
    await until(async()=>Boolean(held));
    assert.equal(body.get('expectedValue'),'5');assert.equal(body.has('data'),false);
    if(process.env.VTT_TEST_STALL_RESOURCE==='1') {
      await page.waitForFunction(()=>document.body.textContent.includes('Resource save was not confirmed. Review the current character resource'));
      assert.equal(resourceWrites,1,'An uncertain resource write is not retried');
      assert.equal(Number((await summary()).hero.resource.value),5);
      await held.abort().catch(()=>{});await page.unroute(sheetUrl);
      assert.deepEqual(errors,[]);
      console.log('PASS: stalled resource automation returns an unconfirmed status without retry or success.');
      return;
    }

    const hp=Number(initial.hero.vitals.currentStamina)-2;
    await page.request.post(sheetUrl,{form:{action:'sync-stamina',source:'vtt',character:'cal',currentStamina:String(hp)}});
    await held.continue();
    await until(async()=>Number((await summary()).hero.resource.value)===Number(body.get('value')));
    assert.equal(Number((await summary()).hero.vitals.currentStamina),hp,'Resource automation cannot overwrite concurrent stamina');
    await page.unroute(sheetUrl);
    const current=Number((await summary()).hero.resource.value);
    const stale=await page.request.post(sheetUrl,{form:{action:'sync-resource',source:'vtt',character:'cal',expectedValue:String(current+1),value:'99'}});
    assert.equal((await stale.json()).success,false);
    assert.equal(Number((await summary()).hero.resource.value),current,'A stale resource prompt cannot overwrite the current balance');
    const valid=await page.request.post(sheetUrl,{form:{action:'sync-resource',source:'vtt',character:'cal',expectedValue:String(current),value:'4'}});
    assert.equal((await valid.json()).success,true);
    assert.equal(Number((await summary()).hero.resource.value),4);
    assert.deepEqual(errors,[]);
    console.log('PASS: actual resource automation uses a narrow conditional write, preserves concurrent stamina and rejects stale balances.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
