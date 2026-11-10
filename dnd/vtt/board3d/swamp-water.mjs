// Art-only, anchored water motion; no displaced vertices or gameplay surface changes.
const reducedMotion=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
const started=globalThis.performance?.now?.()||0;
export function applySwampWaterAnimation(material,option={}){
 if(material.userData?.swampWaterMotion)return;
 const sources=(option.rippleSources||[]).slice(0,20);
 const count=Math.max(1,sources.length),data=new Float32Array(count*4),directions=new Float32Array(count*2),phases=new Float32Array(count);
 sources.forEach((s,i)=>{data.set([s.x,s.z,s.radius||0,s.reach||2.2],i*4);directions.set([s.normalX||0,s.normalZ||0],i*2);phases[i]=s.phase??i*2.73;});
 material.userData??={};const time={value:0};material.userData.swampWaterMotion={time,sources};
 // Baked luminance normals created stationary streaks. This water uses animated analytic normals only.
 material.normalMap=null;
 const priorCompile=material.onBeforeCompile,priorRender=material.onBeforeRender;
 material.onBeforeCompile=function(shader,renderer){
  priorCompile?.call(this,shader,renderer);
  Object.assign(shader.uniforms,{uSwampTime:time,uRippleSource:{value:data},uRippleDirection:{value:directions},uRipplePhase:{value:phases}});
  shader.vertexShader='varying vec2 vSwampWorld;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n vSwampWorld=(modelMatrix*vec4(position,1.0)).xz;');
  shader.fragmentShader=`uniform float uSwampTime;
uniform vec4 uRippleSource[${count}];
uniform vec2 uRippleDirection[${count}];
uniform float uRipplePhase[${count}];
varying vec2 vSwampWorld;
float swampHash(vec2 p){return fract(sin(dot(p,vec2(127.1,37.3)))*43758.5453);}
float swampNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(swampHash(i),swampHash(i+vec2(1,0)),f.x),mix(swampHash(i+vec2(0,1)),swampHash(i+vec2(1,1)),f.x),f.y);}
// x = crest light; yz = signed surface gradient. Outward fronts travel .42 square/sec.
vec3 swampFronts(vec2 p){
 vec3 result=vec3(0.0);
 for(int i=0;i<${count};i++){
  vec4 source=uRippleSource[i];vec2 delta=p-source.xy;float distanceToSource=length(delta);
  vec2 outward=delta/max(distanceToSource,.001);float angle=atan(delta.y,delta.x);
  float distanceFromRim=distanceToSource-source.z;
  float age=mod(uSwampTime+uRipplePhase[i],7.3);
  float front=age*.42;
  float distortion=.055*sin(angle*3.0+uRipplePhase[i])+.025*sin(angle*5.0-uRipplePhase[i]);
  float q=distanceFromRim+distortion-front;
  float width=.105;
  float ring=exp(-q*q/(width*width));
  float q2=q+.48;float trailing=exp(-q2*q2/(width*width*1.5))*.38;
  float edge=smoothstep(0.0,.12,distanceFromRim)*(1.0-smoothstep(source.w*.68,source.w,distanceFromRim));
  float pulse=smoothstep(.15,.65,age)*(1.0-smoothstep(source.w/.42,source.w/.42+1.0,age));
  float angular=.72+.28*sin(angle*2.0+uRipplePhase[i]);
  vec2 facing=uRippleDirection[i];float shore=length(facing)>.1?smoothstep(-.15,.35,dot(outward,normalize(facing))):1.0;
  float envelope=edge*pulse*angular*shore;
  float slope=(-2.0*q/(width*width)*ring-2.0*q2/(width*width*1.5)*trailing)*.023;
  result+=vec3((ring+trailing)*envelope,outward*slope*envelope);
 }
 result.x=min(result.x,1.4);result.yz=clamp(result.yz,vec2(-.3),vec2(.3));return result;
}
`+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
 vec3 fronts=swampFronts(vSwampWorld);
 // Low, curved wind-driven fronts keep open water moving between local contacts.
 float ambientPhase=vSwampWorld.x*2.7+1.25*sin(vSwampWorld.y*.83)+.35*sin(vSwampWorld.x*.54)-uSwampTime*.84;
 vec2 ambientPhaseGradient=vec2(2.7+.189*cos(vSwampWorld.x*.54),1.0375*cos(vSwampWorld.y*.83));
 float ambientWave=sin(ambientPhase);
 float ambientEnvelope=.55+.45*swampNoise(vSwampWorld*.22+vec2(uSwampTime*.014,0.0));
 vec2 ambientSlope=cos(ambientPhase)*ambientPhaseGradient*.018*ambientEnvelope;
 float ambientCrest=smoothstep(.12,.94,ambientWave)*ambientEnvelope;
 vec2 waterGradient=fronts.yz+ambientSlope;
 float silt=swampNoise(vSwampWorld*.29+vec2(uSwampTime*.007,-uSwampTime*.004));
#ifdef USE_MAP
 vec2 drift=waterGradient*.008+vec2(uSwampTime*.0006,-uSwampTime*.00035);
 vec4 sampledDiffuseColor=texture2D(map,vMapUv+drift);
 vec2 crossedUv=mat2(.61,-.79,.79,.61)*(vMapUv*1.37)+vec2(.31,.72)-drift*.6;
 vec3 crossedColor=texture2D(map,crossedUv).rgb;
 sampledDiffuseColor.rgb=mix(vec3(.02285,.02960,.00706),sampledDiffuseColor.rgb*.45+crossedColor*.55,.4);
 diffuseColor*=sampledDiffuseColor;
#endif
 diffuseColor.rgb*=.96+.07*silt;
 diffuseColor.rgb+=vec3(.016,.019,.007)*fronts.x+vec3(.0035,.004,.0015)*ambientCrest;
`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
 normal=normalize(normal+mat3(viewMatrix)*vec3(-waterGradient.x,0.0,-waterGradient.y)*faceDirection);
`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
 roughnessFactor*=.91-.17*min(fronts.x,1.0);
`);
 };
 material.customProgramCacheKey=()=> 'thornbriar-swamp-anchored-v6-'+count;
 material.onBeforeRender=function(...args){priorRender?.apply(this,args);time.value=reducedMotion?.matches?0:((globalThis.performance?.now?.()||started)-started)/1000;};
 material.needsUpdate=true;
}
