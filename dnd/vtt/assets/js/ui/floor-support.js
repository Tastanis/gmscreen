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
 const matching=surfaces.filter(s=>(s.levelId||'level-0')===(p.levelId||'level-0'));
 let floors=matching.filter(s=>s.kind==='floor');
 if(!floors.length)floors=matching.filter(s=>(s.kind||'roof')==='roof');
 if(!floors.length)return null;
 return floors.some(s=>(s.levelId||'level-0')===(p.levelId||'level-0')&&intersectsFloor(p,s,cuts));
}

// Match FloorSupport::terrainContact: a nearly flush imported surface, not a stair.
export function terrainFloorContact(p,surfaces,mapLevels,ground){
 const levels=new Map((mapLevels?.levels||[]).map(l=>[l.id,l]));let best=null;
 for(const surface of surfaces){const level=levels.get(surface.levelId),height=surface.height;
  if(surface.kind!=='floor'||!level||level.hidden||height<ground-1e-6||height>ground+.1+1e-6)continue;
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
 const levels=new Map((mapLevels?.levels||[]).map(l=>[l.id,l]));
 const floors=surfaces.filter(s=>s.kind==='floor'&&levels.has(s.levelId)&&!levels.get(s.levelId).hidden);
 if(!floors.length)return null;
 const overlap=(p,s)=>intersectsFloor(p,s,levels.get(s.levelId).cutouts||[]);
 let support=floors.find(s=>((from._supportSurfaceId&&from._supportSurfaceId===s.id)||(from.levelId||'level-0')===s.levelId)&&overlap(from,s))||terrainFloorContact(from,floors,mapLevels,terrain(from)),previous=from;
 for(const end of [...path,to]){
  const start=previous,dx=end.column-start.column,dy=end.row-start.row,steps=Math.max(1,Math.min(8192,Math.ceil(Math.max(Math.abs(dx),Math.abs(dy))*8)));
  for(let i=1;i<=steps;i++){
   const p={...from,column:start.column+dx*i/steps,row:start.row+dy*i/steps},height=support?.height??terrain(previous);
   if(!support||!overlap(p,support)){
    support=null;
    for(const s of floors)if(!overlap(previous,s)&&overlap(p,s)&&Math.abs(s.height-height)<=.1+1e-6&&s.height>=terrain(p)-.1-1e-6&&(!support||s.height>support.height))support=s;
   }
   previous=p;
  }
 }
 return support;
}
