import {floorSupported,intersectsFloor,terrainFloorContact,resolveSupportSurfaces,walkFloorContact,cubeStepDown,landingSurfaceHeight} from './floor-support.js';
import {sharedField,saveShared,acknowledgedRevision} from './environment-sync.mjs';
import {rampAt,rampHeight,rampPick,rampGround,rampSupports,rampLanding,rampCarries} from './imported-ramps.mjs';
import {onSurface} from './stacked-surfaces.mjs';
import {createFlightState} from './flight-height.mjs';
import {slopeIndicator} from './slope-indicator.mjs';
// Terrain design is canonical scene environment; display preferences remain local.
import {claimActiveTool,publishActiveTool} from './active-tool.js';
import {sample,paint,clamp,groundSquare,heightBand,effectiveHeight,routeSteps,slopeColor,brushRate} from './terrain-math.mjs';
import {floorElevations} from '../state/normalize/floor-elevation.js';
import {terrainContact} from './terrain-contact.js';
import {createRouteWalker,stepGhost,walksPlates,hasStairs,traceSurfaceLeg,commandSurfaceEnding,surfaceBelow} from './route-walker.mjs';
import {nearStair} from './stair-walk.mjs';
import {pickView,floorDrawn} from './pointer-pick.mjs';
import {createRulerPass,passActorKey} from './ruler-pass.mjs';
import {getCurrentMeasurementPoints,getDroppedMeasurementPoints,getCurrentMovementKind} from './drag-ruler.js';import {straightLine} from './forced-line.mjs';import {stairEnds,stairAssume} from './stair-assume.mjs';import {buildStairPerimeter,resolveSegmentColor} from './stairs-geometry.js';
const $=s=>document.querySelector(s);
const image=$('#vtt-map-image'),transform=$('#vtt-map-transform'),surface=$('#vtt-map-surface'),board=$('#vtt-board-canvas');
const style=document.createElement('style');style.textContent=`
 #terrain-panel{position:absolute;left:58px;top:12px;width:228px;z-index:90;padding:14px;border:1px solid #777;border-radius:8px;background:var(--panel-bg,#24252b);color:var(--text-color,#eee);box-shadow:0 6px 24px #0007}
 [data-action="terrain-height"]{grid-row:4;grid-column:2}#terrain-readout{margin-left:6px}
 #terrain-panel[hidden]{display:none}#terrain-panel header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
 #terrain-panel label{display:block;margin:12px 0 4px}#terrain-panel input{width:100%;box-sizing:border-box}#terrain-panel input[type=checkbox]{width:auto;margin-right:6px}#terrain-panel .terrain-tools{display:grid;grid-template-columns:1fr 1fr;gap:6px}
 #terrain-panel button[aria-pressed=true]{outline:2px solid #d9ba6d;outline-offset:1px}#terrain-panel output{float:right;font-variant-numeric:tabular-nums}
 #terrain-panel footer{margin-top:14px;display:flex;align-items:center;justify-content:space-between}
 #terrain-brush{position:fixed;pointer-events:none;border:2px solid #ffe7a4;border-radius:50%;z-index:91;box-shadow:0 0 2px #000;transform:translate(-50%,-50%)}
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

// fieldVersion counts every change to the height field, so the 3D board can redraw the ground;
// brush3d is the Height tool's brush on the 3D board ({x,y} map pixels, radius in squares) or null.
let fieldVersion=0,brush3d=null;
let field=null,key='',signature='',undo=[],drawing=false,mode='raise',last=null,ctx=null,dirty=true,active=false,storageError=false;

let terrainRevision=0;
let stampTime=0,stampPosition=null,viewerHeight=0,lastBrushMotion=-Infinity;
function dimensions(){return {width:image.naturalWidth,height:image.naturalHeight,left:ctx.view.mapInsets.left||0,top:ctx.view.mapInsets.top||0,grid:ctx.view.gridSize||64};}
function heightAt(x,y){if(!field||!active)return 0;const d=dimensions();return sample(field,(x-d.left)/d.width,(y-d.top)/d.height);}
// How far a square of height moves a thing on screen. The scene's map design may ask for a flatter slant (height-view.mjs).
function liveBoard(){return window.terrainContext?.()||ctx;}
function livePlacement(who){const board=liveBoard(),id=typeof who==='string'?who:who?.id,found=id?(board.state.boardState.placements[board.state.boardState.activeSceneId]||[]).find(p=>p.id===id):null;return found||(who&&typeof who==='object'?who:null);}
// Resolve the viewer's standing height for visibility comparisons.
function pointerView(){
 const board=liveBoard(),gm=window.gmVision;
 const token=board.isGM?(gm?.manual?null:livePlacement(board.selectedIds?.[0])):(livePlacement(board.followId));
 if(board.isGM&&(!token||(gm&&!gm.lighting)))return pickView({gmHeight:token?groundFor(token):Number(gm?.height)||0});
 if(token)return pickView({token,ground:groundFor(token)});
 return pickView({token:{column:0,row:0,width:1,height:1},ground:floorElevations(levelConfig()).get(board.levelId)||0});
}
function rawPoint(event){
 return window.vtt3d?.clientToMap(event.clientX,event.clientY) ?? null;
}
let sharedTerrainRevision=-1,savingTerrain=false,dirtyWhileSaving=false;
function save(){if(storageError)return;if(savingTerrain){dirtyWhileSaving=true;return;}dirtyWhileSaving=false;const savingKey=key;savingTerrain=true;saveShared('terrain',{n:field.n,m:field.m,h:Array.from(field.h),bounds:field.bounds||{left:(dimensions().left-(ctx.view.gridOffsets.left||0))/dimensions().grid,top:(dimensions().top-(ctx.view.gridOffsets.top||0))/dimensions().grid,width:dimensions().width/dimensions().grid,height:dimensions().height/dimensions().grid}},Math.max(0,sharedTerrainRevision),ctx.state.boardState.activeSceneId).then(result=>{if(key===savingKey)sharedTerrainRevision=acknowledgedRevision(result,'terrain')??sharedTerrainRevision;}).catch(e=>{if(key!==savingKey)return;storageError=true;console.error(e);alert('Terrain save was not confirmed. Keep this draft open; reload to recover shared terrain.');}).finally(()=>{savingTerrain=false;if(key===savingKey&&dirtyWhileSaving&&!storageError&&!drawing)save();});}
function saveLocalBackup(){try{localStorage.setItem(key,JSON.stringify({n:field.n,m:field.m,h:Array.from(field.h)}));storageError=false;}catch(e){storageError=true;console.error('Terrain could not be saved in this browser',e);alert('Terrain could not be saved. Browser storage is full. Keep this tab open.');}}
function setOpen(open){panel.hidden=!open;button.setAttribute('aria-expanded',String(open));if(open){claimActiveTool('terrain',()=>setOpen(false));publishActiveTool('terrain','Height');}else{finish();brush3d=null;publishActiveTool('terrain');}}
button.onclick=()=>setOpen(panel.hidden);panel.querySelector('header button').onclick=()=>setOpen(false);
panel.querySelectorAll('[data-brush]').forEach(b=>b.onclick=()=>{mode=b.dataset.brush;panel.querySelectorAll('[data-brush]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));});
$('#terrain-size').oninput=e=>$('#terrain-size-value').textContent=e.target.value+' squares';
$('#terrain-undo').onclick=()=>{if(!storageError&&undo.length){field.h=undo.pop();dirty=true;fieldVersion++;save();$('#terrain-undo').disabled=!undo.length;}};
function finish(){if(drawing){drawing=false;last=null;stampPosition=null;save();} }
function stamp(p,amount){const d=dimensions();paint(field,{x:p.x-d.left,y:p.y-d.top,width:d.width,height:d.height,radius:Number($('#terrain-size').value)*d.grid/2,amount,mode,stopAtTarget:$('#terrain-limit').checked,target:clamp(Number($('#terrain-target').value)||0,-8,32)});dirty=true;fieldVersion++;}
function move(e){if(!ctx||!active||panel.hidden){brush3d=null;return;}const p=rawPoint(e);if(!p){brush3d=null;return;}brush3d={x:p.x,y:p.y,radius:Number($('#terrain-size').value)/2};$('#terrain-readout').textContent=groundSquare(heightAt(p.x,p.y))+(isCliff(p.x,p.y)?' · Cliff':'');
 if(drawing){if(Math.hypot(p.x-last.x,p.y-last.y)>.2)lastBrushMotion=performance.now();last=p;e.preventDefault();e.stopImmediatePropagation();}}
board.addEventListener('pointerdown',e=>{if(panel.hidden||!active||e.button!==0||storageError)return;e.preventDefault();e.stopImmediatePropagation();const p=rawPoint(e),d=dimensions();if(!p||p.x<d.left||p.y<d.top||p.x>d.left+d.width||p.y>d.top+d.height)return;undo.push(field.h.slice());if(undo.length>30)undo.shift();$('#terrain-undo').disabled=false;drawing=true;lastBrushMotion=-Infinity;last=p;stampPosition=p;stampTime=performance.now();board.setPointerCapture(e.pointerId);stamp(p,.08);},true);
board.addEventListener('pointermove',move,true);
board.addEventListener('pointerup',e=>{if(drawing){e.preventDefault();e.stopImmediatePropagation();finish();if(board.hasPointerCapture(e.pointerId))board.releasePointerCapture(e.pointerId);}},true);
board.addEventListener('pointercancel',finish,true);board.addEventListener('lostpointercapture',finish,true);board.addEventListener('pointerleave',()=>brush3d=null);
document.addEventListener('keydown',e=>{if(e.key==='Escape')setOpen(false);});window.addEventListener('blur',finish);window.addEventListener('pagehide',finish);document.addEventListener('visibilitychange',()=>{if(document.hidden)finish();});
function tick(now){
 try{
 const nextContext=window.terrainContext?.();if(drawing&&ctx?.state.boardState.activeSceneId!==nextContext?.state.boardState.activeSceneId)finish();
 ctx=nextContext;active=!!ctx&&ctx.view.mapLoaded&&image.complete&&image.naturalWidth>0&&!!(sharedField('terrain')||sharedField('walls')||(ctx.state.boardState.templates?.[ctx.state.boardState.activeSceneId]||[]).some(t=>t.type==='wall')||!panel.hidden);
 document.documentElement.classList.toggle('terrain-on',active);const pref='terrain-slope-arrows:'+String(ctx?.userId||'viewer');if(pref!==markerPreferenceKey){markerPreferenceKey=pref;markersVisible=localStorage.getItem(pref)!=='false';}button.disabled=!ctx?.view.mapLoaded;
 if(active){
   const nextKey='terrain-prototype:v1:'+ctx.state.boardState.activeSceneId+':'+image.getAttribute('src');
   if(key!==nextKey){finish();key=nextKey;sharedTerrainRevision=-1;storageError=false;undo=[];$('#terrain-undo').disabled=true;const n=Math.min(201,Math.max(17,Math.ceil(image.naturalWidth/ctx.view.gridSize*4)+1)),m=Math.min(201,Math.max(17,Math.ceil(image.naturalHeight/ctx.view.gridSize*4)+1));field={n,m,h:new Float32Array(n*m)};dirty=true;fieldVersion++;}
   const shared=sharedField('terrain');if(!savingTerrain&&!drawing&&!storageError&&shared&&shared.revision!==sharedTerrainRevision){field={...shared.value,h:Float32Array.from(shared.value.h)};fieldVersion++;sharedTerrainRevision=shared.revision;dirty=true;undo=[];$('#terrain-undo').disabled=true;}
   const nextSignature=JSON.stringify([ctx.view.mapPixelSize,ctx.view.mapInsets,ctx.view.gridSize,ctx.view.gridOffsets,ctx.state.grid.visible,ctx.isGM&&document.querySelector('#wall-panel')?.hidden===false]);if(nextSignature!==signature){signature=nextSignature;dirty=true;}
   if(drawing&&last&&now-stampTime>=32){
     const amount=Math.min(.15,(now-stampTime)/1000)*brushRate(now-lastBrushMotion<100);stampTime=now;
     const distance=Math.hypot(last.x-stampPosition.x,last.y-stampPosition.y),steps=Math.max(1,Math.ceil(distance/(dimensions().grid*.15)));
     for(let i=1;i<=steps;i++)stamp({x:stampPosition.x+(last.x-stampPosition.x)*i/steps,y:stampPosition.y+(last.y-stampPosition.y)*i/steps},amount/steps);
     stampPosition={...last};$('#terrain-readout').textContent=groundSquare(heightAt(last.x,last.y));
   }
   if(dirty){terrainRevision++;dirty=false;}
   const placements=ctx.state.boardState.placements[ctx.state.boardState.activeSceneId]||[];
   flight.select('terrain-flight:v1:'+ctx.state.boardState.activeSceneId);flight.update(placements,flightGround);
   if(ctx.isGM)for(const token of placements)if(['fly','hover'].includes(token.movementMode)&&!Number.isFinite(token.flightHeight)&&!flightMigrationPending.has(ctx.state.boardState.activeSceneId+':'+token.id)){flightMigrationPending.add(ctx.state.boardState.activeSceneId+':'+token.id);window.submitFlightHeight(token,flight.height(token,(x,y)=>flightGround(x,y,token))).catch(console.error);}
   const reference=placements.find(p=>p.id===(ctx.isGM?(ctx.selectedIds.length===1?ctx.selectedIds[0]:null):ctx.followId));
   viewerHeight=window.gmVision?.manual?window.gmVision.height:reference ? heightBand(groundFor(reference))*2 : (floorElevations(levelConfig()).get(ctx.levelId)||0);
   window.gmVision?.syncNavigation();
   button.hidden=!ctx.isGM;
   if(!ctx.isGM&&!panel.hidden)setOpen(false);

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
 // Asked before this file's first frame has run (the 3D board opening in the middle of a turn asks at once for the
 // turn's starting square): the board is read now. With no board yet, the floor's own height is the answer.
 if(!ctx)ctx=window.terrainContext?.()||null;
 const level=placement.levelId||'level-0',base=floorElevations(levelConfig()).get(level)??0;
 if(!ctx?.view)return base;
 if(['fly','hover'].includes(placement.movementMode))return Math.max(base,flight.height(placement,(x,y)=>flightGround(x,y,placement)));
 // A token carried by a stair stands at the stair's height, even while the floor it came from still
 // lies under it (WallMovement::height has the same rule). Otherwise the plate it stands on decides.
 if(placement._floorTraversal&&importedDesign()){const d=dimensions(),p={x:point?(point.x-(ctx.view.gridOffsets.left||0))/d.grid:placement.column+(placement.width||1)/2,y:point?(point.y-(ctx.view.gridOffsets.top||0))/d.grid:placement.row+(placement.height||1)/2},ramp=rampAt(importedDesign().ramps||[],p);if(ramp&&rampCarries(ramp,placement))return rampHeight(ramp,p.x,p.y);}
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
// Where a creature coming down over a square would land, for drawing the squares a push offers:
// the highest plate under that square that is not above `altitude`, or else the ground there
// (`placement` stands for the creature in that square; see landingSurfaceHeight in floor-support.js).
// Null when no plate would catch it. The ground at each corner of the square is still groundFor's.
function landingHeight(placement,altitude){
 const design=importedDesign();if(!design||!Number.isFinite(altitude))return null;
 const caught=landingSurfaceHeight(placement,resolveSupportSurfaces(design),levelConfig(),altitude,-Infinity);
 return Number.isFinite(caught)?caught:null;
}
function movementPlacement(from,to,enter=true){
 const d=dimensions(),terrain=p=>heightAt((ctx.view.gridOffsets.left||0)+(p.column+(p.width||1)/2)*d.grid,(ctx.view.gridOffsets.top||0)+(p.row+(p.height||1)/2)*d.grid);
 const surfaces=resolveSupportSurfaces(importedDesign()||{}),surface=walkFloorContact(from,to,[],surfaces,levelConfig(),terrain,enter)||cubeStepDown(from,to,surfaces,levelConfig());
 if(surface)return {...to,levelId:surface.levelId,_supportSurfaceId:surface.id};
 // Off the top he stood on: down onto the highest surface under him, as the server lands him (route-walker.mjs).
 const was=enter&&from._supportSurfaceId?surfaces.find(s=>s.id===from._supportSurfaceId):null,off={...to,levelId:'level-0',_supportSurfaceId:null};
 const caught=was&&(to.levelId||'level-0')==='level-0'?surfaceBelow(off,surfaces,levelConfig(),was.height,terrain(off),was.id):null;
 return caught?{...to,levelId:caught.levelId||'level-0',_supportSurfaceId:caught.id}:to;
}
// The height a mover is at part-way through a move, for judging walls: not yet up on a low box (low-boxes.mjs).
function movementGroundFor(from,to){return groundFor(movementPlacement(from,to,false));}
function highGround(actor,target){return effectiveHeight(groundFor(actor),Math.max(actor.width||1,actor.height||1))-effectiveHeight(groundFor(target),Math.max(target.width||1,target.height||1))>=1;}
function isCliff(x,y){const g=dimensions().grid;return [[1,0],[0,1],[1,1],[1,-1]].some(([dx,dy])=>Math.abs(heightAt(x+dx*g/2,y+dy*g/2)-heightAt(x-dx*g/2,y-dy*g/2))>=3-1e-6);}
function rulerActor(){const placements=ctx.state.boardState.placements[ctx.state.boardState.activeSceneId]||[];return placements.find(p=>p.id===(ctx.selectedIds[0]||ctx.followId));}
// One redraw of the ruler is one pass (ruler-pass.mjs): each leg is walked once and each ground
// height looked up once, however many times the cost, the line and the red stretches ask.
const pass=createRulerPass();
const rulerPass=run=>pass.run(run);
function rulerGround(column,row,actor){
 return pass.active?pass.ground(column+','+row+'|'+passActorKey(actor),()=>rulerGroundNow(column,row,actor)):rulerGroundNow(column,row,actor);
}
function rulerGroundNow(column,row,actor){
 const d=dimensions();
 if(actor&&importedDesign()){const p={x:column+(actor.width||1)/2,y:row+(actor.height||1)/2};return rampLanding((importedDesign()?.ramps||[]),(resolveSupportSurfaces(importedDesign()||{})),actor,p,onSurface)??groundFor({...actor,column,row});}
 if(actor&&((actor.levelId&&actor.levelId!=='level-0')||(actor.movementMode&&actor.movementMode!=='ground')))return groundFor(actor);
 return heightAt((ctx.view.gridOffsets.left||0)+(column+.5)*d.grid,(ctx.view.gridOffsets.top||0)+(row+.5)*d.grid);
}
// A cliff is a face steep enough to stop forced movement, so this is that same test.
function climbFace(actor,a,b){
 const from={width:1,height:1,...(actor||{}),column:a.column,row:a.row};if(['fly','hover'].includes(from.movementMode))return false;
 // Ground the map labels no-climb is walked, however bumpy (Brandon, November 8, 2026).
 if(window.terrainZones?.noClimb?.(b.column,b.row,from.levelId||'level-0'))return false;
 const d=dimensions(),ground=(x,y)=>heightAt((ctx.view.gridOffsets.left||0)+x*d.grid,(ctx.view.gridOffsets.top||0)+y*d.grid);
 if(terrainContact(from,{column:b.column,row:b.row},ground,t=>groundFor(t))!==null)return true;
 // Or up onto a thing set climbable that he will stand on (low-boxes.mjs): charged as a cliff of its height is.
 const to={...from,column:b.column,row:b.row};
 return resolveSupportSurfaces(importedDesign()||{}).some(s=>s.boxTop&&s.climbable&&Math.abs(s.height-b.rawHeight)<.01&&intersectsFloor(to,s,[]));
}
function route(start,end,options={}){
 if(!pass.active)return routeNow(start,end,options);
 const key=[start.column,start.row,end.column,end.row,options.ignoreZones?1:0,options.ignoreClimb?1:0,options.climbFree?1:0,passActorKey(options.actor||rulerActor()),passActorKey(options.carry?.ghost)].join(';');
 const walk=pass.route(key,()=>{
  // Walked with its own carry, so where the walker ended up is kept with the walk.
  const carry={ghost:options.carry?.ghost};
  return {walked:routeNow(start,end,{...options,carry}),ghost:carry.ghost};
 });
 if(options.carry)options.carry.ghost=walk.ghost;
 return walk.walked;
}
function routeNow(start,end,options={}){
 const d=dimensions(),actor=options.actor||rulerActor(),design=importedDesign();
 // The 3D path, prediction and cost all consume the same straight-leg
 // trajectory. Physical support is carried explicitly rather than guessed
 // anew from the original actor at each grid square.
 if(window.vtt3dActive&&actor&&design&&options.ignoreZones!==true&&!['fly','hover'].includes(actor.movementMode)){
  const entry=options.carry?.ghost||actor,dx=entry.column-start.column,dy=entry.row-start.row;
  const trajectory=surfaceLeg(entry,{column:end.column+dx,row:end.row+dy});
  const count=Math.ceil(Math.max(Math.abs(end.column-start.column),Math.abs(end.row-start.row)));
  const heights=new Map(trajectory.samples.map(p=>[(p.column-dx)+','+(p.row-dy),p.height]));
  const height=(column,row)=>{
   const exact=heights.get(column+','+row);if(exact!==undefined)return exact;
   const length=Math.max(Math.abs(end.column-start.column),Math.abs(end.row-start.row));
   const t=length?Math.max(Math.abs(column-start.column),Math.abs(row-start.row))/length:0;
   return trajectory.samples[Math.min(trajectory.samples.length-1,Math.round(t*(trajectory.samples.length-1)))].height;
  };
  const zones=window.terrainZones,squareCost=zones?.stepMultiplier?(column,row,rawHeight)=>zones.stepMultiplier(actor,column,row,rawHeight):null;
  const face=options.ignoreClimb&&!options.climbFree?null:(a,b)=>climbFace(actor,a,b),free={free:options.climbFree===true},walked=routeSteps(start,start,height,squareCost,face,free);
  let previous=start;
  for(let i=1;i<=count;i++){
   const p={column:start.column+(end.column-start.column)*i/count,row:start.row+(end.row-start.row)*i/count};
   const part=routeSteps(previous,p,height,squareCost,face,free);
   walked.points.push(...part.points.slice(1));walked.cost+=part.cost;walked.extra+=part.extra;walked.climbExtra+=part.climbExtra;walked.cliff||=part.cliff;previous=p;
  }
  for(const p of walked.points)p.exactWalk=true;
  if(options.carry)options.carry.ghost=trajectory.placement;
  return walked;
 }
 // The preview walks the route as the move itself will: it steps onto bridges and decks and stays on them.
 // `options.carry` hands the walker from one leg of a route to the next, so a waypoint on a bridge keeps it there.
 const walker=createRouteWalker({actor,surfaces:design?resolveSupportSurfaces(design):[],mapLevels:levelConfig(),
  terrain:p=>heightAt((ctx.view.gridOffsets.left||0)+(p.column+(p.width||1)/2)*d.grid,(ctx.view.gridOffsets.top||0)+(p.row+(p.height||1)/2)*d.grid),
  plainHeight:(column,row,who)=>rulerGround(column,row,who),carried:options.carry?.ghost||null,standing:rampStanding(design)});
 const zones=options.ignoreZones?null:window.terrainZones;
 // Which squares the walker is carried by a stair, ramp or vine on: coming down a steep one is climbing down.
 const onStair=new Map(),walkHeight=(column,row)=>{const h=walker.height(column,row);onStair.set(column+','+row,!!walker.ghost?._floorTraversal||walker.ghost?._stairEnd===true);return h;};
 const walked=routeSteps(start,end,walkHeight,zones?.stepMultiplier?(column,row,rawHeight)=>zones.stepMultiplier(actor,column,row,rawHeight):null,options.ignoreClimb&&!options.climbFree?null:(a,b)=>climbFace(actor,a,b),{free:options.climbFree===true,carried:(column,row)=>onStair.get(column+','+row)===true});
 if(options.carry)options.carry.ghost=walker.ghost;
 return walked;
}
// Where a dragged token would stand if it were let go on a square: the end of the ruler's own walk
// of the move (routeNow above: onto plates and bridges, along stairs and ramps, as the move itself
// goes). The walk is along the ruler's points when the ruler is this drag's, and straight
// otherwise, which are the very points the drop sends to the server.
//
// The ghost used to be drawn at the ground under its square with the footing the token had where it
// was picked up: under a walkway while the drop would put the token on it, and floating at a
// walkway's height over the foot of the stair it was being dragged down. Null for a flier, and on
// a scene with no imported design: the ghost is then drawn as it always was.
// The heights a walk of the drag's path to a square ends at and rises to, for pickWalked: from the
// token's own square, through the ruler's points when it has any between its ends, to that square.
// The same walk as the ghost's (dropHeight below), asked of squares the pointer has not been read at yet.
// Where a walk through these squares ends, as the move itself decides it. The server carries each leg as one
// straight line from its start to its end (FloorGeometry::move, FloorSupport::walkContact): a stair is climbed
// when that line runs along it from its foot, and a plate is stepped onto when that line meets it. So the end of
// each leg is asked the same way. The 3D sandbox now shares a straight-chord surface trajectory for
// physical samples, costs, and prediction; its endpoint must also agree with the whole-command floor
// check. The unchanged 2D ruler retains its historical square-by-square walker.
// The same, with how he stands there: on which floor, on which plate, and by which end he came onto a stair.
function surfaceLeg(placement,end){
 const d=dimensions(),design=importedDesign();
 return traceSurfaceLeg({actor:placement,end,surfaces:resolveSupportSurfaces(design||{}),mapLevels:levelConfig(),
  terrain:p=>heightAt((ctx.view.gridOffsets.left||0)+(p.column+(p.width||1)/2)*d.grid,(ctx.view.gridOffsets.top||0)+(p.row+(p.height||1)/2)*d.grid),standing:p=>groundFor(p)});
}
function walkEnding(placement,points){
 if(window.vtt3dActive&&importedDesign()&&placement&&!['fly','hover'].includes(placement.movementMode)){
  let ghost={...placement,...points[0]},height=groundFor(ghost),stairExit=false;
  for(const point of points.slice(1)){
   if(point.column===ghost.column&&point.row===ghost.row)continue;
   const leg=surfaceLeg(ghost,point);ghost=leg.placement;height=leg.height;stairExit=leg.stairExit;
  }
  const d=dimensions(),expected=commandSurfaceEnding({actor:placement,points,surfaces:resolveSupportSurfaces(importedDesign()||{}),mapLevels:levelConfig(),standing:p=>groundFor(p),
   terrain:p=>heightAt((ctx.view.gridOffsets.left||0)+(p.column+(p.width||1)/2)*d.grid,(ctx.view.gridOffsets.top||0)+(p.row+(p.height||1)/2)*d.grid)});
  const canonicalCompatible=expected.known&&Math.abs(height-expected.height)<=.55&&(ghost.levelId||'level-0')===(expected.placement?.levelId||'level-0')
   &&(ghost._floorTraversal?.stairId||null)===(expected.placement?._floorTraversal?.stairId||null)
   &&(ghost._floorTraversal?.entry||null)===(expected.placement?._floorTraversal?.entry||null);
  return {height,placement:ghost,stairExit,canonicalCompatible,expectedHeight:expected.height,how:[ghost.levelId||'level-0',ghost._supportSurfaceId||'',ghost._floorTraversal?.entry||''].join('|')};
 }

 return nativeWalkEnding(placement,points);
}
function nativeWalkEnding(placement,points){
 const d=dimensions(),design=importedDesign(),surfaces=design?resolveSupportSurfaces(design):[],mapLevels=levelConfig();
 const standing=rampStanding(design),follow=standing&&hasStairs(mapLevels)?standing:null;
 const last=points[points.length-1];
 if(!walksPlates(placement,surfaces,!!follow))return {height:rulerGround(last.column,last.row,placement),how:'',placement:{...placement,...last}};
 const terrain=p=>heightAt((ctx.view.gridOffsets.left||0)+(p.column+(p.width||1)/2)*d.grid,(ctx.view.gridOffsets.top||0)+(p.row+(p.height||1)/2)*d.grid);
 let ghost={...placement,column:points[0].column,row:points[0].row},height=null,stairExit=false;
 for(let i=1;i<points.length;i++){
  if(points[i].column===ghost.column&&points[i].row===ghost.row)continue;
  const stepped=stepGhost({ghost,column:points[i].column,row:points[i].row,actor:placement,surfaces,mapLevels,terrain,plainHeight:(column,row,who)=>rulerGround(column,row,who),standing:follow});
  stairExit=stepped.ghost._viaStair&&stepped.ghost.levelId!==ghost.levelId;
  // Returning through the entry end does not change floor, but the native
  // stair walker still defers support acquisition at its adjacent landing.
  if(window.vtt3dActive&&!stairExit&&ghost._floorTraversal&&!stepped.ghost._floorTraversal){
   const r=(design?.ramps||[]).find(r=>r.id===ghost._floorTraversal.stairId);
   if(r&&rampCarries(r,ghost)){
    const head=(ghost.levelId||'level-0')===r.toLevel,side=head?(r.direction||'north'):({north:'south',south:'north',east:'west',west:'east'}[r.direction||'north']);
    const x=points[i].column+(ghost.width||1)/2,y=points[i].row+(ghost.height||1)/2;
    const adjacent=side==='north'?y>=r.top-1&&y<r.top&&x>=r.left&&x<=r.right:side==='south'?y>r.bottom&&y<=r.bottom+1&&x>=r.left&&x<=r.right:side==='west'?x>=r.left-1&&x<r.left&&y>=r.top&&y<=r.bottom:x>r.right&&x<=r.right+1&&y>=r.top&&y<=r.bottom;
    stairExit=adjacent&&stepped.ghost.levelId===ghost.levelId&&Math.abs(stepped.height-(head?r.height:r.base))<.55;
   }
  }
  ghost=stepped.ghost;height=stepped.height;
 }
 return {height:Number.isFinite(height)?height:null,how:[ghost.levelId||'level-0',ghost._supportSurfaceId||'',ghost._floorTraversal?.entry||''].join('|'),placement:ghost,stairExit};
}
// The corners the app puts in for a hero who stands at a stair's end and is held over that stair or where it leads
// (stair-assume.mjs): only when the straight line would not bring him out at the stair's height, and the way by the
// stair is free of walls. In the token's own squares. Null when nothing is assumed.
function stairCorners(placement,column,row,kind=getCurrentMovementKind(),resumeTraversal=false){
 const mapLevels=levelConfig();
 if(!placement||!hasStairs(mapLevels)||['fly','hover'].includes(placement.movementMode)||!importedDesign())return null;
 if(kind!=='walk'&&kind!=='shift')return null;
 const levelId=placement.levelId||'level-0',stairs=levelId==='level-0'?mapLevels.baseStairs:(mapLevels.levels||[]).find(level=>level?.id===levelId)?.stairs;
 const hero={column:placement.column,row:placement.row},target={column,row},size=Math.max(placement.width||1,placement.height||1);
 for(const stair of stairs||[]){
  const ends=stairEnds(stair.corners,buildStairPerimeter(stair.corners).map(s=>({...s,colour:resolveSegmentColor(stair.edgeColors,s.id)})));
  let corners=ends?stairAssume(ends,stair.direction==='down',hero,target,size):null;
  let resumed=false;
  // A 3D pick beside the far end of an already-entered vine needs the same
  // exit corner as a pick made from its foot. Keep the canonical traversal
  // and let the existing exact-leg walker and server validate that route.
  if(!corners&&resumeTraversal&&ends&&placement._floorTraversal?.stairId===stair.id
    &&placement._floorTraversal.entry===(stair.direction==='down'?'green':'red')
    &&hero.column>=ends.left&&hero.column<=ends.right-1&&hero.row>=ends.top&&hero.row<=ends.bottom-1){
    const opposite={north:'south',south:'north',east:'west',west:'east'};
    const near=stair.direction==='down'?opposite[ends.footSide]:ends.footSide;
    const vertical=near==='north'||near==='south';
    const lane=Math.max(vertical?ends.left:ends.top,Math.min(vertical?ends.right-size:ends.bottom-size,vertical?hero.column:hero.row));
    const entry=near==='north'?{column:lane,row:ends.top-1}:near==='south'?{column:lane,row:ends.bottom}:near==='west'?{column:ends.left-1,row:lane}:{column:ends.right,row:lane};
    corners=stairAssume(ends,stair.direction==='down',entry,target,size);
    resumed=!!corners?.length;
  }
  if(!corners)continue;
  // The straight line does as well when it leaves him at the same height, on the same floor, come onto the stair by the same end.
  const plain=walkEnding(placement,[hero,target]),byStair=walkEnding(placement,[hero,...corners,target]);
  if(resumed&&byStair.placement?.levelId!==stair.linkedLevelId)continue;
  if(!Number.isFinite(byStair.height)||(Number.isFinite(plain.height)&&Math.abs(byStair.height-plain.height)<.05&&plain.how===byStair.how))continue;
  if(window.wallPrototype?.blockedMove?.(placement,{column,row,path:corners}))continue;
  return corners;
 }
 return null;
}
// The same for the ruler, in the ruler's own squares: `start` is where the route starts, `hover` where the token is held.
function rampTargetHeight(rampId,placement){
 const ramp=(importedDesign()?.ramps||[]).find(r=>r.id===rampId);
 return ramp?rampHeight(ramp,placement.column+(placement.width||1)/2,placement.row+(placement.height||1)/2):null;
}
// A walk that ends on top of an object's box (low-boxes.mjs, `box-top:`), no more than a storey above the picked height.
// A labelled map's object (`box-top:obj:`) is the thing on the square picked, however tall: a tree is climbed by a
// drag onto it (Thornbriar, November 10, 2026: elders at 5, shoots at 9 were "Can't walk there").
function endsOnBoxAbove(ending,picked){
 const id=String(ending?.placement?._supportSurfaceId||'');
 return id.startsWith('box-top:')&&!picked?.rampId&&Number.isFinite(ending?.height)&&Number.isFinite(picked?.surfaceElevation)
  &&ending.height>=picked.surfaceElevation-.05&&(id.startsWith('box-top:obj:')||ending.height-picked.surfaceElevation<=4);
}
function pickedSurfaceReached(ending,picked){
 if(ending?.canonicalCompatible===false)return false;
 if(picked.rampId){
  const ramp=(importedDesign()?.ramps||[]).find(r=>r.id===picked.rampId),ghost=ending?.placement;
  return !!ramp&&!!ghost&&ghost._floorTraversal?.stairId===ramp.id&&rampCarries(ramp,ghost)
   &&Number.isFinite(ending.height)&&Math.abs(ending.height-picked.surfaceElevation)<=.55
   &&rampTargetHeight(ramp.id,ghost)!==null;
 }

 // The 3D board cannot pick the top of an object (a barricade, a cart, casks): the pointer finds the ground under
 // it. A walk that ends on top of one, on the square that was picked, has reached it; the move then asks to climb
 // onto it, as the 2D board does (Brandon, October 16, 2026: climbing works on the 2D board and must on the 3D one).
 if(endsOnBoxAbove(ending,picked))return true;
 if(!Number.isFinite(ending?.height)||Math.abs(ending.height-picked.surfaceElevation)>.55)return false;
 const ghost=ending.placement;
 if(picked.surfaceId&&ghost?._supportSurfaceId!==picked.surfaceId){
  // stairStep leaves support acquisition to the accepted landing. Verify that
  // exact native plate at the exit without changing the ghost's canonical data.
  const surface=ending.stairExit&&!ghost?._floorTraversal?resolveSupportSurfaces(importedDesign()).find(s=>s.id===picked.surfaceId):null;
  const cuts=(levelConfig()?.levels||[]).find(l=>l.id===ghost?.levelId)?.cutouts||[];
  if(!surface||surface.levelId!==ghost.levelId||!intersectsFloor(ghost,surface,cuts))return false;
 }
 if(picked.levelId&&(ghost?.levelId||'level-0')!==picked.levelId){
  // The native ghost retains its old floor after an unsupported ground fall.
  if(picked.levelId!=='level-0'||ghost?._supportSurfaceId||ghost?._floorTraversal)return false;
 }
 return true;
}
// A surface pick supplies the destination that the flat native picker cannot:
// enter one real connected stair, leave its far end, then walk across that floor.
// The server resolves only one stair transition per command, so do not chain
// floors here. Every leg still uses its native footing and wall calculations.
// Partial ramp picks enter this exact stair from the actor's own floor. Merely
// matching its visual height is insufficient: native upper-floor sampling also
// recognizes a side/barrier entry, which must not become a walking shortcut.
function partialRampCorners(placement,column,row,picked,existing){
 const ramps=importedDesign()?.ramps||[],ramp=ramps.find(r=>r.id===picked.rampId);
 const hero={column:placement.column,row:placement.row},target={column,row};
 if(!ramp||rampTargetHeight(ramp.id,{...placement,...target})===null)return null;
 const reaches=points=>pickedSurfaceReached(walkEnding(placement,[hero,...points,target]),picked);
 const blocked=points=>window.wallPrototype?.blockedMove?.(placement,{column,row,path:points});
 if(reaches(existing||[])&&!blocked(existing||[]))return existing;
 const levelId=placement.levelId||'level-0',mapLevels=levelConfig();
 if(levelId!==ramp.fromLevel&&levelId!==ramp.toLevel)return null;
 const stairs=levelId==='level-0'?mapLevels.baseStairs:(mapLevels.levels||[]).find(l=>l.id===levelId)?.stairs;
 const stair=(stairs||[]).find(s=>s.id===ramp.id);
 if(!stair)return null;
 const ends=stairEnds(stair.corners,buildStairPerimeter(stair.corners).map(s=>({...s,colour:resolveSegmentColor(stair.edgeColors,s.id)})));
 if(!ends)return null;
 const opposite={north:'south',south:'north',east:'west',west:'east'};
 const near=stair.direction==='down'?opposite[ends.footSide]:ends.footSide,vertical=near==='north'||near==='south';
 const size=Math.max(placement.width||1,placement.height||1),lo=vertical?ends.left:ends.top,hi=Math.max(lo,(vertical?ends.right:ends.bottom)-size);
 const clamp=n=>Math.max(lo,Math.min(hi,n)),same=(a,b)=>a.column===b.column&&a.row===b.row;
 const lanes=[...new Set([clamp(vertical?column:row),clamp(vertical?hero.column:hero.row),lo,hi])],candidates=[];
 for(const lane of lanes){
  const entry=near==='north'?{column:lane,row:ends.top-1}:near==='south'?{column:lane,row:ends.bottom}:near==='west'?{column:ends.left-1,row:lane}:{column:ends.right,row:lane};
  // A diagonal footprint can clip the rock beside its starting cell. Try a
  // single local departure step before the entry chord; every leg still has
  // to retain support and pass the full native wall check.
  const departures=[{column:hero.column-1,row:hero.row},{column:hero.column+1,row:hero.row},{column:hero.column,row:hero.row-1},{column:hero.column,row:hero.row+1}];
  for(const turn of [null,{column:hero.column,row:entry.row},{column:entry.column,row:hero.row},...departures]){
   const approach=[...(turn&&!same(turn,hero)&&!same(turn,entry)?[turn]:[]),...(same(hero,entry)?[]:[entry])];
   const path=[hero,...approach,target],cost=path.slice(1).reduce((sum,p,i)=>sum+Math.max(Math.abs(p.column-path[i].column),Math.abs(p.row-path[i].row)),0);
   if(approach.every(p=>p.column>=0&&p.row>=0))candidates.push({approach,cost});
  }
 }
 candidates.sort((a,b)=>a.cost-b.cost);
 for(const {approach} of candidates){
  let on=placement,valid=true;
  for(const point of approach){
   const step=walkEnding(on,[{column:on.column,row:on.row},point]);
   const expected=levelId===ramp.toLevel?ramp.height:ramp.base;
   if((step.placement?.levelId||'level-0')!==levelId||step.placement?._floorTraversal
    ||(levelId!=='level-0'&&!step.placement?._supportSurfaceId)||Math.abs(step.height-expected)>.55){valid=false;break;}
   on=step.placement;
  }
  if(valid&&reaches(approach)&&!blocked(approach))return approach;
 }
 return null;
}
function connectedSurfaceCorners(placement,column,row,picked,kind,existing){
 if(!Number.isFinite(picked?.surfaceElevation)||!['walk','shift'].includes(kind)||['fly','hover'].includes(placement.movementMode))return existing;
 if(picked.rampId)return partialRampCorners(placement,column,row,picked,existing);
 const hero={column:placement.column,row:placement.row},target={column,row};
 const reaches=points=>pickedSurfaceReached(walkEnding(placement,[hero,...points,target]),picked);
 const carried=(importedDesign()?.ramps||[]).find(r=>r.id===placement._floorTraversal?.stairId&&rampCarries(r,placement));
 if(carried&&reaches([])&&!window.wallPrototype?.blockedMove?.(placement,{column,row,path:[]}))return null;
 if(reaches(existing||[]))return existing;
 if(!picked.levelId||picked.levelId==='level-0')return null; // Preserve intentional ground drops.
 const mapLevels=levelConfig(),levelId=placement.levelId||'level-0';
 const stairs=levelId==='level-0'?mapLevels.baseStairs:(mapLevels.levels||[]).find(l=>l.id===levelId)?.stairs;
 const linked=(mapLevels.levels||[]).find(l=>l.id===picked.levelId);
 if(!linked||linked.hidden)return null;
 const same=(a,b)=>a.column===b.column&&a.row===b.row;
 const distance=(a,b)=>Math.max(Math.abs(a.column-b.column),Math.abs(a.row-b.row));
 const opposite={north:'south',south:'north',east:'west',west:'east'},candidates=[];
 for(const stair of stairs||[]){
  if(stair.linkedLevelId!==picked.levelId)continue;
  const ends=stairEnds(stair.corners,buildStairPerimeter(stair.corners).map(s=>({...s,colour:resolveSegmentColor(stair.edgeColors,s.id)})));
  if(!ends)continue;
  const near=stair.direction==='down'?opposite[ends.footSide]:ends.footSide,far=opposite[near];
  const vertical=near==='north'||near==='south',size=Math.max(placement.width||1,placement.height||1);
  const lo=vertical?ends.left:ends.top,hi=Math.max(lo,(vertical?ends.right:ends.bottom)-size);
  const clamp=n=>Math.max(lo,Math.min(hi,n));
  const lanes=[...new Set([clamp(vertical?hero.column:hero.row),clamp(vertical?column:row),lo,hi])];
  const inFront=(side,lane)=>side==='north'?{column:lane,row:ends.top-1}:side==='south'?{column:lane,row:ends.bottom}:side==='west'?{column:ends.left-1,row:lane}:{column:ends.right,row:lane};
  const resuming=placement._floorTraversal?.stairId===stair.id&&placement._floorTraversal.entry===(stair.direction==='down'?'green':'red')
   &&hero.column>=ends.left&&hero.column<=ends.right-1&&hero.row>=ends.top&&hero.row<=ends.bottom-1;
  for(const lane of lanes){
   const entry=inFront(near,lane),exit=inFront(far,lane);
   const forward={column:exit.column+(far==='west'?-1:far==='east'?1:0),row:exit.row+(far==='north'?-1:far==='south'?1:0)};
   const tails=[[],[forward],[{column:exit.column,row}],[{column,row:exit.row}]];
   for(const tail of tails){
    const raw=[...(resuming||same(hero,entry)?[]:[entry]),exit,...tail];
    const points=raw.filter((p,i)=>!same(p,target)&&(i===0||!same(p,raw[i-1])));
    if(points.some(p=>p.column<0||p.row<0))continue;
    const path=[hero,...points,target],cost=path.slice(1).reduce((sum,p,i)=>sum+distance(path[i],p),0);
    candidates.push({points,entry,exit,tail,resuming,cost,stair});
   }
  }
 }
 candidates.sort((a,b)=>a.cost-b.cost||String(a.stair.id).localeCompare(String(b.stair.id)));
 for(const c of candidates.slice(0,32)){
  // An approach cannot quietly fall/change floors before reaching this stair.
  if(!c.resuming&&!same(hero,c.entry)){
   const approach=walkEnding(placement,[hero,c.entry]);
   if((approach.placement?.levelId||'level-0')!==levelId||approach.placement?._floorTraversal)continue;
   if(levelId!=='level-0'&&!approach.placement?._supportSurfaceId)continue;
   const ramp=(importedDesign()?.ramps||[]).find(r=>r.id===c.stair.id);
   const expected=ramp?(c.stair.direction==='down'?ramp.height:ramp.base):(floorElevations(mapLevels).get(levelId)??0);
   if(!Number.isFinite(approach.height)||Math.abs(approach.height-expected)>.55)continue;
  }
  const crossing=walkEnding(placement,[hero,...(c.resuming||same(hero,c.entry)?[]:[c.entry]),c.exit]);
  if(crossing.placement?.levelId!==c.stair.linkedLevelId||crossing.placement?._floorTraversal)continue;
  // Every continuation leg must remain supported; a later valid endpoint
  // cannot conceal an unsupported earlier leg across an island gap.
  let on=crossing.placement,continuous=true;
  for(const next of [...c.tail,target]){
   if(same(on,next))continue;
   const step=walkEnding(on,[{column:on.column,row:on.row},next]);
   if(!step.placement?._supportSurfaceId||step.placement.levelId!==c.stair.linkedLevelId||Math.abs(step.height-picked.surfaceElevation)>.55){continuous=false;break;}
   on=step.placement;
  }
  if(!continuous)continue;
  if(!reaches(c.points)||window.wallPrototype?.blockedMove?.(placement,{column,row,path:c.points}))continue;
  return c.points;
 }
 return null;
}
function stairRoute(start,hover,explicitActor=null,kind=getCurrentMovementKind()){
 const drag=window.vttDragTarget?.(),placement=explicitActor|| (drag?livePlacement(drag.id):null);if(!placement)return null;
 const dx=placement.column-start.column,dy=placement.row-start.row,column=hover.column+dx,row=hover.row+dy;
 let corners=stairCorners(placement,column,row,kind,Boolean(explicitActor));
 if(explicitActor)corners=connectedSurfaceCorners(placement,column,row,hover,kind,corners);
 return corners?corners.map(c=>({column:c.column-dx,row:c.row-dy})):null;
}
// The squares a drag of this token to a square goes through: his own corners when he has dropped any, else the
// app's (stairCorners), else none.
function rampStanding(design=importedDesign()){return design?.ramps?.length?p=>groundFor(p):null;}
// One step of a previewed walk, for the reach outline: the same contact rule, one square at a time.
function walkTerrain(p){const d=dimensions();return heightAt((ctx.view.gridOffsets.left||0)+(p.column+(p.width||1)/2)*d.grid,(ctx.view.gridOffsets.top||0)+(p.row+(p.height||1)/2)*d.grid);}
function walkSurfaces(){const design=importedDesign();return design?resolveSupportSurfaces(design):[];}
// A stepper for the reach outline around one square. It looks only at the plates within `reach`
// squares and remembers plain ground heights, because the outline asks about every square many
// times. Null when no plate is near: the plain per-square rule is then already right.
function walkerNear(actor,column,row,reach=15){
 const box=s=>({s,left:Math.min(...s.points.map(p=>p.x)),right:Math.max(...s.points.map(p=>p.x)),top:Math.min(...s.points.map(p=>p.y)),bottom:Math.max(...s.points.map(p=>p.y))});
 const near=walkSurfaces().filter(s=>(s.kind==='floor'||s.templateCube)&&s.points?.length>2).map(box).filter(b=>b.left<=column+reach+2&&b.right>=column-reach-1&&b.top<=row+reach+2&&b.bottom>=row-reach-1);
 const mapLevels=levelConfig(),standing=hasStairs(mapLevels)?rampStanding():null;
 if(!walksPlates(actor,near,!!standing))return null;
 const ground=new Map(),size=Math.max(actor.width||1,actor.height||1);
 const plainHeight=(c,r,who)=>{if(who?._supportSurfaceId)return rulerGround(c,r,who);const key=c+','+r;let h=ground.get(key);if(h===undefined){h=rulerGround(c,r,who);ground.set(key,h);}return h;};
 // Only the plates within a square of the step can matter to it. A step nowhere near a plate is plain ground.
 const step=(ghost,c,r)=>{
  const left=Math.min(ghost.column,c)-1,right=Math.max(ghost.column,c)+size+1,top=Math.min(ghost.row,r)-1,bottom=Math.max(ghost.row,r)+size+1;
  const local=near.filter(b=>b.left<=right&&b.right>=left&&b.top<=bottom&&b.bottom>=top).map(b=>b.s);
  // A ghost on or beside a stair, or one a stair has already moved to another floor, takes the full step.
  const stair=standing&&(ghost._floorTraversal||ghost._viaStair||nearStair(ghost,{column:c,row:r},mapLevels));
  if(!local.length&&!stair)return {ghost:{...ghost,column:c,row:r,_supportSurfaceId:null},height:plainHeight(c,r,{...actor,_supportSurfaceId:null})};
  return stepGhost({ghost,column:c,row:r,actor,surfaces:local,mapLevels,terrain:walkTerrain,plainHeight,standing});
 };
 return {plainHeight,step};
}
// Every leg of a route, walked in order with the walker carried from leg to leg.
function routeLegs(points,actor=null){const carry={},legs=[];for(let k=1;k<points.length;k++)legs.push(route(points[k-1],points[k],{carry,...(actor?{actor}:{})}).points);return legs;}
// The drawn line through walked steps. It follows the ground as before, except where the walker
// is on a plate above (or below) the ground: there it follows the height it actually walks at.
function stepsWorldPoints(steps){
 const actor=rulerActor(),points=[];
 for(let i=0;i<steps.length;i++){
  const a=steps[Math.max(0,i-1)],b=steps[i],count=i?4:1;
  for(let j=1;j<=count;j++){
   const col=a.column+(b.column-a.column)*j/count,row=a.row+(b.row-a.row)*j/count;
   const ground=rulerGround(col,row,actor),walkedAt=Number.isFinite(a.rawHeight)&&Number.isFinite(b.rawHeight)?a.rawHeight+(b.rawHeight-a.rawHeight)*j/count:ground;
   points.push({x:col+.5,y:row+.5,z:a.exactWalk&&b.exactWalk?walkedAt:Math.abs(walkedAt-ground)>.3?walkedAt:ground});
  }
 }
 return points;
}
function movementPresentation(points,forced=false,actor=null){
 const pieces=[];
 for(const steps of forced?forcedLegs(points):routeLegs(points,actor))for(let i=1;i<steps.length;i++){
  const a=steps[i-1],b=steps[i],distance=Math.max(Math.abs(b.column-a.column),Math.abs(b.row-a.row));
  pieces.push({points:stepsWorldPoints([a,b]),color:slopeColor((b.rawHeight-a.rawHeight)/(distance||1))});
 }
 return pieces;
}
function squarePresentation(from,at,next){return [...stepsWorldPoints([from,at]),...(next?stepsWorldPoints([at,next]):[])].slice(2,next?8:5);}
// A forced move goes straight (forced-line.mjs): each leg is the true line from where it starts to where it ends
// (one leg for a push or a pull; a slide has a leg to each corner), at the height the creature travels at, which is
// the line the move itself takes. No walk: it steps onto nothing.
function forcedLegs(points){
 const actor=rulerActor(),legs=[];
 for(let k=1;k<points.length;k++){
  const start=points[k-1],end=points[k];
  const from=actor?(start.column===actor.column&&start.row===actor.row?actor:{...actor,column:start.column,row:start.row}):null;
  legs.push(straightLine(start,end).map(p=>{const z=from?forcedHeight(from,p.column,p.row):null;return {...p,rawHeight:z??rulerGround(Math.round(p.column),Math.round(p.row),actor)};}));
 }
 return legs;
}
// Where the leg being held starts: the creature's own square, or the last corner dropped in this drag.
// The height a creature is at when a forced move has carried it to a square (travel-height.mjs, by way of the walls).
function forcedHeight(from,column,row){const z=window.wallPrototype?.moverHeight?.(from,{...from,column,row},'forced');return Number.isFinite(z)?z:null;}
let markerPreferenceKey='',markersVisible=true;
function setMarkersVisible(value){markersVisible=!!value;if(markerPreferenceKey)localStorage.setItem(markerPreferenceKey,String(markersVisible));}
function fieldHash(){let hash=2166136261;for(const byte of new Uint8Array(field.h.buffer,field.h.byteOffset,field.h.byteLength))hash=Math.imul(hash^byte,16777619);return hash;}
// The arrow's colour for how steep the climb is, from dark green (gentle) to pale red (steepest).
function slopeArrowColor(rise){
 const stops=[[.3,[20,90,40]],[1,[144,224,144]],[2,[255,242,145]],[3,[180,145,0]],[4,[153,27,27]],[6,[255,150,150]]];
 for(let i=1;i<stops.length;i++)if(rise<=stops[i][0]){
  const [lo,a]=stops[i-1],[hi,b]=stops[i],t=(rise-lo)/(hi-lo);
  return a.map((c,j)=>Math.round(c+(b[j]-c)*t));
 }
 return stops.at(-1)[1];
}
// 3D board (board3d/layers/slope-arrows.mjs): the same arrows as drawCostMarkers, in squares. x,y is the arrow's
// middle, dx,dy the way uphill, color its grade's colour. The same list is handed back until the ground changes.
let slopeMarkCache='',slopeMarkList=[];
function slopeMarks(){
 if(!field||!active||!ctx?.view)return [];
 const d=dimensions(),g=d.grid,ox=ctx.view.gridOffsets.left||0,oy=ctx.view.gridOffsets.top||0;
 const cache=JSON.stringify([key,fieldHash(),field.n,field.m,d,ox,oy]);if(cache===slopeMarkCache)return slopeMarkList;slopeMarkCache=cache;
 const minCol=Math.ceil((d.left-ox)/g),minRow=Math.ceil((d.top-oy)/g),maxCol=Math.floor((d.left+d.width-ox)/g),maxRow=Math.floor((d.top+d.height-oy)/g),list=[];
 for(let row=minRow;row<maxRow;row++)for(let col=minCol;col<maxCol;col++){
  const shape=slopeIndicator(col+.5,row+.5,(x,y)=>heightAt(ox+x*g,oy+y*g),(x,y)=>x>=minCol&&x<maxCol&&y>=minRow&&y<maxRow);
  if(shape)list.push({x:col+.5+shape.dx*.25,y:row+.5+shape.dy*.25,dx:shape.dx,dy:shape.dy,color:slopeArrowColor(shape.grade)});
 }
 slopeMarkList=list;return list;
}
window.addEventListener('storage',e=>{if(e.key===key&&!drawing){key='';}});
// For what is drawn by hand on the map (drawing-tool.js). floorUnder: the height of the floor drawn under a point
// of the board, 0 for the ground or a stair, null on a map with no built floors. heightShown: whether a floor of
// that height is drawn for whoever is looking at this page (the same test the picture itself uses).
// The 3D board's choice among the surfaces under the pointer (board3d/surface-choice.mjs): does a straight walk from
// where this token stands end on this surface ({column,row,surfaceElevation,levelId,surfaceId,rampId})? The same walk
// and test as the held token's "Can't walk there". Null when it cannot say: a flier, no imported design, no height.
function walkReaches(who,target){
 const placement=livePlacement(who);
 if(!placement||!importedDesign()||['fly','hover'].includes(placement.movementMode)||!target||!Number.isFinite(target.surfaceElevation))return null;
 const ending=walkEnding(placement,[{column:placement.column,row:placement.row},{column:target.column,row:target.row}]);
 return pickedSurfaceReached(ending,target)===true;
}
function heightShown(z){
 if(!active||!field||!importedDesign())return null;
 const height=Number(z)||0,view=pointerView();
 return height<=0||!view||floorDrawn(height,view);
}
window.terrainPrototype={heightShown,get flightRevision(){return flight.revision;},setTokenHeight:(token,z)=>{if(!Number.isFinite(z)||z<0||z>1000000)throw Error('Height must be between 0 and 1000000.');return window.submitFlightHeight(token,z);},setMarkersVisible,slopeMarks,get markersVisible(){return markersVisible;},stairRoute,walkEnding,pickedSurfaceReached,walkReaches,rampTargetHeight,heightAt,groundFor,landingHeight,movementGroundFor,movementPlacement,highGround,isCliff,climbFace,walkerNear,get design(){return importedDesign();},route,rulerPass,movementPresentation,squarePresentation,get revision(){return terrainRevision;},get viewerHeight(){return viewerHeight;},refresh:()=>{dirty=true;},get field(){return field;},get fieldVersion(){return fieldVersion;},get brush3d(){return panel.hidden?null:brush3d;},get key(){return key;},get storageError(){return storageError;},get active(){return active;}};
requestAnimationFrame(tick);

import('./wall-prototype.js');
