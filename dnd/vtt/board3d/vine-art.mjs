import * as THREE from 'three';

// Vine ramps drawn as living vines (Map maker, October 14, 2026: "a thick curved rope of two or three twisted,
// tapered strands following the ramp's own line from foot to head ... draping over the island lip at the top, with
// leaves as double-sided textured cards ... and a few small flowers. It must read at a glance as the way up.").
// Every strand runs inside the ramp's own lane, from its foot edge to its head edge, then lies a little way onto the
// head square; nothing is drawn across a square that is not the ramp. Geometry only: the ramp itself (its plane,
// its squares, its stair links) is the map's and is not changed. World: x = column, y = height, z = row.

const UP=new THREE.Vector3(0,1,0);
function random(seed){let s=seed>>>0||1;return ()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
const hashOf=text=>{let h=2166136261;for(const c of String(text))h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;};

// A leaf: a pointed teardrop 1 long (+y), folded a little along its midrib, darker at the stem.
function leafGeometry(){
 const s=new THREE.Shape();s.moveTo(0,0);s.bezierCurveTo(.34,.16,.36,.62,0,1);s.bezierCurveTo(-.36,.62,-.34,.16,0,0);
 const g=new THREE.ShapeGeometry(s,6),p=g.attributes.position,colors=[];
 for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i);p.setZ(i,Math.abs(x)*.32-y*(1-y)*.18);const k=.68+y*.32;colors.push(k,k,k);}
 g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.computeVertexNormals();return g;
}
// A small five-petal flower facing +z, its middle yellow.
function flowerGeometry(){
 const positions=[],colors=[],petal=(a)=>{const c=Math.cos(a),s=Math.sin(a),w=.42;const tip=[c,s,0],l=[c*.45-s*w*.45,s*.45+c*w*.45,.05],r=[c*.45+s*w*.45,s*.45-c*w*.45,.05];
  for(const v of [[0,0,.08],l,tip,[0,0,.08],tip,r])positions.push(...v);for(let i=0;i<6;i++)colors.push(1,1,1);};
 for(let i=0;i<5;i++)petal(i/5*Math.PI*2);
 for(let i=0;i<6;i++){const a=i/6*Math.PI*2,b=(i+1)/6*Math.PI*2;positions.push(0,0,.12,Math.cos(a)*.2,Math.sin(a)*.2,.1,Math.cos(b)*.2,Math.sin(b)*.2,.1);for(let k=0;k<3;k++)colors.push(1.6,1.25,.25);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.computeVertexNormals();return g;
}

// A tapering tube along a curve, appended to one geometry's arrays. radius(t) gives the radius at 0..1 along it.
function appendTube(out,curve,radius,{segments,radial=7,uvLength=1}){
 const frames=curve.computeFrenetFrames(segments,false),base=out.positions.length/3,point=new THREE.Vector3(),normal=new THREE.Vector3();
 for(let i=0;i<=segments;i++){const t=i/segments;curve.getPointAt(t,point);const r=radius(t),N=frames.normals[i],B=frames.binormals[i];
  for(let j=0;j<=radial;j++){const a=j/radial*Math.PI*2,c=Math.cos(a),s=Math.sin(a);normal.set(N.x*c+B.x*s,N.y*c+B.y*s,N.z*c+B.z*s).normalize();
   out.positions.push(point.x+normal.x*r,point.y+normal.y*r,point.z+normal.z*r);out.normals.push(normal.x,normal.y,normal.z);out.uvs.push(j/radial,t*uvLength);}}
 for(let i=0;i<segments;i++)for(let j=0;j<radial;j++){const a=base+i*(radial+1)+j,b=a+radial+1;out.indices.push(a,b,a+1,b,b+1,a+1);}
}

// Leaves for a hanging strand: on both sides, facing the camera-side world (any way out), drooping.
function hangingLeaves(curve,length,rand,list,{every,hue,size,skip=0}){
 const at=new THREE.Vector3(),tangent=new THREE.Vector3(),m=new THREE.Matrix4(),q=new THREE.Quaternion(),s=new THREE.Vector3();
 for(let d=skip;d<length;d+=every*(.7+rand()*.6)){const t=d/length;curve.getPointAt(t,at);curve.getTangentAt(t,tangent);
  const a=rand()*Math.PI*2,face=new THREE.Vector3(Math.cos(a),(rand()-.5)*.5,Math.sin(a)).normalize();
  const stem=new THREE.Vector3().crossVectors(tangent,face).normalize().addScaledVector(UP,-.5-rand()*.4).normalize();
  const x=new THREE.Vector3().crossVectors(stem,face).normalize(),z=new THREE.Vector3().crossVectors(x,stem).normalize(),sz=size*(.75+rand()*.5);
  m.makeBasis(x,stem,z);q.setFromRotationMatrix(m);s.set(sz*.9,sz,sz);
  list.push({matrix:new THREE.Matrix4().compose(at.clone().addScaledVector(face,.02),q,s),color:new THREE.Color().setHSL(hue[0]+rand()*hue[1],.38+rand()*.2,.27+rand()*.12)});}
}

/**
 * Hanging ivy and hanging roots for the map's "Overgrown Vines" and "Overgrown Roots" placements (Dungeon
 * Alchemist's own vine and root art: a drape from the placement's top down its height). Vine placements on a vine
 * ramp are left to the ramp's vine. props: {x,y,base,size,level,id,name}; rampNear(p) true where a vine ramp is.
 */
export function buildHanging(props,{levelOf,rampNear,attached=()=>true,barkMaterial,rootMaterial,leafMaterial}){
 const perLevel=new Map(),leafGeo=leafGeometry(),meshes=[],report={ivy:0,roots:0,skippedOnRamps:0};
 const bucket=(level,key)=>{if(!perLevel.has(level))perLevel.set(level,{ivy:{positions:[],normals:[],uvs:[],indices:[]},roots:{positions:[],normals:[],uvs:[],indices:[]},leaves:[]});return perLevel.get(level);};
 for(const p of props){
  const roots=/Roots/.test(p.name);if(!roots&&rampNear(p)){report.skippedOnRamps++;continue;}
  if(!roots&&!p.intentionalFloat&&p.id&&!String(p.id).includes(':moss:')){(report.lying??=[]).push(p);continue;}
  // Nothing hangs from thin air: only where an island, a floor or a cliff holds its top.
  if(!attached(p)){report.unattached=(report.unattached||0)+1;continue;}
  const rand=random(hashOf(p.id)),b=bucket(levelOf(p)),top=p.base+p.size.height,width=Math.max(.3,Math.min(p.size.width,p.size.depth??p.size.width)),rot=-(p.rotation||0)*Math.PI/180;
  const count=roots?3+Math.floor(rand()*3):3+Math.floor(rand()*2);
  for(let k=0;k<count;k++){
   const spread=(k/(count-1||1)-.5)*width*.8,sx=p.x+Math.cos(rot)*spread,sz=p.y-Math.sin(rot)*spread,length=p.size.height*(roots?.55+rand()*.45:.7+rand()*.3);
   const sway=new THREE.Vector3(rand()-.5,0,rand()-.5).normalize().multiplyScalar(roots?.32:.16),points=[],start=top+(roots?.25:0);
   for(let i=0;i<=8;i++){const t=i/8,curl=roots?Math.sin(t*Math.PI*(1.2+rand()*.6)+k*1.7):Math.sin(t*Math.PI*1.4+k);points.push(new THREE.Vector3(sx+sway.x*curl+(rand()-.5)*.06,start-(length+(start-top))*t,sz+sway.z*(roots?Math.cos(t*Math.PI*1.1+k):Math.sin(t*Math.PI*1.2+k))+(rand()-.5)*.06));}
   const curve=new THREE.CatmullRomCurve3(points,false,'catmullrom',.5),len=curve.getLength(),thick=roots?.022+rand()*.018:.013;
   appendTube(roots?b.roots:b.ivy,curve,t=>Math.max(.004,thick*(1-t)**1.3),{segments:Math.ceil(len*6),radial:roots?6:5,uvLength:len*1.4});
   if(roots){if(rand()<.35)hangingLeaves(curve,len*.25,rand,b.leaves,{every:.16,hue:[.2,.05],size:.07,skip:.3});}
   else hangingLeaves(curve,len,rand,b.leaves,{every:.045,hue:[.24,.07],size:.095});
  }
  report[roots?'roots':'ivy']++;
 }
 for(const [level,b] of perLevel){
  for(const [part,mat] of [[b.ivy,barkMaterial],[b.roots,rootMaterial]]){if(!part.positions.length)continue;
   const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(part.positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(part.normals,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(part.uvs,2));g.setIndex(part.indices);g.computeBoundingSphere();
   const mesh=new THREE.Mesh(g,mat);mesh.castShadow=mesh.receiveShadow=true;mesh.userData={level,category:'vine'};meshes.push(mesh);}
  if(b.leaves.length){const mesh=new THREE.InstancedMesh(leafGeo,leafMaterial,b.leaves.length);b.leaves.forEach((item,i)=>{mesh.setMatrixAt(i,item.matrix);mesh.setColorAt(i,item.color);});mesh.castShadow=mesh.receiveShadow=true;mesh.userData={level,category:'vine'};meshes.push(mesh);}
 }
 return {meshes,report};
}

/**
 * Builds the vines for every vine ramp. ramps: the scene's ramps (kind 'vine'); levelOf(ramp) its level index.
 * Returns the meshes, each with userData {level, category:'vine'} so the Height cut hides it with its level.
 */
export function buildVines(ramps,{levelOf,barkMaterial,leafMaterial,flowerMaterial}){
 const perLevel=new Map(),leafGeo=leafGeometry(),flowerGeo=flowerGeometry(),meshes=[],m=new THREE.Matrix4(),q=new THREE.Quaternion(),s=new THREE.Vector3();
 const bucket=level=>{if(!perLevel.has(level))perLevel.set(level,{tube:{positions:[],normals:[],uvs:[],indices:[]},leaves:[],flowers:[]});return perLevel.get(level);};
 const report={vines:0,strands:0,leaves:0,flowers:0};
 for(const r of ramps){
  const rand=random(hashOf(r.id)),level=levelOf(r),b=bucket(level);
  const dirs={east:[1,0],west:[-1,0],south:[0,1],north:[0,-1]},[ux,uy]=dirs[r.direction]||[0,-1],ax=-uy,ay=ux;
  const alongX=ux!==0,lane=alongX?[r.top,r.bottom]:[r.left,r.right],laneMid=(lane[0]+lane[1])/2,laneHalf=(lane[1]-lane[0])/2;
  const footS=alongX?(ux>0?r.left:r.right):(uy>0?r.top:r.bottom),headS=alongX?(ux>0?r.right:r.left):(uy>0?r.bottom:r.top);
  const run=Math.abs(headS-footS),rise=r.height-r.base,slope=rise/Math.max(.05,run);
  // On the ramp at lane offset `side` (from the lane middle) and fraction t from foot to head.
  const onRamp=(t,side)=>{const s0=footS+(headS-footS)*t,x=alongX?s0:laneMid+side,y=alongX?laneMid+side:s0;return new THREE.Vector3(x,r.base+rise*t,y);};
  // Out of the face, away from the rock (the way the ramp faces), and across the lane.
  const out=new THREE.Vector3(-ux*slope,1,-uy*slope).normalize(),across=new THREE.Vector3(ax,0,ay),uphill=new THREE.Vector3(ux,0,uy);
  // As many strands as the lane is wide (about 2.6 a square), spread over its whole width.
  const strands=Math.max(2,Math.min(7,Math.round(laneHalf*2*2.6))),spread=Math.max(.06,laneHalf-.14),turns=Math.max(1,rise/2.4);
  for(let k=0;k<strands;k++){
   const phase=k/strands*Math.PI*2+rand()*.6,offset=strands>1?(k/(strands-1)*2-1)*spread:0,edgeStrand=k===0||k===strands-1,points=[];
   // The foot: a root lying on the ground just in front of the ramp, then up the face.
   points.push(onRamp(0,offset*1.25+(rand()-.5)*.1).addScaledVector(out,.04).addScaledVector(uphill,-.22).setY(r.base+.03));
   for(let i=0;i<=14;i++){const t=i/14,twist=Math.sin(t*turns*Math.PI*2+phase),twistOut=Math.cos(t*turns*Math.PI*2+phase);
    const side=Math.max(-laneHalf+.08,Math.min(laneHalf-.08,offset+twist*.09));
    points.push(onRamp(t,side).addScaledVector(out,.06+Math.sin(Math.PI*t)*Math.min(.32,rise*.035)+twistOut*.045));}
   // Over the lip and a little way onto the head square, then a curl back down.
   const head=onRamp(1,offset*.8);points.push(head.clone().addScaledVector(uphill,.16).setY(r.height+.07),head.clone().addScaledVector(uphill,.42).addScaledVector(across,offset*.2).setY(r.height+.035));
   const curve=new THREE.CatmullRomCurve3(points,false,'catmullrom',.45),length=curve.getLength();
   const thick=(edgeStrand?.11:.085)-(k%3)*.01;appendTube(b.tube,curve,t=>Math.max(.02,thick*(1-t*.6)),{segments:Math.ceil(length*9),uvLength:length*1.4});
   report.strands++;
   // Leaves along it, both sides of the strand, facing out of the rock, drooping a little.
   const tangent=new THREE.Vector3(),at=new THREE.Vector3();
   for(let d=.06;d<length-.05;d+=.075+rand()*.05){
    const t=d/length;curve.getPointAt(t,at);curve.getTangentAt(t,tangent);
    for(const sideSign of [1,-1]){if(rand()<(edgeStrand?.08:.4))continue;
     const face=out.clone().addScaledVector(across,(rand()-.5)*.8).addScaledVector(UP,(rand()-.3)*.4).normalize();
     const stem=across.clone().multiplyScalar(sideSign*.9).addScaledVector(tangent,(rand()-.5)*.6).addScaledVector(UP,-.35-rand()*.3).addScaledVector(face,.25).normalize();
     const x=new THREE.Vector3().crossVectors(stem,face).normalize(),z=new THREE.Vector3().crossVectors(x,stem).normalize(),size=.12+rand()*.07;
     m.makeBasis(x,stem,z);q.setFromRotationMatrix(m);const pos=at.clone().addScaledVector(face,.03).addScaledVector(across,sideSign*.025);
     s.set(size*.9,size,size);m.compose(pos,q,s);b.leaves.push({matrix:m.clone(),color:new THREE.Color().setHSL(.25+rand()*.06,.42+rand()*.18,.30+rand()*.12)});report.leaves++;
     if(rand()<.035){const fq=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),face);const fs=.06+rand()*.03;
      b.flowers.push({matrix:new THREE.Matrix4().compose(pos.clone().addScaledVector(face,.04),fq,new THREE.Vector3(fs,fs,fs)),color:new THREE.Color(rand()<.5?'#f6c6e4':'#fbf3e8')});report.flowers++;}
    }
   }
  }
  // A mat of leaves over the whole lane between the strands, lying on the ramp's face, so the ramp reads as one
  // climbable mass and not ropes with sky between them.
  {const rows=Math.ceil((rise+run)*8),cols=Math.max(3,Math.round(laneHalf*2*6));
   for(let i=1;i<rows;i++)for(let j=0;j<cols;j++){if(rand()<.32)continue;const t=(i+rand()*.6)/rows,side=-laneHalf+.06+(laneHalf*2-.12)*(j+rand())/cols;
    const pos=onRamp(t,side).addScaledVector(out,.04+rand()*.05),face=out.clone().addScaledVector(across,(rand()-.5)*.6).addScaledVector(UP,(rand()-.5)*.3).normalize();
    const stem=new THREE.Vector3(rand()-.5,-.6-rand()*.4,rand()-.5).projectOnPlane(face).normalize(),x=new THREE.Vector3().crossVectors(stem,face).normalize(),z=new THREE.Vector3().crossVectors(x,stem).normalize(),size=.1+rand()*.07;
    m.makeBasis(x,stem,z);q.setFromRotationMatrix(m);s.set(size*.9,size,size);m.compose(pos,q,s);b.leaves.push({matrix:m.clone(),color:new THREE.Color().setHSL(.24+rand()*.07,.4+rand()*.2,.24+rand()*.12)});report.leaves++;}}
  report.vines++;
 }
 for(const [level,b] of perLevel){
  if(b.tube.positions.length){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(b.tube.positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(b.tube.normals,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(b.tube.uvs,2));g.setIndex(b.tube.indices);g.computeBoundingSphere();
   const mesh=new THREE.Mesh(g,barkMaterial);mesh.castShadow=mesh.receiveShadow=true;mesh.userData={level,category:'vine'};meshes.push(mesh);}
  for(const [list,geo,mat] of [[b.leaves,leafGeo,leafMaterial],[b.flowers,flowerGeo,flowerMaterial]]){if(!list.length)continue;
   const mesh=new THREE.InstancedMesh(geo,mat,list.length);list.forEach((item,i)=>{mesh.setMatrixAt(i,item.matrix);mesh.setColorAt(i,item.color);});mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData={level,category:'vine'};meshes.push(mesh);}
 }
 return {meshes,report};
}

/**
 * Ground cover for placements: 'ivy' spreads vine leaves low over the placement's footprint, 'flowers' a cluster of
 * small flowers with a few leaves. items: {kind,x,y,base,width,depth,height,level,id,colors?}.
 */
export function buildGroundCover(items,{leafMaterial,flowerMaterial}){
 const perLevel=new Map(),leafGeo=leafGeometry(),flowerGeo=flowerGeometry(),meshes=[],m=new THREE.Matrix4(),q=new THREE.Quaternion(),e=new THREE.Euler(),s=new THREE.Vector3();
 const bucket=level=>{if(!perLevel.has(level))perLevel.set(level,{leaves:[],flowers:[]});return perLevel.get(level);};
 for(const it of items){const rand=random(hashOf(it.id)),b=bucket(it.level),area=it.width*it.depth;
  const put=(list,x,y,z,tilt,size,color)=>{e.set(-Math.PI/2+tilt,rand()*Math.PI*2,0,'YXZ');q.setFromEuler(e);s.set(size,size,size);list.push({matrix:new THREE.Matrix4().compose(new THREE.Vector3(x,z,y),q,s),color});};
  const spot=()=>{const a=rand()*Math.PI*2,r=Math.sqrt(rand())*.5;return [it.x+Math.cos(a)*r*it.width,it.y+Math.sin(a)*r*it.depth];};
  if(it.kind==='ivy'){const n=Math.min(60,Math.round(10+area*16));for(let i=0;i<n;i++){const [x,y]=spot();put(b.leaves,x,y,it.base+.02+rand()*it.height*.8,(rand()-.5)*.9,.11+rand()*.08,new THREE.Color().setHSL(.24+rand()*.07,.4+rand()*.2,.25+rand()*.12));}}
  else{const n=Math.min(18,Math.round(4+area*14)),colors=it.colors||['#c99cff','#f2b3ea','#ffffff'];
   for(let i=0;i<n;i++){const [x,y]=spot(),z=it.base+.04+rand()*it.height;put(b.flowers,x,y,z,(rand()-.5)*.6,.07+rand()*.05,new THREE.Color(colors[Math.floor(rand()*colors.length)]));
    if(rand()<.7)put(b.leaves,x+(rand()-.5)*.1,y+(rand()-.5)*.1,it.base+.02,(rand()-.5)*1.2,.1+rand()*.05,new THREE.Color().setHSL(.27+rand()*.05,.45,.28));}}
 }
 for(const [level,b] of perLevel)for(const [list,geo,mat] of [[b.leaves,leafGeo,leafMaterial],[b.flowers,flowerGeo,flowerMaterial]]){if(!list.length)continue;
  const mesh=new THREE.InstancedMesh(geo,mat,list.length);list.forEach((item,i)=>{mesh.setMatrixAt(i,item.matrix);mesh.setColorAt(i,item.color);});mesh.receiveShadow=true;mesh.userData={level,category:'prop'};meshes.push(mesh);}
 return {meshes};
}
