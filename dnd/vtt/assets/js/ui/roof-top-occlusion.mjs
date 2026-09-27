import {connectedSurfaces} from './building-cutaway.mjs';
import {onSurface,supportAt} from './stacked-surfaces.mjs';
import {insideRoom} from './roof-geometry.mjs';
import {nearestOnSegment} from './wall-geometry.mjs';
import {wallHeights} from './wall-properties.mjs';

// A doorway reveals the storey below the observer's eye, not the highest
// storey under the roof. Actual sight still checks every intervening ceiling.
export function roofRevealHeight(roof,surfaces,p,eye,groundAt){
 return supportAt(surfaces.filter(s=>s.id!==roof.id),p,Math.min(eye,roof.height-.01))?.height??groundAt(p.x,p.y);
}

// Only roof artwork ignores walls fully enclosed beneath it. Physical sight
// still uses the complete wall model, including doors and interior partitions.
export function wallUnderRoof(roof,edge,a,b,groundAt){
 if(roof.kind!=='roof')return false;
 const covered=p=>insideRoom(p,roof.points)||roof.points.some((u,i)=>{const q=nearestOnSegment(p,u,roof.points[(i+1)%roof.points.length]);return Math.hypot(q.x-p.x,q.y-p.y)<1e-7;});
 const dx=b.x-a.x,dy=b.y-a.y,cuts=[0,1],at=t=>({x:a.x+dx*t,y:a.y+dy*t});
 for(let i=0;i<roof.points.length;i++){
  const u=roof.points[i],v=roof.points[(i+1)%roof.points.length],ex=v.x-u.x,ey=v.y-u.y,den=dx*ey-dy*ex;
  if(Math.abs(den)<1e-9)continue;
  const t=((u.x-a.x)*ey-(u.y-a.y)*ex)/den,s=((u.x-a.x)*dy-(u.y-a.y)*dx)/den;
  if(t>0&&t<1&&s>=0&&s<=1)cuts.push(t);
 }
 cuts.sort((x,y)=>x-y);
 if(!cuts.every((t,i)=>covered(at(t))&&(!i||covered(at((t+cuts[i-1])/2)))))return false;
 const steps=Math.max(1,Math.ceil(Math.hypot(dx,dy)*8));
 for(let i=0;i<=steps;i++)if(wallHeights(edge,a,b,at(i/steps),groundAt).top>roof.height+.001)return false;
 return true;
}

// An exterior roof represents the cover over its lower storeys. A balcony hole
// in one of those storeys must not punch a matching hole in that roof's display.
// Keep unrelated foreground plates and all higher plates as sight blockers.
export function roofTopOccluders(roof,surfaces){
 const candidates=surfaces.filter(s=>s.id!==roof.id&&!(roof.kind==='roof'&&s.height<roof.height&&connectedSurfaces(roof,s)));
 return p=>candidates.filter(s=>s.height>=roof.height||!onSurface(s,p));
}
export function roofTopRamps(roof,ramps){
 if(roof.kind!=='roof')return ramps;
 const covered=p=>insideRoom(p,roof.points)||roof.points.some((a,i)=>{const q=nearestOnSegment(p,a,roof.points[(i+1)%roof.points.length]);return Math.hypot(q.x-p.x,q.y-p.y)<1e-7;});
 return ramps.filter(r=>r.height>roof.height+1e-7||![{x:r.left,y:r.top},{x:r.right,y:r.top},{x:r.right,y:r.bottom},{x:r.left,y:r.bottom},{x:(r.left+r.right)/2,y:(r.top+r.bottom)/2}].every(covered));
}
