import * as THREE from 'three';

// Board camera. Every mouse button is its own gesture, so they combine: hold a
// token with the left button while the middle button turns the view, the right
// button drags the ground and the wheel zooms, in any mix at once.
// The camera keeps the OrbitControls shape other code relies on: `target`,
// `update()`, distance and tilt limits.
export function createCameraControls(camera){
 const target=new THREE.Vector3(),offset=new THREE.Vector3(),spherical=new THREE.Spherical();
 const controls={target,enabled:true,minDistance:.8,maxDistance:210,minPolarAngle:.02,maxPolarAngle:1.42,rotateSpeed:.0055,
  // Turn about the target by a pointer movement in pixels.
  orbit(dx,dy){
   offset.copy(camera.position).sub(target);spherical.setFromVector3(offset);
   spherical.theta-=dx*controls.rotateSpeed;spherical.phi=Math.max(controls.minPolarAngle,Math.min(controls.maxPolarAngle,spherical.phi-dy*controls.rotateSpeed));
   offset.setFromSpherical(spherical);camera.position.copy(target).add(offset);camera.lookAt(target);camera.updateMatrixWorld();
  },
  update(){
   offset.copy(camera.position).sub(target);
   const length=offset.length();
   if(length<1e-6){camera.position.copy(target).add(new THREE.Vector3(0,controls.minDistance,0));offset.copy(camera.position).sub(target);}
   spherical.setFromVector3(offset);
   spherical.radius=Math.max(controls.minDistance,Math.min(controls.maxDistance,spherical.radius));
   spherical.phi=Math.max(controls.minPolarAngle,Math.min(controls.maxPolarAngle,spherical.phi));spherical.makeSafe();
   offset.setFromSpherical(spherical);camera.position.copy(target).add(offset);camera.lookAt(target);camera.updateMatrixWorld();
   return true;
  },
  dispose(){},
 };
 return controls;
}

// Pointer gestures for the camera, read from the pressed-button mask on every
// pointer event so a button pressed while another is held (which browsers report
// as a pointermove, not a pointerdown) still starts its own gesture.
//  middle: orbit · right: take hold of the ground · wheel: zoom toward the pointer.
// `inBoard(event)` says whether a gesture may start at this event's target.
export function bindCameraInput({controls,zoomAt,grabStart,grabMove,inBoard,onChange=()=>{},onRightClick=null}){
 let buttons=0,orbiting=false,panning=false,panTravel=0,last=null,suppressMenu=false;
 const MIDDLE=4,RIGHT=2;
 function sync(e){
  const now=e.buttons|0,pressed=now&~buttons,released=buttons&~now;buttons=now;
  if(released&MIDDLE)orbiting=false;
  if(released&RIGHT){if(panning&&panTravel>5)suppressMenu=true;else if(panning&&onRightClick?.(e))suppressMenu=true;panning=false;}
  if(pressed&&inBoard(e)){
   if(pressed&MIDDLE){orbiting=true;}
   if(pressed&RIGHT&&!e.altKey){panning=true;panTravel=0;grabStart(e.clientX,e.clientY);}
  }
  return {pressed,released};
 }
 function down(e){const before=buttons;const {pressed}=sync(e);if(!(pressed&(MIDDLE|RIGHT)))return;if(!inBoard(e))return;
  // The 2D board must not also pan or zoom; the middle button must not autoscroll.
  if(pressed&MIDDLE)e.preventDefault();
  if((pressed&RIGHT)&&!e.altKey)e.stopImmediatePropagation();
  last={x:e.clientX,y:e.clientY};void before;}
 function move(e){
  sync(e);
  const prev=last||{x:e.clientX,y:e.clientY};const dx=e.clientX-prev.x,dy=e.clientY-prev.y;last={x:e.clientX,y:e.clientY};
  let changed=false;
  if(orbiting&&(dx||dy)){controls.orbit(dx,dy);changed=true;}
  if(panning){panTravel+=Math.hypot(dx,dy);if(dx||dy){grabMove(e.clientX,e.clientY);changed=true;}}
  if(changed)onChange(e);
 }
 function up(e){sync(e);last={x:e.clientX,y:e.clientY};}
 function wheel(e){if(!inBoard(e))return;e.preventDefault();e.stopImmediatePropagation();zoomAt(e.clientX,e.clientY,e.deltaY*(e.deltaMode===1?33:e.deltaMode===2?400:1));onChange(e);}
 function menu(e){if(suppressMenu){suppressMenu=false;e.preventDefault();e.stopImmediatePropagation();}}
 function mouseDown(e){if(e.button===1&&inBoard(e))e.preventDefault();}
 function blur(){buttons=0;orbiting=false;panning=false;}
 window.addEventListener('pointerdown',down,true);window.addEventListener('pointermove',move,true);window.addEventListener('pointerup',up,true);window.addEventListener('pointercancel',up,true);
 window.addEventListener('wheel',wheel,{capture:true,passive:false});window.addEventListener('contextmenu',menu,true);window.addEventListener('mousedown',mouseDown,true);window.addEventListener('blur',blur);
 return {get panning(){return panning;},get orbiting(){return orbiting;},dispose(){
  window.removeEventListener('pointerdown',down,true);window.removeEventListener('pointermove',move,true);window.removeEventListener('pointerup',up,true);window.removeEventListener('pointercancel',up,true);
  window.removeEventListener('wheel',wheel,{capture:true});window.removeEventListener('contextmenu',menu,true);window.removeEventListener('mousedown',mouseDown,true);window.removeEventListener('blur',blur);}};
}
