import * as THREE from 'three';
import {normalizePlacementForRender} from '../../assets/js/ui/token-render-normalize.js';
import {getTokenLevelPresentation,resolveSceneTokenLevelState} from '../../assets/js/ui/token-levels.js';
import {rectBorder,overlayMesh,clearGroup,parseColor} from './surface-paint.mjs';
import {tokenLookSettings,footprintRect} from '../token-looks.mjs';

// The squares each creature stands on, as a faint square on the ground under it (Brandon, November 10, 2026: "there
// needs to be a light square around where a creature sits ... so you can tell they go all the way out to here. It
// should be faint, but visible."). A thin light line over a wider dark band reads on light and dark maps alike.
// On the ground it lies on the ground (any slope); off the ground (a plate, a ramp, flying) it lies flat at the
// token's height. It follows a held token and hides with its token (hidden tokens for players, the Height cut,
// another floor). Settings: token-looks.mjs TOKEN_LOOKS.footprint.
export function createTokenFootprintsLayer({guideScene,bridge,helpers}){
 const root=new THREE.Group();root.name='vtt-token-footprints';guideScene.add(root);
 let signature='',lastContext=null,lastQuick='';
 function collect(context,settings){
  const c=window.terrainContext?.(),state=c?.state,sceneId=state?.boardState?.activeSceneId;
  const gm=!!context.isGM,viewerLevelId=c?.levelId||'level-0',levelState=state&&sceneId?resolveSceneTokenLevelState(state,sceneId):null,held=window.vtt3dRenderer?.held||null;
  const list=[];
  for(const placement of context.placements||[]){
   const p=normalizePlacementForRender(placement);if(!p)continue;
   if(!gm&&p.hidden)continue;
   const rect=footprintRect(p,held,settings.minSize);if(!rect)continue;
   if(!gm&&levelState&&!getTokenLevelPresentation({...placement,...rect},levelState,{viewerLevelId,gmViewing:false,mode:'vision'}).visible)continue;
   const level=helpers.levelIndex(p.levelId||'level-0'),shown=helpers.shownLevel;if(shown!==null&&shown>=0&&level>shown)continue;
   const holding=held&&held.id===p.id,z=holding&&Number.isFinite(held.z)?held.z:bridge.heightFor(p.id);if(!Number.isFinite(z))continue;
   const cx=rect.column+rect.width/2,cy=rect.row+rect.height/2,onGround=Math.abs(z-helpers.groundAt(cx,cy))<.3;
   list.push({key:p.id,rect,z:Math.round(z*1000)/1000,onGround});
  }
  return list;
 }
 function rebuild(list,settings){
  clearGroup(root);if(!settings.show)return;
  const line=parseColor(settings.lineColor,'#ffffff').color,halo=parseColor(settings.haloColor,'#0b1218').color;
  for(const {rect,z,onGround} of list){
   const at=onGround?(x,y)=>helpers.groundAt(x,y):()=>z;
   if(settings.haloOpacity>0&&settings.haloWidth>0)root.add(overlayMesh(rectBorder(rect,at,{width:settings.haloWidth,lift:settings.lift}),{color:halo,opacity:settings.haloOpacity,order:1}));
   if(settings.lineOpacity>0)root.add(overlayMesh(rectBorder(rect,at,{width:settings.lineWidth,lift:settings.lift+.004}),{color:line,opacity:settings.lineOpacity,order:2}));
  }
 }
 const api={
  update(context){
   const settings=tokenLookSettings().footprint,held=window.vtt3dRenderer?.held;
   const quick=`${held?`${held.id}:${held.x}:${held.y}:${held.z}`:''}|${helpers.shownLevel}|${window.terrainPrototype?.revision}|${JSON.stringify(settings)}`;
   if(context===lastContext&&quick===lastQuick)return;lastContext=context;lastQuick=quick;
   const list=settings.show?collect(context,settings):[],key=JSON.stringify([list,settings]);
   if(key!==signature){signature=key;rebuild(list,settings);}
  },
  summary:()=>({footprints:root.children.length}),
  dispose(){clearGroup(root);guideScene.remove(root);if(window.vtt3dLayers?.tokenFootprints===api)delete window.vtt3dLayers.tokenFootprints;},
 };
 (window.vtt3dLayers??={}).tokenFootprints=api;return api;
}
