// Pinned skill columns on the grading grid (Brandon, October 2026): a pinned skill leads the grid and stays while the
// competency, mode or period changes; its cells grade like any other; the pin button or a refresh unpins.
// Run: php tests/competency-browser-fixture.php --grading-roster  -> serve that folder with php -S, then
//      node tests/grading-pins-browser.test.cjs <playwright path> <base url> <screenshot path>
const {chromium}=require(process.argv[2]);
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try {
 const page=await browser.newPage({viewport:{width:1280,height:720}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const base=process.argv[3];
 await page.goto(base+'/session.php?id=1');
 await page.goto(base+'/teacher/grading.php?level=1');
 const pinnedIds=()=>page.$$eval('.grading-grid-wrap thead tr:nth-child(2) th.skill-head.pinned',n=>n.map(th=>th.dataset.target));
 assert.deepEqual(await pinnedIds(),[],'nothing pinned at first');
 // pin the first skill of the first competency
 const first=await page.locator('.grading-grid-wrap thead tr:nth-child(2) th.skill-head').first().getAttribute('data-target');
 await Promise.all([page.waitForNavigation(), page.locator(`.grading-grid-wrap thead tr:nth-child(2) th.skill-head[data-target="${first}"] .pin-btn`).click()]);
 assert.deepEqual(await pinnedIds(),[first],'the pinned skill leads the grid');
 assert.equal(await page.locator('.grading-grid-wrap thead tr:nth-child(2) th.skill-head').first().getAttribute('data-target'),first);
 assert.equal(await page.locator(`.grading-grid-wrap thead tr:nth-child(2) th.skill-head[data-target="${first}"]`).count(),1,'not shown twice');
 const row=page.locator('[data-student-row]').first();
 assert.equal(await row.locator('td.grade-cell').first().getAttribute('data-target'),first,'its cells lead each row');
 // another competency: the pin stays, and a second skill can be pinned from there
 await Promise.all([page.waitForNavigation(), page.locator('[name=standard]').selectOption({index:3})]);
 assert.deepEqual(await pinnedIds(),[first],'the pin stays when the competency changes');
 const second=await page.locator('.grading-grid-wrap thead tr:nth-child(2) th.skill-head:not(.pinned)').first().getAttribute('data-target');
 await Promise.all([page.waitForNavigation(), page.locator(`.grading-grid-wrap thead tr:nth-child(2) th.skill-head[data-target="${second}"] .pin-btn`).click()]);
 assert.deepEqual(await pinnedIds(),[first,second],'two skills from two competencies side by side');
 await Promise.all([page.waitForNavigation(), page.getByRole('button',{name:'Reception',exact:true}).click()]);
 assert.deepEqual(await pinnedIds(),[first,second],'pins stay when the mode changes');
 // grading a pinned cell saves
 const cell=page.locator(`[data-student-row] td.grade-cell[data-target="${second}"]`).first();
 const before=await cell.getAttribute('data-score');
 await cell.click(); await page.waitForFunction(el=>!el.classList.contains('saving'),await cell.elementHandle());
 assert.notEqual(await cell.getAttribute('data-score'),before,'a pinned cell grades');
 assert.equal(await cell.evaluate(el=>el.classList.contains('save-error')),false);
 await page.screenshot({path:process.argv[4],fullPage:false});
 // the pin button unpins
 await Promise.all([page.waitForNavigation(), page.locator(`.grading-grid-wrap thead tr:nth-child(2) th.skill-head.pinned[data-target="${first}"] .pin-btn`).click()]);
 assert.deepEqual(await pinnedIds(),[second],'the pin button unpins');
 // a refresh unpins everything
 await page.reload(); await page.waitForLoadState('load'); await page.waitForTimeout(300);
 assert.deepEqual(await pinnedIds(),[],'a refresh unpins');
 assert.equal(new URL(page.url()).searchParams.get('pins'),null);
 assert.deepEqual(errors,[]);
 console.log('PASS pin leads the grid, survives competency and mode changes, two categories side by side, grades, unpins by button and refresh');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
