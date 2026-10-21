import * as THREE from 'three';
import {verticalFloorDistance} from '../../assets/js/state/normalize/floor-elevation.js';
import {normalizePlacementForRender} from '../../assets/js/ui/token-render-normalize.js';
import {getRenderableAurasForPlacement} from '../../assets/js/ui/token-aura-records.js';
import {getTokenLevelPresentation,resolveSceneTokenLevelState} from '../../assets/js/ui/token-levels.js';
import {rectFill,rectBorder,overlayMesh,clearGroup,parseColor} from './surface-paint.mjs';

// Token auras on the 3D board. An aura reaches `radius` squares past every edge of the token (Draw Steel counts
// diagonals as 1), so it is a cube round the creature: `radius` past its sides and above its head, and below its
// feet in the air (on the ground the walls stand on the ground).
// It is drawn as a see-through, moving volume with bright edges (Brandon, October 2026), and its footprint lies
// faintly on the ground. Each look is one shared material animated by one time value:
//  enemy   - a red force field: thin hex grid, a scan band rising, bright edges;
//  psychic - Indigo: blue-violet rings rippling out from her, a drifting sheen;
//  fire    - Zepha: flames licking up the walls from the bottom, fading by half height;
//  spores  - Cal: faint green-gold walls that twinkle, glowing spores drifting up inside;
//  ink     - Sharon: black ink swirling over the walls, a violet sheen at its edges;
//  field   - any other token: a soft force field in the aura's own colour.
// The walls stay thin (most of each face under a fifth opaque), the top is barely there and there is no bottom,
// so what is under and behind an aura is still seen. Hidden tokens' auras are the GM's only; a player sees an aura
// only when its token is shown on their floor and the floors are no further apart than its radius
// (verticalFloorDistance). A token being dragged or click-moved takes its aura along (vtt3dRenderer.held).

const HEROES={indigo:'psychic',zepha:'fire',cal:'spores',sharon:'ink'};
const LOOKS={enemy:{code:0,color:'#ef4444'},psychic:{code:1,color:'#60a5fa'},fire:{code:2,color:'#f97316',additive:true},spores:{code:3,color:'#a3e635'},ink:{code:4,color:'#7c3aed'},field:{code:5}};

/** Which look a token's aura takes: a hero by sheet or name (as the minis find them), an enemy, or the plain field. */
export function auraLook(placement){
 const words=[placement?.characterProfileId,placement?.name].map(v=>String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()).join(' ').split(' ');
 for(const word of words)if(Object.hasOwn(HEROES,word))return HEROES[word];
 const team=String(placement?.combatTeam??placement?.team??'').toLowerCase();
 return team==='enemy'||(team!=='ally'&&placement?.monsterId)?'enemy':'field';
}

const vertex=`
varying vec3 vLocal;varying vec3 vNormal;varying vec3 vWorld;varying vec3 vSize;varying vec3 vCentre;
void main(){vLocal=position;vNormal=normal;vSize=vec3(length(modelMatrix[0].xyz),length(modelMatrix[1].xyz),length(modelMatrix[2].xyz));
 vCentre=modelMatrix[3].xyz;vec4 w=modelMatrix*vec4(position,1.0);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`;
const fragment=`
uniform float uTime;uniform vec3 uColor;uniform int uLook;
varying vec3 vLocal;varying vec3 vNormal;varying vec3 vWorld;varying vec3 vSize;varying vec3 vCentre;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
 return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.0,a=0.5;for(int i=0;i<4;i++){v+=a*noise(p);p=p*2.03+vec2(1.7,9.2);a*=0.5;}return v;}
// 0 on a hex cell's edge, up to 0.5 at its middle.
float hexEdge(vec2 p){vec2 r=vec2(1.0,1.732),h=r*0.5,a=mod(p,r)-h,b=mod(p-h,r)-h,g=dot(a,a)<dot(b,b)?a:b,q=abs(g);
 return 0.5-max(dot(q,vec2(0.5,0.866)),q.x);}
void main(){
 if(vNormal.y<-0.5)discard;
 vec3 q=vLocal*vSize,d=vSize*0.5-abs(q);
 // Distance to the cube's nearest edge, in squares: on a face one of d is nought; the edge is the middle one.
 float edge=d.x+d.y+d.z-min(d.x,min(d.y,d.z))-max(d.x,max(d.y,d.z));
 float top=step(0.5,vNormal.y);
 vec2 uv=abs(vNormal.x)>0.5?q.zy:abs(vNormal.z)>0.5?q.xy:q.xz;
 uv+=vCentre.xz*0.37;
 float h=clamp((q.y+vSize.y*0.5)/max(vSize.y,0.001),0.0,1.0);
 float rim=1.0-abs(dot(normalize(vNormal),normalize(cameraPosition-vWorld)));
 float line=smoothstep(0.07,0.0,edge),glow=smoothstep(0.35,0.0,edge);
 vec3 col=uColor;float a=0.0;
 if(uLook==0){
  float hx=smoothstep(0.06,0.0,hexEdge(uv*1.2));
  float band=exp(-pow((fract(h*0.8-uTime*0.35)-0.5)*7.0,2.0));
  float shimmer=0.5+0.5*sin(uTime*3.1+uv.x*2.3+uv.y*1.7);
  a=0.02+hx*(0.12+0.16*shimmer+band*0.25)+band*0.07+rim*0.05+glow*0.1+line*0.65;
  col=mix(vec3(0.95,0.12,0.1),vec3(1.0,0.55,0.4),hx*0.5+band*0.4+line*0.35);
  if(top>0.5)a=line*0.5+hx*0.04+0.015;
 }else if(uLook==1){
  // Rings of thought rippling out from her, bent by a slow wobble, over a faint blue veil.
  float r=length(vWorld-vCentre)+0.35*(noise(uv*1.3+uTime*0.4)-0.5);
  float ring=smoothstep(0.8,1.0,sin(r*3.2-uTime*2.6));
  float halo=smoothstep(0.2,1.0,sin(r*3.2-uTime*2.6))*0.5;
  float veil=fbm(uv*0.9+vec2(uTime*0.15,-uTime*0.22));
  float pulse=0.5+0.5*sin(uTime*1.9);
  a=0.05+ring*(0.3+0.1*pulse)+halo*0.1+smoothstep(0.6,0.85,veil)*0.1+glow*0.18+line*0.75;
  col=mix(vec3(0.0,0.06,0.75),vec3(0.18,0.02,0.7),veil);col=mix(col,vec3(0.05,0.35,1.0),ring*0.9+line*0.7+halo*0.4);
  if(top>0.5)a=line*0.55+ring*0.05+0.01;
 }else if(uLook==2){
  // Tongues of flame along the foot of each wall: each column of the wall burns to its own flickering height.
  float x=uv.x;
  float tall=0.18+0.32*fbm(vec2(x*1.4,uTime*0.9))+0.08*sin(uTime*7.0+x*5.0);
  float lick=fbm(vec2(x*2.6,q.y*1.6-uTime*2.4));
  float body=smoothstep(tall+0.06,tall-0.12,h-0.18*(lick-0.5));
  float flame=body*smoothstep(0.25,0.6,lick+0.35*(1.0-h/max(tall,0.05)));
  col=mix(vec3(0.95,0.18,0.02),vec3(1.0,0.55,0.05),flame);col=mix(col,vec3(1.0,0.92,0.55),smoothstep(0.75,1.0,flame)*(1.0-h*2.0));
  a=flame*0.75+smoothstep(0.12,0.0,h)*0.25+line*0.45*(1.0-h*0.7);
  if(top>0.5){a=line*0.25;col=vec3(1.0,0.45,0.08);}
 }else if(uLook==3){
  // Glints on the walls; the spores themselves are the points inside (sporeVertex).
  vec2 cell=floor(uv*2.2);float seed=hash(cell);
  float blink=step(0.84,hash(cell+floor(uTime*1.4+seed*7.0)));
  float spark=blink*smoothstep(0.22,0.0,length(fract(uv*2.2)-0.5-0.25*(vec2(hash(cell+3.1),hash(cell+7.7))-0.5)));
  float mist=smoothstep(0.35,0.0,h)*fbm(uv*1.2+vec2(0.0,-uTime*0.2));
  a=0.03+mist*0.22+glow*0.12+line*0.55+spark*0.9;
  col=mix(vec3(0.3,0.75,0.08),vec3(1.0,0.95,0.55),spark+line*0.35);
  if(top>0.5)a=line*0.4+spark*0.4;
 }else if(uLook==4){
  // Ink poured into water: swirls folding over each other, black with a violet sheen along their edges.
  // Smooth, large shapes (two octaves): grain would read as dirt on glass, not ink.
  vec2 p=uv*0.5;float t=uTime*0.12;
  vec2 w=vec2(noise(p*1.3+vec2(t,0.0))+0.5*noise(p*2.6-t),noise(p*1.3+vec2(5.2,1.3)-t)+0.5*noise(p*2.6+vec2(3.0,7.0)+t));
  float n=noise(p*1.6+1.6*w+vec2(0.0,-t))*0.7+noise(p*3.2+1.2*w)*0.3;
  float streak=smoothstep(0.055,0.015,abs(n-0.5)),blob=smoothstep(0.68,0.75,n);
  float ink=max(streak,blob),sheen=smoothstep(0.085,0.06,abs(n-0.5))*(1.0-streak)+smoothstep(0.65,0.68,n)*(1.0-blob);
  col=mix(vec3(0.0,0.0,0.01),vec3(0.28,0.12,0.62),sheen*0.9);col=mix(col,vec3(0.6,0.45,1.0),line*0.7);
  a=ink*0.68*(1.0-h*0.3)+sheen*0.22+line*0.6+0.015;
  if(top>0.5)a=line*0.5+ink*0.06;
 }else{
  float band=exp(-pow((fract(h*0.7-uTime*0.25)-0.5)*6.0,2.0));
  a=0.04+band*0.06+rim*0.1+glow*0.1+line*0.5;col=mix(uColor,vec3(1.0),line*0.3+band*0.2);
  if(top>0.5)a=line*0.45+0.015;
 }
 gl_FragColor=vec4(col,clamp(a,0.0,0.85));
 #include <colorspace_fragment>
}`;
// Cal's spores: points in a unit cube, drifting up and swaying, each twinkling on its own.
const sporeVertex=`
uniform float uTime;uniform float uPixels;attribute float aSeed;varying float vTwinkle;
void main(){vec3 s=vec3(length(modelMatrix[0].xyz),length(modelMatrix[1].xyz),length(modelMatrix[2].xyz));
 vec3 p=position;p.y=fract(p.y+0.5+uTime*(0.04+0.05*aSeed))-0.5;
 p.x+=sin(uTime*0.7+aSeed*40.0)*0.35/s.x;p.z+=cos(uTime*0.6+aSeed*31.0)*0.35/s.z;
 vec4 mv=modelViewMatrix*vec4(p,1.0);gl_Position=projectionMatrix*mv;
 vTwinkle=0.35+0.65*pow(0.5+0.5*sin(uTime*(2.0+3.0*aSeed)+aSeed*60.0),3.0);
 vTwinkle*=smoothstep(0.5,0.35,abs(p.y));
 gl_PointSize=uPixels*(0.3+0.3*aSeed)/max(-mv.z,0.5);}`;
const sporeFragment=`
varying float vTwinkle;
void main(){float r=length(gl_PointCoord-0.5);if(r>0.5)discard;float core=smoothstep(0.5,0.0,r);
 gl_FragColor=vec4(mix(vec3(0.7,0.95,0.3),vec3(1.0,1.0,0.75),core*core),core*vTwinkle*0.9);
 #include <colorspace_fragment>
}`;

export function createAurasLayer({guideScene,helpers,bridge,view}){
 const root=new THREE.Group();root.name='vtt-token-auras';guideScene.add(root);
 // Footprints are rebuilt with their own geometry; the volumes share one box and one material per look.
 const footprints=new THREE.Group(),volumes=new THREE.Group();root.add(footprints,volumes);
 const box=new THREE.BoxGeometry(1,1,1),time={value:0},pixels={value:600};
 const materials=new Map();
 function cubeMaterial(look,color){
  const key=look==='field'?`field:${color}`:look;if(materials.has(key))return materials.get(key);
  const spec=LOOKS[look],m=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,transparent:true,depthWrite:false,side:THREE.DoubleSide,
   forceSinglePass:true,toneMapped:false,blending:spec.additive?THREE.AdditiveBlending:THREE.NormalBlending,
   uniforms:{uTime:time,uColor:{value:new THREE.Color(spec.color||color)},uLook:{value:spec.code}}});
  materials.set(key,m);return m;
 }
 const spores=new THREE.ShaderMaterial({vertexShader:sporeVertex,fragmentShader:sporeFragment,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,
  uniforms:{uTime:time,uPixels:pixels}});
 let signature='',lastContext=null,lastQuick='',report={auras:0,looks:{}};
 function sporeCloud(count){
  const pos=new Float32Array(count*3),seed=new Float32Array(count);
  for(let i=0;i<count;i++){pos[i*3]=Math.random()-.5;pos[i*3+1]=Math.random()-.5;pos[i*3+2]=Math.random()-.5;seed[i]=Math.random();}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('aSeed',new THREE.BufferAttribute(seed,1));
  g.boundingSphere=new THREE.Sphere(new THREE.Vector3(),1);return g;
 }
 function clearVolumes(){for(const child of [...volumes.children]){volumes.remove(child);if(child.isPoints)child.geometry.dispose();}}
 function rebuild(list){
  clearGroup(footprints);clearVolumes();report={auras:0,looks:{}};const g=helpers.gridSize;
  for(const item of list){
   const {rect,color,at,look,bottom,top}=item,{color:c}=parseColor(LOOKS[look].color||color,'#3b82f6');
   // The footprint on the ground, faint: where the aura reaches, on any slope.
   footprints.add(overlayMesh(rectFill(rect,at,.045),{color:c,opacity:.07,order:1}));
   footprints.add(overlayMesh(rectBorder(rect,at,{width:2/g,lift:.057}),{color:c,opacity:.3,order:2}));
   const cube=new THREE.Mesh(box,cubeMaterial(look,color));
   cube.position.set(rect.column+rect.width/2,(bottom+top)/2,rect.row+rect.height/2);cube.scale.set(rect.width,top-bottom,rect.height);
   cube.renderOrder=3;cube.frustumCulled=false;cube.raycast=()=>{};volumes.add(cube);
   if(look==='spores'){
    const cloud=new THREE.Points(sporeCloud(Math.round(Math.max(36,Math.min(220,rect.width*rect.height*(top-bottom)*1.6)))),spores);
    cloud.position.copy(cube.position);cloud.scale.copy(cube.scale);cloud.renderOrder=4;cloud.frustumCulled=false;cloud.raycast=()=>{};volumes.add(cloud);
   }
   report.auras++;report.looks[look]=(report.looks[look]||0)+1;
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
   const at=onGround?(x,y)=>helpers.groundAt(x,y):()=>z,look=auraLook(placement),tall=Math.max(p.width,p.height);
   for(const aura of auras){
    const radius=Math.max(1,Math.min(20,parseInt(aura.radius,10)||1));
    const distance=verticalFloorDistance(placement,{levelId:viewerLevelId},levelState);if(!gm&&(distance===null||distance>radius))continue;
    const rect={column:column-radius,row:row-radius,width:p.width+radius*2,height:p.height+radius*2};
    // On the ground the walls stand on it (down to its lowest point inside, never deeper than the radius), so the
    // foot of the aura, where fire burns and the scan band starts, is seen. In the air it reaches the radius below.
    let bottom=z-radius;
    if(onGround){let low=z;for(let x=rect.column+.5;x<rect.column+rect.width;x++)for(let y=rect.row+.5;y<rect.row+rect.height;y++)low=Math.min(low,helpers.groundAt(x,y));bottom=Math.max(z-radius,low-.05);}
    list.push({key:`${p.id}:${aura.id||'manual'}`,rect,color:typeof aura.color==='string'?aura.color:'#3b82f6',at,z,onGround,look,bottom,top:z+tall+radius});
   }
  }
  return list;
 }
 function update(context,dt=0){
  time.value+=Math.min(dt||0,.1);
  const height=view?.viewport?.().height;if(height)pixels.value=height*.5*(window.devicePixelRatio||1);
  const held=window.vtt3dRenderer?.held,quick=`${held?`${held.id}:${held.x}:${held.y}:${held.z}`:''}|${helpers.shownLevel}|${window.terrainPrototype?.revision}`;
  if(context===lastContext&&quick===lastQuick)return;lastContext=context;lastQuick=quick;
  const list=collect(context),key=JSON.stringify(list.map(a=>[a.key,a.rect,a.color,a.z,a.onGround,a.look]));
  if(key!==signature){signature=key;rebuild(list);}
 }
 const api={update,summary:()=>({...report}),dispose(){clearGroup(footprints);clearVolumes();guideScene.remove(root);box.dispose();spores.dispose();for(const m of materials.values())m.dispose();if(window.vtt3dLayers?.auras===api)delete window.vtt3dLayers.auras;}};
 (window.vtt3dLayers??={}).auras=api;return api;
}
