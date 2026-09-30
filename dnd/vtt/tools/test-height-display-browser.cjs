const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const board = fs.readFileSync(path.join(root, 'assets/js/ui/board-interactions.js'), 'utf8');
const handler = board.slice(board.indexOf("    element.querySelector('[data-token-flight-height]')?.addEventListener('change'"), board.indexOf("    menu.movementMode?.addEventListener('change', async () =>"));
const syncStart = board.indexOf("    const flightInput=tokenSettingsMenu?.element.querySelector('[data-token-flight-height]');");
const sync = board.slice(syncStart).split(/\r?\n\r?\n/)[0];
(async () => {
 const browser = await chromium.launch({channel:'chrome',headless:true});
 try {
  const page = await browser.newPage();
  await page.route('http://height.test/**', route => {
   const url = new URL(route.request().url());
   if (url.pathname === '/') return route.fulfill({contentType:'text/html',body:'<nav data-map-level-nav><span data-map-level-nav-name></span></nav><div id="settings"><label>Height <input type="number" step="1" data-token-flight-height></label><span data-flight-height-error hidden></span></div>'});
   const file = path.join(root, url.pathname);
   route.fulfill({contentType:'text/javascript',body:fs.readFileSync(file,'utf8')});
  });
  await page.goto('http://height.test/');
  await page.evaluate(async ({handler,sync}) => {
   window.requestAnimationFrame=()=>{};
   window.token={id:'pc',movementMode:'fly',flightHeight:2.5832915};window.saved=[];
   window.terrainPrototype={groundFor:p=>p.flightHeight,setTokenHeight:async(p,height)=>{saved.push(height);p.flightHeight=height;}};
   window.terrainContext=()=>({isGM:true,levelId:'level-0',selectedIds:['pc'],state:{boardState:{activeSceneId:'test',placements:{test:[token]},sceneState:{test:{}}}}});
   const {groundSquare}=await import('/assets/js/ui/terrain-math.mjs');
   const {gmVision}=await import('/assets/js/ui/gm-vision.js');
   window.refreshHeight=()=>gmVision.syncNavigation();
   window.syncHeight=()=>new Function('tokenSettingsMenu','placement','groundSquare',sync)({element:document.querySelector('#settings')},token,groundSquare);
   new Function('element','getPlacementFromStore','activeTokenSettingsId','groundSquare',handler)(document.querySelector('#settings'),()=>token,'pc',groundSquare);
   syncHeight();refreshHeight();
  },{handler,sync});
  const input=page.locator('[data-token-flight-height]');
  assert.equal(await input.inputValue(),'3');
  assert.equal(await page.locator('[data-map-level-nav-name]').innerText(),'Height 3');
  await input.dispatchEvent('change');
  assert.deepEqual(await page.evaluate(()=>({raw:token.flightHeight,saved})),{raw:2.5832915,saved:[]});
  await input.fill('2.58');await input.dispatchEvent('change');assert.equal(await input.inputValue(),'3');
  await input.fill('');await input.dispatchEvent('change');assert.equal(await input.inputValue(),'3');
  await input.fill('4');await input.dispatchEvent('change');
  await page.waitForFunction(()=>!document.querySelector('[data-token-flight-height]').disabled);
  assert.deepEqual(await page.evaluate(()=>({raw:token.flightHeight,saved})),{raw:4,saved:[4]});
  await page.evaluate(()=>{document.activeElement.blur();token.flightHeight=.93;syncHeight();refreshHeight();});
  assert.equal(await input.inputValue(),'1');assert.equal(await page.locator('[data-map-level-nav-name]').innerText(),'Height 1');
  await page.evaluate(()=>{document.activeElement.blur();token.flightHeight=-.93;syncHeight();refreshHeight();});
  assert.equal(await input.inputValue(),'-1');assert.equal(await page.locator('[data-map-level-nav-name]').innerText(),'Height -1');
  console.log('Height browser checks passed: whole-square labels, exact raw retention, same-square no-op, decimal rejection and intentional edit.');
 } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
