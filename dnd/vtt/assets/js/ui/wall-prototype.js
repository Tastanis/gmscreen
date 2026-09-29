import {wallCubeModel} from './wall-cubes.js';
import {forcedTerrainBlocked} from './forced-flight-terrain.js';
import {shareRoofImages} from './roof-images.mjs';
import {sharedField,saveShared,acknowledgedRevision} from './environment-sync.mjs';
import {rampAt,rampHeight,rampPick,rampGround,rampSupports,rampLanding} from './imported-ramps.mjs';
import './edit-tools.js';
import {connectedWallPath} from './wall-selection.mjs';
import {properties,movementPathBlocked,movementBlocked,wallHeights} from './wall-properties.mjs';
import {createWallEditor} from './wall-editor.mjs';
import './vision-prototype.js';
import {claimActiveTool,publishActiveTool} from './active-tool.js';
import {emptyWalls,copyWalls,validateWalls,connect,split,merge,removeSelection,nearestOnSegment,blocksSight} from './wall-geometry.mjs';
const $=s=>document.querySelector(s),ns='http://www.w3.org/2000/svg',uid=()=>crypto.randomUUID();
const board=$('#vtt-board-canvas'),surface=$('#vtt-map-surface'),transform=$('#vtt-map-transform');
const button=document.createElement('button');button.className='btn';button.type='button';button.textContent='Walls';button.dataset.action='terrain-walls';button.setAttribute('aria-expanded','false');$('[data-action="terrain-height"]').after(button);
const style=document.createElement('style');style.textContent=`
 [data-action="terrain-walls"]{grid-column:3;grid-row:4}.vtt-board__actions:has([data-action="terrain-walls"]:not([hidden])){width:21.3rem}
 #wall-panel{position:absolute;left:58px;top:12px;width:228px;padding:14px;z-index:90;border:1px solid #777;border-radius:8px;background:var(--panel-bg,#24252b);color:var(--text-color,#eee);box-shadow:0 6px 24px #0007}#wall-panel[hidden]{display:none}
 #wall-panel header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}#wall-panel .wall-tools{display:grid;grid-template-columns:1fr 1fr;gap:6px}#wall-panel footer{display:flex;gap:6px;margin-top:12px}#wall-panel [aria-pressed=true]{outline:2px solid #d9ba6d;outline-offset:1px}
 `;document.head.append(style);
const panel=document.createElement('aside');panel.id='wall-panel';panel.hidden=true;panel.setAttribute('aria-label','Walls');panel.innerHTML='<header><strong>Walls</strong><button class="btn" type="button" aria-label="Close walls">×</button></header><footer><button class="btn" data-wall-delete disabled>Delete</button><button class="btn" data-wall-undo disabled>Undo</button></footer>';board.parentElement.append(panel);
const snapLabel=document.createElement('label');snapLabel.innerHTML='<input type="checkbox" data-wall-snap> Snap to grid';panel.insertBefore(snapLabel,panel.querySelector('footer'));
const snapInput=snapLabel.querySelector('input');snapInput.checked=localStorage.getItem('wall-half-grid-snap')==='true';snapInput.onchange=()=>localStorage.setItem('wall-half-grid-snap',String(snapInput.checked));
const snapPoint=p=>snapInput.checked?{x:Math.round(p.x*2)/2,y:Math.round(p.y*2)/2}:p;
const editor=createWallEditor({panel,transform,selected:()=>selectedEdges(),model:()=>model,context:()=>context,projected,groundAt,change,render,copyWalls});
const svg=document.createElementNS(ns,'svg');svg.id='wall-overlay';svg.style.cssText='position:absolute;inset:0;overflow:visible;pointer-events:none;z-index:35';transform.append(svg);
let sharedRevision=-1,savingShared=false,dirtyWhileSaving=false;
let cubeSignature='';
let revision=0;const selectedIds=new Set();let propertiesOpen=false,rangeStart=null,portalSignature='';
const selectedEdges=()=>model.segments.filter(e=>selectedIds.has(e.id));
let context=null,model=emptyWalls(),key='',history=[],selection=null,anchor=null,hover=null,drag=null,signature='',storedError=false;
const pointNode=id=>model.nodes.find(n=>n.id===id);
function storageKey(c){return JSON.stringify([c.state.boardState.activeSceneId,c.state.boardState.mapUrl]);}
function save(){
 if(storedError)return;if(savingShared){dirtyWhileSaving=true;return;}
 const savingKey=key,savingScene=context.state.boardState.activeSceneId,expected=Math.max(0,sharedRevision),draft=copyWalls(model);
 savingShared=true;dirtyWhileSaving=false;
 shareRoofImages(draft).then(value=>saveShared('walls',value,expected,savingScene)).then(result=>{
   if(key===savingKey)sharedRevision=acknowledgedRevision(result,'walls')??sharedRevision;
 }).catch(e=>{if(key!==savingKey)return;storedError=true;console.error(e);alert('Map edit was not confirmed. Your draft is retained in this tab; reload to recover the shared map.');}).finally(()=>{
   savingShared=false;if(key===savingKey&&dirtyWhileSaving&&!storedError)save();
 });
}

function change(before){if(JSON.stringify(before)===JSON.stringify(model))return;history.push(before);if(history.length>60)history.shift();save();render();}
function gridPoint(event){const v=context.view,r=surface.getBoundingClientRect();let p={x:(event.clientX-r.left-v.translation.x)/v.scale,y:(event.clientY-r.top-v.translation.y)/v.scale};if(window.terrainPrototype?.active)p=terrainPrototype.unproject(p);return {x:(p.x-(v.gridOffsets.left||0))/v.gridSize,y:(p.y-(v.gridOffsets.top||0))/v.gridSize};}
function projected(p){const v=context.view,x=(v.gridOffsets.left||0)+p.x*v.gridSize,y=(v.gridOffsets.top||0)+p.y*v.gridSize;return window.terrainPrototype?.active?terrainPrototype.project(x,y,terrainPrototype.heightAt(x,y)):{x,y};}
function pointerPixel(event){const v=context.view,r=surface.getBoundingClientRect();return {x:(event.clientX-r.left-v.translation.x)/v.scale,y:(event.clientY-r.top-v.translation.y)/v.scale};}
function inside(p){const v=context.view,img=$('#vtt-map-image'),x=(v.gridOffsets.left||0)+p.x*v.gridSize,y=(v.gridOffsets.top||0)+p.y*v.gridSize;return x>=v.mapInsets.left&&y>=v.mapInsets.top&&x<=v.mapInsets.left+img.naturalWidth&&y<=v.mapInsets.top+img.naturalHeight;}
function hit(event,{excludeNodes=[],excludeEdges=[]}={}){
 const p=pointerPixel(event),radius=10/context.view.scale;let found=null,best=6/context.view.scale;
 for(const n of model.nodes){if(excludeNodes.includes(n.id))continue;const q=projected(n),d=Math.hypot(p.x-q.x,p.y-q.y);if(d<best){best=d;found={kind:'node',id:n.id,p:{x:n.x,y:n.y}};}}
 if(found)return found;best=radius;
 for(const e of model.segments){if(excludeEdges.includes(e.id))continue;const a=pointNode(e.a),b=pointNode(e.b),steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)*4));let previous=projected(a);
   for(let i=1;i<=steps;i++){const t=i/steps,next=projected({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t}),q=nearestOnSegment(p,previous,next),d=Math.hypot(q.x-p.x,q.y-p.y);if(d<best){best=d;const u=(i-1+q.t)/steps;found={kind:'segment',id:e.id,p:{x:a.x+(b.x-a.x)*u,y:a.y+(b.y-a.y)*u}};}previous=next;}
 }
 return found;
}
function materialize(target,p){if(target?.kind==='node')return target.id;if(target?.kind==='segment')return split(model,target.id,target.p,uid(),uid());const id=uid();model.nodes.push({id,x:p.x,y:p.y});return id;}
function cancelDrag(){if(drag){model=drag.before;drag=null;render();}}
function setOpen(open){if(open&&!context?.isGM)return;propertiesOpen=false;rangeStart=null;cancelDrag();anchor=null;hover=null;selection=null;selectedIds.clear();panel.hidden=!open;button.setAttribute('aria-expanded',String(open));if(open){claimActiveTool('walls',()=>setOpen(false));publishActiveTool('walls','Walls');}else publishActiveTool('walls');render();}
button.onclick=()=>setOpen(panel.hidden);panel.querySelector('header button').onclick=()=>{if(propertiesOpen){propertiesOpen=false;render();}else setOpen(false);};

function remove(){if(!context?.isGM)return;if(!selection&&!selectedIds.size)return;cancelDrag();const before=copyWalls(model);if(selectedIds.size){for(const id of selectedIds)removeSelection(model,{kind:'segment',id});}else removeSelection(model,selection);selectedIds.clear();selection=null;anchor=null;change(before);}
function undo(){if(!context?.isGM)return;propertiesOpen=false;rangeStart=null;cancelDrag();if(!history.length)return;model=history.pop();selectedIds.clear();selection=null;anchor=null;hover=null;save();render();}
panel.querySelector('[data-wall-delete]').onclick=remove;panel.querySelector('[data-wall-undo]').onclick=undo;
function consume(e){e.preventDefault();e.stopImmediatePropagation();}
board.addEventListener('pointerdown',event=>{
 if(panel.hidden||!context?.isGM||storedError)return;
 if(event.button===2){if(anchor){anchor=null;hover=null;render();}return;}
 if(event.button!==0)return;
 consume(event);const p=snapPoint(gridPoint(event)),target=hit(event);if(!inside(p)&&!target)return;
 // An unfinished segment takes priority over selection. Ctrl bypasses linking.
 if(anchor||!target||event.ctrlKey){
  propertiesOpen=false;selectedIds.clear();rangeStart=null;const before=copyWalls(model),snap=!event.ctrlKey&&target?.kind==='node'?target:null,id=materialize(snap,p);
  if(anchor){if(id===anchor)return;connect(model,anchor,id,uid());anchor=event.shiftKey?id:null;}else anchor=id;
  selection=anchor?{kind:'node',id}:null;hover=null;change(before);render();return;
 }
 selection={kind:target.kind,id:target.id};
 if(target.kind==='segment'){
  if(event.shiftKey){if(!rangeStart)rangeStart=[...selectedIds][0]||target.id;selectedIds.add(target.id);}
  else if(!selectedIds.has(target.id)){selectedIds.clear();selectedIds.add(target.id);rangeStart=target.id;propertiesOpen=false;}
 }else{selectedIds.clear();rangeStart=null;propertiesOpen=false;}
 const ids=selection.kind==='node'?[selection.id]:[...new Set(selectedEdges().flatMap(e=>[e.a,e.b]))];
 drag={before:copyWalls(model),start:p,ids,pointerId:event.pointerId,moved:false};board.setPointerCapture(event.pointerId);render();
},true);
board.addEventListener('pointermove',event=>{
 if(panel.hidden||!context?.isGM||(event.buttons&2))return;
 if(drag){consume(event);const p=gridPoint(event),dx=p.x-drag.start.x,dy=p.y-drag.start.y;
  if(!drag.moved&&Math.hypot(dx,dy)*context.view.gridSize*context.view.scale<3)return;
  drag.moved=true;const moved=drag.ids.map(id=>{const old=drag.before.nodes.find(n=>n.id===id);return {id,...(selection.kind==='node'?snapPoint({x:old.x+dx,y:old.y+dy}):{x:old.x+dx,y:old.y+dy})};});if(moved.some(p=>!inside(p)))return;
  for(const n of moved)Object.assign(pointNode(n.id),n);
  const near=!event.ctrlKey&&selection.kind==='node'?hit(event,{excludeNodes:drag.ids,excludeEdges:model.segments.map(e=>e.id)}):null;hover=near?.kind==='node'?near:null;render();
 }else if(anchor){const near=!event.ctrlKey?hit(event):null;hover=near?.kind==='node'?near:{p:snapPoint(gridPoint(event))};render();}
},true);
board.addEventListener('pointerup',event=>{
 if(event.button!==0||!drag)return;consume(event);const completed=drag;
 if(completed.moved&&selection.kind==='node'&&!event.ctrlKey){const near=hit(event,{excludeNodes:drag.ids,excludeEdges:model.segments.map(e=>e.id)});if(near?.kind==='node'){merge(model,selection.id,near.id);selection={kind:'node',id:near.id};}}
 drag=null;hover=null;if(board.hasPointerCapture(event.pointerId))board.releasePointerCapture(event.pointerId);change(completed.before);render();
},true);
board.addEventListener('dblclick',event=>{
 if(panel.hidden||!context?.isGM||storedError||event.button!==0)return;const target=hit(event);if(target?.kind!=='segment')return;consume(event);anchor=null;hover=null;
 if(event.shiftKey){const first=rangeStart||[...selectedIds][0];for(const id of connectedWallPath(model,first,target.id))selectedIds.add(id);}
 else{if(!selectedIds.has(target.id)){selectedIds.clear();selectedIds.add(target.id);}propertiesOpen=true;}
 selection={kind:'segment',id:target.id};render();
},true);
board.addEventListener('pointercancel',cancelDrag,true);board.addEventListener('lostpointercapture',cancelDrag,true);window.addEventListener('blur',cancelDrag);
board.addEventListener('contextmenu',e=>{if(!panel.hidden)consume(e);},true);
document.addEventListener('keydown',e=>{
 if(panel.hidden||!context?.isGM||e.target.closest('input,textarea,select,[contenteditable=true]'))return;
 if(e.key==='Shift'&&!e.repeat&&!drag&&!anchor&&selection?.kind==='node'){consume(e);anchor=selection.id;hover={p:{...pointNode(anchor)}};propertiesOpen=false;render();return;}
 if(e.key==='Escape'){consume(e);if(propertiesOpen){propertiesOpen=false;render();}else if(drag)cancelDrag();else if(anchor){anchor=null;hover=null;render();}else setOpen(false);}
 else if(e.key==='Delete'||e.key==='Backspace'){consume(e);remove();}
 else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){consume(e);undo();}
},true);
function pathBetween(a,b){const steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)*4)),parts=[];for(let i=0;i<=steps;i++){const p=projected({x:a.x+(b.x-a.x)*i/steps,y:a.y+(b.y-a.y)*i/steps});parts.push(`${i?'L':'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`);}return parts.join(' ');}
function render(){
 revision++;
 if(!context)return;svg.style.display=context.isGM?'':'none';svg.setAttribute('width',context.view.mapPixelSize.width);svg.setAttribute('height',context.view.mapPixelSize.height);
 const scale=context.view.scale||1,fragment=document.createDocumentFragment();
 for(const e of model.segments){const path=document.createElementNS(ns,'path');path.dataset.wallSegment=e.id;path.setAttribute('d',pathBetween(pointNode(e.a),pointNode(e.b)));path.setAttribute('fill','none');path.setAttribute('stroke',selectedIds.has(e.id)?'#ffeeb5':editor.color(e));path.setAttribute('stroke-width',3/scale);path.setAttribute('stroke-linecap','round');if(properties(e).sight==='pass'||e.open)path.setAttribute('stroke-dasharray',`${6/scale} ${4/scale}`);path.setAttribute('opacity',panel.hidden?'.45':'.95');fragment.append(path);if(!panel.hidden)editor.directions(fragment,e,pointNode(e.a),pointNode(e.b),scale);}
 if(!panel.hidden){
   if(anchor&&pointNode(anchor)&&hover){const preview=document.createElementNS(ns,'path');preview.setAttribute('d',pathBetween(pointNode(anchor),hover.p));preview.setAttribute('fill','none');preview.setAttribute('stroke','#fff0ba');preview.setAttribute('stroke-width',2/scale);preview.setAttribute('stroke-dasharray',`${5/scale} ${4/scale}`);fragment.append(preview);}
   for(const n of model.nodes){const p=projected(n),circle=document.createElementNS(ns,'circle');circle.dataset.wallNode=n.id;circle.setAttribute('cx',p.x);circle.setAttribute('cy',p.y);circle.setAttribute('r',(selection?.id===n.id||hover?.id===n.id?6:4)/scale);circle.setAttribute('fill',selection?.id===n.id||hover?.id===n.id?'#ffeeb5':'#27241e');circle.setAttribute('stroke','#e7ca88');circle.setAttribute('stroke-width',1.5/scale);fragment.append(circle);}
 }
 editor.refresh(propertiesOpen);svg.replaceChildren(fragment);panel.querySelector('[data-wall-delete]').disabled=!selection&&!selectedIds.size;panel.querySelector('[data-wall-undo]').disabled=!history.length;
 editor.portals();
}
function tick(){
 try {
 const c=window.terrainContext?.();if(c?.view.mapLoaded){
   const nextKey=storageKey(c);if(nextKey!==key){cancelDrag();context=c;key=nextKey;sharedRevision=-1;history=[];propertiesOpen=false;rangeStart=null;selectedIds.clear();selection=null;anchor=null;hover=null;storedError=false;model=emptyWalls();render();}else context=c;
   const shared=sharedField('walls');if(!savingShared&&!drag&&!anchor&&!storedError&&shared&&shared.revision!==sharedRevision){model=validateWalls(shared.value);sharedRevision=shared.revision;history=[];render();}
   button.hidden=!c.isGM;button.disabled=storedError;if(!c.isGM&&!panel.hidden)setOpen(false);
   const cubeKey=JSON.stringify([c.state.boardState.templates?.[c.state.boardState.activeSceneId]||[],c.state.boardState.sceneState?.[c.state.boardState.activeSceneId]?.mapLevels]);if(cubeKey!==cubeSignature){cubeSignature=cubeKey;revision++;}
   const next=JSON.stringify([c.isGM,c.view.scale,c.view.gridSize,c.view.gridOffsets,c.view.mapPixelSize,terrainPrototype?.revision||0]);if(next!==signature){signature=next;render();}
 }else {svg.style.display='none';button.disabled=true;}
 const ps=JSON.stringify([panel.hidden,window.visionPrototype?.stats.paints,revision,context?.isGM]);if(ps!==portalSignature){portalSignature=ps;editor.portals();}
 } catch(error) {
   if(!storedError){console.error('Shared wall rendering failed',error);if(context?.isGM)alert('Shared walls could not be loaded. Editing is disabled; the last valid walls are retained.');}
   storedError=true;button.disabled=true;
 } finally { requestAnimationFrame(tick); }
}
window.addEventListener('storage',e=>{if(e.key===key){cancelDrag();key='';}});
let cubeModelRevision=-1,cachedCubeModel=null;
function activeModel(){
 if(!context)return model;
 if(cubeModelRevision!==revision){cachedCubeModel=wallCubeModel(model,context.state.boardState.templates?.[context.state.boardState.activeSceneId]||[],context.state.boardState.sceneState?.[context.state.boardState.activeSceneId]||{},groundAt);cubeModelRevision=revision;}
 return cachedCubeModel;
}
function groundAt(x,y){const v=context.view;return terrainPrototype.heightAt((v.gridOffsets.left||0)+x*v.gridSize,(v.gridOffsets.top||0)+y*v.gridSize);}
window.wallPrototype={get selectedTopHeight(){
 if(!context?.isGM||panel.hidden||selection?.kind!=='segment')return null;
 const edge=model.segments.find(e=>e.id===selection.id);if(!edge)return null;
 const a=pointNode(edge.a),b=pointNode(edge.b);
 return wallHeights(edge,a,b,{x:(a.x+b.x)/2,y:(a.y+b.y)/2},groundAt).top;
},forcedBlockedMove:(from,to)=>!!context&&(forcedTerrainBlocked(from,to,groundAt,t=>terrainPrototype.groundFor(t))||movementBlocked(activeModel(),from,to,(t,origin)=>terrainPrototype.movementGroundFor(origin,t),groundAt)),blockedMove:(from,to)=>!!context&&!context.isGM&&(from.levelId||'level-0')===(context.levelId||'level-0')&&movementPathBlocked(activeModel(),from,to,(t,origin)=>terrainPrototype.movementGroundFor(origin,t),groundAt,(a,b)=>terrainPrototype.movementPlacement(a,b)),get saving(){return savingShared;},get revision(){return revision;},get model(){return activeModel();},get key(){return key;},blocksSight:(a,b)=>blocksSight(activeModel(),a,b)};
requestAnimationFrame(tick);
