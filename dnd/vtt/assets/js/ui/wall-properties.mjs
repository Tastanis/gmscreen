export const defaults={sight:'block',movement:'block',sightDirection:'both',movementDirection:'both',baseMode:'terrain',base:0,height:2,topMode:'follow',interaction:'none',open:false,locked:false,secret:false};
export const presets={solid:{},terrain:{sight:'limited'},transparent:{sight:'pass'},curtain:{movement:'pass'},door:{interaction:'door'},window:{interaction:'window',sight:'pass'}};
export const properties=e=>({...defaults,...e});
// Breakable walls. A wall with a `material` can be broken; `broken:true` means it has been.
// A broken wall stays in the scene (so it can be repaired) but blocks nothing. Unmarked walls
// are never breakable, and a one-way wall (a cliff edge) can never be given a material.
export const MATERIALS=['glass','wood','stone','metal'];
export const isOneWay=e=>(e?.movementDirection??'both')!=='both'||(e?.sightDirection??'both')!=='both';
export const canBeBreakable=e=>!isOneWay(e);
export const isBreakable=e=>MATERIALS.includes(e?.material)&&!isOneWay(e);
export const isBroken=e=>e?.broken===true;
/** The walls that are standing: everything that asks "is there a wall here?" reads these. */
export function liveWalls(model){
 if(!model?.segments?.some(isBroken))return model;
 return {...model,segments:model.segments.filter(e=>!isBroken(e))};
}
export function validateProperties(e){
 const choices={sight:['block','pass','limited'],movement:['block','pass'],sightDirection:['both','left','right'],movementDirection:['both','left','right'],baseMode:['terrain','fixed'],topMode:['follow','level'],interaction:['none','door','window']};
 for(const [k,values] of Object.entries(choices))if(e[k]!==undefined&&!values.includes(e[k]))throw Error('Invalid wall '+k);
 for(const k of ['base','height'])if(e[k]!==undefined&&(!Number.isFinite(e[k])||Math.abs(e[k])>1000000||(k==='height'&&(e[k]<0||e[k]>1000))))throw Error('Invalid wall '+k);
 for(const k of ['open','locked','secret'])if(e[k]!==undefined&&typeof e[k]!=='boolean')throw Error('Invalid wall '+k);
 if(e.open&&e.locked)throw Error('Open walls cannot be locked');
 if(e.material!==undefined&&!MATERIALS.includes(e.material))throw Error('Invalid wall material');
 if(e.material!==undefined&&isOneWay(e))throw Error('One-way walls cannot be breakable');
 if(e.broken!==undefined&&typeof e.broken!=='boolean')throw Error('Invalid wall broken');
 if(e.broken&&e.material===undefined)throw Error('Only a wall with a material can be broken');
}
export function restrictions(edge){const e=properties(edge);if(isBroken(e))return {...e,sight:'pass',movement:'pass'};return {...e,sight:e.open&&e.interaction==='door'?'pass':e.sight,movement:e.open&&e.interaction!=='none'?'pass':e.movement};}
export function applies(direction,a,b,p){const side=(b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x);return direction==='both'||Math.abs(side)<1e-8||(direction==='left'?side>0:side<0);}
export function wallHeights(edge,a,b,p,groundAt){const e=edge.baseMode!==undefined&&edge.topMode!==undefined&&edge.base!==undefined?edge:properties(edge),base=e.baseMode==='fixed'?e.base:groundAt(p.x,p.y)+e.base;const top=e.baseMode==='fixed'||e.topMode==='follow'?base+e.height:Math.max(groundAt(a.x,a.y),groundAt(b.x,b.y))+e.base+e.height;return {base,top};}
// Swept footprint versus a wall segment; strict overlap permits sliding along a wall.
export function movementBlocked(model,from,to,groundFor,groundAt){
 const w=from.width||1,h=from.height||1,origin={x:from.column+w/2,y:from.row+h/2},dx=to.column-from.column,dy=to.row-from.row;if(!dx&&!dy)return false;
 const nodes=new Map(model.nodes.map(n=>[n.id,n]));
 for(const edge of model.segments){const e=restrictions(edge),a=nodes.get(e.a),b=nodes.get(e.b);if(e.movement==='pass'||!applies(e.movementDirection,a,b,origin))continue;
  let lo=0,hi=1;const vx=b.x-a.x,vy=b.y-a.y;
  for(const [ax,ay] of [[1,0],[0,1],[-vy,vx]]){const length=Math.hypot(ax,ay);if(!length)continue;const nx=ax/length,ny=ay/length,r=Math.abs(nx)*w/2+Math.abs(ny)*h/2,c=origin.x*nx+origin.y*ny,d=dx*nx+dy*ny,min=Math.min(a.x*nx+a.y*ny,b.x*nx+b.y*ny)-r+1e-7,max=Math.max(a.x*nx+a.y*ny,b.x*nx+b.y*ny)+r-1e-7;
   if(Math.abs(d)<1e-9){if(c<=min||c>=max){hi=-1;break;}}else{const q=(min-c)/d,s=(max-c)/d;lo=Math.max(lo,Math.min(q,s));hi=Math.min(hi,Math.max(q,s));}
  }
  if(lo>=hi||hi<0||lo>1)continue;
  const steps=Math.max(1,Math.ceil(Math.hypot(dx,dy)*(hi-lo)*8));
  for(let i=0;i<=steps;i++){const t=lo+(hi-lo)*(i+.5)/(steps+1),token={...from,column:from.column+dx*t,row:from.row+dy*t},p={x:token.column+w/2,y:token.row+h/2},u=Math.max(0,Math.min(1,((p.x-a.x)*vx+(p.y-a.y)*vy)/(vx*vx+vy*vy))),q={x:a.x+vx*u,y:a.y+vy*u},range=wallHeights(e,a,b,q,groundAt),z=groundFor(token,from);if(z<range.top-1e-7&&z+Math.max(w,h)>range.base+1e-7)return true;}
 }
 return false;
}

// Check the submitted waypoints in order, not the chord between their endpoints.
export function movementPathBlocked(model,from,to,groundFor,groundAt,resolvePosition=(_from,to)=>to){
 let previous=from;
 for(const point of [...(Array.isArray(to.path)?to.path:[]),to]){
  if(!Number.isFinite(point.column)||!Number.isFinite(point.row))continue;
  const next={...previous,column:point.column,row:point.row};
  if(movementBlocked(model,previous,next,groundFor,groundAt))return true;
  previous=resolvePosition(previous,next);
 }
 return false;
}
