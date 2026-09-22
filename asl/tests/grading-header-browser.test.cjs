const {chromium}=require(process.argv[2]);
const assert=require('node:assert/strict');
(async()=>{
const browser=await chromium.launch({headless:true,channel:'msedge'});
try {
const page=await browser.newPage({viewport:{width:1422,height:720}});
const base=process.argv[3];let saves=0;
page.on('request',r=>{if(r.url().includes('save_score.php'))saves++;});
await page.goto(base+'/session.php?id=1');
await page.goto(base+'/teacher/grading.php?level=1&standard=C1.sentences');
// Choose a real competency ID from the rendered options.
await Promise.all([page.waitForNavigation(),page.locator('[name=standard]').selectOption({index:2})]);
await page.locator('.grading-grid-wrap').hover();
await page.mouse.wheel(0,220);
await page.waitForTimeout(250);
assert(await page.locator('header').evaluate(e=>e.getBoundingClientRect().bottom)<=0,'navigation leaves screen when scrolling over roster');
await page.locator('.grading-grid-wrap').evaluate(e=>{e.scrollTop=800;});
const points=await page.evaluate(()=>{
 const head=document.querySelector('.grading-grid thead'),r=head.getBoundingClientRect();
 const buffer=document.querySelector('.grading-header-buffer').getBoundingClientRect();
 const hits=[];
 for(let y=r.top+1;y<r.bottom;y+=3)for(let x=r.left+2;x<Math.min(r.right,innerWidth-30);x+=13){
 const hit=document.elementFromPoint(x,y);
 if(!hit?.closest('thead')) hits.push({x,y,tag:hit?.tagName,cls:hit?.className});
 }
 return {hits,buffer:{x:buffer.left+30,y:buffer.top+4},head:{x:r.left,y:r.top,width:Math.min(r.width,innerWidth-r.left-25),height:r.height+55}};
});
assert.deepEqual(points.hits,[],'every point in pinned header blocks underlying students and grade cells');
await page.mouse.click(points.buffer.x,points.buffer.y);
assert.equal(saves,0,'buffer never saves a score');
await page.screenshot({path:process.argv[4],fullPage:false});
console.log('PASS solid header hit testing, non-grading buffer, navigation scroll-away');
}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
