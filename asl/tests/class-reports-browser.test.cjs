const {chromium}=require(process.argv[2]);
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
const browser=await chromium.launch({headless:true,channel:'msedge'});try {
const page=await browser.newPage({viewport:{width:1280,height:900}});const base=process.argv[3],out=process.argv[4];
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(base+'/session.php?id=1');
for(const path of ['dashboard','weekly','notes','reports']) {
 const response=await page.goto(base+'/teacher/'+path+'.php');assert.equal(response.status(),200);
 assert.equal(await page.locator('select[name=teacher]').count(),0);
 assert.equal(await page.locator('header .pill').count(),0);
 assert.equal(await page.getByRole('button',{name:'Period 1',exact:true}).count(),1);
 await Promise.all([page.waitForNavigation(),page.getByRole('button',{name:'Period 1',exact:true}).click()]);
 assert.match(page.url(),/period=1/);
 assert.equal(await page.getByRole('button',{name:'Period 1',exact:true}).getAttribute('aria-pressed'),'true');
}
await page.screenshot({path:out+'-reports.png',fullPage:true});
const popupPromise=page.waitForEvent('popup');await page.getByRole('link',{name:'Print class reports (2)'}).click();const reports=await popupPromise;await reports.waitForLoadState();
assert.equal(await reports.locator('.report-sheet').count(),2);
assert.equal(await reports.locator('.report-progress-chart .chart-dot').count(),6);
assert.equal(await reports.locator('.report-progress-chart .chart-line').count(),4);
assert.equal(await reports.locator('.report-progress-chart circle[aria-label*="No growth required"]').count(),2);
for (const sheet of await reports.locator('.report-sheet').all()) {
 const earned=await sheet.locator('.report-data').evaluate(e=>JSON.parse(e.textContent).progress[0]);
 assert(earned>0,'fixture includes genuine first-block growth');
 assert.match(await sheet.locator('circle[aria-label*="No growth required"]').getAttribute('aria-label'),new RegExp(earned+' growth points earned'));
}
assert.deepEqual(await reports.locator('.report-header h1').allTextContents(),['ASL3 Student','Demo Student']);
await reports.emulateMedia({media:'print'});
assert.deepEqual(await reports.locator('body').evaluate(e=>({background:getComputedStyle(e).backgroundColor,color:getComputedStyle(e).color})),{background:'rgb(255, 255, 255)',color:'rgb(0, 0, 0)'});
assert.equal(await reports.locator('.report-progress-chart polygon').first().evaluate(e=>getComputedStyle(e).fill),'none','no colored or gray chart bands');
for(const mark of await reports.locator('.report-progress-chart line, .report-progress-chart polyline, .report-progress-chart path, .chart-dot').all()) {
 assert.equal(await mark.evaluate(e=>getComputedStyle(e).stroke),'rgb(0, 0, 0)','monochrome chart marks');
}
assert.equal(await reports.locator('.report-progress-chart polyline[stroke-dasharray="7 5"]').count(),2,'grade reference dash patterns retained');
assert.equal(await reports.getByText('Projected year-end skills:',{exact:false}).count(),2);
assert.equal(await reports.locator('.report-participation-chart').count(),2);
assert.equal(await reports.locator('.report-estimate').count(),2);
assert(await reports.locator('.report-participation-chart polyline').count() >= 2);
assert.equal(await reports.locator('.report-sheet').nth(1).evaluate(e=>getComputedStyle(e).breakBefore),'page');
for(const content of await reports.locator('.report-content').all())assert((await content.boundingBox()).height<980,'report fits one letter page');
const pdf=await reports.pdf({path:out+'.pdf',preferCSSPageSize:true,printBackground:true});
assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length,2,'one PDF page per student');
await reports.screenshot({path:out+'-class.png',fullPage:true});
await page.goto(base+'/report.php?period=2&level=2');
assert.equal(await page.locator('.report-sheet').count(),1);
assert.match(await page.locator('.report-improvements').innerText(),/Expression/);
assert.match(await page.locator('.report-improvements').innerText(),/Reception/);
await page.emulateMedia({media:'print'});
const asl2pdf=await page.pdf({path:out+'-asl2.pdf',preferCSSPageSize:true,printBackground:true});
assert.equal((asl2pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length,1,'dense ASL2 report fits one page without dropping modes');
await page.screenshot({path:out+'-asl2.png',fullPage:true});
await page.emulateMedia({media:'screen'});
await page.goto(base+'/report.php?period=1&level=1');assert.equal(await page.locator('.report-sheet').count(),1);
await page.goto(base+'/report.php?student_id=2');assert.equal(await page.locator('.report-sheet').count(),1);
assert.equal((await page.goto(base+'/report.php?period=all')).status(),400);
await page.goto(base+'/dashboard.php?student_id=2');
for (const range of ['ytd','full']) {
 await page.locator('[data-range-toggle="progress"] [data-range="'+range+'"]').click();
 assert.equal(await page.locator('#progress-chart .chart-dot').count(),3);
 assert.equal(await page.locator('#progress-chart .chart-line').count(),2);
 assert.equal(await page.locator('#progress-chart circle[aria-label*="No growth required"]').count(),1);
}
await page.locator('[data-chart-select="participation"]').click();
await page.getByRole('button',{name:'Block Percentage',exact:true}).click();
assert.match(await page.locator('#participation-summary').innerText(),/Latest block percentage/);
assert.match(await page.locator('#participation-legend').innerText(),/Your percentage in each block/);
assert.equal(await page.getByRole('button',{name:'4-Block Trend',exact:true}).count(),0);
assert.equal(await page.locator('#participation-chart .participation-trend').count()>0,true);
await page.goto(base+'/session.php?id=4');await page.goto(base+'/report.php?period=1');assert.equal(await page.locator('.report-sheet').count(),0,'another teacher cannot print Harms roster');
await page.goto(base+'/report.php?student_id=2');assert.match(await page.locator('body').innerText(),/not in your classes/);
const rules=fs.readFileSync('.htaccess','utf8');assert.match(rules,/RewriteRule \^\([^\n]*\|report\|[^\n]*asl\/\$1\.php/);
assert.deepEqual(errors,[]);console.log('PASS individual and class reports, print layout, teacher scope, common filters, root report route');
} finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
