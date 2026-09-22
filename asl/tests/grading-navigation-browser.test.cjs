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
 const search=page.locator('#student-search');
 await search.fill('learner roster35');
 assert.equal(await page.locator('[data-student-row]:visible').count(),1);
 await Promise.all([page.waitForNavigation(), page.locator('[name=standard]').selectOption({index:2})]);
 assert.equal(await search.inputValue(),'learner roster35');
 assert.equal(await page.locator('[data-student-row]:visible').count(),1);
 await search.fill('no such student');
 assert.equal(await page.locator('[data-student-row]:visible').count(),0);
 assert.equal(await page.locator('#student-search-empty').isVisible(),true);
 await search.fill('');
 const position=()=>page.evaluate(()=>{
 const w=document.querySelector('.grading-grid-wrap');
 const top=w.getBoundingClientRect().top+w.querySelector('thead').getBoundingClientRect().height;
 const row=[...document.querySelectorAll('[data-student-row]')].find(r=>!r.hidden&&r.getBoundingClientRect().bottom>top);
 return {id:row.dataset.studentRow,offset:row.getBoundingClientRect().top-top};
 });
 await page.locator('.grading-grid-wrap').evaluate(w=>w.scrollTop=1000);
 const before=await position();
 await Promise.all([page.waitForNavigation(), page.locator('[name=standard]').selectOption({index:3})]);
 const after=await position();
 assert.equal(after.id,before.id);assert(Math.abs(after.offset-before.offset)<2);
 await Promise.all([page.waitForNavigation(), page.getByRole('button',{name:'Reception',exact:true}).click()]);
 assert.equal((await position()).id,before.id);
 await search.fill('ROSTER35, learner');
 assert.equal(await page.locator('[data-student-row]:visible').count(),1);
 await page.screenshot({path:process.argv[4],fullPage:true});
 assert.deepEqual(errors,[]);
 console.log('PASS name filtering, empty/clear, competency persistence, student scroll anchor, assessment modes');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
