import {insideRoom} from './roof-geometry.mjs';
import {intersects} from './wall-geometry.mjs';
// Geometry-based building membership: touching/overlapping room envelopes share
// a cutaway. Holes are indoor openings, not separators between building sections.
export function connectedSurfaces(a,b){
 if(a.points.some(p=>insideRoom(p,b.points))||b.points.some(p=>insideRoom(p,a.points)))return true;
 return a.points.some((p,i)=>b.points.some((q,j)=>intersects(p,a.points[(i+1)%a.points.length],q,b.points[(j+1)%b.points.length])));
}
export function compileBuildingCutaway(surfaces){
 const remaining=new Set(surfaces),groups=[];
 while(remaining.size){const seed=remaining.values().next().value,group=[seed];remaining.delete(seed);
  for(let i=0;i<group.length;i++)for(const other of remaining)if(connectedSurfaces(group[i],other)){group.push(other);remaining.delete(other);}
  groups.push(group);
 }
 return (viewer,eye,feet=eye-1)=>{
  const hidden=new Set();
  for(const group of groups){
   const above=group.filter(s=>s.height>eye+1e-6&&insideRoom(viewer,s.points));
   if(!above.length)continue;
   const ceiling=Math.min(...above.map(s=>s.height));
   const supports=group.filter(s=>s.kind==='floor'&&s.height<=feet+1e-6&&insideRoom(viewer,s.points));
   const interiorBase=supports.length?Math.min(...supports.map(s=>s.height)):ceiling;
   for(const s of group)if(s.height>=ceiling-1e-6||(s.kind==='roof'&&s.height>=interiorBase-1e-6))hidden.add(s.id);
  }
  return hidden;
 };
}
