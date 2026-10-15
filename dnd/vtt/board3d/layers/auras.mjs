import * as THREE from 'three';
import {verticalFloorDistance} from '../../assets/js/state/normalize/floor-elevation.js';
import {normalizePlacementForRender} from '../../assets/js/ui/token-render-normalize.js';
import {getRenderableAurasForPlacement} from '../../assets/js/ui/token-aura-records.js';
import {getTokenLevelPresentation,resolveSceneTokenLevelState} from '../../assets/js/ui/token-levels.js';
import {rectFill,rectBorder,overlayMesh,clearGroup,parseColor} from './surface-paint.mjs';

// Token auras on the 3D board, by the rules of token-aura-renderer.js: a square block reaching `radius` squares
// past every edge of the token (Draw Steel counts diagonals as 1), filled at 18% with a 2px border at 45%.
// Hidden tokens' auras are the GM's only; a player sees an aura only when its token is shown on their floor
// and the floors are no further apart than its radius (verticalFloorDistance). An aura lies where its token
// stands: on the ground under it when the token is on the ground, flat at its height on a floor or in the air.
// A token being dragged or click-moved takes its aura along (vtt3dRenderer.held).
export function createAurasLayer({guideScene,helpers,bridge}){
 const root=new THREE.Group();root.name='vtt-token-auras';guideScene.add(root);
 let signature='',lastContext=null,lastQuick='',report={auras:0};
 function rebuild(list){
  clearGroup(root);report={auras:0};const g=helpers.gridSize;
  for(const item of list){
   const {rect,color,at}=item,{color:c}=parseColor(color,'#3b82f6');
   root.add(overlayMesh(rectFill(rect,at,.045),{color:c,opacity:.18,order:1}));
   const border=rectBorder(rect,at,{width:2/g,lift:.057});
   root.add(overlayMesh(border,{color:c,opacity:.45,order:2}),overlayMesh(border,{color:c,opacity:.45,order:2,ghost:true}));
   report.auras++;
  }
 }
 function collect(context){
  const c=window.terrainContext?.(),state=c?.state,sceneId=state?.boardState?.activeSceneId;if(!state||!sceneId)return [];
  const gm=!!context.isGM,viewerLevelId=c.levelId||'level-0',levelState=resolveSceneTokenLevelState(state,sceneId),held=window.vtt3dRenderer?.held||null;
  const list=[];
  for(const placement of context.placements||[]){
   const p=normalizePlacementForRender(placement);if(!p)continue;
   if(!gm&&p.hidden)continue;
   // Where the token is drawn: its square, or the square it is held over.
   const holding=held&&held.id===p.id,column=holding?held.x-p.width/2:p.column,row=holding?held.y-p.height/2:p.row;
   if(!gm&&!getTokenLevelPresentation({...placement,column,row,width:p.width,height:p.height},levelState,{viewerLevelId,gmViewing:false,mode:'vision'}).visible)continue;
   const auras=getRenderableAurasForPlacement(placement);if(!auras.length)continue;
   const level=helpers.levelIndex(p.levelId||'level-0'),shown=helpers.shownLevel;if(shown!==null&&shown>=0&&level>shown)continue;
   const z=holding&&Number.isFinite(held.z)?held.z:bridge.heightFor(p.id);if(!Number.isFinite(z))continue;
   const cx=column+p.width/2,cy=row+p.height/2,onGround=Math.abs(z-helpers.groundAt(cx,cy))<.3;
   const at=onGround?(x,y)=>helpers.groundAt(x,y):()=>z;
   for(const aura of auras){
    const radius=Math.max(1,Math.min(20,parseInt(aura.radius,10)||1));
    const distance=verticalFloorDistance(placement,{levelId:viewerLevelId},levelState);if(!gm&&(distance===null||distance>radius))continue;
    list.push({key:`${p.id}:${aura.id||'manual'}`,rect:{column:column-radius,row:row-radius,width:p.width+radius*2,height:p.height+radius*2},color:typeof aura.color==='string'?aura.color:'#3b82f6',at,z,onGround});
   }
  }
  return list;
 }
 function update(context){
  const held=window.vtt3dRenderer?.held,quick=`${held?`${held.id}:${held.x}:${held.y}:${held.z}`:''}|${helpers.shownLevel}|${window.terrainPrototype?.revision}`;
  if(context===lastContext&&quick===lastQuick)return;lastContext=context;lastQuick=quick;
  const list=collect(context),key=JSON.stringify(list.map(a=>[a.key,a.rect,a.color,a.z,a.onGround]));
  if(key!==signature){signature=key;rebuild(list);}
 }
 const api={update,summary:()=>({...report}),dispose(){clearGroup(root);guideScene.remove(root);if(window.vtt3dLayers?.auras===api)delete window.vtt3dLayers.auras;}};
 (window.vtt3dLayers??={}).auras=api;return api;
}
