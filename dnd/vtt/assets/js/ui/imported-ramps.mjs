// Cardinal-direction imported ramps. Heights are absolute grid squares.
export function rampPlane(s){const rise=s.height-s.base,d=s.direction||'north';const a=d==='east'?rise/(s.right-s.left):d==='west'?-rise/(s.right-s.left):0,b=d==='south'?rise/(s.bottom-s.top):d==='north'?-rise/(s.bottom-s.top):0;return {a,b,c:s.base-a*(d==='west'?s.right:s.left)-b*(d==='north'?s.bottom:s.top)};}
export function rampHeight(s,x,y){const {a,b,c}=rampPlane(s);return x>=s.left-1e-7&&x<=s.right+1e-7&&y>=s.top-1e-7&&y<=s.bottom+1e-7?a*x+b*y+c:null;}
export function rampAt(ramps,p){return ramps.find(s=>rampHeight(s,p.x,p.y)!==null)||null;}
// `slant` is how far a square of height moves a thing on screen (height-view.mjs); the usual one unless the scene asks for another.
export function rampPick(s,p,slant={x:.12,y:.36}){const {a,b,c}=rampPlane(s),den=1+slant.x*a-slant.y*b;if(Math.abs(den)<1e-8)return null;const z=(a*p.x+b*p.y+c)/den,x=p.x-slant.x*z,y=p.y+slant.y*z;return rampHeight(s,x,y)!==null?{x,y}:null;}
export function rampSupports(s,actor,p){
 const level=actor.levelId||'level-0',traversal=actor._floorTraversal;
 if(level===s.toLevel)return true;
 if(level!==s.fromLevel||traversal?.entry==='barrier')return false;
 const distance=s.direction==='west'?s.right-p.x:s.direction==='east'?p.x-s.left:s.direction==='south'?p.y-s.top:s.bottom-p.y;
 // A climb (a vine, a ladder: steeper than a slope) is never stood on by accident, so a creature
 // shoved into a vine's square is on the ground under it. Paired with WallMovement::height.
 const length=s.direction==='west'||s.direction==='east'?s.right-s.left:s.bottom-s.top,slope=length>0&&Math.abs(s.height-s.base)/length<1.5-1e-6;
 return traversal?.entry==='red'||(slope&&!traversal&&distance<=2+1e-7);
}
// True when the actor is being carried by this ramp: it came onto it by the end that belongs to its floor
// (the head from the upper floor, the foot from the lower). Paired with FloorGeometry::carriedByStair.
export function rampCarries(s,actor){const level=actor?.levelId||'level-0',entry=actor?._floorTraversal?.entry;return (level===s.toLevel&&entry==='green')||(level===s.fromLevel&&entry==='red');}
export function rampGround(ramps,actor,p){const s=rampAt(ramps,p);return s&&rampSupports(s,actor,p)?rampHeight(s,p.x,p.y):null;}
// A narrow landing cue when the observer's eyes are exactly at the floor plane.
// This never grants sight by itself: callers must still test walls and ceilings.
export function landingPeekRamps(ramps,actor,ground,height){
 const p={x:actor.column+(actor.width||1)/2,y:actor.row+(actor.height||1)/2},eye=ground+Math.max(actor.width||1,actor.height||1);
 return Math.abs(eye-height)>1e-6?[]:ramps.filter(s=>Math.abs(s.height-height)<1e-6&&rampHeight(s,p.x,p.y)!==null&&rampSupports(s,actor,p));
}
export function inLandingPeek(ramps,p){return ramps.some(s=>s.direction==='west'?p.x>=s.left-1&&p.x<=s.left&&p.y>=s.top&&p.y<=s.bottom:s.direction==='east'?p.x>=s.right&&p.x<=s.right+1&&p.y>=s.top&&p.y<=s.bottom:s.direction==='south'?p.y>=s.bottom&&p.y<=s.bottom+1&&p.x>=s.left&&p.x<=s.right:p.x>=s.left&&p.x<=s.right&&p.y>=s.top-1&&p.y<=s.top);}
export function rampLanding(ramps,surfaces,actor,p,onSurface){
 const at={x:actor.column+(actor.width||1)/2,y:actor.row+(actor.height||1)/2},s=rampAt(ramps,at);
 return s&&rampSupports(s,actor,at)&&surfaces.some(f=>f.kind==='floor'&&f.levelId===s.toLevel&&onSurface(f,p))?s.height:null;
}
// The floor plate someone stands on, if any; and whether a ramp is joined to a floor: the strip
// one square beyond the ramp's top end (or its foot) lies on that floor, at that end's height.
// A stair that leaves the floor you stand on is never hidden by that floor: each part of it that
// is lower than the floor is looked for at the floor's own height (rampSightHeight), so it shows
// wherever that spot would show if the floor went on, and walls on the floor still hide it.
export const rampSightHeight=(s,floor,z,onSurface)=>floor&&rampJoins(s,floor,onSurface)?Math.max(z,floor.height):z;
export function standingFloor(surfaces,p,ground,onSurface){return surfaces.find(f=>f.kind==='floor'&&Math.abs(f.height-ground)<1e-6&&onSurface(f,p))||null;}
export function rampJoins(s,floor,onSurface){
 const d=s.direction||'north',beyond=(head,u)=>d==='east'||d==='west'?{x:(d==='east')===head?s.right+.5:s.left-.5,y:s.top+(s.bottom-s.top)*u}:{x:s.left+(s.right-s.left)*u,y:(d==='south')===head?s.bottom+.5:s.top-.5};
 return [[true,s.height],[false,s.base]].some(([head,height])=>Math.abs(floor.height-height)<1e-6&&[.25,.5,.75].some(u=>onSurface(floor,beyond(head,u))));
}
export function rampsBlock(ramps,origin,eye,target,z){
 for(const s of ramps){
  const {a,b,c}=rampPlane(s);
  const den=z-eye-a*(target.x-origin.x)-b*(target.y-origin.y);if(Math.abs(den)<1e-9)continue;
  const t=(a*origin.x+b*origin.y+c-eye)/den;if(t<=1e-6||t>=1-1e-6)continue;
  if(rampHeight(s,origin.x+(target.x-origin.x)*t,origin.y+(target.y-origin.y)*t)!==null)return true;
 }return false;
}
