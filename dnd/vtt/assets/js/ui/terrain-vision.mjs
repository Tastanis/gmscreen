import {sample} from './terrain-math.mjs';
const EPS=1e-7;
// A snapshot of the same triangle mesh used by terrain rendering, in grid units.
export function compileTerrainVision(source,{left=0,top=0,width,height}){
 const field={n:source.n,m:source.m,h:Float32Array.from(source.h)};
 const sx=width/(field.n-1),sy=height/(field.m-1);
 const heightAt=(x,y)=>sample(field,(x-left)/width,(y-top)/height);
 const cells=new Map(),cliffs=[];
 const cell=(x,y)=>{const key=x+','+y;if(!cells.has(key))cells.set(key,heightAt(x+.5,y+.5));return cells.get(key);};
 for(let y=Math.ceil(top-.5);y+.5<top+height;y++)for(let x=Math.ceil(left-.5);x+.5<left+width;x++){
  const h=cell(x,y);
  if(x+1.5<left+width){const other=cell(x+1,y);if(Math.abs(other-h)>=3-EPS)cliffs.push({a:{x:x+1,y},b:{x:x+1,y:y+1},high:Math.max(h,other),lowPoint:{x:x+(h < other ? .5 : 1.5),y:y+.5}});}
  if(y+1.5<top+height){const other=cell(x,y+1);if(Math.abs(other-h)>=3-EPS)cliffs.push({a:{x,y:y+1},b:{x:x+1,y:y+1},high:Math.max(h,other),lowPoint:{x:x+.5,y:y+(h < other ? .5 : 1.5)}});}
 }
 function blocksFine(origin,eye,target,z,viewer,startT=0,endT=1,ground=null){
  const dx=target.x-origin.x,dy=target.y-origin.y;
  // The sightline is linear within each terrain triangle. Its extrema relative
  // to terrain occur at mesh boundaries, so there is no fixed sampling gap.
  const ex=dx>0?(viewer.column+(viewer.width||1)-origin.x)/dx:dx<0?(viewer.column-origin.x)/dx:Infinity;
  const ey=dy>0?(viewer.row+(viewer.height||1)-origin.y)/dy:dy<0?(viewer.row-origin.y)/dy:Infinity;
  const exit=Math.max(Math.min(ex,ey),startT-EPS);
  if(exit>=endT)return false;
  const blockedAt=t=>t>exit&&t<=endT&&sightHeight(heightAt(origin.x+dx*t,origin.y+dy*t),ground)>eye+(z-eye)*t+EPS;
  if(blockedAt(Math.max(0,exit)+EPS))return true;
  function crossings(start,delta,minimum,maximum){
   if(Math.abs(delta)<EPS)return false;
   // Walk from the viewer outward and stop at the first obstruction. Avoid
   // allocating all boundary times for rays that are blocked nearby.
   const from=start+delta*startT,end=start+delta*endT,lo=Math.max(minimum,Math.ceil(Math.min(from,end))),hi=Math.min(maximum,Math.floor(Math.max(from,end))),step=delta>0?1:-1;
   for(let k=delta>0?lo:hi;delta>0?k<=hi:k>=lo;k+=step){const t=(k-start)/delta;if(t>EPS&&t<1-EPS&&blockedAt(t))return true;}
   return false;
  }
  const ux=(origin.x-left)/sx,uy=(origin.y-top)/sy,vx=dx/sx,vy=dy/sy;
  return crossings(ux,vx,0,field.n-1)||crossings(uy,vy,0,field.m-1)||crossings(ux+uy,vx+vy,0,field.n+field.m-2)||blockedAt(endT);

 }
 // Cached conservative height bounds for 8x8 mesh-cell tiles. A ray wholly
 // above a tile cannot be blocked there; only uncertain intervals need exact work.
 const tileSize=8,nx=Math.ceil((field.n-1)/tileSize),ny=Math.ceil((field.m-1)/tileSize),tops=new Float32Array(nx*ny);
 for(let ty=0;ty<ny;ty++)for(let tx=0;tx<nx;tx++){
  let high=-Infinity;for(let j=ty*tileSize;j<=Math.min((ty+1)*tileSize,field.m-1);j++)for(let i=tx*tileSize;i<=Math.min((tx+1)*tileSize,field.n-1);i++)high=Math.max(high,field.h[j*field.n+i]);tops[ty*nx+tx]=high;
 }
 // Downward vision compresses below-footing relief 5:1. Expressing this as
 // a raised virtual eye and expanded above-footing obstacles avoids granting
 // the same allowance over a higher intervening hill. Physical heights stay intact.
 const sightHeight=(h,ground)=>ground===null||h<=ground?h:ground+(h-ground)*5;
 function blocks(origin,eye,target,z,viewer,viewerGround=null){
  const ground=Number.isFinite(viewerGround)&&z<viewerGround-EPS?viewerGround:null;
  if(ground!==null)eye=ground+(eye-ground)*5;
  const dx=target.x-origin.x,dy=target.y-origin.y,px=sx*tileSize,py=sy*tileSize;
  // The line is cut where it crosses the tile lines, nearest cut first. The cuts across and the
  // cuts down each come out in order by themselves, so the two are merged as they are read: the
  // same cuts a sorted list gives, without building and sorting a list for every line of sight.
  let firstX=0,lastX=-1,firstY=0,lastY=-1;
  if(Math.abs(dx)>=EPS){firstX=Math.max(1,Math.ceil((Math.min(origin.x,origin.x+dx)-left)/px));lastX=Math.min(nx-1,Math.floor((Math.max(origin.x,origin.x+dx)-left)/px));}
  if(Math.abs(dy)>=EPS){firstY=Math.max(1,Math.ceil((Math.min(origin.y,origin.y+dy)-top)/py));lastY=Math.min(ny-1,Math.floor((Math.max(origin.y,origin.y+dy)-top)/py));}
  const countX=lastX-firstX+1,countY=lastY-firstY+1,NONE=2;
  let ix=0,iy=0,x=NONE,y=NONE,a=0;
  while(ix<countX){const t=(left+(dx>0?firstX+ix:lastX-ix)*px-origin.x)/dx;ix++;if(t>0&&t<1){x=t;break;}}
  while(iy<countY){const t=(top+(dy>0?firstY+iy:lastY-iy)*py-origin.y)/dy;iy++;if(t>0&&t<1){y=t;break;}}
  for(;;){
   let b;
   if(x<=y){b=x;x=NONE;while(ix<countX){const t=(left+(dx>0?firstX+ix:lastX-ix)*px-origin.x)/dx;ix++;if(t>0&&t<1){x=t;break;}}}
   else{b=y;y=NONE;while(iy<countY){const t=(top+(dy>0?firstY+iy:lastY-iy)*py-origin.y)/dy;iy++;if(t>0&&t<1){y=t;break;}}}
   const end=b===NONE;if(end)b=1;
   if(b-a>=EPS){
    const t=(a+b)/2;
    const tx=Math.max(0,Math.min(nx-1,Math.floor((origin.x+dx*t-left)/px))),ty=Math.max(0,Math.min(ny-1,Math.floor((origin.y+dy*t-top)/py)));
    if(Math.min(eye+(z-eye)*a,eye+(z-eye)*b)+EPS<sightHeight(tops[ty*nx+tx],ground)&&blocksFine(origin,eye,target,z,viewer,a,b,ground))return true;
   }
   a=b;if(end)return false;
  }
 }
 return {heightAt,cliffs,blocks,cellCount:cells.size};
}
