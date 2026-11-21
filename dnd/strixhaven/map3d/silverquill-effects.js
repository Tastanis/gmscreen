import * as T from 'three';

export function prepareEffects(slug,root,renderer,scale){
 const ticks=[],releases=[];
 if(root.animations?.length){const mixer=new T.AnimationMixer(root);for(const clip of root.animations)mixer.clipAction(clip).play();ticks.push((t)=>mixer.setTime(t));releases.push(()=>{mixer.stopAllAction();mixer.uncacheRoot(root)})}
 function attach(obj,release){root.add(obj);releases.push(()=>{root.remove(obj);release?.()});return obj}
 function scatter(start,axis,length,radius,color){
 const end=radius*1.83,geom=new T.CylinderGeometry(end,radius,length,48,1,true);
 const mat=new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.FrontSide,blending:T.AdditiveBlending,
 uniforms:{amount:{value:.34},tint:{value:new T.Color(color)}},
 vertexShader:'varying float along;varying vec3 n,v;void main(){along=uv.y;vec4 mv=modelViewMatrix*vec4(position,1.);n=normalize(normalMatrix*normal);v=-mv.xyz;gl_Position=projectionMatrix*mv;}',
 fragmentShader:'uniform float amount;uniform vec3 tint;varying float along;varying vec3 n,v;void main(){float d=clamp(dot(normalize(v),normalize(n)),0.,1.);float a=amount*pow(1.-along,1.45)*smoothstep(.0,.65,d);gl_FragColor=vec4(tint,a);}'});
 const beam=attach(new T.Mesh(geom,mat),()=>{geom.dispose();mat.dispose()});beam.position.fromArray(start).addScaledVector(axis,length/2);beam.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),axis);return mat;
 }
 function halo(at,size,color){
 const surf=document.createElement('canvas');surf.width=surf.height=64;const ctx=surf.getContext('2d'),grad=ctx.createRadialGradient(32,32,0,32,32,32);for(const [p,a] of [[0,1],[.13,.81],[.32,.31],[.66,.08],[1,0]])grad.addColorStop(p,'rgba(255,255,255,'+a+')');ctx.fillStyle=grad;ctx.fillRect(0,0,64,64);
 const tex=new T.CanvasTexture(surf),mat=new T.SpriteMaterial({map:tex,color,blending:T.AdditiveBlending,depthWrite:false,transparent:true});
 const spr=attach(new T.Sprite(mat),()=>{mat.dispose();tex.dispose()});spr.position.fromArray(at);spr.scale.setScalar(size);return spr;
 }
 if(slug==='spotlight-lance-plaza'){
 const src=root.getObjectByName('Lance_beacon')||root.getObjectByName('Lance beacon');let lens;
 root.traverse(o=>{if(o.material?.name==='Beacon lens')lens=o.material});
 const beam=scatter([0,75.2,0],new T.Vector3(0,1,0),23,1.03,0xffe9c3),flare=halo([0,75.2,0],11,0xffe3a2);
 ticks.push(t=>{const swell=Math.pow(.5+.5*Math.cos((t-2.3)*2*Math.PI/8),9);if(src)src.intensity=(530+1550*swell)*scale*scale;if(lens)lens.emissiveIntensity=2.9+5*swell;
 flare.scale.setScalar(9+12*swell);beam.uniforms.amount.value=.33+.56*swell})
 }
 if(slug==='illumination-hall')for(const side of [-1,1]){
 const axis=new T.Vector3(side*Math.sin(.40),Math.cos(.40),0);const origin=[side*8.72,7.89,7.65];
 const beam=scatter(origin,axis,8.9,1.02,0xffeabd),glow=halo(origin,3.61,0xffe7b9);
 ticks.push(t=>{const p=.5+.5*Math.sin(t*1.13+side*.4);beam.uniforms.amount.value=.65+.14*p;glow.material.opacity=.66+.22*p})
 }
 if(slug==='vainglory'){
 const geom=new T.TorusGeometry(1,.036,5,48),mat=new T.MeshBasicMaterial({color:0xb5dcdc,transparent:true,opacity:.62,depthWrite:false});
 for(let k=0;k<8;k++){const a=k*Math.PI/4;for(let j=0;j<2;j++){
 const ring=attach(new T.Mesh(geom,mat));ring.rotation.x=-Math.PI/2;ring.position.set(1.99*Math.sin(a),1.167+j*.001,1.99*Math.cos(a));
 ticks.push(t=>{const phase=(t*.82+j*.5+k*.12)%1;ring.scale.setScalar(.039+phase*.29)})}}
 const dropGeo=new T.SphereGeometry(.046,7,5);
 for(let k=0;k<8;k++){const a=k*Math.PI/4,drop=attach(new T.Mesh(dropGeo,mat));drop.scale.y=1.51;ticks.push(t=>{const u=(t*1.18+k*.11)%1,r=.96+u*1.03;drop.position.set(r*Math.sin(a),.56+2.72+.27*u-2.405*u*u,r*Math.cos(a))})}
 releases.push(()=>{geom.dispose();mat.dispose();dropGeo.dispose()})
 }
  if(slug==='duskwalk'){
 const a=[];for(const s of [-1,1])for(let j=0;j<4;j++)a.push(s*1.70,2.20,-5.5+j*3.53);
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(a,3));const mat=new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{px:{value:600}},vertexShader:'uniform float px;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(px*1.5/-mv.z,2.,150.);}',fragmentShader:'void main(){float d=length(gl_PointCoord-.5);float a=1.-smoothstep(.025,.50,d);gl_FragColor=vec4(.012,.004,.021,.64*a*a);}'});
 const veil=new T.Points(g,mat);root.add(veil);ticks.push(()=>mat.uniforms.px.value=renderer.domElement.height);releases.push(()=>{root.remove(veil);g.dispose();mat.dispose()})}
 if(['inkfall-streets','inkwell-lake','duskwalk','vainglory'].includes(slug)){
 root.traverse(o=>{const base=o.material;if(!['sludge','blackCurrent','Lake ink','springWater','waterJet'].includes(base?.name))return;
 const mat=base.clone();o.material=mat;
 if(base.name==='waterJet'){
 const time={value:0};mat.depthWrite=false;mat.onBeforeCompile=shader=>{
 shader.uniforms.flowClock=time;shader.vertexShader='varying vec3 streamPosition;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nstreamPosition=position;');
 shader.fragmentShader='uniform float flowClock;varying vec3 streamPosition;\n'+shader.fragmentShader.replace('#include <normal_fragment_maps>','#include <normal_fragment_maps>\nfloat glints=sin(streamPosition.y*29.+8.*flowClock+streamPosition.z*9.);normal=normalize(normal+vec3(.085*glints,.025*cos(streamPosition.y*25.+flowClock*6.),.02*glints));').replace('#include <alphamap_fragment>','#include <alphamap_fragment>\ndiffuseColor.a*=.66+.24*sin(streamPosition.y*16.+7.*flowClock+streamPosition.x*4.);');
 };ticks.push(t=>time.value=t)
 }
 const n=base.normalMap?.clone(),c=base.map?.clone();if(n)mat.normalMap=n;if(c){mat.map=c;mat.userData.albedo=c}
 ticks.push(t=>{if(n)n.offset.set(.034*t,.069*t);if(c)c.offset.set(.007*t,.021*t)});
 releases.push(()=>{o.material=base;mat.dispose();n?.dispose();c?.dispose()})
 })
 }
 if(slug==='duskwalk'){
 const lamps=[];root.traverse(o=>{if(o.name.startsWith('Passing_lantern')||o.name.startsWith('Passing lantern'))lamps.push(o)});
 for(const node of lamps){const glow=halo([0,0,0],.58,0xab70ff);ticks.push(()=>{glow.position.copy(node.position);})}
 }
 return {moving:ticks.length>0,update(t){for(const fn of ticks)fn(t)},dispose(){for(const fn of releases)fn()}}
}
