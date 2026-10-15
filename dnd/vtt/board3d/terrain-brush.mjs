import * as THREE from 'three';

// The Height tool's brush on the 3D board: a ring lying on the ground under the
// pointer, the size of the brush (terrain-prototype.js publishes `brush3d`).
export function createTerrainBrushLayer({guideScene,helpers}){
 const segments=72,positions=new Float32Array((segments+1)*3),geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
 const material=new THREE.LineBasicMaterial({color:'#fff0ba',transparent:true,opacity:.95,depthTest:false,toneMapped:false});
 const ring=new THREE.Line(geometry,material);ring.renderOrder=8;ring.frustumCulled=false;ring.visible=false;guideScene.add(ring);
 let last='';
 return {
  update(){
   const brush=window.terrainPrototype?.brush3d;
   if(!brush){ring.visible=false;last='';return;}
   const centre=helpers.toSquares(brush.x,brush.y),key=[centre.x.toFixed(3),centre.y.toFixed(3),brush.radius,window.terrainPrototype?.fieldVersion].join(',');
   ring.visible=true;if(key===last)return;last=key;
   for(let i=0;i<=segments;i++){const a=i/segments*Math.PI*2,x=centre.x+Math.cos(a)*brush.radius,y=centre.y+Math.sin(a)*brush.radius;positions.set([x,helpers.groundAt(x,y)+.06,y],i*3);}
   geometry.attributes.position.needsUpdate=true;geometry.computeBoundingSphere();
  },
  dispose(){guideScene.remove(ring);geometry.dispose();material.dispose();},
 };
}
