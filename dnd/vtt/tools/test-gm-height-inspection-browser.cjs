const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),zlib=require('node:zlib');
const origin=process.env.VTT_TEST_ORIGIN||'http://127.0.0.1:18796';
if(!['127.0.0.1','localhost'].includes(new URL(origin).hostname))throw Error('Loopback required');
if(!process.env.VTT_TEST_PACKAGE)throw Error('VTT_TEST_PACKAGE must name a local scene package');
// Distinct lossless fixture imagery makes canvas content assertions unambiguous.
function png(rgb){const n=1500,raw=Buffer.alloc((n*3+1)*n);for(let y=0;y<n;y++)for(let x=0;x<n;x++)for(let c=0;c<3;c++)raw[y*(n*3+1)+1+x*3+c]=rgb[c];const crc=b=>{let v=-1;for(const x of b){v^=x;for(let k=0;k<8;k++)v=v&1?(v>>>1)^0xedb88320:v>>>1;}return(v^-1)>>>0;};const chunk=(type,data)=>{const t=Buffer.from(type),len=Buffer.alloc(4),sum=Buffer.alloc(4);len.writeUInt32BE(data.length);sum.writeUInt32BE(crc(Buffer.concat([t,data])));return Buffer.concat([len,t,data,sum]);};const h=Buffer.alloc(13);h.writeUInt32BE(n,0);h.writeUInt32BE(n,4);h[8]=8;h[9]=2;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',h),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);}
(async()=>{
 assert.equal((await(await fetch(origin+'/diagnostic-manifest.json')).json()).test_fixture,'vision-performance');
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const admin=await browser.newContext();await admin.request.get(origin+'/test-login.php?user=GM');const snapshot=async()=>(await(await admin.request.get(origin+'/dnd/vtt/api/v2/snapshot.php')).json()).snapshot;
  const before=await snapshot(),pkg=JSON.parse(fs.readFileSync(process.env.VTT_TEST_PACKAGE,'utf8').replace(/^\uFEFF/,''));pkg.scene.name='Disposable GM height inspection';pkg.domains.placements={};pkg.domains.templates={};pkg.domains.drawings={};
  const colors={0:[220,180,30],2:[220,30,40],4:[30,210,70],6:[40,70,220]},images=new Map(Object.entries(colors).map(([z,rgb])=>['/dnd/vtt/qa-inspection-'+z+'.png',png(rgb)]));
  pkg.scene.mapUrl='/dnd/vtt/qa-inspection-0.png';const nodes=[],segments=[];
  for(const z of [0,2,4,6]){const a='inspection-'+z+'-a',b='inspection-'+z+'-b',y=4+z;nodes.push({id:a,x:4,y},{id:b,x:16,y});segments.push({id:'inspection-wall-'+z,a,b,baseMode:'fixed',base:z,height:2});}
  const roofs=[2,4,6].map(z=>({id:'inspection-image-'+z,kind:'roof',height:z,imageId:'/dnd/vtt/qa-inspection-'+z+'.png',points:[{x:3,y:3},{x:17,y:3},{x:17,y:17},{x:3,y:17}],holes:[]}));
  pkg.domains.sceneConfig={grid:{size:75,visible:false,locked:false,offsetX:0,offsetY:0},mapLevels:{levels:[]},userLevelState:{},fogOfWar:{automaticEnabled:true,byLevel:{}},environment:{terrain:{revision:1,value:{n:2,m:2,h:[0,0,0,0],bounds:{left:0,top:0,width:20,height:20}}},walls:{revision:1,value:{version:1,nodes,segments,roofs,ramps:[]}}}};
  const imported=await admin.request.post(origin+'/dnd/vtt/api/v2/scene-import.php',{data:{package:pkg,operationId:crypto.randomUUID(),allowPlayerBrowsing:true}}),body=await imported.text();assert.equal(imported.status(),200,body);const scene=JSON.parse(body).scene;
  const s=await snapshot(),routed=await admin.request.post(origin+'/dnd/vtt/api/v2/commands.php',{data:{type:'routing.set',sceneId:scene.id,operationId:crypto.randomUUID(),baseRevision:s.revision,entityRevision:s.state.routing._revision,payload:{routing:{activeSceneId:scene.id,playerActiveSceneId:scene.id,mapUrl:scene.mapUrl,playerMapUrl:scene.mapUrl,playerMapDisabled:false}}}});assert.equal(routed.status(),200,await routed.text());
  const errors=[],commands=[],gm=await browser.newPage({viewport:{width:1280,height:900}}),pc=await browser.newPage({viewport:{width:1280,height:900}});
  for(const page of [gm,pc]){page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==origin)return route.abort();const image=images.get(u.pathname);return image?route.fulfill({contentType:'image/png',body:image}):route.continue();});}
  gm.on('request',r=>{if(r.url().endsWith('/api/v2/commands.php'))commands.push(r.postDataJSON()?.type);});
  await gm.goto(origin+'/test-login.php?user=GM');await gm.waitForFunction(()=>window.gmVision&&window.wallPrototype&&window.terrainContext?.().view.mapLoaded,null,{timeout:60000});
  await pc.goto(origin+'/test-login.php?user=sharon');await pc.waitForFunction(()=>!document.documentElement.classList.contains('vtt-player-visibility-pending'),null,{timeout:60000});
  const playerBefore=await pc.evaluate(()=>({paints:visionPrototype.stats.paints,observer:visionPrototype.observer,visible:visionPrototype.visible({x:10,y:10},0)}));assert.equal(playerBefore.visible,false,'No owned viewer retains closed player mask');
  const model=(await snapshot()).state.sceneConfig[scene.id].environment.walls.value,expected=new Map(model.segments.map(e=>[e.base,e.id]));
  async function proof(z,editing=false){
   await gm.waitForFunction(({z,editing})=>gmVision.height===z&&document.querySelector('[data-map-level-nav-name]').textContent==='Height '+z&&!!document.querySelector('#wall-panel')?.hidden!==editing,{z,editing},{timeout:60000});
   await gm.waitForFunction(({z,rgb})=>{const c=document.getElementById('roof-prototype');if(!c||c.hidden||!c.width)return false;const v=terrainContext().view,p=terrainPrototype.project((v.gridOffsets.left||0)+10*v.gridSize,(v.gridOffsets.top||0)+10*v.gridSize,z),d=c.getContext('2d').getImageData(Math.round(p.x),Math.round(p.y),1,1).data;return z===0?d[3]===0:d[0]===rgb[0]&&d[1]===rgb[1]&&d[2]===rgb[2]&&d[3]===255;},{z,rgb:colors[z]},{timeout:60000});
   const ids=await gm.locator('[data-wall-segment]').evaluateAll(ns=>ns.map(n=>n.dataset.wallSegment));assert.deepEqual(ids,[expected.get(z)],'Physical slice wall IDs match height '+z);
  }
  await proof(0);for(let z=2;z<=6;z+=2){await gm.locator('[data-action="view-map-level-up"]').click();await gm.locator('[data-action="view-map-level-up"]').click();await proof(z);}
  console.log('Checking inspection images and wall slices with editing open');
  await gm.locator('[data-action="terrain-walls"]').evaluate(n=>n.click());await proof(6,true);
  const upperPoint=await gm.evaluate(()=>{const t=document.querySelector('#vtt-map-transform').getBoundingClientRect(),v=terrainContext().view,p=terrainPrototype.project((v.gridOffsets.left||0)+10*v.gridSize,(v.gridOffsets.top||0)+10*v.gridSize,6);return{x:t.left+p.x*v.scale,y:t.top+p.y*v.scale};});
  await gm.locator('#vtt-board-canvas').dispatchEvent('dblclick',{clientX:upperPoint.x,clientY:upperPoint.y,button:0});assert.equal(await gm.locator('[data-wall-segment][stroke="#ffeeb5"]').count(),1,'Visible height slice wall can be inspected');
  for(let z=4;z>=0;z-=2){await gm.locator('[data-action="view-map-level-down"]').click();await gm.locator('[data-action="view-map-level-down"]').click();await proof(z,true);}
  // Double-click an absent upper edge at height zero: it must not select it.
  const hidden=await gm.evaluate(()=>{const t=document.querySelector('#vtt-map-transform').getBoundingClientRect(),v=terrainContext().view,p=terrainPrototype.project((v.gridOffsets.left||0)+10*v.gridSize,(v.gridOffsets.top||0)+10*v.gridSize,6);return{x:t.left+p.x*v.scale,y:t.top+p.y*v.scale};});
  // Dispatch only the inspection gesture: a normal empty-space pointerdown is
  // intentionally the wall drawing gesture and would create fixture geometry.
  await gm.locator('#vtt-board-canvas').dispatchEvent('dblclick',{clientX:hidden.x,clientY:hidden.y,button:0});assert.equal(await gm.locator('[data-wall-segment][stroke="#ffeeb5"]').count(),0,'Hidden slice edges cannot be inspected');
  const lowerPoint=await gm.evaluate(()=>{const t=document.querySelector('#vtt-map-transform').getBoundingClientRect(),v=terrainContext().view,p=terrainPrototype.project((v.gridOffsets.left||0)+10*v.gridSize,(v.gridOffsets.top||0)+4*v.gridSize,0);return{x:t.left+p.x*v.scale,y:t.top+p.y*v.scale};});
  await gm.mouse.move(lowerPoint.x,lowerPoint.y);await gm.mouse.down();await gm.mouse.move(lowerPoint.x+40,lowerPoint.y+40,{steps:2});
  await gm.evaluate(p=>{gmVision.step('up');gmVision.step('up');document.getElementById('vtt-board-canvas').dispatchEvent(new PointerEvent('pointerup',{bubbles:true,button:0,pointerId:1,clientX:p.x+40,clientY:p.y+40}));},lowerPoint);await gm.mouse.up();
  await gm.locator('[data-action="view-map-level-down"]').click();await gm.locator('[data-action="view-map-level-down"]').click();await proof(0,true);
  await gm.locator('#wall-panel button[aria-label="Close walls"]').click();
  const playerAfter=await pc.evaluate(()=>({observer:visionPrototype.observer,visible:visionPrototype.visible({x:10,y:10},0)}));assert.deepEqual(playerAfter,{observer:playerBefore.observer,visible:false});
  const after=await snapshot();for(const id of Object.keys(before.state.placements))assert.deepEqual(after.state.placements[id],before.state.placements[id]);for(const id of Object.keys(before.state.sceneConfig))assert.deepEqual(after.state.sceneConfig[id].environment,before.state.sceneConfig[id].environment,'Original environment unchanged');assert.deepEqual(after.state.sceneConfig[scene.id].environment,s.state.sceneConfig[scene.id].environment,'Inspection never edits its own geometry');assert.deepEqual(commands,[],'Inspection is local');assert.deepEqual(errors,[]);
  console.log('PASS GM height arrows show exact image pixels and matching walls at 0/2/4/6, retain images while editing, reject hidden edge hits/cancel height-change drag races, and leave players/canonical geometry unchanged');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
