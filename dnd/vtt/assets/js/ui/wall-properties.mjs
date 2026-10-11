export const defaults={sight:'block',movement:'block',sightDirection:'both',movementDirection:'both',baseMode:'terrain',base:0,height:2,topMode:'follow',interaction:'none',open:false,locked:false,secret:false,climbable:false};
export const presets={solid:{},terrain:{sight:'limited'},transparent:{sight:'pass'},curtain:{movement:'pass'},door:{interaction:'door'},window:{interaction:'window',sight:'pass'}};
// A barrier this many squares high or less (a rail, a fence, a parapet, a low wall). Brandon, October 10, 2026,
// of the bathhouse balcony rails: "I want them to be breakable. But also climbable. If it asks to climb. I want
// players to be able to click yes and move to the top. Instead of it knocking them back like a wall. Those
// railings shouldn't block vision ... they should be able to just jump over them since they are only one
// square high or less."
export const LOW_BARRIER=1;
// A low box (low-boxes.mjs) stands on rough ground: its wall is still low when its base is no more than this above the walker's feet.
export const BOX_FOOT=.5;
// The setting `climbable` (Brandon, October 10, 2026: "we need a wall type called climbable ... any thing outside
// like a large rock ... We can just make that a setting instead of trying to make sure every block is the right
// height"): a wall that says so is climbed on a yes whatever its height, and a closed ring of them is stood on at
// its real top (low-boxes.mjs). A door or a window is opened, not climbed. Paired with WallMovement::climbable.
export const climbable=edge=>edge?.climbable===true&&(edge.interaction??'none')==='none';
// A wall that low lets sight through unless the wall itself says it blocks. A wall with no height is 2 squares.
export const properties=e=>{const p={...defaults,...e};if(e?.sight===undefined&&p.height<=LOW_BARRIER)p.sight='pass';return p;};
// Breakable walls. A wall with a `material` can be broken; `broken:true` means it has been.
// A broken wall stays in the scene (so it can be repaired) but blocks nothing. Unmarked walls
// are never breakable, and a one-way wall (a cliff edge) can never be given a material.
export const MATERIALS=['glass','wood','stone','metal'];
export const isOneWay=e=>(e?.movementDirection??'both')!=='both'||(e?.sightDirection??'both')!=='both';
export const canBeBreakable=e=>!isOneWay(e);
export const isBreakable=e=>MATERIALS.includes(e?.material)&&!isOneWay(e);
export const isBroken=e=>e?.broken===true;
// An object (a pillar, a crate): its walls share a `group` name and break as one thing.
export const GROUP_NAME=/^[A-Za-z0-9_.:-]{1,128}$/;
/** A name typed by hand, made into one the server accepts; '' when nothing usable is left. */
export const groupName=text=>String(text??'').trim().replace(/[^A-Za-z0-9_.:-]+/g,'-').slice(0,128);
/** These walls and every other wall of the same objects. */
export function withGroups(model,edges){
 const names=new Set(edges.map(e=>e?.group).filter(name=>typeof name==='string'&&name));
 return names.size?[...new Set([...edges,...model.segments.filter(e=>names.has(e.group))])]:edges;
}
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
 if(e.group!==undefined&&(typeof e.group!=='string'||!GROUP_NAME.test(e.group)))throw Error('Invalid wall group name');
 if(e.group!==undefined&&e.material===undefined)throw Error('A wall group needs a material');
}
export function restrictions(edge){const e=properties(edge);if(isBroken(e))return {...e,sight:'pass',movement:'pass'};return {...e,sight:e.open&&e.interaction==='door'?'pass':e.sight,movement:e.open&&e.interaction!=='none'?'pass':e.movement};}
export function applies(direction,a,b,p){const side=(b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x);return direction==='both'||Math.abs(side)<1e-8||(direction==='left'?side>0:side<0);}
export function wallHeights(edge,a,b,p,groundAt){const e=edge.baseMode!==undefined&&edge.topMode!==undefined&&edge.base!==undefined?edge:properties(edge),base=e.baseMode==='fixed'?e.base:groundAt(p.x,p.y)+e.base;const top=e.baseMode==='fixed'||e.topMode==='follow'?base+e.height:Math.max(groundAt(a.x,a.y),groundAt(b.x,b.y))+e.base+e.height;return {base,top};}
// True when a wall runs along the edge between squares (a rail, a fence), and not through or inside one (the walls
// of an object that fills its square).
export const onGridLine=(a,b)=>(Math.abs(a.x-b.x)<1e-6&&Math.abs(a.x-Math.round(a.x))<1e-6)||(Math.abs(a.y-b.y)<1e-6&&Math.abs(a.y-Math.round(a.y))<1e-6);
// Swept footprint versus a wall segment; strict overlap permits sliding along a wall. Each wall the move meets
// while the wall's top is above the mover's feet: where along the move ({lo,hi}), its `top`, the most it stands
// above his feet (`rise`), and `low` when it is a low barrier all the way: a plain wall along a square's edge,
// or one of a low box's own (low-boxes.mjs), standing on his floor, no more than LOW_BARRIER above his feet; or a wall of any height that is set climbable. `lifts` are low barriers already found: while
// he is over one he is at its top, so what is above it there is met. `first` stops at the first wall met.
function wallsMet(model,from,to,groundFor,groundAt,{first=false,lifts=null,skip=null}={}){
 const met=[],w=from.width||1,h=from.height||1,origin={x:from.column+w/2,y:from.row+h/2},dx=to.column-from.column,dy=to.row-from.row;if(!dx&&!dy)return met;
 const nodes=new Map(model.nodes.map(n=>[n.id,n]));
 for(const edge of model.segments){if(skip?.has(edge))continue;const e=restrictions(edge),a=nodes.get(e.a),b=nodes.get(e.b);if(e.movement==='pass'||!applies(e.movementDirection,a,b,origin))continue;
  let lo=0,hi=1;const vx=b.x-a.x,vy=b.y-a.y;
  for(const [ax,ay] of [[1,0],[0,1],[-vy,vx]]){const length=Math.hypot(ax,ay);if(!length)continue;const nx=ax/length,ny=ay/length,r=Math.abs(nx)*w/2+Math.abs(ny)*h/2,c=origin.x*nx+origin.y*ny,d=dx*nx+dy*ny,min=Math.min(a.x*nx+a.y*ny,b.x*nx+b.y*ny)-r+1e-7,max=Math.max(a.x*nx+a.y*ny,b.x*nx+b.y*ny)+r-1e-7;
   if(Math.abs(d)<1e-9){if(c<=min||c>=max){hi=-1;break;}}else{const q=(min-c)/d,s=(max-c)/d;lo=Math.max(lo,Math.min(q,s));hi=Math.min(hi,Math.max(q,s));}
  }
  if(lo>=hi||hi<0||lo>1)continue;
  const steps=Math.max(1,Math.ceil(Math.hypot(dx,dy)*(hi-lo)*8)),can=climbable(e),plain=can||e.interaction==='none'&&(onGridLine(a,b)||edge.boxWall===true);let hit=false,low=plain,top=-Infinity,rise=0;
  for(let i=0;i<=steps;i++){const t=lo+(hi-lo)*(i+.5)/(steps+1),token={...from,column:from.column+dx*t,row:from.row+dy*t},p={x:token.column+w/2,y:token.row+h/2},u=Math.max(0,Math.min(1,((p.x-a.x)*vx+(p.y-a.y)*vy)/(vx*vx+vy*vy))),q={x:a.x+vx*u,y:a.y+vy*u},range=wallHeights(e,a,b,q,groundAt);
   let z=groundFor(token,from);if(lifts)for(const lift of lifts)if(t>=lift.lo-1e-9&&t<=lift.hi+1e-9&&lift.top>z)z=lift.top;
   if(z<range.top-1e-7&&z+Math.max(w,h)>range.base+1e-7){hit=true;const foot=edge.boxWall===true||can?Math.min(BOX_FOOT,Math.max(0,range.base-z)):0;if((!can&&range.top-z-foot>LOW_BARRIER+1e-6)||range.base>z+foot+1e-6)low=false;if(range.top>top)top=range.top;if(range.top-z>rise)rise=range.top-z;if(first)break;}
  }
  if(hit){met.push({edge,lo:Math.max(0,lo),hi:Math.min(1,hi),low,top,rise});if(first)return met;}
 }
 return met;
}
// `climb`: the mover has said yes to climbing over low barriers, so only something else stops him.
export function movementBlocked(model,from,to,groundFor,groundAt,climb=false){
 if(!climb)return wallsMet(model,from,to,groundFor,groundAt,{first:true}).length>0;
 return lowBarrier(model,from,to,groundFor,groundAt)===null&&wallsMet(model,from,to,groundFor,groundAt,{first:true}).length>0;
}
// When low barriers are the only walls in the way of this step: how high the tallest stands above the mover's
// feet ({rise}). Null when nothing is in the way, or when something that is not a low barrier is.
export function lowBarrier(model,from,to,groundFor,groundAt){
 const met=wallsMet(model,from,to,groundFor,groundAt);
 if(!met.length||met.some(wall=>!wall.low))return null;
 // Over a low barrier he is at its top: a wall above it there (a window over a sill) still stops him.
 if(wallsMet(model,from,to,groundFor,groundAt,{first:true,lifts:met,skip:new Set(met.map(wall=>wall.edge))}).length)return null;
 return {rise:Math.max(...met.map(wall=>wall.rise)),onto:met.some(wall=>wall.edge.boxWall===true),tall:met.some(wall=>climbable(wall.edge)&&wall.rise>LOW_BARRIER+1e-6)};
}

// Check the submitted waypoints in order, not the chord between their endpoints.
export function movementPathBlocked(model,from,to,groundFor,groundAt,resolvePosition=(_from,to)=>to,climb=false){
 let previous=from;
 for(const point of [...(Array.isArray(to.path)?to.path:[]),to]){
  if(!Number.isFinite(point.column)||!Number.isFinite(point.row))continue;
  const next={...previous,column:point.column,row:point.row};
  if(movementBlocked(model,previous,next,groundFor,groundAt,climb))return true;
  previous=resolvePosition(previous,next);
 }
 return false;
}
// The wall piece a walk through these waypoints meets first, with its base and top where it is met; null when
// nothing is in its way. For showing a refused walker which wall it was (wall-flash.mjs).
export function firstWallMet(model,from,to,groundFor,groundAt,resolvePosition=(_from,to)=>to){
 const nodes=new Map(model.nodes.map(n=>[n.id,n]));let previous=from;
 for(const point of [...(Array.isArray(to.path)?to.path:[]),to]){
  if(!Number.isFinite(point.column)||!Number.isFinite(point.row))continue;
  const next={...previous,column:point.column,row:point.row},met=wallsMet(model,previous,next,groundFor,groundAt);
  if(met.length){const first=met.reduce((best,wall)=>wall.lo<best.lo?wall:best),a=nodes.get(first.edge.a),b=nodes.get(first.edge.b),range=wallHeights(restrictions(first.edge),a,b,{x:(a.x+b.x)/2,y:(a.y+b.y)/2},groundAt);return {edge:first.edge,a:{x:a.x,y:a.y},b:{x:b.x,y:b.y},base:range.base,top:range.top};}
  previous=resolvePosition(previous,next);
 }
 return null;
}
// The same walk, asked whether a yes to climbing would let it through: {rise} of the tallest low barrier on the
// way when low barriers are all that stop it; null when nothing stops it, or something else does.
export function lowBarrierOnPath(model,from,to,groundFor,groundAt,resolvePosition=(_from,to)=>to){
 let previous=from,rise=0,onto=false,tall=false;
 for(const point of [...(Array.isArray(to.path)?to.path:[]),to]){
  if(!Number.isFinite(point.column)||!Number.isFinite(point.row))continue;
  const next={...previous,column:point.column,row:point.row};
  if(movementBlocked(model,previous,next,groundFor,groundAt)){const low=lowBarrier(model,previous,next,groundFor,groundAt);if(!low)return null;rise=Math.max(rise,low.rise);onto=onto||low.onto;tall=tall||low.tall;}
  previous=resolvePosition(previous,next);
 }
 return rise>0?{rise,onto,tall}:null;
}
