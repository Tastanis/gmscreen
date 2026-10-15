import * as THREE from 'three';

/** CC0 material images are local board3d assets, independent of Dungeon Alchemist.
 * Surface projection changes appearance only: no terrain vertex displacement,
 * collision changes, downloaded executable code, or scene-authority changes.
 */
export async function loadSurfaceTextures(renderer){
 const loader=new THREE.TextureLoader(),sets={},textures=[],errors=[];
 await Promise.all(['ground','rock','wood','stone'].map(async name=>{
  try{
   const maps=await Promise.all(['diff','normal','rough'].map(async type=>{
    const url=new URL(`./assets/textures/${name}-${type}.jpg`,import.meta.url).href,t=await loader.loadAsync(url);
    t.name=`${name}-${type}`;t.colorSpace=type==='diff'?THREE.SRGBColorSpace:THREE.NoColorSpace;
    t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());textures.push(t);return t;
   }));sets[name]={diff:maps[0],normal:maps[1],rough:maps[2]};
  }catch(e){errors.push(`${name}: ${e?.message||'texture request failed'}`);}
 }));
 return {sets,errors,loaded:textures.length,dispose(){textures.forEach(t=>t.dispose());}};
}

// World-space projection preserves the physical grain size across scaled instances.
// Three planar projections blend on sloped faces instead of stretching cliff UVs.
export function surfaceMaterial(set,{color='#ffffff',scale=.5,normalStrength=.45,roughness=1,terrainGround=null,groundScale=.35}={}){
 const material=new THREE.MeshStandardMaterial({color,roughness,metalness:0});
 material.name=terrainGround?'Forest ground / exposed rock':'Photographic triplanar surface';
 material.customProgramCacheKey=()=>`bathhouse-surface-v3-${!!terrainGround}`;
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,{
   surfaceDiff:{value:set.diff},surfaceNormal:{value:set.normal},surfaceRough:{value:set.rough},
   surfaceScale:{value:scale},surfaceNormalStrength:{value:normalStrength},
   groundDiff:{value:(terrainGround||set).diff},groundNormal:{value:(terrainGround||set).normal},groundRough:{value:(terrainGround||set).rough},groundScale:{value:groundScale},
  });
  shader.vertexShader=`varying vec3 vSurfacePosition; varying vec3 vSurfaceNormal;\n${shader.vertexShader}`;
  shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
   vec4 surfaceWorld=vec4(transformed,1.0);
   #ifdef USE_INSTANCING
    surfaceWorld=instanceMatrix*surfaceWorld;
   #endif
   surfaceWorld=modelMatrix*surfaceWorld;
   vSurfacePosition=surfaceWorld.xyz;
   vSurfaceNormal=inverseTransformDirection(transformedNormal,viewMatrix);
  `);
  shader.fragmentShader=`
   varying vec3 vSurfacePosition; varying vec3 vSurfaceNormal;
   uniform sampler2D surfaceDiff;uniform sampler2D surfaceNormal;uniform sampler2D surfaceRough;
   uniform sampler2D groundDiff;uniform sampler2D groundNormal;uniform sampler2D groundRough;
   uniform float surfaceScale;uniform float surfaceNormalStrength;uniform float groundScale;
   vec3 surfaceWeights(vec3 n){vec3 w=pow(abs(n),vec3(5.));return w/max(dot(w,vec3(1.)),.00001);}
   vec3 triSample(sampler2D tex,vec3 p,vec3 w){return texture2D(tex,p.zy).rgb*w.x+texture2D(tex,p.xz).rgb*w.y+texture2D(tex,p.xy).rgb*w.z;}
   vec3 triDetail(vec3 p,vec3 n,vec3 w){
    vec3 a=texture2D(surfaceNormal,p.zy).xyz*2.-1.;
    vec3 b=texture2D(surfaceNormal,p.xz).xyz*2.-1.;
    vec3 c=texture2D(surfaceNormal,p.xy).xyz*2.-1.;
    vec3 perturb=vec3(0.,a.y,a.x)*w.x+vec3(b.x,0.,b.y)*w.y+vec3(c.x,c.y,0.)*w.z;
    return perturb-n*dot(perturb,n);
   }
   ${shader.fragmentShader}`;
  shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
   vec3 surfaceN=normalize(vSurfaceNormal);
   vec3 surfaceW=surfaceWeights(surfaceN);
   vec3 surfaceP=vSurfacePosition*surfaceScale;
   float exposedRock=${terrainGround?'1.-smoothstep(.58,.90,abs(surfaceN.y))':'1.'};
   vec3 surfaceColor=triSample(surfaceDiff,surfaceP,surfaceW);
   ${terrainGround?'surfaceColor=mix(texture2D(groundDiff,vSurfacePosition.xz*groundScale).rgb,surfaceColor,exposedRock);':''}
   float luminance=dot(surfaceColor,vec3(.2126,.7152,.0722));
   diffuseColor.rgb*=mix(surfaceColor,vec3(luminance),.08);
  `);
  shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`
   float surfaceR=triSample(surfaceRough,surfaceP,surfaceW).r;
   ${terrainGround?'surfaceR=mix(texture2D(groundRough,vSurfacePosition.xz*groundScale).r,surfaceR,exposedRock);':''}
   float roughnessFactor=clamp(roughness*surfaceR,.46,1.);
  `);
  shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`
   vec3 surfacePerturb=triDetail(surfaceP,surfaceN,surfaceW);
   ${terrainGround?`vec3 groundBump=texture2D(groundNormal,vSurfacePosition.xz*groundScale).xyz*2.-1.;
   vec3 groundPerturb=vec3(groundBump.x,0.,groundBump.y);groundPerturb-=surfaceN*dot(groundPerturb,surfaceN);
   surfacePerturb=mix(groundPerturb,surfacePerturb,exposedRock);`:''}
   vec3 detailWorld=normalize(surfaceN+surfacePerturb*surfaceNormalStrength);
   normal=normalize(mat3(viewMatrix)*detailWorld);
   #ifdef DOUBLE_SIDED
    normal*=faceDirection;
   #endif
  `);
 };
 return material;
}
