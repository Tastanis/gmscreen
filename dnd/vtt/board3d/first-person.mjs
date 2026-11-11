import * as THREE from 'three';
import {roofSurfaces} from '../assets/js/ui/roof-geometry.mjs';
import {supportAt} from '../assets/js/ui/stacked-surfaces.mjs';
import {rampHeight} from '../assets/js/ui/imported-ramps.mjs';
import {normalizeSettings,lookVector,turnLook,moveIntent,stepCamera,standHeight,followGround,flyFloor,eyeHeightFor,startPitch,MOVE_KEYS} from './first-person-motion.mjs';

// "1st person" (Brandon, October 21, 2026): a button beside My token / Find token puts the camera at a model's eyes,
// just in front of it so the view is not from inside it, looking out from where it stands. The selected token's model
// if one is selected; otherwise, for a player, their own token. The wheel widens or narrows the view. The button again,
// or Escape, puts the camera back where it was. Only this viewer's camera changes; nothing is saved or sent. The board's
// own camera input is left alone and simply overridden each frame while the view is on.
//
// Walk and fly (Brandon, November 10, 2026): "I want a first-person view to use movement where you can fly around with
// the camera basically. WASD will move you around the camera. It will move you forward, back, side, side. And then the
// mouse will aim you in different directions so that you can walk. We'll have it keep you stuck to the ground unless
// your character has the flying turned on, in which case you can just fly around freely with the camera."
//  - V (or the 1st person button) goes in and out; Escape leaves and puts the camera back exactly.
//  - Click the board to catch the mouse: moving it aims. Without that, a drag aims (the October way).
//  - W A S D walk forward, back and to the sides of the way you look; Shift is faster; the arrow keys turn too.
//  - On foot the eye stays on the ground: the terrain, floor plates and stairs, by the board's own rule for what is
//    under a raised token (height-tethers.mjs). A token with Fly or Hover on flies: W goes where you look, Space or Q
//    up, C or E down. F switches walking and flying for the camera (it never refuses the Director; it is only a view).
//  - Walking never moves the token, and Vision still sees from the token itself, not from the wandering camera.
// Every number is in the settings (first-person-motion.mjs FIRST_PERSON_DEFAULTS); localStorage 'vtt-first-person'
// (JSON) or window.vttFirstPersonSettings may override any of them.
const LOOK=6;          // how far ahead the board's camera target is kept
const SETTINGS_KEY='vtt-first-person';

const waitFor=(test,ms=200)=>new Promise(resolve=>{const tick=()=>test()?resolve():setTimeout(tick,ms);tick();});
let pageSettings={};   // set from the console for this page only when localStorage is not available
function storedSettings(){try{const saved=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}');return saved&&typeof saved==='object'?saved:{};}catch(_){return {};}}
function readSettings(){return normalizeSettings({...storedSettings(),...pageSettings,...(window.vttFirstPersonSettings||{})});}

async function start(){
 await waitFor(()=>window.vtt3dRenderer?.ready&&window.vtt3dBridge&&document.querySelector('[data-action="return-token-floor"]'));
 const api=window.vtt3dRenderer,bridge=window.vtt3dBridge;
 let settings=readSettings();
 const style=document.createElement('style');
 style.textContent='.vtt3d-first-person-self{opacity:0!important;pointer-events:none!important}'+
  '.vtt3d-first-person-button[aria-pressed="true"]{background:#c99a3b;color:#1d140b;border-color:#f0d08a}'+
  '.vtt3d-first-person-hint{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:60;pointer-events:none;'+
  'background:rgba(20,16,10,.78);color:#f3e6c8;border:1px solid rgba(240,208,138,.45);border-radius:6px;padding:5px 10px;'+
  'font:12px/1.35 system-ui,sans-serif;white-space:nowrap;max-width:calc(100vw - 32px);overflow:hidden;text-overflow:ellipsis}';
 document.head.append(style);
 const anchor=document.querySelector('[data-action="return-token-floor"]');
 const button=document.createElement('button');button.type='button';button.className=anchor.className+' vtt3d-first-person-button';
 button.textContent='1st person';button.setAttribute('aria-pressed','false');button.dataset.action='first-person';
 button.title='See from a model (the selected token, or your own) and walk with W A S D; click the board so the mouse aims. Flying tokens fly. V or Escape to leave.';
 anchor.after(button);

 let on=null; // {id, yaw, pitch, view, saved, hidden, render, free, pos, feet, eyeHeight, flying, flyChosen}
 const held=new Set();
 let hint=null,releasing=false;
 const say=(words,kind='info')=>{window.UIKit?.toast?.(words,kind);const s=document.querySelector('#active-scene-status');if(s)s.textContent=words;};
 const placements=()=>bridge.getContext().placements||[];
 const find=id=>placements().find(p=>p.id===id)||null;
 const flies=p=>['fly','hover'].includes(p?.movementMode);
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
  return {x,y,z,eye:z+eyeHeightFor(tall,settings),size:Math.max(w,h)};
 }
 // The camera just in front of the model, the way it looks.
 const besideModel=(b,yaw)=>new THREE.Vector3(b.x+Math.sin(yaw)*settings.ahead*b.size,b.eye,b.y+Math.cos(yaw)*settings.ahead*b.size);
 // The ground and what can be stood on at a point (squares), by the board's own data: the terrain, the floor plates
 // (roofSurfaces, as height tethers use) and the stairs. `probe` is the highest a walker can step onto from where it is.
 let plateModel=null,plates=[];
 function terrainAt(x,y){
  const tp=window.terrainPrototype,v=bridge.getContext().view||{},g=v.gridSize||64,ox=v.gridOffsets?.left||0,oy=v.gridOffsets?.top||0;
  const h=tp?.heightAt?tp.heightAt(ox+x*g,oy+y*g):api.view?.groundHeightAt?.(x,y);return Number.isFinite(h)?h:0;
 }
 function standAt(x,y,probe){
  const model=window.wallPrototype?.model;
  if(model!==plateModel){plateModel=model;try{plates=model?roofSurfaces(model):[];}catch(_){plates=[];}}
  const plate=plates.length?supportAt(plates,{x,y},probe)?.height:null;
  const stairs=(model?.ramps||[]).map(r=>rampHeight(r,x,y)).filter(h=>h!==null);
  return standHeight(probe,terrainAt(x,y),plate!=null?[plate]:[],stairs);
 }
 function showHint(){
  if(!on){hint?.remove();hint=null;return;}
  if(!hint){hint=document.createElement('div');hint.className='vtt3d-first-person-hint';hint.setAttribute('aria-live','polite');document.body.append(hint);}
  const caught=document.pointerLockElement===lockTarget();
  hint.textContent=`1st person · ${on.flying?'Flying: W where you look, Space/Q up, C/E down':'Walking: W A S D'} · Shift faster · F ${on.flying?'walk':'fly'} · `+
   `${caught?'mouse aims':'click the board to aim'} · Esc leaves`;
 }
 function apply(dt){
  if(!on)return;const view=api.view;
  if(!view||view!==on.view){stop('The board changed: 1st person ended.');return;}
  const step=Math.max(0,Math.min(Number(dt)||0,.1)),intent=moveIntent(held);
  if(intent.turn||intent.tilt){const t=turnLook(on,intent.turn*settings.keyTurnSpeed*step,-intent.tilt*settings.keyTurnSpeed*step,1,settings.pitchLimit);on.yaw=t.yaw;on.pitch=t.pitch;}
  if(!on.free&&on.id){
   // Until the first step, the view stays on the model (it follows the token if the token moves).
   const b=body(on.id);if(!b){stop('That token is gone: 1st person ended.');return;}
   on.pos=besideModel(b,on.yaw);on.eyeHeight=b.eye-b.z;on.feet=b.z;
   if(on.flyChosen===null&&on.flying!==flies(find(on.id))){on.flying=flies(find(on.id));showHint();}
  }
  const moving=!!(intent.forward||intent.strafe||(on.flying&&intent.rise));
  if(moving&&!on.free){on.free=true;on.hidden?.classList.remove('vtt3d-first-person-self');on.hidden=null;}
  if(moving){const next=stepCamera(on.pos,on,intent,step,settings,{flying:on.flying});on.pos.set(next.x,next.y,next.z);}
  if(on.free){
   if(on.flying){on.pos.y=flyFloor(on.pos.y,terrainAt(on.pos.x,on.pos.z),settings.flyClearance);on.feet=on.pos.y-on.eyeHeight;}
   else{on.feet=followGround(on.feet,standAt(on.pos.x,on.pos.z,on.feet+settings.stepUp),step,settings.followRate);on.pos.y=on.feet+on.eyeHeight;}
  }
  const dir=lookVector(on.yaw,on.pitch);
  view.camera.position.copy(on.pos);view.controls.target.set(on.pos.x+dir.x*LOOK,on.pos.y+dir.y*LOOK,on.pos.z+dir.z*LOOK);
  view.camera.lookAt(view.controls.target);view.camera.updateMatrixWorld();
  if(!on.free&&on.id){const el=bridge.getTokenElement?.(on.id);if(el!==on.hidden){on.hidden?.classList.remove('vtt3d-first-person-self');el?.classList.add('vtt3d-first-person-self');on.hidden=el||null;}}
 }
 function begin(id){
  const view=api.view;if(!view)return;
  settings=readSettings();
  const c=view.controls,cam=view.camera,b=id?body(id):null;if(id&&!b){say('That token is not on this board.','warning');return;}
  // Start looking the way the camera already faces, level with the horizon.
  const facing=new THREE.Vector3();cam.getWorldDirection(facing);const yaw=Math.atan2(facing.x,facing.z);
  // No token: on the ground in the middle of the view, at an ordinary eye height.
  let pos,feet,eyeHeight;
  if(b){pos=besideModel(b,yaw);feet=b.z;eyeHeight=b.eye-b.z;}
  else{const x=c.target.x,y=c.target.z;feet=standAt(x,y,Math.max(terrainAt(x,y),c.target.y)+settings.stepUp);eyeHeight=settings.defaultEyeHeight;pos=new THREE.Vector3(x,feet+eyeHeight,y);}
  // Tilted down toward the ground about 12 squares ahead, so a model up on an island looks out over the board, not at sky.
  const pitch=startPitch(pos.y,view.groundHeightAt?.(pos.x+Math.sin(yaw)*12,pos.z+Math.cos(yaw)*12)??feet,12);
  on={id:b?id:null,yaw,pitch,view,hidden:null,free:!b,pos,feet,eyeHeight,flying:b?flies(find(id)):false,flyChosen:null,
   saved:{position:cam.position.clone(),target:c.target.clone(),limits:{min:c.minDistance,minPolar:c.minPolarAngle,maxPolar:c.maxPolarAngle},fov:cam.fov}};
  // Level and upward looks need the board's tilt limits opened while the view is on.
  c.minDistance=.05;c.minPolarAngle=.02;c.maxPolarAngle=Math.PI-.02;globalThis.vtt3dWheelHook=wheel;
  // Wrap the board's draw so the camera is placed just before every frame is drawn.
  on.render=view.render;view.render=dt=>{apply(dt);return on?.render?.call(view,dt);};
  apply(0);button.setAttribute('aria-pressed','true');showHint();
  say(`1st person: ${b?find(id)?.name||'token':'the middle of the view'}. W A S D to walk; click the board so the mouse aims; Escape to leave.`);
 }
 function stop(words){
  if(!on)return;const was=on;on=null;held.clear();
  if(document.pointerLockElement){releasing=true;try{document.exitPointerLock();}catch(_){releasing=false;}}
  const view=was.view;if(view){view.render=was.render;const c=view.controls,cam=view.camera;
   globalThis.vtt3dWheelHook=null;c.minDistance=was.saved.limits.min;c.minPolarAngle=was.saved.limits.minPolar;c.maxPolarAngle=was.saved.limits.maxPolar;
   if(view===api.view){cam.position.copy(was.saved.position);c.target.copy(was.saved.target);}cam.fov=was.saved.fov;cam.updateProjectionMatrix();c.update();}
  was.hidden?.classList.remove('vtt3d-first-person-self');button.setAttribute('aria-pressed','false');showHint();if(words)say(words);
 }
 function toggle(){
  if(on){stop('1st person off.');return;}
  const ctx=bridge.getContext(),picked=ctx.selectedIds?.[0];
  const id=picked&&find(picked)?picked:ownToken()?.id;
  begin(id||null);
 }
 button.addEventListener('click',toggle);
 // Selecting another token while the view is on moves the view to it (and to its way of moving).
 bridge.subscribe?.(ctx=>{const picked=ctx?.selectedIds?.[0];if(on&&picked&&picked!==on.id&&find(picked)){on.id=picked;on.free=false;on.flyChosen=null;on.flying=flies(find(picked));on.hidden?.classList.remove('vtt3d-first-person-self');on.hidden=null;showHint();say(`1st person: ${find(picked)?.name||'token'}.`);}});
 // Aiming. Caught mouse (pointer lock, after a click on the board): every movement aims. Otherwise a drag with any
 // button on the board aims. A press on a token still reaches the token.
 const lockTarget=()=>api.view?.renderer?.domElement||document.querySelector('#vtt-board-canvas');
 let drag=null;
 const onBoard=e=>!!e.target?.closest?.('#vtt-board-canvas')&&!e.target.closest('[data-placement-id],button,input,select,textarea,[role=dialog]');
 const caught=()=>!!on&&!!document.pointerLockElement&&document.pointerLockElement===lockTarget();
 window.addEventListener('pointerdown',e=>{if(!on)return;if(caught()){e.preventDefault();e.stopPropagation();return;}if(!onBoard(e))return;drag={x:e.clientX,y:e.clientY,travel:0};
  if(e.button===0&&!bridge.getContext().targetMode){e.preventDefault();e.stopPropagation();}},true);
 window.addEventListener('pointermove',e=>{if(!on||!drag||!e.buttons||caught())return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.x=e.clientX;drag.y=e.clientY;drag.travel+=Math.abs(dx)+Math.abs(dy);
  const t=turnLook(on,dx,dy,settings.dragSensitivity,settings.pitchLimit);on.yaw=t.yaw;on.pitch=t.pitch;if(e.buttons&1){e.stopPropagation();}},true);
 window.addEventListener('pointerup',e=>{
  if(caught()){e.stopPropagation();drag=null;return;}
  if(drag&&on&&e.button===0&&onBoard(e)){e.stopPropagation();
   // A click (not a drag) on the board catches the mouse so it aims. Where the browser does not allow it, drag to look.
   if(drag.travel<5&&!bridge.getContext().targetMode){const el=lockTarget();try{const r=el?.requestPointerLock?.();r?.catch?.(()=>{});}catch(_){/* drag to look */}}}
  drag=null;},true);
 document.addEventListener('mousemove',e=>{if(!caught())return;const t=turnLook(on,e.movementX||0,e.movementY||0,settings.lookSensitivity,settings.pitchLimit);on.yaw=t.yaw;on.pitch=t.pitch;},true);
 // The browser lets the mouse go on Escape (the page does not get that key): that Escape leaves 1st person too.
 // Losing it to another window or tab only frees the mouse.
 document.addEventListener('pointerlockchange',()=>{
  if(document.pointerLockElement){showHint();return;}
  if(releasing){releasing=false;return;}
  if(!on)return;
  setTimeout(()=>{if(on&&!document.hidden&&document.hasFocus())stop('1st person off.');else showHint();},0);
 });
 // The wheel widens or narrows the view (the board camera hands it over through globalThis.vtt3dWheelHook while the view is on).
 const wheel=e=>{const cam=api.view?.camera;if(!on||!cam)return false;cam.fov=Math.max(settings.fov[0],Math.min(settings.fov[1],cam.fov+Math.sign(e.deltaY)*4));cam.updateProjectionMatrix();return true;};
 // Keys. Nothing happens while typing in chat or any box. With Ctrl, Alt or Cmd held, keys stay as they were (Ctrl+Z).
 const typing=t=>!!t?.closest?.('input,textarea,select,[contenteditable=""],[contenteditable="true"]')||!!t?.isContentEditable;
 window.addEventListener('keydown',e=>{
  if(typing(e.target)||e.ctrlKey||e.metaKey||e.altKey)return;
  if(!on){if(e.code==='KeyV'&&!e.repeat&&!e.shiftKey&&api.view&&!e.target?.closest?.('dialog,[role="dialog"]')){e.preventDefault();e.stopPropagation();toggle();}return;}
  if(e.key==='Escape'){stop('1st person off.');return;}   // still reaches the page: menus close as usual
  if(e.code==='KeyV'){e.preventDefault();e.stopPropagation();if(!e.repeat)stop('1st person off.');return;}
  if(e.code==='KeyF'){e.preventDefault();e.stopPropagation();if(e.repeat)return;
   on.flying=!on.flying;on.flyChosen=on.flying;if(on.flying&&!on.free&&on.id){on.free=true;on.hidden?.classList.remove('vtt3d-first-person-self');on.hidden=null;}
   showHint();say(on.flying?'1st person: flying (the camera only).':'1st person: walking.');return;}
  if(MOVE_KEYS[e.code]){held.add(e.code);e.preventDefault();e.stopPropagation();}
 },true);
 window.addEventListener('keyup',e=>{held.delete(e.code);if(e.key==='Shift'){held.delete('ShiftLeft');held.delete('ShiftRight');}},true);
 window.addEventListener('blur',()=>held.clear());document.addEventListener('visibilitychange',()=>{if(document.hidden)held.clear();});
 document.addEventListener('vtt3d:scene-built',()=>{if(on&&api.view!==on.view)stop('The scene changed: 1st person ended.');});
 window.vtt3dFirstPerson={get active(){return on?{id:on.id,yaw:on.yaw,pitch:on.pitch,walking:on.free,flying:on.flying,position:on.pos?.toArray()}:null;},
  // The eye point Vision (test) looks from for a model: the camera itself while 1st person sits on that model, else the
  // model's own eyes. A camera that has walked away never lends its spot to Vision, so walking shows nothing more.
  eyeOf:id=>{if(on&&on.id===id&&!on.free&&api.view)return api.view.camera.position.clone();const b=body(id);return b?new THREE.Vector3(b.x,b.eye,b.y):null;},
  start:id=>{if(on)stop();begin(id||null);},stop:()=>stop('1st person off.'),toggle,
  get settings(){return settings;},
  // Change any setting for this browser (kept in localStorage); null puts all back to the defaults.
  setSettings:(next)=>{if(next===null){pageSettings={};try{localStorage.removeItem(SETTINGS_KEY);}catch(_){/* nothing kept */}}
   else if(next&&typeof next==='object'){pageSettings={...pageSettings,...next};try{localStorage.setItem(SETTINGS_KEY,JSON.stringify({...storedSettings(),...next}));}catch(_){/* this page only */}}
   settings=readSettings();return settings;}};
}
start().catch(error=>console.error('[VTT 3D] 1st person',error));
