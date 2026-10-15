import * as THREE from 'three';

// Shared painting for board overlays that lie on the board (zones, terrain zones, auras): square-aligned
// rectangles in squares, filled and outlined, lying flat at a height or on the ground under them.
// `at(x, y)` gives the surface height (squares) at a point.

export function parseColor(value,fallback='#ffffff'){
 const text=String(value||fallback).trim(),m=text.match(/^rgba?\(([^)]+)\)$/i),color=new THREE.Color();
 if(m){const [r,g,b,a=1]=m[1].split(/[,\s/]+/).filter(Boolean).map(Number);if([r,g,b].every(Number.isFinite)){color.setRGB(r/255,g/255,b/255,THREE.SRGBColorSpace);return {color,alpha:Number.isFinite(a)?a:1};}}
 try{color.setStyle(text);return {color,alpha:1};}catch{return parseColor(fallback);}
}

/** Triangles covering a rectangle, fine enough to follow the ground. */
export function rectFill(rect,at,lift=.05,step=.5){
 const out=[],nx=Math.max(1,Math.ceil(rect.width/step)),ny=Math.max(1,Math.ceil(rect.height/step));
 const v=(i,j)=>{const x=rect.column+rect.width*i/nx,y=rect.row+rect.height*j/ny;return [x,at(x,y)+lift,y];};
 for(let i=0;i<nx;i++)for(let j=0;j<ny;j++){const a=v(i,j),b=v(i+1,j),c=v(i+1,j+1),d=v(i,j+1);out.push(...a,...b,...c,...a,...c,...d);}
 return out;
}

/**
 * A band along a rectangle's edge, inside it as a CSS border is: `width` and `dash` ([on, off]) in squares.
 * With `fade`, the band is a glow: full at the edge, nothing at its inner side (vertex alpha in `alphas`).
 */
export function rectBorder(rect,at,{width,lift=.062,dash=null,step=.1,alphas=null}){
 const out=[],w=Math.min(width,rect.width/2,rect.height/2);
 const edges=[[[0,0],[1,0],[0,1]],[[1,0],[1,1],[-1,0]],[[1,1],[0,1],[0,-1]],[[0,1],[0,0],[1,0]]];
 for(const [[ax,ay],[bx,by],[nx,ny]] of edges){
  const x0=rect.column+ax*rect.width,y0=rect.row+ay*rect.height,x1=rect.column+bx*rect.width,y1=rect.row+by*rect.height;
  const len=Math.hypot(x1-x0,y1-y0),n=Math.max(1,Math.ceil(len/(dash?Math.min(step,dash[0]/2):step))),dx=(x1-x0)/len,dy=(y1-y0)/len;
  for(let k=0;k<n;k++){
   const t0=len*k/n,t1=len*(k+1)/n;if(dash&&((t0+t1)/2)%(dash[0]+dash[1])>dash[0])continue;
   // Corners are mitred: the inner side is shortened by the band's width at each end.
   const s0=Math.min(Math.max(t0,w),len-w),s1=Math.max(Math.min(t1,len-w),w);
   const o0={x:x0+dx*t0,y:y0+dy*t0},o1={x:x0+dx*t1,y:y0+dy*t1},i0={x:x0+dx*s0+nx*w,y:y0+dy*s0+ny*w},i1={x:x0+dx*s1+nx*w,y:y0+dy*s1+ny*w};
   const p=q=>[q.x,at(q.x,q.y)+lift,q.y];
   out.push(...p(o0),...p(i0),...p(o1),...p(i0),...p(i1),...p(o1));
   if(alphas)alphas.push(1,0,1,0,0,1);
  }
 }
 return out;
}

export function overlayMesh(positions,{color,opacity,order=2,ghost=false,alphas=null}){
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 const material=new THREE.MeshBasicMaterial({color,transparent:true,opacity,side:THREE.DoubleSide,forceSinglePass:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3,toneMapped:false});
 if(alphas){
  // Per-vertex alpha for a glow band.
  geometry.setAttribute('fade',new THREE.Float32BufferAttribute(alphas,1));
  material.onBeforeCompile=shader=>{
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float fade;\nvarying float vFade;').replace('#include <begin_vertex>','#include <begin_vertex>\nvFade=fade;');
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float vFade;').replace('#include <opaque_fragment>','#include <opaque_fragment>\ngl_FragColor.a*=vFade;');
  };
 }
 if(ghost){material.depthFunc=THREE.GreaterDepth;material.opacity=opacity*.3;}
 const mesh=new THREE.Mesh(geometry,material);mesh.renderOrder=order;mesh.frustumCulled=false;return mesh;
}

/** Remove and free a group's children. */
export function clearGroup(group){for(const child of [...group.children]){group.remove(child);child.geometry?.dispose();for(const m of [child.material].flat())m?.dispose?.();}}

/** The 2D board is zoomed as a whole: a square's projected size over the grid size is that zoom here. */
export function zoomAt(helpers,x,y,z){
 const a=helpers.project({x,y,z}),b=helpers.project({x:x+1,y,z}),c=helpers.project({x,y:y+1,z});if(!a||!b||!c)return 1;
 return Math.max(.05,Math.min(4,Math.max(Math.hypot(b.x-a.x,b.y-a.y),Math.hypot(c.x-a.x,c.y-a.y))/helpers.gridSize));
}

/** A key that changes when the camera or the canvas does. */
export function cameraKey(view){const c=view.camera,d=view.renderer.domElement;return `${c.matrixWorld.elements.join(',')}|${c.projectionMatrix.elements[0]}|${d.clientWidth}|${d.clientHeight}`;}

/**
 * Hides pinned page elements (labels, badges) whose anchor is behind scenery, as the board in front would hide
 * them. A ray from the camera to each anchor meets the nearest scene surface (vtt3dRenderer.view.castRay); the
 * anchors are looked at in turn within a small time budget per frame, and again only after the camera moves.
 */
export function createOcclusionPass(view,{budgetMs=1.2,margin=.3}={}){
 const ray=new THREE.Raycaster(),dir=new THREE.Vector3(),to=new THREE.Vector3();let queue=[],dirty=true,seenKey='';
 function hidden(p){const from=view.camera.position;to.set(p.x,p.z,p.y);dir.copy(to).sub(from);const distance=dir.length();if(distance<1e-3)return false;dir.divideScalar(distance);ray.set(from,dir);ray.far=distance;const hit=view.castRay?.(ray);return !!hit&&hit.distance<distance-margin;}
 return {
  // items: [{el, anchor:{x,y,z}}]; `key` changes with the camera and with the items.
  update(items,key){
   if(key!==seenKey){seenKey=key;dirty=true;}
   if(!queue.length&&dirty){dirty=false;queue=items.slice();}
   const start=performance.now();
   while(queue.length&&performance.now()-start<budgetMs){const item=queue.pop();if(!item.el.isConnected||item.el.style.visibility==='hidden')continue;const next=hidden(item.anchor)?'none':'';if(item.el.style.display!==next)item.el.style.display=next;}
  },
 };
}
