import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountFogOfWar,renderFog,renderFogSelection,isFogSelectActive} from '../fog-of-war.js';
import {beginPlayerVisibility,confirmPlayerHeightPaint,confirmPlayerNoHeightPaint} from '../player-visibility-ready.js';
const view={mapLoaded:true,mapPixelSize:{width:100,height:100}};
function setup(){
 const previous=globalThis.document;
 const dom=new JSDOM('<html><body><div id="vtt-app"><button data-settings-launch="fog"></button><div id="vtt-map-transform"></div><div id="vtt-map-surface"></div><canvas id="vtt-fog-layer"></canvas><canvas id="vtt-fog-selection-layer"></canvas></div></body></html>');
 globalThis.document=dom.window.document;
 const clears=[];
 for(const canvas of document.querySelectorAll('canvas'))canvas.getContext=()=>({clearRect(...rect){clears.push([canvas.id,...rect]);}});
 return {clears,restore(){mountFogOfWar({isGm:false});if(previous===undefined)delete globalThis.document;else globalThis.document=previous;dom.window.close();}};
}
function state(scene,height){return {boardState:{activeSceneId:scene,mapUrl:`/${scene}.jpg`,templates:{[scene]:[]},sceneState:{[scene]:{
 environment:height?{walls:{value:{}}}:{},fogOfWar:{byLevel:{'level-0':{enabled:true,revealedCells:{}}}},
}}}};}
const pending=()=>document.documentElement.classList.contains('vtt-player-visibility-pending');
test('ordinary renderer clears obsolete fog while automatic height readiness still protects players',()=>{
 const env=setup();try{
  mountFogOfWar({isGm:false,viewState:view,getActiveLevelId:()=> 'level-0'});
  const flat=state('retired-flat',false);beginPlayerVisibility(flat);renderFog(flat);
  assert.equal(pending(),true,'Ordinary clear still awaits map readiness');
  confirmPlayerNoHeightPaint(flat,view);
  assert.equal(pending(),false,'Prepared flat map opens without obsolete manual masking');
  const layered=state('retired-layered',true),before=structuredClone(layered);
  beginPlayerVisibility(layered);renderFog(layered);
  assert.equal(pending(),true,'Clearing manual fog cannot bypass automatic wall/height preparation');
  assert.equal(document.getElementById('vtt-map-transform').inert,true);
  confirmPlayerHeightPaint(layered,view);
  assert.equal(pending(),false);assert.deepEqual(layered,before);
  assert.deepEqual(env.clears.filter(c=>c[0]==='vtt-fog-layer'),[
   ['vtt-fog-layer',0,0,100,100],['vtt-fog-layer',0,0,100,100],
  ]);
 }finally{env.restore();}
});
test('GM retains automatic reset panel but no manual controls or map gesture listeners',()=>{
 const env=setup();try{
  const surface=document.getElementById('vtt-map-surface'),listeners=[];
  surface.addEventListener=(type)=>listeners.push(type);
  mountFogOfWar({isGm:true,viewState:view});
  const panel=document.getElementById('vtt-fog-panel');
  const reset=document.createElement('div');reset.dataset.gmVision='';reset.innerHTML='<button data-reset-explored>Reset explored areas</button>';
  panel.append(reset);
  const obsolete=document.createElement('div');obsolete.className='vtt-fog-panel__actions';obsolete.innerHTML='<button data-fog-select>Select</button><button data-fog-add>Add</button>';
  panel.append(obsolete);
  mountFogOfWar({isGm:true,viewState:view});
  assert.equal(panel.querySelector('[data-gm-vision]'),reset);
  assert.equal(panel.querySelector('[data-fog-toggle],[data-fog-select],[data-fog-clear],[data-fog-add]'),null);
  assert.deepEqual(listeners,[],'Retired tool cannot intercept token drags');
  assert.equal(isFogSelectActive(),false);
  renderFogSelection();assert.equal(env.clears.at(-1)[0],'vtt-fog-selection-layer');
 }finally{env.restore();}
});
