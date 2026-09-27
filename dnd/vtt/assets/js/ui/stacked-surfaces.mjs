import {insideRoom} from './roof-geometry.mjs';

// Flat floor plates are independent of the continuous terrain mesh. Openings
// remove both artwork and support/occlusion; they are not dark painted patches.
export function onSurface(surface,p){
 return insideRoom(p,surface.points)&&!(surface.holes||[]).some(h=>insideRoom(p,h));
}
export function surfaceBlocks(origin,eye,target,z,surfaces){
 if(Math.abs(z-eye)<1e-7)return false;
 return surfaces.some(s=>{const t=(s.height-eye)/(z-eye);return t>1e-6&&t<1-1e-6&&onSurface(s,{x:origin.x+(target.x-origin.x)*t,y:origin.y+(target.y-origin.y)*t});});
}
export function supportAt(surfaces,p,maxHeight=Infinity){
 return surfaces.filter(s=>s.height<=maxHeight+1e-6&&onSurface(s,p)).sort((a,b)=>b.height-a.height)[0]||null;
}
export function surfacePath(surface,project){
 const path=new Path2D();for(const ring of [surface.points,...surface.holes||[]]){ring.forEach((p,i)=>{const q=project(p);if(i)path.lineTo(q.x,q.y);else path.moveTo(q.x,q.y);});path.closePath();}return path;
}
