// Run with reports-browser-fixture.php --semester-boundary (local fake clock).
const {chromium}=require(process.argv[2]);
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try {
  const page=await browser.newPage({viewport:{width:1280,height:900}}),base=process.argv[3];
  page.setDefaultTimeout(10000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const {csrf}=await (await page.request.get(base+'/session.php?id=1')).json();
  await page.goto(base+'/teacher/weekly.php?metric=attendance');
  const second=page.locator('[data-student="2"][data-field="absences_next_semester"]');
  assert.equal(await second.count(),1,'crossing block exposes a distinct semester-two entry');
  assert.equal(await second.getAttribute('max'),'4','semester two has four elapsed school days');
  const block=await second.getAttribute('data-block');
  const first=page.locator(`.block-cell[data-student="2"][data-block="${block}"][data-field="absences"]`);
  assert(Number(await first.getAttribute('max'))>80,'first-semester limit stays cumulative');
  const reset=await page.request.post(base+'/api/save_block_metrics.php',{form:{csrf_token:csrf,calendar_revision:await page.evaluate(()=>BLOCK_CONFIG.revision),changes:JSON.stringify([{student_id:2,block_id:Number(block),version:Number(await first.getAttribute('data-version')),absences:null,absences_next_semester:null}])}});
  assert.equal(reset.status(),200);await page.reload();
  const nextVersion=Number(await first.getAttribute('data-version'))+1;
  await first.fill('6');
  await second.fill('1');
  await page.waitForFunction(({block,nextVersion})=>[...document.querySelectorAll(`.block-cell[data-student="2"][data-block="${block}"]`)].every(e=>!e.classList.contains('dirty')&&Number(e.dataset.version)===nextVersion),{block,nextVersion});
  assert.equal(await first.getAttribute('data-version'),await second.getAttribute('data-version'),'both entries share one committed version');
  await page.reload();assert.equal(await first.inputValue(),'6');assert.equal(await second.inputValue(),'1');
  await second.fill('2');
  await page.waitForFunction(block=>document.querySelector(`.block-cell[data-student="2"][data-block="${block}"][data-field="absences_next_semester"]`).dataset.initial==='2',block);
  await first.fill('7');
  await page.waitForFunction(block=>document.querySelector(`.block-cell[data-student="2"][data-block="${block}"][data-field="absences"]`).dataset.initial==='7',block);
  await page.reload();assert.equal(await first.inputValue(),'7');assert.equal(await second.inputValue(),'2');
  const revision=await page.evaluate(()=>BLOCK_CONFIG.revision),version=Number(await first.getAttribute('data-version'));
  const rejected=await page.request.post(base+'/api/save_block_metrics.php',{form:{csrf_token:csrf,calendar_revision:revision,
   changes:JSON.stringify([{student_id:2,block_id:Number(block),version,absences:8,absences_next_semester:5}])}});
  assert.equal(rejected.status(),409,'second-semester total cannot exceed four elapsed days');
  assert.match((await rejected.json()).error,/instructional days elapsed in this semester/);
  await page.reload();assert.equal(await first.inputValue(),'7','failed batch does not partially change semester one');
  await page.goto(base+'/dashboard.php?student_id=2');
  const data=await page.evaluate(()=>dashboardData);
  const index=data.reporting_blocks.findIndex(b=>String(b.id)===block);
  assert.equal(data.attendance.ytd_absences[index],9,'year attendance retains seven from first semester and two from second');
  assert.equal(data.reporting_blocks[index].instructional_days,10,'proficiency and participation block remains unchanged');
  assert.equal(data.reporting_blocks[index].attendance_periods.reduce((n,p)=>n+p.instructional_days_elapsed,0),9,'attendance excludes the published teacher workday');
  const days=data.reporting_blocks.slice(0,index+1).flatMap(b=>b.attendance_periods).reduce((n,p)=>n+p.instructional_days_elapsed,0);
  assert.equal(data.attendance.ytd_percent[index],Math.round((days-9)/days*1000)/10);
  assert.deepEqual(errors,[]);
  console.log('PASS semester boundary, distinct snapshots, shared-version autosave, reload, bounds, atomic rejection and year attendance');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
