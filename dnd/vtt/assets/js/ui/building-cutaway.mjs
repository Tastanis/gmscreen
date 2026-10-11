import {insideRoom} from './roof-geometry.mjs';
import {intersects} from './wall-geometry.mjs';
// Geometry-based building membership: touching/overlapping room envelopes share
// a cutaway. Holes are indoor openings, not separators between building sections.
export function connectedSurfaces(a,b){
 if(a.points.some(p=>insideRoom(p,b.points))||b.points.some(p=>insideRoom(p,a.points)))return true;
 return a.points.some((p,i)=>b.points.some((q,j)=>intersects(p,a.points[(i+1)%a.points.length],q,b.points[(j+1)%b.points.length])));
}
// A hole is a hole (Brandon, October 10, 2026, standing in the bathhouse pool: "if it's got an opening in the
// room, then I need to be able to see up to it"). A floor is over a viewer's head only where it really is: under
// an opening of it he is not under it. And a viewer standing in an opening of a floor, no more than PIT below it
// (a pool, a sunken pit), is still in that floor's room.
export const PIT=1.5;
const over=(s,p)=>insideRoom(p,s.points)&&!(s.holes||[]).some(hole=>insideRoom(p,hole));
export function compileBuildingCutaway(surfaces){
 // Temporary solid cubes are obstacles, not room envelopes. A lid touching a
 // building must never classify an exterior observer as inside that building.
 const remaining=new Set(surfaces.filter(s=>!s.templateCube)),groups=[];
 while(remaining.size){const seed=remaining.values().next().value,group=[seed];remaining.delete(seed);
  for(let i=0;i<group.length;i++)for(const other of remaining)if(connectedSurfaces(group[i],other)){group.push(other);remaining.delete(other);}
  groups.push(group);
 }
 return (viewer,eye,feet=eye-1)=>{
  const hidden=new Set();
  // The surfaces of every building the viewer is inside, hidden or not: its floors above him are outlined by their open edges.
  hidden.inside=new Set();
  for(const group of groups){
   const above=group.filter(s=>s.height>eye+1e-6&&over(s,viewer));
   if(!above.length)continue;
   for(const s of group)hidden.inside.add(s.id);
   const ceiling=Math.min(...above.map(s=>s.height));
   const supports=group.filter(s=>s.kind==='floor'&&insideRoom(viewer,s.points)&&(s.height<=feet+1e-6||(s.height<=feet+PIT+1e-6&&!over(s,viewer))));
   const interiorBase=supports.length?Math.min(...supports.map(s=>s.height)):ceiling;
   for(const s of group)if(s.height>=ceiling-1e-6||(s.kind==='roof'&&s.height>=interiorBase-1e-6))hidden.add(s.id);
  }
  return hidden;
 };
}
