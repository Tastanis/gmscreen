import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mountFallReview} from '../fall-review.js';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const record=(id='one')=>({kind:'fall',status:'pending',actorId:'GM',sceneId:'scene',operationId:id,targetId:id,details:{squares:3}});
async function until(predicate){for(let i=0;i<100;i++){if(predicate())return;await delay(5);}assert.fail('Condition did not settle');}
function fixture(options={}){
 const matches=(el,selector)=>selector==='button'?el.tag==='button':selector==='[data-fall-review]'?Object.hasOwn(el.dataset,'fallReview'):selector==='.vtt-token--falling'?el.classList.contains('vtt-token--falling'):Object.hasOwn(el.dataset,'placementId');
 class Element {
  constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.style={};this.text='';this.disabled=false;const classes=new Set();this.classList={add:(...v)=>v.forEach(x=>classes.add(x)),remove:v=>classes.delete(v),contains:v=>classes.has(v)};}
  set textContent(value){this.text=value;} get textContent(){return this.text+this.children.map(c=>c.textContent).join('');}
  append(...children){for(const c of children){c.parent=this;this.children.push(c);}}
  remove(){this.parent.children=this.parent.children.filter(c=>c!==this);}
  setAttribute(){} getBoundingClientRect(){return {left:0,right:20,top:0,width:100,height:100};}
  querySelectorAll(selector){return this.children.flatMap(c=>[...(matches(c,selector)?[c]:[]),...c.querySelectorAll(selector)]);}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
 }
 const body=new Element('body'),mapToken=new Element('div');mapToken.dataset.placementId='one';body.append(mapToken);
 const doc={body,hidden:false,createElement:tag=>new Element(tag),querySelector:s=>body.querySelector(s),querySelectorAll:s=>body.querySelectorAll(s),addEventListener(){},removeEventListener(){}};
 const old={document:globalThis.document,innerWidth:globalThis.innerWidth,innerHeight:globalThis.innerHeight};
 Object.assign(globalThis,{document:doc,innerWidth:1280,innerHeight:720});
 let sceneId='scene',records=[],reads=0,active=0,maxActive=0,damage=0,prone=0,claims=0,animations=0,writes=[];
 const token=document.querySelector('[data-placement-id]'),add=token.classList.add.bind(token.classList);
 token.classList.add=(...names)=>{if(names.includes('vtt-token--falling'))animations++;add(...names);};
 const handle=mountFallReview({context:()=>({userId:'GM',sceneId}),placement:id=>({id,name:id}),traits:async()=>({agility:options.agility||0,size:1}),
  damage:async()=>{damage++;if(options.failDamage)throw Error('uncertain');},prone:async()=>{prone++;},
  api:async request=>{
   if(request){writes.push(request);if(options.failFinish&&request.action==='finish')throw Error('uncertain dismissal');const r=records.find(r=>r.operationId===request.operationId);if(request.action==='start'){claims++;if(r.status!=='pending')return {granted:false};r.status='applying';return {granted:true};}r.status=request.status;return {};}
   reads++;active++;maxActive=Math.max(maxActive,active);const snapshot=structuredClone(records);
   try{if(options.read)await options.read(reads);return snapshot;}finally{active--;}
  },...options.mount});
 return {handle,get writes(){return writes;},get reads(){return reads;},get maxActive(){return maxActive;},get damage(){return damage;},get prone(){return prone;},get claims(){return claims;},get animations(){return animations;},
  set records(value){records=value;},get records(){return records;},scene:value=>sceneId=value,
  panel:()=>document.querySelector('[data-fall-review]'),close:()=>{handle();Object.assign(globalThis,old);}};
}
test('movement wakes coalesce during an in-flight read; prompt does not wait for animation; Apply runs once',async()=>{
 const gate=deferred();const f=fixture({read:n=>n===1?gate.promise:undefined});
 try{await until(()=>f.reads===1);f.records=[record()];for(let i=0;i<20;i++)f.handle.wake();gate.resolve();await until(f.panel);
  assert.equal(f.reads,2);assert.equal(f.maxActive,1);assert.equal(f.animations,1);
  assert.ok(document.querySelector('.vtt-token--falling'),'prompt exists while animation is still playing');
  for(let i=0;i<20;i++)f.handle.wake();await delay(20);assert.equal(f.reads,2);assert.equal(f.animations,1);
  const apply=[...f.panel().querySelectorAll('button')].find(b=>b.textContent==='Apply');await Promise.all([apply.onclick(),apply.onclick()]);
  await delay(20);assert.equal(f.damage,1);assert.equal(f.prone,1);assert.equal(f.claims,1);assert.equal(f.records[0].status,'completed');assert.equal(f.panel(),null);
 }finally{f.close();}
});
test('closing a review immediately advances to the next receipt without reapplying the first',async()=>{
 const f=fixture();try{f.records=[record(),record('two')];await until(f.panel);
  await [...f.panel().querySelectorAll('button')].find(b=>b.textContent==='Dismiss').onclick();await until(()=>f.panel()?.textContent.includes('two'));
  assert.equal(document.querySelectorAll('[data-fall-review]').length,1);assert.equal(f.records[0].status,'dismissed');assert.equal(f.damage,0);
 }finally{f.close();}
});
test('uncertain damage remains blocked through repeated wakeups and Apply attempts',async()=>{
 const f=fixture({failDamage:true});try{f.records=[record()];await until(f.panel);const apply=[...f.panel().querySelectorAll('button')].find(b=>b.textContent==='Apply');
  await apply.onclick();f.handle.wake();await apply.onclick();await delay(20);assert.equal(f.damage,1);assert.equal(f.claims,1);assert.equal(f.records[0].status,'needs_review');assert.match(f.panel().textContent,/Outcome uncertain/);
 }finally{f.close();}
});
test('scene change or disposal during trait loading cannot open an obsolete popup',async()=>{
 for(const dispose of [false,true]){const gate=deferred();let loading=false;const f=fixture({mount:{traits:async()=>{loading=true;await gate.promise;return {};}}});
  try{f.records=[record()];await until(()=>loading);if(dispose)f.handle();else f.scene('other');gate.resolve();await delay(20);assert.equal(f.panel(),null);assert.equal(f.animations,0);}finally{f.close();}}
});
test('ledger polling never opens another actor or scene review',async()=>{
 const f=fixture();try{f.records=[{...record(),actorId:'Cal'},{...record('two'),sceneId:'other'}];await until(()=>f.reads>0);await delay(20);assert.equal(f.panel(),null);assert.equal(f.damage,0);}finally{f.close();}
});


test('harmless ground falls dismiss durably without popup or effects, including after reload',async()=>{
 for(const [squares,agility] of [[1,0],[3,2]]){
  const f=fixture({agility});let saved;
  try{
   f.records=[{...record(),details:{squares}}];await until(()=>f.records[0].status==='dismissed');
   assert.equal(f.panel(),null);assert.equal(f.claims,0);assert.equal(f.damage,0);assert.equal(f.prone,0);
   assert.deepEqual(f.writes,[{operationId:'one',targetId:'one',action:'finish',status:'dismissed'}]);
   saved=structuredClone(f.records);
  }finally{f.close();}
  const reload=fixture({agility});try{
   reload.records=saved;await until(()=>reload.reads>0);await delay(20);
   assert.equal(reload.panel(),null);assert.deepEqual(reload.writes,[]);assert.equal(reload.claims,0);
  }finally{reload.close();}
 }
});
test('zero damage still reviews creature landing and placement consequences',async()=>{
 for(const details of [{squares:1,collidedIds:['two']},{squares:1,needsPlacementReview:true}]){
  const f=fixture();try{
   f.records=[{...record(),details}];await until(f.panel);
   assert.deepEqual(f.writes,[],'Consequential receipt stays pending for explicit review');
   assert.equal(f.records[0].status,'pending');
   if(details.collidedIds)assert.match(f.panel().textContent,/Will be prone/);
   else assert.match(f.panel().textContent,/choose a free landing space/);
  }finally{f.close();}
 }
});
test('uncertain harmless dismissal retains review and never loops or applies effects',async()=>{
 const f=fixture({failFinish:true});try{
  f.records=[{...record(),details:{squares:1}}];await until(f.panel);
  assert.match(f.panel().textContent,/Dismissal unconfirmed/);
  assert.equal(f.records[0].status,'pending');assert.equal(f.writes.length,1);
  assert.equal(f.panel().querySelectorAll('button').every(b=>b.disabled),true);
  for(let i=0;i<20;i++)f.handle.wake();await delay(20);
  assert.equal(f.writes.length,1);assert.equal(f.claims,0);assert.equal(f.damage,0);assert.equal(f.prone,0);
 }finally{f.close();}
});

test('uncertain dismissal settling after scene change cannot open obsolete panel or retry on return',async()=>{
 const gate=deferred();let finishes=0;
 const f=fixture({mount:{api:async request=>{
  if(!request)return [{...record(),details:{squares:1}}];
  finishes++;await gate.promise;throw Error('uncertain');
 }}});
 try{
  await until(()=>finishes===1);f.scene('other');gate.resolve();await delay(20);
  assert.equal(f.panel(),null);f.scene('scene');f.handle.wake();await until(f.panel);
  assert.match(f.panel().textContent,/Dismissal unconfirmed/);assert.equal(finishes,1);
  assert.equal(f.damage,0);assert.equal(f.prone,0);
 }finally{f.close();}
});
