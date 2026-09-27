import {restrictions,applies,wallHeights} from './wall-properties.mjs';
import {rampsBlock} from './imported-ramps.mjs';
import {nearestOnSegment,intersects} from './wall-geometry.mjs';
const EPS=1e-7;
export const center=t=>({x:t.column+(t.width||1)/2,y:t.row+(t.height||1)/2});
export const head=(t,ground)=>ground+Math.max(t.width||1,t.height||1);
export function wallGap(t,a,b){
 const x=t.column,y=t.row,r=x+(t.width||1),s=y+(t.height||1);
 const corners=[{x,y},{x:r,y},{x:r,y:s},{x,y:s}];
 const inside=p=>p.x>=x&&p.x<=r&&p.y>=y&&p.y<=s;
 if(inside(a)||inside(b)||corners.some((p,i)=>intersects(p,corners[(i+1)%4],a,b)))return 0;
 const pointRect=p=>Math.hypot(Math.max(x-p.x,0,p.x-r),Math.max(y-p.y,0,p.y-s));
 return Math.min(pointRect(a),pointRect(b),...corners.map(p=>{const q=nearestOnSegment(p,a,b);return Math.hypot(p.x-q.x,p.y-q.y);}));
}
function hitParameter(p,q,a,b){
 const dx=q.x-p.x,dy=q.y-p.y,ex=b.x-a.x,ey=b.y-a.y,den=dx*ey-dy*ex;
 if(Math.abs(den)<EPS){if(!intersects(p,q,a,b))return null;const len=dx*dx+dy*dy;if(!len)return null;return Math.max(0,Math.min(1,Math.min(((a.x-p.x)*dx+(a.y-p.y)*dy)/len,((b.x-p.x)*dx+(b.y-p.y)*dy)/len)));}
 const t=((a.x-p.x)*ey-(a.y-p.y)*ex)/den,u=((a.x-p.x)*dy-(a.y-p.y)*dx)/den;
 return t>=-EPS&&t<=1+EPS&&u>=-EPS&&u<=1+EPS?Math.max(0,Math.min(1,t)):null;
}
// Compile once per viewpoint. Heights remain terrain-relative at each crossing.
export function makeSight({viewer,groundAt,walls,terrain=null,viewerGround=groundAt(center(viewer).x,center(viewer).y)}){
 const origin=center(viewer),eye=head(viewer,viewerGround),nodes=new Map(walls.nodes.map(n=>[n.id,n]));
 const edges=walls.segments.map(restrictions).filter(e=>e.sight!=='pass').map(e=>{const a=nodes.get(e.a),b=nodes.get(e.b);return {...e,a,b,gap:wallGap(viewer,a,b)};}).filter(e=>applies(e.sightDirection,e.a,e.b,origin));
 const side=(a,b,p)=>(b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x);
 const contactCliffs=(terrain?.cliffs||[]).filter(e=>eye<e.high-EPS&&wallGap(viewer,e.a,e.b)<EPS&&side(e.a,e.b,origin)*side(e.a,e.b,e.lowPoint)>0);
 return function visible(target,z,targetToken=null){
  const distance=Math.hypot(target.x-origin.x,target.y-origin.y);
  if(distance<EPS)return true;
  if(rampsBlock(walls.ramps||[],origin,eye,target,z))return false;
  if(contactCliffs.some(e=>hitParameter(origin,target,e.a,e.b)!==null))return false;
  const limitedHits=[];
  for(const e of edges){
   const t=hitParameter(origin,target,e.a,e.b);if(t===null)continue;
   const crossing={x:origin.x+(target.x-origin.x)*t,y:origin.y+(target.y-origin.y)*t};
   const {base,top}=wallHeights(e,e.a,e.b,crossing,groundAt);
   if(e.gap<EPS&&eye<top-EPS&&eye>=base-EPS){if(e.sight==='limited'){limitedHits.push(t);continue;}return false;}
   // Agreed roof-edge exception: a full gap reveals an occupant at that edge.
   if(targetToken&&e.gap>=1-EPS&&wallGap(targetToken,e.a,e.b)<EPS&&z-Math.max(targetToken.width||1,targetToken.height||1)>=top-EPS)continue;
   const behind=distance*(1-t),den=e.gap+behind;
   const atWall=den>EPS?eye+(z-eye)*e.gap/den:Math.max(eye,z);
   if(atWall>=base-EPS&&atWall<=top+EPS){if(e.sight==='limited')limitedHits.push(t);else return false;}
  }
  // Shared endpoints count once; adjoining editable pieces are not extra walls.
  limitedHits.sort((a,b)=>a-b);let crossings=0,last=-Infinity;for(const t of limitedHits){if(t-last>EPS){crossings++;last=t;}if(crossings>=2)return false;}
  if(terrain)return !terrain.blocks(origin,eye,target,z,viewer,viewerGround);
  // Fallback for analytic test surfaces without a rendered terrain mesh.
  const steps=Math.max(1,Math.ceil(distance*2));
  for(let i=1;i<steps;i++){
   const t=i/steps,x=origin.x+(target.x-origin.x)*t,y=origin.y+(target.y-origin.y)*t;
   if(x>=viewer.column&&x<=viewer.column+(viewer.width||1)&&y>=viewer.row&&y<=viewer.row+(viewer.height||1))continue;
   if(groundAt(x,y)>eye+(z-eye)*t+EPS)return false;
  }
  return true;
 };
}
