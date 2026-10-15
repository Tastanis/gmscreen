import * as THREE from 'three';
import {getDrawingView,drawingViewRevision,drawingFloorHeight} from '../../assets/js/ui/drawing-tool.js';
import {rampHeight} from '../../assets/js/ui/imported-ramps.mjs';

// Hand drawings on the 3D board (drawing-tool.js keeps the strokes, the rules and the input).
// A stroke lies on what it was drawn on: a floor's plane at its height (`z`, or its level's
// height), otherwise the ground under it, following hills and stairs. Its width, colour, round
// ends and the curve through its points are the 2D board's. Behind scenery a stroke shows
// faintly, as the movement route does; the brush circle lies where the pointer is.
const LIFT=.04,STEP=.2;

// The 2D board's path: straight to the first midpoint, a quadratic through each point to the next
// midpoint, straight to the end (drawing-tool.js updatePathFromPoints). Map pixels in and out.
function curve(points){
 if(points.length<3)return points.map(p=>({x:p.x,y:p.y}));
 const mid=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2}),out=[{x:points[0].x,y:points[0].y},mid(points[0],points[1])];
 for(let i=1;i<points.length-1;i++){
  const a=mid(points[i-1],points[i]),c=points[i],b=mid(points[i],points[i+1]);
  const n=Math.max(2,Math.min(10,Math.ceil((Math.hypot(c.x-a.x,c.y-a.y)+Math.hypot(b.x-c.x,b.y-c.y))/6)));
  for(let k=1;k<=n;k++){const t=k/n,u=1-t;out.push({x:u*u*a.x+2*u*t*c.x+t*t*b.x,y:u*u*a.y+2*u*t*c.y+t*t*b.y});}
 }
 const last=points[points.length-1];out.push({x:last.x,y:last.y});return out;
}

export function createDrawingsLayer({guideScene,helpers}){
 const root=new THREE.Group();root.name='vtt-drawings';guideScene.add(root);
 const solid=new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide,forceSinglePass:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4,toneMapped:false});
 const ghost=solid.clone();ghost.depthFunc=THREE.GreaterDepth;ghost.transparent=true;ghost.opacity=.3;
 const meshes={};
 for(const name of ['strokes','current']){
  const geometry=new THREE.BufferGeometry(),a=new THREE.Mesh(geometry,solid),b=new THREE.Mesh(geometry,ghost);
  a.renderOrder=b.renderOrder=name==='current'?3:2;a.frustumCulled=b.frustumCulled=false;a.name=`vtt-drawings-${name}`;root.add(a,b);meshes[name]={geometry,a,b};
 }
 // Brush / eraser circle: the 2D board's dashed ring and light fill (board.css .vtt-cursor-indicator).
 const ringGeometry=new THREE.BufferGeometry().setFromPoints(Array.from({length:65},(_,i)=>{const t=i/64*Math.PI*2;return new THREE.Vector3(Math.cos(t),0,Math.sin(t));}));
 const ringMaterial=new THREE.LineDashedMaterial({color:'#ff0000',dashSize:.1,gapSize:.07,transparent:true,depthTest:false,depthWrite:false,toneMapped:false});
 const ring=new THREE.Line(ringGeometry,ringMaterial);ring.computeLineDistances();
 const discGeometry=new THREE.CircleGeometry(1,48);discGeometry.rotateX(-Math.PI/2);
 const disc=new THREE.Mesh(discGeometry,new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:.15,depthTest:false,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true,toneMapped:false}));
 const cursor=new THREE.Group();cursor.name='vtt-drawing-cursor';cursor.add(disc,ring);cursor.visible=false;ring.renderOrder=disc.renderOrder=7;root.add(cursor);

 const color=new THREE.Color();
 // Height of the surface a stroke lies on at a point (squares): its floor, or the ground with the
 // stairs and vines on it (the one nearest the height the stroke has reached).
 function surface(drawing){
  const floor=drawingFloorHeight(drawing);if(floor!==null)return {floor,at:()=>floor};
  // A stroke begun on a vine or stair starts at the height it was begun at (its z), and follows that surface.
  const ramps=window.wallPrototype?.model?.ramps||[];let previous=drawing.z>0?drawing.z:null;
  return {floor:null,at(x,y){
   let best=helpers.groundAt(x,y);
   if(ramps.length){const candidates=[best];for(const r of ramps){const h=rampHeight(r,x,y);if(h!==null)candidates.push(h);}
    if(candidates.length>1&&previous!==null)best=candidates.reduce((a,b)=>Math.abs(b-previous)<Math.abs(a-previous)?b:a);}
   previous=best;return best;}};
 }
 function shownOn3d(drawing){
  const shown=helpers.shownLevel;if(shown===null||shown<0)return true;
  const floor=drawingFloorHeight(drawing);if(floor===null)return true;
  const level=(helpers.context.levels||[]).find(l=>Math.abs(Number(l.elevationSquares)-floor)<.01);
  return level?helpers.levelIndex(level.id)<=shown:true;
 }
 // One flat ribbon per stroke, mitred at each point, with round ends and round corners.
 function addStroke(drawing,positions,colors){
  const g=helpers.gridSize,half=Math.max(.5,(Number(drawing.strokeWidth)||3)/2)/g;
  const pts=[];for(const p of curve(drawing.points)){const q=helpers.toSquares(p.x,p.y);const last=pts[pts.length-1];if(!last||Math.hypot(q.x-last.x,q.y-last.y)>1e-4)pts.push(q);}
  if(!pts.length)return;
  const ground=surface(drawing),dense=[];
  if(ground.floor===null){for(let i=0;i<pts.length;i++){if(i){const a=pts[i-1],b=pts[i],n=Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/STEP);for(let k=1;k<n;k++)dense.push({x:a.x+(b.x-a.x)*k/n,y:a.y+(b.y-a.y)*k/n});}dense.push(pts[i]);}}
  else dense.push(...pts);
  for(const p of dense)p.h=ground.at(p.x,p.y)+LIFT;
  color.set(drawing.color||'#ff0000');const {r,g:gg,b}=color;
  const vertex=(x,h,y)=>{positions.push(x,h,y);colors.push(r,gg,b);};
  const height=(x,y,fallback)=>ground.floor===null?ground.at(x,y)+LIFT:fallback;
  const fan=(c,from,to,steps)=>{for(let k=0;k<steps;k++){const a=from+(to-from)*k/steps,b=from+(to-from)*(k+1)/steps,ax=c.x+Math.cos(a)*half,ay=c.y+Math.sin(a)*half,bx=c.x+Math.cos(b)*half,by=c.y+Math.sin(b)*half;
   vertex(c.x,c.h,c.y);vertex(ax,height(ax,ay,c.h),ay);vertex(bx,height(bx,by,c.h),by);}};
  if(dense.length===1){fan(dense[0],0,Math.PI*2,16);return;}
  const dir=i=>{const a=dense[Math.max(0,i-1)],b=dense[Math.min(dense.length-1,i+1)],l=Math.hypot(b.x-a.x,b.y-a.y)||1;return {x:(b.x-a.x)/l,y:(b.y-a.y)/l};};
  const side=[];
  for(let i=0;i<dense.length;i++){
   const p=dense[i],d=dir(i);let scale=1;
   if(i>0&&i<dense.length-1){const s=dense[i+1],l=Math.hypot(s.x-p.x,s.y-p.y)||1,dot=(-d.y)*(-(s.y-p.y)/l)+d.x*((s.x-p.x)/l);scale=1/Math.max(.5,dot);}
   const nx=-d.y*half*scale,ny=d.x*half*scale;
   side.push([{x:p.x+nx,y:p.y+ny},{x:p.x-nx,y:p.y-ny}]);
  }
  for(let i=0;i<dense.length-1;i++){
   const [l0,r0]=side[i],[l1,r1]=side[i+1],h0=dense[i].h,h1=dense[i+1].h;
   const L0=height(l0.x,l0.y,h0),R0=height(r0.x,r0.y,h0),L1=height(l1.x,l1.y,h1),R1=height(r1.x,r1.y,h1);
   vertex(l0.x,L0,l0.y);vertex(r0.x,R0,r0.y);vertex(l1.x,L1,l1.y);vertex(r0.x,R0,r0.y);vertex(r1.x,R1,r1.y);vertex(l1.x,L1,l1.y);
  }
  // Round corners where the stroke turns sharply, and round ends.
  for(let i=1;i<dense.length-1;i++){const a=dense[i-1],p=dense[i],b=dense[i+1],t1=Math.atan2(p.y-a.y,p.x-a.x),t2=Math.atan2(b.y-p.y,b.x-p.x);let turn=Math.abs(t2-t1);if(turn>Math.PI)turn=Math.PI*2-turn;if(turn>.5)fan(p,0,Math.PI*2,12);}
  const s=dense[0],s1=dense[1],e=dense[dense.length-1],e1=dense[dense.length-2];
  const ts=Math.atan2(s.y-s1.y,s.x-s1.x),te=Math.atan2(e.y-e1.y,e.x-e1.x);
  fan(s,ts-Math.PI/2,ts+Math.PI/2,8);fan(e,te-Math.PI/2,te+Math.PI/2,8);
 }
 function fill(name,list){
  const positions=[],colors=[];for(const drawing of list){try{addStroke(drawing,positions,colors);}catch(error){console.error('[VTT 3D] drawing',drawing?.id,error);}}
  const {geometry,a,b}=meshes[name];
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeBoundingSphere();
  a.visible=b.visible=positions.length>0;return positions.length/9;
 }
 let revision=-1,strokesKey='',currentKey='',report={strokes:0,triangles:0,current:0};
 function update(){
  const now=drawingViewRevision(),levelKey=`${helpers.shownLevel}:${window.terrainPrototype?.revision}:${(window.wallPrototype?.model?.ramps||[]).length}`;
  if(now===revision&&levelKey===strokesKey.split('|')[0])return;
  revision=now;const view=getDrawingView();if(!view)return;
  const shown=view.drawings.filter(shownOn3d),key=levelKey+'|'+shown.map(d=>d.id+':'+(d._entityRevision??'')+':'+d.points.length).join(',');
  if(key!==strokesKey){strokesKey=key;report.triangles=fill('strokes',shown);report.strokes=shown.length;}
  const current=view.current&&view.current.points.length&&shownOn3d(view.current)?view.current:null,ck=current?`${current.points.length}:${current.color}:${current.strokeWidth}:${current.z}`:'';
  if(ck!==currentKey){currentKey=ck;report.current=current?fill('current',[current]):fill('current',[]);}
  const c=view.cursor;cursor.visible=!!(view.active&&c&&Number.isFinite(c.height));
  if(cursor.visible){const p=helpers.toSquares(c.x,c.y),radius=Math.max(.5,view.strokeWidth/2)/helpers.gridSize;cursor.position.set(p.x,c.height+LIFT+.01,p.y);cursor.scale.set(radius,1,radius);
   ringMaterial.color.set(view.erase?'#ffffff':view.color);ringMaterial.opacity=view.erase?.8:1;ringMaterial.dashSize=4/helpers.gridSize/radius;ringMaterial.gapSize=3/helpers.gridSize/radius;disc.material.opacity=view.erase?.1:.15;}
 }
 // While drawing, the board's own cursor is hidden as on the 2D board (board.css .vtt-board__drawings).
 const style=document.createElement('style');style.textContent='.vtt3d-on #vtt-map-surface:has(#vtt-drawing-layer[data-drawing-active="true"]){cursor:none!important}';document.head.append(style);
 const api={update,summary:()=>({...report}),dispose(){if(window.vtt3dLayers?.drawings===api)delete window.vtt3dLayers.drawings;style.remove();guideScene.remove(root);for(const m of Object.values(meshes))m.geometry.dispose();solid.dispose();ghost.dispose();ringGeometry.dispose();ringMaterial.dispose();discGeometry.dispose();disc.material.dispose();}};
 (window.vtt3dLayers??={}).drawings=api;return api;
}
