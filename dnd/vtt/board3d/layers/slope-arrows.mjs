import * as THREE from 'three';
import {rampPlane} from '../../assets/js/ui/imported-ramps.mjs';

// The 2D board's slope arrows on the 3D board: on sloped ground (terrain-prototype.js drawCostMarkers, coloured by
// how steep the climb is) and up each ramp or vine (roof-renderer.js, green). Each arrow lies flat on the ground or
// ramp it marks, with the 2D arrow's sizes in squares, and points uphill. The viewer's own choice
// (terrainPrototype.markersVisible) shows or hides them all; a ramp's arrows go with the ramp above the Height cut.
const WIDTH=.026,LIFT=.03,RAMP_COLOR=[0x55,0x9e,0x5f];

export function createSlopeArrowsLayer({guideScene,helpers}){
 const root=new THREE.Group();root.name='vtt-slope-arrows';guideScene.add(root);
 const material=new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide,forceSinglePass:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,toneMapped:false});
 const colour=new THREE.Color();
 let mesh=null,signature='',seenTerrain='',marks=[],lastMarks=null,lastRamps=null,report={ground:0,ramps:0};
 function clear(){if(mesh){root.remove(mesh);mesh.geometry.dispose();mesh=null;}}
 function rebuild(marks,ramps){
  clear();report={ground:0,ramps:0};
  const positions=[],colors=[],a3=new THREE.Vector3(),b3=new THREE.Vector3(),along=new THREE.Vector3(),across=new THREE.Vector3();
  // An arrow lies flat on the slope at its middle (x,y), pointing uphill (ux,uy): on a cliff it stands up the cliff
  // face at its 2D size instead of being stretched down it. at(a,w) is the point a along the arrow and w across it,
  // lifted a little off the surface. World: x = column, y = height, z = row.
  const arrow=(x,y,ux,uy,heightAt,parts,rgb)=>{
   const middle=heightAt(x,y),slope=(heightAt(x+ux*.06,y+uy*.06)-heightAt(x-ux*.06,y-uy*.06))/.12,l=Math.hypot(1,slope);
   const dir=new THREE.Vector3(ux/l,slope/l,uy/l),side=new THREE.Vector3(-uy,0,ux),normal=new THREE.Vector3(-slope*ux/l,1/l,-slope*uy/l);
   const at=(a,w)=>new THREE.Vector3(x,middle,y).addScaledVector(dir,a).addScaledVector(side,w).addScaledVector(normal,LIFT);
   colour.setRGB(rgb[0]/255,rgb[1]/255,rgb[2]/255,THREE.SRGBColorSpace);
   // Each stroke is a flat band WIDTH wide, a little longer at each end as the 2D round caps are.
   for(const [[fa,fw],[ta,tw]] of parts){
    a3.copy(at(fa,fw));b3.copy(at(ta,tw));along.subVectors(b3,a3);const length=along.length();if(length<1e-6)continue;
    along.divideScalar(length);across.crossVectors(normal,along).multiplyScalar(WIDTH/2);along.multiplyScalar(WIDTH/2);
    const corners=[a3.clone().sub(along).add(across),a3.clone().sub(along).sub(across),b3.clone().add(along).sub(across),b3.clone().add(along).add(across)];
    for(const i of [0,1,2,0,2,3]){positions.push(corners[i].x,corners[i].y,corners[i].z);colors.push(colour.r,colour.g,colour.b);}
   }
  };
  // Ground: tail 0.055 behind the middle, tip 0.065 ahead, the head's sides 0.045 out from a point just behind it.
  const groundArrow=[[[-.055,0],[.065,0]],[[-.005,.045],[.065,0]],[[.065,0],[-.005,-.045]]];
  for(const m of marks){const l=Math.hypot(m.dx,m.dy)||1;arrow(m.x,m.y,m.dx/l,m.dy/l,(x,y)=>helpers.groundAt(x,y),groundArrow,m.color);report.ground++;}
  // Ramps: one arrow in each square along the middle of the ramp, as the 2D board draws them.
  const rampArrow=[[[-.05,0],[.06,0]],[[.015,.04],[.06,0]],[[.06,0],[.015,-.04]]];
  for(const s of ramps){
   const plane=rampPlane(s),length=Math.hypot(plane.a,plane.b);if(!(length>=.3))continue;
   const ux=plane.a/length,uy=plane.b/length,horizontal=Math.abs(plane.a)>0,start=horizontal?s.left:s.top,end=horizontal?s.right:s.bottom;
   const heightAt=(x,y)=>plane.a*x+plane.b*y+plane.c;
   for(let t=start+.5;t<end;t++){
    arrow(horizontal?t:(s.left+s.right)/2,horizontal?(s.top+s.bottom)/2:t,ux,uy,heightAt,rampArrow,RAMP_COLOR);report.ramps++;
   }
  }
  if(!positions.length)return;
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  mesh=new THREE.Mesh(geometry,material);mesh.renderOrder=6;mesh.frustumCulled=false;root.add(mesh);
 }
 function update(){
  const tp=window.terrainPrototype;if(!tp)return;
  const shown=tp.markersVisible!==false,level=helpers.shownLevel,ramps=helpers.ramps;
  // The ground's arrows are worked out again only when the terrain may have changed (slopeMarks keeps its list
  // while the ground is the same), and the mesh is built again only when what it shows has changed.
  const terrainKey=`${shown}|${tp.revision}`;
  if(terrainKey!==seenTerrain){seenTerrain=terrainKey;marks=shown?tp.slopeMarks?.()||[]:[];}
  const key=`${shown}|${level}|${helpers.gridSize}`;
  if(key===signature&&marks===lastMarks&&ramps===lastRamps)return;
  signature=key;lastMarks=marks;lastRamps=ramps;
  rebuild(marks,shown?(ramps||[]).filter(r=>level===null||level<0||(r.fromLevelIndex??0)<=level):[]);
 }
 const api={update,summary:()=>({...report,shown:!!mesh}),dispose(){clear();material.dispose();guideScene.remove(root);if(window.vtt3dLayers?.slopeArrows===api)delete window.vtt3dLayers.slopeArrows;}};
 (window.vtt3dLayers??={}).slopeArrows=api;return api;
}
