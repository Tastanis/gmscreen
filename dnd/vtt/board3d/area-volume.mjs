import * as THREE from 'three';

// Areas as see-through volumes, for templates, persistent zones and ability areas alike.
// An area is a set of squares; each square is a column from its own surface (`baseAt(column, row)`) up to
// base + `height`. The columns are drawn as one shape: side faces only where the next square is outside
// the area or its column is a different height, a top on every column and a footprint tile at its foot.
// Faces are translucent and drawn after the scene; bright edges (about 2 px on screen) run along the
// outline at the top and the foot and up the outline's corners, full where seen and faint behind scenery.
// World units: 1 = a square; x = column, z = row, y = height.

const FACE={side:.16,top:.22,foot:.16},PREVIEW=.5,SELECTED=1.35,HIDDEN_EDGE=.35;

/** A clean, saturated pair from any colour: a lighter edge and a deeper fill. */
export function areaColors(value,fallback='#38bdf8'){
 const color=new THREE.Color();
 const text=String(value||fallback).trim(),m=text.match(/^rgba?\(([^)]+)\)$/i);
 try{if(m){const [r,g,b]=m[1].split(/[,\s/]+/).filter(Boolean).map(Number);color.setRGB(r/255,g/255,b/255,THREE.SRGBColorSpace);}else color.setStyle(text);}catch{color.setStyle(fallback);}
 const hsl={};color.getHSL(hsl,THREE.SRGBColorSpace);
 // Greys and browns become their hue at full colour; a colourless grey becomes the fallback's hue.
 if(hsl.s<.12){const f=new THREE.Color(fallback),fh={};f.getHSL(fh,THREE.SRGBColorSpace);hsl.h=fh.h;}
 const edge=new THREE.Color().setHSL(hsl.h,Math.max(.85,hsl.s),.7,THREE.SRGBColorSpace);
 const fill=new THREE.Color().setHSL(hsl.h,Math.max(.8,hsl.s),.48,THREE.SRGBColorSpace);
 return {edge,fill};
}

// ---- Edges about `width` px wide on screen: each segment is a quad turned to face the screen in the shader.
const lineVertex=`
uniform vec2 uResolution;uniform float uWidth;attribute vec3 aOther;attribute float aSide;attribute float aDist;varying float vDist;
void main(){
 vec4 a=projectionMatrix*modelViewMatrix*vec4(position,1.0),b=projectionMatrix*modelViewMatrix*vec4(aOther,1.0);
 vec2 sa=a.xy/max(abs(a.w),1e-5),sb=b.xy/max(abs(b.w),1e-5),d=(sb-sa)*uResolution;float l=length(d);vec2 dir=l>1e-6?d/l:vec2(1.0,0.0);
 a.xy+=vec2(-dir.y,dir.x)*aSide*uWidth/uResolution*a.w;gl_Position=a;vDist=aDist;}`;
const lineFragment=`
uniform vec3 uColor;uniform float uOpacity;uniform float uDash;uniform float uGap;varying float vDist;
void main(){if(uDash>0.0&&mod(vDist,uDash+uGap)>uDash)discard;gl_FragColor=vec4(uColor,uOpacity);
#include <colorspace_fragment>
}`;
const size=new THREE.Vector2();
function lineMaterial({color,width,opacity,dashed,hidden}){
 const m=new THREE.ShaderMaterial({vertexShader:lineVertex,fragmentShader:lineFragment,transparent:true,depthWrite:false,toneMapped:false,
  uniforms:{uResolution:{value:new THREE.Vector2(1,1)},uWidth:{value:width},uColor:{value:color.clone()},uOpacity:{value:opacity},uDash:{value:dashed?.2:0},uGap:{value:dashed?.13:0}}});
 if(hidden)m.depthFunc=THREE.GreaterDepth;return m;
}
/**
 * Screen-wide lines from segments [[ax,ay,az,bx,by,bz], ...] (world coordinates). Returns a group of two meshes:
 * the part in front of the scenery at `opacity`, the hidden part faint.
 */
export function wideLines(segments,{color,width=2,opacity=1,dashed=false,hiddenOpacity=HIDDEN_EDGE,renderOrder=8}={}){
 const pos=[],other=[],side=[],dist=[],index=[];let run=0;
 for(const [ax,ay,az,bx,by,bz] of segments){
  const len=Math.hypot(bx-ax,by-ay,bz-az);if(len<1e-6)continue;const i=pos.length/3;
  pos.push(ax,ay,az,ax,ay,az,bx,by,bz,bx,by,bz);other.push(bx,by,bz,bx,by,bz,ax,ay,az,ax,ay,az);
  // At the far end the direction is reversed, so its sides are too.
  side.push(1,-1,-1,1);dist.push(run,run,run+len,run+len);run+=len;
  index.push(i,i+1,i+2,i+1,i+3,i+2);
 }
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geometry.setAttribute('aOther',new THREE.Float32BufferAttribute(other,3));
 geometry.setAttribute('aSide',new THREE.Float32BufferAttribute(side,1));geometry.setAttribute('aDist',new THREE.Float32BufferAttribute(dist,1));geometry.setIndex(index);
 const group=new THREE.Group();
 for(const hidden of [false,true]){
  const mesh=new THREE.Mesh(geometry,lineMaterial({color,width,opacity:hidden?opacity*hiddenOpacity:opacity,dashed,hidden}));mesh.frustumCulled=false;mesh.renderOrder=renderOrder;
  mesh.onBeforeRender=renderer=>{renderer.getSize(size);mesh.material.uniforms.uResolution.value.set(Math.max(1,size.x),Math.max(1,size.y));};
  mesh.raycast=()=>{};group.add(mesh);
 }
 group.userData.segments=segments.length;return group;
}

/**
 * A see-through volume over squares.
 *  squares: [{column, row}], baseAt(column, row) -> height of that square's surface, height: H (squares),
 *  color: any CSS colour, dashed: a placement preview (dashed edges, lower fill), selected: brighter.
 * Returns {group, target (the faces, for raycasting), corner (the top corner to pin a control at), dispose()}.
 */
export function buildAreaVolume({squares,baseAt,height=1,color,dashed=false,selected=false,edgeWidth=2}){
 const cells=new Map();
 for(const s of squares||[]){const column=Math.round(Number(s.column)),row=Math.round(Number(s.row));if(!Number.isFinite(column)||!Number.isFinite(row))continue;const key=`${column},${row}`;if(cells.has(key))continue;
  const b=Number(baseAt(column,row));if(!Number.isFinite(b))continue;cells.set(key,{column,row,b,t:b+Math.max(.05,height)});}
 const group=new THREE.Group();group.name='area-volume';
 const {edge,fill}=areaColors(color);const k=(dashed?PREVIEW:1)*(selected?SELECTED:1);
 const sides=[],tops=[],edges=[],at=(c,r)=>cells.get(`${c},${r}`);
 const quad=(out,a,b,c,d)=>out.push(...a,...b,...c,...a,...c,...d);
 for(const s of cells.values()){
  const {column:x,row:y,b,t}=s;
  quad(tops,[x,t,y],[x+1,t,y],[x+1,t,y+1],[x,t,y+1]);
  quad(sides,[x,b+.02,y],[x+1,b+.02,y],[x+1,b+.02,y+1],[x,b+.02,y+1]);
  // west, east, north, south: the edge's two ends and the neighbour across it
  for(const [n,[ax,ay],[bx,by]] of [[at(x-1,y),[x,y],[x,y+1]],[at(x+1,y),[x+1,y],[x+1,y+1]],[at(x,y-1),[x,y],[x+1,y]],[at(x,y+1),[x,y+1],[x+1,y+1]]]){
   const wall=(lo,hi)=>{if(hi-lo>1e-3)quad(sides,[ax,lo,ay],[bx,lo,by],[bx,hi,by],[ax,hi,ay]);};
   if(!n){wall(b,t);edges.push([ax,t,ay,bx,t,by],[ax,b+.02,ay,bx,b+.02,by]);continue;}
   if(t>n.t+1e-3){wall(Math.max(b,n.t),t);edges.push([ax,t,ay,bx,t,by],[ax,Math.max(b,n.t),ay,bx,Math.max(b,n.t),by]);}
   if(b<n.b-1e-3)wall(b,Math.min(t,n.b));
  }
 }
 // Up the outline's corners: a corner of the grid where the squares around it in the area do not make a straight run.
 const corners=new Map();
 for(const s of cells.values())for(const [cx,cy] of [[s.column,s.row],[s.column+1,s.row],[s.column,s.row+1],[s.column+1,s.row+1]])corners.set(`${cx},${cy}`,[cx,cy]);
 for(const [cx,cy] of corners.values()){
  const around=[at(cx-1,cy-1),at(cx,cy-1),at(cx-1,cy),at(cx,cy)],inside=around.filter(Boolean);
  const straight=inside.length===2&&((around[0]&&around[1])||(around[2]&&around[3])||(around[0]&&around[2])||(around[1]&&around[3]));
  if(inside.length===4||straight)continue;
  edges.push([cx,Math.min(...inside.map(c=>c.b))+.02,cy,cx,Math.max(...inside.map(c=>c.t)),cy]);
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([...sides,...tops],3));
 geometry.addGroup(0,sides.length/3,0);geometry.addGroup(sides.length/3,tops.length/3,1);geometry.computeBoundingSphere();
 const face=opacity=>new THREE.MeshBasicMaterial({color:fill,transparent:true,opacity:Math.min(.6,opacity*k),depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true,toneMapped:false});
 const target=new THREE.Mesh(geometry,[face(FACE.side),face(FACE.top)]);target.renderOrder=6;target.frustumCulled=false;group.add(target);
 const lines=wideLines(edges,{color:edge,width:selected?edgeWidth+1:edgeWidth,opacity:dashed?.85:1,dashed});group.add(lines);
 // The corner a control is pinned at: the top of the north-east column.
 let corner=null;for(const s of cells.values())if(!corner||s.column+1>corner.x||(s.column+1===corner.x&&s.row<corner.y))corner={x:s.column+1,y:s.row,z:s.t};
 return {group,target,corner,cells:cells.size,dispose(){geometry.dispose();for(const m of target.material)m.dispose();for(const mesh of lines.children){mesh.material.dispose();}lines.children[0]?.geometry.dispose();}};
}

/** The squares a template covers: a radius as a square block (Chebyshev, centres within), a rectangle turned in quarter turns. */
export function templateSquares(shape){
 const out=[];
 if(shape.type==='circle'){
  const cx=Number(shape.center?.column)||0,cy=Number(shape.center?.row)||0,r=Math.max(.5,Number(shape.radius)||.5);
  for(let x=Math.floor(cx-r-1);x<=Math.ceil(cx+r);x++)for(let y=Math.floor(cy-r-1);y<=Math.ceil(cy+r);y++)if(Math.abs(x+.5-cx)<=r+1e-6&&Math.abs(y+.5-cy)<=r+1e-6)out.push({column:x,row:y});
  return {squares:out,height:2*r+1};
 }
 if(shape.type==='rectangle'){
  const L=Math.max(1,Number(shape.length)||1),W=Math.max(1,Number(shape.width)||1),turn=((Math.round((Number(shape.rotation)||0)/90)%4)+4)%4;
  const cx=(Number(shape.start?.column)||0)+L/2,cy=(Number(shape.start?.row)||0)+W/2,hw=(turn%2?W:L)/2,hh=(turn%2?L:W)/2;
  // Half-open, so a rectangle turned about its middle onto half squares still covers W x D squares.
  for(let x=Math.floor(cx-hw);x<Math.ceil(cx+hw);x++)for(let y=Math.floor(cy-hh);y<Math.ceil(cy+hh);y++)if(x+.5>=cx-hw-1e-6&&x+.5<cx+hw-1e-6&&y+.5>=cy-hh-1e-6&&y+.5<cy+hh-1e-6)out.push({column:x,row:y});
  return {squares:out,height:Math.min(L,W)<=1?1:Math.min(L,W)};
 }
 return {squares:out,height:1};
}

/** Small controls pinned to areas (rotate, remove, zone End): one style for all of them. */
export function ensureAreaControlStyle(){
 if(document.getElementById('vtt3d-area-controls'))return;
 const style=document.createElement('style');style.id='vtt3d-area-controls';
 style.textContent=`
.vtt3d-area-control{position:absolute;transform:translate(-50%,-50%);display:flex;gap:6px;align-items:center;pointer-events:none;z-index:4}
.vtt3d-area-control button{pointer-events:auto;min-width:26px;height:26px;padding:0 7px;border-radius:13px;border:2px solid var(--area-edge,#7dd3fc);background:rgba(10,16,30,.86);color:#f8fafc;font:700 13px/1 system-ui,sans-serif;cursor:pointer;box-shadow:0 3px 10px #0008;display:flex;align-items:center;justify-content:center;white-space:nowrap}
.vtt3d-area-control button:hover{background:rgba(25,35,60,.95)}
.vtt3d-area-control button.is-asking{border-color:#fca5a5;background:#b91c1c;color:#fff}
.vtt3d-zone-tag{position:absolute;transform:translate(-50%,-100%);pointer-events:auto;z-index:4}
.vtt3d-zone-tag__badge{width:24px;height:24px;border-radius:12px;border:2px solid var(--area-edge,#fdba74);background:rgba(10,16,30,.86);color:var(--area-edge,#fdba74);font:700 13px/1 system-ui,sans-serif;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px #0008;cursor:default}
.vtt3d-zone-tag__body{display:none;position:absolute;left:50%;bottom:22px;transform:translateX(-50%);min-width:150px;max-width:240px;padding:7px 9px;border-radius:8px;border:2px solid var(--area-edge,#fdba74);background:rgba(10,16,30,.94);color:#f8fafc;font:12px/1.3 system-ui,sans-serif;box-shadow:0 6px 16px #000a;flex-direction:column;gap:4px}
.vtt3d-zone-tag:hover .vtt3d-zone-tag__body,.vtt3d-zone-tag.is-asking .vtt3d-zone-tag__body{display:flex}
.vtt3d-zone-tag__name{font-weight:700}.vtt3d-zone-tag__meta{opacity:.8;font-size:11px}
.vtt3d-zone-tag__end{align-self:flex-end;border-radius:11px;border:2px solid var(--area-edge,#fdba74);background:rgba(10,16,30,.9);color:#fff;font:700 11px/1 system-ui,sans-serif;padding:4px 10px;cursor:pointer}
.vtt3d-zone-tag__end.is-asking{border-color:#fca5a5;background:#b91c1c}
.vtt3d-zone-tag__end:disabled{opacity:.7;cursor:wait}`;
 document.head.append(style);
}

/**
 * Two presses to act: the first shows `ask` for `ms`, the second within that time does it. Leaving the button
 * (or the time running out) puts it back. Returns {press(), cancel(), asking}.
 */
export function twoStep(button,{label,ask,ms=3000,run}){
 let timer=null;const reset=()=>{clearTimeout(timer);timer=null;button.classList.remove('is-asking');button.textContent=label;button.closest('.vtt3d-zone-tag')?.classList.remove('is-asking');};
 const api={get asking(){return !!timer;},cancel:reset,press(){if(timer){reset();run();return true;}button.classList.add('is-asking');button.textContent=ask;button.closest('.vtt3d-zone-tag')?.classList.add('is-asking');timer=setTimeout(reset,ms);return false;}};
 button.textContent=label;button.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();api.press();});button.addEventListener('pointerleave',()=>{if(timer)reset();});
 return api;
}
