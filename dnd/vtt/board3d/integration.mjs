import {createSceneView} from './scene-view.mjs';
import {bindCameraInput} from './camera-controls.mjs';
import {dragMovementKind,getCurrentPlannedRoute,getCurrentMeasurementPresentation,addExternalMeasurementNode} from '../assets/js/ui/drag-ruler.js';
import {createEffectOverlays} from './effect-overlays.mjs';
import {createMinis} from './minis.mjs';
import {sceneArtFor,loadSceneArt} from './scene-art.mjs';
import {createRoutePlanner} from './route-planner.mjs';
import {tetherSupport} from '../assets/js/ui/height-tethers.mjs';
import {roofSurfaces} from '../assets/js/ui/roof-geometry.mjs';
import {rampHeight} from '../assets/js/ui/imported-ramps.mjs';
import {createWallOverlayLayer} from './wall-overlay.mjs';
import {createTerrainBrushLayer} from './terrain-brush.mjs';
import {buildAreaVolume} from './area-volume.mjs';

// The 3D board. It draws the scene and the tokens; every rule, command and
// panel stays the VTT's own. The 2D map layer stays in place, transparent, on
// top of the 3D picture, so the existing tools keep receiving the pointer; the
// VTT asks `window.vtt3d.clientToMap` where a pointer lands on the 3D surfaces.
const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('./integration.css'+new URL(import.meta.url).search,import.meta.url);document.head.append(style);
const waitFor=async predicate=>{for(let i=0;i<240;i++){const result=predicate();if(result)return result;await new Promise(r=>setTimeout(r,100));}throw Error('The VTT controller did not become ready.');};
const loadJson=file=>fetch(new URL(file,import.meta.url),{cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null);

async function mount(){
 const bridge=await waitFor(()=>window.vtt3dBridge),board=document.querySelector('#vtt-board-canvas'),tokenLayer=document.querySelector('#vtt-token-layer'),mapTransform=document.querySelector('#vtt-map-transform'),mapSurface=document.querySelector('#vtt-map-surface');
 if(!board||!tokenLayer||!mapSurface)throw Error('The VTT board is missing.');
 const host=document.createElement('section');host.id='vtt-board3d';host.setAttribute('aria-hidden','true');board.prepend(host);
 const tokenHost=document.createElement('div');tokenHost.id='vtt-board3d-token-host';board.append(tokenHost);tokenHost.append(tokenLayer);
 const overlayHost=document.createElement('div');overlayHost.id='vtt-board3d-overlay-host';board.append(overlayHost);
 window.vtt3dActive=true;document.documentElement.classList.add('vtt3d-on');

 // Prepared 3D art (Gravity Orchard). Any other scene is its map picture on the ground.
 // Prepared 3D art (scene.json: Gravity Orchard) is used on any scene that is that map,
 // whatever the scene is called: its height grid has the same size and it has the
 // art's own floating floors. Sculpting heights or editing walls keeps the art.
 const artData=await loadJson('scene.json');
 const art=artData?.field?{n:artData.field.n,m:artData.field.m,roofs:new Set((artData.walls?.roofs||[]).map(r=>r.id)),data:artData}:null;
 function isArtScene(){
  if(!art||!art.roofs.size)return false;const terrain=context.environment?.terrain?.value,roofs=context.environment?.walls?.value?.roofs||[];
  if(terrain?.n!==art.n||terrain?.m!==art.m)return false;if(!context.environment?.walls)return null; // undecided until the floors arrive
  let found=0;for(const r of roofs)if(art.roofs.has(r.id))found++;return found>=art.roofs.size*.8;
 }

 let sceneArtParts=[];
 let minis=null,miniIds='',profiles=new Map(),profilesFor=null;
 let context=bridge.getContext(),view=null,data=null,effects=null,canvas=null,builtKey='',building=null;
 let clickMoveTokenId=null,hoverPointer=null,held=null,drag=null,lastTime=performance.now(),lastTokenSignature='',hoverSignature='',shownLevel=null;

 function pictureRect(){
  const v=context.view||{},g=v.gridSize||64,off=v.gridOffsets||{},insets=v.mapInsets||{},image=document.querySelector('#vtt-map-image');
  const width=image?.naturalWidth||0,height=image?.naturalHeight||0;if(!width||!height)return null;
  return {url:image.currentSrc||image.src,left:((insets.left||0)-(off.left||0))/g,top:((insets.top||0)-(off.top||0))/g,width:width/g,height:height/g};
 }
 function boardSize(){const v=context.view||{},g=v.gridSize||64,o=v.gridOffsets||{};return {columns:Math.max(1,Math.round(((v.mapPixelSize?.width||0)-(o.left||0)-(o.right||0))/g)),rows:Math.max(1,Math.round(((v.mapPixelSize?.height||0)-(o.top||0)-(o.bottom||0))/g))};}
 // A scene with no prepared art: its picture laid flat on the ground.
 function pictureScene(){
  const {columns,rows}=boardSize();
  const levels=[{value:0,id:'level-0',height:0,name:'Ground'},...(context.levels||[]).map((l,i)=>({value:i+1,id:l.id,height:Number(l.elevationSquares)||i+1,name:l.name||''}))];
  return {format:'gmscreen-picture/v1',name:'',width:columns,height:rows,field:{n:2,m:2,h:[0,0,0,0]},walls:{nodes:[],segments:[],roofs:[]},floors:[],props:[],ramps:[],water:{triangles:[],pools:[]},
   levels,levelHeights:levels.map(l=>l.height),spots:[]};
 }
 // Floating floors and ramps come from the live map, so edits to them show in 3D.
 let structure={revision:undefined,roofs:[],ramps:[],hash:''};
 function liveStructure(){
  const walls=context.environment?.walls,revision=walls?.revision??null;if(revision===structure.revision)return structure;
  const v=walls?.value||{},nodes=new Map((v.nodes||[]).map(n=>[n.id,n]));
  const roofs=(v.roofs||[]).filter(r=>!r.boxTop).map(r=>({...r,points:r.points||(r.nodes||[]).map(id=>nodes.get(id)).filter(Boolean)})).filter(r=>r.points.length>=3&&Number.isFinite(r.height));
  const ramps=(v.ramps||[]).map(r=>({...r})),text=JSON.stringify([roofs,ramps]);let hash=5381;for(let i=0;i<text.length;i++)hash=(hash*33^text.charCodeAt(i))>>>0;
  structure={revision,roofs,ramps,hash:hash.toString(36)};return structure;
 }
 function withStructure(sceneData){
  const live=liveStructure(),index=id=>Math.max(0,(sceneData.levels||[]).findIndex(l=>l.id===id));
  const roofs=live.roofs.map(r=>({...r,level:index(r.levelId)})),ramps=live.ramps.map(r=>({...r,fromLevelIndex:index(r.fromLevel),toLevelIndex:index(r.toLevel),kind:r.kind||(String(r.id).includes('-vine-')?'vine':'arch')}));
  return {...sceneData,walls:{...sceneData.walls,roofs,ramps},ramps};
 }
 function sceneKey(){
  if(!context.sceneId||!context.view?.mapLoaded)return '';
  const hash=liveStructure().hash;
  // Prepared art waits for the map's own floors to arrive, so it is built once, with them.
  const artScene=isArtScene();if(artScene===null)return '';if(artScene)return 'art:'+context.sceneId+':'+hash;
  const picture=pictureRect();return picture?JSON.stringify(['picture',context.sceneId,picture,boardSize(),hash]):'';
 }
 let buildTimer=0;
 function scheduleBuild(){const key=sceneKey();if(!key||key===builtKey)return;const sameScene=builtKey&&key.split(':').slice(0,2).join(':')===builtKey.split(':').slice(0,2).join(':')&&key.startsWith('art:');clearTimeout(buildTimer);buildTimer=setTimeout(buildScene,sameScene?600:0);}
 async function buildScene(){
  const key=sceneKey();if(!key||key===builtKey||building)return;
  building=key;
  try{
   const useArt=key.startsWith('art:'),nextData=withStructure(useArt?art.data:pictureScene()),nextCanvas=document.createElement('canvas');nextCanvas.tabIndex=-1;
   const nextView=await createSceneView({canvas:nextCanvas,sceneData:nextData,groundPicture:useArt?null:pictureRect()});
   if(view){cancelDrag();stopLayers();effects?.dispose?.();minis?.dispose();minis=null;for(const part of sceneArtParts)view.removeLevelArt(part);sceneArtParts=[];view.dispose();canvas?.remove();}
   host.append(nextCanvas);canvas=nextCanvas;view=nextView;data=nextData;builtKey=key;shownLevel=null;lastTokenSignature='';fieldShown=-1;fieldAt=0;
   view.setTokenBodiesVisible(false);view.setLevel(-1);view.setVision([],false);view.resize();
   effects=createEffectOverlays({scene:view.scene,heightFor:id=>bridge.heightFor(id)});startLayers();
   minis?.dispose();minis=createMinis(view.scene);miniIds='';
   // A map with its own 3D art (scene-art.mjs) draws that art in place of its picture.
   if(!useArt){const entry=await sceneArtFor(context);if(entry&&view===nextView){const art=await loadSceneArt(entry).catch(error=>{console.warn('[3D board] map art not loaded',error);return null;});
    if(art&&view===nextView){art.userData.parts??=[...art.children];view.useArtModel();
     // Each art part belongs to the floor at its height (a scene copy renames its floors, so names cannot be used).
     for(const part of art.userData.parts){const height=Number(entry.levels?.[part.name]),index=Number.isFinite(height)?Math.max(0,(data?.levels||[]).findIndex(l=>Math.abs(l.height-height)<.1)):0;view.addLevelArt(part,index,{always:index===0});sceneArtParts.push(part);}}}}
   const own=!context.isGM&&(context.placements?.find(p=>p.visionOwners?.includes(String(context.user?.name||'').toLowerCase()))||context.placements?.find(p=>p.canMove));
   if(own)focus(own.id);else view.home();
   document.dispatchEvent(new CustomEvent('vtt3d:scene-built',{detail:{sceneId:context.sceneId,art:useArt}}));
  }catch(error){console.error('[VTT 3D] scene build failed',error);}
  finally{building=null;if(sceneKey()!==builtKey)buildScene();}
 }

 // Where a pointer lands: map pixels, with the height and floor it lands on.
 // `plane` asks for a horizontal plane at that height instead of the surfaces.
 function clientToMap(clientX,clientY,{plane=null,tokens=false}={}){
  if(!view)return null;const v=context.view||{},g=v.gridSize||64,o=v.gridOffsets||{};
  let hit=null;
  if(Number.isFinite(plane)){const p=view.pointOnPlane(clientX,clientY,plane);if(p)hit={x:p.x,y:p.y,z:plane,levelId:null,surfaceId:null,rampId:null};}
  else hit=view.pick({clientX,clientY},{tokens});
  if(!hit||!Number.isFinite(hit.x)||!Number.isFinite(hit.y))return null;
  return {x:(o.left||0)+hit.x*g,y:(o.top||0)+hit.y*g,height:hit.z,levelId:hit.levelId??null,surfaceId:hit.surfaceId??null,rampId:hit.rampId??null,column:Math.floor(hit.x),row:Math.floor(hit.y),squares:{x:hit.x,y:hit.y},tokenId:hit.tokenId??null};
 }
 // Board layers: each 3D layer (drawings, templates, zones, ...) is a factory
 // `({view,scene,guideScene,overlayHost,bridge,helpers}) => ({update(context,dt), dispose()})`.
 // Layers are rebuilt with the scene. Map pixels <-> squares and heights come
 // from `helpers`, so every layer measures the same way.
 const layerFactories=new Map(),layers=new Map();
 const helpers={
  toSquares(x,y){const v=context.view||{},g=v.gridSize||64,o=v.gridOffsets||{};return {x:(x-(o.left||0))/g,y:(y-(o.top||0))/g};},
  toMap(x,y){const v=context.view||{},g=v.gridSize||64,o=v.gridOffsets||{};return {x:(o.left||0)+x*g,y:(o.top||0)+y*g};},
  get gridSize(){return context.view?.gridSize||64;},
  // Ground height (squares) at a point in squares, as the VTT's own terrain reads it.
  groundAt(x,y){const tp=window.terrainPrototype,p=helpers.toMap(x,y);return tp?.heightAt?tp.heightAt(p.x,p.y):0;},
  // Floor height of a level id (VTT floorElevations); null when unknown.
  levelHeight(levelId){if(!levelId||levelId==='level-0')return 0;const l=(context.levels||[]).find(l=>l.id===levelId);const h=Number(l?.elevationSquares);return Number.isFinite(h)?h:null;},
  project(point){return view?.project(point)??null;},
  get shownLevel(){return shownLevel;},levelIndex:id=>levelIndex(id),
  // The ramps and vines of the scene as built (live from the map), in squares; the same list until it is rebuilt.
  get ramps(){return data?.ramps||null;},
  get context(){return context;},
 };
 function startLayers(){for(const [name,factory] of layerFactories){try{layers.set(name,factory({view,scene:view.scene,guideScene:view.guideScene,overlayHost,bridge,helpers}));}catch(error){console.error('[VTT 3D] layer',name,error);}}}
 function stopLayers(){for(const [name,layer] of layers){try{layer?.dispose?.();}catch(error){console.error('[VTT 3D] layer',name,error);}}layers.clear();}
 function addLayer(name,factory){layerFactories.set(name,factory);if(layers.has(name)){layers.get(name)?.dispose?.();layers.delete(name);}if(view){try{layers.set(name,factory({view,scene:view.scene,guideScene:view.guideScene,overlayHost,bridge,helpers}));}catch(error){console.error('[VTT 3D] layer',name,error);}}}
 // Grid directions for the arrow keys: up is away from the viewer, right is to
 // the viewer's right, each snapped to the nearest row or column direction.
 function gridDirections(){if(!view)return null;const f=view.controls.target.clone().sub(view.camera.position);f.y=0;if(f.lengthSq()<1e-8)return null;
  const up=Math.abs(f.x)>Math.abs(f.z)?{x:Math.sign(f.x),y:0}:{x:0,y:Math.sign(f.z)};return {up,right:{x:-up.y,y:up.x}};}
 // Bring tokens into view (Find token, My token): the camera keeps its angle and
 // backs off far enough for all of them. Returns their map points for the pulses.
 function focusTokens(ids){if(!view)return [];const wanted=new Set(ids||[]);
  const shown=(context.placements||[]).filter(p=>wanted.has(p.id)&&(context.isGM||!p.hidden)).map(world).filter(p=>shownLevel===null||shownLevel<0||p.level<=shownLevel);
  if(!shown.length)return [];
  const mid={x:shown.reduce((a,p)=>a+p.x,0)/shown.length,y:shown.reduce((a,p)=>a+p.y,0)/shown.length,z:shown.reduce((a,p)=>a+p.z,0)/shown.length};
  const span=Math.max(...shown.map(p=>Math.hypot(p.x-mid.x,p.y-mid.y)),0);
  const offset=view.camera.position.clone().sub(view.controls.target),distance=Math.max(offset.length(),12+span*2.2);
  view.focus(mid);view.camera.position.copy(view.controls.target).add(offset.setLength(distance));view.controls.update();
  return shown.map(p=>({...helpers.toMap(p.x,p.y),z:p.z}));}
 // Line-and-dot overlays drawn by the 3D overlay layer (wall-overlay.mjs), by name: 'walls', 'stairs', ...
 const overlays=new Map();
 let overlaysVersion=0;
 const overlaySignatures=new Map();
 const setOverlay=(name,list)=>{const next=Array.isArray(list)&&list.length?list:null,signature=next?JSON.stringify(next):'';if((overlaySignatures.get(name)||'')===signature)return;overlaySignatures.set(name,signature);if(next)overlays.set(name,next);else overlays.delete(name);overlaysVersion++;};
 // A refused walk's wall piece, outlined in red for a moment (wall-flash.mjs WALL_FLASH_MS).
 let flashTimer=0;
 function flashWall(met){if(!met?.a||!met?.b)return false;const base=Number.isFinite(met.base)?met.base:0,top=Number.isFinite(met.top)?met.top:base+2,colour='#ff5a4f';
  setOverlay('wall-flash',[{kind:'line',points:[{x:met.a.x,y:met.a.y,z:base},{x:met.b.x,y:met.b.y,z:base}],color:colour,opacity:1},{kind:'line',points:[{x:met.a.x,y:met.a.y,z:top},{x:met.b.x,y:met.b.y,z:top}],color:colour,opacity:1},
   {kind:'line',points:[{x:met.a.x,y:met.a.y,z:base},{x:met.a.x,y:met.a.y,z:top}],color:colour,opacity:1},{kind:'line',points:[{x:met.b.x,y:met.b.y,z:base},{x:met.b.x,y:met.b.y,z:top}],color:colour,opacity:1}]);
  clearTimeout(flashTimer);flashTimer=setTimeout(()=>setOverlay('wall-flash',[]),1800);return true;}
 window.vtt3d={get active(){return !!view;},flashWall,get overlays(){return overlays;},get overlaysVersion(){return overlaysVersion;},setOverlay,get wallOverlay(){return overlays.get('walls')||[];},setWallOverlay(list){setOverlay('walls',list);},clientToMap,gridDirections,focusTokens,get view(){return view;},addLayer,helpers,overlayHost};

 const planner=createRoutePlanner({context:()=>bridge.getContext(),onProgress:()=>refreshHeld()});window.vtt3dPlanner=planner;
 const holding=()=>drag?.moved?drag.pointer:clickMoveTokenId?hoverPointer:null;
 function refreshHeld(){const pointer=holding();if(pointer){hoverSignature='';showHover(pointer,find(drag?.id??clickMoveTokenId));}}

 function find(id){return context.placements?.find(p=>p.id===id);}
 function stackOrderOf(id){const value=Number(find(id)?.stackOrder);return Number.isFinite(value)?value:0;}
 function selected(){return find(context.selectedIds?.[0]);}
 function levelIndex(levelId){return Math.max(0,data?.levels?.findIndex(l=>l.id===levelId)??0);}
 function world(p){const z=bridge.heightFor(p.id);return {id:p.id,x:p.column+(p.width||1)/2,y:p.row+(p.height||1)/2,z:Number.isFinite(z)?z:0,width:p.width||1,height:p.height||1,color:p.color||p.borderColor||(p.team==='enemy'?'#d39184':'#a9d6c7'),level:levelIndex(p.levelId)};}
 function destination(hit,p){return {column:Math.max(0,Math.round(hit.x-(p.width||1)/2)),row:Math.max(0,Math.round(hit.y-(p.height||1)/2))};}
 function movementKind(e){return dragMovementKind(e||{});}
 const pickAtClient=(x,y,options)=>view?.pick({clientX:x,clientY:y},options)??null;
 function clearGuides(){if(!view)return;view.setReachable([]);view.setPath([]);view.setMovementRoute(null);}
 function cancelDrag(){clickMoveTokenId=null;hoverPointer=null;held=null;const previous=drag;drag=null;if(previous&&tokenLayer.hasPointerCapture(previous.pointerId))tokenLayer.releasePointerCapture(previous.pointerId);bridge.endMovementPreview?.();clearGuides();hoverSignature='';}
 async function commit(hit,p,e,intent=null){if(!p||p.canMove===false||context.busy)return;const to=destination(hit,p);intent=intent||bridge.captureMovementPreview?.();
  const matches=intent&&intent.placementId===p.id&&intent.column===to.column&&intent.row===to.row
   &&(intent.rampId??null)===(hit.rampId??null)&&(intent.levelId??null)===(hit.levelId??null)&&(intent.surfaceId??null)===(hit.surfaceId??null)
   &&(hit.rampId||Number.isFinite(intent.surfaceElevation)&&Math.abs(intent.surfaceElevation-hit.z)<.55);
  if(!matches){bridge.previewMovement?.({placementId:p.id,...to,surfaceElevation:hit.z,levelId:hit.levelId??null,surfaceId:hit.surfaceId??null,rampId:hit.rampId??null});intent=bridge.captureMovementPreview?.();}
  cancelDrag();
  try{await bridge.move({...intent,placementId:p.id,...to,surfaceElevation:hit.z,levelId:hit.levelId??null,surfaceId:hit.surfaceId??null,rampId:hit.rampId??null,movementKind:movementKind(e)});}catch(error){console.error('[VTT 3D] move',error);}
  context=bridge.getContext();}
 // Before a drop is sent, finish the route search for that square (bounded) so
 // the move carries the planned corners rather than a provisional straight line.
 function settleRoute(e,p){if(!p||getCurrentPlannedRoute()?.status!=='pending')return;const hit=pickAtClient(e.clientX,e.clientY,{tokens:false});if(!hit)return;
  const dest=destination(hit,p);let status='pending';for(let i=0;i<60&&status==='pending';i++)status=planner.plan(p,{...dest,surfaceElevation:hit.z,levelId:hit.levelId??null,surfaceId:hit.surfaceId??null,rampId:hit.rampId??null},movementKind(e)).status;
  hoverSignature='';showHover(e,p);}
 function showHover(e,p=selected()){
  if(!view)return;
  if(Number.isFinite(e.clientX)&&Number.isFinite(e.clientY))hoverPointer={clientX:e.clientX,clientY:e.clientY,shiftKey:!!e.shiftKey,ctrlKey:!!e.ctrlKey,altKey:!!e.altKey,metaKey:!!e.metaKey};
  if(context.targetMode==='area'||context.targetMode==='move'){const hit=pickAtClient(e.clientX,e.clientY,{tokens:false});if(hit){const cell={column:Math.floor(hit.x),row:Math.floor(hit.y)},key=`ability:${context.targetMode}:${cell.column}:${cell.row}`;if(key!==hoverSignature){hoverSignature=key;bridge.previewAbility?.(cell);context=bridge.getContext();paintAbilityGuide();}}return;}
  if(!p||(!drag?.moved&&clickMoveTokenId!==p.id)||context.busy||context.targetMode){if(hoverSignature){view.setReachable([]);view.setPath([]);hoverSignature='';}return;}
  const hit=pickAtClient(e.clientX,e.clientY,{tokens:false});if(!hit){bridge.endMovementPreview?.();clearGuides();hoverSignature='';held=null;return;}
  const dest=destination(hit,p),key=[p.id,dest.column,dest.row,hit.rampId?'ramp':hit.z.toFixed(2),hit.levelId,hit.surfaceId,hit.rampId,movementKind(e),Boolean(drag?.moved)].join(':');if(key===hoverSignature)return;hoverSignature=key;
  const preview=bridge.previewMovement?.({placementId:p.id,...dest,surfaceElevation:hit.z,levelId:hit.levelId??null,surfaceId:hit.surfaceId??null,rampId:hit.rampId??null});
  const displayHeight=Number.isFinite(preview?.surfaceElevation)?preview.surfaceElevation:hit.z;
  const cells=[];for(let x=0;x<(p.width||1);x++)for(let y=0;y<(p.height||1);y++)cells.push({x:dest.column+x+.5,y:dest.row+y+.5,z:displayHeight,level:hit.level});view.setReachable(cells);
  const source=world(p);view.setMovementRoute(preview?.route??null);view.setPath(preview?.route?[]:[source,{x:dest.column+(p.width||1)/2,y:dest.row+(p.height||1)/2,z:displayHeight}]);
  // The held token stands where the move would leave it, so it follows the pointer square by square.
  const landing=Number.isFinite(preview?.predictedLanding?.height)?preview.predictedLanding.height:displayHeight;held={id:p.id,x:dest.column+(p.width||1)/2,y:dest.row+(p.height||1)/2,z:landing};
 }

 // Board pointer routing. Hover and click-to-move run before the VTT's own
 // surface handlers only while a token or an ability is waiting for a square.
 const claims=()=>!!clickMoveTokenId||context.targetMode==='area'||context.targetMode==='move';
 let surfaceDown=null;
 mapSurface.addEventListener('pointermove',e=>{if(!e.buttons)showHover(e);});
 mapSurface.addEventListener('pointerleave',()=>{if(!drag&&!clickMoveTokenId){bridge.endMovementPreview?.();clearGuides();hoverSignature='';}});
 mapSurface.addEventListener('pointerdown',e=>{if(e.button!==0||e.altKey||!view||!claims())return;e.preventDefault();e.stopImmediatePropagation();surfaceDown={x:e.clientX,y:e.clientY};},true);
 mapSurface.addEventListener('pointerup',e=>{if(e.button!==0||!surfaceDown)return;const start=surfaceDown;surfaceDown=null;e.preventDefault();e.stopImmediatePropagation();if(Math.hypot(e.clientX-start.x,e.clientY-start.y)>5)return;
  const hit=pickAtClient(e.clientX,e.clientY,{tokens:false});if(!hit)return;
  if(context.targetMode==='area'||context.targetMode==='move'){bridge.pickAbility?.({column:Math.floor(hit.x),row:Math.floor(hit.y)});return;}
  if(!clickMoveTokenId)return;const mover=find(clickMoveTokenId);showHover(e,mover);settleRoute(e,mover);const intent=bridge.captureMovementPreview?.();commit(hit,mover,e,intent);},true);

 // Tokens: select, drag or click-to-move, through the VTT bridge.
 tokenLayer.addEventListener('pointerdown',e=>{const node=e.target.closest('[data-placement-id]');if(!node||e.target.closest('[data-token-trigger-ready],[data-token-judgment-mark],[data-token-hidden-effect],button'))return;
  if(e.button!==0)return;e.preventDefault();e.stopImmediatePropagation();const id=node.dataset.placementId;
  if(context.targetMode){const p=find(id);if(p)bridge.pickAbility?.({column:p.column,row:p.row,placementId:id});return;}
  if(bridge.target(id,{clientX:e.clientX,clientY:e.clientY}))return;
  if(e.shiftKey||!context.selectedIds?.includes(id))bridge.select(id,{additive:e.shiftKey});planner.warm(find(id));clickMoveTokenId=null;board.focus({preventScroll:true});
  drag={id,x:e.clientX,y:e.clientY,pointerId:e.pointerId,moved:false};tokenLayer.setPointerCapture(e.pointerId);},true);
 // The held token is followed at the window, not by pointer capture: pressing
 // another mouse button to turn or pan the view can drop the capture, and the
 // left button's release must still drop the token where it is held.
 window.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.pointerId)return;e.stopPropagation();drag.pointer={clientX:e.clientX,clientY:e.clientY,shiftKey:e.shiftKey,ctrlKey:e.ctrlKey,altKey:e.altKey,metaKey:e.metaKey};drag.moved||=Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>5;if(drag.moved)showHover(e,find(drag.id));if(!(e.buttons&1))finishDrag(e);},true);
 window.addEventListener('pointerup',e=>{if(!drag||e.pointerId!==drag.pointerId||(e.buttons&1))return;e.preventDefault();e.stopPropagation();finishDrag(e);},true);
 function finishDrag(e){const released=drag;if(!released)return;if(released.moved)settleRoute(e,find(released.id));const intent=bridge.captureMovementPreview?.();cancelDrag();
  if(released.moved){const hit=pickAtClient(e.clientX,e.clientY,{tokens:false});if(hit)commit(hit,find(released.id),e,intent);}else clickMoveTokenId=released.id;}
 window.addEventListener('pointercancel',e=>{if(drag&&e.pointerId===drag.pointerId)cancelDrag();},true);
 tokenLayer.addEventListener('contextmenu',e=>{const node=e.target.closest('[data-placement-id]');if(!node)return;e.preventDefault();e.stopImmediatePropagation();bridge.openSettings(node.dataset.placementId,{clientX:e.clientX,clientY:e.clientY});},true);
 window.addEventListener('blur',cancelDrag);document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelDrag();});
 const refreshDragKeys=e=>{if((!drag&&!clickMoveTokenId)||e.target?.closest?.('input,textarea,select,[contenteditable],button,dialog'))return;if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();cancelDrag();return;}if((drag?.moved||clickMoveTokenId)&&['Shift','Control',' '].includes(e.key)){const pointer=drag?.pointer??hoverPointer;if(pointer){hoverSignature='';showHover({...pointer,ctrlKey:e.ctrlKey,shiftKey:e.shiftKey},find(drag?.id??clickMoveTokenId));}}};
 document.addEventListener('keydown',refreshDragKeys,true);document.addEventListener('keyup',refreshDragKeys,true);
 document.addEventListener('vtt3d:movement-preview-cancelled',cancelDrag);

 // Camera: middle turns, right drags the ground, wheel zooms; all at once if wanted,
 // and while a token is held (its preview follows the moving view).
 const inBoard=e=>!!(e.target?.closest?.('#vtt-map-surface,#vtt-board3d-token-host,#vtt-board3d')||(drag&&e.target===tokenLayer));
 bindCameraInput({controls:{orbit:(dx,dy)=>view?.orbit(dx,dy)},zoomAt:(x,y,d)=>view?.zoomAt(x,y,d),grabStart:(x,y)=>view?.grabStart(x,y),grabMove:(x,y)=>view?.grabMove(x,y),inBoard,onChange:()=>refreshHeld(),
  // A quick right click while a token is held drops a corner of its path there, as on the 2D board.
  onRightClick:()=>{if(!drag?.moved&&!clickMoveTokenId)return false;if(addExternalMeasurementNode()){hoverSignature='';refreshHeld();}return true;}});

 let guideSignature='',areaPreview=null;
 // An ability's area while it is being placed: the same see-through volume as templates
 // (area-volume.mjs), dashed, on the squares it would cover, as tall as it is wide.
 function paintAreaPreview(guide,levelHeight){
  areaPreview?.dispose?.();if(areaPreview?.group)view.guideScene.remove(areaPreview.group);areaPreview=null;
  const cell=guide?.previewCell;if(!cell||guide.kind!=='area'||!view)return;
  const width=guide.width||1,depth=guide.height||width,squares=[];for(let x=0;x<width;x++)for(let y=0;y<depth;y++)squares.push({column:cell.column+x,row:cell.row+y});
  const onFloor=guide.levelId&&guide.levelId!=='level-0';
  areaPreview=buildAreaVolume({squares,baseAt:(column,row)=>onFloor?levelHeight:helpers.groundAt(column+.5,row+.5),height:Math.max(1,Math.min(width,depth)),color:'#38bdf8',dashed:true});
  view.guideScene.add(areaPreview.group);
 }
 // An ability's range: the square around its user, at the user's height (the 2D range box).
 function paintAbilityRange(guide){
  const source=guide?.source,raw=guide?.distance,range=typeof raw==='number'?raw:Number(raw?.within??raw?.range??raw?.value??0);
  if(!source||!Number.isFinite(source.column)||!(range>0)){setOverlay('ability-range',[]);return;}
  const z=Number.isFinite(bridge.heightFor(source.id))?bridge.heightFor(source.id):0,left=source.column-range,top=source.row-range,right=source.column+(source.width||1)+range,bottom=source.row+(source.height||1)+range;
  setOverlay('ability-range',[{kind:'line',points:[{x:left,y:top,z},{x:right,y:top,z},{x:right,y:bottom,z},{x:left,y:bottom,z},{x:left,y:top,z}],color:'#ffffff',opacity:.9}]);
 }
 function paintAbilityGuide(){if(!view)return;const guide=context.abilityGuide,signature=JSON.stringify(guide);if(signature===guideSignature)return;guideSignature=signature;
  paintAbilityRange(guide);if(guide?.kind!=='area')paintAreaPreview(null);
  if(!guide){view.setReachable([]);view.setPath([]);return;}
  const level=context.levels?.find(l=>l.id===guide.levelId),height=Number(level?.elevationSquares)||0,at=cell=>({x:cell.column+.5,y:cell.row+.5,z:Number.isFinite(cell.rawHeight)?cell.rawHeight:height,level:-1});
  if(guide.kind==='move'){view.setReachable((guide.legalCells||[]).map(at));if(guide.target&&guide.previewCell)view.setPath([world(guide.target),at(guide.previewCell)]);}
  else if(guide.kind==='area'){view.setReachable([]);view.setPath([]);paintAreaPreview(guide,height);return;}
  else{view.setReachable([]);view.setPath([]);}
 }
 let gridVisible=null,warmSignature='';
 bridge.subscribe(next=>{const selectedNow=next.placements?.find(p=>p.id===next.selectedIds?.[0]);const warmKey=selectedNow&&selectedNow.canMove?[selectedNow.id,selectedNow.column,selectedNow.row,selectedNow.levelId].join(':'):'';if(warmKey&&warmKey!==warmSignature&&!next.busy){warmSignature=warmKey;planner.warm(selectedNow);}
  if(clickMoveTokenId&&(next.sceneId!==context.sceneId||next.targetMode||!next.selectedIds?.includes(clickMoveTokenId)))cancelDrag();
  context=next;scheduleBuild();paintAbilityGuide();const value=context.grid?.visible!==false;if(view&&value!==gridVisible){gridVisible=value;view.setGrid(value);}});
 document.querySelector('#vtt-map-image')?.addEventListener('load',()=>{context=bridge.getContext();buildScene();});
 // Ability pickers' Skip buttons and range words are screen controls; on the 3D board they
 // are shown above the view, and pressing Skip runs the VTT's own skip.
 const relocated=new Map(),relocate=['.vtt-automation-area__controls','.vtt-automation-move__controls'];
 const tidyControls=()=>{for(const selector of relocate)for(const el of mapTransform.querySelectorAll(selector)){const home=el.parentElement;overlayHost.append(el);el.classList.add('vtt3d-board-controls');relocated.set(el,home);}
  for(const [el,home] of relocated)if(!home.isConnected){el.remove();relocated.delete(el);}};
 new MutationObserver(tidyControls).observe(mapTransform,{childList:true,subtree:true});
 overlayHost.addEventListener('pointerdown',e=>{if(!e.target.closest?.('[data-skip-automation-area],[data-skip-automation-move]'))return;e.preventDefault();e.stopPropagation();bridge.skipAbility?.(e);tidyControls();});
 const resizeObserver=new ResizeObserver(()=>view?.resize());resizeObserver.observe(host);

 function edgePan(dt){
  const pointer=drag?.moved?drag.pointer:null;if(!pointer||!dt||!view)return;
  const r=board.getBoundingClientRect(),m=Math.min(56,r.width*.08,r.height*.08),push=(v,lo,hi)=>v<lo+m?-(1-Math.max(0,v-lo)/m):v>hi-m?1-Math.max(0,hi-v)/m:0;
  const vx=push(pointer.clientX,r.left,r.right),vy=push(pointer.clientY,r.top,r.bottom);if(!vx&&!vy)return;
  const camera=view.camera,target=view.controls.target,forward=target.clone().sub(camera.position).setY(0);if(forward.lengthSq()<1e-6)return;forward.normalize();
  const right={x:-forward.z,z:forward.x},speed=Math.max(4,camera.position.distanceTo(target))*.9*Math.min(dt,.05);
  const shift={x:(right.x*vx-forward.x*vy)*speed,y:0,z:(right.z*vx-forward.z*vy)*speed};camera.position.add(shift);target.add(shift);view.controls.update();
  hoverSignature='';showHover(pointer,find(drag.id));
 }
 // The Height control (gm-vision.js) cuts the 3D board as it does the 2D one:
 // floors above the height drawn are hidden, with the tokens on them.
 function viewHeight(){const vision=window.gmVision;if(!vision)return null;if(context.isGM)return vision.height;const own=vision.playerStanding;return own?(vision.raised??own.height):null;}
 function syncLevels(){if(!view)return;const height=viewHeight();let level=-1;if(Number.isFinite(height)&&data?.levels?.length>1){level=0;data.levels.forEach((l,i)=>{if(l.height<=height+.5)level=i;});if(level===data.levels.length-1)level=-1;}
  if(level!==shownLevel){shownLevel=level;view.setLevel(level);lastTokenSignature='';}}
 // A raised token's line straight down, by the 2D board's own rule (height-tethers.js).
 let tetherModel=null,tetherSurfaces=[];
 function tethers(records){
  const tp=window.terrainPrototype,model=window.wallPrototype?.model,v=context.view||{},g=v.gridSize||64,ox=v.gridOffsets?.left||0,oy=v.gridOffsets?.top||0;if(!tp?.heightAt||!model)return [];
  if(model!==tetherModel){tetherModel=model;tetherSurfaces=roofSurfaces(model);}
  const list=[];
  for(const p of records){if(!Number.isFinite(p.z)||(shownLevel!==null&&shownLevel>=0&&p.level>shownLevel))continue;
   const ramps=(model.ramps||[]).map(r=>rampHeight(r,p.x,p.y)).filter(h=>h!==null&&h<=p.z+1e-6);
   const below=tetherSupport({x:p.x,y:p.y},p.z,tp.heightAt(ox+p.x*g,oy+p.y*g),tetherSurfaces,ramps.length?Math.max(...ramps):null);
   if(below!==null)list.push({id:p.id,x:p.x,y:p.y,top:p.z,bottom:below});}
  return list;
 }
 // The ground follows the live height field (Height tool, shared edits), at most ~8 times a second.
 let fieldShown=-1,fieldAt=0;
 function syncField(now){const tp=window.terrainPrototype,version=tp?.fieldVersion;if(!Number.isFinite(version)||version===fieldShown||now-fieldAt<120||!tp.field)return;fieldShown=version;fieldAt=now;view.setField(tp.field);}
 function frame(now){const dt=(now-lastTime)/1000;lastTime=now;
  // Layout is read once, before this frame writes any styles.
  const canvasRect=view&&!document.hidden?canvas.getBoundingClientRect():null,hostRect=canvasRect?overlayHost.getBoundingClientRect():null;
  if(view&&!document.hidden){
   edgePan(dt);syncLevels();syncField(now);
   // Token heights are worked out again only when the board, the ground or the walls change.
   const recordKey=[context.placements,window.terrainPrototype?.fieldVersion,window.wallPrototype?.revision,context.isGM,data];
   if(!recordsCache||recordKey.some((v,i)=>v!==recordsCache.key[i]))recordsCache={key:recordKey,records:(context.placements||[]).filter(p=>context.isGM||!p.hidden).map(world)};
   const records=recordsCache.records,signature=JSON.stringify([records,context.selectedIds]);if(signature!==lastTokenSignature){lastTokenSignature=signature;view.setTokens(records,context.selectedIds?.[0]);}
   // The ruler on the board, whether it measures a held token or the Measure tool.
   view.setMovementRoute(getCurrentMeasurementPresentation());
   effects?.update(context);for(const [name,layer] of layers){try{layer?.update?.(context,dt);}catch(error){console.error('[VTT 3D] layer',name,error);layers.delete(name);}}view.render(dt);
   const recordById=new Map(records.map(p=>[p.id,p]));if(held&&recordById.has(held.id))recordById.set(held.id,{...recordById.get(held.id),...held});view.setTethers(tethers([...recordById.values()]));
   // Hero minis on their tokens' bases (minis.mjs); a token with a mini hides its portrait (class vtt3d-mini).
   if(minis){if(profilesFor!==context.placements){profilesFor=context.placements;profiles=new Map((context.placements||[]).map(p=>[p.id,{hero:p.characterProfileId,monster:p.monsterId,name:p.name}]));}
    const result=minis.update([...recordById.values()],profiles,p=>shownLevel===null||shownLevel<0||p.level<=shownLevel,view.camera,dt);if(result.redraw)view.renderer.shadowMap.needsUpdate=true;view.setTokensWithoutBase?.(result.noBase);
    const key=[...result.ids].sort().join(',')+'|'+tokenLayer.childElementCount;if(key!==miniIds){miniIds=key;for(const node of tokenLayer.querySelectorAll('[data-placement-id]'))node.classList.toggle('vtt3d-mini',result.ids.has(node.dataset.placementId));}}
   const {width,height}=view.viewport();
   // Nothing to place again while the camera, the tokens and the floor cut stay as they were.
   const camera=view.camera,cameraKey=camera.matrixWorld.elements.join(',')+'|'+camera.projectionMatrix.elements[0]+'|'+width+'x'+height;
   const placeKey=cameraKey+'|'+shownLevel+'|'+tokenLayer.childElementCount+'|'+JSON.stringify([...recordById.values()]);
   const tokenNodes=tokenLayer.querySelectorAll('[data-placement-id]');let freshNode=false;for(const node of tokenNodes)if(!placedElements.has(node)){freshNode=true;break;}
   if(placeKey!==lastPlaceKey||freshNode){lastPlaceKey=placeKey;
   // Tokens sharing a square stand side by side, in their stack order, so each
   // can be seen and picked; the one in front is the one 'Bring to front' chose.
   const stacks=new Map();for(const p of recordById.values()){const key=[Math.round(p.x*2),Math.round(p.y*2),Math.round(p.z)].join(',');if(!stacks.has(key))stacks.set(key,[]);stacks.get(key).push(p);}
   const spread=new Map();for(const list of stacks.values()){if(list.length<2)continue;list.sort((a,b)=>(stackOrderOf(a.id)-stackOrderOf(b.id))||String(a.id).localeCompare(String(b.id)));list.forEach((p,i)=>spread.set(p.id,{offset:i-(list.length-1)/2,order:i}));}
   for(const node of tokenNodes){placedElements.add(node);const p=recordById.get(node.dataset.placementId);if(!p){node.style.setProperty('--vtt3d-visible','hidden');continue;}
    const foot=view.project(p),top=view.project({...p,z:p.z+Math.max(p.width,p.height)*1.1}),across=view.project({...p,x:p.x+Math.max(p.width,p.height)*.5});const size=Math.max(25,Math.min(110,Math.hypot(across.x-foot.x,across.y-foot.y)*2));
    const shared=spread.get(p.id);if(shared)foot.x+=shared.offset*size*.55;
    // Badges, HP bars and labels are sized in token units (board.css --tok-unit), so they scale with the token.
    node.style.setProperty('--tok-unit',`${(size/(64*Math.max(p.width,p.height))).toFixed(3)}px`);
    node.style.setProperty('--vtt3d-x',`${foot.x-size/2}px`);node.style.setProperty('--vtt3d-y',`${Math.min(foot.y-size*.12,top.y+size*.1)-size}px`);node.style.setProperty('--vtt3d-size',`${size}px`);
    node.style.setProperty('--vtt3d-visible',(shownLevel===null||shownLevel<0||p.level<=shownLevel)&&foot.visible&&foot.x>-size&&foot.y>-size&&foot.x<width+size&&foot.y<height+size?'visible':'hidden');node.style.setProperty('--vtt3d-order',String(Math.round(10000+foot.y)*4+(shared?shared.order:0)));node.dataset.terrainHeight=String(p.z);
   }
   }
  }
  if(view&&!document.hidden){
   // Page controls pinned to the board (door and window buttons, zone buttons):
   // data-vtt3d-anchor="x,y,height" in squares; data-vtt3d-level hides them with their floor.
   const anchored=overlayHost.querySelectorAll('[data-vtt3d-anchor]');let anchorKey=lastPlaceKey+'|'+anchored.length;for(const el of anchored)anchorKey+='|'+el.dataset.vtt3dAnchor+(el.dataset.vtt3dLevel||'');
   let freshAnchor=false;for(const el of anchored)if(!placedElements.has(el)){freshAnchor=true;break;}
   if(anchorKey!==lastAnchorKey||freshAnchor){lastAnchorKey=anchorKey;
   const rect=canvasRect;
   for(const el of anchored){placedElements.add(el);const [x,y,z]=el.dataset.vtt3dAnchor.split(',').map(Number);if(![x,y,z].every(Number.isFinite)){el.style.visibility='hidden';continue;}
    const q=view.project({x,y,z}),level=el.dataset.vtt3dLevel?levelIndex(el.dataset.vtt3dLevel):0,shown=q.visible&&(shownLevel===null||shownLevel<0||level<=shownLevel);
    el.style.left=`${rect.left-hostRect.left+q.x}px`;el.style.top=`${rect.top-hostRect.top+q.y}px`;el.style.visibility=shown?'':'hidden';}
   }
   const portalKey=[window.wallPrototype?.revision,document.querySelector('#wall-panel')?.hidden,context.isGM,window.terrainPrototype?.revision,context.sceneId].join('|');if(portalKey!==portalsAt){portalsAt=portalKey;window.wallPrototype?.refreshPortals?.();}
  }
  requestAnimationFrame(frame);}
 let portalsAt='',recordsCache=null,lastPlaceKey='',lastAnchorKey='';const placedElements=new WeakSet();
 function focus(point){if(!view)return;const goal=point&&typeof point==='object'?point:find(point)&&world(find(point));if(!goal)return;view.focus(goal);view.camera.position.copy(view.controls.target).add({x:13,y:17,z:16});view.controls.update();}
 const api={get ready(){return !!view;},
  // The held token as drawn on its landing square ({id,x,y,z}), or null.
  get held(){return held?{...held}:null;},get view(){return view;},get scene(){return view?.scene;},get camera(){return view?.camera;},get canvas(){return canvas;},bridge,pickAtClient,clientToMap,pick:event=>view?.pick(event),project:point=>view?.project(point),getContext:()=>bridge.getContext(),
  getTokenPoint:id=>{const p=find(id);return p&&view?view.project(world(p)):null;},focus,metrics:()=>view?{...view.metrics(),fog:false,effects:effects?.summary()}:null,requestRender:()=>{lastTokenSignature='';}};
 window.vtt3dRenderer=window.vtt3dView=api;
 addLayer('walls',createWallOverlayLayer);addLayer('terrain-brush',createTerrainBrushLayer);
 try{(await import('./layers/index.mjs')).register?.(window.vtt3d);}catch(error){console.error('[VTT 3D] layers',error);}
 await buildScene();
 document.dispatchEvent(new CustomEvent('vtt3d:ready'));requestAnimationFrame(frame);
}
mount().catch(error=>console.error('[VTT 3D]',error));
