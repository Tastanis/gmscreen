import * as THREE from 'three';
import {collectPersistentZones} from '../../assets/js/ui/persistent-zone-renderer.js';
import {resolvePersistentZoneLevelId} from '../../assets/js/ui/persistent-zone-geometry.js';
import {floorElevations} from '../../assets/js/state/normalize/floor-elevation.js';
import {cameraKey,createOcclusionPass} from './surface-paint.mjs';
import {buildAreaVolume,areaColors,ensureAreaControlStyle,twoStep} from '../area-volume.mjs';

// Persistent zones on the 3D board. board-interactions.js keeps the zones and draws them in its 2D layer
// (persistent-zone-renderer.js); that layer still decides which zones this viewer is shown and which may be
// ended. Here each shown zone is a see-through volume (area-volume.mjs) over its squares, as tall as its area is
// wide (the shorter side; 1 for a line or a wall-shaped zone), each column on its own square's surface. Its ⚡
// tag sits at the top corner; hovering it shows the zone's name, owner and upkeep, and End asks "End?" first and
// ends on a second press within 3 s, by pressing the 2D zone's own End button (the board's own code).
const ZONE_COLOR='#ff8a29';

export function createPersistentZonesLayer({guideScene,overlayHost,helpers,view}){
 ensureAreaControlStyle();
 const root=new THREE.Group();root.name='vtt-persistent-zones';guideScene.add(root);
 const tags=new Map(),occlusion=createOcclusionPass(view);let signature='',volumes=[],placed=[],report={zones:0,squares:0,controls:0},time=0,shown2d={zones:new Set(),ends:new Set(),key:''},checkedAt=-1,lastContext=null,lastQuick='';
 const layer2d=()=>document.querySelector('#vtt-map-transform .vtt-persistent-zones');
 // What the 2D layer shows this viewer: zone ids drawn, and those with an End button.
 function read2d(){const layer=layer2d(),zones=new Set(),ends=new Set();if(layer&&!layer.hidden){for(const cell of layer.querySelectorAll('[data-zone-id]'))zones.add(cell.dataset.zoneId);for(const b of layer.querySelectorAll('[data-zone-end]'))ends.add(b.dataset.zoneEnd);}return {zones,ends,key:[...zones].join(',')+'|'+[...ends].join(',')};}
 function shownOn3d(levelId){const s=helpers.shownLevel;return s===null||s<0||helpers.levelIndex(levelId)<=s;}
 function areaOf(zone){
  if(Array.isArray(zone.squares)&&zone.squares.length)return {squares:zone.squares.map(s=>({column:Number(s.column),row:Number(s.row)})),height:1};
  const t=zone.template||{},column=Number(t.column),row=Number(t.row),w=Number(t.width),h=Number(t.height);
  if(![column,row,w,h].every(Number.isFinite)||w<=0||h<=0||w*h>20000)return {squares:[],height:1};
  const squares=[];for(let x=0;x<w;x++)for(let y=0;y<h;y++)squares.push({column:column+x,row:row+y});
  return {squares,height:Math.min(w,h)<=1?1:Math.min(w,h)};
 }
 function clear(){for(const v of volumes){root.remove(v.group);v.dispose();}volumes=[];}
 function rebuild(zones){
  clear();report={zones:0,squares:0,controls:0};placed=[];const c=helpers.context,heights=floorElevations(c.mapLevels||{levels:c.levels});
  for(const zone of zones){
   const levelId=resolvePersistentZoneLevelId(zone);if(!shownOn3d(levelId))continue;
   const floor=levelId==='level-0'?null:heights.get(levelId);if(levelId!=='level-0'&&!Number.isFinite(floor))continue;
   const {squares,height}=areaOf(zone);if(!squares.length)continue;
   const v=buildAreaVolume({squares,height,color:ZONE_COLOR,baseAt:floor===null?(x,y)=>helpers.groundAt(x+.5,y+.5):()=>floor});
   root.add(v.group);volumes.push(v);placed.push({zone,levelId,anchor:v.corner});report.zones++;report.squares+=v.cells;
  }
 }
 function tagFor(zone){
  let entry=tags.get(zone.id);
  if(!entry){
   const el=document.createElement('div');el.className='vtt3d-zone-tag';el.dataset.vtt3dZone=zone.id;el.style.setProperty('--area-edge','#'+areaColors(ZONE_COLOR).edge.getHexString(THREE.SRGBColorSpace));
   const badge=document.createElement('div');badge.className='vtt3d-zone-tag__badge';badge.textContent='⚡';
   const body=document.createElement('div');body.className='vtt3d-zone-tag__body';
   const name=document.createElement('div');name.className='vtt3d-zone-tag__name';const meta=document.createElement('div');meta.className='vtt3d-zone-tag__meta';
   const end=document.createElement('button');end.type='button';end.className='vtt3d-zone-tag__end';end.title='End this zone (press twice)';
   body.append(name,meta,end);el.append(badge,body);overlayHost.append(el);
   // The board pans and selects on pointerdown; the 2D layer stops that for its controls, and so does this one.
   el.addEventListener('pointerdown',e=>e.stopPropagation());
   const ask=twoStep(end,{label:'End',ask:'End?',run:()=>{const own=layer2d()?.querySelector(`[data-zone-end="${CSS.escape(zone.id)}"]`);if(!own||own.disabled)return;own.click();follow(own,end);}});
   entry={el,badge,name,meta,end,ask};tags.set(zone.id,entry);
  }
  const label=String(zone.label||zone.abilityName||''),owner=String(zone.ownerName||'Owner'),upkeep=[zone.upkeep?.cost?`${zone.upkeep.cost} ${zone.upkeep.resource||'Resource'}/turn`:'',zone.terrainCost>1?'difficult':'',zone.endDue?'time up':''].filter(Boolean).join(' • ')||'no upkeep';
  entry.badge.title=`${label} — ${owner} • ${upkeep}`;entry.name.textContent=label;entry.meta.textContent=`${owner} • ${upkeep}`;
  return entry;
 }
 // While the 2D End button is busy ("Ending…"), this one says the same, until the zone is gone or it is free again.
 function follow(own,mine){const step=()=>{if(!mine.isConnected)return;mine.disabled=own.disabled;mine.textContent=own.textContent;if(own.isConnected&&own.disabled)setTimeout(step,150);else if(!own.isConnected)mine.disabled=true;};step();}
 function update(context,dt){
  time+=Math.min(dt||0,.1);
  if(time-checkedAt>.4||checkedAt<0){checkedAt=time;shown2d=read2d();}
  const quick=`${shown2d.key}|${helpers.shownLevel}|${window.terrainPrototype?.revision}`;
  if(context!==lastContext||quick!==lastQuick){lastContext=context;lastQuick=quick;
   const zones=collectPersistentZones((context.placements||[]).filter(p=>context.isGM||!p.hidden)).filter(z=>shown2d.zones.has(z.id));
   const key=JSON.stringify([zones,quick]);
   if(key!==signature){signature=key;rebuild(zones);
    const keep=new Set(placed.map(p=>p.zone.id));for(const [id,entry] of tags)if(!keep.has(id)){entry.el.remove();tags.delete(id);}
    for(const p of placed){const entry=tagFor(p.zone);entry.end.hidden=!shown2d.ends.has(p.zone.id);const a=`${p.anchor.x},${p.anchor.y},${p.anchor.z}`;if(entry.el.dataset.vtt3dAnchor!==a)entry.el.dataset.vtt3dAnchor=a;entry.el.dataset.vtt3dLevel=p.levelId;}
    report.controls=tags.size;}}
  // A tag behind scenery is hidden, as the zone corner it marks is (looked at again only after the camera moves).
  if(placed.length)occlusion.update(placed.map(p=>({el:tags.get(p.zone.id)?.el,anchor:p.anchor})).filter(item=>item.el),cameraKey(view)+signature);
 }
 const api={update,summary:()=>({...report}),dispose(){clear();guideScene.remove(root);for(const entry of tags.values())entry.el.remove();tags.clear();if(window.vtt3dLayers?.persistentZones===api)delete window.vtt3dLayers.persistentZones;}};
 (window.vtt3dLayers??={}).persistentZones=api;return api;
}
