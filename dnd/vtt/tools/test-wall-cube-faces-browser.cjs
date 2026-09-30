const {chromium}=require('playwright');
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
// Static, loopback-only renderer fixture: no sessions, APIs or canonical writes.
const root=path.resolve(__dirname,'../../..');
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname==='/'){res.setHeader('Content-Type','text/html');return res.end('<style>body{margin:0;background:#87976e} .wall{position:absolute}.wall svg{position:absolute;inset:0;overflow:visible}</style>');}
 const file=path.resolve(root,'.'+pathname);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.statusCode=404;return res.end();}
 res.setHeader('Content-Type',file.endsWith('.png')?'image/png':'text/javascript');fs.createReadStream(file).pipe(res);
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1000,height:620}}),errors=[];
 try{
 page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);
 await page.evaluate(async()=>{
  const {paintWallTemplate}=await import('/dnd/vtt/assets/js/ui/template-wall-renderer.js');
  const view={mapLoaded:true,mapPixelSize:{width:1000,height:620},gridSize:100};
  for(const [i,material] of ['stone','dirt','metal','ice','fire'].entries()){
   const root=document.createElement('div'),tiles=document.createElement('div');root.className='wall';root.dataset.material=material;root.append(tiles);document.body.append(root);
   paintWallTemplate({wallColor:material,squares:[{column:i*2,row:3},{column:i*2,row:3,elevation:1}],elements:{root,tileContainer:tiles}},view);
  }
  document.addEventListener('click',e=>window.clickedFace=e.target.dataset.cubeFace);
 });
 await page.waitForFunction(()=>[...document.querySelectorAll('svg image')].every(e=>e.href.baseVal));
 for(const material of ['stone','dirt','metal','ice','fire']){
  assert.equal(await page.locator(`[data-material="${material}"] [data-cube-face="west"]`).count(),2);
  const svg=page.locator(`[data-material="${material}"] svg`).last();
  for(const face of ['west','south','top']){
   const p=await svg.locator(`[data-cube-face="${face}"]`).evaluate(el=>{
    const vertices=[...el.points],center=vertices.reduce((a,p)=>({x:a.x+p.x/4,y:a.y+p.y/4}),{x:0,y:0}),q=new DOMPoint(center.x,center.y).matrixTransform(el.getScreenCTM());return {x:q.x,y:q.y};
   });
   await page.mouse.click(p.x,p.y);assert.equal(await page.evaluate(()=>window.clickedFace),face,material+' exposed '+face+' must not be covered by the top');
  }
 }
 await page.screenshot({path:'.playwright-mcp/wall-cube-faces.png'});
 assert.deepEqual(errors,[]);console.log('PASS all five materials: exposed side/top click surfaces and stacked cube rendering');
 }finally{await browser.close();server.close();}
})().catch(e=>{server.close();console.error(e);process.exitCode=1;});
