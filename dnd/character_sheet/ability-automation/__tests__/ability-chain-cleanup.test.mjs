import test from 'node:test';
import assert from 'node:assert/strict';
import {createAbilityAutomationHarness} from './support/automation-harness.mjs';
import {getPowerRollSuggestions} from '../../../vtt/assets/js/ui/power-roll-suggestions.js';
const automation={schema:'ability-automation/v3',cards:[
 {type:'target',id:'pick',name:'targets',mode:'token',predicate:'creatureOrObject',count:{value:2,mode:'exact'},distance:{form:'ranged',value:10}},
 {type:'powerRoll',id:'roll',attribute:'Reason',target:'targets',tiers:Object.fromEntries(['tier1','tier2','tier3'].map(key=>[key,{effects:[{kind:'damage',amount:2,damageType:'fire'}]}]))},
 {type:'effect',id:'follow-up',target:'targets',effects:[{kind:'damage',amount:1,damageType:'fire'}]},
]};
const options={action:{id:'bifurcated',name:'Bifurcated Incineration',keywords:'Fire,Magic,Ranged,Strike'},automation,targetSelections:[{id:'a',name:'A'},{id:'b',name:'B'}]};
test('two-target roll completes its follow-up chain and delayed chat cannot duplicate rolls',async()=>{
 const h=await createAbilityAutomationHarness();try{let rolls=0,picks=0;
 const result=await h.runAutomation({...options,contextOverrides:{selectTarget:config=>{assert.equal(h.window.document.getElementById('ability-automation-runner'),null,'Board owns multi-pick prompt without overlapping runner');assert.equal(config.showPrompt,true);assert.equal(config.allowDone,picks>0);return options.targetSelections[picks++];},postChat:async entry=>{if(entry.message.includes(' rolled ')){rolls++;await new Promise(r=>setTimeout(r,20));}return true;}}});
 assert.equal(rolls,1);assert.equal(result.calls.applyDamage.length,4);assert.deepEqual(result.calls.applyDamage.map(p=>p.placementId),['a','b','a','b']);assert.equal(result.calls.fireTriggerEvent.filter(e=>e.eventType==='actionUsed').length,1);
 assert.equal(result.document.getElementById('ability-automation-runner'),null);
 }finally{h.close();}
});
test('a rejected roll chat stops the chain and cleans up instead of leaving an unresolved popup',async()=>{
 const h=await createAbilityAutomationHarness();try{const messages=[];
 const result=await h.runAutomation({...options,contextOverrides:{postChat:entry=>{messages.push(entry.message);if(entry.message.includes(' rolled '))return Promise.reject(Error('chat unavailable'));return true;}}});
 assert.equal(result.calls.applyDamage?.length||0,0);assert.ok(messages.some(m=>m.includes('automation stopped: chat unavailable')));assert.equal(result.document.getElementById('ability-automation-runner'),null);
 }finally{h.close();}
});
test('failed board target selection cleans its picker without using an action or applying effects',async()=>{
 const h=await createAbilityAutomationHarness();try{const result=await h.runAutomation({...options,contextOverrides:{selectTarget:()=>Promise.reject(Error('picker unavailable'))}});
 assert.equal(result.calls.cancelTargetSelection.length,1);assert.equal(result.calls.applyDamage?.length||0,0);assert.equal(result.calls.fireTriggerEvent?.filter(e=>e.eventType==='actionUsed').length||0,0);assert.equal(result.document.getElementById('ability-automation-runner'),null);
 }finally{h.close();}
});
test('closing during an in-flight roll chat never resumes effects or recreates the popup',async()=>{
 const h=await createAbilityAutomationHarness();try{
 const result=await h.runAutomation({...options,contextOverrides:{postChat:async entry=>{if(entry.message.includes(' rolled ')){setTimeout(()=>h.window.document.querySelector('[data-close-power-roll]')?.click(),1);await new Promise(r=>setTimeout(r,25));}return true;}}});
 await new Promise(r=>setTimeout(r,30));assert.equal(result.calls.applyDamage?.length||0,0);assert.equal(result.document.getElementById('ability-automation-runner'),null);
 }finally{h.close();}
});
test('target cancellation does not continue to roll or effects; uncertain damage is never retried',async()=>{
 const h=await createAbilityAutomationHarness();try{
 const cancelled=await h.runAutomation({...options,targetSelections:[{canceled:true}]});assert.equal(cancelled.calls.applyDamage?.length||0,0);assert.equal(cancelled.calls.cancelTargetSelection.length,1);assert.equal(cancelled.calls.fireTriggerEvent?.filter(e=>e.eventType==='actionUsed').length||0,0);
 let attempts=0;const result=await h.runAutomation({...options,contextOverrides:{applyDamage:()=>{attempts++;throw Error('uncertain save');}}});assert.equal(attempts,1);assert.ok(result.calls.postChat.some(e=>e.message.includes('uncertain save')));assert.equal(result.calls.fireTriggerEvent.filter(e=>e.eventType==='actionUsed').length,1);
 }finally{h.close();}
});
test('automatic High ground plus melee Prone stack to double edge, with each side capped before cancellation',async()=>{
 const h=await createAbilityAutomationHarness();try{const api=h.window.AbilityAutomationRunner.__testing;
 const real=getPowerRollSuggestions({actor:{id:'actor',levelId:'upper',width:1,height:1},targets:[{id:'target',levelId:'level-0',width:1,height:1,conditions:['Prone']}],mapLevels:{levels:[{id:'upper',elevationSquares:1}]},context:{keywords:['Melee','Strike']}});
 assert.equal(api.getTotalEdgeBaneCounts({edgeCount:0,baneCount:0,rollSuggestions:real}).edge,2,'Real High ground and Prone suggestions combine');
 const counts=api.getTotalEdgeBaneCounts({edgeCount:0,baneCount:0,rollSuggestions:[{kind:'edge',count:1,active:true},{kind:'edge',count:1,active:true},{kind:'edge',count:1,active:true},{kind:'bane',count:1,active:true}]});assert.equal(counts.edge,2);assert.equal(counts.bane,1);assert.equal(api.getEdgeState(counts.edge,counts.bane).bonus,2);assert.equal(api.getEdgeState(3,2).net,0);assert.equal(api.getEdgeState(2,0).tierShift,1);
 }finally{h.close();}
});
test('mechanical effect attempts retain one action-use mark after a partial uncertain chain',async()=>{
 const h=await createAbilityAutomationHarness();try{let writes=0;
 const result=await h.runAutomation({...options,automation:{...automation,cards:[automation.cards[0],automation.cards[2]]},contextOverrides:{applyDamage:()=>{if(++writes===2)throw Error('second target uncertain');return{amount:1};}}});
 assert.equal(writes,2);assert.equal(result.calls.fireTriggerEvent.filter(e=>e.eventType==='actionUsed').length,1);
 }finally{h.close();}
});
test('a confirmed positive resource cost marks once even if later target picking is canceled',async()=>{
 const h=await createAbilityAutomationHarness();try{
 const result=await h.runAutomation({...options,targetSelections:[{canceled:true}],spendResourceResults:[{spent:3,remaining:4,resource:'Essence'}]});
 assert.equal(result.calls.fireTriggerEvent.filter(e=>e.eventType==='actionUsed').length,1);assert.equal(result.calls.applyDamage?.length||0,0);
 }finally{h.close();}
});
test('successful manual note and other abilities still use their main action once',async()=>{
 for(const kind of ['note','other']) {
 const h=await createAbilityAutomationHarness();try{
 const result=await h.runAutomation({action:{id:`manual-${kind}`,name:'Manual action',actionKind:'main'},automation:{schema:'ability-automation/v3',cards:[{type:'effect',id:'manual',target:'self',effects:[{kind,text:'Resolve this at the table.'}]}]}});
 assert.ok(result.calls.postChat.some(entry=>entry.message.includes('Resolve this at the table.')));
 assert.equal(result.calls.fireTriggerEvent.filter(event=>event.eventType==='actionUsed').length,1,kind);
 }finally{h.close();}
 }
});
test('a manual action canceled before target selection does not use its action',async()=>{
 const h=await createAbilityAutomationHarness();try{
 const result=await h.runAutomation({...options,targetSelections:[{canceled:true}],automation:{...automation,cards:[automation.cards[0],{type:'effect',id:'manual',target:'targets',effects:[{kind:'note',text:'Resolve this at the table.'}]}]}});
 assert.equal(result.calls.fireTriggerEvent?.filter(event=>event.eventType==='actionUsed').length||0,0);
 assert.ok(!result.calls.postChat.some(entry=>entry.message.includes('Resolve this at the table.')));
 }finally{h.close();}
});
