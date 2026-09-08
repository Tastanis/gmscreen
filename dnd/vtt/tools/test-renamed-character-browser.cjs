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


    const current=await snapshot();
    const renamed=await page.request.post(origin+'/dnd/vtt/api/v2/commands.php',{data:{
      type:'placement.batch',operationId:require('node:crypto').randomUUID(),baseRevision:current.revision,
      payload:{actions:[{kind:'patch',sceneId,placementId:'floor-cal',entityRevision:current.state.placements[sceneId]['floor-cal']._entityRevision,patch:{name:'Sharon'}}]},
    }});
    assert.equal(renamed.status(),200);
    await page.reload();await page.waitForFunction(()=>document.querySelector('[data-connection-status]')?.textContent.includes('Connected'));
    const sheetUrl=origin+'/dnd/character_sheet/handler.php';
    const summary=async()=>(await(await page.request.get(sheetUrl+'?action=summary&character=cal')).json()).data;
    const seed=await page.request.post(sheetUrl,{form:{action:'sync-vitals',source:'vtt',character:'cal',currentRecoveries:'1'}});
    assert.equal((await seed.json()).success,true);
    const hp=Number((await summary()).hero.vitals.currentStamina);
    const otherBefore=(await(await page.request.get(sheetUrl+'?action=summary&character=sharon')).json()).data.hero.vitals.currentRecoveries;
    let held=null,body=null;
    await page.route(sheetUrl,route=>{
      const form=new URLSearchParams(route.request().postData() || '');
      if(form.has('spendRecoveries')){held=route;body=form;return;}
      return route.continue();
    });
    async function spend(){await page.evaluate(()=>{
      window.spendAck={status:'pending'};
      document.dispatchEvent(new CustomEvent('vtt:automation-spend-recovery',{detail:{payload:{placementId:'floor-cal',recoveries:1},
        resolve:result=>{window.spendAck={status:'resolved',result};},reject:error=>{window.spendAck={status:'rejected',error:error.message};},
      }}));
    });}
    await spend();await until(async()=>Boolean(held));
    assert.equal(await page.evaluate(()=>window.spendAck.status),'pending');
    assert.equal(body.get('character'),'cal');assert.equal(body.has('data'),false);
    await page.request.post(sheetUrl,{form:{action:'sync-resource',source:'vtt',character:'cal',value:'9'}});
    await page.unroute(sheetUrl);await held.continue();
    await page.waitForFunction(()=>window.spendAck.status==='resolved');
    assert.equal(await page.evaluate(()=>window.spendAck.result.spent),1);
    let sheet=await summary();assert.equal(Number(sheet.hero.vitals.currentRecoveries),0);
    assert.equal(Number(sheet.hero.resource.value),9);assert.equal(Number(sheet.hero.vitals.currentStamina),hp);
    await spend();await page.waitForFunction(()=>window.spendAck.status==='resolved');
    assert.equal(await page.evaluate(()=>window.spendAck.result.reason),'insufficient');
    await page.request.post(sheetUrl,{form:{action:'sync-vitals',source:'vtt',character:'cal',currentRecoveries:'1'}});
    const responses=await Promise.all([1,2].map(()=>page.request.post(sheetUrl,{form:{action:'sync-vitals',source:'vtt',character:'cal',spendRecoveries:'1'}})));
    const outcomes=await Promise.all(responses.map(response=>response.json()));
    assert.deepEqual(outcomes.map(result=>result.spent).sort(),[0,1],'Only one request can spend the final recovery');
    await page.reload();await page.waitForFunction(()=>document.querySelector('[data-connection-status]')?.textContent.includes('Connected'));
    sheet=await summary();assert.equal(Number(sheet.hero.resource.value),9);assert.equal(Number(sheet.hero.vitals.currentRecoveries),0);
    const calSurges=(await(await page.request.get(sheetUrl+'?action=summary&character=cal')).json()).data.hero.surges || 0;
    const sharonSurges=(await(await page.request.get(sheetUrl+'?action=summary&character=sharon')).json()).data.hero.surges || 0;
    await page.evaluate(()=>new Promise(resolve=>document.dispatchEvent(new CustomEvent('vtt:automation-apply-surge',{detail:{resolve,payload:{placementId:'floor-cal',amount:1}}}))));
    const afterCal=(await(await page.request.get(sheetUrl+'?action=summary&character=cal')).json()).data.hero.surges || 0;
    const afterSharon=(await(await page.request.get(sheetUrl+'?action=summary&character=sharon')).json()).data.hero.surges || 0;
    assert.equal(Number(afterCal),Number(calSurges)+1);assert.equal(afterSharon,sharonSurges);
    const otherAfter=(await(await page.request.get(sheetUrl+'?action=summary&character=sharon')).json()).data.hero.vitals.currentRecoveries;
    assert.equal(otherAfter,otherBefore,'Renaming Cal to Sharon must not spend Sharon recoveries');
    assert.deepEqual(errors,[]);
    console.log('PASS: a Cal-linked token named Sharon uses Cal recovery data and spending while Sharon remains unchanged.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
