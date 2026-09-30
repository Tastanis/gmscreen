import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
const dom=new JSDOM('<div id="vtt-fog-panel"><div class="vtt-fog-panel__header"></div></div>');
globalThis.document=dom.window.document;globalThis.window=dom.window;globalThis.localStorage={getItem:()=>null,setItem(){}};

const frames=[];globalThis.requestAnimationFrame=fn=>frames.push(fn);
const state={boardState:{activeSceneId:'scene',placements:{scene:[]},sceneState:{scene:{fogOfWar:{byLevel:{'level-0':{enabled:false,revealedCells:{'1,1':true}}}}}}}};
const c={state,isGM:true,levelId:'level-0',selectedIds:[]};window.terrainContext=()=>c;
const {gmVision}=await import('../gm-vision.js');
const tick=()=>frames.shift()();
const flush=()=>new Promise(resolve=>setImmediate(resolve));
let pending,requests=[];window.submitEnvironmentCommand=descriptor=>{requests.push(descriptor);return new Promise((resolve,reject)=>pending={resolve,reject});};
window.alert=()=>{};
test('GM automatic fog toggle waits for acceptance and preserves legacy records',async()=>{
 tick();const input=document.querySelector('[data-automatic-fog]');
 assert.equal(input.checked,true,'Legacy manual enabled=false must not disable automatic fog');
 const before=structuredClone(state),revision=gmVision.revision;
 input.checked=false;input.dispatchEvent(new window.Event('change'));
 assert.equal(input.disabled,true);assert.equal(input.checked,true,'Pending write shows confirmed value');
 assert.deepEqual(state,before,'No optimistic shared state mutation');
 assert.deepEqual(requests[0],{type:'fog.set',sceneId:'scene',payload:{fogOfWar:{byLevel:{'level-0':{enabled:false,revealedCells:{'1,1':true}}},automaticEnabled:false}}});
 state.boardState.sceneState.scene.fogOfWar.automaticEnabled=false;pending.resolve([{}]);await flush();
 assert.equal(input.disabled,false);assert.equal(input.checked,false);assert.equal(gmVision.fogEnabled,false);assert.equal(gmVision.lighting,false);
 assert.ok(gmVision.revision>revision,'Canonical change invalidates lighting signature');
 c.isGM=false;assert.equal(gmVision.lighting,false,'Player honors the same canonical toggle');c.isGM=true;
 input.checked=true;input.dispatchEvent(new window.Event('change'));
 const oldError=console.error;console.error=()=>{};try{pending.reject(Error('rejected'));await flush();}finally{console.error=oldError;}
 assert.equal(input.checked,false,'Rejected write restores confirmed checkbox');assert.equal(input.disabled,false);assert.equal(gmVision.fogEnabled,false);
 c.isGM=false;const count=requests.length;input.checked=true;input.dispatchEvent(new window.Event('change'));await flush();assert.equal(requests.length,count,'Player cannot dispatch GM setting');
 tick();assert.equal(document.querySelector('[data-automatic-fog]'),null,'No active toggle for player');
});
