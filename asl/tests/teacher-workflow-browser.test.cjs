const {chromium} = require('playwright');
const assert = require('node:assert/strict');
(async () => {
 const browser = await chromium.launch({headless:true, channel:'msedge'});
 const page = await browser.newPage({viewport:{width:1280,height:720}});
 const base = process.argv[2];
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 page.on('dialog',dialog=>dialog.accept());
 try {
  const session=await (await page.request.get(base+'/session.php?id=1')).json();
  await page.goto(base+'/teacher/grading.php');
  await page.locator('.student-link').last().evaluate(link=>link.textContent='Julianne Faith Longhyphenatedfamilyname');
  assert.deepEqual(await page.locator('.teacher-nav a').allTextContents(), ['Grading','Attendance & Participation','Notes','Scroller','Resources','Roster','Settings','Logout']);
  assert.equal(await page.getByRole('group',{name:'Period',exact:true}).getByRole('button').count(),6);
  assert.equal(await page.locator('select[name=bucket],select[name=teacher],select[name=level],select[name=period]').count(),0);
  assert.equal(await page.getByRole('group',{name:'ASL level'}).getByRole('button').count(),3);
  const heights=await page.locator('[data-student-row]').evaluateAll(rows=>rows.map(row=>row.getBoundingClientRect().height));
  assert.equal(new Set(heights).size,1);
  assert((await page.locator('.student-link').first().textContent()).trim().startsWith('Learner'));
  await Promise.all([page.waitForNavigation(),page.getByRole('button',{name:'Period 1',exact:true}).click()]);
  assert.equal(await page.getByRole('button',{name:'Period 1',exact:true}).getAttribute('aria-pressed'),'true');
  await page.screenshot({path:process.argv[3]+'/asl-grading.png'});
  await page.goto(base+'/teacher/weekly.php');
  assert.equal(await page.locator('#save-all,#correction-btn,.block-cell:disabled').count(),0);
  assert(!(await page.locator('#block-grid thead').textContent()).includes('finalized'));
  assert(!(await page.locator('#block-grid thead').textContent()).includes('2026-'));
  const cell=page.locator('.block-cell[data-student="2"]').first();
  const before=Number(await cell.getAttribute('data-version'));
  await cell.fill('23');
  await page.waitForFunction(v=>document.querySelector('.block-cell[data-student="2"]').dataset.version===String(v),before+1);
  await page.reload(); assert.equal(await cell.inputValue(),'23');
  await cell.fill('35');
  assert.equal(await page.locator('#participation-warning').textContent(),'Demo Student: 8 above');
  assert.equal(await page.locator('#participation-warning').evaluate(el=>getComputedStyle(el).pointerEvents),'none');
  await page.waitForFunction(()=>!document.querySelector('.block-cell[data-student="2"]').classList.contains('dirty'));
  await page.reload(); assert.equal(await cell.inputValue(),'35');
  // Delay an accepted save while another edit is typed into the same field.
  let delayed=false;
  await page.route('**/api/save_block_metrics.php',async route=>{
   const response=await route.fetch();
   if(!delayed) { delayed=true; await new Promise(resolve=>setTimeout(resolve,700)); }
   await route.fulfill({response});
  });
  await cell.fill('21');
  await page.waitForFunction(()=>document.getElementById('save-state').textContent==='Saving…');
  await cell.fill('22');
  await page.waitForFunction(()=>document.querySelector('.block-cell[data-student="2"]').dataset.initial==='22');
  await page.unroute('**/api/save_block_metrics.php');
  await page.reload(); assert.equal(await cell.inputValue(),'22');
  const block=Number(await cell.getAttribute('data-block'));
  const revision=await page.evaluate(()=>BLOCK_CONFIG.revision);
  const stale=await page.request.post(base+'/api/save_block_metrics.php',{form:{csrf_token:session.csrf,calendar_revision:revision,changes:JSON.stringify([{student_id:2,block_id:block,version:0,participation_points:1}])}});
  assert.equal(stale.status(),409);
  await page.locator('#block-grid-wrap').evaluate(el=>el.scrollTop=700);
  const geometry=await page.evaluate(()=>({top:document.querySelector('#block-grid-wrap').getBoundingClientRect().top,head:document.querySelector('#block-grid thead').getBoundingClientRect().top}));
  assert(Math.abs(geometry.top-geometry.head)<2,'sticky header covers the very top of the scroll surface');
  await page.screenshot({path:process.argv[3]+'/asl-participation.png'});
  await page.getByRole('link',{name:'Attendance',exact:true}).click();
  const attendance=page.locator('.block-cell[data-student="2"]').first();
  await attendance.fill('3');
  await page.waitForFunction(()=>document.querySelector('.block-cell[data-student="2"]').dataset.initial==='3');
  await page.reload(); assert.equal(await attendance.inputValue(),'3');
  let rejectedRequests=0;
  await page.route('**/api/save_block_metrics.php',route=>{
   rejectedRequests++;
   return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({success:false,error:'Reload before saving again.'})});
  });
  await attendance.fill('4');
  await page.waitForFunction(()=>document.getElementById('save-state').textContent==='Reload before saving again.');
  await new Promise(resolve=>setTimeout(resolve,900));
  assert.equal(rejectedRequests,1,'failed saves do not retry automatically');
  assert.equal(await attendance.evaluate(el=>el.classList.contains('dirty')),true);
  await page.unroute('**/api/save_block_metrics.php');
  assert.deepEqual(errors,[]);
  console.log('PASS navigation, period/level buttons, uniform long-name rows, editable completed blocks, autosave/reload, overflow warning/save, concurrent typing, stale conflict, sticky header, attendance, failed-save retention without replay');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
