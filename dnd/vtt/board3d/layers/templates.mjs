import * as THREE from 'three';
import {createTemplateGeometry} from '../../assets/js/ui/template-geometry.js';
import {wallCubeBase,wallMaterial,wallSquareKey} from '../../assets/js/ui/wall-cubes.js';
import {isDrawModeActive} from '../../assets/js/ui/drawing-tool.js';
import {buildAreaVolume,templateSquares,areaColors,ensureAreaControlStyle,twoStep,wideLines} from '../area-volume.mjs';

// Templates on the 3D board. The template tool (board-interactions.js createTemplateTool) keeps the shapes, the
// rules and the commands; this layer draws its live shapes (window.vtt3dTemplateTool) and gives them their 3D handles.
//  - Areas are square blocks of see-through columns (area-volume.mjs): a radius covers the squares whose centres
//    are within it (a square block, 2N+1 tall), a rectangle turns in quarter turns and is as tall as its shorter
//    side. Each column stands on its own square's surface: the ground, or its floor's height.
//  - Walls are real 1x1x1 boxes on their base (wallCubeBase).
//  - Click an area (or a cube) to choose it; drag it to move it square by square over whatever is under the
//    pointer, onto an island too. A chosen rectangle has ⟳ (a quarter turn; R and Shift+R too); a chosen template
//    has ×, which asks "Remove?" first and removes on a second press within 3 s; Delete asks the same way.
const DEFAULT_COLOR='#38bdf8';

export function createTemplatesLayer({view,scene,guideScene,overlayHost,helpers}){
 ensureAreaControlStyle();
 const {normalizeSerializedTemplate}=createTemplateGeometry(()=>helpers.context.view||{});
 const areaRoot=new THREE.Group();areaRoot.name='vtt-templates';guideScene.add(areaRoot);
 const cubeRoot=new THREE.Group();cubeRoot.name='vtt-wall-templates';scene.add(cubeRoot);
 const box=new THREE.BoxGeometry(1,1,1),edges=new THREE.EdgesGeometry(box);
 // The 2D cube's faces: the top as the texture is, the west face 35% darker and the south face 18% (template-wall-renderer.js).
 {const shade=[.82,.65,1,.5,.82,.65],c=[];for(let f=0;f<6;f++)for(let v=0;v<4;v++)c.push(shade[f],shade[f],shade[f]);box.setAttribute('color',new THREE.Float32BufferAttribute(c,3));}
 const loader=new THREE.TextureLoader(),textures=new Map();
 const texture=material=>{if(!textures.has(material)){const t=loader.load(`/dnd/vtt/assets/images/wall-${material}.png`);t.colorSpace=THREE.SRGBColorSpace;textures.set(material,t);}return textures.get(material);};
 let volumes=[],pickable=[],cubeRecords=new Map(),corners=new Map(),signature='',report={areas:0,cubes:0,ghostCubes:0,controls:0};
 const disposeChildren=group=>{for(const child of [...group.children]){group.remove(child);child.traverse?.(o=>{if(o.geometry&&o.geometry!==box&&o.geometry!==edges)o.geometry.dispose();for(const m of [o.material].flat())m?.dispose?.();});}};

 const tool=()=>window.vtt3dTemplateTool||null;
 function boardState(){return window.terrainContext?.()?.state?.boardState||{};}
 function liveShapes(){
  const t=tool();if(t)return {shapes:[...t.shapes,...(t.preview?[t.preview]:[])],selectedId:t.selectedId};
  const bs=boardState(),raw=bs.templates?.[bs.activeSceneId];
  return {shapes:(Array.isArray(raw)?raw:Object.values(raw||{})).map(e=>normalizeSerializedTemplate(e)).filter(Boolean),selectedId:null};
 }
 function floorOf(shape){const id=shape.levelId||'level-0';if(id==='level-0')return null;const h=helpers.levelHeight(id);return Number.isFinite(h)&&h>0?h:null;}
 // Each square stands flat at its own surface: its floor's height, or the ground at the square's middle.
 const baseFor=shape=>{const floor=floorOf(shape);return floor===null?(column,row)=>helpers.groundAt(column+.5,row+.5):()=>floor;};
 function shownOn3d(shape){const shown=helpers.shownLevel;return shown===null||shown<0||helpers.levelIndex(shape.levelId||'level-0')<=shown;}
 // The 2D board's own level rule (applyTemplateLevelVisibility) leaves its result on the template's root.
 const shown2d=shape=>shape.isPreview||!shape.elements?.root?.hidden;

 function addArea(shape,selectedId){
  const {squares,height}=templateSquares(shape);if(!squares.length)return;
  const v=buildAreaVolume({squares,baseAt:baseFor(shape),height,color:shape.isPreview?shape.placementColor||DEFAULT_COLOR:shape.color||DEFAULT_COLOR,dashed:!!shape.isPreview,selected:shape.id===selectedId});
  v.target.userData.templateId=shape.id;areaRoot.add(v.group);volumes.push(v);if(!shape.isPreview){pickable.push(v.target);corners.set(shape.id,v.corner);}report.areas++;
 }
 // Wall templates: a box per standing cube (broken ones are rubble, drawn by the rubble layer), the hover cube while placing.
 function addWall(shape,selectedId){
  const bs=boardState(),config=bs.sceneState?.[bs.activeSceneId]||{},material=wallMaterial(shape.wallColor);
  const standing=(shape.squares||[]).filter(s=>s.broken!==true),chosen=selectedId===shape.id,selectedKey=chosen?shape.selectedSquareKey:null;
  const cubes=standing.map(square=>({square,base:wallCubeBase(shape,square,config,(x,y)=>helpers.groundAt(x,y))}));
  if(cubes.length){
   const mesh=new THREE.InstancedMesh(box,new THREE.MeshBasicMaterial({map:texture(material),vertexColors:true}),cubes.length),o=new THREE.Object3D();
   cubes.forEach(({square,base},i)=>{o.position.set(square.column+.5,base+.5,square.row+.5);o.updateMatrix();mesh.setMatrixAt(i,o.matrix);});
   mesh.castShadow=mesh.receiveShadow=true;mesh.userData={templateId:shape.id,cubes:cubes.map(({square,base})=>({...square,base,key:wallSquareKey(square)}))};
   cubeRoot.add(mesh);pickable.push(mesh);cubeRecords.set(shape.id,mesh.userData.cubes);
   const lines=[];for(const {base,square} of cubes){const p=edges.attributes.position.array;for(let i=0;i<p.length;i+=3)lines.push(p[i]+square.column+.5,p[i+1]+base+.5,p[i+2]+square.row+.5);}
   const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(lines,3));cubeRoot.add(new THREE.LineSegments(g,new THREE.LineBasicMaterial({color:'#000000',transparent:true,opacity:.55,toneMapped:false})));
   // A chosen wall is outlined bright, its picked cube brighter.
   if(chosen){const seg=[];for(const {square,base} of cubes){const p=edges.attributes.position.array;for(let i=0;i<p.length;i+=6)seg.push([p[i]+square.column+.5,p[i+1]+base+.5,p[i+2]+square.row+.5,p[i+3]+square.column+.5,p[i+4]+base+.5,p[i+5]+square.row+.5]);}
    areaRoot.add(wideLines(seg,{color:areaColors('#e2e8f0').edge,width:2,opacity:.95}));
    const picked=cubes.find(c=>wallSquareKey(c.square)===selectedKey);if(picked){const seg2=[],p=edges.attributes.position.array;for(let i=0;i<p.length;i+=6)seg2.push([p[i]+picked.square.column+.5,p[i+1]*1.04+picked.base+.5,p[i+2]+picked.square.row+.5,p[i+3]+picked.square.column+.5,p[i+4]*1.04+picked.base+.5,p[i+5]+picked.square.row+.5]);areaRoot.add(wideLines(seg2,{color:new THREE.Color('#fde68a'),width:3}));}}
   let corner=null;for(const c of cubes){const z=c.base+1;if(!corner||c.square.column+1>corner.x||(c.square.column+1===corner.x&&c.square.row<corner.y))corner={x:c.square.column+1,y:c.square.row,z};}corners.set(shape.id,corner);
   report.cubes+=cubes.length;
  }
  if(shape.hoverSquare){
   const square=shape.hoverSquare,base=wallCubeBase(shape,square,config,(x,y)=>helpers.groundAt(x,y));
   const ghost=new THREE.Mesh(box,new THREE.MeshBasicMaterial({map:texture(material),vertexColors:true,transparent:true,opacity:.45,depthWrite:false}));ghost.position.set(square.column+.5,base+.5,square.row+.5);cubeRoot.add(ghost);
   const outline=new THREE.LineSegments(edges.clone(),new THREE.LineDashedMaterial({color:'#ffffff',dashSize:.08,gapSize:.04,toneMapped:false}));outline.position.copy(ghost.position);outline.computeLineDistances();cubeRoot.add(outline);
   report.ghostCubes++;
  }
 }

 // ---- Controls on the chosen template: ⟳ for a rectangle, × to remove (two presses).
 let control=null,placedFor='';
 function controlFor(shape){
  if(control?.id===shape.id)return control;
  control?.el.remove();
  const el=document.createElement('div');el.className='vtt3d-area-control';el.dataset.vtt3dTemplateControl=shape.id;
  el.addEventListener('pointerdown',e=>e.stopPropagation());
  // The keys (R, Delete) are the board's: it keeps the focus after a press here.
  el.addEventListener('click',()=>setTimeout(()=>board?.focus({preventScroll:true})),true);
  let turn=null;if(shape.type==='rectangle'){turn=document.createElement('button');turn.type='button';turn.textContent='⟳';turn.title='Turn a quarter (R; Shift+R the other way)';
   turn.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();tool()?.handle('rotate-90',e,shape.id);});el.append(turn);}
  const remove=document.createElement('button');remove.type='button';remove.title='Remove (press twice)';el.append(remove);
  const ask=twoStep(remove,{label:'×',ask:'Remove?',run:()=>tool()?.handle('remove',new MouseEvent('click'),shape.id)});
  overlayHost.append(el);control={id:shape.id,el,ask};return control;
 }
 function dropControl(){control?.el.remove();control=null;}
 function placeControl(selectedId,shapes){
  const shape=selectedId&&shapes.find(s=>s.id===selectedId&&!s.isPreview),corner=shape&&corners.get(shape.id),t=tool();
  if(!shape||!corner||!t?.canManage(shape)){dropControl();report.controls=0;return;}
  const c=controlFor(shape),a=`${corner.x},${corner.y},${corner.z}`;if(c.el.dataset.vtt3dAnchor!==a)c.el.dataset.vtt3dAnchor=a;c.el.dataset.vtt3dLevel=shape.levelId||'level-0';
  c.el.style.setProperty('--area-edge','#'+areaColors(shape.type==='wall'?'#e2e8f0':shape.color||DEFAULT_COLOR).edge.getHexString(THREE.SRGBColorSpace));report.controls=1;
 }

 // While drawing or placing a template, the pointer is that tool's.
 const idle=()=>!isDrawModeActive()&&!tool()?.placement;
 function rebuild(list,selectedId){
  disposeChildren(areaRoot);disposeChildren(cubeRoot);for(const v of volumes)v.dispose();volumes=[];pickable=[];cubeRecords=new Map();corners=new Map();report={...report,areas:0,cubes:0,ghostCubes:0};
  for(const shape of list){try{if(shape.type==='wall')addWall(shape,selectedId);else addArea(shape,selectedId);}catch(error){console.error('[VTT 3D] template',shape.id,error);}}
  if(view.renderer?.shadowMap)view.renderer.shadowMap.needsUpdate=true;
 }
 const geometryKey=s=>[s.id,s.type,s.color,s.levelId,s.isPreview,s.center?.column,s.center?.row,s.radius,s.start?.column,s.start?.row,s.length,s.width,s.rotation,s.wallColor,
  s.type==='wall'?(s.squares||[]).map(q=>wallSquareKey(q)+(q.broken?'b':'')).join(';'):'',s.hoverSquare?wallSquareKey(s.hoverSquare):'',s.selectedSquareKey||''].join('|');
 function update(){
  const {shapes,selectedId}=liveShapes(),drawn=shapes.filter(s=>shown2d(s)&&shownOn3d(s));
  const key=[helpers.shownLevel,window.terrainPrototype?.revision,selectedId,...drawn.map(geometryKey)].join('\n');
  if(key!==signature){signature=key;rebuild(drawn,selectedId);placedFor='';}
  // Whether the chosen one may be changed now (not while a save is on its way) decides its controls.
  const chosen=selectedId&&shapes.find(s=>s.id===selectedId),manage=!!(chosen&&tool()?.canManage(chosen)),placeKey=`${selectedId}|${manage}`;
  if(placeKey!==placedFor){placedFor=placeKey;placeControl(selectedId,drawn);}
 }

 // ---- Picking: the nearest area or cube under the pointer, unless scenery in front hides it.
 const ray=new THREE.Raycaster(),ndc=new THREE.Vector2();
 function pickAt(clientX,clientY){
  if(!pickable.length)return null;const rect=view.renderer.domElement.getBoundingClientRect();ndc.set((clientX-rect.left)/rect.width*2-1,-(clientY-rect.top)/rect.height*2+1);ray.setFromCamera(ndc,view.camera);
  const hit=ray.intersectObjects(pickable,false)[0];if(!hit)return null;const front=view.castRay?.(ray);if(front&&front.distance<hit.distance-.02)return null;
  const id=hit.object.userData.templateId,cube=hit.object.isInstancedMesh?hit.object.userData.cubes[hit.instanceId]:null;
  return {templateId:id,point:{x:hit.point.x,y:hit.point.z},cube:cube?{column:cube.column,row:cube.row,elevation:cube.elevation??0,key:cube.key,base:cube.base-(cube.elevation??0)}:null};
 }
 function cubeAt(clientX,clientY){const hit=pickAt(clientX,clientY);return hit?.cube?{templateId:hit.templateId,...hit.cube}:null;}
 function screenRect(id){
  const cubes=cubeRecords.get(id);if(!cubes?.length)return null;const rect=view.renderer.domElement.getBoundingClientRect();let l=Infinity,t=Infinity,r=-Infinity,b=-Infinity;
  for(const c of cubes)for(const [dx,dz] of [[0,0],[1,0],[0,1],[1,1]])for(const dy of [0,1]){const p=helpers.project({x:c.column+dx,y:c.row+dz,z:c.base+dy});l=Math.min(l,p.x);r=Math.max(r,p.x);t=Math.min(t,p.y);b=Math.max(b,p.y);}
  return {left:rect.left+l,top:rect.top+t,right:rect.left+r,bottom:rect.top+b,width:r-l,height:b-t,x:rect.left+l,y:rect.top+t};
 }
 // The floor under the pointer while carrying a template: a plate's level, else the ground (vines too).
 const levelOfHit=hit=>hit.rampId||!hit.surfaceId?'level-0':hit.levelId||'level-0';
 const surface=document.querySelector('#vtt-map-surface'),board=document.querySelector('#vtt-board-canvas');let drag=null,pressedOn=null;
 function shapeById(id){return tool()?.shapes.find(s=>s.id===id)||null;}
 const onDown=e=>{
  pressedOn=null;const t=tool();if(e.button!==0||e.altKey||!t||!idle())return;const hit=pickAt(e.clientX,e.clientY);if(!hit)return;const shape=shapeById(hit.templateId);if(!shape)return;
  pressedOn=hit;board?.focus({preventScroll:true});
  if(!t.canManage(shape))return;
  // The area is taken hold of at its own foot: the point of its base plane under the pointer. It then slides on
  // that plane, keeping that point under the pointer, square by square.
  const base=baseHeightAt(shape,hit),on=view.pointOnPlane(e.clientX,e.clientY,base),start=on||hit.point,at=helpers.toMap(start.x,start.y);
  t.handle('node-pointerdown',e,shape.id,{cubeKey:hit.cube?.key??null,mapPoint:{x:at.x,y:at.y}});
  drag={id:shape.id,pointerId:e.pointerId,start,base,levelId:shape.levelId||'level-0',grabbed:pickable.filter(o=>o.userData.templateId===shape.id)};e.stopImmediatePropagation();
 };
 function baseHeightAt(shape,hit){
  if(hit.cube)return hit.cube.base??helpers.groundAt(hit.cube.column+.5,hit.cube.row+.5);
  return baseFor(shape)(Math.floor(hit.point.x),Math.floor(hit.point.y));
 }
 // The area as it was when taken hold of lies in front of what the pointer meets: what is behind it is not where
 // it is being taken. (Where it is now is left out: it is under the pointer by being moved there.)
 function areaInFront(objects,clientX,clientY,distance){
  const own=objects||[];if(!own.length)return false;const rect=view.renderer.domElement.getBoundingClientRect();
  ndc.set((clientX-rect.left)/rect.width*2-1,-(clientY-rect.top)/rect.height*2+1);ray.setFromCamera(ndc,view.camera);const hit=ray.intersectObjects(own,false)[0];
  return !!hit&&(!Number.isFinite(distance)||hit.distance<distance);
 }
 const surfaceDistance=(clientX,clientY,s)=>{const cam=view.camera.position;return Math.hypot(s.squares.x-cam.x,s.height-cam.y,s.squares.y-cam.z);};
 const onMove=e=>{if(!drag||e.pointerId!==drag.pointerId)return;e.stopImmediatePropagation();
  // To another height (onto an island, off it, from the pit to the rim): only where the pointer plainly points at a
  // surface at another height, not past the area itself.
  const s=window.vtt3d.clientToMap(e.clientX,e.clientY);
  if(s&&Math.abs(s.height-drag.base)>.5&&!areaInFront(drag.grabbed,e.clientX,e.clientY,surfaceDistance(e.clientX,e.clientY,s))){drag.base=s.height;drag.levelId=levelOfHit(s);}
  const p=view.pointOnPlane(e.clientX,e.clientY,drag.base);if(!p)return;
  const dx=Math.round(p.x-drag.start.x),dy=Math.round(p.y-drag.start.y),q=helpers.toMap(drag.start.x+dx,drag.start.y+dy);
  tool()?.handle('node-pointermove',e,drag.id,{mapPoint:{x:q.x,y:q.y},levelId:drag.levelId});};
 const onUp=e=>{if(!drag||e.pointerId!==drag.pointerId)return;const id=drag.id;drag=null;e.stopImmediatePropagation();tool()?.handle(e.type==='pointercancel'?'node-pointercancel':'node-pointerup',e,id);};
 const onClick=e=>{const hit=pressedOn;if(!hit||!tool())return;pressedOn=null;e.stopImmediatePropagation();tool().handle('node-click',e,hit.templateId,{cubeKey:hit.cube?.key??null});};
 const listeners=[['pointerdown',onDown],['pointermove',onMove],['pointerup',onUp],['pointercancel',onUp],['click',onClick]];
 for(const [type,fn] of listeners)surface?.addEventListener(type,fn,true);
 // Delete on the chosen template asks first (board-interactions.js handleKeydown on the 3D board).
 function requestRemove(id){const shape=shapeById(id);if(!shape||!tool()?.canManage(shape))return false;const c=control?.id===id?control:(placeControl(id,[shape]),control);return c?.ask.press()??false;}

 const api={update,cubeAt,screenRect,requestRemove,pickAt,summary:()=>({...report}),
  dispose(){for(const [type,fn] of listeners)surface?.removeEventListener(type,fn,true);dropControl();disposeChildren(areaRoot);disposeChildren(cubeRoot);for(const v of volumes)v.dispose();guideScene.remove(areaRoot);scene.remove(cubeRoot);box.dispose();edges.dispose();for(const t of textures.values())t.dispose();if(window.vtt3dLayers?.templates===api)delete window.vtt3dLayers.templates;}};
 (window.vtt3dLayers??={}).templates=api;return api;
}
