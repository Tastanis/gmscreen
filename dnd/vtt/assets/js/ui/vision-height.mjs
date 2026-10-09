import {restrictions,applies,wallHeights} from './wall-properties.mjs';
import {rampsBlock} from './imported-ramps.mjs';
import {nearestOnSegment,intersects} from './wall-geometry.mjs';
const EPS=1e-7;
// Filing walls by direction (see makeSight): how many directions, how near the viewer a wall is
// looked at by every line, and when filing is worth doing at all.
const SECTORS=256,TURN=Math.PI*2,NEAR=.25,FILE_FROM=24,FILE_AFTER=8;
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
 const edges=walls.segments.map(restrictions).filter(e=>e.sight!=='pass').map(e=>{const a=nodes.get(e.a),b=nodes.get(e.b);const pad=EPS*(Math.abs(b.x-a.x)+Math.abs(b.y-a.y)+1);return {...e,a,b,gap:wallGap(viewer,a,b),left:Math.min(a.x,b.x)-pad,right:Math.max(a.x,b.x)+pad,top:Math.min(a.y,b.y)-pad,bottom:Math.max(a.y,b.y)+pad};}).filter(e=>applies(e.sightDirection,e.a,e.b,origin));
 const side=(a,b,p)=>(b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x);
 const contactCliffs=(terrain?.cliffs||[]).filter(e=>eye<e.high-EPS&&wallGap(viewer,e.a,e.b)<EPS&&side(e.a,e.b,origin)*side(e.a,e.b,e.lowPoint)>0);
 // Every line of sight starts at the viewer, so a wall can only be met by a line that points into
 // the angle the wall covers as seen from there. The walls are filed by that angle once the same
 // viewpoint has been asked a few times; each line then looks only at the walls filed under its
 // own direction. A wall is filed a whole sector wide of its ends, far more than the crossing
 // test's own tolerance, and a wall that touches or passes close by the viewer is looked at by
 // every line. Which walls are looked at never changes an answer: the order does not matter, and
 // a wall left out is one the line cannot cross.
 let filed=null,asked=0;
 function file(){
  const always=[],sectors=Array.from({length:SECTORS},()=>[]);
  for(const e of edges){
   const q=nearestOnSegment(origin,e.a,e.b);
   if(e.gap<NEAR||Math.hypot(q.x-origin.x,q.y-origin.y)<NEAR){always.push(e);continue;}
   const from=Math.atan2(e.a.y-origin.y,e.a.x-origin.x);let turn=Math.atan2(e.b.y-origin.y,e.b.x-origin.x)-from;
   if(turn>Math.PI)turn-=TURN;else if(turn<-Math.PI)turn+=TURN;
   const first=Math.floor((Math.min(from,from+turn)+Math.PI)/TURN*SECTORS)-1,last=Math.floor((Math.max(from,from+turn)+Math.PI)/TURN*SECTORS)+1;
   if(last-first>=SECTORS-1){always.push(e);continue;}
   for(let k=first;k<=last;k++)sectors[((k%SECTORS)+SECTORS)%SECTORS].push(e);
  }
  return sectors.map(list=>always.concat(list));
 }
 return function visible(target,z,targetToken=null){
  const distance=Math.hypot(target.x-origin.x,target.y-origin.y);
  if(distance<EPS)return true;
  if(rampsBlock(walls.ramps||[],origin,eye,target,z))return false;
  if(contactCliffs.some(e=>hitParameter(origin,target,e.a,e.b)!==null))return false;
  const pad=EPS*(Math.abs(target.x-origin.x)+Math.abs(target.y-origin.y)+1);
  const left=Math.min(origin.x,target.x)-pad,right=Math.max(origin.x,target.x)+pad,rayTop=Math.min(origin.y,target.y)-pad,rayBottom=Math.max(origin.y,target.y)+pad;
  let limitedHits=null;
  if(!filed&&edges.length>=FILE_FROM&&++asked>FILE_AFTER)filed=file();
  for(const e of filed?filed[Math.min(SECTORS-1,Math.floor((Math.atan2(target.y-origin.y,target.x-origin.x)+Math.PI)/TURN*SECTORS))]:edges){
   // Conservative broad phase only; exact ray, direction and height rules follow.
   if(e.right<left||e.left>right||e.bottom<rayTop||e.top>rayBottom)continue;
   const t=hitParameter(origin,target,e.a,e.b);if(t===null)continue;
   const crossing={x:origin.x+(target.x-origin.x)*t,y:origin.y+(target.y-origin.y)*t};
   const {base,top}=wallHeights(e,e.a,e.b,crossing,groundAt);
   if(e.gap<EPS&&eye<top-EPS&&eye>=base-EPS){if(e.sight==='limited'){(limitedHits||=[]).push(t);continue;}return false;}
   // Agreed roof-edge exception: a full gap reveals an occupant at that edge.
   if(targetToken&&e.gap>=1-EPS&&wallGap(targetToken,e.a,e.b)<EPS&&z-Math.max(targetToken.width||1,targetToken.height||1)>=top-EPS)continue;
   const behind=distance*(1-t),den=e.gap+behind;
   const atWall=den>EPS?eye+(z-eye)*e.gap/den:Math.max(eye,z);
   if(atWall>=base-EPS&&atWall<=top+EPS){if(e.sight==='limited')(limitedHits||=[]).push(t);else return false;}
  }
  // Shared endpoints count once; adjoining editable pieces are not extra walls.
  if(limitedHits){limitedHits.sort((a,b)=>a-b);let crossings=0,last=-Infinity;for(const t of limitedHits){if(t-last>EPS){crossings++;last=t;}if(crossings>=2)return false;}}
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
