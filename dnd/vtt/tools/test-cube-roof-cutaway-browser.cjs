const {chromium}=require('playwright'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
// Static loopback fixture: production renderer/modules, no sessions or APIs.
const root=path.resolve(__dirname,'../../..'),server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname==='/'){res.setHeader('Content-Type','text/html');return res.end('<style>body{margin:0;background:#444}#vtt-map-transform{position:absolute;width:512px;height:512px}</style><div id="vtt-map-transform"></div>');}
 const file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.statusCode=404;return res.end();}res.setHeader('Content-Type','text/javascript');fs.createReadStream(file).pipe(res);
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:620,height:560}}),errors=[];
 try{
  page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);
  const data=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=512;const x=c.getContext('2d');x.fillStyle='rgb(210,40,60)';x.fillRect(0,0,512,512);return c.toDataURL().split(',')[1];});
  await page.route('**/dnd/vtt/cutaway-qa.png',r=>r.fulfill({contentType:'image/png',body:Buffer.from(data,'base64')}));
  await page.evaluate(async()=>{
   const {roofRenderer}=await import('/dnd/vtt/assets/js/ui/roof-renderer.js'),{makeSight,center,head}=await import('/dnd/vtt/assets/js/ui/vision-height.mjs');
   const g=50,ox=75,oy=150;window.terrainPrototype={project:(x,y,z)=>({x:x+z*g*.12,y:y-z*g*.36}),markersVisible:false};
   const ring=(left,top,right,bottom)=>[{x:left,y:top},{x:right,y:top},{x:right,y:bottom},{x:left,y:bottom}];
   const nodes=ring(0,0,4,4).map((p,i)=>({...p,id:'n'+i})),segments=nodes.map((p,i)=>({id:'w'+i,a:p.id,b:nodes[(i+1)%4].id,baseMode:'fixed',base:0,height:4,sight:'block'}));
   const cube={id:'outside-cube',templateCube:true,base:2,kind:'roof',height:3,points:ring(4,2,5,3),holes:[]};
   const model={nodes,segments,ramps:[],roofs:[{id:'native-floor',kind:'floor',height:0,points:ring(0,0,4,4),holes:[]},{id:'native-roof',kind:'roof',height:4,imageId:'/dnd/vtt/cutaway-qa.png',points:ring(0,0,4,4),holes:[]},cube]};
   const context={view:{gridSize:g,gridOffsets:{left:ox,top:oy},mapInsets:{left:0,top:0},mapPixelSize:{width:512,height:512}}};
   window.cutawayQA={roofRenderer,model,cube,paint(column,row,ground){const token={column,row,width:1,height:1},viewer=center(token),sight=roofRenderer.blockSight(viewer,head(token,ground),makeSight({viewer:token,viewerGround:ground,groundAt:()=>0,walls:model}),model);roofRenderer.paint({context,viewer,token,viewerGround:ground,sight,groundAt:()=>0,terrain:null,model,editing:false,enabled:true,lighting:true});return{sight,token};},pixel(){const p=terrainPrototype.project(ox+2*g,oy+2*g,4);return [...document.getElementById('roof-prototype').getContext('2d').getImageData(p.x,p.y,1,1).data];}};
   cutawayQA.paint(4,2,0);
  });
  await page.waitForFunction(()=>cutawayQA.roofRenderer.revision>0);
  const paint=async(column,row,ground)=>page.evaluate(({column,row,ground})=>{const result=cutawayQA.paint(column,row,ground);return{pixel:cutawayQA.pixel(),closedInterior:result.sight({x:2,y:2},0)};},{column,row,ground});
  assert.deepEqual((await paint(4,2,0)).pixel,[210,40,60,255],'Outside underneath a touching floating cube keeps native roof artwork');
  for(const ground of [3,5]){await page.evaluate(z=>{cutawayQA.cube.height=z;cutawayQA.cube.base=z-1;},ground);const result=await paint(4,2,ground);assert.deepEqual(result.pixel,[210,40,60,255],'Outside on cube top keeps closed roof');assert.equal(result.closedInterior,false,'Closed interior remains physically occluded');}
  await page.evaluate(()=>{cutawayQA.cube.height=3;cutawayQA.cube.base=2;});
  assert.equal((await paint(1,1,0)).pixel[3],0,'Inside authored building retains normal roof cutaway');
  await page.evaluate(()=>{cutawayQA.cube.templateCube=false;});assert.equal((await paint(4,2,0)).pixel[3],0,'Actual attached canopy participates in authored building cutaway');
  await page.evaluate(()=>{cutawayQA.cube.templateCube=true;});assert.deepEqual((await paint(4,2,0)).pixel,[210,40,60,255],'Same geometry changing cube classification invalidates cutaway cache');
  await page.evaluate(async()=>{
   const {chooseTeleportHeight}=await import('/dnd/vtt/assets/js/ui/teleport-choice.js');
   const context={isGM:false,view:{gridSize:50,gridOffsets:{left:0,top:0}},state:{boardState:{activeSceneId:'static',sceneState:{static:{mapLevels:{levels:[]},environment:{walls:{value:{version:1,nodes:[],segments:[],roofs:[]}}}}},templates:{static:[{id:'stack',type:'wall',levelId:'level-0',squares:[0,1,2].map(elevation=>({column:6,row:2,elevation}))}]}}}};
   window.qaTeleportResult=undefined;chooseTeleportHeight({from:{column:0,row:0,width:1,height:1,levelId:'level-0'},to:{column:6,row:2},context,ground:()=>0,startHeight:0,range:1,combatActive:true}).then(result=>window.qaTeleportResult=result);
  });
  const choices=page.locator('[data-teleport-choice] .vtt-teleport-choice__location');assert.equal(await choices.count(),1,'Only exposed stack lid is offered');assert.equal(await choices.first().innerText(),'Wall4');assert.equal(await choices.first().isDisabled(),true,'Initial 500 ms input guard remains');
  await page.waitForFunction(()=>document.querySelector('[data-teleport-choice]')?.dataset.ready==='true');assert.equal(await choices.first().isDisabled(),false,'Out-of-range wall remains actionable');await choices.first().click();
  assert.deepEqual(await page.evaluate(()=>qaTeleportResult),{height:3,range:1,allowOutOfRange:true});
  assert.deepEqual(errors,[]);console.log('PASS actual roof renderer: outside touching cube does not expose roof/interior, inside native cutaway remains, cube classification cache refreshes; real teleport dialog offers exposed Wall4 with guard/actionable range warning');
 }finally{await browser.close();server.close();}
})().catch(e=>{server.close();console.error(e);process.exitCode=1;});
