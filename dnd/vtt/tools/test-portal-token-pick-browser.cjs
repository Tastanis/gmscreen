const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
// Disposable static browser fixture: no campaign data, sessions or requests.
const root=path.resolve(__dirname,'../../..');
const board=fs.readFileSync(path.join(root,'dnd/vtt/assets/js/ui/board-interactions.js'),'utf8');
const wall=fs.readFileSync(path.join(root,'dnd/vtt/assets/js/ui/wall-editor.mjs'),'utf8');
const css=wall.match(/style\.textContent='([^']+)';document\.head\.append\(style\)/)[1];
const begin=board.slice(board.indexOf('  function beginDamageHealTargeting('),board.indexOf('  function updateDamageHealTargetingStatus('));
const cancel=board.slice(board.indexOf('  function cancelDamageHealTargeting('),board.indexOf('  function clearDamageHealStatusTimeout('));
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:500,height:400}});
 await page.setContent(`<style>${css}#map{position:relative;width:300px;height:300px}#token{position:absolute;left:80px;top:55px;width:40px;height:40px;background:green}#door{left:100px;top:75px}</style><div id="map"><div id="token"></div><div id="wall-portals"><button id="door" class="wall-portal">Door</button></div></div>`);
 await page.evaluate(({begin,cancel})=>{
  window.pickQA=new Function('mapSurface', `let pendingDamageHeal=null;const status={textContent:'Ready'},defaultStatusText='Ready';const normalizeAutomationDamageType=v=>v,clearDamageHealStatusTimeout=()=>{},updateDamageHealTargetingStatus=()=>{},setDamageHealMode=()=>{},restoreStatus=()=>{};${begin}\n${cancel}\nreturn{begin:beginDamageHealTargeting,cancel:cancelDamageHealTargeting};`)(document.getElementById('map'));
  window.doorClicks=0;document.getElementById('door').onclick=()=>window.doorClicks++;
 },{begin,cancel});
 const center=await page.locator('#door').boundingBox();const x=center.x+center.width/2,y=center.y+center.height/2;
 const hit=()=>page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.id,{x,y});
 assert.equal(await hit(),'door');await page.mouse.click(x,y);assert.equal(await page.evaluate(()=>doorClicks),1);
 for(const mode of ['heal','damage']){
  await page.evaluate(mode=>pickQA.begin(mode,3),mode);
  assert.equal(await hit(),'token',`${mode} targets the token through the visible door symbol`);
  await page.mouse.click(x,y);assert.equal(await page.evaluate(()=>doorClicks),1,'Target pick must not operate the door');
  await page.evaluate(()=>pickQA.cancel());assert.equal(await hit(),'door');
 }
 await page.mouse.click(x,y);assert.equal(await page.evaluate(()=>doorClicks),2,'Normal door clicks resume after targeting');
 console.log('PASS actual browser token/portal hit priority, healing/damage and cancellation');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
