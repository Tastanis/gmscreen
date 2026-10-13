import test from 'node:test';
import assert from 'node:assert/strict';
import {settleCollisionEffects,collisionDamageDealt} from '../collision-effects.js';
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

// Brandon, October 12, 2026: "I need a way to undo a breakthrough". Undoing a push gives back the damage the
// push's own collisions dealt (board-interactions.js giveBackCollisionDamage); this is the list it goes by.
test('what a push dealt, for giving back on undo: applied collisions only, never a fall',async()=>{
 const asked=[];
 const api=async(request,operationId)=>{asked.push([request,operationId]);return [
  {operationId:'push-1',targetId:'pushed',amount:5,status:'completed',kind:'collision',damageType:''},
  {operationId:'push-1',targetId:'struck',amount:2,status:'completed',kind:'collision',damageType:'fire'},
  {operationId:'push-1',targetId:'waiting',amount:2,status:'pending',kind:'collision'},
  {operationId:'push-1',targetId:'unsure',amount:2,status:'needs_review',kind:'collision'},
  {operationId:'push-1',targetId:'waved',amount:2,status:'dismissed',kind:'collision'},
  {operationId:'push-1:fall:pushed',targetId:'pushed',amount:6,status:'completed',kind:'fall'},
  {operationId:'push-1',targetId:'none',amount:0,status:'completed',kind:'collision'},
 ];};
 assert.deepEqual(await collisionDamageDealt('push-1',{api}),[{targetId:'pushed',amount:5,damageType:''},{targetId:'struck',amount:2,damageType:'fire'}]);
 assert.deepEqual(asked,[[null,'push-1']],'one read, nothing written');
 assert.deepEqual(await collisionDamageDealt('',{api}),[]);
 assert.deepEqual(await collisionDamageDealt('walk-1',{api:async()=>[]}),[],'a move that hit nothing gives nothing back');
});
