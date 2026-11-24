import * as THREE from 'three';
import {collectPersistentZones} from '../../assets/js/ui/persistent-zone-renderer.js';
import {resolvePersistentZoneLevelId} from '../../assets/js/ui/persistent-zone-geometry.js';
import {floorElevations} from '../../assets/js/state/normalize/floor-elevation.js';
import {resolveTemplateLevelPresentation} from '../../assets/js/ui/template-presentation.js';
import {buildLevelViewModel} from '../../assets/js/state/normalize/map-levels.js';
import {cameraKey,createOcclusionPass} from './surface-paint.mjs';
import {buildAreaVolume,areaColors,ensureAreaControlStyle,twoStep} from '../area-volume.mjs';

const ZONE_COLOR='#ff8a29';

export function createPersistentZonesLayer({guideScene,overlayHost,helpers,view,bridge}){
 ensureAreaControlStyle();
 const root=new THREE.Group();root.name='vtt-persistent-zones';guideScene.add(root);
 const tags=new Map(),occlusion=createOcclusionPass(view);let signature='',volumes=[],placed=[],report={zones:0,squares:0,controls:0},lastContext=null,lastQuick='';
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
   let {squares,height}=areaOf(zone);
   if(!c.isGM){
    const levels=buildLevelViewModel({mapLevels:c.mapLevels});
    const g=c.view.gridSize,offset=c.view.gridOffsets;
    squares=squares.filter(({column,row})=>resolveTemplateLevelPresentation({levelId},c.view,{viewerLevelId:c.viewerLevelId,levels},{pixelBounds:{left:offset.left+column*g,top:offset.top+row*g,width:g,height:g}}).visible);
   }if(!squares.length)continue;
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
   const ask=twoStep(end,{label:'End',ask:'End?',run:async()=>{
    end.disabled=true;end.textContent='Ending…';
    try{await bridge.endZone(zone.id);}catch(error){console.warn('[VTT] persistent zone removal failed',error);}
    finally{end.disabled=false;end.textContent='End';}
   }});
   entry={el,badge,name,meta,end,ask};tags.set(zone.id,entry);
  }
  const label=String(zone.label||zone.abilityName||''),owner=String(zone.ownerName||'Owner'),upkeep=[zone.upkeep?.cost?`${zone.upkeep.cost} ${zone.upkeep.resource||'Resource'}/turn`:'',zone.terrainCost>1?'difficult':'',zone.endDue?'time up':''].filter(Boolean).join(' • ')||'no upkeep';
  entry.badge.title=`${label} — ${owner} • ${upkeep}`;entry.name.textContent=label;entry.meta.textContent=`${owner} • ${upkeep}`;
  return entry;
 }
 function update(context){
  const quick=`${helpers.shownLevel}|${window.terrainPrototype?.revision}`;
  if(context!==lastContext||quick!==lastQuick){lastContext=context;lastQuick=quick;
   const zones=collectPersistentZones((context.placements||[]).filter(p=>context.isGM||!p.hidden));
   const key=JSON.stringify([zones,quick,context.viewerLevelId,context.mapLevels,context.view,context.isGM,zones.map(z=>bridge.canEndZone(z))]);
   if(key!==signature){signature=key;rebuild(zones);
    const keep=new Set(placed.map(p=>p.zone.id));for(const [id,entry] of tags)if(!keep.has(id)){entry.el.remove();tags.delete(id);}
    for(const p of placed){const entry=tagFor(p.zone);entry.end.hidden=!bridge.canEndZone(p.zone);const a=`${p.anchor.x},${p.anchor.y},${p.anchor.z}`;if(entry.el.dataset.vtt3dAnchor!==a)entry.el.dataset.vtt3dAnchor=a;entry.el.dataset.vtt3dLevel=p.levelId;}
    report.controls=tags.size;}}
  // A tag behind scenery is hidden, as the zone corner it marks is (looked at again only after the camera moves).
  if(placed.length)occlusion.update(placed.map(p=>({el:tags.get(p.zone.id)?.el,anchor:p.anchor})).filter(item=>item.el),cameraKey(view)+signature);
 }
 const api={update,summary:()=>({...report}),dispose(){clear();guideScene.remove(root);for(const entry of tags.values())entry.el.remove();tags.clear();if(window.vtt3dLayers?.persistentZones===api)delete window.vtt3dLayers.persistentZones;}};
 (window.vtt3dLayers??={}).persistentZones=api;return api;
}
