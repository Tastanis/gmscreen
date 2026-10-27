import * as THREE from 'three';
import {prepareCollapse,collapsedRoute,collapseProgress} from './route-collapse.mjs';

// Presentation only: the caller supplies the native VTT's sampled route,
// slope colors, difficult-square spans, and climb annotations. No pathfinding,
// terrain classification, distance, or movement-cost rules live here.
export function createMovementRoute(scene,camera,canvas){
 const root=new THREE.Group();root.name='vtt-native-movement-route';scene.add(root);
 // Render after scenery, retaining its depth: clear spans are solid and
 // occluded spans remain readable at 32 percent opacity.
 const ordinary=new THREE.MeshBasicMaterial({vertexColors:true,depthTest:true,depthWrite:false,transparent:true,toneMapped:false});
 const difficult=new THREE.MeshBasicMaterial({color:'#ef4444',depthTest:true,depthWrite:false,transparent:true,toneMapped:false});
 const halo=new THREE.MeshBasicMaterial({color:'#ffffff',depthTest:true,depthWrite:false,transparent:true,opacity:.65,toneMapped:false});
 const hiddenMaterials=new Map();
 function faded(material){let ghost=hiddenMaterials.get(material);if(!ghost){ghost=material.clone();ghost.depthFunc=THREE.GreaterDepth;ghost.transparent=true;ghost.opacity=material.opacity*.32;hiddenMaterials.set(material,ghost);}return ghost;}
 const cylinder=new THREE.CylinderGeometry(1,1,1,8).toNonIndexed(),ball=new THREE.SphereGeometry(1,8,6).toNonIndexed(),cone=new THREE.ConeGeometry(1,1,12).toNonIndexed();
 const up=new THREE.Vector3(0,1,0),matrix=new THREE.Matrix4(),rotation=new THREE.Quaternion(),scratch=new THREE.Vector3();
 const labelAssets=new Map(),labels=[],motion=window.matchMedia('(prefers-reduced-motion: reduce)');
 let signature='',clock=0,summary={pieces:0,difficult:0,climbs:0};
 const valid=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z);
 const point=(p,lift=.24)=>new THREE.Vector3(p.x,p.z+lift,p.y);
 function append(target,geometry,position,scale,quaternion,color){
  matrix.compose(position,quaternion,scale);const a=geometry.attributes.position;
  for(let i=0;i<a.count;i++){scratch.fromBufferAttribute(a,i).applyMatrix4(matrix);target.positions.push(scratch.x,scratch.y,scratch.z);if(color)target.colors.push(color.r,color.g,color.b);}
 }
 function stroke(target,points,width,color,{caps=true,lift=.24}={}){
  const vertices=points.filter(valid).map(p=>point(p,lift));
  for(let i=1;i<vertices.length;i++){
   const a=vertices[i-1],b=vertices[i],delta=b.clone().sub(a),length=delta.length();if(length<1e-6)continue;
   rotation.setFromUnitVectors(up,delta.divideScalar(length));append(target,cylinder,a.clone().add(b).multiplyScalar(.5),new THREE.Vector3(width/2,length,width/2),rotation,color);
  }
  for(let i=caps?0:1;i<vertices.length-(caps?0:1);i++)append(target,ball,vertices[i],new THREE.Vector3(width/2,width/2,width/2),new THREE.Quaternion(),color);
 }
 function mesh(target,material,name,order){
  if(!target.positions.length)return;const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(target.positions,3));
  if(target.colors.length)geometry.setAttribute('color',new THREE.Float32BufferAttribute(target.colors,3));
  geometry.computeBoundingSphere();const result=new THREE.Mesh(geometry,material);result.name=name;result.renderOrder=order;root.add(result);const ghost=new THREE.Mesh(geometry,faded(material));ghost.name=name+'-occluded';ghost.renderOrder=order;root.add(ghost);
 }
 function label(text,at,kind){
  if(!valid(at))return;const key=kind+':'+text;let asset=labelAssets.get(key);
  // Ruler words: difficult (×N, red edge), climb (amber), leg lengths and the total (white on dark, like the 2D ruler).
  const style={climb:['#fbbf24','#451a03'],difficult:['#ffffff','#7f1d1d'],leg:['#f8fafc','#1f2937'],total:['#ffffff','#111827']}[kind]||['#ffffff','#111827'];
  if(!asset){const image=document.createElement('canvas'),ctx=image.getContext('2d'),font='800 74px Inter, system-ui, sans-serif';ctx.font=font;const width=Math.max(256,Math.ceil(ctx.measureText(text).width+48));image.width=width;image.height=128;ctx.font=font;ctx.clearRect(0,0,width,128);ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineJoin='round';ctx.lineWidth=12;ctx.strokeStyle=style[1];ctx.fillStyle=style[0];ctx.strokeText(text,width/2,66);ctx.fillText(text,width/2,66);
   const texture=new THREE.CanvasTexture(image);texture.colorSpace=THREE.SRGBColorSpace;const material=new THREE.SpriteMaterial({map:texture,depthTest:true,depthWrite:false,toneMapped:false});asset={texture,material,aspect:width/128};labelAssets.set(key,asset);}
  const lift=kind==='total'?2.15:kind==='leg'?.7:.46,sprite=new THREE.Sprite(asset.material);sprite.position.copy(point(at,lift));sprite.scale.set(1,.5,1);sprite.renderOrder=1003;sprite.name=`vtt-${kind}-label`;sprite.userData={text,at:{...at},kind,aspect:asset.aspect,size:kind==='total'?20:kind==='leg'?14:16};root.add(sprite);labels.push(sprite);const ghost=sprite.clone();ghost.material=faded(asset.material);ghost.name=sprite.name+'-occluded';root.add(ghost);labels.push(ghost);
 }
 function clear(){const geometries=new Set();for(const child of [...root.children]){root.remove(child);if(child.geometry)geometries.add(child.geometry);}for(const geometry of geometries)geometry.dispose();labels.length=0;}
 // A token just put down: its line shrinks from the start toward where it went (route-collapse.mjs). While it does,
 // the board's empty ruler (set(null) every frame) leaves it alone; a new line ends it at once.
 let collapsing=null;
 function collapse(payload){
  collapsing=null;const prepared=payload&&!motion.matches?prepareCollapse(payload):null;
  if(!prepared){set(null);return;}
  collapsing={prepared,start:performance.now()};signature='collapsing';draw(collapsedRoute(prepared,0));
 }
 function set(payload){
  if(collapsing){if(!payload)return;collapsing=null;}
  const next=JSON.stringify(payload||null);if(next===signature)return;signature=next;draw(payload);
 }
 function draw(payload){
  clear();
  summary={pieces:0,difficult:0,climbs:0};root.userData={...summary,payload:payload||null};if(!payload){root.visible=false;return;}root.visible=true;
  const normal={positions:[],colors:[]},red={positions:[],colors:[]},outline={positions:[],colors:[]};let last=null;
  for(const piece of payload.pieces||[]){const points=(piece.points||[]).filter(valid);if(points.length<2)continue;const color=new THREE.Color(piece.color||'#111111');stroke(normal,points,.32,color);stroke(outline,points,.48,null);last={points,color};summary.pieces++;}
  if(last){const end=point(last.points.at(-1)),before=point(last.points.at(-2)),direction=end.clone().sub(before).normalize();if(direction.lengthSq()){rotation.setFromUnitVectors(up,direction);append(normal,cone,end.clone().addScaledVector(direction,-.192),new THREE.Vector3(.32,.64,.32),rotation,last.color);}}
  for(const step of payload.difficult||[]){const points=(step.points||[]).filter(valid);if(points.length<2)continue;stroke(red,points,.34,null,{caps:false,lift:.26});label(`×${step.multiplier}`,step.at,'difficult');summary.difficult++;}
  for(const climb of payload.climbs||[]){label(climb.label||'×2',climb.at,'climb');summary.climbs++;}
  // Corner dots (the arrowhead marks the end), leg lengths, and the total above
  // where the token will stand, as the 2D ruler draws them.
  const dots={positions:[],colors:[]};for(const node of (payload.nodes||[]).slice(0,-1).filter(valid))append(dots,ball,point(node,.26),new THREE.Vector3(.17,.17,.17),new THREE.Quaternion(),new THREE.Color('#f8fafc'));
  mesh(dots,ordinary,'vtt-route-nodes',1002);
  for(const leg of payload.legs||[])if(leg?.text)label(leg.text,leg.at,'leg');
  if(payload.total?.text)label(payload.total.text,payload.total.at,'total');
  mesh(outline,halo,'vtt-route-halo',1000);mesh(normal,ordinary,'vtt-terrain-route',1001);mesh(red,difficult,'vtt-difficult-route',1002);root.userData={...summary,payload};
 }
 function update(dt){
  if(collapsing){const {prepared,start}=collapsing,shape=collapsedRoute(prepared,collapseProgress((performance.now()-start)/1000,prepared.duration));
   if(shape)draw(shape);else{collapsing=null;signature='null';draw(null);}}
  if(!root.visible)return;clock+=(Number.isFinite(dt)?dt:0);difficult.opacity=motion.matches?1:.65+.35*Math.cos(clock*Math.PI*2/.9);
  for(const [material,ghost] of hiddenMaterials)ghost.opacity=material.opacity*.32;
  // Billboard text retains the native ruler's minimum readable label size.
  const worldPerPixel=2*Math.tan(THREE.MathUtils.degToRad(camera.fov*.5))/Math.max(1,canvas.clientHeight);
  for(const sprite of labels){const height=Math.max(.35,camera.position.distanceTo(sprite.position)*worldPerPixel*(sprite.userData.size||16));sprite.scale.set(height*(sprite.userData.aspect||2),height,1);}
 }
 function dispose(){clear();scene.remove(root);for(const geometry of [cylinder,ball,cone])geometry.dispose();ordinary.dispose();difficult.dispose();halo.dispose();for(const material of hiddenMaterials.values())material.dispose();hiddenMaterials.clear();for(const asset of labelAssets.values()){asset.texture.dispose();asset.material.dispose();}labelAssets.clear();}
 set(null);return {set,collapse,update,dispose,summary:()=>({...summary}),collapsing:()=>!!collapsing};
}
