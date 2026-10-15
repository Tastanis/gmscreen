import * as THREE from 'three';
import {createCameraControls} from './camera-controls.mjs';
import {loadSurfaceTextures,surfaceMaterial} from './materials.mjs';
import {rampHeight} from '../assets/js/ui/imported-ramps.mjs';
import {createMovementRoute} from './movement-route.mjs';

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

export async function createSceneView({canvas,sceneData:d,groundPicture=null}){
 const levelHeights=d.levelHeights||[0,6,12,18,24,30],levelAt=z=>Math.max(0,levelHeights.findIndex(h=>Math.abs(h-z)<.1));
 const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
 renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.06;
 const scene=new THREE.Scene();scene.background=new THREE.Color('#14242a');scene.fog=new THREE.Fog('#14242a',170,320);
 const camera=new THREE.PerspectiveCamera(38,1,.1,450);
 const controls=createCameraControls(camera);
 const center=new THREE.Vector3(d.width*.50,11,d.height*.51),viewScale=Math.max(d.width,d.height)/66;
 function home(){controls.target.copy(center);camera.position.copy(center).add(new THREE.Vector3(68,98,80).multiplyScalar(viewScale));controls.update();}
 home();
 scene.add(new THREE.HemisphereLight('#d9e7eb','#4f5144',1.6));
 const sun=new THREE.DirectionalLight('#fff0d7',2.45);sun.position.set(-20,95,30);sun.target.position.set(d.width/2,10,d.height/2);scene.add(sun,sun.target);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-57;sun.shadow.camera.right=57;sun.shadow.camera.top=57;sun.shadow.camera.bottom=-57;sun.shadow.camera.near=1;sun.shadow.camera.far=180;sun.shadow.normalBias=.055;sun.shadow.bias=-.0003;
 const rim=new THREE.DirectionalLight('#aac8d2',1.0);rim.position.set(25,16,-12);scene.add(rim);
 const stoneTex=texture('stone'),woodTex=texture('wood');stoneTex.repeat.set(.8,.8);woodTex.repeat.set(.33,.33);
 const materials={stone:new THREE.MeshStandardMaterial({color:'#e2c7a0',map:stoneTex,roughness:.88}),cap:new THREE.MeshStandardMaterial({color:'#ead5b1',roughness:.8}),wood:new THREE.MeshStandardMaterial({color:'#d9ba93',map:woodTex,roughness:.78}),darkWood:new THREE.MeshStandardMaterial({color:'#493b31',roughness:.7}),brass:new THREE.MeshStandardMaterial({color:'#d6ab52',metalness:.72,roughness:.32}),blue:new THREE.MeshStandardMaterial({color:'#247786',metalness:.3,roughness:.35}),leaf:new THREE.MeshStandardMaterial({color:'#52786c',roughness:.8}),rock:new THREE.MeshStandardMaterial({color:'#bba081',flatShading:true,roughness:1}),book:new THREE.MeshStandardMaterial({color:'#6a8c96',roughness:.8}),roof:new THREE.MeshStandardMaterial({color:'#3d6f76',metalness:.12,roughness:.6})};
 materials.stone.color.set('#c0c5bd');materials.cap.color.set('#bebfae');materials.wood.color.set('#87745d');materials.rock.color.set('#676e6b');materials.leaf.color.set('#2c5945');materials.roof.color.set('#824e34');
 Object.assign(materials,{snow:new THREE.MeshStandardMaterial({color:'#dde7e4',roughness:.94}),cloth:new THREE.MeshStandardMaterial({color:'#ddd5bb',roughness:.95}),red:new THREE.MeshStandardMaterial({color:'#9a4f3d',roughness:.92}),metal:new THREE.MeshStandardMaterial({color:'#485f64',metalness:.58,roughness:.45}),glow:new THREE.MeshStandardMaterial({color:'#edb15b',emissive:'#ffa444',emissiveIntensity:.7,roughness:.4}),steam:new THREE.MeshBasicMaterial({color:'#d9edeb',transparent:true,opacity:.048,depthWrite:false})});
 const surfaceTextures=await loadSurfaceTextures(renderer),photographic=['ground','rock','wood','stone'].every(k=>surfaceTextures.sets[k]);
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
 materials.island=photographic?surfaceMaterial(surfaceTextures.sets.ground,{color:'#83b069',scale:.38,normalStrength:.35}):materials.leaf;
 materials.crystal=new THREE.MeshStandardMaterial({color:'#9fcfd2',metalness:.32,roughness:.24,emissive:'#386c86',emissiveIntensity:.22});
 materials.flower=new THREE.MeshStandardMaterial({color:'#b89bd2',roughness:.75});
 materials.rock.side=THREE.DoubleSide;
 const geo={box:new THREE.BoxGeometry(1,1,1),cylinder:new THREE.CylinderGeometry(1,1,1,12),sphere:new THREE.SphereGeometry(1,12,8),rock:new THREE.IcosahedronGeometry(1,1),leaf:new THREE.IcosahedronGeometry(1,0),cone:new THREE.ConeGeometry(1,1,9),torus:new THREE.TorusGeometry(1,.045,6,32)};
 for(let i=0;i<4;i++)geo['crag'+i]=cragGeometry(i);
 const root=new THREE.Group();scene.add(root);const floors=[],props=[],wallMeshes=[],doorMeshes=[],pickSurfaces=[];const batches=new Map();const mat4=new THREE.Matrix4(),obj=new THREE.Object3D();
 function batch(shape,material,p,scale,rotation=[0,0,0],level=0,category='prop',color=null){
  const key=`${shape}:${material}:${level}:${category}`;if(!batches.has(key))batches.set(key,{shape,material,level,category,items:[]});
  obj.position.set(...p);obj.rotation.set(...rotation);obj.scale.set(...scale);obj.updateMatrix();batches.get(key).items.push({matrix:obj.matrix.clone(),color});
 }
 function commitBatches(){for(const b of batches.values()){
  const mesh=new THREE.InstancedMesh(geo[b.shape],materials[b.material],b.items.length);b.items.forEach((v,i)=>{mesh.setMatrixAt(i,v.matrix);if(v.color)mesh.setColorAt(i,new THREE.Color(v.color));});mesh.castShadow=b.material!=='steam';mesh.receiveShadow=b.material!=='steam';mesh.userData={level:b.level,category:b.category};root.add(mesh);props.push(mesh);
 }}
 // Render the exact source samples, including narrow excavations and water edges.
 let {n,m,h}=d.field;
 // The height field covers these squares (a live field carries its own bounds).
 let fx0=d.field.bounds?.left??0,fz0=d.field.bounds?.top??0,fw=d.field.bounds?.width??d.width,fd=d.field.bounds?.height??d.height;
 const w=d.width,depth=d.height,bottom=h.reduce((a,b)=>Math.min(a,b),0)-.7;
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
   const r=groundPicture;pictureTexture.repeat.set(w/r.width,depth/r.height);pictureTexture.offset.set(-r.left/r.width,1-depth/r.height+r.top/r.height);}}
 const terrainMaterial=pictureTexture?new THREE.MeshStandardMaterial({map:pictureTexture,roughness:1,metalness:0}):photographic?surfaceMaterial(surfaceTextures.sets.rock,{terrainGround:surfaceTextures.sets.ground,color:'#c9cbbd',scale:.48,groundScale:.36,normalStrength:.50}):new THREE.MeshStandardMaterial({vertexColors:true,roughness:1});
 const terrain=new THREE.Mesh(terrainG,terrainMaterial);terrain.receiveShadow=true;terrain.userData={level:0};root.add(terrain);pickSurfaces.push(terrain);
 function heightAt(x,y){const gx=Math.max(0,Math.min(n-1,(x-fx0)/fw*(n-1))),gy=Math.max(0,Math.min(m-1,(y-fz0)/fd*(m-1)));const a=Math.floor(gx),b=Math.floor(gy),u=gx-a,v=gy-b;return (h[b*n+a]*(1-u)+h[b*n+Math.min(a+1,n-1)]*u)*(1-v)+(h[Math.min(b+1,m-1)*n+a]*(1-u)+h[Math.min(b+1,m-1)*n+Math.min(a+1,n-1)]*u)*v;}
 // Solid cut terrain edges keep the map a physical diorama from every camera angle.
 const skirts=[];for(const [a,b,count] of [[{x:0,y:0},{x:w,y:0},n],[{x:w,y:0},{x:w,y:depth},m],[{x:w,y:depth},{x:0,y:depth},n],[{x:0,y:depth},{x:0,y:0},m]])for(let i=0;i<count-1;i++){
  const p={x:a.x+(b.x-a.x)*i/(count-1),y:a.y+(b.y-a.y)*i/(count-1)},q={x:a.x+(b.x-a.x)*(i+1)/(count-1),y:a.y+(b.y-a.y)*(i+1)/(count-1)};
  skirts.push(p.x,bottom,p.y,q.x,bottom,q.y,q.x,heightAt(q.x,q.y)-.025,q.y,p.x,bottom,p.y,q.x,heightAt(q.x,q.y)-.025,q.y,p.x,heightAt(p.x,p.y)-.025,p.y);
 }
 const skirtG=new THREE.BufferGeometry();skirtG.setAttribute('position',new THREE.Float32BufferAttribute(skirts,3));skirtG.computeVertexNormals();const skirtMat=photographic?surfaceMaterial(surfaceTextures.sets.rock,{color:'#777b70',scale:.48,normalStrength:.3}):new THREE.MeshStandardMaterial({color:'#454b45',roughness:1});skirtMat.side=THREE.DoubleSide;const skirt=new THREE.Mesh(skirtG,skirtMat);root.add(skirt);
 const base=new THREE.Mesh(new THREE.BoxGeometry(w+.25,.22,depth+.25),new THREE.MeshStandardMaterial({color:'#27333d',metalness:.25,roughness:.55}));base.position.set(w/2,bottom-.12,depth/2);base.receiveShadow=true;root.add(base);
 // Live heights: Height tool strokes and shared terrain edits redraw the ground
 // in place (same grid) or rebuild it (new grid), with its sides.
 function groundColors(geometry){const position=geometry.attributes.position,colors=new Float32Array(position.count*3),c=new THREE.Color(),cell=fw/Math.max(1,n-1);
  for(let i=0;i<position.count;i++){const x=position.getX(i),y=position.getZ(i),ix=i%n,iy=Math.floor(i/n);
   const hash=Math.sin(i*127.1+iy*311.7)*43758.5453,grain=(hash-Math.floor(hash)-.5)*.008,variation=(Math.sin(x*.61+y*.24)+Math.cos(y*.55-x*.18))*.018;
   const slope=Math.max(Math.abs(h[i]-h[iy*n+Math.min(n-1,ix+1)]),Math.abs(h[i]-h[Math.min(m-1,iy+1)*n+ix]))/cell,cliff=Math.min(1,Math.max(0,(slope-.35)*.8));
   c.setHSL(.205-cliff*.05,.32-cliff*.25,.14+cliff*.055+variation+grain);colors[i*3]=c.r;colors[i*3+1]=c.g;colors[i*3+2]=c.b;}
  geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));}
 function skirtPositions(){const out=[];for(const [a,b,count] of [[{x:0,y:0},{x:w,y:0},n],[{x:w,y:0},{x:w,y:depth},m],[{x:w,y:depth},{x:0,y:depth},n],[{x:0,y:depth},{x:0,y:0},m]])for(let i=0;i<count-1;i++){
  const p={x:a.x+(b.x-a.x)*i/(count-1),y:a.y+(b.y-a.y)*i/(count-1)},q={x:a.x+(b.x-a.x)*(i+1)/(count-1),y:a.y+(b.y-a.y)*(i+1)/(count-1)};
  out.push(p.x,bottom,p.y,q.x,bottom,q.y,q.x,heightAt(q.x,q.y)-.025,q.y,p.x,bottom,p.y,q.x,heightAt(q.x,q.y)-.025,q.y,p.x,heightAt(p.x,p.y)-.025,p.y);}return out;}
 function setField(next){
  if(!next?.h||!(next.n>1)||!(next.m>1))return;
  const sameGrid=next.n===n&&next.m===m&&(next.bounds?.left??0)===fx0&&(next.bounds?.top??0)===fz0&&(next.bounds?.width??w)===fw&&(next.bounds?.height??depth)===fd;
  n=next.n;m=next.m;h=next.h;fx0=next.bounds?.left??0;fz0=next.bounds?.top??0;fw=next.bounds?.width??w;fd=next.bounds?.height??depth;
  let g=terrain.geometry;
  if(!sameGrid){g=new THREE.PlaneGeometry(fw,fd,n-1,m-1);g.rotateX(-Math.PI/2);g.translate(fx0+fw/2,0,fz0+fd/2);
   // Texture coordinates over the board, as the first ground had them (the picture's own placement is in its texture).
   const uv=g.attributes.uv,position=g.attributes.position;for(let i=0;i<position.count;i++)uv.setXY(i,position.getX(i)/w,1-position.getZ(i)/depth);}
  const position=g.attributes.position;for(let i=0;i<position.count;i++)position.setY(i,h[i]-.025);position.needsUpdate=true;
  groundColors(g);g.computeVertexNormals();g.computeBoundingSphere();g.computeBoundingBox();
  if(!sameGrid){terrain.geometry.dispose();terrain.geometry=g;}
  skirtG.setAttribute('position',new THREE.Float32BufferAttribute(skirtPositions(),3));skirtG.computeVertexNormals();
  let top=-Infinity;for(let i=0;i<h.length;i++)if(h[i]>top)top=h[i];terrainTop=top+.01;
  renderer.shadowMap.needsUpdate=true;
 }
 const ground=new THREE.Mesh(new THREE.PlaneGeometry(300,300),new THREE.MeshStandardMaterial({color:'#192c30',roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=bottom-.25;ground.receiveShadow=true;scene.add(ground);
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
 for(const s of d.walls.roofs){
  const level=s.level??levelAt(s.height),floating=s.floating!==false&&s.height>0;
  const mesh=new THREE.Mesh(polygon(s,s.kind==='roof'?.18:.25),s.kind==='roof'?materials.roof:floating?materials.island:materials.stone);mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData={level,levelId:s.levelId,surfaceId:s.id,isRoof:s.kind==='roof'};mesh.visible=s.kind!=='roof';root.add(mesh);floors.push(mesh);if(s.kind!=='roof')pickSurfaces.push(mesh);
  if(floating&&s.kind==='floor'){
   const ring=s.points,cx=ring.reduce((v,p)=>v+p.x,0)/ring.length,cy=ring.reduce((v,p)=>v+p.y,0)/ring.length;
   const span=Math.min(Math.max(...ring.map(p=>p.x))-Math.min(...ring.map(p=>p.x)),Math.max(...ring.map(p=>p.y))-Math.min(...ring.map(p=>p.y)));
   const drop=Math.min(4.4,Math.max(.75,span*.35)),verts=[];
   const point=(p,i,band)=>{const shrink=[1,.93,.62][band],jitter=Math.sin(i*31.3)*.18;return [cx+(p.x-cx)*shrink,s.height-[.18,drop*.42+jitter,drop][band],cy+(p.y-cy)*shrink];};
   for(let band=0;band<2;band++)for(let i=0;i<ring.length;i++){const j=(i+1)%ring.length,a=point(ring[i],i,band),b=point(ring[j],j,band),c=point(ring[j],j,band+1),q=point(ring[i],i,band+1);verts.push(...a,...b,...c,...a,...c,...q);}
   for(let i=0;i<ring.length;i++){const j=(i+1)%ring.length;verts.push(...point(ring[i],i,2),...point(ring[j],j,2),cx,s.height-drop-.45,cy);}
   const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));g.computeVertexNormals();
   const underside=new THREE.Mesh(g,materials.rock);underside.castShadow=true;underside.receiveShadow=true;underside.userData={level,category:'island-rock'};root.add(underside);props.push(underside);
   continue;
  }
  // Stone fascia around the outer edge and gallery opening makes floor depth readable.
  for(const ring of [s.points,...(s.holes||[])])for(let i=0;i<ring.length;i++){
   const a=ring[i],b=ring[(i+1)%ring.length],len=Math.hypot(b.x-a.x,b.y-a.y);if(len<.01)continue;
   batch('box',s.kind==='roof'?'roof':'darkWood',[(a.x+b.x)/2,s.height-.13,(a.y+b.y)/2],[len,.19,.09],[0,-Math.atan2(b.y-a.y,b.x-a.x),0],level,s.kind==='roof'?'roof':'fascia');
  }
 }
 const waterUniforms={uTime:{value:0}};
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
  }else{
   const count=Math.ceil((r.height-r.base)*.8),axis=horizontal?r.right-r.left:r.bottom-r.top;
   for(let i=0;i<=count;i++){const t=i/count,x=horizontal?r.left+axis*t:(r.left+r.right)/2,y=horizontal?(r.top+r.bottom)/2:r.top+axis*t,z=rampHeight(r,x,y);
    batch('leaf','leaf',[x+Math.sin(i*2)*.13,z,y+Math.cos(i*2)*.13],[.16,.08,.21],[.4,i*1.2,.4],level,'vine','#a9c780');
   }
   for(const edge of [.22,.78]){
    const a=horizontal?{x:r.left,y:r.top+(r.bottom-r.top)*edge}:{x:r.left+(r.right-r.left)*edge,y:r.top},b=horizontal?{x:r.right,y:a.y}:{x:a.x,y:r.bottom};
    const av=new THREE.Vector3(a.x,rampHeight(r,a.x,a.y),a.y),bv=new THREE.Vector3(b.x,rampHeight(r,b.x,b.y),b.y),mid=av.clone().add(bv).multiplyScalar(.5),len=av.distanceTo(bv);obj.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),bv.clone().sub(av).normalize());
    batch('cylinder','leaf',[mid.x,mid.y,mid.z],[.045,len,.045],[obj.rotation.x,obj.rotation.y,obj.rotation.z],level,'vine','#9bb978');
   }
  }
 }
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
  if(/Stairs/i.test(name)){propReport.stairsViaCanonical++;continue;}
  if(/Steam|Cold Fog|Swirling Mist|Necrotic Smoke/.test(name)){
   propReport.aggregatedAtmosphere++;const key=`${Math.floor(x/1.8)},${Math.floor(y/1.8)},${level}`;
   if(!steamCells.has(key)){steamCells.add(key);batch('sphere','steam',[x,z+.38,y],[Math.max(.7,sx*.6),.3,Math.max(.7,sy*.6)],[0,0,0],level,'steam',/Green|Necrotic/.test(name)?'#9accc2':null);}continue;
  }
  propReport.represented++;
  if(/^(Animated water|Medium Waterfall)$/.test(name)){
   waterProps.push(p);
  }else if(/Rock|Rubble/.test(name)){
   const shape='crag'+(stableHash(p.blockId||p.id)%4);
   add(shape,'rock',[0,sh*.50,0],[sx*.50,sh*.50,sy*.50]);
   if(/Moss/.test(name))add('leaf','island',[0,sh*.85,0],[sx*.45,Math.max(.025,sh*.09),sy*.45],[0,.2,0]);
  }else if(/Stalagmite/.test(name)){
   add('cone','rock',[0,sh*.5,0],[sx*.52,sh,sy*.52],[.03,.2,-.04]);
  }else if(/Fey Crystal|Crystal Geode/.test(name)){
   for(let i=0;i<3;i++)add('cone','crystal',[(i-1)*sx*.20,sh*(.4-i*.07),(i%2)*sy*.16],[sx*(.26-i*.03),sh*(.8-i*.14),sy*(.26-i*.03)],[0,i*2,(i-1)*.12],level>=3?'#f4cbd7':'#b0dce9');
  }else if(/^(Moss|Ground Ivy)$/.test(name)){
   add('leaf','island',[0,sh*.4,0],[sx*.5,Math.max(.018,sh*.5),sy*.5],[0,.1,0]);
  }else if(/Overgrown Vines|Overgrown Roots|^Rope$/.test(name)){
   for(let i=0;i<3;i++){const a=(i-1)*sx*.22;add('cylinder',/Rope/.test(name)?'wood':'leaf',[a,sh*.5,(i%2)*sy*.16],[Math.max(.02,sx*.024),sh,Math.max(.02,sy*.03)],[0,0,(i-1)*.12]);if(!/Rope/.test(name))for(let k=0;k<2;k++)add('leaf','leaf',[a,sh*(.25+k*.45),0],[sx*.16,.10,sy*.20],[0,i,0]);}
  }else if(/Fey Flower|^Grass$/.test(name)){
   for(let i=0;i<3;i++){const a=i*TAU/3;add('leaf',/Flower/.test(name)?'flower':'leaf',[Math.cos(a)*sx*.17,sh*.5,Math.sin(a)*sy*.17],[sx*.24,sh*.5,sy*.24],[0,a,.3]);}
  }else if(/Orange Tree|Lemon Tree/.test(name)){
   add('cylinder','darkWood',[0,sh*.38,0],[sx*.06,sh*.76,sy*.06]);for(let i=0;i<5;i++){const a=i*TAU/5;add('rock','leaf',[Math.cos(a)*sx*.16,sh*.73,Math.sin(a)*sy*.16],[sx*.35,sh*.27,sy*.35],[0,a,0],'#b5c696');add('sphere','glow',[Math.cos(a)*sx*.36,sh*(.62+(i%2)*.2),Math.sin(a)*sy*.36],[.09,.09,.09]);}
  }else if(/Magic Circle/.test(name)){
   add('torus','crystal',[0,.035,0],[sx*.46,sy*.46,.5],[Math.PI/2,0,0]);add('torus','brass',[0,.04,0],[sx*.35,sy*.35,.4],[Math.PI/2,0,0]);
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
   add('cylinder','brass',[0,sh*.45,0],[Math.max(.025,sx*.16),sh*.9,Math.max(.025,sy*.16)]);add('sphere','glow',[0,sh*.8,0],[Math.max(.055,sx*.5),Math.max(.08,sh*.17),Math.max(.055,sy*.4)]);
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
  const emitClipped=triangle=>{const clipped=[];for(let i=0;i<3;i++){const a=triangle[i],b=triangle[(i+1)%3],insideA=a.value>=0,insideB=b.value>=0;if(insideA)clipped.push(a);if(insideA!==insideB){const t=a.value/(a.value-b.value);clipped.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});}}for(let i=1;i<clipped.length-1;i++)for(const p of [clipped[0],clipped[i],clipped[i+1]])positions.push(p.x,zAt(p.x,p.y),p.y);};
  for(const key of cells){const [ix,iy]=key.split(',').map(Number),x=ix*cell,y=iy*cell;if(x<0||y<0||x+cell>w||y+cell>depth)continue;const a=signedAt(ix,iy),b=signedAt(ix+1,iy),c=signedAt(ix+1,iy+1),q=signedAt(ix,iy+1);emitClipped([a,c,b]);emitClipped([a,q,c]);}
  const waterMat=new THREE.ShaderMaterial({uniforms:waterUniforms,side:THREE.DoubleSide,forceSinglePass:true,transparent:true,depthWrite:true,
   vertexShader:`varying vec3 vWater;void main(){vWater=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
   fragmentShader:`uniform float uTime;varying vec3 vWater;void main(){float ripple=sin(vWater.x*6.+vWater.z*4.+uTime*.8)*sin(vWater.z*5.-uTime*.5);float foam=pow(max(0.,sin(vWater.y*4.+vWater.x*8.+uTime*2.)),14.);vec3 c=mix(vec3(.015,.15,.18),vec3(.055,.32,.38),.5+.16*ripple);c+=vec3(.10,.20,.21)*foam*.28;gl_FragColor=vec4(c,.94);
   #include <tonemapping_fragment>
   #include <colorspace_fragment>
   }`});
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.computeVertexNormals();const water=new THREE.Mesh(g,waterMat);water.userData={level:0};root.add(water);pickSurfaces.push(water);
  const falls=[],fallsUv=[];
  for(const p of waterProps.filter(p=>p.name==='Medium Waterfall')){
   const pool=[...pools].filter(q=>q.name.includes('fall')).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];if(!pool)continue;
   const dx=pool.x-p.x,dy=pool.y-p.y,len=Math.hypot(dx,dy),px=-dy/len,py=dx/len,half=Math.min(.9,p.size.width*.11),top=heightAt(p.x,p.y)+.08;
   const edge=(t,side)=>{const x=p.x+dx*t+px*half*side,y=p.y+dy*t+py*half*side,z=Math.max(top*(1-t)+pool.height*t,heightAt(x,y)+.06);return [x,z,y];};
   for(let i=0;i<24;i++){const a=edge(i/24,-1),b=edge(i/24,1),c=edge((i+1)/24,1),q=edge((i+1)/24,-1);falls.push(...a,...c,...b,...a,...q,...c);fallsUv.push(0,i/24,1,(i+1)/24,1,i/24,0,i/24,0,(i+1)/24,1,(i+1)/24);}
  }
  const fg=new THREE.BufferGeometry();fg.setAttribute('position',new THREE.Float32BufferAttribute(falls,3));fg.setAttribute('uv',new THREE.Float32BufferAttribute(fallsUv,2));fg.computeVertexNormals();
  const fallMat=new THREE.ShaderMaterial({uniforms:waterUniforms,side:THREE.DoubleSide,forceSinglePass:true,transparent:true,depthWrite:false,vertexShader:`varying vec2 vFall;void main(){vFall=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`uniform float uTime;varying vec2 vFall;void main(){float edge=smoothstep(0.,.18,vFall.x)*smoothstep(0.,.18,1.-vFall.x);float strands=pow(.5+.5*sin(vFall.x*62.+sin(vFall.y*35.-uTime*4.)*.7),3.);float flow=.5+.5*sin(vFall.y*95.-uTime*8.+vFall.x*12.);float alpha=edge*(.12+strands*.28+flow*.08);gl_FragColor=vec4(mix(vec3(.10,.29,.31),vec3(.57,.75,.72),strands*.7+flow*.2),alpha);
   #include <tonemapping_fragment>
   #include <colorspace_fragment>
  }`});const fmesh=new THREE.Mesh(fg,fallMat);root.add(fmesh);
  propReport.water={nativeWaterPlacements:waterProps.filter(p=>p.name==='Animated water').length,mergedStreamCells:cells.size,shoreline:'interpolated native ellipse union',surfaceTriangles:positions.length/9,authoredPools:pools.length,proceduralWaterfalls:waterProps.filter(p=>p.name==='Medium Waterfall').length};
 }
 // The vortex follows the actual deepest basin, not an invented map placement.
 const deep=[];for(let i=0;i<h.length;i++)if(h[i]<-7)deep.push({x:i%n/(n-1)*w,y:Math.floor(i/n)/(m-1)*depth});
 if(deep.length&&d.props.some(p=>p.name==='Green Swirling Mist')){
  const minX=Math.min(...deep.map(p=>p.x)),maxX=Math.max(...deep.map(p=>p.x)),minY=Math.min(...deep.map(p=>p.y)),maxY=Math.max(...deep.map(p=>p.y)),cx=(minX+maxX)/2,cy=(minY+maxY)/2,radius=Math.min(maxX-minX,maxY-minY)*.49,vertices=[],uv=[];
  for(let ring=0;ring<12;ring++)for(let i=0;i<80;i++){
   const point=(r,j)=>{const a=j/80*TAU,rr=radius*r/12;return {p:[cx+Math.cos(a)*rr,-8.7+2.2*(r/12)**.7,cy+Math.sin(a)*rr],uv:[Math.cos(a)*r/12,Math.sin(a)*r/12]};};
   const a=point(ring,i),b=point(ring,i+1),c=point(ring+1,i+1),q=point(ring+1,i);for(const v of [a,c,b,a,q,c]){vertices.push(...v.p);uv.push(...v.uv);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  const mat=new THREE.ShaderMaterial({uniforms:waterUniforms,side:THREE.DoubleSide,vertexShader:`varying vec2 vSwirl;void main(){vSwirl=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`uniform float uTime;varying vec2 vSwirl;void main(){float r=length(vSwirl),a=atan(vSwirl.y,vSwirl.x);float band=pow(.5+.5*sin(a*5.+r*24.-uTime*.7),5.);vec3 c=mix(vec3(.008,.025,.022),vec3(.045,.24,.17),band*smoothstep(.04,.8,r));gl_FragColor=vec4(c,1.);
   #include <tonemapping_fragment>
   #include <colorspace_fragment>
  }`});root.add(new THREE.Mesh(g,mat));
 }
 commitBatches();
 // Sparse terrain contour/grid and floor grids, batched into three line calls.
 const grids=[];for(let level=0;level<levelHeights.length;level++){
  const vertices=[],plates=d.walls.roofs.filter(s=>s.kind==='floor'&&Math.abs(s.height-levelHeights[level])<.1);
  for(let y=0;y<depth;y++)for(let x=0;x<w;x++){
   if(level>0&&!plates.some(s=>contained(x+.5,y+.5,s)))continue;
   for(const [a,b] of [[{x,y},{x:x+1,y}],[{x,y},{x,y:y+1}]]){
    const sample=p=>level?levelHeights[level]+.075:(groundTiles.some(f=>Math.abs(f.x-(x+.5))<.01&&Math.abs(f.y-(y+.5))<.01)?.065:heightAt(p.x,p.y)+.025);
    vertices.push(a.x,sample(a),a.y,b.x,sample(b),b.y);
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
 let tokenRecords=[],selectedId=null,visibleTokens=[];
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
   for(const [mesh,up] of [[tokenBases,.12],[tokenBodies,.48],[tokenHeads,.92]]){obj.position.set(t.x,t.z+up,t.y);obj.updateMatrix();mesh.setMatrixAt(i,obj.matrix);if(mesh!==tokenBases)mesh.setColorAt(i,color);}
   obj.position.set(t.x,t.z+.19,t.y);obj.rotation.x=Math.PI/2;const ringScale=t.id===selectedId?1.15:.9;obj.scale.set((t.width||1)*ringScale,(t.height||1)*ringScale,1);obj.updateMatrix();tokenRings.setMatrixAt(i,obj.matrix);tokenRings.setColorAt(i,new THREE.Color(t.id===selectedId?'#ffda80':t.color||'#59c8c0'));
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
  setLevel(level){activeLevel=Number(level);updateLevels();},setGrid(value){gridOn=value;updateLevels();},setRoofs(value){roofsOn=value;updateLevels();},setDoors(value){doorsOpen=value;updateLevels();},
  setReachable(nodes){setOverlay('reach',nodes);},setVision(nodes,enabled){overlays.vision.visible=!!enabled;setOverlay('vision',enabled?nodes:[]);},setPath,setMovementRoute:movementRoute.set,setTethers,tethers:()=>JSON.parse(tetherSignature||'[]'),
  focus(point){const goal=V(point),delta=goal.clone().sub(controls.target);camera.position.add(delta);controls.target.copy(goal);controls.update();},home,
  render(dt){waterUniforms.uTime.value+=Math.min(dt||.016,.1);controls.update();movementRoute.update(dt);
   // Draw every scene surface (including transparent water) before UI guides.
   // The separate pass cannot be reordered by scene groups or water materials.
   renderer.info.autoReset=false;renderer.info.reset();renderer.render(scene,camera);
   const autoClear=renderer.autoClear;renderer.autoClear=false;
   try{renderer.render(guideScene,camera);}finally{renderer.autoClear=autoClear;}
  },resize,
  metrics(){return {drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,tokens:visibleTokens.length,movementRoute:movementRoute.summary(),propReport,materials:{photographic,loadedTextures:surfaceTextures.loaded,expectedTextures:12,errors:surfaceTextures.errors,projection:'world-space triplanar',terrainDisplacement:false}};},
  // Canvas size is read on resize, not per call: a read between style writes would force a layout each time.
  project(point){projected.set(point.x,point.z||0,point.y).project(camera);return {x:(projected.x+1)*viewSize.width/2,y:(1-projected.y)*viewSize.height/2,visible:projected.z<1&&projected.z>-1};},
  dispose(){controls.dispose();movementRoute.dispose();if(pathLine)pathLine.geometry.dispose();pathMat.dispose();pathGhostMat.dispose();const gs=new Set(),ms=new Set();scene.traverse(o=>{if(o.geometry)gs.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[])ms.add(m);});for(const g of gs)g.dispose();for(const m of ms)m.dispose();stoneTex.dispose();woodTex.dispose();pictureTexture?.dispose();surfaceTextures.dispose();renderer.dispose();renderer.forceContextLoss();}
 };
}
