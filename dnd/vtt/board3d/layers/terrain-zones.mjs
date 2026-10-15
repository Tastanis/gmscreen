import * as THREE from 'three';
import {zoneGeometry,zoneColor,zoneSurface,BASE_LEVEL_ID} from '../../assets/js/ui/terrain-zones.mjs';
import {floorElevations} from '../../assets/js/state/normalize/floor-elevation.js';
import {zoomAt,cameraKey,createOcclusionPass} from './surface-paint.mjs';
import {areaColors,wideLines} from '../area-volume.mjs';

// Tagged terrain zones (difficult terrain and the like) on the 3D board. terrain-zones-overlay.js keeps the zones,
// the rules, the corner switch and each viewer's choice. A zone stays flat on the board: each square lies flat at
// its own height (its surface height or floor, or the ground at the square's middle), filled in the zone's colour
// made clean and saturated (stronger where it costs extra), its outline a bright 2 px edge over a dark casing
// (dashed for a GM-only zone). Every floor up to the Height cut shows its zones; the names follow the 2D board's
// rule (ground zones, and those of the floor the page is on), as readable labels, hidden behind scenery.
export function createTerrainZonesLayer({guideScene,overlayHost,helpers,view}){
 const root=new THREE.Group();root.name='vtt-terrain-zones';guideScene.add(root);
 const labels=new Map(),occlusion=createOcclusionPass(view);let signature='',placedAt='',placed=[],report={zones:0,squares:0,labels:0},lastKey='',lastList=null;
 const ctx=()=>window.terrainContext?.()||null;
 function shownOn3d(levelId){const s=helpers.shownLevel;return s===null||s<0||helpers.levelIndex(levelId)<=s;}
 function clear(){for(const child of [...root.children]){root.remove(child);child.traverse(o=>{o.geometry?.dispose();for(const m of [o.material].flat())m?.dispose?.();});}}
 function rebuild(c,zones){
  clear();report={zones:0,squares:0,labels:0};placed=[];
  const floors=floorElevations(c.state.boardState.sceneState?.[c.state.boardState.activeSceneId]?.mapLevels);
  const fills=[],fillColors=[],byColor=new Map();
  for(const zone of zones){
   if(!shownOn3d(zone.levelId))continue;
   const surface=zoneSurface(zone,floors.get(zone.levelId)??0),ground=zone.levelId===BASE_LEVEL_ID&&zone.surfaceHeight===null;
   const heightOf=(x,y)=>(ground?helpers.groundAt(x+.5,y+.5):surface)+.05;
   const {edge,fill}=areaColors(zoneColor(zone.tag)),alpha=zone.cost>1?.26:.15,dash=!!zone.gmOnly;
   const lineKey=edge.getHexString()+(dash?'d':''),lines=byColor.get(lineKey)||{edge,dash,segments:[]};byColor.set(lineKey,lines);
   const heights=new Map(zone.squares.map(([x,y])=>[`${x},${y}`,heightOf(x,y)]));
   for(const [x,y] of zone.squares){
    const h=heights.get(`${x},${y}`);
    for(const p of [[x,h,y],[x+1,h,y],[x+1,h,y+1],[x,h,y],[x+1,h,y+1],[x,h,y+1]]){fills.push(...p);fillColors.push(fill.r,fill.g,fill.b,alpha);}
    for(const [nx,ny,ax,ay,bx,by] of [[x,y-1,x,y,x+1,y],[x+1,y,x+1,y,x+1,y+1],[x,y+1,x+1,y+1,x,y+1],[x-1,y,x,y+1,x,y]])if(!heights.has(`${nx},${ny}`))lines.segments.push([ax,h+.01,ay,bx,h+.01,by]);
    report.squares++;
   }
   // The 2D board names ground zones and those of the floor the page is on (terrain-zones-overlay.js draw()).
   if(zone.levelId===BASE_LEVEL_ID||zone.levelId===c.levelId){
    const shape=zoneGeometry(zone,(x,y)=>({x,y})),[lx,ly]=shape.labelSquare,name=zone.label||zone.tag;
    placed.push({zone,color:'#'+edge.getHexString(THREE.SRGBColorSpace),text:(name.length>16?name.slice(0,15)+'…':name)+(zone.cost>1?' ×'+zone.cost:'')+(zone.gmOnly?' (GM)':''),anchor:{x:lx+.5,y:ly+.5,z:heightOf(lx,ly)+.02}});
   }
   report.zones++;
  }
  if(fills.length){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(fills,3));g.setAttribute('color',new THREE.Float32BufferAttribute(fillColors,4));
   const m=new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,side:THREE.DoubleSide,forceSinglePass:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3,toneMapped:false});const o=new THREE.Mesh(g,m);o.renderOrder=1;o.frustumCulled=false;root.add(o);}
  for(const {edge,dash,segments} of byColor.values()){if(!segments.length)continue;
   root.add(wideLines(segments,{color:new THREE.Color('#0b1020'),width:4.5,opacity:.5,dashed:dash,renderOrder:7}));
   root.add(wideLines(segments,{color:edge,width:2,opacity:1,dashed:dash,renderOrder:8}));}
 }
 function labelFor(id){
  let el=labels.get(id);
  if(!el){el=document.createElement('div');el.dataset.vtt3dTerrainZone=id;
   el.style.cssText='position:absolute;white-space:nowrap;pointer-events:none;font:700 12px/1 system-ui,sans-serif;color:#f8fafc;padding:3px 7px;border-radius:9px;background:rgba(10,16,30,.72);border:1.5px solid var(--zone-edge,#fff);text-shadow:0 1px 2px #000;transform-origin:50% 50%';
   overlayHost.append(el);labels.set(id,el);}
  return el;
 }
 function update(){
  const c=ctx(),zones=window.terrainZones;if(!c||!zones)return;
  // Each person's own Zones switch, and the GM's switch for the players (terrain-zones-overlay.js).
  const list=zones.zones,show=list.length>0&&zones.visible&&(c.isGM||!zones.hiddenFromPlayers);
  const quick=`${show}|${helpers.shownLevel}|${window.terrainPrototype?.revision}|${helpers.gridSize}|${c.levelId}`;
  if(list!==lastList||quick!==lastKey){lastList=list;lastKey=quick;const key=quick+'|'+JSON.stringify(list.map(z=>[z.id,z.tag,z.label,z.cost,z.levelId,z.surfaceHeight,z.gmOnly,z.squares]));
   if(key!==signature){signature=key;rebuild(c,show?list:[]);placedAt='';
    const keep=new Set(placed.map(p=>p.zone.id));for(const [id,el] of labels)if(!keep.has(id)){el.remove();labels.delete(id);}
    for(const p of placed){const el=labelFor(p.zone.id);el.textContent=p.text;el.style.setProperty('--zone-edge',p.color);el.dataset.vtt3dAnchor=`${p.anchor.x},${p.anchor.y},${p.anchor.z}`;el.dataset.vtt3dLevel=p.zone.levelId;}
    report.labels=labels.size;}}
  if(placed.length){const k=cameraKey(view)+signature;
   // Sized with the board's zoom as the 2D label is, but never too small to read or too big.
   if(k!==placedAt){placedAt=k;const g=helpers.gridSize;for(const p of placed){const el=labels.get(p.zone.id);if(el)el.style.transform=`translate(-50%,-50%) scale(${Math.max(.8,Math.min(1.3,zoomAt(helpers,p.anchor.x,p.anchor.y,p.anchor.z)*g*.2/12)).toFixed(3)})`;}}
   occlusion.update(placed.map(p=>({el:labels.get(p.zone.id),anchor:p.anchor})).filter(item=>item.el),k);}
 }
 const api={update,summary:()=>({...report}),dispose(){clear();guideScene.remove(root);for(const el of labels.values())el.remove();labels.clear();if(window.vtt3dLayers?.terrainZones===api)delete window.vtt3dLayers.terrainZones;}};
 (window.vtt3dLayers??={}).terrainZones=api;return api;
}
