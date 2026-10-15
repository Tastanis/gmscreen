import * as THREE from 'three';

// Line-and-dot overlays on the 3D board (walls, stairs, ...). The GM's wall overlay is what wall-prototype.js draws in 2D
// (wall lines in their colours, dashed open/pass/broken walls, nodes, the line
// being drawn, breakable marks), as thin strokes at the heights it gives.
// Input is a list of primitives in squares and heights:
//  {kind:'line', points:[{x,y,z}], color, opacity, dash:null|[on,off]}
//  {kind:'dot', x,y,z, r, color, stroke, opacity}
export function createWallOverlayLayer({guideScene,helpers}){
 const root=new THREE.Group();root.name='vtt-wall-overlay';guideScene.add(root);
 const cylinder=new THREE.CylinderGeometry(1,1,1,6),ball=new THREE.SphereGeometry(1,10,8);
 const up=new THREE.Vector3(0,1,0),m=new THREE.Matrix4(),q=new THREE.Quaternion(),s=new THREE.Vector3(),p=new THREE.Vector3();
 let signature='',meshes=[],seen=null;
 const material=(color,opacity)=>{const mat=new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthTest:true,depthWrite:false,toneMapped:false});const ghost=mat.clone();ghost.depthFunc=THREE.GreaterDepth;ghost.opacity=opacity*.35;return [mat,ghost];};
 function clear(){for(const mesh of meshes){root.remove(mesh);mesh.material.dispose();}meshes=[];}
 function add(geometry,matrices,color,opacity){
  if(!matrices.length)return;
  for(const mat of material(color,opacity)){const mesh=new THREE.InstancedMesh(geometry,mat,matrices.length);matrices.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));mesh.renderOrder=7;mesh.frustumCulled=false;root.add(mesh);meshes.push(mesh);}
 }
 function set(list){
  const next=JSON.stringify(list||[]);if(next===signature)return;signature=next;clear();
  // Group by colour and opacity so a map of hundreds of walls stays a few draw calls.
  const groups=new Map(),key=(kind,color,opacity)=>`${kind}|${color}|${opacity}`;
  const push=(kind,color,opacity,matrix)=>{const k=key(kind,color,opacity);if(!groups.has(k))groups.set(k,{kind,color,opacity,matrices:[]});groups.get(k).matrices.push(matrix.clone());};
  const width=.045;
  for(const item of list||[]){
   if(item.kind==='line'){
    const pts=(item.points||[]).filter(v=>Number.isFinite(v?.x)&&Number.isFinite(v?.y)&&Number.isFinite(v?.z)).map(v=>new THREE.Vector3(v.x,v.z+.04,v.y));
    for(let i=1;i<pts.length;i++){
     const a=pts[i-1],b=pts[i],length=a.distanceTo(b);if(length<1e-6)continue;
     const dir=b.clone().sub(a).divideScalar(length);q.setFromUnitVectors(up,dir);
     const [on,off]=item.dash||[length,0];
     for(let t=0;t<length;t+=on+off){const piece=Math.min(on,length-t);if(piece<=0)break;p.copy(a).addScaledVector(dir,t+piece/2);s.set(width,piece,width);m.compose(p,q,s);push('line',item.color,item.opacity??1,m);}
    }
   }else if(item.kind==='dot'){p.set(item.x,item.z+.05,item.y);const r=item.r??.09;s.set(r,r,r);m.compose(p,new THREE.Quaternion(),s);push('dot',item.color,item.opacity??1,m);
    if(item.stroke){s.set(r*1.35,r*1.35,r*1.35);m.compose(p,new THREE.Quaternion(),s);push('dot',item.stroke,(item.opacity??1)*.6,m);}}
  }
  for(const g of groups.values())add(g.kind==='line'?cylinder:ball,g.matrices,g.color,g.opacity);
 }
 return {
  update(){const version=window.vtt3d?.overlaysVersion;if(version===seen)return;seen=version;const all=[];for(const list of window.vtt3d?.overlays?.values?.()||[])all.push(...list);set(all);void helpers;},
  dispose(){clear();guideScene.remove(root);cylinder.dispose();ball.dispose();},
 };
}
