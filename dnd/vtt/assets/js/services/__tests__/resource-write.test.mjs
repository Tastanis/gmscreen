import test from 'node:test';
import assert from 'node:assert/strict';
import {confirmResourceWrite} from '../resource-write.js';
test('resource writes require explicit acknowledgment and preserve conditional zero values',async()=>{
  let body;
  await confirmResourceWrite('/sheet',{character:'cal',value:'0',expectedValue:'0'},{fetchImpl:async(url,options)=>{
    body=options.body;return {ok:true,json:async()=>({success:true,operationId:body.get('operationId'),resource:0})};
  }});
  assert.equal(body.get('expectedValue'),'0');assert.equal(body.get('value'),'0');
  for(const result of [null,{}, {success:false,error:'stale'}]) {
    await assert.rejects(confirmResourceWrite('/sheet',{}, {fetchImpl:async()=>({ok:true,json:async()=>result})}));
  }
});
test('stalled resource bodies time out without replay or late confirmation',async()=>{
  let calls=0,signal,release;
  await assert.rejects(confirmResourceWrite('/sheet',{}, {timeoutMs:10,fetchImpl:async(url,options)=>{
    calls++;signal=options.signal;return {ok:true,json:()=>new Promise(resolve=>{release=resolve;})};
  }}),/timed out/);
  assert.equal(calls,1);assert.equal(signal.aborted,true);
  release({success:true});await new Promise(resolve=>setTimeout(resolve,0));
});


test('surge writes require their exact durable receipt and expose uncertain operation IDs',async()=>{
  const {confirmCharacterWrite}=await import('../character-write.js');
  let calls=0;
  const operationId='surge-unit-0001';
  const result=await confirmCharacterWrite('/sheet','sync-surges',{character:'cal',delta:1},{operationId,fetchImpl:async(url,options)=>{
    assert.equal(options.body.get('operationId'),operationId);
    return {ok:true,json:async()=>({success:true,operationId,surges:4,replayed:true})};
  }});
  assert.equal(result.replayed,true);
  for (const response of [{success:true,surges:4},{success:true,operationId:'wrong-id',surges:4}]) {
    await assert.rejects(confirmCharacterWrite('/sheet','sync-surges',{},{operationId,fetchImpl:async()=>({ok:true,json:async()=>response})}),error=>error.operationId===operationId);
  }
  await assert.rejects(confirmCharacterWrite('/sheet','sync-surges',{},{operationId,timeoutMs:10,fetchImpl:()=>{
    calls++;return new Promise(()=>{});
  }}),error=>error.operationId===operationId && /timed out/.test(error.message));
  assert.equal(calls,1);
});


test('late acknowledgement after timeout retains the interrupted-action reminder',async()=>{
 const {confirmCharacterWrite}=await import('../character-write.js');
 const events=[];let release;
 const operationId='late-response-0001';
 await assert.rejects(confirmCharacterWrite('/sheet','sync-surges',{character:'cal',delta:1},{operationId,timeoutMs:10,
  journalOverride:{begin:()=>events.push('pending'),fail:()=>events.push('unconfirmed'),complete:()=>events.push('removed')},
  fetchImpl:async()=>({ok:true,json:()=>new Promise(resolve=>{release=resolve;})}),
 }),/timed out/);
 release({success:true,operationId,surges:1});await new Promise(resolve=>setTimeout(resolve,0));
 assert.deepEqual(events,['pending','unconfirmed']);
});
