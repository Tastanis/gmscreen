import test from 'node:test';
import assert from 'node:assert/strict';
import {settleCollisionEffects} from '../collision-effects.js';
test('collision recovery never replays a target after an uncertain damage write',async()=>{
 const states={a:'pending',b:'pending'},calls=[];
 const api=async r=>{if(!r)return Object.entries(states).map(([targetId,status])=>({targetId,status}));if(r.action==='start'){if(states[r.targetId]!=='pending')return {granted:false,status:states[r.targetId]};states[r.targetId]='executing';return {granted:true,amount:3};}states[r.targetId]=r.status;return {status:r.status};};
 const apply=async id=>{calls.push(id);if(id==='b')throw Error('Uncertain sheet acknowledgment');};
 await assert.rejects(settleCollisionEffects('accepted-op',apply,{api}));
 assert.deepEqual(states,{a:'completed',b:'needs_review'});
 await assert.rejects(settleCollisionEffects('accepted-op',apply,{api}));
 assert.deepEqual(calls,['a','b']);
});
test('lost reservation response prevents execution',async()=>{
 let applied=false;
 const api=async r=>{if(!r)return [{targetId:'a',status:'pending'}];throw Error('Lost response');};
 await assert.rejects(settleCollisionEffects('accepted-op',()=>{applied=true;},{api}));assert.equal(applied,false);
});

test('authored collision damage type reaches the existing damage adapter',async()=>{
 const applied=[];
 const api=async r=>!r?[{targetId:'enemy',status:'pending'}]:r.action==='start'?{granted:true,amount:4,damageType:'fire'}:{status:'completed'};
 await settleCollisionEffects('ability-op',async(...args)=>applied.push(args),{api});
 assert.deepEqual(applied,[['enemy',4,'fire']]);
});
