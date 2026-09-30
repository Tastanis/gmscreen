const {chromium}=require('playwright'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
// Loopback-only UI fixture. Production modules use a fake sheet endpoint; no
// campaign sessions, resources, combat or board commands are available here.
const root=path.resolve(__dirname,'../../..');
let stored={hero:{name:'Cal',victories:8,xp:2,heroTokens:[false,false],vitals:{currentStamina:5,staminaMax:20,currentRecoveries:1,recoveriesMax:3}},actions:{mains:[],maneuvers:[],triggers:[]}};
let holdRead=null,heldRead=null,posts=0;
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/'){res.setHeader('Content-Type','text/html');return res.end('<link rel="stylesheet" href="/dnd/vtt/assets/css/character-summary.css"><link rel="stylesheet" href="/dnd/character_sheet/ability-automation/automation.css"><style>body{--text:white;--accent-strong:white;--dice-surface:#222;margin:0}.anchor-host{position:absolute;left:0;top:0;width:40px;height:40px;overflow:hidden}.power-roll-runner__tiers{position:absolute;left:230px;top:40px;width:650px}</style><body class="vtt-body"><div id="vtt-character-summary-panel"></div><div id="respite"><button data-respite>Respite</button></div><div id="anchor-host" class="anchor-host"><button id="anchor">Hero</button></div><div class="power-roll-runner__tiers"><button disabled class="power-roll-runner__tier power-roll-runner__tier--selected"><span class="power-roll-runner__tier-range">17+</span><span class="power-roll-runner__tier-body">Damage and follow-up text</span></button></div></body>');}
 if(url.pathname.endsWith('/handler.php')){
  res.setHeader('Content-Type','application/json');
  if(req.method==='POST'){let body='';for await(const chunk of req)body+=chunk;const p=new URLSearchParams(body);assert.equal(p.get('action'),'save');stored=JSON.parse(p.get('data'));posts++;res.end(JSON.stringify({success:true}));return;}
  const data=structuredClone(stored),payload={success:true,character:'cal',data};
  if(holdRead&&url.searchParams.get('action')==='load'){heldRead=()=>res.end(JSON.stringify(payload));holdRead=null;return;}
  return res.end(JSON.stringify(payload));
 }
 const file=path.resolve(root,'.'+url.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.statusCode=404;return res.end();}
 let source=fs.readFileSync(file);
 if(url.pathname.endsWith('/sheet.js'))source=source.toString()+`\n// Test-only seams, never shipped to a live site.\nwindow.sheetQA={set(data){sheetState=mergeWithDefaults(data);activeCharacter='cal';},get(){return structuredClone(sheetState);},poll:pollSheetSync,save:saveSheet,bind:bindRespiteButton,renders:0};\nrenderAll=()=>{sheetQA.renders++;};renderHeroPane=()=>{};renderBars=()=>{};bindSurgeButtons=()=>{};bindVictoryButtons=()=>{};bindTokenButtons=()=>{};bindResourceControls=()=>{};broadcastStaminaToVtt=()=>{};\n`;
 res.setHeader('Content-Type',file.endsWith('.css')?'text/css':'text/javascript');res.end(source);
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1000,height:600}}),errors=[];
 try{
  page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);await page.evaluate(async(initial)=>{
   const {mountCharacterSummaryPanel}=await import('/dnd/vtt/assets/js/ui/character-summary-panel.js');
   mountCharacterSummaryPanel({sheet:'/dnd/character_sheet/handler.php'},{userId:'cal',isGM:false});
   document.dispatchEvent(new CustomEvent('vtt:token-selection-summary',{detail:{characterId:'cal',token:{id:'cal',name:'Cal',conditions:[]}}}));
   await import('/dnd/character_sheet/sheet.js');sheetQA.set(initial);sheetQA.bind();
  },stored);
  await page.waitForFunction(()=>document.querySelector('[data-character-counter="victories"]')?.textContent==='8');
  await importForPage(page);
  for(const [x,y] of [[0,0],[960,0],[0,550],[960,550]]){
   await page.evaluate(({x,y})=>{const host=document.getElementById('anchor-host');host.style.left=x+'px';host.style.top=y+'px';window.heroChoice=undefined;window.openHeroConfirmation(document.getElementById('anchor')).then(v=>window.heroChoice=v);},{x,y});
   const p=await page.locator('.vtt-character-token-confirmation').boundingBox();assert.ok(p.x>=7&&p.y>=7&&p.x+p.width<=993&&p.y+p.height<=593,'Both confirmation buttons stay inside the screen and outside clipped parent');
   await page.locator('[data-cancel-hero-token]').click();assert.equal(await page.evaluate(()=>heroChoice),false);
  }
  const contrast=await page.locator('.power-roll-runner__tier--selected').evaluate(el=>{const rgb=c=>c.match(/[\d.]+/g).slice(0,3).map(Number),lum=c=>rgb(c).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0),ratio=c=>(lum('rgb(216,204,176)')+.05)/(lum(c)+.05);return{body:ratio(getComputedStyle(el).color),range:ratio(getComputedStyle(el.querySelector('span')).color),opacity:getComputedStyle(el).opacity};});
  assert.ok(contrast.body>=4.5&&contrast.range>=4.5);assert.equal(contrast.opacity,'1');
  // Unchanged remote polling must not erase an open respite confirmation.
  await page.locator('[data-respite]').click();await page.evaluate(()=>sheetQA.poll());assert.equal(await page.locator('[data-confirm-respite]').count(),1);assert.equal(await page.evaluate(()=>sheetQA.renders),0);
  // Delay an old sheet read across the confirmed respite save. It must not
  // restore old victories locally after the save has completed.
  holdRead=true;await page.evaluate(()=>{window.oldPoll=sheetQA.poll();});
  for(let i=0;!heldRead&&i<100;i++)await new Promise(r=>setTimeout(r,10));assert.ok(heldRead);
  await page.locator('[data-confirm-respite]').click();await page.waitForFunction(()=>sheetQA.get().hero.victories===0);
  for(let i=0;posts<1&&i<100;i++)await new Promise(r=>setTimeout(r,10));assert.equal(posts,1);
  heldRead();heldRead=null;await page.evaluate(()=>oldPoll);
  assert.equal(await page.evaluate(()=>sheetQA.get().hero.victories),0,'Stale pre-respite response cannot restore victories');
  assert.equal(stored.hero.victories,0);assert.equal(stored.hero.xp,10);assert.equal(stored.hero.vitals.currentStamina,20);assert.equal(stored.hero.vitals.currentRecoveries,3);
  await page.waitForFunction(()=>document.querySelector('[data-character-counter="victories"]')?.textContent==='0',{},{timeout:10000});
  // Polling a settled identical summary preserves its DOM/focus rather than
  // rebuilding it every four seconds.
  await page.evaluate(()=>{window.savedCounter=document.querySelector('[data-character-counter="victories"]');});
  await page.waitForTimeout(4300);assert.equal(await page.evaluate(()=>savedCounter===document.querySelector('[data-character-counter="victories"]')),true);
  assert.deepEqual(errors,[]);console.log('PASS hero confirmations at four corners, selected tier contrast, open respite survival, stale read/write race, VP/XP/vitals and VTT display convergence, unchanged-poll DOM preservation');
 }finally{await browser.close();server.close();}
})().catch(e=>{heldRead?.();server.close();console.error(e);process.exitCode=1;});
async function importForPage(page){await page.evaluate(async()=>{window.openHeroConfirmation=(await import('/dnd/vtt/assets/js/ui/hero-token-confirmation.js')).showHeroTokenConfirmation;});return {};}
