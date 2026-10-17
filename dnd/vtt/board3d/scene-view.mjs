import * as THREE from 'three';
import {createCameraControls} from './camera-controls.mjs';
import {loadSurfaceTextures,surfaceMaterial} from './materials.mjs';
import {rampHeight} from '../assets/js/ui/imported-ramps.mjs';
import {createMovementRoute} from './movement-route.mjs';
import {loadArtKit} from './art-kit.mjs';
import {buildVines,buildHanging,buildGroundCover} from './vine-art.mjs';

// Original procedural artwork. Scene data is the only dependency on the map.
// World coordinates are x/east, y/south, z/up; Three.js is x/up/y.
const V=p=>new THREE.Vector3(p.x,p.z||0,p.y);
const TAU=Math.PI*2;
const stableHash=s=>{let h=2166136261;for(const c of String(s))h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;};
function cragGeometry(variant){
 const g=new THREE.IcosahedronGeometry(1,1),p=g.attributes.position;
 for(let i=0;i<p.count;i++){
  const x=p.getX(i),y=p.getY(i),z=p.getZ(i),noise=Math.sin(x*5.7+y*3.8+z*4.3+variant*2.3)*.13+Math.cos(x*3.1-z*6.4+variant)*.09;
  const r=1+noise;
  p.setXYZ(i,x*r+y*(.12+variant*.045),Math.max(-.70,Math.min(.63+variant*.06,y*r)),z*r+x*(variant%2?.19:-.11));
 }
 // Preserve authored width/depth/height while varying the original art silhouette.
 g.computeBoundingBox();const b=g.boundingBox,c=b.getCenter(new THREE.Vector3()),s=b.getSize(new THREE.Vector3());
 for(let i=0;i<p.count;i++)p.setXYZ(i,(p.getX(i)-c.x)*2/s.x,(p.getY(i)-c.y)*2/s.y,(p.getZ(i)-c.z)*2/s.z);
 g.computeVertexNormals();g.computeBoundingSphere();return g;
}
// A crystal shard: a six-sided prism with a pointed tip, 1 tall, flat-shaded so its facets catch the light.
function crystalGeometry(){const g=new THREE.LatheGeometry([new THREE.Vector2(0,0),new THREE.Vector2(.5,0),new THREE.Vector2(.5,.72),new THREE.Vector2(0,1)].map(v=>v),6);return g.toNonIndexed();}
// A soft round glow (white in the middle, clear at the edge) for halos and pools of light.
function glowTexture(){const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d'),g=x.createRadialGradient(64,64,0,64,64,64);
 g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.25,'rgba(255,255,255,.55)');g.addColorStop(.6,'rgba(255,255,255,.12)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,128,128);
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;}
// A magic circle's glowing pattern: two rings with runes between them and a star in the middle, on a clear ground.
function runeTexture(){const c=document.createElement('canvas');c.width=c.height=512;const x=c.getContext('2d');x.translate(256,256);x.strokeStyle='#fff';x.fillStyle='#fff';x.shadowColor='#fff';x.shadowBlur=10;
 for(const [r,w] of [[246,6],[214,3],[150,3],[60,2]]){x.lineWidth=w;x.beginPath();x.arc(0,0,r,0,Math.PI*2);x.stroke();}
 let seed=11;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};x.lineWidth=3;
 for(let i=0;i<24;i++){x.save();x.rotate(i/24*Math.PI*2);x.translate(0,-182);x.beginPath();const k=Math.floor(rand()*4);
  if(k===0){x.moveTo(-8,-10);x.lineTo(0,10);x.lineTo(8,-10);}else if(k===1){x.moveTo(0,-12);x.lineTo(0,12);x.moveTo(-8,0);x.lineTo(8,-8);}else if(k===2){x.arc(0,0,8,0,Math.PI*1.5);x.moveTo(0,-12);x.lineTo(0,12);}else{x.moveTo(-8,10);x.lineTo(0,-10);x.lineTo(8,10);x.moveTo(-5,2);x.lineTo(5,2);}
  x.stroke();x.restore();}
 x.lineWidth=3;x.beginPath();for(let i=0;i<=5;i++){const a=i*Math.PI*4/5-Math.PI/2;x.lineTo(Math.cos(a)*150,Math.sin(a)*150);}x.stroke();
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;}
// The disc the pattern lies on (1 across), and a low stone curb round it (radius 1, 0.08 high).
// A clump of leaves: three crossed cards and a flat one, each carrying a cluster of leaves (cut out), 1 across.
function leafClumpGeometry(){const parts=[];for(const [ry,rx] of [[0,0],[Math.PI/3,0],[Math.PI*2/3,0],[0,Math.PI/2]]){const g=new THREE.PlaneGeometry(1,1);g.rotateX(rx);g.rotateY(ry);parts.push(g);}
 const out=new THREE.BufferGeometry(),pos=[],nor=[],uv=[];for(const g of parts){pos.push(...g.attributes.position.array);nor.push(...g.attributes.normal.array);uv.push(...g.attributes.uv.array);}
 const index=[];let base=0;for(const g of parts){for(const i of g.index.array)index.push(base+i);base+=g.attributes.position.count;}
 out.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));out.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));out.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));out.setIndex(index);
 // Normals pointing out from the clump's middle light it as a round mass, not as flat cards.
 const p=out.attributes.position,n=out.attributes.normal;for(let i=0;i<p.count;i++){const v=new THREE.Vector3(p.getX(i),p.getY(i)+.15,p.getZ(i)).normalize();n.setXYZ(i,v.x,v.y,v.z);}return out;}
// Glowing cracks for the rune stones: thin amber veins on black (an emissive map).
function veinTexture(){const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d');x.fillStyle='#000';x.fillRect(0,0,256,256);
 let seed=5;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};x.lineCap='round';
 for(let i=0;i<14;i++){let px=rand()*256,py=rand()*256;x.strokeStyle=i%3?'#ff9a3c':'#ffd38a';x.lineWidth=1.5+rand()*2;x.shadowColor='#ff8a2a';x.shadowBlur=6;x.beginPath();x.moveTo(px,py);
  for(let k=0;k<6;k++){px+=(rand()-.5)*60;py+=(rand()-.5)*60;x.lineTo(px,py);}x.stroke();}
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;return t;}
function runeRingGeometry(){const g=new THREE.CircleGeometry(1,48);g.rotateX(-Math.PI/2);return g;}
function curbGeometry(){const outer=new THREE.Shape();outer.absarc(0,0,1.04,0,Math.PI*2);const hole=new THREE.Path();hole.absarc(0,0,.97,0,Math.PI*2,true);outer.holes.push(hole);const g=new THREE.ExtrudeGeometry(outer,{depth:.08,bevelEnabled:false,curveSegments:40});g.rotateX(-Math.PI/2);return g;}
// A soft, ragged mask for moss patches: solid in the middle, broken and fading at the edge.
function mossMask(){const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d'),img=x.createImageData(128,128);
 const hash=(a,b)=>{const v=Math.sin(a*127.1+b*311.7)*43758.5453;return v-Math.floor(v);},noise=(px,py)=>{const ix=Math.floor(px),iy=Math.floor(py),fx=px-ix,fy=py-iy,u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy);return (hash(ix,iy)*(1-u)+hash(ix+1,iy)*u)*(1-v)+(hash(ix,iy+1)*(1-u)+hash(ix+1,iy+1)*u)*v;};
 for(let j=0;j<128;j++)for(let i=0;i<128;i++){const dx=i/64-1,dy=j/64-1,r=Math.hypot(dx,dy),n=noise(i/12,j/12)*.6+noise(i/5,j/5)*.4,edge=1-Math.min(1,Math.max(0,(r-.35-n*.4)/.25));const k=(j*128+i)*4;const v=Math.round(255*edge*(.75+.25*n));img.data[k]=img.data[k+1]=img.data[k+2]=v;img.data[k+3]=255;}
 x.putImageData(img,0,0);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.NoColorSpace;return t;}
function texture(kind){
 const c=document.createElement('canvas');c.width=c.height=512;const x=c.getContext('2d');
 let seed=817;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 if(kind==='stone'){
  x.fillStyle='#6e695d';x.fillRect(0,0,512,512);
  for(let row=0;row<8;row++)for(let col=-1;col<5;col++){
   const px=col*128+(row%2)*64,py=row*64,v=Math.floor(151+rand()*28);
   x.fillStyle=`rgb(${v+17},${v+7},${v-13})`;x.fillRect(px+2,py+2,124,60);
   x.fillStyle='rgba(255,245,207,.14)';x.fillRect(px+3,py+3,122,2);
   x.fillStyle='rgba(37,28,23,.13)';x.fillRect(px+3,py+59,122,2);
  }
 }else{
  x.fillStyle='#6f4930';x.fillRect(0,0,512,512);
  for(let row=0;row<16;row++){
   const v=Math.floor(102+rand()*30);x.fillStyle=`rgb(${v+35},${v+3},${v-29})`;x.fillRect(1,row*32+1,510,30);
   x.strokeStyle='rgba(39,23,10,.2)';x.beginPath();x.moveTo((row%3)*170,row*32);x.lineTo((row%3)*170,row*32+32);x.stroke();
   for(let i=0;i<6;i++){x.strokeStyle=`rgba(45,22,10,${rand()*.16})`;x.beginPath();x.moveTo(0,row*32+rand()*31);x.bezierCurveTo(140,row*32+rand()*31,300,row*32+rand()*31,512,row*32+rand()*31);x.stroke();}
  }
 }
 for(let i=0;i<15000;i++){x.fillStyle=`rgba(${rand()>.5?'255,255,255':'0,0,0'},.035)`;x.fillRect(rand()*512,rand()*512,1,1);}
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=4;return t;
}
function polygon(s,depth=.12){
 const shape=new THREE.Shape(s.points.map(p=>new THREE.Vector2(p.x,-p.y)));
 for(const hole of s.holes||[])shape.holes.push(new THREE.Path(hole.map(p=>new THREE.Vector2(p.x,-p.y))));
 const g=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false,steps:1});g.rotateX(-Math.PI/2);g.translate(0,s.height-depth,0);return g;
}
function contained(x,y,s){const ring=p=>{let a=false;for(let i=0,j=p.length-1;i<p.length;j=i++){if((p[i].y>y)!==(p[j].y>y)&&x<(p[j].x-p[i].x)*(y-p[i].y)/(p[j].y-p[i].y)+p[i].x)a=!a;}return a;};return ring(s.points)&&!(s.holes||[]).some(ring);}

// Decoration close to the camera dissolves (a fine dither, nothing sorted), so a low camera still shows the squares
// and creatures behind it (Map maker, October 14: "tall decoration fades or cuts away near the camera"). Walkable
// surfaces never fade. `near` is shared: its value is set each frame from how close the camera is.
function addNearFade(material,near){
 if(!material||material.userData.nearFade)return material;material.userData.nearFade=true;
 const before=material.onBeforeCompile,key=material.customProgramCacheKey;
 material.onBeforeCompile=(shader,renderer)=>{before?.call(material,shader,renderer);shader.uniforms.nearFade=near;
  shader.fragmentShader='uniform float nearFade;\n'+shader.fragmentShader.replace('#include <clipping_planes_fragment>',`#include <clipping_planes_fragment>
   {float nearD=length(vViewPosition);if(nearD<nearFade){const float BAYER[16]=float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);ivec2 bp=ivec2(mod(floor(gl_FragCoord.xy),4.));float bayer=(BAYER[bp.x+bp.y*4]+.5)/16.;if(bayer>smoothstep(.72,1.,nearD/nearFade))discard;}}`);};
 material.customProgramCacheKey=()=>(key?key.call(material):'')+'|near-fade';material.needsUpdate=true;return material;
}
// Things the rock elementals hold in the air drift up and down a little, each on its own beat, so a floating rock
// reads as meant to float. Instanced meshes only (the phase comes from each instance's place). `time` is shared.
function addBob(material,time,amount=.12){
 if(!material||material.userData.bob)return material;material.userData.bob=true;
 const before=material.onBeforeCompile,key=material.customProgramCacheKey;
 material.onBeforeCompile=(shader,renderer)=>{before?.call(material,shader,renderer);shader.uniforms.bobTime=time;
  shader.vertexShader='uniform float bobTime;\n'+shader.vertexShader.replace('#include <project_vertex>',`vec4 mvPosition=vec4(transformed,1.0);
   #ifdef USE_INSTANCING
    mvPosition=instanceMatrix*mvPosition;float bobPhase=dot(instanceMatrix[3].xyz,vec3(1.7,.31,2.3));mvPosition.y+=sin(bobTime*.55+bobPhase)*${amount.toFixed(3)};
   #endif
   mvPosition=modelViewMatrix*mvPosition;gl_Position=projectionMatrix*mvPosition;`);};
 material.customProgramCacheKey=()=>(key?key.call(material):'')+'|bob';material.needsUpdate=true;return material;
}
// isCurrent: whether this board is still wanted. When another scene is opened while this one loads, the build stops at
// its next wait, frees what it made and returns null, so an old scene never lands on the new one.
export async function createSceneView({canvas,sceneData:d,groundPicture=null,isCurrent=()=>true}){
 const waterUniforms={uTime:{value:0}}; // the board clock: water, glows, motes and floating rocks
 const near={value:0}; // how close to the camera decoration dissolves (addNearFade), set each frame
 const levelHeights=d.levelHeights||[0,6,12,18,24,30],levelAt=z=>Math.max(0,levelHeights.findIndex(h=>Math.abs(h-z)<.1));
 const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
 renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.06;
 const scene=new THREE.Scene();
 // Sky: a gradient dome round the camera (deep blue overhead, a warm haze at the horizon, a misty blue-grey
 // depth below the floating board), and the same sky as soft light on everything (an environment map), so
 // shadows are shaded, not black. Haze thickens with distance from the camera.
 const SKY={zenith:'#4a6d98',horizon:'#ecd3ad',below:'#b9a596',deep:'#62596b'};
 const skyMaterial=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,fog:false,
  uniforms:{sunDir:{value:new THREE.Vector3(-55,42,-25).normalize()},sunColor:{value:new THREE.Color('#ffd7a0')},zenith:{value:new THREE.Color(SKY.zenith)},horizon:{value:new THREE.Color(SKY.horizon)},below:{value:new THREE.Color(SKY.below)},deep:{value:new THREE.Color(SKY.deep)}},
  vertexShader:`varying vec3 vSkyDir;void main(){vSkyDir=normalize(position);vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position=p.xyww;}`,
  fragmentShader:`uniform vec3 zenith,horizon,below,deep,sunDir,sunColor;varying vec3 vSkyDir;float cH(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}float cN(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*f*(f*(f*6.-15.)+10.);return mix(mix(cH(i),cH(i+vec2(1.,0.)),f.x),mix(cH(i+vec2(0.,1.)),cH(i+vec2(1.,1.)),f.x),f.y);}void main(){vec3 dir=normalize(vSkyDir);float y=dir.y;
   vec3 c=y>0.?mix(horizon,zenith,pow(smoothstep(0.,.75,y),.65)):mix(horizon,below,smoothstep(0.,-.18,y));c=y<-.18?mix(below,deep,smoothstep(-.18,-.85,y)):c;float sd=max(dot(normalize(vSkyDir),sunDir),0.),az=max(dot(normalize(vSkyDir.xz+1e-4),normalize(sunDir.xz)),0.);c=mix(c,sunColor*.95,pow(az,3.)*.42*smoothstep(-.75,0.,y)*step(y,.05));c=mix(c,sunColor,pow(sd,6.)*.55*smoothstep(-.1,.3,y))+sunColor*(pow(sd,350.)*2.5+pow(sd,40.)*.35);
   // A sea of cloud far below the floating board, lit warm on the side toward the sun and grey-blue away from it.
   if(y<-.02){vec2 cp=dir.xz/(-y+.12)*.9;mat2 rot=mat2(.8,-.6,.6,.8);float cl=cN(cp)*.45+cN(rot*cp*2.1+4.1)*.27+cN(rot*rot*cp*4.3-2.3)*.17+cN(rot*rot*rot*cp*8.7+7.)*.11;float cloud=smoothstep(.4,.62,cl)*smoothstep(-.03,-.16,y);
    float lit=pow(max(dot(normalize(dir.xz+1e-4),normalize(sunDir.xz)),0.)*.5+.5,2.);vec3 cc=mix(vec3(.66,.63,.72),mix(vec3(1.,.82,.58),sunColor,.4),lit)*(.78+.32*cl);c=mix(c,cc,cloud);}
   gl_FragColor=vec4(c,1.);
   #include <tonemapping_fragment>
   #include <colorspace_fragment>
  }`});
 const skyDome=new THREE.Mesh(new THREE.SphereGeometry(400,64,32),skyMaterial);skyDome.frustumCulled=false;skyDome.renderOrder=-10;scene.add(skyDome);
 {const pmrem=new THREE.PMREMGenerator(renderer),skyScene=new THREE.Scene(),dome=new THREE.Mesh(new THREE.SphereGeometry(10,32,16),skyMaterial);skyScene.add(dome);scene.environment=pmrem.fromScene(skyScene,.02).texture;pmrem.dispose();dome.geometry.dispose();}
 scene.fog=new THREE.Fog(SKY.horizon,170,420);
 const camera=new THREE.PerspectiveCamera(38,1,.1,450);
 const controls=createCameraControls(camera);
 const center=new THREE.Vector3(d.width*.50,11,d.height*.51),viewScale=Math.max(d.width,d.height)/66;
 function home(){controls.target.copy(center);camera.position.copy(center).add(new THREE.Vector3(68,98,80).multiplyScalar(viewScale));controls.update();}
 home();
 const hemi=new THREE.HemisphereLight('#dfeaf0','#4f5a44',.55);scene.add(hemi);
 const sun=new THREE.DirectionalLight('#ffdcae',2.5);sun.position.set(-55,42,-25);sun.target.position.set(d.width/2,10,d.height/2);scene.add(sun,sun.target);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-57;sun.shadow.camera.right=57;sun.shadow.camera.top=57;sun.shadow.camera.bottom=-57;sun.shadow.camera.near=1;sun.shadow.camera.far=180;sun.shadow.normalBias=.055;sun.shadow.bias=-.0003;
 const rim=new THREE.DirectionalLight('#aac8d2',1.0);rim.position.set(25,16,-12);scene.add(rim);
 // A map's own art comes lit the way its maker lit it (assets/scenes/index.json "light": sky and ground colours and
 // strength of the soft light, the sun's colour and strength, exposure), not with the Orchard's daylight.
 let artLight=null;
 function setArtLight(light){const key=JSON.stringify(light);if(!light||key===artLight)return;artLight=key;
  if(light.hemi){hemi.color.set(light.hemi[0]);hemi.groundColor.set(light.hemi[1]);hemi.intensity=light.hemi[2];}
  if(light.sun){sun.color.set(light.sun[0]);sun.intensity=light.sun[1];}
  if(Number.isFinite(light.rim))rim.intensity=light.rim;if(Number.isFinite(light.exposure))renderer.toneMappingExposure=light.exposure;
  renderer.shadowMap.needsUpdate=true;}
 const stoneTex=texture('stone'),woodTex=texture('wood');stoneTex.repeat.set(.8,.8);woodTex.repeat.set(.33,.33);
 const materials={stone:new THREE.MeshStandardMaterial({color:'#e2c7a0',map:stoneTex,roughness:.88}),cap:new THREE.MeshStandardMaterial({color:'#ead5b1',roughness:.8}),wood:new THREE.MeshStandardMaterial({color:'#d9ba93',map:woodTex,roughness:.78}),darkWood:new THREE.MeshStandardMaterial({color:'#493b31',roughness:.7}),brass:new THREE.MeshStandardMaterial({color:'#d6ab52',metalness:.72,roughness:.32}),blue:new THREE.MeshStandardMaterial({color:'#247786',metalness:.3,roughness:.35}),leaf:new THREE.MeshStandardMaterial({color:'#52786c',roughness:.8}),rock:new THREE.MeshStandardMaterial({color:'#bba081',flatShading:true,roughness:1}),book:new THREE.MeshStandardMaterial({color:'#6a8c96',roughness:.8}),roof:new THREE.MeshStandardMaterial({color:'#3d6f76',metalness:.12,roughness:.6})};
 materials.stone.color.set('#c0c5bd');materials.cap.color.set('#bebfae');materials.wood.color.set('#87745d');materials.rock.color.set('#676e6b');materials.leaf.color.set('#2c5945');materials.roof.color.set('#824e34');
 Object.assign(materials,{snow:new THREE.MeshStandardMaterial({color:'#dde7e4',roughness:.94}),cloth:new THREE.MeshStandardMaterial({color:'#ddd5bb',roughness:.95}),red:new THREE.MeshStandardMaterial({color:'#9a4f3d',roughness:.92}),metal:new THREE.MeshStandardMaterial({color:'#485f64',metalness:.58,roughness:.45}),glow:new THREE.MeshStandardMaterial({color:'#edb15b',emissive:'#ffa444',emissiveIntensity:.7,roughness:.4}),steam:new THREE.MeshBasicMaterial({color:'#d9edeb',transparent:true,opacity:.048,depthWrite:false})});
 const abandoned=(...extra)=>{if(isCurrent())return false;const gs=new Set(),ms=new Set(Object.values(materials));
  scene.traverse(o=>{if(o.geometry)gs.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[])ms.add(m);});
  for(const g of gs)g.dispose();for(const m of ms)m.dispose();stoneTex.dispose();woodTex.dispose();scene.environment?.dispose();for(const x of extra)x?.dispose?.();
  renderer.dispose();renderer.forceContextLoss();return true;};
 const surfaceTextures=await loadSurfaceTextures(renderer);if(abandoned(surfaceTextures))return null;
 const photographic=['ground','rock','wood','stone'].every(k=>surfaceTextures.sets[k]);
 if(photographic){
  const s=surfaceTextures.sets;
  for(const key of ['stone','cap','wood','darkWood','rock'])materials[key].dispose();
  materials.stone=surfaceMaterial(s.stone,{color:'#e3e1d7',scale:.55,normalStrength:.48});
  materials.cap=surfaceMaterial(s.stone,{color:'#edebdf',scale:.55,normalStrength:.35});
  materials.wood=surfaceMaterial(s.wood,{color:'#c9b79f',scale:.42,normalStrength:.35});
  materials.darkWood=surfaceMaterial(s.wood,{color:'#847565',scale:.55,normalStrength:.32});
  materials.rock=surfaceMaterial(s.rock,{color:'#cecec8',scale:.48,normalStrength:.5});
  materials.leaf.color.set('#3e5541');
 }
 materials.crystal=new THREE.MeshStandardMaterial({color:'#9fcfd2',metalness:.32,roughness:.24,emissive:'#386c86',emissiveIntensity:.22});
 materials.flower=new THREE.MeshStandardMaterial({color:'#b89bd2',roughness:.75});
 materials.rock.side=THREE.DoubleSide;
 // CC0 art kit (art-kit.mjs): models and textures for plants, trees, rocks and vines. Without it the plain shapes below are drawn.
 const kit=d.props?.length||d.ramps?.length?await loadArtKit(renderer):null;if(abandoned(surfaceTextures,kit))return null;
 const kitTexture=(file,srgb=true)=>kit?.texture(file,{srgb,repeat:true})||null;
 const cliffSet=kit?{diff:kitTexture('cliff-diff.webp'),normal:kitTexture('cliff-normal.webp',false),rough:kitTexture('cliff-rough.webp',false)}:null;
 const grassSet=kit?{diff:kitTexture('grass-diff.webp'),normal:kitTexture('grass-normal.webp',false),rough:kitTexture('grass-rough.webp',false)}:null;
 materials.island=photographic?surfaceMaterial(grassSet||surfaceTextures.sets.ground,{color:grassSet?'#ffffff':'#83b069',scale:.42,normalStrength:.35,tint:grassSet?{color:'#6ea44a',amount:.8}:null}):materials.leaf;
 materials.vineBark=new THREE.MeshStandardMaterial({color:'#8d8a64',map:kitTexture('bark-diff.webp'),normalMap:kitTexture('bark-normal.webp',false),roughnessMap:kitTexture('bark-rough.webp',false),roughness:.95});
 materials.vineBark.normalScale.set(.8,.8);for(const t of [materials.vineBark.map,materials.vineBark.normalMap,materials.vineBark.roughnessMap])t?.repeat.set(1,1);
 materials.rootBark=new THREE.MeshStandardMaterial({color:'#4f3f30',normalMap:kitTexture('bark-normal.webp',false),roughness:1});
 materials.vineLeaf=new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.DoubleSide,roughness:.62,metalness:0});
 materials.vineFlower=new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.DoubleSide,roughness:.55,emissive:'#3a2430',emissiveIntensity:.35});
 const mossSet=kit?{diff:kitTexture('moss-diff.webp'),normal:kitTexture('moss-normal.webp',false),rough:kitTexture('moss-rough.webp',false)}:null;
 materials.mossRock=photographic&&mossSet?surfaceMaterial(surfaceTextures.sets.rock,{terrainGround:mossSet,color:'#d3d4cc',scale:.48,groundScale:.62,normalStrength:.5}):materials.rock;
 materials.crystalCyan=new THREE.MeshStandardMaterial({color:'#c4f1ff',emissive:'#3cbcff',emissiveIntensity:.95,roughness:.16,metalness:.08,flatShading:true});
 materials.crystalPink=new THREE.MeshStandardMaterial({color:'#ffd6ef',emissive:'#ff6fc8',emissiveIntensity:.85,roughness:.16,metalness:.08,flatShading:true});
 materials.crystalViolet=new THREE.MeshStandardMaterial({color:'#e4d6ff',emissive:'#9a6bff',emissiveIntensity:.9,roughness:.16,metalness:.08,flatShading:true});
 materials.crystalAmber=new THREE.MeshStandardMaterial({color:'#ffe7c4',emissive:'#ff9d2e',emissiveIntensity:.9,roughness:.16,metalness:.08,flatShading:true});
 materials.fruit=new THREE.MeshStandardMaterial({color:'#ffffff',emissive:'#ff7a10',emissiveIntensity:.32,roughness:.45});
 materials.leafCards=kit?addNearFade(new THREE.MeshStandardMaterial({map:kit.texture('kit-leaves-tree.webp'),alphaTest:.42,side:THREE.DoubleSide,roughness:.8,color:'#ffffff'}),near):null;
 materials.runes=new THREE.MeshBasicMaterial({map:runeTexture(),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,color:'#9fd8ff',polygonOffset:true,polygonOffsetFactor:-3});
 materials.stoneCurb=photographic?surfaceMaterial(surfaceTextures.sets.stone,{color:'#cfcbbf',scale:.9,normalStrength:.45}):materials.stone;
 materials.mossDecal=new THREE.MeshStandardMaterial({color:'#e2eeb8',map:kitTexture('moss-diff.webp'),alphaMap:mossMask(),transparent:true,depthWrite:false,roughness:1,polygonOffset:true,polygonOffsetFactor:-1});
 const mossPatch=(()=>{const sh=new THREE.Shape();for(let i=0;i<=18;i++){const a=i/18*TAU,r=.5;i?sh.lineTo(Math.cos(a)*r,Math.sin(a)*r):sh.moveTo(Math.cos(a)*r,Math.sin(a)*r);}const g=new THREE.ShapeGeometry(sh,2);const uv=g.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)+.5,uv.getY(i)+.5);g.rotateX(-Math.PI/2);return g;})();
 const floatingRock=moss=>{const m=photographic?(moss&&mossSet?surfaceMaterial(surfaceTextures.sets.rock,{terrainGround:mossSet,color:'#d3d4cc',scale:.48,groundScale:.62,normalStrength:.5}):surfaceMaterial(surfaceTextures.sets.rock,{color:'#cecec8',scale:.48,normalStrength:.5})):new THREE.MeshStandardMaterial({color:'#676e6b',roughness:1});return addNearFade(addBob(m,waterUniforms.uTime),near);};
 materials.floatRock=floatingRock(false);materials.floatMossRock=floatingRock(true);
 // Rock elementals' lights: small stones with amber light in their runes, floating where the map had lanterns.
 materials.runeStone=addNearFade(addBob(photographic?surfaceMaterial(surfaceTextures.sets.rock,{color:'#b9b4a8',scale:1.1,normalStrength:.5}):new THREE.MeshStandardMaterial({color:'#8a8478'}),waterUniforms.uTime,.09),near);materials.runeStone.emissive.set('#ffffff');materials.runeStone.emissiveMap=veinTexture();materials.runeStone.emissiveIntensity=1.4;materials.runeStone.color.set('#8d877c');
 const geo={leafClump:leafClumpGeometry(),runeRing:runeRingGeometry(),curb:curbGeometry(),mossPatch,crystalShard:crystalGeometry(),box:new THREE.BoxGeometry(1,1,1),cylinder:new THREE.CylinderGeometry(1,1,1,12),sphere:new THREE.SphereGeometry(1,12,8),rock:new THREE.IcosahedronGeometry(1,1),leaf:new THREE.IcosahedronGeometry(1,0),cone:new THREE.ConeGeometry(1,1,9),torus:new THREE.TorusGeometry(1,.045,6,32)};
 for(let i=0;i<4;i++)geo['crag'+i]=cragGeometry(i);
 for(const key of ['rock','mossRock','vineBark','vineLeaf','vineFlower','rootBark','crystalCyan','crystalPink','crystalViolet','crystalAmber','fruit','leaf','darkWood','glow','metal'])addNearFade(materials[key],near);
 const root=new THREE.Group();scene.add(root);const floors=[],props=[],wallMeshes=[],doorMeshes=[],pickSurfaces=[];const batches=new Map();const mat4=new THREE.Matrix4(),obj=new THREE.Object3D();
 function batch(shape,material,p,scale,rotation=[0,0,0],level=0,category='prop',color=null){
  const key=`${shape}:${material}:${level}:${category}`;if(!batches.has(key))batches.set(key,{shape,material,level,category,items:[]});
  obj.position.set(...p);obj.rotation.set(...rotation);obj.scale.set(...scale);obj.updateMatrix();batches.get(key).items.push({matrix:obj.matrix.clone(),color});
 }
 function commitBatches(){for(const b of batches.values()){
  const mesh=new THREE.InstancedMesh(geo[b.shape],materials[b.material],b.items.length);const colored=b.items.some(v=>v.color);b.items.forEach((v,i)=>{mesh.setMatrixAt(i,v.matrix);if(colored)mesh.setColorAt(i,new THREE.Color(v.color||'#ffffff'));});mesh.castShadow=b.material!=='steam';mesh.receiveShadow=b.material!=='steam';mesh.userData={level:b.level,category:b.category};root.add(mesh);props.push(mesh);
 }}
 // Render the exact source samples, including narrow excavations and water edges.
 let {n,m,h}=d.field;
 // The height field covers these squares (a live field carries its own bounds).
 let fx0=d.field.bounds?.left??0,fz0=d.field.bounds?.top??0,fw=d.field.bounds?.width??d.width,fd=d.field.bounds?.height??d.height;
 // `bottom`: under the lowest ground, for the board's sides and for picking. Worked out again whenever the ground
 // changes (setField): kept from the first field, a pit deeper than that could not be pointed at (Medpilis, Oct 2026).
 const w=d.width,depth=d.height;let bottom=h.reduce((a,b)=>Math.min(a,b),0)-.7;
 const terrainG=new THREE.PlaneGeometry(w,depth,n-1,m-1);terrainG.rotateX(-Math.PI/2);terrainG.translate(w/2,0,depth/2);
 const pos=terrainG.attributes.position;const colors=[];const c=new THREE.Color();
 for(let i=0;i<pos.count;i++){
  pos.setY(i,h[i]-.025);const z=h[i],x=pos.getX(i),y=pos.getZ(i);
  const hash=Math.sin(i*127.1+Math.floor(i/n)*311.7)*43758.5453;
  const grain=(hash-Math.floor(hash)-.5)*.008;
  const variation=(Math.sin(x*.61+y*.24)+Math.cos(y*.55-x*.18))*.018;
  const ix=i%n,iy=Math.floor(i/n),slope=Math.max(Math.abs(h[i]-h[iy*n+Math.min(n-1,ix+1)]),Math.abs(h[i]-h[Math.min(m-1,iy+1)*n+ix]))/(w/(n-1));
  const cliff=Math.min(1,Math.max(0,(slope-.35)*.8));
  c.setHSL(.205-cliff*.05,.32-cliff*.25,.14+cliff*.055+variation+grain);colors.push(c.r,c.g,c.b);
 }
 terrainG.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));terrainG.computeVertexNormals();
 // A scene without prepared art shows its own map picture on the ground. The
 // picture covers its image rectangle in squares; the board edge outside it
 // keeps the picture's edge colour.
 let pictureTexture=null;
 if(groundPicture?.url){pictureTexture=await new THREE.TextureLoader().loadAsync(groundPicture.url).catch(()=>null);
  if(pictureTexture){pictureTexture.colorSpace=THREE.SRGBColorSpace;pictureTexture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());pictureTexture.wrapS=pictureTexture.wrapT=THREE.ClampToEdgeWrapping;
   const r=groundPicture;pictureTexture.repeat.set(w/r.width,depth/r.height);pictureTexture.offset.set(-r.left/r.width,1-depth/r.height+r.top/r.height);}
  if(abandoned(surfaceTextures,kit,pictureTexture))return null;}
 const terrainMaterial=pictureTexture?new THREE.MeshStandardMaterial({map:pictureTexture,roughness:1,metalness:0}):photographic?surfaceMaterial(cliffSet||surfaceTextures.sets.rock,{terrainGround:grassSet||surfaceTextures.sets.ground,color:cliffSet?'#ffffff':'#c9cbbd',scale:cliffSet?.22:.48,groundScale:grassSet?.42:.36,normalStrength:.55,tint:cliffSet?{color:'#a2a69a',amount:.72}:null,groundTint:grassSet?{color:'#6c9e47',amount:.8}:null,groundAlt:grassSet?surfaceTextures.sets.ground:null,groundAltTint:{color:'#7d6643',amount:.55}}):new THREE.MeshStandardMaterial({vertexColors:true,roughness:1});
 const terrain=new THREE.Mesh(terrainG,terrainMaterial);terrain.receiveShadow=true;terrain.userData={level:0};root.add(terrain);pickSurfaces.push(terrain);
 function heightAt(x,y){const gx=Math.max(0,Math.min(n-1,(x-fx0)/fw*(n-1))),gy=Math.max(0,Math.min(m-1,(y-fz0)/fd*(m-1)));const a=Math.floor(gx),b=Math.floor(gy),u=gx-a,v=gy-b;return (h[b*n+a]*(1-u)+h[b*n+Math.min(a+1,n-1)]*u)*(1-v)+(h[Math.min(b+1,m-1)*n+a]*(1-u)+h[Math.min(b+1,m-1)*n+Math.min(a+1,n-1)]*u)*v;}
 // Solid cut terrain edges keep the map a physical diorama from every camera angle.
 const skirtShade=list=>{const out=[];for(let i=1;i<list.length;i+=3){const t=Math.max(0,Math.min(1,(list[i]-bottom)/Math.max(1,-bottom+4))),k=.32+.68*t;out.push(k,k,k);}return out;};
 const skirts=skirtPositions();
 const skirtG=new THREE.BufferGeometry();skirtG.setAttribute('position',new THREE.Float32BufferAttribute(skirts,3));skirtG.setAttribute('color',new THREE.Float32BufferAttribute(skirtShade(skirts),3));skirtG.computeVertexNormals();const skirtMat=photographic?surfaceMaterial(cliffSet||surfaceTextures.sets.rock,{color:'#ffffff',scale:cliffSet?.09:.48,normalStrength:.45,tint:cliffSet?{color:'#8e9188',amount:.72}:null}):new THREE.MeshStandardMaterial({color:'#454b45',roughness:1});skirtMat.side=THREE.DoubleSide;skirtMat.vertexColors=true;const skirt=new THREE.Mesh(skirtG,skirtMat);root.add(skirt);
 const base=new THREE.Mesh(new THREE.BoxGeometry(w+.25,.22,depth+.25),skirtMat);base.position.set(w/2,bottom-.12,depth/2);base.receiveShadow=true;root.add(base);
 // Live heights: Height tool strokes and shared terrain edits redraw the ground
 // in place (same grid) or rebuild it (new grid), with its sides.
 function groundColors(geometry){const position=geometry.attributes.position,colors=new Float32Array(position.count*3),c=new THREE.Color(),cell=fw/Math.max(1,n-1);
  for(let i=0;i<position.count;i++){const x=position.getX(i),y=position.getZ(i),ix=i%n,iy=Math.floor(i/n);
   const hash=Math.sin(i*127.1+iy*311.7)*43758.5453,grain=(hash-Math.floor(hash)-.5)*.008,variation=(Math.sin(x*.61+y*.24)+Math.cos(y*.55-x*.18))*.018;
   const slope=Math.max(Math.abs(h[i]-h[iy*n+Math.min(n-1,ix+1)]),Math.abs(h[i]-h[Math.min(m-1,iy+1)*n+ix]))/cell,cliff=Math.min(1,Math.max(0,(slope-.35)*.8));
   c.setHSL(.205-cliff*.05,.32-cliff*.25,.14+cliff*.055+variation+grain);colors[i*3]=c.r;colors[i*3+1]=c.g;colors[i*3+2]=c.b;}
  geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));}
 // The board's sides: a rugged cliff from the board's edge down to its foot. The top stays on the edge; further down
 // the face bulges in and out more, so the board reads as a block of land, not a cut cake.
 function skirtPositions(){const out=[],rows=8;
  for(const [a,b,count,nx,nz] of [[{x:0,y:0},{x:w,y:0},n,0,-1],[{x:w,y:0},{x:w,y:depth},m,1,0],[{x:w,y:depth},{x:0,y:depth},n,0,1],[{x:0,y:depth},{x:0,y:0},m,-1,0]])for(let i=0;i<count-1;i++){
   const p={x:a.x+(b.x-a.x)*i/(count-1),y:a.y+(b.y-a.y)*i/(count-1)},q={x:a.x+(b.x-a.x)*(i+1)/(count-1),y:a.y+(b.y-a.y)*(i+1)/(count-1)};
   const at=(pt,j)=>{const top=heightAt(pt.x,pt.y)-.025,y=top+(bottom-top)*j/rows,along=pt.x*1.3+pt.y*1.7,amp=Math.min(1.5,(top-y)*.13)*Math.sin(Math.PI*j/rows),off=(Math.sin(along*.9+y*.7)*.6+Math.sin(along*.37-y*1.3)*.4)*amp;return [pt.x+nx*off,y,pt.y+nz*off];};
   for(let j=0;j<rows;j++){const a0=at(p,j),a1=at(p,j+1),b0=at(q,j),b1=at(q,j+1);out.push(...a1,...b1,...b0,...a1,...b0,...a0);}
  }
  return out;}
 function setField(next){
  if(!next?.h||!(next.n>1)||!(next.m>1))return;
  const sameGrid=next.n===n&&next.m===m&&(next.bounds?.left??0)===fx0&&(next.bounds?.top??0)===fz0&&(next.bounds?.width??w)===fw&&(next.bounds?.height??depth)===fd;
  n=next.n;m=next.m;h=next.h;fx0=next.bounds?.left??0;fz0=next.bounds?.top??0;fw=next.bounds?.width??w;fd=next.bounds?.height??depth;
  let g=terrain.geometry;
  if(!sameGrid){g=new THREE.PlaneGeometry(fw,fd,n-1,m-1);g.rotateX(-Math.PI/2);g.translate(fx0+fw/2,0,fz0+fd/2);
   // Texture coordinates over the board, as the first ground had them (the picture's own placement is in its texture).
   const uv=g.attributes.uv,position=g.attributes.position;for(let i=0;i<position.count;i++)uv.setXY(i,position.getX(i)/w,1-position.getZ(i)/depth);}
  const position=g.attributes.position;for(let i=0;i<position.count;i++)position.setY(i,h[i]-.025);position.needsUpdate=true;
  {let low=0;for(let i=0;i<h.length;i++)if(h[i]<low)low=h[i];bottom=low-.7;base.position.y=bottom-.12;}
  groundColors(g);g.computeVertexNormals();g.computeBoundingSphere();g.computeBoundingBox();
  if(!sameGrid){terrain.geometry.dispose();terrain.geometry=g;}
  {const list=skirtPositions();skirtG.setAttribute('position',new THREE.Float32BufferAttribute(list,3));skirtG.setAttribute('color',new THREE.Float32BufferAttribute(skirtShade(list),3));}skirtG.computeVertexNormals();
  let top=-Infinity;for(let i=0;i<h.length;i++)if(h[i]>top)top=h[i];terrainTop=top+.01;
  renderer.shadowMap.needsUpdate=true;
 }
 const groundTiles=d.floors.filter(f=>f.level===0),tileGroups=new Map();
 for(const f of d.floors){
  // Floating plates own their exact irregular outline. Square native tiles would protrude over those edges.
  if(f.level>0)continue;
  const plates=d.walls.roofs.filter(s=>s.kind==='floor'&&Math.abs(s.height-f.z)<.1);
  if(plates.length&&!plates.some(s=>contained(f.x,f.y,s)))continue;
  const key=`${f.level}:${f.name}`;if(!tileGroups.has(key))tileGroups.set(key,[]);tileGroups.get(key).push(f);
 }
 for(const fs of tileGroups.values()){
  const timber=/Plank/i.test(fs[0].name),mat=timber?materials.wood:photographic?surfaceMaterial(surfaceTextures.sets.stone,{color:/Cobble/i.test(fs[0].name)?'#b8bcae':'#e4e0d3',scale:/Cobble/i.test(fs[0].name)?.85:.55,normalStrength:.45}):new THREE.MeshStandardMaterial({color:/Cobble/i.test(fs[0].name)?'#929889':'#aaa99d',roughness:.96});
  const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(.985,.05,.985),mat,fs.length);
  fs.forEach((f,i)=>{obj.position.set(f.x,f.z+.015,f.y);obj.rotation.set(0,0,0);obj.scale.set(1,1,1);obj.updateMatrix();mesh.setMatrixAt(i,obj.matrix);mesh.setColorAt(i,new THREE.Color().setScalar(.80+((Math.sin(i*56.7)+1)/2)*.18));});
  mesh.receiveShadow=true;mesh.userData={level:fs[0].level};root.add(mesh);floors.push(mesh);pickSurfaces.push(mesh);
 }
 const islandFringe=[],islandMoss=[],islandBodies=[],islandChunks=[];
 materials.islandChunk=photographic&&cliffSet?surfaceMaterial(cliffSet,{color:'#ffffff',scale:.3,normalStrength:.5,tint:{color:'#8f897d',amount:.7}}):materials.rock;
 materials.islandRock=photographic&&cliffSet?surfaceMaterial(cliffSet,{color:'#ffffff',scale:.3,normalStrength:.5,tint:{color:'#9d978a',amount:.7}}):materials.rock.clone();materials.islandRock.vertexColors=true;addBob(materials.islandChunk,waterUniforms.uTime,.15);addNearFade(materials.islandChunk,near);addNearFade(materials.islandRock,near);materials.islandRock.side=THREE.DoubleSide;
 // The board itself floats: under its sides a great tapering mass of rock, darkening and lost in the haze below.
 if(d.props?.length){const outline=[],step=2;for(const [a,b] of [[[0,0],[w,0]],[[w,0],[w,depth]],[[w,depth],[0,depth]],[[0,depth],[0,0]]]){const n=Math.round(Math.hypot(b[0]-a[0],b[1]-a[1])/step);for(let i=0;i<n;i++)outline.push([a[0]+(b[0]-a[0])*i/n,a[1]+(b[1]-a[1])*i/n]);}
  const R=9,L=outline.length,deepest=Math.max(w,depth)*.55,mx=w/2,mz=depth/2,verts=[],shade=[];
  const at=(i,k)=>{const t=k/R,[px,pz]=outline[i%L],n=Math.sin(i*.9+k*1.7)*.55+Math.sin(i*.31-k*.8)*.45,shrink=k?Math.max(.03,(1-Math.pow(t,.8)*.97)*(1+n*.07)):1;return [mx+(px-mx)*shrink,bottom-.05-(k?deepest*Math.pow(t,1.2)+n*1.2*t:0),mz+(pz-mz)*shrink];};
  const push=(v,k)=>{verts.push(...v);const c=.85-.6*(k/R);shade.push(c,c,c*1.02);};
  for(let k=0;k<R;k++)for(let i=0;i<L;i++){const a=at(i,k),b=at(i+1,k),c=at(i+1,k+1),q=at(i,k+1);push(a,k);push(c,k+1);push(b,k);push(a,k);push(q,k+1);push(c,k+1);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));g.setAttribute('color',new THREE.Float32BufferAttribute(shade,3));g.computeVertexNormals();
  const mass=new THREE.Mesh(g,materials.islandRock);mass.receiveShadow=true;mass.userData={level:0,category:'board-mass'};root.add(mass);base.visible=false;}
 for(const s of d.walls.roofs){
  const level=s.level??levelAt(s.height),floating=s.floating!==false&&s.height>0;
  // A floating plate: grass on its top, rock on its sides (not a grass-sided slab).
  const mesh=new THREE.Mesh(polygon(s,s.kind==='roof'?.18:.25),s.kind==='roof'?materials.roof:floating&&s.kind==='floor'?[materials.island,materials.mossRock]:floating?materials.island:materials.stone);mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData={level,levelId:s.levelId,surfaceId:s.id,isRoof:s.kind==='roof'};mesh.visible=s.kind!=='roof';root.add(mesh);floors.push(mesh);if(s.kind!=='roof')pickSurfaces.push(mesh);
  if(floating&&s.kind==='floor'){
   const ring=s.points,cx=ring.reduce((v,p)=>v+p.x,0)/ring.length,cy=ring.reduce((v,p)=>v+p.y,0)/ring.length;
   // The island's edge: short grass along the rim just inside it, and moss hanging under the lip now and then.
   for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],len=Math.hypot(b.x-a.x,b.y-a.y);if(len<.05)continue;const steps=Math.max(1,Math.round(len/.16));
    for(let k=0;k<steps;k++){const t=(k+.5)/steps,px=a.x+(b.x-a.x)*t,py=a.y+(b.y-a.y)*t,hh=stableHash(s.id+':'+i+':'+k),ix=cx-px,iy=cy-py,il=Math.hypot(ix,iy)||1;
     islandFringe.push({x:px+ix/il*(.02+(hh%4)*.03),y:py+iy/il*(.02+(hh%4)*.03),z:s.height,level,h:hh});
     if(hh%7===0){const hang=.45+(hh%9)*.12;islandMoss.push({name:'Overgrown Vines',id:s.id+':moss:'+i+':'+k,x:px-ix/il*.04,y:py-iy/il*.04,base:s.height-.2-hang,size:{height:hang,width:.35,depth:.35},level,rotation:hh%360});}}}
   // The island's body: one sculpted mass of layered rock under its grass top, tapering to a point, darker
   // towards the tip, its outline broken; it stops well above anything below it (the open air between tiers stays).
   const xs=ring.map(p=>p.x),ys=ring.map(p=>p.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),span=Math.min(maxX-minX,maxY-minY);
   const below=d.walls.roofs.filter(o=>o!==s&&o.kind==='floor'&&o.height<s.height-.5&&Math.min(...o.points.map(p=>p.x))<maxX&&Math.max(...o.points.map(p=>p.x))>minX&&Math.min(...o.points.map(p=>p.y))<maxY&&Math.max(...o.points.map(p=>p.y))>minY).reduce((m,o)=>Math.max(m,o.height),heightAt(cx,cy));
   const drop=Math.max(.9,Math.min(9,span*.6+1.2,s.height-below-1.6)),hs=stableHash(s.id);
   const outline=[];for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],n=Math.max(1,Math.round(Math.hypot(b.x-a.x,b.y-a.y)/.6));for(let k=0;k<n;k++)outline.push({x:a.x+(b.x-a.x)*k/n,y:a.y+(b.y-a.y)*k/n});}
   // Rings down the body: the taper comes in steps (ledges of strata), the outline is lumpy, and the first ring
   // juts out a little (an overhang under the grass).
   const R=12,noise=(i,k)=>Math.sin(i*.9+k*1.9+hs%97)*.55+Math.sin(i*.31-k*.7+hs%13)*.3+Math.sin(i*2.7+k*3.1)*.15;
   const stepped=t=>{const q=t*4,f=q-Math.floor(q);return (Math.floor(q)+(f<.65?f*.25:.1625+(f-.65)/.35*.8375))/4;};
   const at=(i,k)=>{const t=k/R,p=outline[i%outline.length],shrink=k===1?1.05+noise(i,k)*.05:k?Math.max(.04,(1-Math.pow(stepped(t),.85)*.96)*(1+noise(i,k)*.17)):1,down=k?.18+drop*Math.pow(t,1.15)+noise(i+5,k)*.18*t:.02;return [cx+(p.x-cx)*shrink,s.height-down,cy+(p.y-cy)*shrink];};
   const verts=[],shade=[],L=outline.length,push=(v,k)=>{verts.push(...v);const c=1-.5*(k/R);shade.push(c,c*.98,c*.95);};
   for(let k=0;k<R;k++)for(let i=0;i<L;i++){const a=at(i,k),b=at(i+1,k),c=at(i+1,k+1),q=at(i,k+1);push(a,k);push(b,k);push(c,k+1);push(a,k);push(c,k+1);push(q,k+1);}
   const tip=[cx+(hs%7-3)*.08,s.height-drop-.5,cy+(hs%5-2)*.08];for(let i=0;i<L;i++){push(at(i,R),R);push(at(i+1,R),R);push(tip,R);}
   const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));g.setAttribute('color',new THREE.Float32BufferAttribute(shade,3));g.computeVertexNormals();
   const underside=new THREE.Mesh(g,materials.islandRock);underside.castShadow=true;underside.receiveShadow=true;underside.userData={level,category:'island-rock'};root.add(underside);props.push(underside);
   islandBodies.push({s,minX,maxX,minY,maxY,top:s.height,bottom:s.height-drop-.5,level});
   // Roots hanging out of the underside, and a few chunks of rock floating free below the tip.
   for(let i=0;i<L;i+=Math.max(2,Math.round(L/7))){const p=at(i+(hs%3),2),hang=1+(stableHash(s.id+i)%9)*.22;
    islandMoss.push({name:'Overgrown Roots',id:s.id+':root:'+i,x:p[0],y:p[2],base:p[1]-hang,size:{height:hang,width:.6,depth:.4},level,rotation:(hs+i*47)%360});}
   for(let c=0;c<2+hs%3;c++){const r0=stableHash(s.id+':chunk:'+c),a=r0%628/100,dist=.3+(r0%5)*.25,size=.25+(r0%7)*.07;
    islandChunks.push({x:tip[0]+Math.cos(a)*dist,y:tip[2]+Math.sin(a)*dist,z:tip[1]-.5-(r0%9)*.2-c*.4,size,level,h:r0});}
   continue;
  }
  // Stone fascia around the outer edge and gallery opening makes floor depth readable.
  for(const ring of [s.points,...(s.holes||[])])for(let i=0;i<ring.length;i++){
   const a=ring[i],b=ring[(i+1)%ring.length],len=Math.hypot(b.x-a.x,b.y-a.y);if(len<.01)continue;
   batch('box',s.kind==='roof'?'roof':'darkWood',[(a.x+b.x)/2,s.height-.13,(a.y+b.y)/2],[len,.19,.09],[0,-Math.atan2(b.y-a.y,b.x-a.x),0],level,s.kind==='roof'?'roof':'fascia');
  }
 }
 if(d.water?.triangles?.length){
  const points=[];for(let i=0;i<d.water.triangles.length;i+=3)points.push(d.water.triangles[i],d.water.triangles[i+2],d.water.triangles[i+1]);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(points,3));g.computeVertexNormals();
  const mat=new THREE.ShaderMaterial({uniforms:waterUniforms,side:THREE.DoubleSide,forceSinglePass:true,transparent:true,depthWrite:true,
   vertexShader:`varying vec3 vWorld;void main(){vWorld=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
   fragmentShader:`uniform float uTime;varying vec3 vWorld;void main(){float wave=sin(vWorld.x*5.3+vWorld.z*2.7+uTime*.55)*sin(vWorld.z*6.2-vWorld.x*1.5-uTime*.4);float broad=sin(vWorld.x*.7+vWorld.z*.9)*.5+.5;vec3 c=mix(vec3(.018,.18,.19),vec3(.055,.40,.40),broad*.65+.25);c+=vec3(.10,.21,.19)*pow(max(wave,0.),12.)*.5;gl_FragColor=vec4(c,.94);
   #include <tonemapping_fragment>
   #include <colorspace_fragment>
   }`
  });
  const water=new THREE.Mesh(g,mat);water.userData={level:0};root.add(water);pickSurfaces.push(water);
 }
 const nodeById=new Map(d.walls.nodes.map(v=>[v.id,v]));const wallByLevel=new Map();
 for(const wall of d.walls.segments){
  // Orchard barriers are collision rings around the authored objects, not building walls.
  continue;
  const a=nodeById.get(wall.a),b=nodeById.get(wall.b);if(!a||!b)continue;const len=Math.hypot(a.x-b.x,a.y-b.y);
  // The narrow pillar collision outlines are rendered by the original pillar artwork below.
  if(len<.1)continue;
  const level=Math.round(wall.base/2),rail=/Bannister|Railing/i.test(wall.name||''),key=`${level}:${wall.interaction==='door'?'door':rail?'rail':'wall'}`;
  if(rail){
   const angle=-Math.atan2(b.y-a.y,b.x-a.x),height=Math.min(wall.height,.8);
   for(const q of [a,b])batch('box','darkWood',[q.x,wall.base+height/2,q.y],[.11,height,.11],[0,angle,0],level);
   for(const up of [.33,height])batch('box','darkWood',[(a.x+b.x)/2,wall.base+up,(a.y+b.y)/2],[len,.075,.075],[0,angle,0],level);
   continue;
  }
  if(!wallByLevel.has(key))wallByLevel.set(key,{level,door:wall.interaction==='door',items:[]});wallByLevel.get(key).items.push({wall,a,b,len});
 }
 for(const b of wallByLevel.values()){
  const mesh=new THREE.InstancedMesh(geo.box,b.door?materials.darkWood:materials.stone,b.items.length);mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData={...b};root.add(mesh);wallMeshes.push(mesh);if(b.door)doorMeshes.push(mesh);
  if(!b.door){const cap=new THREE.InstancedMesh(geo.box,materials.cap,b.items.length);cap.castShadow=true;cap.receiveShadow=true;root.add(cap);mesh.userData.cap=cap;}
 }
 // Cardinal ramp geometry shares the source plane with movement. Arch decks float;
 // vines remain narrow steep climbs rather than giant filled stair blocks.
 const vineRamps=[];
 for(const r of d.ramps){
  const level=r.fromLevelIndex??levelAt(r.base),horizontal=['east','west'].includes(r.direction),vine=r.kind==='vine'||Math.abs(r.height-r.base)/Math.max(r.right-r.left,r.bottom-r.top)>1.5;
  const corners=[{x:r.left,y:r.top},{x:r.right,y:r.top},{x:r.right,y:r.bottom},{x:r.left,y:r.bottom}];
  const points=corners.map(p=>[p.x,rampHeight(r,p.x,p.y),p.y]),positions=[...points[0],...points[2],...points[1],...points[0],...points[3],...points[2]];
  const rampG=new THREE.BufferGeometry();rampG.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));rampG.computeVertexNormals();
  const pickRamp=new THREE.Mesh(rampG,new THREE.MeshBasicMaterial({visible:false,side:THREE.DoubleSide}));pickRamp.userData={level,ramp:true,rampId:r.id};root.add(pickRamp);pickSurfaces.push(pickRamp);floors.push(pickRamp);
  if(!vine){
   const deckG=rampG.clone(),verts=[...positions];for(let i=0;i<4;i++){const a=points[i],b=points[(i+1)%4],a2=[a[0],a[1]-.4,a[2]],b2=[b[0],b[1]-.4,b[2]];verts.push(...a,...b,...b2,...a,...b2,...a2);}
   const bottom=points.map(p=>[p[0],p[1]-.4,p[2]]);verts.push(...bottom[0],...bottom[1],...bottom[2],...bottom[0],...bottom[2],...bottom[3]);
   deckG.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));deckG.deleteAttribute('normal');deckG.computeVertexNormals();const deck=new THREE.Mesh(deckG,materials.rock);deck.castShadow=true;deck.receiveShadow=true;deck.userData={level,category:'arch'};root.add(deck);props.push(deck);
   {const along=horizontal?r.right-r.left:r.bottom-r.top,lane=horizontal?r.bottom-r.top:r.right-r.left,n=Math.max(2,Math.round(along/.42));
    for(let i=0;i<n;i++){const t=(i+.5)/n,x=horizontal?r.left+along*t:(r.left+r.right)/2,y=horizontal?(r.top+r.bottom)/2:r.top+along*t,z=rampHeight(r,x,y);
     batch('box','stoneCurb',[x,z+.04,y],horizontal?[along/n*.9,.12,lane*.94]:[lane*.94,.12,along/n*.9],[0,0,0],level,'arch',(stableHash(r.id+i)%3)?'#e8e4d8':'#d2cdbf');}}
  }else vineRamps.push(r);
 }
 // Vine ramps as living vines along each ramp's own lane (vine-art.mjs).
 const vines=buildVines(vineRamps,{levelOf:r=>r.fromLevelIndex??levelAt(r.base),barkMaterial:materials.vineBark,leafMaterial:materials.vineLeaf,flowerMaterial:materials.vineFlower});
 for(const mesh of vines.meshes){root.add(mesh);props.push(mesh);}
 materials.treeBark=kit?addNearFade(new THREE.MeshStandardMaterial({color:'#efdcc0',map:kitTexture('bark-diff.webp'),normalMap:kitTexture('bark-normal.webp',false),roughness:.95}),near):null;
 const hangingProps=[],glows=[],cover=[],mists=[];
 // What holds a thing up: the highest ground or floor plate under its footprint (radius rad), up to its own base z.
 const floorPlates=d.walls.roofs.filter(r=>r.kind==='floor');
 const supportUnder=(x,y,z,rad)=>{let best=-Infinity;for(let a=0;a<12;a++)for(const f of [0,.5,1]){const px=x+Math.cos(a/12*TAU)*rad*f,py=y+Math.sin(a/12*TAU)*rad*f;best=Math.max(best,heightAt(px,py));for(const r of floorPlates)if(r.height<=z+.1&&contained(px,py,r))best=Math.max(best,r.height);if(!f)break;}return best;};
 const rockList=d.props.filter(q=>/Rock/.test(q.name));
 const restsOnRock=(p,z)=>rockList.some(q=>q!==p&&Math.hypot(q.x-p.x,q.y-p.y)<(Math.max(q.size.width,q.size.depth)+Math.max(p.size.width,p.size.depth))/2*.9&&(q.base??q.z)<z&&(q.base??q.z)+q.size.height>=z-.1);
 const inIslandBody=(x,y,z)=>islandBodies.some(b=>x>b.minX-.5&&x<b.maxX+.5&&y>b.minY-.5&&y<b.maxY+.5&&z<b.top+.1&&z>b.bottom-1);
 const edgeDistance=(x,y,ring)=>{let best=Infinity;for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy||1)));best=Math.min(best,Math.hypot(a.x+dx*t-x,a.y+dy*t-y));}return best;};
 const onIslandLip=(x,y,z)=>islandBodies.some(b=>Math.abs(z-b.top)<.35&&x>b.minX-.4&&x<b.maxX+.4&&y>b.minY-.4&&y<b.maxY+.4&&edgeDistance(x,y,b.s.points)<.85);
 // Kit models as batched instances: each part of a model registered once as a shape and a material.
 const kitParts=model=>{if(!kit)return null;const parts=kit.parts(model);if(!parts.length)return null;return parts.map((part,i)=>{const g='kit:'+model+':'+i,m=/^Bark_/.test(part.name)&&materials.treeBark?'treeBark':'kitmat:'+model+':'+i;geo[g]??=part.geometry;materials[m]??=addNearFade(part.material,near);return {g,m};});};
 const propReport={represented:0,stairsViaCanonical:0,aggregatedAtmosphere:0,unsupported:{},byName:{}},steamCells=new Set(),waterProps=[];
 for(const p of d.props){
  const x=p.x,y=p.y,z=p.base??p.z,level=p.level??0,rot=-(p.rotation||0)*Math.PI/180;
  const sx=Math.max(.025,p.size?.width??.5),sy=Math.max(.025,p.size?.depth??.5),sh=Math.max(.02,p.size?.height??.5),name=p.name;
  propReport.byName[name]=(propReport.byName[name]||0)+1;
  const add=(shape,mat,offset,size,r=[0,0,0],color=null)=>{
   const ox=offset[0]*Math.cos(rot)+offset[2]*Math.sin(rot),oy=-offset[0]*Math.sin(rot)+offset[2]*Math.cos(rot);
   batch(shape,mat,[x+ox,z+offset[1],y+oy],size,[r[0],r[1]+rot,r[2]],level,'prop',color);
  };
  const box=(mat,up,width=sx,height=sh,depth=sy,off=[0,0])=>add('box',mat,[off[0],up,off[1]],[width,height,depth]);
  const pick=list=>list[stableHash(p.blockId||p.id)%list.length],kitSize=model=>kit?.size(model),g0=model=>kitParts(model)[0].g;
  // Puts a kit model on this placement: scale [x,y,z] on the model, `mat` in place of its own material.
  const kitPut=(model,scale,{up=0,yaw=0,color=null,mat=null}={})=>{const parts=kitParts(model);if(!parts)return false;for(const {g,m} of parts)add(g,mat||m,[0,up,0],scale,[0,yaw,0],color);return true;};
  const glow=(height,radius,color,size)=>glows.push({x,y,base:z,height,radius,color,size,level});
  if(/Stairs/i.test(name)){propReport.stairsViaCanonical++;continue;}
  if(/Steam|Cold Fog|Swirling Mist|Necrotic Smoke/.test(name)){
   propReport.aggregatedAtmosphere++;const key=`${Math.floor(x/1.8)},${Math.floor(y/1.8)},${level}`;
   if(!steamCells.has(key)){steamCells.add(key);mists.push({x,y,z:z+.38,size:Math.max(1.4,Math.max(sx,sy)*1.2),level,color:/Green|Necrotic/.test(name)?'#9accc2':'#d9edeb'});}continue;
  }
  if(/Rock|Rubble/.test(name)&&p.intentionalFloat&&islandBodies.some(b=>x>b.minX-.6&&x<b.maxX+.6&&y>b.minY-.6&&y<b.maxY+.6&&z+sh<=b.top+.25&&z>=b.bottom-1.5)){propReport.underIslands=(propReport.underIslands||0)+1;continue;}
  let floating=false;
  if(/Rock/.test(name)&&!/Pillar/.test(name)&&sh>.8&&onIslandLip(x,y,z)&&!(d.walls.nodes||[]).some(n=>Math.hypot(n.x-x,n.y-y)<Math.max(.6,sx*.6))){propReport.lipRocks=(propReport.lipRocks||0)+1;continue;}
  if(/Rock/.test(name)&&!/Pillar/.test(name)&&z-supportUnder(x,y,z,Math.max(sx,sy)/2+.25)>.3&&!inIslandBody(x,y,z)&&!restsOnRock(p,z)){propReport.floatingRocks=(propReport.floatingRocks||0)+1;floating=true;}
  propReport.represented++;
  const rockMat=moss=>floating?(moss?'floatMossRock':'floatRock'):(moss?'mossRock':'rock');
  if(/^(Animated water|Medium Waterfall)$/.test(name)){
   waterProps.push(p);
  }else if(/Rock/.test(name)&&kit&&sh>Math.max(sx,sy)*1.8){
   const r1=stableHash(p.id),wid=Math.max(sx,sy)*.9,count=Math.min(4,Math.max(2,Math.round(sh/(wid*1.1)))),piece=sh/count*1.3;
   for(let i=0;i<count;i++){const model=['rock1','rock2','rock3'][(r1>>>(i*3))%3],k=kitSize(model),w=wid*(1-i*.12);for(const {g} of kitParts(model))add(g,rockMat(/Moss/.test(name)),[((r1>>>(i+5))%5-2)*.04,i*sh/count-piece*.12,((r1>>>(i+9))%5-2)*.04],[w/k.x,piece/k.y,w/k.z],[0,((r1>>>(i*4))%628)/100,0]);}
  }else if(/Rock|Rubble/.test(name)){
   // Sculpted kit rocks (small ones as pebbles), sunk a little into what they stand on; moss on top where named so.
   const small=/^(Rubble|Rocks)$/.test(name),model=pick(small?['pebble1','pebble2','pebble3','pebble4']:['rock1','rock2','rock3']),k=kitSize(model);
   const rh=stableHash(p.id),tone=['#ffffff','#ece4d4','#d8ddd4','#f4ebdd','#cfd5cf','#e3d9c8'][rh%6];
   if(!k||!kitPut(model,[sx/k.x,sh/k.y*1.1,sy/k.z],{up:floating?0:-sh*.1,mat:rockMat(/Moss/.test(name)||(rh>>>5)%3===0),color:tone})){
    add('crag'+(stableHash(p.blockId||p.id)%4),'rock',[0,sh*.50,0],[sx*.50,sh*.50,sy*.50]);
    if(/Moss/.test(name))add('leaf','island',[0,sh*.85,0],[sx*.45,Math.max(.025,sh*.09),sy*.45],[0,.2,0]);}
  }else if(/Stalagmite/.test(name)){
   const r1=stableHash(p.id),model=['rock1','rock2','rock3'][r1%3],k=kitSize(model),thin=.55+(r1>>>4)%6*.1,tall=Math.min(sh,1.6+(r1>>>12)%5*.18)*(.7+(r1>>>8)%4*.1),lean=[((r1>>>16)%9-4)*.035,((r1>>>20)%9-4)*.035],parts=kit?kitParts(model):null;
   if(parts){for(const {g} of parts)add(g,'rock',[0,-tall*.08,0],[sx/k.x*thin,tall/k.y,sy/k.z*thin],[lean[0],(r1%628)/100,lean[1]]);if((r1>>>24)%3===0)add(g0(model),'rock',[0,tall*.86,0],[sx/k.x*thin*.7,tall*.2/k.y,sy/k.z*thin*.7],[.5,(r1%300)/100,.3]);}
   else add('cone','rock',[0,sh*.5,0],[sx*.52,sh,sy*.52],[.03,.2,-.04]);
  }else if(/Fey Crystal|Crystal Geode/.test(name)){
   // A cluster of faceted shards that glow, with a halo and a pool of their light on what is round them.
   const r0=stableHash(p.id),tone=[['crystalCyan','#62d4ff'],['crystalViolet','#a985ff'],['crystalPink','#ff7fd2'],['crystalAmber','#ffb24d']][(r0>>>3)%4],mat=tone[0],n=sh>1.2?6:4;
   for(let i=0;i<n;i++){const a=i/n*TAU+(r0%7),lean=i?.28+((r0>>>i)%5)*.06:.05,hgt=sh*1.25*(i?.42+((r0>>>(i+3))%4)*.09:1),wid=Math.max(.08,Math.min(sx,sy))*(i?.32:.5);
    add('crystalShard',mat,[i?Math.cos(a)*wid*.9:0,-.04,i?Math.sin(a)*wid*.9:0],[wid,hgt,wid],[Math.sin(a)*lean,a,Math.cos(a)*lean]);}
   glow(sh*.6,Math.max(1,sh*1.1),tone[1],Math.max(1.2,sh*2));glows[glows.length-1].mote=true;
  }else if(/^(Moss|Ground Ivy)$/.test(name)){
   if(name==='Moss'&&kit){const r0=stableHash(p.id),n=2+r0%3;for(let i=0;i<n;i++){const model=(r0>>>i)%2?'clover1':'clover2',k=kitSize(model),a=i*2.4+r0%7,rr=Math.min(sx,sy)*.28*(i?1:0),sc=Math.min(sx,sy)*(.32+((r0>>>(i+4))%4)*.06)/Math.max(k.x,k.z);
     for(const {g,m} of kitParts(model))add(g,m,[Math.cos(a)*rr,0,Math.sin(a)*rr],[sc,sc*.7,sc],[0,a,0],(r0>>>i)%3?'#a9bf86':'#97ad74');}}
   else if(name==='Moss'){const r0=stableHash(p.id),k=.62+(r0%7)*.04;add('mossPatch','mossDecal',[0,Math.min(sh,.04)+.012,0],[sx*k,1,sy*k],[0,(r0%360)*Math.PI/180,0],r0%3?'#e8f2c4':'#c9dc98');}
   else cover.push({kind:'ivy',x,y,base:z,width:sx,depth:sy,height:sh,level,id:p.id});
  }else if(/Overgrown Vines|Overgrown Roots/.test(name)){
   hangingProps.push(p);
  }else if(/^Rope$/.test(name)){
   for(let i=0;i<3;i++){const a=(i-1)*sx*.22;add('cylinder',/Rope/.test(name)?'wood':'leaf',[a,sh*.5,(i%2)*sy*.16],[Math.max(.02,sx*.024),sh,Math.max(.02,sy*.03)],[0,0,(i-1)*.12]);if(!/Rope/.test(name))for(let k=0;k<2;k++)add('leaf','leaf',[a,sh*(.25+k*.45),0],[sx*.16,.10,sy*.20],[0,i,0]);}
  }else if(/Fey Flower|^Grass$/.test(name)&&kit){
   if(/Flower/.test(name))cover.push({kind:'flowers',x,y,base:z,width:Math.max(.3,sx),depth:Math.max(.3,sy),height:sh,level,id:p.id});
   else{const model=pick(['grassWispyShort','grassWispyTall']),k=kitSize(model);kitPut(model,[sx/k.x*1.7,sh/k.y,sy/k.z*1.7],{color:'#cfe3a0'});}
  }else if(/Fey Flower|^Grass$/.test(name)){
   for(let i=0;i<3;i++){const a=i*TAU/3;add('leaf',/Flower/.test(name)?'flower':'leaf',[Math.cos(a)*sx*.17,sh*.5,Math.sin(a)*sy*.17],[sx*.24,sh*.5,sy*.24],[0,a,.3]);}
  }else if(/Orange Tree|Lemon Tree/.test(name)&&kit){
   // A kit tree at the placement's height, hung with glowing fruit round its crown.
   const model=pick(['tree1','tree2','tree3','tree4','tree5']),k=kitSize(model),s=sh/k.y,lemon=/Lemon/.test(name),r0=stableHash(p.id);
   for(const {g,m} of kitParts(model))if(m==='treeBark')add(g,m,[0,0,0],[s,s,s]);
   for(let i=0;i<5;i++){const a=i*TAU/5+(r0%9)*.3,len=.35+((r0>>>(i+2))%4)*.08;add('cylinder','treeBark',[Math.cos(a)*len*.45,.03,Math.sin(a)*len*.45],[.05,len,.05],[0,-a,Math.PI/2-.22]);}
   if(r0%3===0){const a=(r0%628)/100,bx=Math.cos(a)*.75,bz=Math.sin(a)*.75;add('cylinder','wood',[bx,.1,bz],[.17,.2,.17]);add('torus','darkWood',[bx,.2,bz],[.17,.17,.6],[Math.PI/2,0,0]);
    for(let i=0;i<6;i++){const fa=i*1.05;add('sphere','fruit',[bx+Math.cos(fa)*.08,.22+(i%2)*.03,bz+Math.sin(fa)*.08],[.04,.04,.04],[0,0,0],lemon?'#ffe24d':'#ff9a2e');}}
   if(r0%4===1){const a=(r0%628)/100+2.2,lx=Math.cos(a)*.95,lz=Math.sin(a)*.95,along=a+Math.PI/2;
    for(const side of [-1,1])add('box','wood',[lx+Math.cos(a)*side*.14,.04,lz+Math.sin(a)*side*.14],[1.4,.05,.05],[0,-along,0]);
    for(let i=0;i<6;i++){const t=(i-2.5)*.22;add('box','wood',[lx+Math.cos(along)*t,.05,lz+Math.sin(along)*t],[.03,.035,.3],[0,-along,0]);}}
   for(let i=0;i<4;i++){const hh=stableHash(p.id+':under:'+i),a=(hh%628)/100,rr=.4+((hh>>>8)%100)/100*k.x*s*.45;
    if(i<3)add('sphere','fruit',[Math.cos(a)*rr,.03,Math.sin(a)*rr],[.028,.026,.028],[0,0,0],lemon?'#e7cc45':'#e88a2a');
    else{const pk=kitParts('pebble2'),pz=kitSize('pebble2'),sc=.14/Math.max(pz.x,pz.z);for(const {g} of pk)add(g,'rock',[Math.cos(a)*rr,-.02,Math.sin(a)*rr],[sc,sc,sc],[0,a,0]);}}
   {const crownR=k.x*s*.6,crownY=sh*.68,crownH=sh*.24,tint=[[.2,.3,.84],[.16,.35,.8],[.25,.3,.86],[.13,.4,.78]][r0%4];
    for(let i=0;i<18;i++){const hh=stableHash(p.id+':leaf:'+i),a=i*2.39996+(hh%100)/50,rad=crownR*(.25+((hh>>>7)%100)/100*.75),up=crownY+(((hh>>>14)%100)/100-.45)*crownH*(1.2-rad/crownR*.5),size=crownR*(.55+((hh>>>21)%100)/100*.45);
     add('leafClump','leafCards',[Math.cos(a)*rad,up,Math.sin(a)*rad],[size,size*.9,size],[((hh>>>3)%9-4)*.08,a,((hh>>>5)%9-4)*.08],new THREE.Color().setHSL(tint[0]+((hh>>>9)%10)/250,tint[1],tint[2]+((hh>>>11)%10)/100).getStyle());}}
   for(let i=0;i<20;i++){const a=i*2.39996+(r0%11),up=.5+((r0>>>(i%13))%7)/14,rad=k.x*s*.36*Math.sqrt(1-((up-.72)/.32)**2*.5);
    add('sphere','fruit',[Math.cos(a)*rad,sh*up,Math.sin(a)*rad],[.028,.032,.028],[0,0,0],lemon?'#ffe24d':'#ff9a2e');}
  }else if(/Orange Tree|Lemon Tree/.test(name)){
   add('cylinder','darkWood',[0,sh*.38,0],[sx*.06,sh*.76,sy*.06]);for(let i=0;i<5;i++){const a=i*TAU/5;add('rock','leaf',[Math.cos(a)*sx*.16,sh*.73,Math.sin(a)*sy*.16],[sx*.35,sh*.27,sy*.35],[0,a,0],'#b5c696');add('sphere','glow',[Math.cos(a)*sx*.36,sh*(.62+(i%2)*.2),Math.sin(a)*sy*.36],[.09,.09,.09]);}
  }else if(/Magic Circle/.test(name)){
   add('runeRing','runes',[0,.03,0],[Math.min(sx,sy)*.48,1,Math.min(sx,sy)*.48],[0,(stableHash(p.id)%628)/100,0]);add('curb','stoneCurb',[0,.0,0],[Math.min(sx,sy)*.5,1,Math.min(sx,sy)*.5]);
  }else if(/Easel/.test(name)){
   for(const side of [-1,1])add('box','wood',[side*sx*.28,sh*.45,0],[.055,sh*.9,.055],[0,0,-side*.12]);add('box','wood',[0,sh*.4,sy*.3],[.05,sh*.8,.05],[.2,0,0]);box('wood',sh*.4,sx,.07,.08);if(/canvas/.test(name))box('cloth',sh*.68,sx*.85,sh*.44,.06);
  }else if(/^Canvas$|Bedroll|Backpack/.test(name)){
   box('cloth',sh*.35,sx,sh*.7,sy);if(/Backpack/.test(name))box('wood',sh*.7,sx*.6,sh*.4,sy*.8);
  }else if(/^Crate$/.test(name)){
   box('wood',sh*.5);for(const side of [-1,1])box('darkWood',sh*.5,.07,sh,sy*1.02,[side*sx*.36,0]);
  }else if(/^Barrel$/.test(name)){
   add('cylinder','wood',[0,sh*.5,0],[sx*.49,sh,sy*.49]);for(const up of [.15,.85])add('torus','metal',[0,sh*up,0],[sx*.49,sy*.49,.8],[Math.PI/2,0,0]);
  }else if(/Clump of Snow/.test(name)){
   add('sphere','snow',[0,sh*.3,0],[sx*.56,sh*.4,sy*.56]);
  }else if(/Evergreen Tree/.test(name)){
   add('cylinder','darkWood',[0,sh*.43,0],[sx*.06,sh*.86,sy*.06]);
   for(let i=0;i<4;i++)add('cone','leaf',[0,sh*(.38+i*.15),0],[sx*(.52-i*.10),sh*.43,sy*(.52-i*.10)],[0,i*.6,0],i%2?'#a6b4a0':'#cad4bc');
  }else if(/Oak Tree|Maple Tree|Bush/.test(name)){
   const tree=/Tree/.test(name);if(tree)add('cylinder','darkWood',[0,sh*.37,0],[sx*.055,sh*.74,sy*.055]);
   for(let i=0;i<5;i++){const a=i*TAU/5;add('rock','leaf',[Math.cos(a)*sx*.20,sh*(tree?.70:.47)+(i%2)*sh*.09,Math.sin(a)*sy*.20],[sx*.36,sh*(tree?.27:.42),sy*.36],[0,a,0],/Maple/.test(name)?'#c49b61':i%2?'#bfce91':'#8cad75');}
  }else if(/Dead Tree/.test(name)){
   add('cylinder','darkWood',[0,sh*.5,0],[sx*.065,sh,sy*.065]);for(let i=0;i<3;i++)add('cylinder','darkWood',[(i-1)*sx*.2,sh*.65,0],[sx*.035,sh*.5,sy*.035],[0,0,(i-1)*.8]);
  }else if(/Fern/.test(name)&&kit){
   const k=kitSize('fern'),s=Math.min(sx/k.x,sh/k.y);kitPut('fern',[s,s,s],{color:'#c5dc94'});
  }else if(/Fern/.test(name)){
   for(let i=0;i<7;i++){const a=i*TAU/7;add('leaf','leaf',[Math.cos(a)*sx*.2,sh*.4,Math.sin(a)*sy*.2],[sx*.15,sh*.32,sy*.39],[.3,a,0],'#b5d078');}
  }else if(/Mooring Fence/.test(name)){
   const fh=Math.min(sh,.85);for(const side of [-1,1])add('cylinder','darkWood',[side*sx*.43,fh*.5,0],[.07,fh,.07]);
   box('brass',fh*.8,sx,.04,.04);box('darkWood',fh*.4,sx,.045,.045);
  }else if(/Column|Pillar/.test(name)){
   box('darkWood',sh/2);for(const up of [.1,sh*.8])box('metal',up,sx*1.12,.07,sy*1.12);
  }else if(/Support Beam/.test(name)){
   box('darkWood',sh/2,sx,Math.min(sh,.15),sy);
  }else if(/Carved Screen/.test(name)){
   for(const side of [-1,1])box('darkWood',sh/2,.05,sh,sy,[side*sx*.47,0]);
   for(let i=0;i<8;i++)box('wood',sh/2,.025,sh*.94,sy*.3,[-sx*.4+i*sx*.115,0]);box('brass',sh*.95,sx,.05,sy);
  }else if(/Sofa|Bench/.test(name)){
   box('wood',sh*.48,sx,sh*.26,sy);for(const a of [-1,1])for(const b of [-1,1])box('darkWood',sh*.2,.055,sh*.4,.055,[a*sx*.38,b*sy*.34]);
   box(/Sofa/.test(name)?'red':'cloth',sh*.69,sx*.93,sh*.19,sy*.95);if(/Sofa/.test(name))box('red',sh*.82,sx,sh*.36,sy*.16,[0,sy*.42]);
  }else if(/Carpet/.test(name)){
   if(/Round/.test(name)){add('cylinder','red',[0,.025,0],[sx*.5,.025,sy*.5]);add('torus','brass',[0,.043,0],[sx*.44,sx*.44,1],[Math.PI/2,0,0]);}
   else{box('brass',.025,sx,.025,sy);box('red',.04,sx*.91,.028,sy*.85);}
  }else if(/Bookcase|Bookshelf|Storage Shelf/.test(name)){
   box('darkWood',sh/2,sx*.96,sh,sy*.18,[0,sy*.41]);for(const a of [-1,1])box('wood',sh/2,sx*.08,sh,sy,[a*sx*.46,0]);
   for(let j=0;j<3;j++){box('wood',sh*(.08+j*.39),sx,.035,sy);for(let i=0;i<5;i++)box(i%3?'book':'red',sh*(.22+j*.3),sx*.12,sh*.23,sy*.73,[-sx*.35+i*sx*.175,0]);}
  }else if(/Chest|Storage cabinet|Counter/.test(name)){
   box('wood',sh*.48);for(const a of [-1,1])box('metal',sh*.51,sx*.055,sh*1.02,sy*1.02,[a*sx*.34,0]);box('brass',sh*.55,.055,.065,.035,[0,-sy*.51]);
  }else if(/Stool|Table|Desk|Workbench|Work[Bb]ench|Butcherblock/.test(name)){
   if(/Round|Stool/.test(name)){add('cylinder','wood',[0,sh*.9,0],[sx*.5,sh*.18,sy*.5]);add('cylinder','darkWood',[0,sh*.43,0],[sx*.10,sh*.86,sy*.10]);}
   else{box('wood',sh*.93,sx,sh*.14,sy);for(const a of [-1,1])for(const b of [-1,1])box('darkWood',sh*.45,.055,sh*.9,.055,[a*sx*.39,b*sy*.37]);}
  }else if(/Boiler|Cauldron|Brazier|Lava_Font/.test(name)){
   const metal=/Lava/.test(name)?'stone':'metal';add('cylinder',metal,[0,sh*.42,0],[sx*.47,sh*.84,sy*.47]);add('torus','brass',[0,sh*.83,0],[sx*.48,sy*.48,1],[Math.PI/2,0,0]);
   add('cylinder',/Cauldron with Food/.test(name)?'leaf':'glow',[0,sh*.84,0],[sx*.40,.015,sy*.40]);
  }else if(/Pipe/.test(name)){
   if(/Horizontal/.test(name))add('cylinder','metal',[0,sh*.5,0],[sy*.4,sx,sy*.4],[0,0,Math.PI/2]);
   else if(/Valve/.test(name))add('torus','brass',[0,sh/2,0],[sx*.5,sh*.5,sy],[0,0,0]);
   else add('cylinder','metal',[0,sh*.5,0],[sx*.3,sh,sy*.3]);
  }else if(/Stove|oven/.test(name)){
   box('stone',sh*.5);box('darkWood',sh*.34,sx*.6,sh*.42,.025,[0,-sy*.51]);box('glow',sh*.34,sx*.4,sh*.23,.03,[0,-sy*.53]);
  }else if(/Lantern|Candles/.test(name)){
   // A small stone hanging in the air where the lantern was, glowing amber; its light falls on what is under it.
   const r0=stableHash(p.id),model=['pebble1','pebble2','pebble3'][r0%3],k=kitSize(model),sz=.15+(r0%4)*.025,lift=p.intentionalFloat?.15:.7,under=supportUnder(x,y,z,.3);
   if(k)for(const {g} of kitParts(model))add(g,'runeStone',[0,lift,0],[sz/k.x,sz*.85/k.y,sz/k.z],[(r0%9)/10,(r0%628)/100,(r0%7)/10]);
   glows.push({x,y,base:z+lift,height:sz*.4,radius:1.2,color:'#ffae52',size:.75,level,poolBase:z+lift-under<3.5?under:null});
  }else if(/Coat rack/.test(name)){
   add('cylinder','darkWood',[0,sh*.5,0],[.025,sh,.025]);for(let i=0;i<3;i++)box('wood',sh*(.5+i*.15),sx,.025,.025);
  }else if(/Planter/.test(name)){
   add('cylinder','red',[0,sh*.27,0],[sx*.42,sh*.54,sy*.42]);add('rock','leaf',[0,sh*.68,0],[sx*.62,sh*.40,sy*.62]);
  }else if(/Wash Stand/.test(name)){
   box('wood',sh*.4,sx,sh*.8,sy);add('sphere','cloth',[0,sh*.9,0],[sx*.49,sh*.14,sy*.46]);
  }else if(/Lava Egg/.test(name)){
   add('rock','glow',[0,sh*.5,0],[sx*.5,sh*.5,sy*.5]);
  }else if(/Towel|Books|Scroll|Potion Vials Stand/.test(name)){
   box(/Books/.test(name)?'book':/Potion/.test(name)?'blue':'cloth',sh*.5);
  }else if(/Bucket|Teapot|Tea Cup|Potion|Bowl|Plate|Mug|Burlap Sack|Bread/.test(name)){
   add('sphere',/Potion/.test(name)?'blue':/Bread|Sack/.test(name)?'wood':'cloth',[0,sh*.5,0],[sx*.5,sh*.5,sy*.5]);
  }else{
   propReport.unsupported[name]=(propReport.unsupported[name]||0)+1;box('rock',sh*.5);
  }
 }
 // Island rims: kit grass tufts along each floating plate's edge.
 for(const f of islandFringe){const model=f.h%3?'grassShort':'grassWispyShort',parts=kitParts(model),k=kit?.size(model);if(!parts)break;const sc=(.2+(f.h%5)*.045)/k.y;
  for(const {g,m} of parts)batch(g,m,[f.x,f.z-.02,f.y],[sc*1.8,sc,sc*1.8],[0,(f.h%628)/100,0],f.level,'prop',f.h%2?'#c4dc8e':'#a9c878');}
 if(kit&&d.props?.length){const sizes={grassShort:kit.size('grassShort'),grassWispyShort:kit.size('grassWispyShort'),pebble2:kit.size('pebble2'),pebble3:kit.size('pebble3')};let scattered=0;
  for(let gy=.8;gy<depth-.5;gy+=1.5)for(let gx=.8;gx<w-.5;gx+=1.5){const hh=stableHash('scatter:'+gx+':'+gy),x=gx+(hh%100)/100*1.2-.6,y=gy+((hh>>>8)%100)/100*1.2-.6,z=heightAt(x,y);
   if(z<-6||Math.abs(heightAt(x+.35,y)-heightAt(x-.35,y))+Math.abs(heightAt(x,y+.35)-heightAt(x,y-.35))>.3)continue;
   if((hh>>>16)%100===99&&kit){for(let c=0;c<4;c++){const pm=['pebble1','pebble2','pebble3'][c%3],pk=kit.size(pm),sc=(.34-c*.07)/Math.max(pk.x,pk.z);for(const {g} of kitParts(pm))batch(g,'rock',[x,z+c*.13,y],[sc,sc*.9,sc],[0,c*1.3,0],0,'prop');}scattered++;continue;}
   const roll=(hh>>>16)%100,model=roll<40?(roll%2?'grassShort':'grassWispyShort'):roll<52?(roll%2?'pebble2':'pebble3'):null;if(!model)continue;
   const k=sizes[model],grass=/grass/.test(model),sc=(grass?.22+(hh>>>24)%5*.05:.12+(hh>>>24)%5*.05)/(grass?k.y:Math.max(k.x,k.z));
   for(const {g,m} of kitParts(model))batch(g,grass?m:'rock',[x,z-(grass?.02:.03),y],[sc*(grass?1.6:1),sc,sc*(grass?1.6:1)],[0,(hh%628)/100,0],0,'prop',grass?(hh%3?'#c4dc8e':'#b3cc7e'):null);scattered++;}
  // The crater's lip: where flat ground meets a cliff, broken rock sunk into the edge with grass lapping over it.
  const slopeAt=(x,y)=>Math.abs(heightAt(x+.3,y)-heightAt(x-.3,y))+Math.abs(heightAt(x,y+.3)-heightAt(x,y-.3));let lip=0;
  for(let gy=.5;gy<depth-.3;gy+=.6)for(let gx=.5;gx<w-.3;gx+=.6){const hh=stableHash('lip:'+gx+':'+gy),x=gx+(hh%60)/100-.3,y=gy+((hh>>>8)%60)/100-.3;
   if(slopeAt(x,y)>.25)continue;let steep=0;for(let a=0;a<8;a++)steep=Math.max(steep,slopeAt(x+Math.cos(a/8*TAU)*.7,y+Math.sin(a/8*TAU)*.7));if(steep<.9)continue;
   const z=heightAt(x,y),roll=(hh>>>16)%100;
   if(roll<55){const model=['rock1','rock2','rock3'][roll%3],k=kit.size(model),sc=(.35+(hh>>>24)%6*.09)/Math.max(k.x,k.z);for(const {g} of kitParts(model))batch(g,'mossRock',[x,z-sc*k.y*.45,y],[sc,sc*(.6+(hh>>>4)%4*.12),sc],[((hh>>>6)%7-3)*.08,(hh%628)/100,((hh>>>9)%7-3)*.08],0,'prop');}
   const tuft=roll%2?'grassWispyShort':'grassShort',kt=kit.size(tuft),st=(.24+(hh>>>12)%4*.05)/kt.y;for(const {g,m} of kitParts(tuft))batch(g,m,[x+.12,z-.02,y-.1],[st*1.7,st,st*1.7],[0,(hh>>>3)%628/100,0],0,'prop','#b9d484');lip++;}
  let outcrops=0;for(const [a,b,nx,nz] of [[[0,0],[w,0],0,-1],[[w,0],[w,depth],1,0],[[w,depth],[0,depth],0,1],[[0,depth],[0,0],-1,0]]){const len=Math.hypot(b[0]-a[0],b[1]-a[1]);
   for(let t=1.2;t<len-1;t+=1.6+((stableHash('edge:'+t+nx+nz)>>>4)%10)/10){const hh=stableHash('edge:'+t+':'+nx+':'+nz);if(hh%3===0)continue;const ex=a[0]+(b[0]-a[0])*t/len,ez=a[1]+(b[1]-a[1])*t/len,x=ex+nx*.25,y=ez+nz*.25,z=heightAt(ex-nx*.3,ez-nz*.3);
    for(let j=0;j<1+hh%2;j++){const model=['rock1','rock2','rock3'][(hh>>>j)%3],k=kit.size(model),wid=.7+((hh>>>(j+5))%6)*.22,hgt=Math.min(.55,wid*.45);
     for(const {g} of kitParts(model))batch(g,'mossRock',[x+(j?.5:0)*nz,z-hgt*.35,y+(j?.5:0)*nx],[wid/k.x,hgt/k.y,wid*.8/k.z],[0,(hh%628)/100+j,0],0,'prop');outcrops++;}}}
  // Great crags bulging from the board's sides, from just under the rim down past its foot, so the board reads as a
  // torn-off piece of land and not a box. They stay at least 0.8 below the rim, clear of every square.
  materials.crag??=photographic&&cliffSet?surfaceMaterial(cliffSet,{color:'#ffffff',scale:.22,normalStrength:.55,tint:{color:'#8d887c',amount:.7}}):materials.rock;let crags=0;
  for(const [a,b,nx,nz] of [[[0,0],[w,0],0,-1],[[w,0],[w,depth],1,0],[[w,depth],[0,depth],0,1],[[0,depth],[0,0],-1,0]]){const len=Math.hypot(b[0]-a[0],b[1]-a[1]);
   for(let t=1;t<len;t+=2.2+((stableHash('crag-step:'+t+nx+nz)>>>3)%10)/8){const hh=stableHash('crag:'+t+':'+nx+':'+nz),ex=a[0]+(b[0]-a[0])*t/len,ez=a[1]+(b[1]-a[1])*t/len,rim=heightAt(ex-nx*.2,ez-nz*.2);
    for(let j=0;j<2;j++){const model=['rock1','rock2','rock3'][(hh>>>(j*2))%3],k=kit.size(model),size=2.4+((hh>>>(j*3+4))%8)*.5,hgt=size*(.8+((hh>>>(j+9))%5)*.15),top=j?rim-6-((hh>>>12)%6):rim-.8;
     const y=top-hgt,out=size*.18+((hh>>>(j+14))%5)*.12;for(const {g} of kitParts(model))batch(g,'crag',[ex+nx*out,y,ez+nz*out],[size/k.x,hgt/k.y,size*.85/k.z],[((hh>>>j)%7-3)*.06,(hh%628)/100+j,((hh>>>(j+3))%7-3)*.06],0,'prop');crags++;}}}
  propReport.scattered=scattered;propReport.lip=lip;propReport.outcrops=outcrops;propReport.crags=crags;}
 hangingProps.push(...islandMoss);
 for(const c of islandChunks){const model=['rock1','rock2','rock3'][c.h%3],parts=kitParts(model),k=kit?.size(model);if(!parts)break;const sc=c.size/Math.max(k.x,k.y,k.z);
  for(const {g} of parts)batch(g,'islandChunk',[c.x,c.z,c.y],[sc,sc*1.2,sc],[(c.h%30)/10,(c.h%628)/100,(c.h%20)/10],c.level,'island-rock');}
 // Hanging ivy and roots (vine-art.mjs); vine placements on a vine ramp are drawn by the ramp's vine.
 const rampNear=p=>vineRamps.some(r=>p.x>=r.left-1&&p.x<=r.right+1&&p.y>=r.top-1&&p.y<=r.bottom+1&&p.base<=r.height+1&&p.base+p.size.height>=r.base-1);
 // What holds a hanging thing's top: an island body or floor plate at or just above it, or a cliff or rock face beside it.
 const attached=p=>{if(String(p.id).includes(':moss:')||String(p.id).includes(':root:'))return true;const top=p.base+p.size.height;
  if(inIslandBody(p.x,p.y,top-.3)||floorPlates.some(r=>r.height>=top-.6&&r.height<=top+2&&[[0,0],[.8,0],[-.8,0],[0,.8],[0,-.8]].some(([dx,dy])=>contained(p.x+dx,p.y+dy,r))))return true;
  for(let a=0;a<8;a++)if(heightAt(p.x+Math.cos(a/8*TAU)*1.1,p.y+Math.sin(a/8*TAU)*1.1)>=top-.6)return true;
  return restsOnRock({...p,size:{...p.size,width:Math.max(1.2,p.size.width),depth:Math.max(1.2,p.size.depth)}},top+.05);};
 const hanging=buildHanging(hangingProps,{levelOf:p=>p.level??0,rampNear,attached,barkMaterial:materials.vineBark,rootMaterial:materials.rootBark,leafMaterial:materials.vineLeaf});
 for(const mesh of hanging.meshes){root.add(mesh);props.push(mesh);}
 for(const p of hanging.report.lying||[])cover.push({kind:'ivy',x:p.x,y:p.y,base:p.base,width:Math.max(.5,p.size.width),depth:Math.max(.5,p.size.depth),height:.12,level:p.level??0,id:p.id});hanging.report.lying=(hanging.report.lying||[]).length;
 for(const mesh of buildGroundCover(cover,{leafMaterial:materials.vineLeaf,flowerMaterial:materials.vineFlower}).meshes){root.add(mesh);props.push(mesh);}propReport.hanging=hanging.report;propReport.vines=vines.report;
 // Merge native water footprints so overlapping Workshop tiles cannot z-fight.
 // Ordinary streams follow the chosen canonical flat-floor conversion. Authored
 // pool basins have a single horizontal water plane, clipped by depth testing.
 if(waterProps.length){
  const pools=d.water?.pools||[],cells=new Set(),cell=.25,positions=[],ellipses=[];
  for(const p of waterProps.filter(p=>p.name==='Animated water')){
   const rx=p.size.width*.46,ry=p.size.depth*.46,r=(p.rotation||0)*Math.PI/180;
   ellipses.push({x:p.x,y:p.y,rx,ry,cos:Math.cos(r),sin:Math.sin(r)});
  }
  for(const p of pools)ellipses.push({x:p.x,y:p.y,rx:p.radius,ry:p.radius,cos:1,sin:0});
  // Candidate cells retain the same native ellipse union, with a one-cell border.
  // Clip triangles against its continuous signed field rather than emitting whole
  // cells, so the final shore does not inherit quarter-square stair steps.
  for(const p of ellipses){const radius=Math.max(p.rx,p.ry);for(let y=Math.floor((p.y-radius)/cell)-1;y<=Math.ceil((p.y+radius)/cell)+1;y++)for(let x=Math.floor((p.x-radius)/cell)-1;x<=Math.ceil((p.x+radius)/cell)+1;x++)cells.add(`${x},${y}`);}
  const fieldCache=new Map(),signedAt=(ix,iy)=>{const key=`${ix},${iy}`;if(fieldCache.has(key))return fieldCache.get(key);const x=ix*cell,y=iy*cell;let value=-Infinity;for(const p of ellipses){const dx=x-p.x,dy=y-p.y,u=dx*p.cos+dy*p.sin,v=-dx*p.sin+dy*p.cos;value=Math.max(value,1-u*u/(p.rx*p.rx)-v*v/(p.ry*p.ry));}const vertex={x,y,value};fieldCache.set(key,vertex);return vertex;};
  const zAt=(x,y)=>{const pool=pools.find(p=>Math.hypot(x-p.x,y-p.y)<=p.radius);return pool?pool.height:heightAt(x,y)+.035;};
  const shores=[];
  const emitClipped=triangle=>{const clipped=[];for(let i=0;i<3;i++){const a=triangle[i],b=triangle[(i+1)%3],insideA=a.value>=0,insideB=b.value>=0;if(insideA)clipped.push(a);if(insideA!==insideB){const t=a.value/(a.value-b.value);clipped.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});}}for(let i=1;i<clipped.length-1;i++)for(const p of [clipped[0],clipped[i],clipped[i+1]]){positions.push(p.x,zAt(p.x,p.y),p.y);shores.push(Math.max(0,Math.min(1,1-(p.value??0)*5)));}};
  // No water in the funnel: the vortex is drawn there instead.
  const vortexHere=d.props.some(p=>p.name==='Green Swirling Mist');
  const deepPts=[];if(vortexHere)for(let i=0;i<h.length;i+=3)if(h[i]<-7)deepPts.push([i%n/(n-1)*w,Math.floor(i/n)/(m-1)*depth]);
  const vcx=deepPts.length?(Math.min(...deepPts.map(p=>p[0]))+Math.max(...deepPts.map(p=>p[0])))/2:0,vcy=deepPts.length?(Math.min(...deepPts.map(p=>p[1]))+Math.max(...deepPts.map(p=>p[1])))/2:0,vr=deepPts.length?Math.min(Math.max(...deepPts.map(p=>p[0]))-Math.min(...deepPts.map(p=>p[0])),Math.max(...deepPts.map(p=>p[1]))-Math.min(...deepPts.map(p=>p[1])))*.49:0;
  for(const key of cells){const [ix,iy]=key.split(',').map(Number),x=ix*cell,y=iy*cell;if(x<0||y<0||x+cell>w||y+cell>depth)continue;if(vortexHere&&(heightAt(x+cell/2,y+cell/2)<-6.6||Math.hypot(x+cell/2-vcx,y+cell/2-vcy)<vr*1.12))continue;const a=signedAt(ix,iy),b=signedAt(ix+1,iy),c=signedAt(ix+1,iy+1),q=signedAt(ix,iy+1);emitClipped([a,c,b]);emitClipped([a,q,c]);}
  const waterMat=new THREE.ShaderMaterial({uniforms:waterUniforms,side:THREE.DoubleSide,forceSinglePass:true,transparent:true,depthWrite:true,
   vertexShader:`attribute float shore;varying vec3 vWater;varying float vShore;varying float vSteep;void main(){vWater=position;vShore=shore;vSteep=smoothstep(.35,.8,1.-abs(normal.y));gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
   // Deep blue-green in the middle, clear and lighter towards the edge, a moving foam line along the shore.
   fragmentShader:`uniform float uTime;varying vec3 vWater;varying float vShore;varying float vSteep;float wHash(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}float wNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(wHash(i),wHash(i+vec2(1.,0.)),f.x),mix(wHash(i+vec2(0.,1.)),wHash(i+vec2(1.,1.)),f.x),f.y);}void main(){float n=wNoise(vWater.xz*1.7+vec2(uTime*.13,uTime*.07))*.6+wNoise(vWater.xz*4.3-vec2(uTime*.21,0.))*.4;vec3 c=mix(vec3(.025,.19,.23),vec3(.13,.47,.47),vShore*.75+n*.28);float foam=smoothstep(.62,1.,vShore)*(.55+.45*sin(uTime*1.6+vWater.x*3.1+vWater.z*2.3));c=mix(c,vec3(.86,.95,.93),foam*.7)+pow(n,7.)*.55;float a=mix(.84,.96,1.-vShore);
   // Where the water runs down a slope or a cliff it is a white cascade streaming downward, not a flat pool.
   float u=vWater.x+vWater.z,fl=vWater.y*2.1+uTime*2.7;float s1=.5+.5*sin(u*23.+wNoise(vec2(u*1.9,fl*.45))*5.),s2=.5+.5*sin(u*41.-wNoise(vec2(u*3.1,fl*.8))*3.+fl*.35);
   float streak=smoothstep(.15,1.,s1*.6+s2*.4),pulse=wNoise(vec2(u*1.2,fl*1.1));
   c=mix(c,mix(vec3(.40,.64,.70),vec3(.95,.99,1.),.3+streak*.5+pulse*.2),vSteep);a=mix(a,.34+streak*.34+pulse*.12,vSteep);gl_FragColor=vec4(c,a);
   #include <tonemapping_fragment>
   #include <colorspace_fragment>
   }`});
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('shore',new THREE.Float32BufferAttribute(shores,1));g.computeVertexNormals();const water=new THREE.Mesh(g,waterMat);water.userData={level:0};root.add(water);pickSurfaces.push(water);
  const falls=[],fallsUv=[];
  for(const p of waterProps.filter(p=>p.name==='Medium Waterfall')){
   const pool=[...pools].filter(q=>q.name.includes('fall')).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];if(!pool)continue;
   const dx=pool.x-p.x,dy=pool.y-p.y,len=Math.hypot(dx,dy),px=-dy/len,py=dx/len,half=Math.min(.42,p.size.width*.055),top=heightAt(p.x,p.y)+.08;
   const edge=(t,side)=>{const x=p.x+dx*t+px*half*side,y=p.y+dy*t+py*half*side,z=Math.max(top*(1-t)+pool.height*t,heightAt(x,y)+.06);return [x,z,y];};
   for(let i=0;i<24;i++){const a=edge(i/24,-1),b=edge(i/24,1),c=edge((i+1)/24,1),q=edge((i+1)/24,-1);falls.push(...a,...c,...b,...a,...q,...c);fallsUv.push(0,i/24,1,(i+1)/24,1,i/24,0,i/24,0,(i+1)/24,1,(i+1)/24);}
   {const foot=edge(1,0);glows.push({x:foot[0],y:foot[2],base:pool.height,height:.35,radius:1.3,color:'#d9f3ff',size:2.4,level:0});}
  }
  const fg=new THREE.BufferGeometry();fg.setAttribute('position',new THREE.Float32BufferAttribute(falls,3));fg.setAttribute('uv',new THREE.Float32BufferAttribute(fallsUv,2));fg.computeVertexNormals();
  const fallMat=new THREE.ShaderMaterial({uniforms:waterUniforms,side:THREE.DoubleSide,forceSinglePass:true,transparent:true,depthWrite:false,vertexShader:`varying vec2 vFall;void main(){vFall=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`uniform float uTime;varying vec2 vFall;float wHash(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}float wNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(wHash(i),wHash(i+vec2(1.,0.)),f.x),mix(wHash(i+vec2(0.,1.)),wHash(i+vec2(1.,1.)),f.x),f.y);}void main(){float edge=smoothstep(0.,.25,vFall.x)*smoothstep(0.,.25,1.-vFall.x);float fl=vFall.y*9.-uTime*2.6;float s1=.5+.5*sin(vFall.x*38.+wNoise(vec2(vFall.x*4.,fl*.5))*5.),s2=.5+.5*sin(vFall.x*71.-wNoise(vec2(vFall.x*7.,fl))*3.+fl*.3);float n=wNoise(vec2(vFall.x*3.,fl*1.2));float streak=smoothstep(.15,1.,s1*.6+s2*.4);float foam=smoothstep(.72,1.,vFall.y)*.8+smoothstep(.12,0.,vFall.y)*.35;vec3 c=mix(vec3(.42,.66,.72),vec3(.95,.99,1.),clamp(.25+streak*.75+foam*.7,0.,1.));float alpha=edge*clamp(.18+streak*.55+foam*.4,0.,.92);gl_FragColor=vec4(c,alpha);
   #include <tonemapping_fragment>
   #include <colorspace_fragment>
  }`});const fmesh=new THREE.Mesh(fg,fallMat);root.add(fmesh);
  propReport.water={nativeWaterPlacements:waterProps.filter(p=>p.name==='Animated water').length,mergedStreamCells:cells.size,shoreline:'interpolated native ellipse union',surfaceTriangles:positions.length/9,authoredPools:pools.length,proceduralWaterfalls:waterProps.filter(p=>p.name==='Medium Waterfall').length};
 }
 // The vortex follows the actual deepest basin, not an invented map placement.
 const deep=[];for(let i=0;i<h.length;i++)if(h[i]<-7)deep.push({x:i%n/(n-1)*w,y:Math.floor(i/n)/(m-1)*depth});
 if(deep.length&&d.props.some(p=>p.name==='Green Swirling Mist')){
  const minX=Math.min(...deep.map(p=>p.x)),maxX=Math.max(...deep.map(p=>p.x)),minY=Math.min(...deep.map(p=>p.y)),maxY=Math.max(...deep.map(p=>p.y)),cx=(minX+maxX)/2,cy=(minY+maxY)/2,radius=Math.min(maxX-minX,maxY-minY)*.49,vertices=[],uv=[];
  // Each ring of the funnel sits just above the highest ground round it and the funnel only ever rises outward, so the
  // basin's ground never shows through and the surface never folds.
  const ringHeight=[];for(let r=0;r<=36;r++){let top=-Infinity;for(let j=0;j<192;j++)for(const dr of [-.5,0,.5]){const a=j/192*TAU,rr=radius*Math.max(0,Math.min(36,r+dr))/36;top=Math.max(top,heightAt(cx+Math.cos(a)*rr,cy+Math.sin(a)*rr)+.15);}ringHeight.push(Math.max(-8.85+2.35*(r/36)**1.7,top,r?ringHeight[r-1]:-Infinity));}
  for(let ring=0;ring<36;ring++)for(let i=0;i<192;i++){
   const point=(r,j)=>{const a=j/192*TAU,rr=radius*r/36;return {p:[cx+Math.cos(a)*rr,ringHeight[r],cy+Math.sin(a)*rr],uv:[Math.cos(a)*r/36,Math.sin(a)*r/36]};};
   const a=point(ring,i),b=point(ring,i+1),c=point(ring+1,i+1),q=point(ring+1,i);for(const v of [a,c,b,a,q,c]){vertices.push(...v.p);uv.push(...v.uv);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  const mat=new THREE.ShaderMaterial({uniforms:waterUniforms,side:THREE.DoubleSide,vertexShader:`varying vec2 vSwirl;void main(){vSwirl=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`uniform float uTime;varying vec2 vSwirl;float vH(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}float vN(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*f*(f*(f*6.-15.)+10.);return mix(mix(vH(i),vH(i+vec2(1.,0.)),f.x),mix(vH(i+vec2(0.,1.)),vH(i+vec2(1.,1.)),f.x),f.y);}void main(){float r=max(length(vSwirl),.001),a=atan(vSwirl.y,vSwirl.x);
   // Log-spiral arms drawn inward and round; noise breaks them into streaks; foam at the lip; light at the eye.
   float sp=a*3.+log(r)*5.5+uTime*1.4,arm=.5+.5*sin(sp+vN(vec2(cos(a),sin(a))*2.2+vec2(r*9.-uTime*.3,0.))*2.4);float n=vN(vec2(cos(a+uTime*.2),sin(a+uTime*.2))*3.+vec2(r*14.-uTime*1.7,1.3));float fine=.5+.5*sin(sp*3.3+n*3.);float streak=clamp(smoothstep(.35,.95,arm)*.75+smoothstep(.55,.95,fine)*.45*smoothstep(.1,.5,r),0.,1.);
   vec3 deep=vec3(.006,.03,.035),mid=vec3(.05,.34,.30),light=vec3(.40,1.,.80);vec3 c=mix(deep,mid,streak*smoothstep(.0,.9,r))+light*streak*(1.-r)*.45;
   float foam=smoothstep(.68,.95,r)*smoothstep(.38,.72,n*.6+fine*.4)*smoothstep(.35,.7,vN(vec2(cos(a),sin(a))*5.+vec2(uTime*.3,r*6.)));c=mix(c,vec3(.90,.99,.97),foam*.85);c+=vec3(.5,1.,.8)*pow(max(0.,1.-r*4.),3.)*1.2;gl_FragColor=vec4(c,1.);
   #include <tonemapping_fragment>
   #include <colorspace_fragment>
  }`});root.add(new THREE.Mesh(g,mat));
  glows.push({x:cx,y:cy,base:-8.6,height:1.2,radius:Math.max(2,radius*.7),color:'#5dffc4',size:Math.max(3,radius*1.2),level:0,poolBase:null});
 }
 commitBatches();
 if(mists.length){const tex=glowTexture(),byLevel=new Map();for(const m of mists){if(!byLevel.has(m.level))byLevel.set(m.level,[]);byLevel.get(m.level).push(m);}
  const mat=new THREE.PointsMaterial({map:tex,size:1,sizeAttenuation:true,vertexColors:true,transparent:true,opacity:.16,depthWrite:false,fog:true});
  mat.onBeforeCompile=shader=>{shader.vertexShader=shader.vertexShader.replace('uniform float size;','uniform float size;attribute float mistSize;').replace('gl_PointSize = size;','gl_PointSize = size*mistSize;').replace('#include <fog_vertex>','#include <fog_vertex>\n vPointFade=clamp((150.-gl_PointSize)/90.,0.,1.);');shader.vertexShader='varying float vPointFade;\n'+shader.vertexShader;shader.fragmentShader='varying float vPointFade;\n'+shader.fragmentShader.replace('vec4 diffuseColor = vec4( diffuse, opacity );','vec4 diffuseColor = vec4( diffuse, opacity*vPointFade );');};
  for(const [level,list] of byLevel){const g=new THREE.BufferGeometry(),c=new THREE.Color();g.setAttribute('position',new THREE.Float32BufferAttribute(list.flatMap(m=>[m.x,m.z,m.y]),3));
   g.setAttribute('color',new THREE.Float32BufferAttribute(list.flatMap(m=>{c.set(m.color);return [c.r,c.g,c.b];}),3));g.setAttribute('mistSize',new THREE.Float32BufferAttribute(list.map(m=>m.size*2.2),1));
   const pts=new THREE.Points(g,mat);pts.userData={level,category:'steam'};pts.renderOrder=2;root.add(pts);props.push(pts);}}
 // Glow of crystals and lanterns: a halo round each and a pool of its colour on what is round it (added light,
 // no real lamps, so it costs two draw calls a level). Hidden with its level above the Height cut.
 if(glows.length){const glowTex=glowTexture(),byLevel=new Map();for(const g of glows){if(!byLevel.has(g.level))byLevel.set(g.level,[]);byLevel.get(g.level).push(g);}
  const poolGeo=new THREE.PlaneGeometry(2,2);poolGeo.rotateX(-Math.PI/2);
  const haloMat=new THREE.PointsMaterial({map:glowTex,size:1,sizeAttenuation:true,vertexColors:true,transparent:true,opacity:.55,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,fog:false});
  const poolMat=new THREE.MeshBasicMaterial({map:glowTex,transparent:true,opacity:.42,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-2});
  haloMat.onBeforeCompile=shader=>{shader.uniforms.uTime=waterUniforms.uTime;shader.vertexShader=shader.vertexShader.replace('uniform float size;','uniform float size;uniform float uTime;attribute float haloSize;').replace('gl_PointSize = size;','gl_PointSize = size*haloSize*(1.+.13*sin(uTime*1.25+position.x*1.7+position.z*2.3));').replace('#include <fog_vertex>','#include <fog_vertex>\n vPointFade=clamp((150.-gl_PointSize)/90.,0.,1.);');shader.vertexShader='varying float vPointFade;\n'+shader.vertexShader;shader.fragmentShader='varying float vPointFade;\n'+shader.fragmentShader.replace('vec4 diffuseColor = vec4( diffuse, opacity );','vec4 diffuseColor = vec4( diffuse, opacity*vPointFade );');};
  for(const [level,list] of byLevel){
   const positions=[],colors=[],sizes=[],c=new THREE.Color();
   for(const g of list){positions.push(g.x,g.base+g.height,g.y);c.set(g.color);colors.push(c.r,c.g,c.b);sizes.push(g.size);}
   const hg=new THREE.BufferGeometry();hg.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));hg.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));hg.setAttribute('haloSize',new THREE.Float32BufferAttribute(sizes,1));
   const halos=new THREE.Points(hg,haloMat);halos.userData={level,category:'glow'};halos.renderOrder=3;root.add(halos);props.push(halos);
   const pools=new THREE.InstancedMesh(poolGeo,poolMat,list.length);list.forEach((g,i)=>{obj.position.set(g.x,(g.poolBase===null?-999:g.poolBase??g.base)+.04,g.y);obj.rotation.set(0,0,0);obj.scale.set(g.radius,1,g.radius);obj.updateMatrix();pools.setMatrixAt(i,obj.matrix);pools.setColorAt(i,c.set(g.color));});
   pools.userData={level,category:'glow'};pools.renderOrder=2;root.add(pools);props.push(pools);
  }
  const crystals=glows.filter(g=>g.mote);if(crystals.length){const moteByLevel=new Map();
   for(const g of crystals){if(!moteByLevel.has(g.level))moteByLevel.set(g.level,{p:[],c:[],s:[]});const m=moteByLevel.get(g.level),c=new THREE.Color(g.color);
    for(let i=0;i<7;i++){const a=i*2.4+g.x,r=.25+(i%3)*.22;m.p.push(g.x+Math.cos(a)*r,g.base+.1,g.y+Math.sin(a)*r);m.c.push(c.r,c.g,c.b);m.s.push(i*1.37+g.x*.7+g.y*.3);}}
   const moteMat=new THREE.ShaderMaterial({uniforms:{uTime:waterUniforms.uTime,map:{value:glowTex}},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:`attribute vec3 color;attribute float seed;uniform float uTime;varying vec3 vColor;varying float vLife;void main(){float life=fract(uTime*.12+seed*.137);vLife=life;vColor=color;
     vec3 p=position+vec3(sin(uTime*.7+seed)*.25,life*2.2,cos(uTime*.55+seed*1.3)*.25);vec4 mv=modelViewMatrix*vec4(p,1.);gl_PointSize=.22*(600./-mv.z);gl_Position=projectionMatrix*mv;}`,
    fragmentShader:`uniform sampler2D map;varying vec3 vColor;varying float vLife;void main(){float a=texture2D(map,gl_PointCoord).a*sin(vLife*3.14159);gl_FragColor=vec4(vColor*1.6,a*.9);}`});
   for(const [level,m] of moteByLevel){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(m.p,3));g.setAttribute('color',new THREE.Float32BufferAttribute(m.c,3));g.setAttribute('seed',new THREE.Float32BufferAttribute(m.s,1));
    const pts=new THREE.Points(g,moteMat);pts.frustumCulled=false;pts.userData={level,category:'glow'};pts.renderOrder=4;root.add(pts);props.push(pts);}}
  propReport.glows=glows.length;}
 // Sparse terrain contour/grid and floor grids, batched into three line calls.
 const grids=[];for(let level=0;level<levelHeights.length;level++){
  const vertices=[],plates=d.walls.roofs.filter(s=>s.kind==='floor'&&Math.abs(s.height-levelHeights[level])<.1);
  for(let y=0;y<depth;y++)for(let x=0;x<w;x++){
   if(level>0&&!plates.some(s=>contained(x+.5,y+.5,s)))continue;
   for(const [a,b] of [[{x,y},{x:x+1,y}],[{x,y},{x,y:y+1}]]){
    const sample=p=>level?levelHeights[level]+.075:(groundTiles.some(f=>Math.abs(f.x-(x+.5))<.01&&Math.abs(f.y-(y+.5))<.01)?.065:heightAt(p.x,p.y)+.025);
    const za=sample(a),zb=sample(b);if(Math.abs(za-zb)>1)continue;vertices.push(a.x,za,a.y,b.x,zb,b.y);
   }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));const lines=new THREE.LineSegments(g,new THREE.LineBasicMaterial({color:level?'#e0cca9':'#d5d4bc',transparent:true,opacity:level?.17:.13,depthWrite:false}));lines.userData.level=level;root.add(lines);grids.push(lines);
 }
 let activeLevel=-1,roofsOn=false,gridOn=true,doorsOpen=false;
 function updateLevels(){
  renderer.shadowMap.needsUpdate=true;
  for(const f of floors)f.visible=(!f.userData.isRoof||roofsOn)&&(activeLevel<0||f.userData.level<=activeLevel);
  for(const p of props)p.visible=(p.userData.category!=='roof'||roofsOn)&&(activeLevel<0||p.userData.level<=activeLevel);
  for(const g of grids)g.visible=gridOn&&(activeLevel<0||g.userData.level<=activeLevel);
  for(const mesh of wallMeshes){const b=mesh.userData;mesh.visible=activeLevel<0||b.level<=activeLevel;if(b.cap)b.cap.visible=mesh.visible;
   b.items.forEach(({wall,a,b:bn,len},i)=>{
    const height=Math.min(wall.height,activeLevel===b.level?.68:activeLevel<0?1.05:wall.height);
    obj.position.set((a.x+bn.x)/2,wall.base+height/2,(a.y+bn.y)/2);obj.rotation.set(0,-Math.atan2(bn.y-a.y,bn.x-a.x),0);obj.scale.set(len+.035,height,b.door?.15:.22);obj.updateMatrix();mesh.setMatrixAt(i,obj.matrix);
    if(b.cap){obj.position.y=wall.base+height+.025;obj.scale.set(len+.07,.075,.28);obj.updateMatrix();b.cap.setMatrixAt(i,obj.matrix);}
   });mesh.instanceMatrix.needsUpdate=true;if(b.cap)b.cap.instanceMatrix.needsUpdate=true;
   if(b.door)mesh.visible=mesh.visible&&!doorsOpen;
  }
  if(tokenRecords.length)updateTokenMatrices();
  for(const name of Object.keys(overlays))paintOverlay(name);
 }
 const tokenCapacity=512,tokenBodies=new THREE.InstancedMesh(new THREE.CylinderGeometry(.23,.30,.65,16),new THREE.MeshStandardMaterial({roughness:.42,metalness:.2}),tokenCapacity);
 const tokenHeads=new THREE.InstancedMesh(new THREE.SphereGeometry(.19,16,10),new THREE.MeshStandardMaterial({roughness:.4,metalness:.16}),tokenCapacity);
 const tokenBases=new THREE.InstancedMesh(new THREE.CylinderGeometry(.42,.44,.10,24),new THREE.MeshStandardMaterial({color:'#162d37',roughness:.35,metalness:.4}),tokenCapacity);
 const tokenRings=new THREE.InstancedMesh(new THREE.TorusGeometry(.36,.045,7,32),new THREE.MeshBasicMaterial({color:'#ffffff'}),tokenCapacity);
 for(const mesh of [tokenBodies,tokenHeads,tokenBases,tokenRings]){mesh.count=0;mesh.castShadow=true;mesh.frustumCulled=false;mesh.boundingSphere=new THREE.Sphere(new THREE.Vector3(w/2,2,depth/2),w+depth);scene.add(mesh);}tokenBodies.userData.token=true;tokenBases.userData.token=true;tokenHeads.userData.token=true;
 let disposed=false; // set by dispose(): art that finishes loading for a board already gone is not added
 let tokenRecords=[],selectedId=null,visibleTokens=[],noBaseIds=new Set(),noBaseKey='';
 function belongsToLevel(p){
  if(Number.isFinite(p.level)&&p.level<10)return p.level;
  if(Number.isFinite(p.ramp)&&d.ramps[p.ramp])return d.ramps[p.ramp].fromLevelIndex??levelAt(d.ramps[p.ramp].base);
  const plate=d.walls.roofs.find(s=>s.kind==='floor'&&Math.abs(s.height-p.z)<.15&&contained(p.x,p.y,s));return plate?(plate.level??levelAt(plate.height)):0;
 }
 function updateTokenMatrices(){
  renderer.shadowMap.needsUpdate=true;
  visibleTokens=tokenRecords.filter(t=>activeLevel<0||belongsToLevel(t)<=activeLevel).slice(0,tokenCapacity);
  visibleTokens.forEach((t,i)=>{
   const color=new THREE.Color(t.color||'#59c8c0');obj.rotation.set(0,0,0);obj.scale.set(t.width||1,1,t.height||1);
   const bare=noBaseIds.has(t.id);
   for(const [mesh,up] of [[tokenBases,.12],[tokenBodies,.48],[tokenHeads,.92]]){obj.position.set(t.x,t.z+up,t.y);obj.scale.set(bare&&mesh===tokenBases?0:t.width||1,bare&&mesh===tokenBases?0:1,bare&&mesh===tokenBases?0:t.height||1);obj.updateMatrix();mesh.setMatrixAt(i,obj.matrix);if(mesh!==tokenBases)mesh.setColorAt(i,color);}
   obj.position.set(t.x,t.z+.19,t.y);obj.rotation.x=Math.PI/2;const ringScale=bare?0:t.id===selectedId?1.15:.9;obj.scale.set((t.width||1)*ringScale,(t.height||1)*ringScale,1);obj.updateMatrix();tokenRings.setMatrixAt(i,obj.matrix);tokenRings.setColorAt(i,new THREE.Color(t.id===selectedId?'#ffda80':t.color||'#59c8c0'));
  });for(const mesh of [tokenBodies,tokenHeads,tokenBases,tokenRings]){mesh.count=visibleTokens.length;mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;}
 }
 const overlayGeo=new THREE.PlaneGeometry(.92,.92);overlayGeo.rotateX(-Math.PI/2);
 const overlays={};for(const [name,color,opacity] of [['reach','#5ce1cf',.24],['vision','#6cabe0',.105]]){
  const mesh=new THREE.InstancedMesh(overlayGeo,new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1}),4096);mesh.count=0;mesh.frustumCulled=false;scene.add(mesh);overlays[name]=mesh;
 }
 function paintOverlay(name){const mesh=overlays[name];const list=(mesh.userData.nodes||[]).filter(p=>typeof p?.x==='number'&&(activeLevel<0||belongsToLevel(p)<=activeLevel));mesh.count=Math.min(4096,list.length);obj.rotation.set(0,0,0);obj.scale.set(1,1,1);list.slice(0,4096).forEach((p,i)=>{obj.position.set(p.x,(p.z||0)+.11,p.y);obj.updateMatrix();mesh.setMatrixAt(i,obj.matrix);});mesh.instanceMatrix.needsUpdate=true;}
 function setOverlay(name,nodes){overlays[name].userData.nodes=nodes;paintOverlay(name);}
 const guideScene=new THREE.Scene();guideScene.name='movement-overlay-pass';
 const pathMat=new THREE.LineBasicMaterial({color:'#ffe6a3',transparent:true,opacity:.95,depthTest:true,depthWrite:false});const pathGhostMat=pathMat.clone();pathGhostMat.depthFunc=THREE.GreaterDepth;pathGhostMat.opacity=.95*.32;let pathLine=null,pathGhost=null;
 function setPath(nodes){if(pathLine){guideScene.remove(pathLine);if(pathGhost)guideScene.remove(pathGhost);pathLine.geometry.dispose();pathLine=null;pathGhost=null;}if((nodes?.length||0)<2)return;pathLine=new THREE.Line(new THREE.BufferGeometry().setFromPoints(nodes.map(p=>new THREE.Vector3(p.x,(p.z||0)+.25,p.y))),pathMat);pathLine.renderOrder=5;guideScene.add(pathLine);pathGhost=new THREE.Line(pathLine.geometry,pathGhostMat);pathGhost.renderOrder=5;guideScene.add(pathGhost);}
 const movementRoute=createMovementRoute(guideScene,camera,canvas);
 // Height tethers: the 2D board's green line from a raised token straight down
 // to what is under it, drawn as a thin post with a ring where it meets the
 // support. Behind scenery it stays faintly visible, like the movement route.
 const tetherColor='#61d878',tetherCapacity=256;
 const tetherMat=new THREE.MeshBasicMaterial({color:tetherColor,depthTest:true,depthWrite:false,transparent:true,opacity:.95,toneMapped:false});
 const tetherGhostMat=tetherMat.clone();tetherGhostMat.depthFunc=THREE.GreaterDepth;tetherGhostMat.opacity=.3;
 const tetherPost=new THREE.CylinderGeometry(.035,.035,1,8);tetherPost.translate(0,.5,0);const tetherRing=new THREE.RingGeometry(.2,.27,28);tetherRing.rotateX(-Math.PI/2);
 const tetherMeshes=[[tetherPost,tetherMat],[tetherPost,tetherGhostMat],[tetherRing,tetherMat],[tetherRing,tetherGhostMat]].map(([g,m],i)=>{const mesh=new THREE.InstancedMesh(g,m,tetherCapacity);mesh.count=0;mesh.frustumCulled=false;mesh.renderOrder=6;mesh.name=i<2?'vtt-height-tether':'vtt-height-tether-foot';guideScene.add(mesh);return mesh;});
 let tetherSignature='';
 function setTethers(list){
  const next=JSON.stringify(list||[]);if(next===tetherSignature)return;tetherSignature=next;const items=(list||[]).slice(0,tetherCapacity);
  items.forEach((t,i)=>{
   obj.rotation.set(0,0,0);obj.position.set(t.x,t.bottom,t.y);obj.scale.set(1,Math.max(.01,t.top-t.bottom),1);obj.updateMatrix();tetherMeshes[0].setMatrixAt(i,obj.matrix);tetherMeshes[1].setMatrixAt(i,obj.matrix);
   obj.position.set(t.x,t.bottom+.03,t.y);obj.scale.set(1,1,1);obj.updateMatrix();tetherMeshes[2].setMatrixAt(i,obj.matrix);tetherMeshes[3].setMatrixAt(i,obj.matrix);
  });
  for(const mesh of tetherMeshes){mesh.count=items.length;mesh.instanceMatrix.needsUpdate=true;}
 }
 const raycaster=new THREE.Raycaster(),mouse=new THREE.Vector2();
 // The terrain is a height field, so a pointer ray is walked along it rather
 // than tested against its 400,000 triangles (about 15 ms per test before).
 let terrainTop=h.reduce((a,b)=>Math.max(a,b),-Infinity)+.01;const terrainPoint=new THREE.Vector3();
 function terrainCast(ray){
  if(!terrain.visible)return null;const o=ray.origin,dir=ray.direction;let t0=0,t1=Infinity;
  for(const [oc,dc,lo,hi] of [[o.x,dir.x,0,w],[o.y,dir.y,bottom,terrainTop],[o.z,dir.z,0,depth]]){
   if(Math.abs(dc)<1e-12){if(oc<lo||oc>hi)return null;continue;}let a=(lo-oc)/dc,b=(hi-oc)/dc;if(a>b)[a,b]=[b,a];t0=Math.max(t0,a);t1=Math.min(t1,b);if(t0>t1)return null;
  }
  if(!Number.isFinite(t0)||!Number.isFinite(t1)||t1-t0>4000)return null;
  const above=t=>o.y+dir.y*t-(heightAt(o.x+dir.x*t,o.z+dir.z*t)-.025);
  // A ray that starts inside the ground (a camera low by the rim) counts the
  // ground only where it comes down onto it from above, as a triangle test does.
  let previous=t0;while(above(previous)<=0){previous+=.08;if(previous>=t1)return null;}
  for(let t=previous+.08;;t+=.08){const at=Math.min(t,t1);if(above(at)<=0){let lo=previous,hi=at;for(let i=0;i<14;i++){const mid=(lo+hi)/2;if(above(mid)>0)lo=mid;else hi=mid;}
    terrainPoint.copy(o).addScaledVector(dir,hi);return {distance:hi,point:terrainPoint.clone(),object:terrain,face:{normal:{y:1}}};}
   previous=at;if(at>=t1)return null;}
 }
 // Nearest walkable surface on a ray: plates, tiles, water and ramps by triangles, the terrain by its height field.
 function castSurfaces(ray,extra=[]){
  const hit=ray.intersectObjects([...extra,...pickSurfaces.filter(v=>v.visible&&v!==terrain)],false).find(h=>h.object.userData.token||!h.object.userData.surfaceId||h.face?.normal.y>.5)||null;
  const ground=terrainCast(ray.ray);return ground&&(!hit||ground.distance<hit.distance)?ground:hit;
 }
 const pick=(e,{tokens=true}={})=>{
  const rect=canvas.getBoundingClientRect();mouse.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(mouse,camera);
  const hit=castSurfaces(raycaster,tokens?[tokenBodies,tokenHeads,tokenBases].filter(m=>m.visible):[]);if(!hit)return null;
  if(hit.object.userData.token){const t=visibleTokens[hit.instanceId];return t?{...t,tokenId:t.id,level:belongsToLevel(t)}:null;}
  return {x:hit.point.x,y:hit.point.z,z:hit.point.y,level:hit.object.userData.level??0,levelId:hit.object.userData.ramp?null:(hit.object.userData.levelId??d.levels?.[hit.object.userData.level??0]?.id??null),surfaceId:hit.object.userData.surfaceId??null,rampId:hit.object.userData.rampId??null};
 };

 // Wheel zoom travels toward the point under the pointer and keeps that point
 // under the pointer, so pits and sinkholes can be entered and inspected. The
 // orbit pivot is then moved along the view axis onto what is at screen centre.
 const zoomRay=new THREE.Raycaster(),zoomMouse=new THREE.Vector2(),viewDir=new THREE.Vector3(),centerNdc=new THREE.Vector2(0,0);
 const surfaceHit=ndc=>{zoomRay.setFromCamera(ndc,camera);return castSurfaces(zoomRay);};
 // Right-drag takes hold of the ground, as on the Strixhaven 3D map: the spot
 // under the pointer when the button goes down stays under it while dragging,
 // however far the view is zoomed or tilted.
 const grab={on:false,id:-1,y:0,p:new THREE.Vector3()},grabNdc=new THREE.Vector2(),grabV=new THREE.Vector3();
 const groundUnder=(clientX,clientY,y,out)=>{const rect=canvas.getBoundingClientRect();grabNdc.set((clientX-rect.left)/rect.width*2-1,-(clientY-rect.top)/rect.height*2+1);zoomRay.setFromCamera(grabNdc,camera);const o=zoomRay.ray.origin,dir=zoomRay.ray.direction;
  const t=Math.min((y-o.y)/Math.min(dir.y,-.045),4000);return out.set(o.x+dir.x*t,y,o.z+dir.z*t);};
 function grabStart(clientX,clientY){camera.updateMatrixWorld();const rect=canvas.getBoundingClientRect();grabNdc.set((clientX-rect.left)/rect.width*2-1,-(clientY-rect.top)/rect.height*2+1);const hit=surfaceHit(grabNdc);
  grab.y=hit?hit.point.y:controls.target.y;if(hit)grab.p.copy(hit.point);else groundUnder(clientX,clientY,grab.y,grab.p);grab.on=true;}
 function grabMove(clientX,clientY){if(!grab.on)return;
  groundUnder(clientX,clientY,grab.y,grabV);const far=camera.position.distanceTo(controls.target)*4,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  let dx=clamp(grab.p.x-grabV.x,-far,far),dz=clamp(grab.p.z-grabV.z,-far,far);
  dx=clamp(controls.target.x+dx,-4,w+4)-controls.target.x;dz=clamp(controls.target.z+dz,-4,depth+4)-controls.target.z; // the view stops just past the board's edge
  camera.position.x+=dx;camera.position.z+=dz;controls.target.x+=dx;controls.target.z+=dz;camera.updateMatrixWorld();}
 function zoomAt(clientX,clientY,deltaY){
  const rect=canvas.getBoundingClientRect();zoomMouse.set((clientX-rect.left)/rect.width*2-1,-(clientY-rect.top)/rect.height*2+1);
  const factor=Math.exp(-Math.max(-600,Math.min(600,deltaY))*.0015),hit=surfaceHit(zoomMouse);
  zoomRay.setFromCamera(zoomMouse,camera);const dir=zoomRay.ray.direction.clone();
  const distance=hit?hit.distance:camera.position.distanceTo(controls.target);
  // Wheel up (negative delta) moves toward the pointed spot; wheel down backs away.
  const amount=1-Math.min(factor,1/factor);let move=deltaY<0?distance*amount:-distance*amount/(1-amount);
  if(move>0)move=Math.min(move,Math.max(0,distance-1.2));
  if(move<0&&camera.position.distanceTo(center)-move>controls.maxDistance+40)move=0;
  if(!move)return;
  const shift=dir.multiplyScalar(move);camera.position.add(shift);controls.target.add(shift);
  camera.updateMatrixWorld();camera.getWorldDirection(viewDir);
  const ahead=surfaceHit(centerNdc),radius=Math.max(1,Math.min(ahead?ahead.distance:Infinity,camera.position.distanceTo(controls.target)));
  controls.target.copy(camera.position).addScaledVector(viewDir,radius);controls.update();
 }
 const projected=new THREE.Vector3(),viewSize={width:1,height:1};
 function resize(){const width=canvas.clientWidth,height=canvas.clientHeight;viewSize.width=width||1;viewSize.height=height||1;renderer.setSize(width,height,false);camera.aspect=width/height;
  // Reserve visual space for the independent UI without changing world coordinates.
  camera.clearViewOffset();camera.updateProjectionMatrix();}
 updateLevels();resize();
 const planeRay=new THREE.Raycaster(),planeNdc=new THREE.Vector2();
 function pointOnPlane(clientX,clientY,y){const rect=canvas.getBoundingClientRect();planeNdc.set((clientX-rect.left)/rect.width*2-1,-(clientY-rect.top)/rect.height*2+1);planeRay.setFromCamera(planeNdc,camera);
  const o=planeRay.ray.origin,dir=planeRay.ray.direction;if(Math.abs(dir.y)<1e-6)return null;const t=(y-o.y)/dir.y;if(t<=0)return null;return {x:o.x+dir.x*t,y:o.z+dir.z*t};}
 return {renderer,scene,guideScene,camera,controls,pick,zoomAt,pointOnPlane,viewport:()=>({width:viewSize.width,height:viewSize.height}),setField,groundHeightAt:heightAt,grabStart,grabMove,orbit:(dx,dy)=>controls.orbit(dx,dy),castRay:castSurfaces,
  setTokenBodiesVisible(value){tokenBodies.visible=tokenHeads.visible=!!value;},
  setTokens(tokens,id){tokenRecords=tokens;selectedId=id;updateTokenMatrices();},
  // Tokens whose mini floats with no base (minis.json noBase): no base or ring is drawn under them.
  get disposed(){return disposed;},
  setArtLight,
  // A map's own 3D art (a .glb: scene-art.mjs) in place of the board's drawn ground, floors and sides. The ground and
  // floors stay as unseen surfaces for picking and height; the grid stays. Each art part is hidden with its level.
  useArtModel(){if(disposed)return false;const keep=new Set([...pickSurfaces,...grids]),hidden=new THREE.MeshBasicMaterial({visible:false});
   for(const o of [...root.children])if(!keep.has(o))root.remove(o);props.length=0;
   for(const o of pickSurfaces){o.material=hidden;o.castShadow=false;}renderer.shadowMap.needsUpdate=true;},
  addLevelArt(object,level,{always=false}={}){if(disposed)return false;if(object.userData.sceneLight)setArtLight(object.userData.sceneLight);object.userData.level=always?0:level;object.userData.category='art';root.add(object);props.push(object);updateLevels();},
  removeLevelArt(object){root.remove(object);const i=props.indexOf(object);if(i>=0)props.splice(i,1);},
  setTokensWithoutBase(ids){const key=[...(ids||[])].sort().join(',');if(key===noBaseKey)return;noBaseKey=key;noBaseIds=new Set(ids||[]);if(tokenRecords.length)updateTokenMatrices();},
  setLevel(level){activeLevel=Number(level);updateLevels();},setGrid(value){gridOn=value;updateLevels();},setRoofs(value){roofsOn=value;updateLevels();},setDoors(value){doorsOpen=value;updateLevels();},
  setReachable(nodes){setOverlay('reach',nodes);},setVision(nodes,enabled){overlays.vision.visible=!!enabled;setOverlay('vision',enabled?nodes:[]);},setPath,setMovementRoute:movementRoute.set,setTethers,tethers:()=>JSON.parse(tetherSignature||'[]'),
  focus(point){const goal=V(point),delta=goal.clone().sub(controls.target);camera.position.add(delta);controls.target.copy(goal);controls.update();},home,
  render(dt){waterUniforms.uTime.value+=Math.min(dt||.016,.1);controls.update();movementRoute.update(dt);
   // The sky stays round the camera; haze starts a little past what is being looked at.
   skyDome.position.copy(camera.position);{const dist=camera.position.distanceTo(controls.target);scene.fog.near=dist*.9+18;scene.fog.far=dist*3.2+110;near.value=Math.min(6,dist*.38);}
   // Draw every scene surface (including transparent water) before UI guides.
   // The separate pass cannot be reordered by scene groups or water materials.
   renderer.info.autoReset=false;renderer.info.reset();renderer.render(scene,camera);
   const autoClear=renderer.autoClear;renderer.autoClear=false;
   try{renderer.render(guideScene,camera);}finally{renderer.autoClear=autoClear;}
  },resize,
  metrics(){return {drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,tokens:visibleTokens.length,movementRoute:movementRoute.summary(),propReport,materials:{photographic,loadedTextures:surfaceTextures.loaded,expectedTextures:12,errors:surfaceTextures.errors,projection:'world-space triplanar',terrainDisplacement:false}};},
  // Canvas size is read on resize, not per call: a read between style writes would force a layout each time.
  project(point){projected.set(point.x,point.z||0,point.y).project(camera);return {x:(projected.x+1)*viewSize.width/2,y:(1-projected.y)*viewSize.height/2,visible:projected.z<1&&projected.z>-1};},
  // A map's own art (addLevelArt) is loaded once and moved from board to board: it is taken off, never freed, here.
  dispose(){if(disposed)return;disposed=true;for(const o of [...props])if(o.userData.category==='art')root.remove(o);controls.dispose();movementRoute.dispose();if(pathLine)pathLine.geometry.dispose();pathMat.dispose();pathGhostMat.dispose();const gs=new Set(),ms=new Set();scene.traverse(o=>{if(o.geometry)gs.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[])ms.add(m);});for(const g of gs)g.dispose();for(const m of ms)m.dispose();stoneTex.dispose();woodTex.dispose();kit?.dispose();scene.environment?.dispose();pictureTexture?.dispose();surfaceTextures.dispose();renderer.dispose();renderer.forceContextLoss();}
 };
}
