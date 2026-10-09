import {wallCubeModel} from './wall-cubes.js';
import {forcedTerrainBlocked} from './forced-flight-terrain.js';
import {shareRoofImages} from './roof-images.mjs';
import {sharedField,saveShared,acknowledgedRevision} from './environment-sync.mjs';
import {rampAt,rampHeight,rampPick,rampGround,rampSupports,rampLanding} from './imported-ramps.mjs';
import './edit-tools.js';
import {connectedWallPath} from './wall-selection.mjs';
import {properties,movementPathBlocked,movementBlocked,wallHeights,liveWalls,isBreakable,isBroken} from './wall-properties.mjs';
import {createWallEditor} from './wall-editor.mjs';
import {DEFAULT_SLANT,validSlant,viewSlant} from './height-view.mjs';
import {gmVision} from './gm-vision.js';
import {sliceWallModel,wallHeightIntervals,inspectionPlanePoint} from './wall-height-slice.mjs';
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
const repairAll=document.createElement('button');repairAll.className='btn';repairAll.type='button';repairAll.dataset.wallRepairAll='';repairAll.textContent='Repair all broken walls';repairAll.style.cssText='margin-top:8px;width:100%';repairAll.hidden=true;panel.insertBefore(repairAll,panel.querySelector('footer'));
// How steeply this scene shows height (height-view.mjs). Saved with the map design, so it is the same for everyone.
const slantLabel=document.createElement('label');slantLabel.style.cssText='display:block;margin-top:8px';slantLabel.title='How far a square of height moves a thing up the screen. 0.36 is the usual view; 0 is straight overhead.';
slantLabel.innerHTML='Height slant <input type="number" data-wall-slant min="0" max="'+DEFAULT_SLANT+'" step="0.01" style="width:64px;margin-left:6px">';panel.insertBefore(slantLabel,panel.querySelector('footer'));
const slantInput=slantLabel.querySelector('input');
slantInput.onchange=()=>{if(!context?.isGM)return;const value=Math.round(Number(slantInput.value)*100)/100;if(!validSlant(value)||slantInput.value===''){slantInput.value=String(viewSlant(model));return;}
 cancelDrag();const before=copyWalls(model);if(value===DEFAULT_SLANT){if(model.view){delete model.view.slant;if(!Object.keys(model.view).length)delete model.view;}}else model.view={...(model.view||{}),slant:value};change(before);};
repairAll.onclick=()=>{if(!context?.isGM||!model.segments.some(isBroken))return;cancelDrag();const before=copyWalls(model);for(const edge of model.segments)if(isBroken(edge))delete edge.broken;change(before);};
const editor=createWallEditor({panel,transform,selected:()=>selectedEdges(),model:()=>model,context:()=>context,projected,groundAt,change,render,copyWalls});
const svg=document.createElementNS(ns,'svg');svg.id='wall-overlay';svg.style.cssText='position:absolute;inset:0;overflow:visible;pointer-events:none;z-index:100003';transform.append(svg);
let sharedRevision=-1,savingShared=false,dirtyWhileSaving=false;
let cubeSignature='',cubeInputs=null;
let revision=0;const selectedIds=new Set();let propertiesOpen=false,rangeStart=null,portalSignature='';
const selectedEdges=()=>{synchronizeInspectionHeight();return model.segments.filter(e=>selectedIds.has(e.id));};
let context=null,model=emptyWalls(),key='',history=[],selection=null,anchor=null,hover=null,drag=null,signature='',storedError=false;
let inspectionHeight=null,sliceCache=null,sliceRevision=-1,sliceTerrainRevision=-1;
function synchronizeInspectionHeight(){
 const next=context?.isGM?gmVision.height:null;if(next===inspectionHeight)return false;
 inspectionHeight=next;
 if(drag){const old=drag;model=old.before;drag=null;if(board.hasPointerCapture(old.pointerId))board.releasePointerCapture(old.pointerId);}
 selectedIds.clear();selection=null;anchor=null;hover=null;rangeStart=null;propertiesOpen=false;sliceCache=null;
 return true;
}
function visibleSlice(){
 const terrainRevision=window.terrainPrototype?.revision||0;
 if(!sliceCache||sliceRevision!==revision||sliceTerrainRevision!==terrainRevision){sliceCache=sliceWallModel(model,inspectionHeight,groundAt);sliceRevision=revision;sliceTerrainRevision=terrainRevision;}
 return sliceCache;
}
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
function gridPoint(event){const v=context.view,r=surface.getBoundingClientRect();let p={x:(event.clientX-r.left-v.translation.x)/v.scale,y:(event.clientY-r.top-v.translation.y)/v.scale};if(window.terrainPrototype?.active)p=context.isGM?inspectionPlanePoint(p,gmVision.height,(x,y,h)=>terrainPrototype.project(x,y,h)):terrainPrototype.unproject(p);return {x:(p.x-(v.gridOffsets.left||0))/v.gridSize,y:(p.y-(v.gridOffsets.top||0))/v.gridSize};}
function projected(p){const v=context.view,x=(v.gridOffsets.left||0)+p.x*v.gridSize,y=(v.gridOffsets.top||0)+p.y*v.gridSize;return window.terrainPrototype?.active?terrainPrototype.project(x,y,context.isGM?gmVision.height:terrainPrototype.heightAt(x,y)):{x,y};}
function pointerPixel(event){const v=context.view,r=surface.getBoundingClientRect();return {x:(event.clientX-r.left-v.translation.x)/v.scale,y:(event.clientY-r.top-v.translation.y)/v.scale};}
function inside(p){const v=context.view,img=$('#vtt-map-image'),x=(v.gridOffsets.left||0)+p.x*v.gridSize,y=(v.gridOffsets.top||0)+p.y*v.gridSize;return x>=v.mapInsets.left&&y>=v.mapInsets.top&&x<=v.mapInsets.left+img.naturalWidth&&y<=v.mapInsets.top+img.naturalHeight;}
function hit(event,{excludeNodes=[],excludeEdges=[]}={}){
 if(synchronizeInspectionHeight())render();
 const slice=visibleSlice();
 const p=pointerPixel(event),radius=10/context.view.scale;let found=null,best=6/context.view.scale;
 for(const n of model.nodes){if(excludeNodes.includes(n.id)||!slice.nodeIds.has(n.id)&&n.id!==anchor)continue;const q=projected(n),d=Math.hypot(p.x-q.x,p.y-q.y);if(d<best){best=d;found={kind:'node',id:n.id,p:{x:n.x,y:n.y}};}}
 if(found)return found;best=radius;
 for(const {edge:e,a,b,intervals} of slice.segments){if(excludeEdges.includes(e.id))continue;
   for(const [lo,hi] of intervals){const previous=projected({x:a.x+(b.x-a.x)*lo,y:a.y+(b.y-a.y)*lo}),next=projected({x:a.x+(b.x-a.x)*hi,y:a.y+(b.y-a.y)*hi}),q=nearestOnSegment(p,previous,next),d=Math.hypot(q.x-p.x,q.y-p.y);if(d<best){best=d;const u=lo+(hi-lo)*q.t;found={kind:'segment',id:e.id,p:{x:a.x+(b.x-a.x)*u,y:a.y+(b.y-a.y)*u}};}}
 }
 return found;
}
function materialize(target,p){if(target?.kind==='node')return target.id;if(target?.kind==='segment')return split(model,target.id,target.p,uid(),uid());const id=uid();model.nodes.push({id,x:p.x,y:p.y});return id;}
function cancelDrag(){if(drag){model=drag.before;drag=null;render();}}
function setOpen(open){if(open&&!context?.isGM)return;propertiesOpen=false;rangeStart=null;cancelDrag();anchor=null;hover=null;selection=null;selectedIds.clear();panel.hidden=!open;button.setAttribute('aria-expanded',String(open));if(open){claimActiveTool('walls',()=>setOpen(false));publishActiveTool('walls','Walls');}else publishActiveTool('walls');render();}
button.onclick=()=>setOpen(panel.hidden);panel.querySelector('header button').onclick=()=>{if(propertiesOpen){propertiesOpen=false;render();}else setOpen(false);};

function remove(){if(!context?.isGM)return;if(synchronizeInspectionHeight()){render();return;}if(!selection&&!selectedIds.size)return;cancelDrag();const before=copyWalls(model);if(selectedIds.size){for(const id of selectedIds)removeSelection(model,{kind:'segment',id});}else removeSelection(model,selection);selectedIds.clear();selection=null;anchor=null;change(before);}
function undo(){if(!context?.isGM)return;propertiesOpen=false;rangeStart=null;cancelDrag();if(!history.length)return;model=history.pop();selectedIds.clear();selection=null;anchor=null;hover=null;save();render();}
panel.querySelector('[data-wall-delete]').onclick=remove;panel.querySelector('[data-wall-undo]').onclick=undo;
function consume(e){e.preventDefault();e.stopImmediatePropagation();}
board.addEventListener('pointerdown',event=>{
 if(panel.hidden||!context?.isGM||storedError)return;
 if(synchronizeInspectionHeight())render();
 if(event.button===2){if(anchor){anchor=null;hover=null;render();}return;}
 if(event.button!==0)return;
 consume(event);const p=snapPoint(gridPoint(event)),target=hit(event);if(!inside(p)&&!target)return;
 // An unfinished segment takes priority over selection. Ctrl bypasses linking.
 if(anchor||!target||event.ctrlKey){
  propertiesOpen=false;selectedIds.clear();rangeStart=null;const before=copyWalls(model),snap=!event.ctrlKey&&target?.kind==='node'?target:null,id=materialize(snap,p);
  if(anchor){if(id===anchor)return;const edgeId=uid();connect(model,anchor,id,edgeId);const edge=model.segments.find(e=>e.id===edgeId);
   // A new wall must occupy the plane being edited. Existing edges are untouched.
   if(edge&&!wallHeightIntervals(edge,pointNode(edge.a),pointNode(edge.b),inspectionHeight,groundAt).length)Object.assign(edge,{baseMode:'fixed',base:inspectionHeight});
   anchor=event.shiftKey?id:null;}else anchor=id;
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
 if(synchronizeInspectionHeight()){render();return;}
 if(drag){consume(event);const p=gridPoint(event),dx=p.x-drag.start.x,dy=p.y-drag.start.y;
  if(!drag.moved&&Math.hypot(dx,dy)*context.view.gridSize*context.view.scale<3)return;
  drag.moved=true;const moved=drag.ids.map(id=>{const old=drag.before.nodes.find(n=>n.id===id);return {id,...(selection.kind==='node'?snapPoint({x:old.x+dx,y:old.y+dy}):{x:old.x+dx,y:old.y+dy})};});if(moved.some(p=>!inside(p)))return;
  for(const n of moved)Object.assign(pointNode(n.id),n);
  const near=!event.ctrlKey&&selection.kind==='node'?hit(event,{excludeNodes:drag.ids,excludeEdges:model.segments.map(e=>e.id)}):null;hover=near?.kind==='node'?near:null;render();
 }else if(anchor){const near=!event.ctrlKey?hit(event):null;hover=near?.kind==='node'?near:{p:snapPoint(gridPoint(event))};render();}
},true);
board.addEventListener('pointerup',event=>{
 if(synchronizeInspectionHeight()){render();return;}
 if(event.button!==0||!drag)return;consume(event);const completed=drag;
 if(completed.moved&&selection.kind==='node'&&!event.ctrlKey){const near=hit(event,{excludeNodes:drag.ids,excludeEdges:model.segments.map(e=>e.id)});if(near?.kind==='node'){merge(model,selection.id,near.id);selection={kind:'node',id:near.id};}}
 drag=null;hover=null;if(board.hasPointerCapture(event.pointerId))board.releasePointerCapture(event.pointerId);change(completed.before);render();
},true);
board.addEventListener('dblclick',event=>{
 if(panel.hidden||!context?.isGM||storedError||event.button!==0)return;const target=hit(event);if(target?.kind!=='segment')return;consume(event);anchor=null;hover=null;
 if(event.shiftKey){const first=rangeStart||[...selectedIds][0],visible=new Set(visibleSlice().segments.map(s=>s.edge.id));for(const id of connectedWallPath(model,first,target.id))if(visible.has(id))selectedIds.add(id);}
 else{if(!selectedIds.has(target.id)){selectedIds.clear();selectedIds.add(target.id);}propertiesOpen=true;}
 selection={kind:'segment',id:target.id};render();
},true);
board.addEventListener('pointercancel',cancelDrag,true);board.addEventListener('lostpointercapture',cancelDrag,true);window.addEventListener('blur',cancelDrag);
board.addEventListener('contextmenu',e=>{if(!panel.hidden)consume(e);},true);
document.addEventListener('keydown',e=>{
 // Keys typed into a field belong to the field. One exception: Ctrl+Z in a tick box or a list of this
 // panel. Nothing is typed there, so it undoes the wall edit, as it does anywhere else on the board.
 const field=e.target.closest('input,textarea,select,[contenteditable=true]'),undoKey=(e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z';
 if(panel.hidden||!context?.isGM||(field&&!(undoKey&&panel.contains(field)&&(field.type==='checkbox'||field.tagName==='SELECT'))))return;
 if(synchronizeInspectionHeight())render();
 if(e.key==='Shift'&&!e.repeat&&!drag&&!anchor&&selection?.kind==='node'){consume(e);anchor=selection.id;hover={p:{...pointNode(anchor)}};propertiesOpen=false;render();return;}
 if(e.key==='Escape'){consume(e);if(propertiesOpen){propertiesOpen=false;render();}else if(drag)cancelDrag();else if(anchor){anchor=null;hover=null;render();}else setOpen(false);}
 else if(e.key==='Delete'||e.key==='Backspace'){consume(e);remove();}
 else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){consume(e);undo();}
},true);
function pathBetween(a,b){const steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)*4)),parts=[];for(let i=0;i<=steps;i++){const p=projected({x:a.x+(b.x-a.x)*i/steps,y:a.y+(b.y-a.y)*i/steps});parts.push(`${i?'L':'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`);}return parts.join(' ');}
function render(){
 synchronizeInspectionHeight();
 revision++;
 if(!context)return;svg.style.display=context.isGM?'':'none';svg.setAttribute('width',context.view.mapPixelSize.width);svg.setAttribute('height',context.view.mapPixelSize.height);
 const scale=context.view.scale||1,fragment=document.createDocumentFragment(),slice=visibleSlice(),visibleIds=new Set(slice.segments.map(s=>s.edge.id));
 for(const id of selectedIds)if(!visibleIds.has(id))selectedIds.delete(id);
 if(selection&&(selection.kind==='segment'?!visibleIds.has(selection.id):!slice.nodeIds.has(selection.id)&&selection.id!==anchor))selection=null;
 for(const {edge:e,a,b,intervals} of slice.segments){const path=document.createElementNS(ns,'path');path.dataset.wallSegment=e.id;
  const portions=intervals.map(([lo,hi])=>[{x:a.x+(b.x-a.x)*lo,y:a.y+(b.y-a.y)*lo},{x:a.x+(b.x-a.x)*hi,y:a.y+(b.y-a.y)*hi}]);
  path.setAttribute('d',portions.map(([a,b])=>pathBetween(a,b)).join(' '));path.setAttribute('fill','none');path.setAttribute('stroke',selectedIds.has(e.id)?'#ffeeb5':editor.color(e));path.setAttribute('stroke-width',3/scale);path.setAttribute('stroke-linecap','round');if(properties(e).sight==='pass'||e.open||isBroken(e))path.setAttribute('stroke-dasharray',isBroken(e)?`${2/scale} ${5/scale}`:`${6/scale} ${4/scale}`);path.setAttribute('opacity',panel.hidden?'.45':'.95');if(isBroken(e))path.dataset.wallBroken='';fragment.append(path);if(!panel.hidden)for(const [a,b] of portions)editor.directions(fragment,e,a,b,scale);
  // Only the GM has this overlay. A breakable wall carries one small diamond; nothing is shown to players.
  if(isBreakable(e)&&portions.length){const [p0,p1]=portions[Math.floor(portions.length/2)],q=projected({x:(p0.x+p1.x)/2,y:(p0.y+p1.y)/2}),r=4/scale,mark=document.createElementNS(ns,'path');mark.dataset.wallBreakable=e.material;mark.setAttribute('d',`M${q.x},${q.y-r} L${q.x+r},${q.y} L${q.x},${q.y+r} L${q.x-r},${q.y} Z`);mark.setAttribute('fill',isBroken(e)?'none':editor.materialColor(e.material));mark.setAttribute('stroke','#1b1b1b');mark.setAttribute('stroke-width',1/scale);mark.setAttribute('opacity',panel.hidden?'.6':'1');fragment.append(mark);}}
 if(!panel.hidden){
   if(anchor&&pointNode(anchor)&&hover){const preview=document.createElementNS(ns,'path');preview.setAttribute('d',pathBetween(pointNode(anchor),hover.p));preview.setAttribute('fill','none');preview.setAttribute('stroke','#fff0ba');preview.setAttribute('stroke-width',2/scale);preview.setAttribute('stroke-dasharray',`${5/scale} ${4/scale}`);fragment.append(preview);}
   for(const n of model.nodes){if(!slice.nodeIds.has(n.id)&&n.id!==anchor)continue;const p=projected(n),circle=document.createElementNS(ns,'circle');circle.dataset.wallNode=n.id;circle.setAttribute('cx',p.x);circle.setAttribute('cy',p.y);circle.setAttribute('r',(selection?.id===n.id||hover?.id===n.id?6:4)/scale);circle.setAttribute('fill',selection?.id===n.id||hover?.id===n.id?'#ffeeb5':'#27241e');circle.setAttribute('stroke','#e7ca88');circle.setAttribute('stroke-width',1.5/scale);fragment.append(circle);}
 }
 editor.refresh(propertiesOpen);svg.replaceChildren(fragment);if(document.activeElement!==slantInput)slantInput.value=String(viewSlant(model));{const broken=model.segments.filter(isBroken).length;repairAll.hidden=!broken;repairAll.textContent=broken===1?'Repair the broken wall':`Repair all ${broken} broken walls`;}panel.querySelector('[data-wall-delete]').disabled=!selection&&!selectedIds.size;panel.querySelector('[data-wall-undo]').disabled=!history.length;
 editor.portals();
}
function tick(){
 try {
 const c=window.terrainContext?.();if(c?.view.mapLoaded){
   const nextKey=storageKey(c);if(nextKey!==key){cancelDrag();context=c;key=nextKey;sharedRevision=-1;history=[];propertiesOpen=false;rangeStart=null;selectedIds.clear();selection=null;anchor=null;hover=null;storedError=false;model=emptyWalls();render();}else context=c;
   const shared=sharedField('walls');if(!savingShared&&!drag&&!anchor&&!storedError&&shared&&shared.revision!==sharedRevision){model=validateWalls(shared.value);sharedRevision=shared.revision;history=[];render();}
   button.hidden=!c.isGM;button.disabled=storedError;if(!c.isGM&&!panel.hidden)setOpen(false);
   const cubeScene=c.state.boardState.activeSceneId,cubeTemplates=c.state.boardState.templates?.[cubeScene],cubeLevels=c.state.boardState.sceneState?.[cubeScene]?.mapLevels;
   // Store snapshots retain references until a mutation; serialize large floor cutouts only then.
   if(!cubeInputs||cubeInputs.scene!==cubeScene||cubeInputs.templates!==cubeTemplates||cubeInputs.levels!==cubeLevels){
     cubeInputs={scene:cubeScene,templates:cubeTemplates,levels:cubeLevels};
     const cubeKey=JSON.stringify([cubeScene,cubeTemplates||[],cubeLevels]);if(cubeKey!==cubeSignature){cubeSignature=cubeKey;revision++;}
   }
   const next=JSON.stringify([c.isGM,c.isGM?gmVision.height:null,c.view.scale,c.view.gridSize,c.view.gridOffsets,c.view.mapPixelSize,terrainPrototype?.revision||0]);if(next!==signature){signature=next;render();}
 }else {svg.style.display='none';button.disabled=true;}
 const ps=JSON.stringify([panel.hidden,window.visionPrototype?.stats.paints,revision,context?.isGM]);if(ps!==portalSignature){portalSignature=ps;editor.portals();}
 } catch(error) {
   if(!storedError){console.error('Shared wall rendering failed',error);if(context?.isGM)alert('Shared walls could not be loaded. Editing is disabled; the last valid walls are retained.');}
   storedError=true;button.disabled=true;
 } finally { requestAnimationFrame(tick); }
}
window.addEventListener('storage',e=>{if(e.key===key){cancelDrag();key='';}});
let cubeModelRevision=-1,cachedCubeModel=null;
// Movement, sight, fog, roofs and the ruler all read walls from here, so a broken wall is left
// out in this one place. The editor keeps reading `model`, which still holds it for repair.
function activeModel(){
 if(!context)return liveWalls(model);
 if(cubeModelRevision!==revision){cachedCubeModel=wallCubeModel(liveWalls(model),context.state.boardState.templates?.[context.state.boardState.activeSceneId]||[],context.state.boardState.sceneState?.[context.state.boardState.activeSceneId]||{},groundAt);cubeModelRevision=revision;}
 return cachedCubeModel;
}
function groundAt(x,y){const v=context.view;return terrainPrototype.heightAt((v.gridOffsets.left||0)+x*v.gridSize,(v.gridOffsets.top||0)+y*v.gridSize);}
window.wallPrototype={refreshPortals:()=>editor.portals(),get selectedTopHeight(){
 if(!context?.isGM||panel.hidden||selection?.kind!=='segment')return null;
 const edge=model.segments.find(e=>e.id===selection.id);if(!edge)return null;
 const a=pointNode(edge.a),b=pointNode(edge.b);
 return wallHeights(edge,a,b,{x:(a.x+b.x)/2,y:(a.y+b.y)/2},groundAt).top;
},forcedBlockedMove:(from,to)=>!!context&&(forcedTerrainBlocked(from,to,groundAt,t=>terrainPrototype.groundFor(t))||movementBlocked(activeModel(),from,to,(t,origin)=>terrainPrototype.movementGroundFor(origin,t),groundAt)),blockedMove:(from,to)=>!!context&&!context.isGM&&(from.levelId||'level-0')===(context.levelId||'level-0')&&movementPathBlocked(activeModel(),from,to,(t,origin)=>terrainPrototype.movementGroundFor(origin,t),groundAt,(a,b)=>terrainPrototype.movementPlacement(a,b)),get saving(){return savingShared;},get revision(){return revision;},get model(){return activeModel();},get key(){return key;},blocksSight:(a,b)=>blocksSight(activeModel(),a,b)};
requestAnimationFrame(tick);
