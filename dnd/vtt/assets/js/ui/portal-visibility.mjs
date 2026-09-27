// Check the visible near face, so a closed door does not hide its own control.
export function portalVisible({a,b,base,top,viewer,ground,eye,sight}){
 if(!viewer||!sight||!Number.isFinite(ground)||ground<base-1e-4||ground>=top-1e-4)return false;
 const mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2},distance=Math.hypot(viewer.x-mid.x,viewer.y-mid.y);
 const offset=Math.min(.02,distance*.5),near=distance?{x:mid.x+(viewer.x-mid.x)/distance*offset,y:mid.y+(viewer.y-mid.y)/distance*offset}:mid;
 return sight(near,Math.min(top-.001,Math.max(base+.001,eye)));
}
