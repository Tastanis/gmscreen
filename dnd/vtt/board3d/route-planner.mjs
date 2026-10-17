import {routeSteps} from '../assets/js/ui/terrain-math.mjs';

// Walking route planner for the 3D board. It searches square by square over the states the
// native walker can be in (square, floor, plate, stair progress) and returns
// corners for the existing ruler and move command. Every leg it returns is
// straight along a row, column or true diagonal, so the drawn line passes
// through square centres and the ruler counts the squares that are drawn.
// The native walker, wall test and cost rules decide every step; the final
// route is checked once more with the whole-command endpoint rule.
// Nothing here writes scene state; the server still accepts or refuses.
const DIRS=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
const FALL=1.05; // A drop larger than this off a plate or stair is a fall, not a walk.
const SLICE_MS=6,SYNC_MS=8,MAX_NODES=8000,MAX_SEARCHES=16,MAX_STEPS=120000;
// A route may be at most half as long again as the straight distance, and never less than two squares more
// (Brandon, October 16, 2026: "when moving x squares, it shouldnt search past like 1/2 x squares away ... I want it
// to search for best paths, but not making me go backward 20 squares"). Beyond that the move goes as drawn.
const DETOUR_SHARE=.5,DETOUR_MIN=2;
export function detourLimit(straight){const d=Math.max(0,Math.round(Number(straight)||0));return d+Math.max(DETOUR_MIN,Math.ceil(d*DETOUR_SHARE));}
// The walker's own fields; sheets, images and history are not carried in each searched square.
const WALK_FIELDS=['id','column','row','width','height','size','levelId','movementMode','flightHeight','team','combatTeam','_floorTraversal','_supportSurfaceId'];
const slim=a=>{const g={};for(const k of WALK_FIELDS)if(a[k]!==undefined)g[k]=a[k];return g;};

class Heap{
 constructor(){this.items=[];}
 get size(){return this.items.length;}
 push(item){const a=this.items;a.push(item);let i=a.length-1;while(i>0){const p=(i-1)>>1;if(a[p].key<=item.key)break;a[i]=a[p];i=p;}a[i]=item;}
 pop(){const a=this.items,top=a[0],last=a.pop();if(a.length){let i=0;for(;;){const l=i*2+1,r=l+1;let m=i;const at=j=>j===i?last:a[j];if(l<a.length&&a[l].key<at(m).key)m=l;if(r<a.length&&a[r].key<at(m).key)m=r;if(m===i)break;a[i]=a[m];i=m;}a[i]=last;}return top;}
}

export function createRoutePlanner({context,onProgress=()=>{}}){
 const tp=()=>window.terrainPrototype,wp=()=>window.wallPrototype,zones=()=>window.terrainZones;
 let geometry=null,timer=0;
 const stats={searches:0,expanded:0,nativeSteps:0,wallChecks:0,lastMs:0,fallbacks:0,lastResult:null};

 function geometryKey(){return [tp()?.revision,wp()?.revision,wp()?.key,tp()?.key].join('|');}
 function buildGeometry(){
  const key=geometryKey();if(geometry?.key===key)return geometry;
  const c=context(),v=c.view||{},g=v.gridSize||64,o=v.gridOffsets||{};
  const columns=Math.max(1,Math.round(((v.mapPixelSize?.width||0)-(o.left||0)-(o.right||0))/g)),rows=Math.max(1,Math.round(((v.mapPixelSize?.height||0)-(o.top||0)-(o.bottom||0))/g));
  const design=tp()?.design||{},model=wp()?.model||{};
  // Squares near a plate, ramp or climbable box need the full native walker.
  // Elsewhere a walker on the ground sees only the terrain height.
  const special=new Uint8Array(columns*rows),mark=(l,t,r,b,pad)=>{for(let y=Math.max(0,Math.floor(t-pad));y<=Math.min(rows-1,Math.ceil(b+pad));y++)for(let x=Math.max(0,Math.floor(l-pad));x<=Math.min(columns-1,Math.ceil(r+pad));x++)special[y*columns+x]=1;};
  for(const s of design.roofs||[]){const pts=s.points||[];if(pts.length)mark(Math.min(...pts.map(p=>p.x)),Math.min(...pts.map(p=>p.y)),Math.max(...pts.map(p=>p.x)),Math.max(...pts.map(p=>p.y)),2);}
  for(const r of design.ramps||[])mark(r.left,r.top,r.right,r.bottom,2);
  // Wall index: each square lists the wall pieces whose bounds touch it.
  const nodes=new Map((model.nodes||[]).map(n=>[n.id,n])),buckets=new Map();
  for(const s of model.segments||[]){
   const a=nodes.get(s.a),b=nodes.get(s.b);if(!a||!b||s.movement==='pass')continue;
   const seg={x1:a.x,y1:a.y,x2:b.x,y2:b.y};
   if(s.boxWall||s.climbable)mark(Math.min(a.x,b.x),Math.min(a.y,b.y),Math.max(a.x,b.x),Math.max(a.y,b.y),1);
   for(let y=Math.floor(Math.min(a.y,b.y));y<=Math.floor(Math.max(a.y,b.y));y++)for(let x=Math.floor(Math.min(a.x,b.x));x<=Math.floor(Math.max(a.x,b.x));x++){const k=x+','+y;if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(seg);}
  }
  for(const level of c.levels||[])for(const stair of level.stairs||[])for(const p of stair.corners||[])mark(p.column??p.x,p.row??p.y,p.column??p.x,p.row??p.y,2);
  for(const stair of c.mapLevels?.baseStairs||[])for(const p of stair.corners||[])mark(p.column??p.x,p.row??p.y,p.column??p.x,p.row??p.y,2);
  geometry={key,columns,rows,special,buckets,grid:g,left:o.left||0,top:o.top||0,edgeCache:new Map()};
  return geometry;
 }
 // Liang-Barsky: does a wall piece cross this rectangle?
 function crosses(seg,l,t,r,b){
  let t0=0,t1=1;const dx=seg.x2-seg.x1,dy=seg.y2-seg.y1;
  for(const [p,q] of [[-dx,seg.x1-l],[dx,r-seg.x1],[-dy,seg.y1-t],[dy,b-seg.y1]]){if(Math.abs(p)<1e-12){if(q<0)return false;continue;}const k=q/p;if(p<0){if(k>t1)return false;if(k>t0)t0=k;}else{if(k<t0)return false;if(k<t1)t1=k;}}
  return true;
 }
 function wallNear(geo,a,b,w,h){
  const l=Math.min(a.column,b.column)-.02,t=Math.min(a.row,b.row)-.02,r=Math.max(a.column,b.column)+w+.02,bt=Math.max(a.row,b.row)+h+.02;
  for(let y=Math.floor(t);y<=Math.floor(bt);y++)for(let x=Math.floor(l);x<=Math.floor(r);x++)for(const seg of geo.buckets.get(x+','+y)||[])if(crosses(seg,l,t,r,bt))return true;
  return false;
 }
 const plain=g=>(g.levelId||'level-0')==='level-0'&&!g._supportSurfaceId&&!g._floorTraversal;
 const stateKey=(g,hops)=>[g.column,g.row,g.levelId||'level-0',g._supportSurfaceId||'',g._floorTraversal?.stairId||'',g._floorTraversal?.entry||'',g._trajectoryStairTransition?1:0,hops].join(',');
 function terrainHeight(geo,p,w,h){return tp().heightAt(geo.left+(p.column+w/2)*geo.grid,geo.top+(p.row+h/2)*geo.grid);}
 // One square of walking from a ghost: where he stands after it and what it costs, or null.
 function step(s,dx,dy){
  const geo=geometry,actor=s.actor,w=actor.width||1,h=actor.height||1,ghost=s.ghost;
  const to={column:ghost.column+dx,row:ghost.row+dy};
  if(to.column<0||to.row<0||to.column>geo.columns-w||to.row>geo.rows-h)return null;
  // Steps depend on the walker's size and kind, not on where the move began.
  const cacheKey=JSON.stringify([actor.id,w,h,actor.movementMode||'ground'])+'|'+stateKey(ghost,0)+'>'+dx+','+dy;
  if(geo.edgeCache.size>MAX_STEPS)geo.edgeCache.clear();
  let edge=geo.edgeCache.get(cacheKey);
  if(edge===undefined){edge=evaluate(geo,actor,ghost,to,w,h);geo.edgeCache.set(cacheKey,edge);}
  return edge;
 }
 function evaluate(geo,actor,ghost,to,w,h){
  const from={column:ghost.column,row:ghost.row};let next,cost,fromHeight,toHeight;
  let needsNative=!plain(ghost);
  if(!needsNative)for(let y=Math.min(from.row,to.row);y<Math.max(from.row,to.row)+h&&!needsNative;y++)for(let x=Math.min(from.column,to.column);x<Math.max(from.column,to.column)+w;x++)if(geo.special[y*geo.columns+x]){needsNative=true;break;}
  if(needsNative){
   stats.nativeSteps++;const carry={ghost:{...ghost}},walked=tp().route(from,to,{actor,carry});
   if(!walked?.points?.length)return null;
   next={...carry.ghost,column:to.column,row:to.row};cost=walked.cost;fromHeight=walked.points[0].rawHeight;toHeight=walked.points.at(-1).rawHeight;
  }else{
   const z=zones(),height=(c,r)=>terrainHeight(geo,{column:c,row:r},w,h);
   const walked=routeSteps(from,to,height,z?.stepMultiplier?(c,r,raw)=>z.stepMultiplier(actor,c,r,raw):null,(a,b)=>tp().climbFace(actor,a,b));
   next={...ghost,column:to.column,row:to.row};cost=walked.cost;fromHeight=walked.points[0].rawHeight;toHeight=walked.points.at(-1).rawHeight;
  }
  if(!Number.isFinite(cost)||!Number.isFinite(toHeight))return null;
  // Walking off a plate, bridge or stair edge is a fall; the planner never
  // routes through one. A chosen drop is still the player's to make.
  // Going down a stair or vine while it carries him is walking, and so is the
  // step on which it delivers him to its other floor (the native walker marks
  // that transition). Stepping off its side is a fall like any other edge.
  const delivered=!ghost._trajectoryStairTransition&&next._trajectoryStairTransition===true;
  const onStair=!!next._floorTraversal||delivered;
  if(!plain(ghost)&&!onStair&&Number.isFinite(fromHeight)&&fromHeight-toHeight>FALL)return null;
  if(wallNear(geo,from,to,w,h)){stats.wallChecks++;if(wp()?.wallMet?.(ghost,{column:to.column,row:to.row,path:[]}))return null;}
  delete next._viaStair; // Kept: _trajectoryStairTransition, which limits a command to one stair as the server does.
  // Prefer gentle ground: a steep drop on bare terrain is allowed but costs
  // a little in the search order so routes follow slopes when they can.
  const steep=onStair?0:Math.max(0,fromHeight-toHeight-1);
  const changedFloor=(next.levelId||'level-0')!==(ghost.levelId||'level-0');
  // Only a stair counts toward the server's one stair a command: stepping between a floor plate and the ground level
  // with it (a hall floor over a cellar beside its stair) is walking, not a change of floor (FloorGeometry::move).
  return {ghost:next,cost,height:toHeight,changedFloor,stairHop:changedFloor&&(onStair||!!ghost._floorTraversal),steep};
 }
 function actorKey(a,kind){return JSON.stringify([a.id,a.column,a.row,a.width||1,a.height||1,a.levelId||'level-0',a._supportSurfaceId||a.supportSurfaceId||null,a._floorTraversal||null,a.movementMode||'ground',kind]);}
 const targetKey=t=>JSON.stringify([t.column,t.row,Number.isFinite(t.surfaceElevation)?Math.round(t.surfaceElevation*20)/20:null,t.levelId||null,t.surfaceId||null,t.rampId||null]);
 const searches=new Map(); // recent searches, newest last
 // A* toward one target square. Chebyshev distance never overstates the cost
 // (every square costs at least 1), so the first goal taken is the cheapest.
 // Equal costs prefer fewer steep drops (slopes over cliff faces), then
 // squares nearer the goal, then fewer turns.
 const order=(n,h)=>n.cost*1e7+Math.min(9999,Math.round(n.steep*100))*1e3+h*10+Math.min(9,n.turns);
 function start(actor,target,kind){
  buildGeometry();const key=actorKey(actor,kind)+'#'+targetKey(target)+'#'+geometry.key;
  let s=searches.get(key);if(s){searches.delete(key);searches.set(key,s);return s;}
  const ghost=slim(actor),root={ghost,cost:0,height:tp().groundFor(actor),hops:0,parent:null,key:stateKey(ghost,0),turns:0,steep:0,squares:0};
  s={key,actor,target,kind,actorKey:actorKey(actor,kind),open:new Heap(),closed:new Set(),best:new Map([[root.key,root]]),done:false,goal:null,expanded:0,limit:detourLimit(heuristic(ghost,target))};
  s.open.push({key:order(root,heuristic(root.ghost,target)),node:root});stats.searches++;
  searches.set(key,s);while(searches.size>MAX_SEARCHES)searches.delete(searches.keys().next().value);
  return s;
 }
 const heuristic=(g,t)=>Math.max(Math.abs(g.column-t.column),Math.abs(g.row-t.row));
 function fits(n,target){
  if(n.ghost.column!==target.column||n.ghost.row!==target.row)return false;
  if(!Number.isFinite(target.surfaceElevation)&&!target.rampId)return true;
  const stairExit=n.hops>0&&!n.ghost._floorTraversal;
  return tp().pickedSurfaceReached({height:n.height,placement:n.ghost,canonicalCompatible:true,stairExit},target);
 }
 function expand(s,deadline){
  while(s.open.size&&performance.now()<deadline){
   const {node}=s.open.pop();if(s.closed.has(node.key))continue;s.closed.add(node.key);s.expanded++;stats.expanded++;
   if(fits(node,s.target)){s.goal=node;s.done=true;return;}
   if(s.expanded>=MAX_NODES){s.done=true;return;}
   for(const [dx,dy] of DIRS){
    const edge=step({actor:s.actor,actorKey:s.actorKey,ghost:node.ghost},dx,dy);if(!edge)continue;
    const hops=node.hops+(edge.stairHop?1:0);if(hops>1)continue; // The server takes one stair per command.
    const dir=dx+','+dy,child={ghost:edge.ghost,cost:node.cost+edge.cost,height:edge.height,hops,parent:node,dir,turns:node.turns+(node.dir&&node.dir!==dir?1:0),steep:node.steep+edge.steep,squares:(node.squares||0)+1,key:stateKey(edge.ghost,hops)};
    if(s.closed.has(child.key))continue;const h=heuristic(child.ghost,s.target),prior=s.best.get(child.key);
    if(child.squares+h>s.limit)continue; // a detour longer than the limit is not looked for
    if(prior&&order(prior,h)<=order(child,h))continue;
    s.best.set(child.key,child);s.open.push({key:order(child,h),node:child});
   }
  }
  if(!s.open.size)s.done=true;
 }
 function cellsOf(node){const cells=[];for(let n=node;n;n=n.parent)cells.push(n);return cells.reverse();}
 // Corners where a straight leg changes direction. Legs stay on rows,
 // columns or true diagonals, so every square on a leg is a drawn square.
 function corners(path){
  const out=[];for(let i=1;i<path.length-1;i++){const a=path[i-1].ghost,b=path[i].ghost,c=path[i+1].ghost;if(b.column-a.column!==c.column-b.column||b.row-a.row!==c.row-b.row)out.push({column:b.column,row:b.row});}
  return out;
 }
 // Straighten zig-zags: replace the stretch between two kept corners with one
 // diagonal leg and one straight leg when that walks the same squares' worth
 // of cost, floor and footing. Each candidate is walked with the same steps.
 function straighten(path,search){
  if(path.length<3)return path;
  const walk=(from,to,diagFirst)=>{
   const dx=to.ghost.column-from.ghost.column,dy=to.ghost.row-from.ghost.row,diag=Math.min(Math.abs(dx),Math.abs(dy)),sx=Math.sign(dx),sy=Math.sign(dy);
   const moves=[];const straight=Math.abs(dx)>Math.abs(dy)?[sx,0]:[0,sy],rest=Math.max(Math.abs(dx),Math.abs(dy))-diag;
   const d=Array(diag).fill([sx,sy]),st=Array(rest).fill(straight);moves.push(...(diagFirst?[...d,...st]:[...st,...d]));
   let node=from,list=[];
   for(const [mx,my] of moves){const edge=step({actor:search.actor,actorKey:search.actorKey,ghost:node.ghost},mx,my);if(!edge)return null;const hops=node.hops+(edge.stairHop?1:0);if(hops>1)return null;node={ghost:edge.ghost,cost:node.cost+edge.cost,height:edge.height,hops,parent:node,steep:(node.steep||0)+edge.steep};list.push(node);}
   const end=list.at(-1);if(!end||end.cost>to.cost+1e-9||end.steep>(to.steep||0)+1e-9||stateKey(end.ghost,end.hops)!==stateKey(to.ghost,to.hops))return null;
   return list;
  };
  const out=[path[0]];let i=0;
  while(i<path.length-1){
   let advanced=false;
   for(let j=Math.min(path.length-1,i+48);j>i+1;j--){
    for(const diagFirst of [true,false]){const list=walk(out.at(-1),path[j],diagFirst);if(list){out.push(...list);i=j;advanced=true;break;}}
    if(advanced)break;
   }
   if(!advanced){const next=path[i+1];out.push({...next,cost:out.at(-1).cost+(next.cost-path[i].cost)});i++;}
  }
  return out;
 }
 function finish(s,target,node){
  let path=straighten(cellsOf(node),s);
  let points=corners(path);
  const actor=s.actor,tpi=tp(),all=[{column:actor.column,row:actor.row},...points,{column:target.column,row:target.row}];
  // The whole route must end where the move command will put him.
  const ending=tpi.walkEnding(actor,all),picked=Number.isFinite(target.surfaceElevation)||target.rampId?target:null;
  const ok=ending?.canonicalCompatible!==false&&(!picked||tpi.pickedSurfaceReached(ending,picked));
  if(!ok){
   // Try the unstraightened squares before giving up.
   path=cellsOf(node);points=corners(path);
   const again=tpi.walkEnding(actor,[{column:actor.column,row:actor.row},...points,{column:target.column,row:target.row}]);
   if(again?.canonicalCompatible===false||(picked&&!tpi.pickedSurfaceReached(again,picked))){stats.fallbacks++;return {status:'mismatch',corners:null,cost:node.cost};}
  }
  if(points.length>120){stats.fallbacks++;return {status:'too-long',corners:null,cost:node.cost};}
  return {status:'found',corners:points,cost:node.cost,squares:path.map(n=>({column:n.ghost.column,row:n.ghost.row,height:n.height}))};
 }
 let pending=null;
 function schedule(s){
  pending=s;if(timer)return;
  timer=requestAnimationFrame(()=>{timer=0;const t=pending;if(!t||t.done)return;expand(t,performance.now()+SLICE_MS);if(t.done)onProgress();else schedule(t);});
 }
 /** Corners for a walk to `target` ({column,row,surfaceElevation,levelId,surfaceId,rampId}). */
 function plan(actor,target,kind='walk'){
  const begin=performance.now();
  if(!actor||!tp()?.route||!['walk','shift'].includes(kind)||['fly','hover'].includes(actor.movementMode))return {status:'unsupported',corners:null};
  if(actor.column===target.column&&actor.row===target.row&&!target.rampId)return {status:'found',corners:[],cost:0};
  const s=start(actor,target,kind);
  if(!s.done)expand(s,begin+SYNC_MS);
  let result;
  if(s.goal)result=s.result||(s.result=finish(s,target,s.goal));
  else if(s.done)result={status:'unreachable',corners:null};
  else{schedule(s);result={status:'pending',corners:null};}
  stats.lastMs=performance.now()-begin;stats.lastResult=result.status;return result;
 }
 // Warm the step cache around a token in idle time (cheapest squares first),
 // so the first drag after picking it up rarely waits for the search.
 let warming=null;
 const idle=window.requestIdleCallback?fn=>requestIdleCallback(fn,{timeout:250}):fn=>setTimeout(()=>fn({timeRemaining:()=>8}),30);
 function warm(actor,radius=12,kind='walk'){
  if(!actor||!tp()?.route||['fly','hover'].includes(actor.movementMode))return;
  buildGeometry();const key=actorKey(actor,kind)+'#'+geometry.key;if(warming?.key===key)return;
  const root={ghost:slim(actor),cost:0,hops:0};warming={key,actor,actorKey:actorKey(actor,kind),open:new Heap(),seen:new Set([stateKey(root.ghost,0)])};warming.open.push({key:0,node:root});
  const job=warming;
  const run=deadline=>{if(warming!==job||geometry.key!==job.key.split('#').at(-1))return;const until=performance.now()+Math.min(8,Math.max(2,deadline.timeRemaining()));
   while(job.open.size&&performance.now()<until){const {node}=job.open.pop();if(node.cost>=radius)continue;
    for(const [dx,dy] of DIRS){const edge=step({actor:job.actor,actorKey:job.actorKey,ghost:node.ghost},dx,dy);if(!edge)continue;const hops=node.hops+(edge.stairHop?1:0);if(hops>1)continue;const k=stateKey(edge.ghost,hops);if(job.seen.has(k))continue;job.seen.add(k);const child={ghost:edge.ghost,cost:node.cost+edge.cost,hops};job.open.push({key:child.cost,node:child});}}
   if(job.open.size)idle(run);};
  idle(run);
 }
 function reset(){searches.clear();pending=null;warming=null;if(timer)cancelAnimationFrame(timer);timer=0;}
 return {plan,warm,reset,stats:()=>{const last=[...searches.values()].at(-1);return {...stats,cachedSteps:geometry?.edgeCache.size||0,expandedThisSearch:last?.expanded||0,searchDone:!!last?.done};}};
}
