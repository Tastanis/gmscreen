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
// A body (placement.dead: the Director's "Dead or unconscious" in token settings) also gets a red ring round its base
// (Brandon, November 25, 2026: "a big skull symbol or something on it and a red ring around its base ... so I can show
// where bodies are"). The skull is on the token itself (board-interactions paintDeadMark). TOKEN_LOOKS.body.
/** A flat ring round a square footprint, following the surface: triangles for overlayMesh. */
function ring(rect,at,{inner,outer,lift,steps=48}){
 const cx=rect.column+rect.width/2,cy=rect.row+rect.height/2,r=Math.max(rect.width,rect.height)/2,out=[];
 const p=(radius,a)=>{const x=cx+Math.cos(a)*radius,y=cy+Math.sin(a)*radius;return [x,at(x,y)+lift,y];};
 for(let i=0;i<steps;i++){const a=i/steps*Math.PI*2,b=(i+1)/steps*Math.PI*2;out.push(...p(r*outer,a),...p(r*inner,a),...p(r*outer,b),...p(r*inner,a),...p(r*inner,b),...p(r*outer,b));}
 return out;
}
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
   const rect=footprintRect(p,held,p.dead?1:settings.minSize);if(!rect)continue;
   if(!gm&&levelState&&!getTokenLevelPresentation({...placement,...rect},levelState,{viewerLevelId,gmViewing:false,mode:'vision'}).visible)continue;
   const level=helpers.levelIndex(p.levelId||'level-0'),shown=helpers.shownLevel;if(shown!==null&&shown>=0&&level>shown)continue;
   const holding=held&&held.id===p.id,z=holding&&Number.isFinite(held.z)?held.z:bridge.heightFor(p.id);if(!Number.isFinite(z))continue;
   const cx=rect.column+rect.width/2,cy=rect.row+rect.height/2,onGround=Math.abs(z-helpers.groundAt(cx,cy))<.3;
   list.push({key:p.id,rect,z:Math.round(z*1000)/1000,onGround,...(p.dead?{dead:true}:{})});
  }
  return list;
 }
 function rebuild(list,settings,body){
  clearGroup(root);
  const line=parseColor(settings.lineColor,'#ffffff').color,halo=parseColor(settings.haloColor,'#0b1218').color,red=parseColor(body.ringColor,'#e11d2f').color,dark=parseColor(body.ringEdgeColor,'#2a0508').color;
  for(const {rect,z,onGround,dead} of list){
   const at=onGround?(x,y)=>helpers.groundAt(x,y):()=>z;
   if(dead&&body.show){
    root.add(overlayMesh(ring(rect,at,{inner:body.ringInner-body.ringEdge,outer:body.ringOuter+body.ringEdge,lift:settings.lift+.008}),{color:dark,opacity:body.ringEdgeOpacity,order:3}));
    root.add(overlayMesh(ring(rect,at,{inner:body.ringInner,outer:body.ringOuter,lift:settings.lift+.012}),{color:red,opacity:body.ringOpacity,order:4}));
   }
   if(!settings.show)continue;
   if(settings.haloOpacity>0&&settings.haloWidth>0)root.add(overlayMesh(rectBorder(rect,at,{width:settings.haloWidth,lift:settings.lift}),{color:halo,opacity:settings.haloOpacity,order:1}));
   if(settings.lineOpacity>0)root.add(overlayMesh(rectBorder(rect,at,{width:settings.lineWidth,lift:settings.lift+.004}),{color:line,opacity:settings.lineOpacity,order:2}));
  }
 }
 const api={
  update(context){
   const looks=tokenLookSettings(),settings=looks.footprint,body=looks.body,held=window.vtt3dRenderer?.held;
   const quick=`${held?`${held.id}:${held.x}:${held.y}:${held.z}`:''}|${helpers.shownLevel}|${window.terrainPrototype?.revision}|${JSON.stringify([settings,body])}`;
   if(context===lastContext&&quick===lastQuick)return;lastContext=context;lastQuick=quick;
   // With the faint squares switched off, only bodies are collected: their ring still shows.
   const list=(settings.show||body.show?collect(context,settings):[]).filter(entry=>settings.show||entry.dead),key=JSON.stringify([list,settings,body]);
   if(key!==signature){signature=key;rebuild(list,settings,body);}
  },
  summary:()=>({footprints:root.children.length,bodies:root.children.filter(child=>child.renderOrder===4).length}),
  dispose(){clearGroup(root);guideScene.remove(root);if(window.vtt3dLayers?.tokenFootprints===api)delete window.vtt3dLayers.tokenFootprints;},
 };
 (window.vtt3dLayers??={}).tokenFootprints=api;return api;
}
