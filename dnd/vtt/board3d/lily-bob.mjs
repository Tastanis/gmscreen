import {Float32BufferAttribute} from 'three';
const reducedMotion=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
const started=globalThis.performance?.now?.()||0;
export function applyLilyBob(mesh,config){
 const spec=config?.meshes?.find(m=>m.name===mesh.material?.name);
 if(!spec||mesh.userData?.lilyBob)return;
 const values=new Float32Array(mesh.geometry.attributes.position.count*4);
 for(const range of spec.vertexRanges){
  const [start,count,padId]=range,pad=config.pads[padId];
  if(!pad||start<0||start+count>values.length/4)throw new Error('Invalid lily motion vertex range');
  for(let i=start;i<start+count;i++)values.set([pad.x,pad.z,padId*2.399963,.344],i*4);
 }
 mesh.geometry.setAttribute('aLilyCenter',new Float32BufferAttribute(values,4));
 mesh.userData.lilyBob=true;
 const material=mesh.material,time={value:0},priorCompile=material.onBeforeCompile,priorRender=material.onBeforeRender;
 material.onBeforeCompile=function(shader,renderer){
  priorCompile?.call(this,shader,renderer);shader.uniforms.uLilyTime=time;
  shader.vertexShader=`attribute vec4 aLilyCenter;
uniform float uLilyTime;
vec3 lilyRotation(vec3 p){
 float ax=.010*sin(uLilyTime*.71+aLilyCenter.z+.5);
 float az=.012*sin(uLilyTime*.83+aLilyCenter.z*1.3);
 p=vec3(p.x,cos(ax)*p.y-sin(ax)*p.z,sin(ax)*p.y+cos(ax)*p.z);
 return vec3(cos(az)*p.x-sin(az)*p.y,sin(az)*p.x+cos(az)*p.y,p.z);
}
`+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>','#include <beginnormal_vertex>\n objectNormal=lilyRotation(objectNormal);');
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
 vec3 lilyPivot=vec3(aLilyCenter.x,aLilyCenter.w,aLilyCenter.y);
 transformed=lilyRotation(transformed-lilyPivot)+lilyPivot;
 transformed.y+=.004*sin(uLilyTime*.85+aLilyCenter.z)+.0015*sin(uLilyTime*.61+aLilyCenter.z*1.7);
`);
 };
 material.onBeforeRender=function(...args){priorRender?.apply(this,args);time.value=reducedMotion?.matches?0:((globalThis.performance?.now?.()||started)-started)/1000;};
 material.customProgramCacheKey=()=> 'thornbriar-rigid-lily-bob-v1';material.needsUpdate=true;
}
