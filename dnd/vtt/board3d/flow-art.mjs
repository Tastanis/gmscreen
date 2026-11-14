// A map art material that flows (Brandon's Dead Root notes, November 13, 2026: "this should be blood pouring out"):
// index.json "materials": {"<name>": {"animation": "flow", "flowSpeed": 0.25}}. Its textures slide along their own
// V direction by flowSpeed (texture lengths a second; negative runs the other way), for pours, falls and streams.
// Art only: the shape and the play surface do not move. Same clock as the swamp ripples, still when motion is reduced.
import {artSeconds} from './swamp-water.mjs';

export const FLOW_SPEED_DEFAULT=0.25;
export const FLOW_SPEED_LIMIT=10;
// The textures that slide with it. Baked light and shade (aoMap, lightMap) stay put.
const SLIDING=[['USE_MAP','vMapUv'],['USE_ALPHAMAP','vAlphaMapUv'],['USE_BUMPMAP','vBumpMapUv'],['USE_NORMALMAP','vNormalMapUv'],['USE_EMISSIVEMAP','vEmissiveMapUv'],['USE_METALNESSMAP','vMetalnessMapUv'],['USE_ROUGHNESSMAP','vRoughnessMapUv']];

export function flowSpeedOf(option={}){const speed=Number(option.flowSpeed);return Number.isFinite(speed)?Math.max(-FLOW_SPEED_LIMIT,Math.min(FLOW_SPEED_LIMIT,speed)):FLOW_SPEED_DEFAULT;}

export function applyFlowAnimation(material,option={}){
 if(material.userData?.flowMotion)return;
 const speed=flowSpeedOf(option),offset={value:0};
 material.userData??={};material.userData.flowMotion={offset,speed};
 const priorCompile=material.onBeforeCompile,priorRender=material.onBeforeRender,priorKey=material.customProgramCacheKey;
 material.onBeforeCompile=function(shader,renderer){
  priorCompile?.call(this,shader,renderer);
  shader.uniforms.uFlowOffset=offset;
  shader.vertexShader='uniform float uFlowOffset;\n'+shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\n'+SLIDING.map(([flag,uv])=>`#ifdef ${flag}\n ${uv}.y+=uFlowOffset;\n#endif`).join('\n'));
 };
 material.customProgramCacheKey=function(){return (priorKey?priorKey.call(this):'')+'|flow-v1';};
 // Kept within one texture length, so a long session never loses precision.
 material.onBeforeRender=function(...args){priorRender?.apply(this,args);const v=artSeconds()*speed;offset.value=v-Math.floor(v);};
 material.needsUpdate=true;
}
