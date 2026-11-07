import * as THREE from 'three';
import {verticalFloorDistance} from '../../assets/js/state/normalize/floor-elevation.js';
import {normalizePlacementForRender} from '../../assets/js/ui/token-render-normalize.js';
import {getRenderableAurasForPlacement} from '../../assets/js/ui/token-aura-records.js';
import {getTokenLevelPresentation,resolveSceneTokenLevelState} from '../../assets/js/ui/token-levels.js';
import {rectFill,rectBorder,overlayMesh,clearGroup,parseColor} from './surface-paint.mjs';
import {seededRandom,hashOf} from '../vine-art.mjs';
import {readGlb} from '../glb-reader.mjs';
import {auraSettings,AURA_ANIMATED_KEY,AURA_BOX_KEY} from '../quality.mjs';

// Token auras on the 3D board. An aura reaches `radius` squares past every edge of the token (Draw Steel counts
// diagonals as 1), so it is a cube round the creature: `radius` past its sides and above its head, and below its
// feet in the air (on the ground the walls stand on the ground).
// It is drawn as a see-through, moving volume with bright edges (Brandon, October 2026), and its footprint lies
// faintly on the ground. Each look is one shared material animated by one time value:
//  enemy   - a red force field: thin hex grid, a scan band rising, bright edges;
//  psychic - Indigo: psionic waves pulsing out from her, each starting round at her size and swelling into the box's
//            shape, fading as it reaches the edge, glowing at its rim so it does not fog the view (psionicWaves);
//  fire    - Zepha: real flames (fireLayout) round the outline but not a perfect box, some a little inside or out, a
//            few small ones inside, stray ones flaring up and dying, small puffs of smoke; the walls a faint warm edge;
//  spores  - Cal: a swarm of glowing spores drifting through the box's shape and small ones floating slowly inside;
//            about once a minute the swarm whirls in round him for half a second and flies back out (sporeSwarm);
//  ink     - Sharon: black ink swirling over the walls, a violet sheen at its edges;
//  thorns  - Pippa: psionic summoned thorn vines (Blender pieces with joints, assets/fx/thorn-vines.glb), solid
//            vine green: they grow in, then curl and coil; creepers wander
//            round the foot of the walls, climbers near the corners, dangling ends off the top, tendrils; green
//            motes drifting up (thornLayout); the walls barely there, the middle clear (Brandon, November 2026);
//  field   - any other token: a soft force field in the aura's own colour.
// The walls stay thin (most of each face under a fifth opaque), the top is barely there and there is no bottom,
// so what is under and behind an aura is still seen. Hidden tokens' auras are the GM's only; a player sees an aura
// only when its token is shown on their floor and the floors are no further apart than its radius
// (verticalFloorDistance). A token being dragged or click-moved takes its aura along (vtt3dRenderer.held).

const HEROES={indigo:'psychic',zepha:'fire',cal:'spores',sharon:'ink',pippa:'thorns',player6:'thorns'};
const LOOKS={enemy:{code:0,color:'#ef4444'},psychic:{code:1,color:'#60a5fa'},fire:{code:2,color:'#f97316',additive:true},spores:{code:3,color:'#a3e635'},ink:{code:4,color:'#7c3aed'},field:{code:5},thorns:{code:6,color:'#4ade80'}};

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
uniform float uTime;uniform vec3 uColor;uniform int uLook;uniform float uBox;
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
  // Indigo: the waves are their own (psionicWaves); the walls a faint blue-violet edge and a trace of colour (a little
  // stronger, as Cal's: Brandon, November 6, 2026).
  a=0.018+line*0.09+glow*0.04;   // the edges much fainter (Brandon, November 6, 2026)
  col=mix(vec3(0.15,0.25,0.95),vec3(0.55,0.6,1.0),line*0.5);
  if(top>0.5)a=line*0.03;
 }else if(uLook==2){
  // Zepha: the flames are their own (fireLayout); the walls only a faint warm edge and a little glow at the foot.
  a=line*0.07+smoothstep(0.14,0.0,h)*0.05+glow*0.025;
  col=mix(vec3(1.0,0.32,0.04),vec3(1.0,0.7,0.3),line*0.6);
  if(top>0.5)a=line*0.04;
 }else if(uLook==3){
  // Cal: the spores are their own (sporeSwarm); the walls a faint green-gold edge and a trace of colour (a little
  // stronger than the others: Brandon, November 6, 2026).
  a=0.018+line*0.09+glow*0.04;   // the edges much fainter (Brandon, November 6, 2026)
  col=mix(vec3(0.45,0.8,0.15),vec3(1.0,0.95,0.55),line*0.3);
  if(top>0.5)a=line*0.03;
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
 }else if(uLook==6){
  // Pippa: the thorns are the Blender vines (thornLayout); the walls are barely there, a green haze low on them.
  float mist=smoothstep(0.45,0.0,h)*fbm(uv*1.1+vec2(uTime*0.07,-uTime*0.16));
  a=0.004+mist*0.04+glow*0.018+line*0.07;
  col=mix(vec3(0.1,0.42,0.16),vec3(0.6,0.98,0.62),mist*0.6+line*0.4);
  if(top>0.5)a=line*0.04;
 }else{
  float band=exp(-pow((fract(h*0.7-uTime*0.25)-0.5)*6.0,2.0));
  a=0.04+band*0.06+rim*0.1+glow*0.1+line*0.5;col=mix(uColor,vec3(1.0),line*0.3+band*0.2);
  if(top>0.5)a=line*0.45+0.015;
 }
 gl_FragColor=vec4(col,clamp(a,0.0,0.85)*uBox);
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

// Pippa's thorns: where the Blender pieces go round one aura, in world units (x = column, y = height, z = row). Every
// piece is rooted at its origin in the ground (Brandon, November 6, 2026: "growing up from the ground and dangling over
// the top of the box"), just inside the edge. Climbing vines mostly run along the top edge and coil (toprun: up about
// 2, then along -z), or reach in over the top toward the middle and coil there (reachin: -x), now and then drape out
// (climbover: +x) ("grouping along the top, and curling around and somewhere in the middle; not just getting out of
// the box"); creepers along the foot (+x is along), tendrils, now and then a spiral partway up (climber). Nothing on the
// ground in the middle. The vines are spread evenly all round, the middle of each side too ("don't leave this hole on
// each side"), and each one that sinks back into the ground comes up again somewhere else (thornSpot).
// How fast the thorns live: 0.7 of their made speed (Brandon, November 6, 2026: "slow down the animation by about 30%, but keep them all exactly the same").
const THORN_PACE=.7;
const THORN_PIECES=[['toprun',.3],['reachin',.17],['climbover',.1],['creeper',.24],['tendril',.12],['climber',.07]];
function thornPiece(rand){let r=rand();for(const [piece,share] of THORN_PIECES){if(r<share)return piece;r-=share;}return 'creeper';}
/** Where one piece stands at distance p round the aura's edge (0 at its first corner, going round). */
function thornSpot(item,piece,p,rand){
 const {rect,top}=item,ground=(x,z)=>item.at(x,z),yawOf=(dx,dz)=>Math.atan2(-dz,dx);
 const x0=rect.column,z0=rect.row,x1=x0+rect.width,z1=z0+rect.height;
 const edges=[[x0,z0,1,0,rect.width,0,-1],[x1,z0,0,1,rect.height,1,0],[x1,z1,-1,0,rect.width,0,1],[x0,z1,0,-1,rect.height,-1,0]];
 const perimeter=2*(rect.width+rect.height);let d=((p%perimeter)+perimeter)%perimeter,e=0;
 while(e<3&&d>edges[e][4]){d-=edges[e][4];e++;}
 const [ex,ez,dx,dz,length,ox,oz]=edges[e];d=Math.min(length-.12,Math.max(.12,d));
 const inset=.06+rand()*.1,x=ex+dx*d-ox*inset,z=ez+dz*d-oz*inset,foot=ground(x,z),size=Math.max(.6,(top-foot)/2.1*.97),lean=(rand()-.5)*.35;
 const delay=0;
 if(piece==='climbover'){const rx=x-ox*.22*size,rz=z-oz*.22*size;return {piece,x:rx,y:ground(rx,rz),z:rz,yaw:yawOf(ox,oz)+lean,sx:size,sy:size,sz:size,delay};}
 if(piece==='reachin')return {piece,x,y:foot,z,yaw:yawOf(ox,oz)+lean,sx:size,sy:size,sz:size,delay};
 if(piece==='toprun'){const sign=d<length*.25?1:d>length*.75?-1:rand()<.5?1:-1,ax=dx*sign,az=dz*sign;    // run along the edge, away from the near corner
  return {piece,x,y:foot,z,yaw:Math.atan2(-ax,-az)+(rand()-.5)*.25,sx:size,sy:size,sz:size,delay};}
 if(piece==='creeper'){const sign=d<length*.3?1:d>length*.7?-1:rand()<.5?1:-1,len=.7+rand()*.7;
  return {piece,x,y:foot,z,yaw:yawOf(dx*sign,dz*sign)+(rand()-.5)*.6,sx:len,sy:.9+rand()*.4,sz:.9+rand()*.4,delay};}
 if(piece==='climber'){const h=(top-foot)*(.4+rand()*.25),w=Math.min(1.4,.7+h*.25);return {piece,x,y:foot,z,yaw:rand()*Math.PI*2,sx:w,sy:h,sz:w,delay};}
 const t=.5+rand()*.4;return {piece:'tendril',x,y:foot,z,yaw:yawOf(-ox,-oz)+(rand()-.5)*1.6,sx:t,sy:t,sz:t,delay};
}
function thornLayout(item){
 const rand=seededRandom(hashOf(item.key)),{rect}=item,perimeter=2*(rect.width+rect.height),count=Math.round(perimeter/.5),out=[];
 // evenly round the edge, a little jittered: no side is left with a gap in its middle
 for(let i=0;i<count;i++){const spot=thornSpot(item,thornPiece(rand),(i+.2+rand()*.6)/count*perimeter,rand);spot.delay=rand()<.7?rand()*2.5:3+rand()*5;out.push(spot);}
 return out;
}
// A copy of a jointed piece with joints of its own (Object3D.clone keeps the skin bound to the original's joints).
function cloneRig(source){
 const copy=source.clone(true),bones=new Map();copy.traverse(o=>{if(o.isBone)bones.set(o.name,o);});
 copy.traverse(o=>{if(!o.isSkinnedMesh)return;const sk=o.skeleton;o.bind(new THREE.Skeleton(sk.bones.map(b=>bones.get(b.name)),sk.boneInverses),o.bindMatrix);});
 return copy;
}
// Pippa's motes: points close to the walls of a unit cube, drifting up and swaying, glowing green.
function thornMotes(count){
 const pos=new Float32Array(count*3),seed=new Float32Array(count);
 for(let i=0;i<count;i++){const side=Math.floor(Math.random()*4),edge=.5-Math.random()*.16,along=Math.random()-.5;
  pos[i*3]=side===0?-edge:side===1?edge:along;pos[i*3+2]=side===2?-edge:side===3?edge:along;pos[i*3+1]=Math.random()-.5;seed[i]=Math.random();}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('aSeed',new THREE.BufferAttribute(seed,1));
 g.boundingSphere=new THREE.Sphere(new THREE.Vector3(),1);return g;
}
const moteFragment=String.raw`
varying float vTwinkle;
void main(){float r=length(gl_PointCoord-0.5);if(r>0.5)discard;float core=smoothstep(0.5,0.0,r);
 gl_FragColor=vec4(mix(vec3(0.35,0.95,0.45),vec3(0.9,1.0,0.8),core*core),core*vTwinkle*0.75);
 #include <colorspace_fragment>
}`;

// Zepha's fire. Flames are upright cards facing the camera, each drawn as a flickering tongue of flame; smoke puffs
// rise, swell and fade. Each has its own life: aLife = (phase, seconds per cycle, share of it burning; 1 = always).
const fireVertex=['uniform float uTime;attribute float aSeed;attribute vec2 aSize;attribute vec3 aLife;',
 'varying vec2 vUv;varying float vSeed;varying float vOn;',
 'void main(){vec3 c=(modelMatrix*instanceMatrix*vec4(0.0,0.0,0.0,1.0)).xyz;',
 ' float k=fract(uTime/aLife.y+aLife.x);',
 ' float on=aLife.z>=0.999?1.0:smoothstep(0.0,0.18,k)*(1.0-smoothstep(aLife.z-0.18,aLife.z,k));',
 ' float flick=0.95+0.035*sin(uTime*(1.1+aSeed*0.8)+aSeed*40.0)+0.015*sin(uTime*2.3+aSeed*13.0);',
 ' vec3 right=normalize(vec3(viewMatrix[0][0],viewMatrix[1][0],viewMatrix[2][0]));',
 ' vec3 camUp=vec3(viewMatrix[0][1],viewMatrix[1][1],viewMatrix[2][1]);vec3 up=normalize(vec3(0.0,1.0,0.0)*0.55+camUp*0.45);',
 ' vec3 w=c+right*position.x*aSize.x*(0.6+0.4*on)+up*position.y*aSize.y*on*flick;',
 ' vUv=uv;vSeed=aSeed;vOn=on;gl_Position=projectionMatrix*viewMatrix*vec4(w,1.0);}'].join('\n');
// Each flame plays the fire Blender simulated (a sheet of 8 x 4 frames, the flame on black, added to what is behind),
// at its own speed and from its own frame, blending from one frame to the next (Brandon, November 6, 2026: "those
// aren't flames ... fire assets in Blender").
const fireFragment=['uniform float uTime;uniform sampler2D uSheet;varying vec2 vUv;varying float vSeed;varying float vOn;',
 'vec3 frameAt(float f){float c=mod(f,8.0),r=floor(f/8.0);vec2 p=clamp(vUv,vec2(0.01),vec2(0.99));',
 ' return texture2D(uSheet,vec2((c+p.x)/8.0,1.0-(r+1.0-p.y)/4.0)).rgb;}',
 'void main(){float t=uTime*24.0*(0.8+0.4*vSeed)+vSeed*32.0;float f=floor(mod(t,32.0));',
 ' vec3 c=mix(frameAt(f),frameAt(mod(f+1.0,32.0)),fract(t))*vOn*1.15*smoothstep(0.0,0.14,vUv.y);',
 ' if(max(c.r,max(c.g,c.b))<0.008)discard;gl_FragColor=vec4(c,1.0);',
 ' #include <colorspace_fragment>','}'].join('\n');
const smokeVertex=['uniform float uTime;attribute float aSeed;attribute vec2 aSize;attribute vec3 aLife;',
 'varying vec2 vUv;varying float vA;varying float vSeed;',
 'void main(){vec3 c=(modelMatrix*instanceMatrix*vec4(0.0,0.0,0.0,1.0)).xyz;float k=fract(uTime/aLife.y+aLife.x);',
 ' c+=vec3(sin(k*3.0+aSeed*9.0)*0.12,0.25+k*1.1,cos(k*2.6+aSeed*5.0)*0.12);',
 ' float s=aSize.x*(0.5+1.1*k);',
 ' vec3 right=vec3(viewMatrix[0][0],viewMatrix[1][0],viewMatrix[2][0]),up=vec3(viewMatrix[0][1],viewMatrix[1][1],viewMatrix[2][1]);',
 ' vUv=uv;vSeed=aSeed;vA=smoothstep(0.0,0.15,k)*(1.0-k)*(k<aLife.z?1.0:0.0);',
 ' gl_Position=projectionMatrix*viewMatrix*vec4(c+(right*position.x+up*position.y)*s,1.0);}'].join('\n');
const smokeFragment=['uniform float uTime;varying vec2 vUv;varying float vA;varying float vSeed;',
 'float sh(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
 'float sn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(sh(i),sh(i+vec2(1,0)),f.x),mix(sh(i+vec2(0,1)),sh(i+vec2(1,1)),f.x),f.y);}',
 'void main(){vec2 q=vUv-0.5;float r=length(q);float n=sn(q*5.0+vSeed*10.0+uTime*0.3);',
 ' float a=smoothstep(0.5,0.1,r+(n-0.5)*0.25)*vA*0.7;if(a<0.005)discard;',
 ' gl_FragColor=vec4(vec3(0.6,0.58,0.56)+n*0.12,a);',
 ' #include <colorspace_fragment>','}'].join('\n');

// Indigo's psionic waves: shells pulsing out from her (uCentre, her size uInner) to the aura's box (uSize), one after
// another (aPhase), each round near her and boxier as it swells, bright at its rim and fading as it reaches the edge.
const waveVertex=['uniform float uTime;uniform vec3 uSize;uniform vec3 uInner;uniform vec3 uCentre;attribute float aPhase;',
 'varying float vK;varying vec3 vN;varying vec3 vW;varying vec3 vDir;',
 'void main(){float k=fract(uTime/19.2+aPhase);vec3 d=normalize(position);',
 ' vec3 boxy=d/max(abs(d.x),max(abs(d.y),abs(d.z)))*0.5;',
 ' vec3 shape=mix(d*0.5,boxy,0.25+0.7*smoothstep(0.0,1.0,k));',
 ' vec3 p=uCentre*(1.0-k)+shape*mix(uInner,uSize,k);',
 ' vec4 w=modelMatrix*instanceMatrix*vec4(p,1.0);vW=w.xyz;vN=normalize(mat3(modelMatrix)*shape);vK=k;vDir=d;',
 ' gl_Position=projectionMatrix*viewMatrix*w;}'].join('\n');
const waveFragment=['uniform float uTime;varying float vK;varying vec3 vN;varying vec3 vW;varying vec3 vDir;',
 'void main(){vec3 v=normalize(cameraPosition-vW);float rim=1.0-abs(dot(normalize(vN),v));',
 ' float ripple=0.75+0.25*sin(vDir.x*9.0+vDir.y*7.0+vDir.z*8.0+uTime*0.375);',
 ' float life=sin(3.14159*vK)*(1.0-vK*0.35);',
 ' float a=(pow(rim,1.6)*0.75+0.07)*life*ripple;if(a<0.004)discard;',
 ' vec3 col=mix(vec3(0.12,0.2,1.0),vec3(0.62,0.45,1.0),pow(rim,3.0));',
 ' gl_FragColor=vec4(col,min(a,0.8));',
 ' #include <colorspace_fragment>','}'].join('\n');

// Zepha's embers: sparks rising from the flames (position = a flame's foot), drifting and cooling from yellow-white to red,
// each on its own life; they give the ring its height without tall flames.
const emberVertex=['uniform float uTime;uniform float uPixels;attribute vec4 aSeed;varying float vAge;',
 'void main(){float life=1.8+1.8*aSeed.w;float age=fract(uTime/life+aSeed.x);',
 ' vec3 p=position+vec3((aSeed.y-0.5)*0.22,0.12+age*(0.6+0.9*aSeed.z),(aSeed.z-0.5)*0.22);',
 ' p.x+=sin(age*6.0+aSeed.y*20.0)*0.09*age;p.z+=cos(age*5.0+aSeed.z*20.0)*0.09*age;vAge=age;',
 ' vec4 mv=modelViewMatrix*vec4(p,1.0);gl_Position=projectionMatrix*mv;',
 ' float flick=0.6+0.4*fract(sin(uTime*11.0+aSeed.y*91.0)*43758.5453);',
 ' gl_PointSize=uPixels*0.2*(1.0-age*0.5)*flick/max(-mv.z,0.5);}'].join('\n');
const emberFragment=['varying float vAge;',
 'void main(){float r=length(gl_PointCoord-0.5);if(r>0.5)discard;float core=smoothstep(0.5,0.0,r);core*=core;   // bright at the heart, fading to its edge',
 ' vec3 col=mix(vec3(1.0,0.3,0.05),vec3(1.0,0.95,0.7),(1.0-vAge)*(1.0-vAge));',
 ' float a=core*smoothstep(0.0,0.06,vAge)*(1.0-vAge*vAge);gl_FragColor=vec4(col*a*2.2,a);',
 ' #include <colorspace_fragment>','}'].join('\n');
function emberCloud(flames){
 const n=Math.min(700,flames.length*6),pos=new Float32Array(n*3),seed=new Float32Array(n*4);
 for(let i=0;i<n;i++){const f=flames[i%flames.length];pos[i*3]=f.x;pos[i*3+1]=f.y;pos[i*3+2]=f.z;for(let k=0;k<4;k++)seed[i*4+k]=Math.random();}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('aSeed',new THREE.BufferAttribute(seed,4));
 g.computeBoundingSphere();return g;
}

// Where Zepha's flames and smoke go round one aura (world units: x = column, y = height, z = row). Round the outline
// but not on it: some a little inside or out, with gaps; a few small ones inside, kept off the middle so they don't
// block the view; a few strays that flare up now and then; small puffs of smoke over the outline.
function fireLayout(item){
 const rand=seededRandom(hashOf(item.key+':fire')),{rect}=item,ground=(x,z)=>item.at(x,z);
 const x0=rect.column,z0=rect.row,x1=x0+rect.width,z1=z0+rect.height,cx=(x0+x1)/2,cz=(z0+z1)/2,perimeter=2*(rect.width+rect.height);
 const edge=(p)=>{let d=p%perimeter;if(d<rect.width)return [x0+d,z0,0,1];d-=rect.width;if(d<rect.height)return [x1,z0+d,-1,0];d-=rect.height;if(d<rect.width)return [x1-d,z1,0,-1];d-=rect.width;return [x0,z1-d,1,0];};
 const flames=[],smoke=[];
 const flame=(x,z,w,h,life)=>flames.push({x,y:ground(x,z),z,w,h,life,seed:rand()});
 const n=Math.round(perimeter*2.6);
 for(let i=0;i<n;i++){if(rand()<.18)continue;                       // gaps
  const [x,z,ix,iz]=edge((i+rand())/n*perimeter),inward=(rand()-.4)*.5;   // a little inside or out, more often in
  const big=rand();flame(x+ix*inward,z+iz*inward,.28+big*.32,.4+big*.6,[rand(),10+rand()*14,rand()<.6?1:.6+rand()*.35]);
  if(rand()<.45){const [sx,sz]=[x+ix*inward,z+iz*inward];smoke.push({x:sx,y:ground(sx,sz)+.35+big*.4,z:sz,w:.45+rand()*.3,life:[rand(),4+rand()*4,.9],seed:rand()});}}
 // a few small ones inside, away from the middle
 const inside=Math.max(2,Math.min(8,Math.round(rect.width*rect.height*.12)));
 for(let i=0;i<inside;i++){const x=x0+.4+rand()*(rect.width-.8),z=z0+.4+rand()*(rect.height-.8);if(Math.hypot(x-cx,z-cz)<1)continue;
  flame(x,z,.2+rand()*.12,.25+rand()*.25,[rand(),9+rand()*8,.5+rand()*.3]);}
 // strays: anywhere about the aura, mostly out, flaring up now and then
 for(let i=0;i<4+Math.floor(rand()*3);i++){const x=x0-.3+rand()*(rect.width+.6),z=z0-.3+rand()*(rect.height+.6);if(Math.hypot(x-cx,z-cz)<1)continue;
  flame(x,z,.18+rand()*.15,.3+rand()*.35,[rand(),12+rand()*12,.3+rand()*.15]);}
 return {flames,smoke};
}
// Cal's spore swarm in a unit cube (scaled to the aura): most home near the walls through the box's whole shape, drifting
// round their homes; a few small ones (aKind 1) float slowly through the inside. uSwirl (0..1) draws the swarm in to
// whirl round him (uCentre, local) and lets it go back out; the small ones stay.
const swarmVertex=['uniform float uTime;uniform float uPixels;uniform float uSwirl;uniform vec3 uSize;uniform vec3 uCentre;',
 'attribute float aSeed;attribute float aKind;varying float vTwinkle;varying float vKind;',
 'void main(){vec3 home=position;float t=uTime*(0.22+0.2*aSeed);',
 ' vec3 drift=vec3(sin(t*1.3+aSeed*20.0),0.7*sin(t*0.9+aSeed*31.0),cos(t*1.1+aSeed*12.0))*(aKind>0.5?0.55:0.3);',
 ' vec3 local=home+drift/uSize;',
 ' if(aKind>0.5){local.y=fract(home.y+0.5+uTime*(0.015+0.02*aSeed))-0.5;}',
 ' float ang=uTime*7.0*(0.8+0.4*aSeed)+aSeed*6.283;float r=0.45+0.4*fract(aSeed*7.3);',
 ' vec3 sw=uCentre+vec3(cos(ang)*r,(fract(aSeed*13.1)-0.5)*1.2+0.15*sin(uTime*4.0+aSeed*9.0),sin(ang)*r)/uSize;',
 ' float lag=clamp(uSwirl*1.25-0.25*fract(aSeed*3.7),0.0,1.0);local=mix(local,sw,(aKind>0.5?0.0:1.0)*smoothstep(0.0,1.0,lag));',
 ' vec4 mv=modelViewMatrix*vec4(local,1.0);gl_Position=projectionMatrix*mv;vKind=aKind;',
 ' vTwinkle=0.75+0.25*sin(uTime*(1.5+2.0*aSeed)+aSeed*60.0);',
 // spores, not light balls (Brandon, November 6, 2026: "more spore-like, smaller particles"): small dusty specks
 ' gl_PointSize=uPixels*(aKind>0.5?0.05+0.04*aSeed:0.08+0.08*aSeed)/max(-mv.z,0.5);}'].join('\n');
// A spore: a small dusty speck, a little lighter at its heart, its edge soft; drawn over what is behind, not glowing.
const swarmFragment=['varying float vTwinkle;varying float vKind;',
 'void main(){float r=length(gl_PointCoord-0.5);if(r>0.5)discard;float body=smoothstep(0.5,0.3,r);',
 ' vec3 col=mix(vec3(0.62,0.66,0.32),vec3(0.86,0.84,0.55),smoothstep(0.3,0.0,r));',
 ' gl_FragColor=vec4(col*vTwinkle,body*(vKind>0.5?0.6:0.85));',
 ' #include <colorspace_fragment>','}'].join('\n');
function swarmCloud(item,height){
 const {rect}=item,shell=Math.round(Math.max(180,Math.min(780,(rect.width+rect.height)*2*height*9))),inner=Math.round(Math.max(24,Math.min(120,rect.width*rect.height*height*1.6)));
 const count=shell+inner,pos=new Float32Array(count*3),seed=new Float32Array(count),kind=new Float32Array(count);
 for(let i=0;i<count;i++){const small=i>=shell;seed[i]=Math.random();kind[i]=small?1:0;
  if(small){pos[i*3]=(Math.random()-.5)*.75;pos[i*3+1]=Math.random()-.5;pos[i*3+2]=(Math.random()-.5)*.75;continue;}
  // near a wall, anywhere up it (the box's shape), a little in from it
  const side=Math.floor(Math.random()*4),edge=.5-Math.pow(Math.random(),1.6)*.2,along=Math.random()-.5;   // most close by the border
  pos[i*3]=side===0?-edge:side===1?edge:along;pos[i*3+2]=side===2?-edge:side===3?edge:along;pos[i*3+1]=Math.random()*.95-.47;}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('aSeed',new THREE.BufferAttribute(seed,1));g.setAttribute('aKind',new THREE.BufferAttribute(kind,1));
 g.boundingSphere=new THREE.Sphere(new THREE.Vector3(),2);return g;
}
// Instanced upright cards for flames or smoke.
function cardMesh(list,material,sizeOf){
 const plane=new THREE.PlaneGeometry(1,1);plane.translate(0,.5,0);
 const seeds=new Float32Array(list.length),sizes=new Float32Array(list.length*2),lives=new Float32Array(list.length*3),m=new THREE.Matrix4();
 const mesh=new THREE.InstancedMesh(plane,material,list.length);
 list.forEach((it,i)=>{m.makeTranslation(it.x,it.y,it.z);mesh.setMatrixAt(i,m);seeds[i]=it.seed;const [w,h]=sizeOf(it);sizes[i*2]=w;sizes[i*2+1]=h;lives.set(it.life,i*3);});
 plane.setAttribute('aSeed',new THREE.InstancedBufferAttribute(seeds,1));plane.setAttribute('aSize',new THREE.InstancedBufferAttribute(sizes,2));plane.setAttribute('aLife',new THREE.InstancedBufferAttribute(lives,3));
 mesh.frustumCulled=false;mesh.raycast=()=>{};mesh.userData.ownGeometry=true;return mesh;
}

export function createAurasLayer({guideScene,helpers,bridge,view}){
 const root=new THREE.Group();root.name='vtt-token-auras';guideScene.add(root);
 // Pippa's thorn vines stand in the main scene with the map and the minis: lit and shaded there (the guide scene has no
 // lights, so a solid vine drew black in it).
 const vineRoot=new THREE.Group();vineRoot.name='vtt-thorn-vines';(view?.scene||guideScene).add(vineRoot);
 // Footprints are rebuilt with their own geometry; the volumes share one box and one material per look.
 const footprints=new THREE.Group(),volumes=new THREE.Group();root.add(footprints,volumes);
 const box=new THREE.BoxGeometry(1,1,1),time={value:0},pixels={value:600};
 // This screen's own choices (quality.mjs, set from the Table menu): animated auras on or off, how strong the boxes are.
 let settings=auraSettings();const boxStrength={value:settings.box};
 const onStorage=(e)=>{if(e.key!==AURA_ANIMATED_KEY&&e.key!==AURA_BOX_KEY&&e.key!==null)return;settings=auraSettings();boxStrength.value=settings.box;signature='';lastContext=null;};
 window.addEventListener('storage',onStorage);
 const fireSheet=new THREE.TextureLoader().load(new URL('../assets/fx/fire-flipbook.png'+new URL(import.meta.url).search,import.meta.url).href);
 fireSheet.colorSpace=THREE.SRGBColorSpace;fireSheet.generateMipmaps=false;fireSheet.minFilter=THREE.LinearFilter;
 const fireMaterial=new THREE.ShaderMaterial({vertexShader:fireVertex,fragmentShader:fireFragment,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,side:THREE.DoubleSide,uniforms:{uTime:time,uSheet:{value:fireSheet}}});
 const emberMaterial=new THREE.ShaderMaterial({vertexShader:emberVertex,fragmentShader:emberFragment,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,uniforms:{uTime:time,uPixels:pixels}});
 const smokeMaterial=new THREE.ShaderMaterial({vertexShader:smokeVertex,fragmentShader:smokeFragment,transparent:true,depthWrite:false,toneMapped:false,side:THREE.DoubleSide,uniforms:{uTime:time}});
 const swarms=new Map();   // aura key -> {material, next, start}: Cal's whirl, about once a minute each
 const materials=new Map();
 function cubeMaterial(look,color){
  const key=look==='field'?`field:${color}`:look;if(materials.has(key))return materials.get(key);
  const spec=LOOKS[look],m=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,transparent:true,depthWrite:false,side:THREE.DoubleSide,
   forceSinglePass:true,toneMapped:false,blending:spec.additive?THREE.AdditiveBlending:THREE.NormalBlending,
   uniforms:{uTime:time,uColor:{value:new THREE.Color(spec.color||color)},uLook:{value:spec.code},uBox:boxStrength}});
  materials.set(key,m);return m;
 }
 const spores=new THREE.ShaderMaterial({vertexShader:sporeVertex,fragmentShader:sporeFragment,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,
  uniforms:{uTime:time,uPixels:pixels}});
 // Pippa's thorns: the Blender pieces in vine green (one material for
 // all, skinned). Each copy grows in once (its _grow clip), then curls and coils (its _idle clip, looped), each on
 // its own timing. A thorn aura that moves or is rebuilt the same size does not grow in again.
 // Solid, in a living vine's own colour: a deep olive green, a little rough (Brandon, November 6, 2026: "ignore the
 // translucent and make them just realistic vine colour").
 // Texture (November 6, 2026: "some texture, some variation"): the pieces carry their own colours from Blender (woody
 // brown at the root, green toward the tip, mottled, tan thorns darkening at their points), and here a bark grain and
 // blotches are laid over them, fixed to the vine so they move with it. Four tints, one per vine at random: some
 // greener, some browner, some yellower.
 const thornGrain=(shader)=>{
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vObj;').replace('#include <begin_vertex>','#include <begin_vertex>\n vObj=position;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vObj;\nfloat thornHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}\nfloat thornNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);\n return mix(mix(mix(thornHash(i),thornHash(i+vec3(1,0,0)),f.x),mix(thornHash(i+vec3(0,1,0)),thornHash(i+vec3(1,1,0)),f.x),f.y),\n  mix(mix(thornHash(i+vec3(0,0,1)),thornHash(i+vec3(1,0,1)),f.x),mix(thornHash(i+vec3(0,1,1)),thornHash(i+vec3(1,1,1)),f.x),f.y),f.z);}')
   .replace('#include <color_fragment>','#include <color_fragment>\n diffuseColor.rgb=pow(diffuseColor.rgb,vec3(2.2));\n float grain=thornNoise(vObj*vec3(60.0,60.0,60.0)),blot=thornNoise(vObj*7.0+3.1),fleck=step(0.86,thornNoise(vObj*120.0));\n diffuseColor.rgb*=0.82*(0.7+0.42*blot+0.25*(grain-0.5)-0.18*fleck);');};
 const thornMaterials=['#ffffff','#e2f0cf','#f6e7c8','#d9e6bd'].map((tint)=>{const m=new THREE.MeshStandardMaterial({color:tint,vertexColors:true,roughness:.85,metalness:0,side:THREE.DoubleSide});m.onBeforeCompile=thornGrain;m.customProgramCacheKey=()=>'thorn-grain';return m;});
 const thornMaterial=thornMaterials[0];
 const motes=new THREE.ShaderMaterial({vertexShader:sporeVertex,fragmentShader:moteFragment,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,uniforms:{uTime:time,uPixels:pixels}});
 const thornBorn=new Map(),vines=new Set();
 // Each vine after growing in goes its own way: one of its two curls (idle, idle2) at its own speed, now and then the
 // pulse (its outer half draws in and grows out again), switching on its own random clock (Brandon: "not all the same
 // animation at the same time").
 // A vine's life, on its own clock: it grows up out of the ground (its _grow clip), lives a while, curling (idle, idle2,
 // now and then the pulse), then sinks back into the ground (_grow played backwards), rests out of sight, and grows
 // again (Brandon, November 6, 2026: "extend up from the ground ... wiggle around ... then go back into the ground").
 // Lives are 5-18 s and rests 0.6-3 s, at their own speeds, so most of the vines are up at any time and never in step.
 function vinePlay(vine,action,{loop=true,from=vine.current,fade=1.1,time=null,scale=1}={}){
  action.reset();action.enabled=true;action.timeScale=scale;action.setLoop(loop?THREE.LoopRepeat:THREE.LoopOnce,loop?Infinity:1);action.clampWhenFinished=!loop;
  if(time!==null)action.time=time;action.play();if(from&&from!==action&&fade>0)action.crossFadeFrom(from,fade,false);else if(from&&from!==action)from.stop();
  vine.current=action;}
 function vineGrow(vine){const grow=vine.actions.grow;if(!grow){vineLive(vine);return;}
  // after its first growth it comes up somewhere else along the edge
  if(vine.grownOnce){const {rect}=vine.item,spot=thornSpot(vine.item,vine.piece,Math.random()*2*(rect.width+rect.height),Math.random);
   vine.rig.position.set(spot.x,spot.y,spot.z);vine.rig.rotation.set(0,spot.yaw,0);vine.rig.scale.set(spot.sx,spot.sy,spot.sz);}
  // Its first growth frame (a seed) is put on before it is shown: shown first, it stood fully grown for a frame (a
  // one-frame flicker, Brandon, November 6, 2026).
  vine.grownOnce=true;vinePlay(vine,grow,{loop:false,fade:0,time:0,scale:vine.speed*(.9+Math.random()*.3)});vine.mixer.update(0);vine.rig.updateMatrixWorld(true);vine.rig.visible=true;
  vine.phase='grow';vine.next=vine.mixer.time+grow.getClip().duration/grow.timeScale-.35;}
 function vineLive(vine){vine.phase='live';vine.liveUntil=vine.mixer.time+5+Math.random()*13;vineCurl(vine);}
 function vineCurl(vine){const {mixer,actions}=vine,from=vine.current;
  const name=!from||from===actions.pulse||from===actions.grow?(Math.random()<.5?'idle':'idle2'):Math.random()<.4?'pulse':from===actions.idle?'idle2':'idle';
  const next=actions[name];if(!next){vine.next=mixer.time+5;return;}
  vinePlay(vine,next,{loop:name!=='pulse',scale:vine.speed*(.85+Math.random()*.3),time:name==='pulse'?0:Math.random()*next.getClip().duration});
  vine.next=mixer.time+(name==='pulse'?Math.max(1,next.getClip().duration/next.timeScale-.9):3+Math.random()*6);}
 function vineSink(vine){const grow=vine.actions.grow;if(!grow){vineLive(vine);return;}
  // backwards from fully grown: it draws down joint by joint, the tip last, into its root
  const scale=-(vine.speed*(1+Math.random()*.4));vinePlay(vine,grow,{loop:false,fade:.5,time:grow.getClip().duration,scale});
  vine.phase='sink';vine.next=vine.mixer.time+grow.getClip().duration/-scale;}
 function vineNext(vine){
  if(vine.phase==='grow')vineLive(vine);
  else if(vine.phase==='live'){if(vine.mixer.time>=vine.liveUntil)vineSink(vine);else vineCurl(vine);}
  else if(vine.phase==='sink'){vine.rig.visible=false;vine.mixer.stopAllAction();vine.current=null;vine.phase='rest';vine.next=vine.mixer.time+.6+Math.random()*2.4;}
  else vineGrow(vine);}
 let vinePieces=null,vineClips=[],vineLoading=null;
 function loadVines(){
  if(vineLoading)return;
  vineLoading=readGlb(new URL('../assets/fx/thorn-vines.glb'+new URL(import.meta.url).search,import.meta.url).href).then(({scene,animations})=>{
   vinePieces={};for(const name of ['climbover','toprun','reachin','creeper','climber','tendril']){const rig=scene.getObjectByName(name+'-rig');if(!rig)continue;
    rig.traverse(o=>{if(o.isMesh){o.material=thornMaterial;o.frustumCulled=false;o.castShadow=true;o.receiveShadow=true;o.raycast=()=>{};}});vinePieces[name]=rig;}
   vineClips=animations;signature='';      // draw the waiting thorn auras now
  }).catch(error=>console.warn('[3D board] thorn vines not loaded',error));
 }
 let signature='',lastContext=null,lastQuick='',report={auras:0,looks:{}};
 function sporeCloud(count){
  const pos=new Float32Array(count*3),seed=new Float32Array(count);
  for(let i=0;i<count;i++){pos[i*3]=Math.random()-.5;pos[i*3+1]=Math.random()-.5;pos[i*3+2]=Math.random()-.5;seed[i]=Math.random();}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('aSeed',new THREE.BufferAttribute(seed,1));
  g.boundingSphere=new THREE.Sphere(new THREE.Vector3(),1);return g;
 }
 function clearVolumes(){for(const child of [...volumes.children,...vineRoot.children]){child.removeFromParent();if(child.isPoints||child.userData.ownGeometry)child.geometry.dispose();
  if(child.userData.ownMaterial)child.material.dispose();if(child.isInstancedMesh)child.dispose();
  // Thorn copies share the pieces' geometry: only their animation is let go.
  if(child.userData.thornRig)for(const rig of child.children){const vine=rig.userData.vine;if(vine){vine.mixer.stopAllAction();vine.mixer.uncacheRoot(rig);vines.delete(vine);}}}}
 function rebuild(list){
  clearGroup(footprints);clearVolumes();report={auras:0,looks:{}};const g=helpers.gridSize;
  for(const item of list){
   const {rect,color,at,look,bottom,top}=item,{color:c}=parseColor(LOOKS[look].color||color,'#3b82f6');
   // The footprint on the ground, faint: where the aura reaches, on any slope.
   const faint=look==='thorns'?.45:1;
   if(settings.box>0){footprints.add(overlayMesh(rectFill(rect,at,.045),{color:c,opacity:.07*faint*settings.box,order:1}));
    footprints.add(overlayMesh(rectBorder(rect,at,{width:2/g,lift:.057}),{color:c,opacity:.3*faint*settings.box,order:2}));}
   const cube=new THREE.Mesh(box,cubeMaterial(look,color));
   cube.position.set(rect.column+rect.width/2,(bottom+top)/2,rect.row+rect.height/2);cube.scale.set(rect.width,top-bottom,rect.height);
   cube.renderOrder=3;cube.frustumCulled=false;cube.raycast=()=>{};volumes.add(cube);
   if(look==='spores'){
    const was=swarms.get(item.key),material=new THREE.ShaderMaterial({vertexShader:swarmVertex,fragmentShader:swarmFragment,transparent:true,depthWrite:false,blending:THREE.NormalBlending,toneMapped:false,
     uniforms:{uTime:time,uPixels:pixels,uSwirl:{value:0},uSize:{value:new THREE.Vector3(rect.width,top-bottom,rect.height)},uCentre:{value:new THREE.Vector3(0,((item.z+item.tall/2)-(bottom+top)/2)/(top-bottom),0)}}});
    swarms.set(item.key,{material,next:was?was.next:time.value+15+Math.random()*30,start:was?was.start:null});
    const cloud=new THREE.Points(swarmCloud(item,top-bottom),material);cloud.userData.ownMaterial=true;
    cloud.position.copy(cube.position);cloud.scale.copy(cube.scale);cloud.renderOrder=4;cloud.frustumCulled=false;cloud.raycast=()=>{};volumes.add(cloud);
   }
   if(look==='psychic'){
    // one geometry for the shells, a material for this aura (its sizes)
    const material=new THREE.ShaderMaterial({vertexShader:waveVertex,fragmentShader:waveFragment,transparent:true,depthWrite:false,blending:THREE.NormalBlending,toneMapped:false,side:THREE.DoubleSide,
     uniforms:{uTime:time,uSize:{value:new THREE.Vector3(rect.width,top-bottom,rect.height)},uInner:{value:new THREE.Vector3(rect.width-2*(rect.width-item.tall)/2,item.tall,rect.height-2*(rect.height-item.tall)/2)},
      uCentre:{value:new THREE.Vector3(0,(item.z+item.tall/2)-(bottom+top)/2,0)}}});
    const sphere=new THREE.SphereGeometry(.5,40,20);// two waves, half a beat apart; one out from her every 9.6 s (Brandon, November 6, 2026: an eighth of the speed, the waves farther apart)
    sphere.setAttribute('aPhase',new THREE.InstancedBufferAttribute(new Float32Array([0,.5]),1));
    const waves=new THREE.InstancedMesh(sphere,material,2),m=new THREE.Matrix4().makeTranslation(cube.position.x,cube.position.y,cube.position.z);
    for(let i=0;i<2;i++)waves.setMatrixAt(i,m);
    waves.userData.ownGeometry=true;waves.userData.ownMaterial=true;waves.renderOrder=5;waves.frustumCulled=false;waves.raycast=()=>{};vineRoot.add(waves);
   }
   if(look==='fire'){
    const {flames,smoke}=fireLayout(item);
    if(flames.length){const mesh=cardMesh(flames,fireMaterial,(f)=>[f.h*.85,f.h*1.1]);mesh.renderOrder=5;vineRoot.add(mesh);}
    if(smoke.length){const mesh=cardMesh(smoke,smokeMaterial,(f)=>[f.w,f.w]);mesh.renderOrder=6;vineRoot.add(mesh);}
    if(flames.length){const embers=new THREE.Points(emberCloud(flames),emberMaterial);embers.renderOrder=6;embers.frustumCulled=false;embers.raycast=()=>{};vineRoot.add(embers);}
   }
   if(look==='thorns'){
    const was=thornBorn.get(item.key),grown=!!was&&was.size===rect.width;thornBorn.set(item.key,{size:rect.width});
    if(!vinePieces)loadVines();
    else{const group=new THREE.Group();group.userData.thornRig=true;group.renderOrder=4;
     for(const spot of thornLayout(item)){const source=vinePieces[spot.piece];if(!source)continue;
      const rig=cloneRig(source),tint=thornMaterials[Math.floor(Math.random()*thornMaterials.length)];rig.traverse(o=>{if(o.isMesh)o.material=tint;});rig.position.set(spot.x,spot.y,spot.z);rig.rotation.set(0,spot.yaw,0);rig.scale.set(spot.sx,spot.sy,spot.sz);
      rig.traverse(o=>{if(o.isMesh)o.renderOrder=4;});group.add(rig);
      const mixer=new THREE.AnimationMixer(rig),clip=(n)=>vineClips.find(c=>c.name===spot.piece+'_'+n),actions={};
      for(const n of ['grow','idle','idle2','pulse']){const c=clip(n);if(c)actions[n]=mixer.clipAction(c);}
      const vine={mixer,rig,actions,item,piece:spot.piece,speed:.7+Math.random()*.6,current:null,next:0,phase:'rest',liveUntil:0};rig.userData.vine=vine;
      // First growth after its delay (hidden till then); one already grown on this aura carries on living.
      if(grown){vineLive(vine);vine.liveUntil=mixer.time+Math.random()*12;}
      else{rig.visible=false;vine.phase='rest';vine.next=spot.delay;}
      mixer.update(0);vines.add(vine);}
     vineRoot.add(group);}
    const cloud=new THREE.Points(thornMotes(Math.round(Math.max(30,Math.min(160,(rect.width+rect.height)*2*(top-bottom)*1.4)))),motes);
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
   const at=onGround?(x,y)=>helpers.groundAt(x,y):()=>z,tall=Math.max(p.width,p.height);
   // Animated auras off on this screen: every aura a plain faint box in its own colour (no vines, flames or spores).
   const own=auraLook(placement),look=settings.animated?own:'field',lookColor=settings.animated?null:LOOKS[own].color;
   for(const aura of auras){
    const radius=Math.max(1,Math.min(20,parseInt(aura.radius,10)||1));
    const distance=verticalFloorDistance(placement,{levelId:viewerLevelId},levelState);if(!gm&&(distance===null||distance>radius))continue;
    const rect={column:column-radius,row:row-radius,width:p.width+radius*2,height:p.height+radius*2};
    // On the ground the walls stand on it (down to its lowest point inside, never deeper than the radius), so the
    // foot of the aura, where fire burns and the scan band starts, is seen. In the air it reaches the radius below.
    let bottom=z-radius;
    if(onGround){let low=z;for(let x=rect.column+.5;x<rect.column+rect.width;x++)for(let y=rect.row+.5;y<rect.row+rect.height;y++)low=Math.min(low,helpers.groundAt(x,y));bottom=Math.max(z-radius,low-.05);}
    list.push({key:`${p.id}:${aura.id||'manual'}`,rect,color:lookColor||(typeof aura.color==='string'?aura.color:'#3b82f6'),at,z,tall,onGround,look,bottom,top:z+tall+radius});
   }
  }
  return list;
 }
 function update(context,dt=0){
  time.value+=Math.min(dt||0,.1);
  // Cal's swarm: about once a minute it whirls in round him for half a second, then flies back out to the box.
  for(const swarm of swarms.values()){const t=time.value;if(swarm.start===null&&t>=swarm.next)swarm.start=t;
   if(swarm.start!==null){const e=t-swarm.start,v=e<.6?e/.6:e<1.1?1:e<1.8?1-(e-1.1)/.7:0;swarm.material.uniforms.uSwirl.value=v*v*(3-2*v);
    if(e>=1.8){swarm.start=null;swarm.next=t+50+Math.random()*20;}}}
  // The vines' own clock runs at THORN_PACE: everything they do (grow, curl, pulse, sink, rest) keeps its pattern, slower.
  for(const vine of vines){vine.mixer.update(Math.min(dt||0,.1)*THORN_PACE);if(vine.mixer.time>=vine.next)vineNext(vine);}
  const height=view?.viewport?.().height;if(height)pixels.value=height*.5*(window.devicePixelRatio||1);
  const held=window.vtt3dRenderer?.held,quick=`${held?`${held.id}:${held.x}:${held.y}:${held.z}`:''}|${helpers.shownLevel}|${window.terrainPrototype?.revision}`;
  if(context===lastContext&&quick===lastQuick)return;lastContext=context;lastQuick=quick;
  const list=collect(context),key=JSON.stringify(list.map(a=>[a.key,a.rect,a.color,a.z,a.onGround,a.look]));
  if(key!==signature){signature=key;rebuild(list);}
 }
 const api={update,summary:()=>({...report}),
  // Cal's whirl now, on every spore aura (for a look; it otherwise comes about once a minute).
  swirlNow(){for(const swarm of swarms.values())swarm.next=time.value;},dispose(){clearGroup(footprints);clearVolumes();guideScene.remove(root);vineRoot.removeFromParent();box.dispose();spores.dispose();for(const m of thornMaterials)m.dispose();fireMaterial.dispose();fireSheet.dispose();smokeMaterial.dispose();emberMaterial.dispose();window.removeEventListener('storage',onStorage);motes.dispose();for(const m of materials.values())m.dispose();if(window.vtt3dLayers?.auras===api)delete window.vtt3dLayers.auras;}};
 (window.vtt3dLayers??={}).auras=api;return api;
}
