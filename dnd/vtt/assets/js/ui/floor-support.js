export const FLOOR_GROUND_CLEARANCE = .125;
const supportLevels=mapLevels=>new Map([{id:'level-0',cutouts:[]},...(mapLevels?.levels||[])].map(l=>[l.id,l]));
const surfaceBounds=s=>({left:Math.min(...s.points.map(p=>p.x)),right:Math.max(...s.points.map(p=>p.x)),top:Math.min(...s.points.map(p=>p.y)),bottom:Math.max(...s.points.map(p=>p.y))});
const touchingSurfaces=(first,second)=>{const a=surfaceBounds(first),b=surfaceBounds(second);return !(b.left>a.right+1e-7||a.left>b.right+1e-7||b.top>a.bottom+1e-7||a.top>b.bottom+1e-7);};
// Same positive-area polygon support contract as FloorSupport.php.
const bands=(ring,x)=>{const ys=[];for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a.x>x)!==(b.x>x))ys.push(a.y+(x-a.x)*(b.y-a.y)/(b.x-a.x));}ys.sort((a,b)=>a-b);const result=[];for(let i=0;i+1<ys.length;i+=2)result.push([ys[i],ys[i+1]]);return result;};
export function intersectsFloor(p,surface,cuts=[]){
 const left=p.column,right=left+(p.width||1),top=p.row,bottom=top+(p.height||1),outer=surface.points||[];
 if(outer.length<3)return false;
 const holes=[...(surface.holes||[]),...cuts.map(c=>[{x:c.column,y:c.row},{x:c.column+c.width,y:c.row},{x:c.column+c.width,y:c.row+c.height},{x:c.column,y:c.row+c.height}])];
 const xs=[left,right],edges=[];
 for(const ring of [outer,...holes])for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const a=ring[i],b=ring[j];if(Math.max(a.x,b.x)>left&&Math.min(a.x,b.x)<right&&Math.max(a.y,b.y)>top&&Math.min(a.y,b.y)<bottom)edges.push([a,b]);if(a.x>left&&a.x<right)xs.push(a.x);
  for(const y of [top,bottom])if((a.y>y)!==(b.y>y)){const x=a.x+(y-a.y)*(b.x-a.x)/(b.y-a.y);if(x>left&&x<right)xs.push(x);}
 }
 for(let i=0;i<edges.length;i++)for(let j=i+1;j<edges.length;j++){
  const [a,b]=edges[i],[c,d]=edges[j],vx=b.x-a.x,vy=b.y-a.y,wx=d.x-c.x,wy=d.y-c.y,den=vx*wy-vy*wx;if(Math.abs(den)<1e-12)continue;
  const t=((c.x-a.x)*wy-(c.y-a.y)*wx)/den,u=((c.x-a.x)*vy-(c.y-a.y)*vx)/den;
  if(t>=0&&t<=1&&u>=0&&u<=1){const x=a.x+t*vx;if(x>left&&x<right)xs.push(x);}
 }
 xs.sort((a,b)=>a-b);
 for(let i=1;i<xs.length;i++){
  if(xs[i]-xs[i-1]<=1e-7)continue;const x=(xs[i]+xs[i-1])/2,blocked=holes.flatMap(h=>bands(h,x)).sort((a,b)=>a[0]-b[0]);
  for(const [a,b] of bands(outer,x)){let cursor=Math.max(top,a);const end=Math.min(bottom,b);if(end-cursor<=1e-7)continue;
   for(const [c,d] of blocked){if(d<=cursor)continue;if(c>cursor+1e-7)return true;cursor=Math.max(cursor,d);if(cursor>=end-1e-7)break;}if(end-cursor>1e-7)return true;
  }
 }
 return false;
}
export function floorSupported(p,surfaces,cuts=[]){
 const matching=surfaces.filter(s=>!s.templateCube&&(s.levelId||'level-0')===(p.levelId||'level-0'));
 let floors=matching.filter(s=>s.kind==='floor');
 if(!floors.length)floors=matching.filter(s=>(s.kind||'roof')==='roof');
 if(!floors.length)return null;
 return floors.some(s=>(s.levelId||'level-0')===(p.levelId||'level-0')&&intersectsFloor(p,s,cuts));
}

// Match FloorSupport::terrainContact: a nearly flush imported surface, not a stair.
// `below`: how far under the ground a plate may sit and still count. Walking passes a tenth of a
// square, so a walker standing level with a deck it overlaps is on it (paired with FloorSupport.php).
export function terrainFloorContact(p,surfaces,mapLevels,ground,below=0){
 const levels=supportLevels(mapLevels);let best=null;
 for(const surface of surfaces){const level=levels.get(surface.levelId),height=surface.height;
  if(surface.kind!=='floor'||!level||level.hidden||height<ground-below-1e-6||height>ground+FLOOR_GROUND_CLEARANCE+1e-6)continue;
  if(intersectsFloor(p,surface,level.cutouts||[])&&(!best||height>best.height))best=surface;
 }
 return best;
}

export function resolveSupportSurfaces(model={}){
 const surfaces=model.roofs||[];if(surfaces.every(s=>s.points))return surfaces;
 const nodes=new Map((model.nodes||[]).map(n=>[n.id,n]));
 return surfaces.map(s=>s.points?s:{...s,points:(s.nodes||[]).map(id=>nodes.get(id)).filter(Boolean)});
}

// Paired with FloorSupport::walkContact. Edge contact, not endpoint height guessing.
export function walkFloorContact(from,to,path,surfaces,mapLevels,terrain){
 if(['fly','hover'].includes(from.movementMode)||from._floorTraversal)return null;
 const levels=supportLevels(mapLevels);
 const floors=surfaces.filter(s=>(s.kind==='floor'||s.templateCube)&&levels.has(s.levelId)&&!levels.get(s.levelId).hidden);
 if(!floors.length)return null;
 const overlap=(p,s)=>intersectsFloor(p,s,levels.get(s.levelId).cutouts||[]);
 let support=floors.find(s=>from._supportSurfaceId&&from._supportSurfaceId===s.id&&overlap(from,s))
  ||floors.find(s=>!s.templateCube&&(from.levelId||'level-0')!=='level-0'&&from.levelId===s.levelId&&overlap(from,s))
  ||terrainFloorContact(from,floors,mapLevels,terrain(from),.1),previous=from;
 for(const end of [...path,to]){
  const start=previous,dx=end.column-start.column,dy=end.row-start.row,steps=Math.max(1,Math.min(8192,Math.ceil(Math.max(Math.abs(dx),Math.abs(dy))*8)));
  for(let i=1;i<=steps;i++){
   const p={...from,column:start.column+dx*i/steps,row:start.row+dy*i/steps},height=support?.height??terrain(previous);
   if(!support||!overlap(p,support)){
    const prior=support;
    support=null;
    // The same test as ever, cheapest part first: a plate at another height is ruled out by its
    // number before its outline is laid over the token's square. Paired with FloorSupport::walkContact.
    let ground=null;
    for(const s of floors){
     if(Math.abs(s.height-height)>.1+1e-6||(support&&s.height<=support.height))continue;
     if(s.height<(ground??=terrain(p))-.1-1e-6||!overlap(p,s))continue;
     if(!overlap(previous,s)||(prior&&(prior.templateCube||s.templateCube)&&touchingSurfaces(prior,s)))support=s;
    }
   }
   previous=p;
  }
 }
 return support;
}

// A retained cube can step down to a touching cube; terrain never grants a climb.
// Paired with FloorSupport::cubeStepDown; fall consequences remain server-owned.
/**
 * The height a creature coming down over this square from `altitude` would land at: the highest
 * surface under it that is not above it, on any floor a viewer may see, or `ground` when there is
 * none. Used to draw an offered square on the ledge or island a pushed creature would land on,
 * not on the ground far beneath it. Paired with the plates part of FloorSupport::landing.
 */
export function landingSurfaceHeight(p,surfaces,mapLevels,altitude,ground){
 const levels=supportLevels(mapLevels);let best=ground;
 for(const s of surfaces){
  const level=levels.get(s.levelId||'level-0');
  if(!level||level.hidden||!(s.height<=altitude+1e-6)||s.height<best-1e-6)continue;
  if(intersectsFloor(p,s,level.cutouts||[]))best=s.height;
 }
 return best;
}
export function cubeStepDown(from,to,surfaces,mapLevels){
 const levels=supportLevels(mapLevels),overlap=(p,s)=>intersectsFloor(p,s,levels.get(s.levelId)?.cutouts||[]);
 const old=surfaces.find(s=>s.id===from._supportSurfaceId&&s.templateCube&&overlap(from,s));
 if(!old||overlap({...from,...to},old))return null;
 let best=null;
 for(const s of surfaces){
  if(!s.templateCube||s.height>old.height+1e-7||!overlap({...from,...to},s))continue;
  if(!touchingSurfaces(old,s))continue;
  if(!best||s.height>best.height)best=s;
 }
 return best;
}
