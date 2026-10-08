import {floorSupported,intersectsFloor,terrainFloorContact,resolveSupportSurfaces,walkFloorContact,cubeStepDown} from './floor-support.js';
import {sharedField,saveShared,acknowledgedRevision} from './environment-sync.mjs';
import {rampAt,rampHeight,rampPick,rampGround,rampSupports,rampLanding} from './imported-ramps.mjs';
import './height-tethers.js';
import {onSurface} from './stacked-surfaces.mjs';
import {createFlightState} from './flight-height.mjs';
import {applyTokenLevelPresentation} from './token-presentation.js';
import {slopeIndicator} from './slope-indicator.mjs';
// Terrain design is canonical scene environment; display preferences remain local.
import {claimActiveTool,publishActiveTool} from './active-tool.js';
import {sample,paint,barycentric,clamp,groundSquare,heightBand,effectiveHeight,relativeScale,routeSteps,slopeColor,brushRate} from './terrain-math.mjs';
import {floorElevations} from '../state/normalize/floor-elevation.js';
import {terrainContact} from './terrain-contact.js';
import {createRouteWalker,stepGhost,walksPlates} from './route-walker.mjs';
const $=s=>document.querySelector(s);
const image=$('#vtt-map-image'),transform=$('#vtt-map-transform'),surface=$('#vtt-map-surface'),board=$('#vtt-board-canvas');
const canvas=document.createElement('canvas');canvas.id='terrain-canvas';
canvas.style.cssText='position:absolute;pointer-events:none;z-index:1;';
transform.insertBefore(canvas,$('#vtt-grid-overlay'));
const gl=canvas.getContext('webgl',{alpha:true,antialias:true,preserveDrawingBuffer:true});
if(!gl)throw new Error('Terrain prototype requires WebGL');
const style=document.createElement('style');style.textContent=`
 #terrain-panel{position:absolute;left:58px;top:12px;width:228px;z-index:90;padding:14px;border:1px solid #777;border-radius:8px;background:var(--panel-bg,#24252b);color:var(--text-color,#eee);box-shadow:0 6px 24px #0007}
 [data-action="terrain-height"]{grid-row:4;grid-column:2}#terrain-readout{margin-left:6px}
 #terrain-panel[hidden]{display:none}#terrain-panel header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
 #terrain-panel label{display:block;margin:12px 0 4px}#terrain-panel input{width:100%;box-sizing:border-box}#terrain-panel input[type=checkbox]{width:auto;margin-right:6px}#terrain-panel .terrain-tools{display:grid;grid-template-columns:1fr 1fr;gap:6px}
 #terrain-panel button[aria-pressed=true]{outline:2px solid #d9ba6d;outline-offset:1px}#terrain-panel output{float:right;font-variant-numeric:tabular-nums}
 #terrain-panel footer{margin-top:14px;display:flex;align-items:center;justify-content:space-between}
 #terrain-brush{position:fixed;pointer-events:none;border:2px solid #ffe7a4;border-radius:50%;z-index:91;box-shadow:0 0 2px #000;transform:translate(-50%,-50%)}
 .terrain-on #vtt-grid-overlay{opacity:0!important}.terrain-on #vtt-map-image{opacity:0!important}
 `;document.head.append(style);
const button=document.createElement('button');button.type='button';button.className='btn';button.textContent='Height';button.dataset.action='terrain-height';button.setAttribute('aria-expanded','false');
$('[data-action="measure-distance"]').after(button);
const panel=document.createElement('aside');panel.id='terrain-panel';panel.hidden=true;panel.setAttribute('aria-label','Map height');
panel.innerHTML=`<header><strong>Map height</strong><button type="button" class="btn" aria-label="Close map height">×</button></header>
 <div class="terrain-tools"><button class="btn" data-brush="raise" aria-pressed="true">Raise</button><button class="btn" data-brush="lower" aria-pressed="false">Lower</button><button class="btn" data-brush="flatten" aria-pressed="false">Flatten</button><button class="btn" data-brush="smooth" aria-pressed="false">Smooth</button></div>
 <label for="terrain-size">Brush size <output id="terrain-size-value">8 squares</output></label><input id="terrain-size" type="range" min="1" max="24" step="1" value="8">
 <label><input id="terrain-limit" type="checkbox">Stop at height</label><label for="terrain-target">Height</label><input id="terrain-target" type="number" min="-8" max="32" step="1" value="2">
 <footer><button type="button" class="btn" id="terrain-undo" disabled>Undo</button><span>Height <output id="terrain-readout">0.0</output></span></footer>`;
board.parentElement.append(panel);
const brush=document.createElement('div');brush.id='terrain-brush';brush.hidden=true;document.body.append(brush);
let field=null,key='',signature='',triangles=[],undo=[],drawing=false,mode='raise',last=null,ctx=null,dirty=true,active=false,textureSource='',storageError=false;
const pad=1100;
let terrainRevision=0;
let stampTime=0,stampPosition=null,viewerHeight=0,lastBrushMotion=-Infinity;
const markers=document.createElementNS("http://www.w3.org/2000/svg","svg");markers.id="terrain-cost-markers";markers.style.cssText="position:absolute;inset:0;overflow:visible;pointer-events:none;z-index:2";transform.insertBefore(markers,$("#vtt-grid-overlay"));
const tokenHeights=new Map();
function compile(type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;}
const program=gl.createProgram();
gl.attachShader(program,compile(gl.VERTEX_SHADER,`attribute vec2 position;attribute vec2 uv;attribute float light;uniform vec2 extent;varying vec2 tex;varying float shade;void main(){gl_Position=vec4(position.x/extent.x*2.-1.,1.-position.y/extent.y*2.,0.,1.);tex=uv;shade=light;}`));
gl.attachShader(program,compile(gl.FRAGMENT_SHADER,`precision mediump float;uniform sampler2D map;uniform vec2 imageSize;uniform vec2 gridOrigin;uniform float gridSize;uniform float showGrid;varying vec2 tex;varying float shade;void main(){vec4 c=texture2D(map,tex);vec2 p=mod(tex*imageSize-gridOrigin,gridSize);float line=1.-smoothstep(.4,1.3,min(min(p.x,gridSize-p.x),min(p.y,gridSize-p.y)));gl_FragColor=vec4(c.rgb*shade*(1.-line*.25*showGrid),c.a);}`));
gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));gl.useProgram(program);
const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
for(const [name,size,offset] of [['position',2,0],['uv',2,8],['light',1,16]]){const loc=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,20,offset);}
const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
function dimensions(){return {width:image.naturalWidth,height:image.naturalHeight,left:ctx.view.mapInsets.left||0,top:ctx.view.mapInsets.top||0,grid:ctx.view.gridSize||64};}
function heightAt(x,y){if(!field||!active)return 0;const d=dimensions();return sample(field,(x-d.left)/d.width,(y-d.top)/d.height);}
function project(x,y,h){const g=dimensions().grid;return {x:x+h*g*.12,y:y-h*g*.36};}
function unproject(p){
 if(!active||!field)return p;
 if(importedDesign()&&panel.hidden){
  const g=dimensions().grid,ox=ctx.view.gridOffsets.left||0,oy=ctx.view.gridOffsets.top||0,actor=rulerActor();
  const raw={x:(p.x-ox)/g,y:(p.y-oy)/g};
  for(const r of (importedDesign()?.ramps||[])){const q=rampPick(r,raw);if(q&&actor&&rampSupports(r,actor,q))return {x:ox+q.x*g,y:oy+q.y*g};}
  if(actor){const h=groundFor(actor);for(const f of (resolveSupportSurfaces(importedDesign()||{})).filter(f=>f.kind==='floor'&&f.height<=h+.7).sort((a,b)=>b.height-a.height)){
   const q={x:raw.x-f.height*.12,y:raw.y+f.height*.36};if(onSurface(f,q))return {x:ox+q.x*g,y:oy+q.y*g};
  }}
 }

 for(let i=triangles.length-1;i>=0;i--){const t=triangles[i],b=barycentric(p,...t);if(b)return {x:t.reduce((s,v,k)=>s+v.gx*b[k],0),y:t.reduce((s,v,k)=>s+v.gy*b[k],0)};}
 return p;
}
function rawPoint(e){const rect=surface.getBoundingClientRect(),v=ctx.view;return {x:(e.clientX-rect.left-v.translation.x)/v.scale,y:(e.clientY-rect.top-v.translation.y)/v.scale};}
let sharedTerrainRevision=-1,savingTerrain=false,dirtyWhileSaving=false;
function save(){if(storageError)return;if(savingTerrain){dirtyWhileSaving=true;return;}dirtyWhileSaving=false;const savingKey=key;savingTerrain=true;saveShared('terrain',{n:field.n,m:field.m,h:Array.from(field.h),bounds:field.bounds||{left:(dimensions().left-(ctx.view.gridOffsets.left||0))/dimensions().grid,top:(dimensions().top-(ctx.view.gridOffsets.top||0))/dimensions().grid,width:dimensions().width/dimensions().grid,height:dimensions().height/dimensions().grid}},Math.max(0,sharedTerrainRevision),ctx.state.boardState.activeSceneId).then(result=>{if(key===savingKey)sharedTerrainRevision=acknowledgedRevision(result,'terrain')??sharedTerrainRevision;}).catch(e=>{if(key!==savingKey)return;storageError=true;console.error(e);alert('Terrain save was not confirmed. Keep this draft open; reload to recover shared terrain.');}).finally(()=>{savingTerrain=false;if(key===savingKey&&dirtyWhileSaving&&!storageError&&!drawing)save();});}
function saveLocalBackup(){try{localStorage.setItem(key,JSON.stringify({n:field.n,m:field.m,h:Array.from(field.h)}));storageError=false;}catch(e){storageError=true;console.error('Terrain could not be saved in this browser',e);alert('Terrain could not be saved. Browser storage is full. Keep this tab open.');}}
function setOpen(open){panel.hidden=!open;button.setAttribute('aria-expanded',String(open));if(open){claimActiveTool('terrain',()=>setOpen(false));publishActiveTool('terrain','Height');}else{finish();brush.hidden=true;publishActiveTool('terrain');}}
button.onclick=()=>setOpen(panel.hidden);panel.querySelector('header button').onclick=()=>setOpen(false);
panel.querySelectorAll('[data-brush]').forEach(b=>b.onclick=()=>{mode=b.dataset.brush;panel.querySelectorAll('[data-brush]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));});
$('#terrain-size').oninput=e=>$('#terrain-size-value').textContent=e.target.value+' squares';
$('#terrain-undo').onclick=()=>{if(!storageError&&undo.length){field.h=undo.pop();dirty=true;save();$('#terrain-undo').disabled=!undo.length;}};
function finish(){if(drawing){drawing=false;last=null;stampPosition=null;save();} }
function stamp(p,amount){const d=dimensions();paint(field,{x:p.x-d.left,y:p.y-d.top,width:d.width,height:d.height,radius:Number($('#terrain-size').value)*d.grid/2,amount,mode,stopAtTarget:$('#terrain-limit').checked,target:clamp(Number($('#terrain-target').value)||0,-8,32)});dirty=true;}
function move(e){if(!ctx||!active||panel.hidden)return;const p=unproject(rawPoint(e)),d=dimensions();brush.hidden=false;brush.style.left=e.clientX+'px';brush.style.top=e.clientY+'px';brush.style.width=brush.style.height=Number($('#terrain-size').value)*d.grid*ctx.view.scale+'px';$('#terrain-readout').textContent=groundSquare(heightAt(p.x,p.y))+(isCliff(p.x,p.y)?' · Cliff':'');
 if(drawing){if(Math.hypot(p.x-last.x,p.y-last.y)>.2)lastBrushMotion=performance.now();last=p;e.preventDefault();e.stopImmediatePropagation();}}
board.addEventListener('pointerdown',e=>{if(panel.hidden||!active||e.button!==0||storageError)return;e.preventDefault();e.stopImmediatePropagation();const p=unproject(rawPoint(e)),d=dimensions();if(p.x<d.left||p.y<d.top||p.x>d.left+d.width||p.y>d.top+d.height)return;undo.push(field.h.slice());if(undo.length>30)undo.shift();$('#terrain-undo').disabled=false;drawing=true;lastBrushMotion=-Infinity;last=p;stampPosition=p;stampTime=performance.now();board.setPointerCapture(e.pointerId);stamp(p,.08);},true);
board.addEventListener('pointermove',move,true);
board.addEventListener('pointerup',e=>{if(drawing){e.preventDefault();e.stopImmediatePropagation();finish();if(board.hasPointerCapture(e.pointerId))board.releasePointerCapture(e.pointerId);}},true);
board.addEventListener('pointercancel',finish,true);board.addEventListener('lostpointercapture',finish,true);board.addEventListener('pointerleave',()=>brush.hidden=true);
document.addEventListener('keydown',e=>{if(e.key==='Escape')setOpen(false);});window.addEventListener('blur',finish);window.addEventListener('pagehide',finish);document.addEventListener('visibilitychange',()=>{if(document.hidden)finish();});
function draw(){
 const d=dimensions(),w=ctx.view.mapPixelSize.width+2*pad,h=ctx.view.mapPixelSize.height+2*pad;
 const scale=Math.min(1,4096/w,4096/h);canvas.width=Math.round(w*scale);canvas.height=Math.round(h*scale);canvas.style.left=canvas.style.top=-pad+'px';canvas.style.width=w+'px';canvas.style.height=h+'px';gl.viewport(0,0,canvas.width,canvas.height);
 if(textureSource!==image.src){let source=image;const max=Math.min(4096,gl.getParameter(gl.MAX_TEXTURE_SIZE));if(Math.max(d.width,d.height)>max){source=document.createElement('canvas');const s=max/Math.max(d.width,d.height);source.width=Math.round(d.width*s);source.height=Math.round(d.height*s);source.getContext('2d').drawImage(image,0,0,source.width,source.height);}gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);textureSource=image.src;}
 const vertices=[],points=[];triangles=[];
 for(let j=0;j<field.m;j++)for(let i=0;i<field.n;i++){
   const u=i/(field.n-1),v=j/(field.m-1),gx=d.left+u*d.width,gy=d.top+v*d.height,z=field.h[j*field.n+i],p=project(gx,gy,z);
   const dx=(sample(field,u+1/(field.n-1),v)-sample(field,u-1/(field.n-1),v))*d.grid/(2*d.width/(field.n-1));
   const dy=(sample(field,u,v+1/(field.m-1))-sample(field,u,v-1/(field.m-1)))*d.grid/(2*d.height/(field.m-1));
   points.push({...p,gx,gy,u,v,light:clamp((1+.25*dx-.4*dy)/Math.sqrt(1+.12*(dx*dx+dy*dy)),.48,1.2)});
 }
 const add=(a,b,c)=>{const t=[points[a],points[b],points[c]];triangles.push(t);for(const p of t)vertices.push(p.x+pad,p.y+pad,p.u,p.v,p.light);};
 for(let j=0;j<field.m-1;j++)for(let i=0;i<field.n-1;i++){const a=j*field.n+i;add(a,a+1,a+field.n);add(a+1,a+field.n+1,a+field.n);}
 gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.DYNAMIC_DRAW);gl.uniform2f(gl.getUniformLocation(program,'extent'),w,h);gl.uniform2f(gl.getUniformLocation(program,'imageSize'),d.width,d.height);gl.uniform2f(gl.getUniformLocation(program,'gridOrigin'),(ctx.view.gridOffsets.left||0)-d.left,(ctx.view.gridOffsets.top||0)-d.top);gl.uniform1f(gl.getUniformLocation(program,'gridSize'),d.grid);gl.uniform1f(gl.getUniformLocation(program,'showGrid'),ctx.state.grid.visible?1:0);gl.clear(gl.COLOR_BUFFER_BIT);gl.drawArrays(gl.TRIANGLES,0,vertices.length/5);drawCostMarkers();terrainRevision++;dirty=false;
}
function tick(now){
 try{
 const nextContext=window.terrainContext?.();if(drawing&&ctx?.state.boardState.activeSceneId!==nextContext?.state.boardState.activeSceneId)finish();
 ctx=nextContext;active=!!ctx&&ctx.view.mapLoaded&&image.complete&&image.naturalWidth>0&&!!(sharedField('terrain')||sharedField('walls')||(ctx.state.boardState.templates?.[ctx.state.boardState.activeSceneId]||[]).some(t=>t.type==='wall')||!panel.hidden);
 document.documentElement.classList.toggle('terrain-on',active);canvas.hidden=!active;const pref='terrain-slope-arrows:'+String(ctx?.userId||'viewer');if(pref!==markerPreferenceKey){markerPreferenceKey=pref;markersVisible=localStorage.getItem(pref)!=='false';}markers.style.display=active&&markersVisible?'':'none';button.disabled=!ctx?.view.mapLoaded;
 if(active){
   const nextKey='terrain-prototype:v1:'+ctx.state.boardState.activeSceneId+':'+image.getAttribute('src');
   if(key!==nextKey){finish();key=nextKey;sharedTerrainRevision=-1;storageError=false;undo=[];$('#terrain-undo').disabled=true;const n=Math.min(201,Math.max(17,Math.ceil(image.naturalWidth/ctx.view.gridSize*4)+1)),m=Math.min(201,Math.max(17,Math.ceil(image.naturalHeight/ctx.view.gridSize*4)+1));field={n,m,h:new Float32Array(n*m)};dirty=true;}
   const shared=sharedField('terrain');if(!savingTerrain&&!drawing&&!storageError&&shared&&shared.revision!==sharedTerrainRevision){field={...shared.value,h:Float32Array.from(shared.value.h)};sharedTerrainRevision=shared.revision;dirty=true;undo=[];$('#terrain-undo').disabled=true;}
   const nextSignature=JSON.stringify([ctx.view.mapPixelSize,ctx.view.mapInsets,ctx.view.gridSize,ctx.view.gridOffsets,ctx.state.grid.visible,ctx.isGM&&document.querySelector('#wall-panel')?.hidden===false]);if(nextSignature!==signature){signature=nextSignature;dirty=true;}
   if(drawing&&last&&now-stampTime>=32){
     const amount=Math.min(.15,(now-stampTime)/1000)*brushRate(now-lastBrushMotion<100);stampTime=now;
     const distance=Math.hypot(last.x-stampPosition.x,last.y-stampPosition.y),steps=Math.max(1,Math.ceil(distance/(dimensions().grid*.15)));
     for(let i=1;i<=steps;i++)stamp({x:stampPosition.x+(last.x-stampPosition.x)*i/steps,y:stampPosition.y+(last.y-stampPosition.y)*i/steps},amount/steps);
     stampPosition={...last};$('#terrain-readout').textContent=groundSquare(heightAt(last.x,last.y));
   }
   if(dirty)draw();
   const placements=ctx.state.boardState.placements[ctx.state.boardState.activeSceneId]||[];
   flight.select('terrain-flight:v1:'+ctx.state.boardState.activeSceneId);flight.update(placements,flightGround);
   if(ctx.isGM)for(const token of placements)if(['fly','hover'].includes(token.movementMode)&&!Number.isFinite(token.flightHeight)&&!flightMigrationPending.has(ctx.state.boardState.activeSceneId+':'+token.id)){flightMigrationPending.add(ctx.state.boardState.activeSceneId+':'+token.id);window.submitFlightHeight(token,flight.height(token,(x,y)=>flightGround(x,y,token))).catch(console.error);}
   const reference=placements.find(p=>p.id===(ctx.isGM?(ctx.selectedIds.length===1?ctx.selectedIds[0]:window.visionPrototype?.viewerTokenId):(window.visionPrototype?.viewerTokenId||ctx.followId)));
   viewerHeight=window.gmVision?.manual?window.gmVision.height:reference ? heightBand(groundFor(reference))*2 : (floorElevations(levelConfig()).get(ctx.levelId)||0);
   window.gmVision?.syncNavigation();
   button.hidden=!ctx.isGM;
   if(!ctx.isGM&&!panel.hidden)setOpen(false);

 }
 // Read token geometry together before writing styles to avoid per-token layout flushes.
 const placementById=new Map((ctx?.state.boardState.placements[ctx.state.boardState.activeSceneId]||[]).map(p=>[p.id,p]));
 const tokenGeometry=Array.from(document.querySelectorAll('#vtt-token-layer [data-placement-id],#vtt-token-layer [data-vtt-drag-ghost]'),token=>{const matrix=active?new DOMMatrix(token.style.transform):null;return {token,matrix,x:active?matrix.m41+token.offsetWidth/2:0,y:active?matrix.m42+token.offsetHeight/2:0};});
 for(const {token,matrix,x,y} of tokenGeometry){
   if(!active){if(token.style.translate)token.style.translate='';if(token.style.scale)token.style.scale='';continue;}
   const placement=placementById.get(token.dataset.placementId||token.dataset.terrainSourceId);
   if(placement&&token.dataset.placementId&&token.dataset.terrainSourceId!==placement.id)token.dataset.terrainSourceId=placement.id;
   const z=placement?Math.max(groundFor(placement,{x,y}),token.dataset.vttDragGhost&&['fly','hover'].includes(placement.movementMode)?heightAt(x,y):-Infinity):heightAt(x,y),g=dimensions().grid;
   const value=`${z*g*.12}px ${-z*g*.36}px`;if(token.style.translate!==value)token.style.translate=value;const heightText=z.toFixed(2);if(token.dataset.terrainHeight!==heightText)token.dataset.terrainHeight=heightText;
   const targetScale=relativeScale(z,viewerHeight),oldHeight=tokenHeights.get(token.dataset.placementId),whole=groundSquare(z);
   if(token.style.transition)token.style.transition='';if(token.style.scale)token.style.scale='';const placed=`translate3d(${matrix.m41}px, ${matrix.m42}px, 0px)`;const scaled=`${placed} scale(${targetScale})`;if(token.style.transform!==scaled)token.style.transform=scaled;
   if(oldHeight!==undefined&&whole>oldHeight&&heightBand(whole)===heightBand(oldHeight)&&!matchMedia('(prefers-reduced-motion: reduce)').matches)token.animate([{transform:scaled},{transform:`${placed} scale(${targetScale*1.045})`},{transform:scaled}],{duration:220});
   tokenHeights.set(token.dataset.placementId,whole);
   const delta=heightBand(z)*2-viewerHeight,badgeKey=String(delta);if(token.dataset.terrainBadge!==badgeKey||Boolean(delta)!==Boolean(token.querySelector('.vtt-token__level-indicator'))||delta&&token.querySelector('.vtt-token__level-indicator-distance')?.textContent!==String(Math.abs(delta))){applyTokenLevelPresentation(token,{direction:delta>0?'above':delta<0?'below':'same',indicator:delta!==0,distance:Math.abs(delta)});token.dataset.terrainBadge=badgeKey;}
   const effectiveText=String(effectiveHeight(z,Math.max(placement?.width||1,placement?.height||1)));if(token.dataset.terrainEffectiveHeight!==effectiveText)token.dataset.terrainEffectiveHeight=effectiveText;

 }
 }catch(e){console.error(e);}requestAnimationFrame(tick);
}
const flightMigrationPending=new Set();
const flight=createFlightState(localStorage);
function flightGround(x,y,token=null){if(token?.levelId&&token.levelId!=='level-0')return floorElevations(levelConfig()).get(token.levelId)??0;const d=dimensions();return heightAt((ctx.view.gridOffsets.left||0)+x*d.grid,(ctx.view.gridOffsets.top||0)+y*d.grid);}
function importedDesign(){return window.wallPrototype?.model||sharedField('walls')?.value;}
function levelConfig(){return ctx?.state.boardState.sceneState?.[ctx.state.boardState.activeSceneId]?.mapLevels;}
function groundFor(placement,point=null){
 if(!placement)return 0;
 const level=placement.levelId||'level-0',base=floorElevations(levelConfig()).get(level)??0;
 if(['fly','hover'].includes(placement.movementMode))return Math.max(base,flight.height(placement,(x,y)=>flightGround(x,y,placement)));
 if(placement._supportSurfaceId){const surface=resolveSupportSurfaces(importedDesign()||{}).find(s=>s.id===placement._supportSurfaceId);if(surface&&intersectsFloor(placement,surface,(levelConfig()?.levels||[]).find(l=>l.id===surface.levelId)?.cutouts||[]))return surface.height;}
 if(importedDesign()){
  const d=dimensions(),x=point?(point.x-(ctx.view.gridOffsets.left||0))/d.grid:placement.column+(placement.width||1)/2,y=point?(point.y-(ctx.view.gridOffsets.top||0))/d.grid:placement.row+(placement.height||1)/2;
  const z=rampGround((importedDesign()?.ramps||[]),placement,{x,y});if(z!==null)return z;
  if(level!=='level-0'&&floorSupported({...placement,column:x-(placement.width||1)/2,row:y-(placement.height||1)/2},resolveSupportSurfaces(importedDesign()||{}),(levelConfig()?.levels||[]).find(f=>f.id===level)?.cutouts||[])===false)return heightAt((ctx.view.gridOffsets.left||0)+x*d.grid,(ctx.view.gridOffsets.top||0)+y*d.grid);
 }

 if(level!=='level-0')return base;
 const d=dimensions(),x=point?.x??((placement.column+placement.width/2)*d.grid+(ctx.view.gridOffsets.left||0)),y=point?.y??((placement.row+placement.height/2)*d.grid+(ctx.view.gridOffsets.top||0));
 const ground=heightAt(x,y),p={...placement,column:(x-(ctx.view.gridOffsets.left||0))/d.grid-(placement.width||1)/2,row:(y-(ctx.view.gridOffsets.top||0))/d.grid-(placement.height||1)/2};
 const contact=!placement._floorTraversal?terrainFloorContact(p,resolveSupportSurfaces(importedDesign()||{}),levelConfig(),ground):null;
 return contact?.height??ground;
}
function movementPlacement(from,to){
 const d=dimensions(),terrain=p=>heightAt((ctx.view.gridOffsets.left||0)+(p.column+(p.width||1)/2)*d.grid,(ctx.view.gridOffsets.top||0)+(p.row+(p.height||1)/2)*d.grid);
 const surfaces=resolveSupportSurfaces(importedDesign()||{}),surface=walkFloorContact(from,to,[],surfaces,levelConfig(),terrain)||cubeStepDown(from,to,surfaces,levelConfig());
 return surface?{...to,levelId:surface.levelId,_supportSurfaceId:surface.id}:to;
}
function movementGroundFor(from,to){return groundFor(movementPlacement(from,to));}
function highGround(actor,target){return effectiveHeight(groundFor(actor),Math.max(actor.width||1,actor.height||1))-effectiveHeight(groundFor(target),Math.max(target.width||1,target.height||1))>=1;}
function isCliff(x,y){const g=dimensions().grid;return [[1,0],[0,1],[1,1],[1,-1]].some(([dx,dy])=>Math.abs(heightAt(x+dx*g/2,y+dy*g/2)-heightAt(x-dx*g/2,y-dy*g/2))>=3-1e-6);}
function rulerActor(){const placements=ctx.state.boardState.placements[ctx.state.boardState.activeSceneId]||[];return placements.find(p=>p.id===(ctx.selectedIds[0]||window.visionPrototype?.viewerTokenId));}
function rulerGround(column,row,actor){
 const d=dimensions();
 if(actor&&importedDesign()){const p={x:column+(actor.width||1)/2,y:row+(actor.height||1)/2};return rampLanding((importedDesign()?.ramps||[]),(resolveSupportSurfaces(importedDesign()||{})),actor,p,onSurface)??groundFor({...actor,column,row});}
 if(actor&&((actor.levelId&&actor.levelId!=='level-0')||(actor.movementMode&&actor.movementMode!=='ground')))return groundFor(actor);
 return heightAt((ctx.view.gridOffsets.left||0)+(column+.5)*d.grid,(ctx.view.gridOffsets.top||0)+(row+.5)*d.grid);
}
// A cliff is a face steep enough to stop forced movement, so this is that same test.
function climbFace(actor,a,b){
 const from={width:1,height:1,...(actor||{}),column:a.column,row:a.row};if(['fly','hover'].includes(from.movementMode))return false;
 const d=dimensions(),ground=(x,y)=>heightAt((ctx.view.gridOffsets.left||0)+x*d.grid,(ctx.view.gridOffsets.top||0)+y*d.grid);
 return terrainContact(from,{column:b.column,row:b.row},ground,t=>groundFor(t))!==null;
}
function route(start,end,options={}){
 const d=dimensions(),actor=options.actor||rulerActor(),design=importedDesign();
 // The preview walks the route as the move itself will: it steps onto bridges and decks and stays on them.
 // `options.carry` hands the walker from one leg of a route to the next, so a waypoint on a bridge keeps it there.
 const walker=createRouteWalker({actor,surfaces:design?resolveSupportSurfaces(design):[],mapLevels:levelConfig(),
  terrain:p=>heightAt((ctx.view.gridOffsets.left||0)+(p.column+(p.width||1)/2)*d.grid,(ctx.view.gridOffsets.top||0)+(p.row+(p.height||1)/2)*d.grid),
  plainHeight:(column,row,who)=>rulerGround(column,row,who),carried:options.carry?.ghost||null});
 const zones=options.ignoreZones?null:window.terrainZones;
 const walked=routeSteps(start,end,(column,row)=>walker.height(column,row),zones?.stepMultiplier?(column,row,rawHeight)=>zones.stepMultiplier(actor,column,row,rawHeight):null,options.ignoreClimb?null:(a,b)=>climbFace(actor,a,b));
 if(options.carry)options.carry.ghost=walker.ghost;
 return walked;
}
// One step of a previewed walk, for the reach outline: the same contact rule, one square at a time.
function walkTerrain(p){const d=dimensions();return heightAt((ctx.view.gridOffsets.left||0)+(p.column+(p.width||1)/2)*d.grid,(ctx.view.gridOffsets.top||0)+(p.row+(p.height||1)/2)*d.grid);}
function walkSurfaces(){const design=importedDesign();return design?resolveSupportSurfaces(design):[];}
// A stepper for the reach outline around one square. It looks only at the plates within `reach`
// squares and remembers plain ground heights, because the outline asks about every square many
// times. Null when no plate is near: the plain per-square rule is then already right.
function walkerNear(actor,column,row,reach=15){
 const box=s=>({s,left:Math.min(...s.points.map(p=>p.x)),right:Math.max(...s.points.map(p=>p.x)),top:Math.min(...s.points.map(p=>p.y)),bottom:Math.max(...s.points.map(p=>p.y))});
 const near=walkSurfaces().filter(s=>(s.kind==='floor'||s.templateCube)&&s.points?.length>2).map(box).filter(b=>b.left<=column+reach+2&&b.right>=column-reach-1&&b.top<=row+reach+2&&b.bottom>=row-reach-1);
 if(!walksPlates(actor,near))return null;
 const mapLevels=levelConfig(),ground=new Map(),size=Math.max(actor.width||1,actor.height||1);
 const plainHeight=(c,r,who)=>{if(who?._supportSurfaceId)return rulerGround(c,r,who);const key=c+','+r;let h=ground.get(key);if(h===undefined){h=rulerGround(c,r,who);ground.set(key,h);}return h;};
 // Only the plates within a square of the step can matter to it. A step nowhere near a plate is plain ground.
 const step=(ghost,c,r)=>{
  const left=Math.min(ghost.column,c)-1,right=Math.max(ghost.column,c)+size+1,top=Math.min(ghost.row,r)-1,bottom=Math.max(ghost.row,r)+size+1;
  const local=near.filter(b=>b.left<=right&&b.right>=left&&b.top<=bottom&&b.bottom>=top).map(b=>b.s);
  if(!local.length)return {ghost:{...ghost,column:c,row:r,_supportSurfaceId:null},height:plainHeight(c,r,{...actor,_supportSurfaceId:null})};
  return stepGhost({ghost,column:c,row:r,actor,surfaces:local,mapLevels,terrain:walkTerrain,plainHeight});
 };
 return {plainHeight,step};
}
// Every leg of a route, walked in order with the walker carried from leg to leg.
function routeLegs(points){const carry={},legs=[];for(let k=1;k<points.length;k++)legs.push(route(points[k-1],points[k],{carry}).points);return legs;}
// The drawn line through walked steps. It follows the ground as before, except where the walker
// is on a plate above (or below) the ground: there it follows the height it actually walks at.
function stepsPath(steps,parts=[]){
 const d=dimensions(),actor=rulerActor();
 for(let i=0;i<steps.length;i++){
  const a=steps[Math.max(0,i-1)],b=steps[i],count=i?4:1;
  for(let j=1;j<=count;j++){
   const col=a.column+(b.column-a.column)*j/count,row=a.row+(b.row-a.row)*j/count,x=(ctx.view.gridOffsets.left||0)+(col+.5)*d.grid,y=(ctx.view.gridOffsets.top||0)+(row+.5)*d.grid;
   const ground=rulerGround(col,row,actor),walkedAt=Number.isFinite(a.rawHeight)&&Number.isFinite(b.rawHeight)?a.rawHeight+(b.rawHeight-a.rawHeight)*j/count:ground;
   const q=project(x,y,Math.abs(walkedAt-ground)>.3?walkedAt:ground);
   parts.push(`${parts.length?'L':'M'} ${q.x.toFixed(2)} ${q.y.toFixed(2)}`);
  }
 }
 return parts;
}
function rulerPoint(p){const actor=rulerActor(),d=dimensions(),h=rulerGround(p.column,p.row,actor),q=project(p.mapX,p.mapY,h);return {mapX:q.x,mapY:q.y};}
function routePath(points){
 const parts=[];
 for(const steps of routeLegs(points))stepsPath(steps,parts);
 return parts.join(' ');
}
let markerCache='',markerBuilds=0,markerPreferenceKey='',markersVisible=true;
function setMarkersVisible(value){markersVisible=!!value;if(markerPreferenceKey)localStorage.setItem(markerPreferenceKey,String(markersVisible));markers.style.display=active&&markersVisible?'':'none';}
function drawCostMarkers(){
 const d=dimensions(),g=d.grid,ox=ctx.view.gridOffsets.left||0,oy=ctx.view.gridOffsets.top||0,parts=[];
 let hash=2166136261;for(const byte of new Uint8Array(field.h.buffer,field.h.byteOffset,field.h.byteLength))hash=Math.imul(hash^byte,16777619);
 const cache=JSON.stringify([key,hash,field.n,field.m,d,ox,oy,ctx.view.mapPixelSize]);if(cache===markerCache)return;markerCache=cache;markerBuilds++;
 const minCol=Math.ceil((d.left-ox)/g),minRow=Math.ceil((d.top-oy)/g),maxCol=Math.floor((d.left+d.width-ox)/g),maxRow=Math.floor((d.top+d.height-oy)/g);
 for(let row=minRow;row<maxRow;row++)for(let col=minCol;col<maxCol;col++){
   const shape=slopeIndicator(col+.5,row+.5,(x,y)=>heightAt(ox+x*g,oy+y*g),(x,y)=>x>=minCol&&x<maxCol&&y>=minRow&&y<maxRow);
   if(!shape)continue;const {dx,dy,grade:rise}=shape;
   const stops=[[.3,[20,90,40]],[1,[144,224,144]],[2,[255,242,145]],[3,[180,145,0]],[4,[153,27,27]],[6,[255,150,150]]];
   let color=stops.at(-1)[1];
   for(let i=1;i<stops.length;i++)if(rise<=stops[i][0]){
    const [lo,a]=stops[i-1],[hi,b]=stops[i],t=(rise-lo)/(hi-lo);
    color=a.map((c,j)=>Math.round(c+(b[j]-c)*t));break;
   }
   const x=ox+(col+.5+dx*.25)*g,y=oy+(row+.5+dy*.25)*g,q=project(x,y,heightAt(x,y));
   const ahead=project(x+dx*g*.08,y+dy*g*.08,heightAt(x+dx*g*.08,y+dy*g*.08));
   const length=Math.hypot(ahead.x-q.x,ahead.y-q.y)||1,ux=(ahead.x-q.x)/length,uy=(ahead.y-q.y)/length;
   const tip={x:q.x+ux*g*.065,y:q.y+uy*g*.065},tail={x:q.x-ux*g*.055,y:q.y-uy*g*.055},base={x:q.x-ux*g*.005,y:q.y-uy*g*.005};
   parts.push(`<path data-elevation-arrow="up" data-grade="${rise}" d="M${tail.x},${tail.y} L${tip.x},${tip.y} M${base.x-uy*g*.045},${base.y+ux*g*.045} L${tip.x},${tip.y} L${base.x+uy*g*.045},${base.y-ux*g*.045}" fill="none" stroke="rgb(${color.join(',')})" stroke-width="${g*.026}" stroke-linecap="round" stroke-linejoin="round"/>`);
 }
 markers.setAttribute('width',ctx.view.mapPixelSize.width);markers.setAttribute('height',ctx.view.mapPixelSize.height);markers.innerHTML=parts.join('');
}
function paintRoute(overlay,points,gridSize){
 const ns='http://www.w3.org/2000/svg';let group=overlay.svg.querySelector('[data-terrain-route]');
 if(!group){group=document.createElementNS(ns,'g');group.dataset.terrainRoute='';overlay.svg.insertBefore(group,overlay.path.nextSibling);}
 const pieces=[];
 for(const steps of routeLegs(points)){
   for(let i=1;i<steps.length;i++){
     const a=steps[i-1],b=steps[i],distance=Math.max(Math.abs(b.column-a.column),Math.abs(b.row-a.row)),slope=(b.rawHeight-a.rawHeight)/(distance||1),color=slopeColor(slope);
     const path=stepsPath([a,b]).join(' ');pieces.push({path,color});
   }
 }
 group.replaceChildren();
 for(const piece of pieces){const path=document.createElementNS(ns,'path');path.setAttribute('d',piece.path);path.setAttribute('fill','none');path.setAttribute('stroke',piece.color);path.setAttribute('stroke-width',Math.max(2,gridSize*.32));path.setAttribute('stroke-linecap','round');path.setAttribute('stroke-linejoin','round');group.append(path);}
 const last=group.lastChild;if(last){last.setAttribute('marker-end','url(#terrain-route-head)');let head=overlay.svg.querySelector('#terrain-route-head');if(!head){head=document.createElementNS(ns,'marker');head.id='terrain-route-head';head.setAttribute('viewBox','0 0 10 10');head.setAttribute('refX','8');head.setAttribute('refY','5');head.setAttribute('markerWidth','2');head.setAttribute('markerHeight','2');head.setAttribute('orient','auto');const shape=document.createElementNS(ns,'path');shape.setAttribute('d','M0 0L10 5L0 10Z');head.append(shape);overlay.svg.querySelector('defs').append(head);}head.firstChild.setAttribute('fill',pieces.at(-1).color);}
 overlay.path.style.opacity='0';
}
window.addEventListener('storage',e=>{if(e.key===key&&!drawing){key='';}});
window.terrainPrototype={get flightRevision(){return flight.revision;},setTokenHeight:(token,z)=>{if(!Number.isFinite(z)||z<0||z>1000000)throw Error('Height must be between 0 and 1000000.');return window.submitFlightHeight(token,z);},setMarkersVisible,get markersVisible(){return markersVisible;},get markerBuilds(){return markerBuilds;},unproject,heightAt,groundFor,movementGroundFor,movementPlacement,highGround,isCliff,climbFace,walkerNear,get design(){return importedDesign();},route,rulerPoint,routePath,paintRoute,get revision(){return terrainRevision;},get viewerHeight(){return viewerHeight;},refresh:()=>{dirty=true;},get field(){return field;},get key(){return key;},get storageError(){return storageError;},project,get active(){return active;}};
requestAnimationFrame(tick);

import('./wall-prototype.js');
