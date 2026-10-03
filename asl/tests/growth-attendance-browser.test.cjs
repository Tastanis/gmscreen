// Real endpoints against the disposable reports-browser-fixture only.
const {chromium}=require(process.argv[2]);
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try {
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  const base=process.argv[3]; const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const {csrf}=await (await page.request.get(base+'/session.php?id=1&reset=1')).json();
  await page.goto(base+'/teacher/weekly.php?metric=attendance');
  const cells=page.locator('.block-cell[data-student="2"]');
  assert(await cells.count()>=2,'fixture has two elapsed blocks');
  assert(Number(await cells.nth(1).getAttribute('max'))>10,'cumulative entry may exceed one block');
  const revision=await page.evaluate(()=>BLOCK_CONFIG.revision);
  const saveAbs=async(index,value)=>{
   const cell=cells.nth(index);
   const response=await page.request.post(base+'/api/save_block_metrics.php',{form:{
    csrf_token:csrf,calendar_revision:revision,changes:JSON.stringify([{student_id:2,
     block_id:Number(await cell.getAttribute('data-block')),version:Number(await cell.getAttribute('data-version')),absences:value}])}});
   assert.equal(response.status(),200,await response.text());
   await page.reload();
  };
  await saveAbs(0,6); await saveAbs(1,6);
  await page.goto(base+'/dashboard.php?student_id=2');
  let payload=await page.evaluate(()=>dashboardData);
  assert.deepEqual(payload.attendance.ytd_absences.slice(0,2),[6,6]);
  assert.deepEqual(payload.attendance.absences.slice(0,2),[6,0]);
  assert.deepEqual(payload.progress.overall.slice(0,2),[0,0]);
  await page.locator('[data-chart-select="attendance"]').click();
  assert.equal(await page.locator('#attendance-summary > span').count(),2);
  assert.match(await page.locator('#attendance-summary').innerText(),/Percentage of class missed/);
  assert.doesNotMatch(await page.locator('#attendance-summary').innerText(),/All-student average/);

  assert.match(await page.locator('#attendance-summary').innerText(),new RegExp((100-payload.attendance.ytd_percent[1]).toFixed(1).replace('.', '\\.')));
  const targets=payload.taxonomy.flatMap(b=>b.standards.flatMap(s=>s.targets)).filter(t=>t.sub_code === 'E');
  const saveScore=async(target,score)=>{
   const response=await page.request.post(base+'/api/save_score.php',{form:{csrf_token:csrf,student_id:2,target_id:target.id,score}});
   assert.equal(response.status(),200,await response.text());
  };
  await saveScore(targets[0],''); await saveScore(targets[1],2); await saveScore(targets[2],3);
  const four=targets.slice(3).find(t=>t.rubric['4']); await saveScore(four,4);
  await page.goto(base+'/teacher/grading.php?level=1');
  assert.equal(await page.locator(`.grade-cell[data-student="2"][data-target="${targets[1].id}"]`).getAttribute('data-score'),'2');
  assert.equal(await page.locator(`.grade-cell[data-student="2"][data-target="${targets[2].id}"]`).getAttribute('data-score'),'3');
  assert.equal(await page.locator(`.grade-cell[data-student="2"][data-target="${four.id}"]`).getAttribute('data-score'),'4');
  assert.equal(await page.locator('.grade-cell[data-score=""],.grade-cell[data-score="0"]').count(),0);
  assert.equal(await page.locator(`.grade-cell[data-student="2"][data-target="${targets[0].id}"]`).getAttribute('data-score'),'1','cleared score displays baseline one');
  await page.goto(base+'/dashboard.php?student_id=2');
  payload=await page.evaluate(()=>dashboardData);
  assert.equal(payload.progress.overall[1],6,'two, three and four contribute one, two and three growth points');
  await page.goto(base+'/report.php?student_id=2');
  assert.doesNotMatch(await page.locator('.report-header').innerText(),/Period|2026/);
  assert.match(await page.locator('.report-header').innerText(),/Sep 21.*Oct 2/);
  assert.match(await page.locator('.report-summary').innerText(),/6.*of class/s);
  assert.doesNotMatch(await page.locator('.report-improvements').innerText(),/0 → 1|— →/);
  assert.equal(await page.locator('.report-progress-chart').evaluate(e=>e.getBoundingClientRect().height),300);
  assert.equal(await page.locator('.report-content').evaluate(e=>Number(getComputedStyle(e).zoom)),1);
  assert.doesNotMatch(await page.locator('.report-progress-chart').textContent(),/[ABCD] ·/);
  assert.deepEqual(errors,[]);
  console.log('PASS cumulative attendance API/dashboard, two cards, baseline scores, preserved higher scores, growth history and report layout');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
