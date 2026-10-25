import * as THREE from 'three';

// "1st person" (Brandon, October 21, 2026): a button beside My token / Find token puts the camera at a model's eyes,
// just in front of it so the view is not from inside it, looking out from where it stands. The selected token's model
// if one is selected; otherwise, for a player, their own token. Drag with any mouse button (or the arrow keys, A and D)
// to look around; the wheel widens or narrows the view. The button again, or Escape, puts the camera back where it was.
// Only this viewer's camera changes; nothing is saved or sent. The board's own camera input is left alone and simply
// overridden each frame while the view is on.
const AHEAD=.5;        // squares in front of the model's middle, so its body is behind the camera
const LOOK=6;          // how far ahead the board's camera target is kept
const EYE=.92;         // eye height as a share of the model's height
const TURN=.0045;      // radians per pixel of drag
const FOV=[32,95];

const waitFor=(test,ms=200)=>new Promise(resolve=>{const tick=()=>test()?resolve():setTimeout(tick,ms);tick();});

async function start(){
 await waitFor(()=>window.vtt3dRenderer?.ready&&window.vtt3dBridge&&document.querySelector('[data-action="return-token-floor"]'));
 const api=window.vtt3dRenderer,bridge=window.vtt3dBridge;
 const style=document.createElement('style');
 style.textContent='.vtt3d-first-person-self{opacity:0!important;pointer-events:none!important}'+
  '.vtt3d-first-person-button[aria-pressed="true"]{background:#c99a3b;color:#1d140b;border-color:#f0d08a}';
 document.head.append(style);
 const anchor=document.querySelector('[data-action="return-token-floor"]');
 const button=document.createElement('button');button.type='button';button.className=anchor.className+' vtt3d-first-person-button';
 button.textContent='1st person';button.setAttribute('aria-pressed','false');button.dataset.action='first-person';
 button.title='See from a model: the selected token, or your own. Drag to look around; the wheel zooms the view. Press again or Escape to leave.';
 anchor.after(button);

 let on=null; // {id, yaw, pitch, saved:{position,target,limits,fov}, view, hidden}
 const say=(words,kind='info')=>{window.UIKit?.toast?.(words,kind);const s=document.querySelector('#active-scene-status');if(s)s.textContent=words;};
 const placements=()=>bridge.getContext().placements||[];
 const find=id=>placements().find(p=>p.id===id)||null;
 // A player's own token: the scene's primary token for their sheet, else a token named for them, else one they can move.
 function ownToken(){
  const ctx=bridge.getContext(),me=String(ctx.user?.name||'').toLowerCase();if(!me||ctx.isGM)return null;
  const list=placements(),words=p=>String(p.name||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().split(' ');
  return list.find(p=>p.primaryPc&&String(p.characterProfileId||'').toLowerCase()===me)
   ||list.find(p=>String(p.characterProfileId||'').toLowerCase()===me)
   ||list.find(p=>words(p).includes(me))
   ||null;
 }
 // Where the model stands and how tall it is: its mini's top when it has one, else a standing token's height.
 function body(id){
  const p=find(id),view=api.view;if(!p||!view)return null;
  const w=p.width||1,h=p.height||1,x=p.column+w/2,y=p.row+h/2,z=bridge.heightFor(id)??0;
  let top=null;const root=view.scene.getObjectByName('vtt-hero-minis');
  if(root)for(const mini of root.children){if(!mini.visible||Math.abs(mini.position.x-x)>.05||Math.abs(mini.position.z-y)>.05)continue;
   const box=new THREE.Box3().setFromObject(mini);if(Number.isFinite(box.max.y))top=box.max.y;break;}
  const tall=top!==null?Math.max(.4,top-z):1.1*Math.max(w,h);
  return {x,y,z,eye:z+tall*EYE,size:Math.max(w,h)};
 }
 function apply(){
  if(!on)return;const view=api.view;
  if(!view||view!==on.view){stop('The board changed: 1st person ended.');return;}
  const b=body(on.id);if(!b){stop('That token is gone: 1st person ended.');return;}
  const dir=new THREE.Vector3(Math.sin(on.yaw)*Math.cos(on.pitch),Math.sin(on.pitch),Math.cos(on.yaw)*Math.cos(on.pitch));
  const ahead=AHEAD*b.size;
  const eye=new THREE.Vector3(b.x+Math.sin(on.yaw)*ahead,b.eye,b.y+Math.cos(on.yaw)*ahead);
  view.camera.position.copy(eye);view.controls.target.copy(eye).addScaledVector(dir,LOOK);
  view.camera.lookAt(view.controls.target);view.camera.updateMatrixWorld();
  const el=bridge.getTokenElement?.(on.id);if(el!==on.hidden){on.hidden?.classList.remove('vtt3d-first-person-self');el?.classList.add('vtt3d-first-person-self');on.hidden=el||null;}
 }
 function begin(id){
  const view=api.view;if(!view)return;
  const c=view.controls,cam=view.camera,b=body(id);if(!b){say('That token is not on this board.','warning');return;}
  // Start looking the way the camera already faces, level with the horizon.
  const facing=new THREE.Vector3();cam.getWorldDirection(facing);
  // Tilted down toward the ground about 12 squares ahead, so a model up on an island looks out over the board, not at sky.
  const yaw=Math.atan2(facing.x,facing.z),ahead=view.groundHeightAt?.(b.x+Math.sin(yaw)*12,b.y+Math.cos(yaw)*12)??b.z;
  const pitch=-Math.max(.05,Math.min(.75,Math.atan2(b.eye-ahead,12)));
  on={id,yaw,pitch,view,hidden:null,
   saved:{position:cam.position.clone(),target:c.target.clone(),limits:{min:c.minDistance,minPolar:c.minPolarAngle,maxPolar:c.maxPolarAngle},fov:cam.fov}};
  // Level and upward looks need the board's tilt limits opened while the view is on.
  c.minDistance=.05;c.minPolarAngle=.02;c.maxPolarAngle=Math.PI-.02;globalThis.vtt3dWheelHook=wheel;
  // Wrap the board's draw so the camera is placed just before every frame is drawn.
  on.render=view.render;view.render=dt=>{apply();return on?.render?.call(view,dt);};
  apply();button.setAttribute('aria-pressed','true');
  say(`1st person: ${find(id)?.name||'token'}. Drag to look around; Escape to leave.`);
 }
 function stop(words){
  if(!on)return;const was=on;on=null;
  const view=was.view;if(view){view.render=was.render;const c=view.controls,cam=view.camera;
   globalThis.vtt3dWheelHook=null;c.minDistance=was.saved.limits.min;c.minPolarAngle=was.saved.limits.minPolar;c.maxPolarAngle=was.saved.limits.maxPolar;
   if(view===api.view){cam.position.copy(was.saved.position);c.target.copy(was.saved.target);}cam.fov=was.saved.fov;cam.updateProjectionMatrix();c.update();}
  was.hidden?.classList.remove('vtt3d-first-person-self');button.setAttribute('aria-pressed','false');if(words)say(words);
 }
 button.addEventListener('click',()=>{
  if(on){stop('1st person off.');return;}
  const ctx=bridge.getContext(),picked=ctx.selectedIds?.[0];
  const id=picked&&find(picked)?picked:ownToken()?.id;
  if(!id){say(ctx.isGM?'Select a token to see from it.':'No token of yours is on this board. Select a token to see from it.','warning');return;}
  begin(id);
 });
 // Selecting another token while the view is on moves the view to it.
 bridge.subscribe?.(ctx=>{const picked=ctx?.selectedIds?.[0];if(on&&picked&&picked!==on.id&&find(picked)){on.id=picked;on.hidden?.classList.remove('vtt3d-first-person-self');on.hidden=null;say(`1st person: ${find(picked)?.name||'token'}.`);}});
 // Looking around: a drag with any button on the board turns the view. A press on a token still reaches the token.
 let drag=null;
 const onBoard=e=>!!e.target?.closest?.('#vtt-board-canvas')&&!e.target.closest('[data-placement-id],button,input,select,textarea,[role=dialog]');
 window.addEventListener('pointerdown',e=>{if(!on||!onBoard(e))return;drag={x:e.clientX,y:e.clientY,moved:false};
  if(e.button===0&&!bridge.getContext().targetMode){e.preventDefault();e.stopPropagation();}},true);
 window.addEventListener('pointermove',e=>{if(!on||!drag||!e.buttons)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.x=e.clientX;drag.y=e.clientY;if(Math.abs(dx)+Math.abs(dy)>0)drag.moved=true;
  on.yaw-=dx*TURN;on.pitch=Math.max(-1.35,Math.min(1.35,on.pitch-dy*TURN));if(e.buttons&1){e.stopPropagation();}},true);
 window.addEventListener('pointerup',e=>{if(drag&&on&&e.button===0&&onBoard(e)){e.stopPropagation();}drag=null;},true);
 // The wheel widens or narrows the view (the board camera hands it over through globalThis.vtt3dWheelHook while the view is on).
 const wheel=e=>{const cam=api.view?.camera;if(!on||!cam)return false;cam.fov=Math.max(FOV[0],Math.min(FOV[1],cam.fov+Math.sign(e.deltaY)*4));cam.updateProjectionMatrix();return true;};
 window.addEventListener('keydown',e=>{if(!on||e.target?.closest?.('input,textarea,select,[contenteditable="true"]'))return;
  if(e.key==='Escape'){stop('1st person off.');return;}
  const turn={ArrowLeft:[.06,0],ArrowRight:[-.06,0],a:[.06,0],A:[.06,0],d:[-.06,0],D:[-.06,0],ArrowUp:[0,.05],ArrowDown:[0,-.05]}[e.key];
  if(turn){on.yaw+=turn[0];on.pitch=Math.max(-1.35,Math.min(1.35,on.pitch+turn[1]));e.preventDefault();e.stopPropagation();}},true);
 document.addEventListener('vtt3d:scene-built',()=>{if(on&&api.view!==on.view)stop('The scene changed: 1st person ended.');});
 window.vtt3dFirstPerson={get active(){return on?{id:on.id,yaw:on.yaw,pitch:on.pitch}:null;},
  // The eye point the camera uses for a model (Vision (test) looks from the same spot): the camera itself while in 1st person.
  eyeOf:id=>{if(on&&on.id===id&&api.view)return api.view.camera.position.clone();const b=body(id);return b?new THREE.Vector3(b.x,b.eye,b.y):null;},start:id=>{if(on)stop();begin(id);},stop:()=>stop('1st person off.')};
}
start().catch(error=>console.error('[VTT 3D] 1st person',error));
