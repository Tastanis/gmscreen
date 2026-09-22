const {chromium}=require(process.argv[2]);
const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true,channel:'msedge'});try{
const page=await browser.newPage({viewport:{width:1400,height:1050}}),base=process.argv[3];
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(base+'/session.php?id=1');await page.goto(base+'/dashboard.php?student_id=2');
for(const range of ['ytd','full']){
 await page.locator('[data-range-toggle="progress"] [data-range="'+range+'"]').click();
 const baseline=page.locator('#progress-chart circle[aria-label*="School-year starting point"]');
 assert.equal(await baseline.count(),1);assert.equal(Number(await baseline.getAttribute('cx')),58);
 assert.match(await baseline.getAttribute('aria-label'),/2026-09-08.*0 points/);
 assert.equal(await page.locator('#progress-chart .chart-dot').count(),await page.evaluate(()=>1+reportingBlocks().filter(blockHasStarted).length),'baseline plus two started reporting blocks, no daily history');
}
await page.locator('[data-chart-select="attendance"]').click();
assert.match(await page.locator('#attendance-summary').innerText(),/All-student average\s+100%/);
const hits=page.locator('.attendance-value');assert.equal(await hits.count(),await page.evaluate(()=>reportingBlocks().filter(blockHasStarted).length),'overlapping lines share one hit target per block');
assert.match(await hits.first().getAttribute('aria-label'),/Your attendance 100%; All-student average 100%/);
await hits.first().hover();assert.match(await hits.first().locator('title').textContent(),/100%/);
await page.screenshot({path:process.argv[4]+'-attendance.png',fullPage:true});
await page.locator('[data-chart-select="progress"]').click();
await page.locator('[data-range-toggle="progress"] [data-range="ytd"]').click();
await page.screenshot({path:process.argv[4]+'-progress.png',fullPage:true});
assert.deepEqual(errors,[]);console.log('PASS first-day zero baseline, block sampling, both ranges, attendance values and overlapping tooltips');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
