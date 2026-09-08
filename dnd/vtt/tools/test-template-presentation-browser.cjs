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
    await command('template.upsert',{template:{id:'upper-rectangle',type:'rectangle',levelId:'test-upper',
      start:{column:9,row:3},length:4,width:2,rotation:90,anchor:{column:9,row:3}}},'upper-rectangle');
    for(const [id,levelId,squares] of [
      ['upper-wall','test-upper',[{column:9,row:5},{column:10,row:6},{column:11,row:5}]],
      ['lower-wall','level-0',[{column:6,row:5},{column:7,row:6},{column:8,row:6}]],
    ]) await command('template.upsert',{template:{id,type:'wall',levelId,squares,wallColor:'ice',color:'#33bbdd'}},id);
    await pc.locator('#vtt-template-layer [data-template-id="upper-wall"] .vtt-wall__connector--ne').waitFor();
    const lower='#vtt-template-layer [data-template-id="lower-circle"]';
    const upper='#vtt-template-layer [data-template-id="upper-circle"]';
    await gm.locator(lower).waitFor();await pc.locator(upper).waitFor();await pc.locator(lower).waitFor();
    assert.equal(await gm.locator(upper).isHidden(),true,'Templates above the viewer are hidden');
    assert.equal(await gm.locator(lower).evaluate(node=>node.style.maskImage),'','Same-floor template is unmasked');
    assert.match(await pc.locator(lower).evaluate(node=>node.style.maskImage),/data:image\/svg\+xml/,'Lower template is clipped through upper cutout');
    assert.equal(await pc.locator(upper).evaluate(node=>node.style.maskImage),'');
    const rectangle=pc.locator('#vtt-template-layer [data-template-id="upper-rectangle"]');await rectangle.waitFor();
    const rectangleStyles=await rectangle.evaluate(node=>({width:parseFloat(node.style.width),height:parseFloat(node.style.height),
      rotation:node.style.getPropertyValue('--vtt-rect-rotation'),label:node.querySelector('.vtt-template__label').textContent}));
    assert.ok(Math.abs(rectangleStyles.width-128)<1e-8);assert.equal(rectangleStyles.height,256);
    assert.equal(rectangleStyles.rotation,'90deg');assert.equal(rectangleStyles.label,'4.0 × 2.0');
    const before=await snapshot();
    const describe=nodes=>nodes.map(node=>({id:node.dataset.previewTemplateId||node.dataset.templateId,
      left:node.style.left,top:node.style.top,width:node.style.width,height:node.style.height,mask:node.style.maskImage,
      color:node.style.getPropertyValue('--vtt-template-color'),rotation:node.style.getPropertyValue('--vtt-rect-rotation'),
      wallColor:node.dataset.wallColor,wallGrid:node.style.getPropertyValue('--vtt-wall-grid'),
      tiles:[...node.querySelectorAll('.vtt-wall__tile,.vtt-wall__connector')].map(tile=>({className:tile.className,style:tile.getAttribute('style')})),
      label:node.querySelector('.vtt-template__label')?.textContent})).sort((a,b)=>a.id.localeCompare(b.id));
    const actual=await pc.locator('#vtt-template-layer > [data-template-id]').evaluateAll(describe);
    const writes=[];gm.on('request',r=>{if(r.method()!=='GET'&&r.url().includes('/api/v2/commands.php'))writes.push(r.url());});
    await gm.locator('[data-settings-launch="scenes"]').click();
    const panel=gm.locator('[data-player-preview]');await panel.locator('summary').click();
    await panel.locator('[data-preview-status]').filter({hasText:'captured'}).waitFor();
    await panel.locator('select').selectOption('sharon');await panel.locator('[data-preview-details]').filter({hasText:'Test balcony'}).waitFor();
    await panel.getByRole('button',{name:'View map and fog'}).click();
    const dialog=gm.locator('.vtt-player-preview-dialog');await dialog.locator('[data-preview-template-id="upper-rectangle"]').waitFor();
    assert.deepEqual(await dialog.locator('[data-preview-template-id]').evaluateAll(describe),actual);
    assert.equal(await dialog.locator('[data-template-id]').count(),0);
    await dialog.screenshot({path:'.playwright-mcp/player-area-template-preview.png'});
    await dialog.getByRole('button',{name:'Close preview'}).click();assert.deepEqual(writes,[]);
    await pc.reload();await pc.waitForFunction(()=>document.querySelector('[data-connection-status]')?.textContent.includes('Connected'));
    await pc.locator(lower).waitFor();
    assert.match(await pc.locator(lower).evaluate(node=>node.style.maskImage),/data:image\/svg\+xml/);
    await rectangle.waitFor();assert.equal(await rectangle.evaluate(node=>node.style.getPropertyValue('--vtt-rect-rotation')),'90deg');
    assert.deepEqual(await pc.locator('#vtt-template-layer > [data-template-id]').evaluateAll(describe),actual,'Fallback colors and geometry survive reload');
    assert.deepEqual(await snapshot(),before);assert.deepEqual(errors,[]);
    console.log('PASS: player preview matches circle, rectangle and diagonal wall geometry, colors and floor masks; reload preserves state and preview sends no commands.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
