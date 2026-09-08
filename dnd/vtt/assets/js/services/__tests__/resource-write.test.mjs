import test from 'node:test';
import assert from 'node:assert/strict';
import {confirmResourceWrite} from '../resource-write.js';
test('resource writes require explicit acknowledgment and preserve conditional zero values',async()=>{
  let body;
  await confirmResourceWrite('/sheet',{character:'cal',value:'0',expectedValue:'0'},{fetchImpl:async(url,options)=>{
    body=options.body;return {ok:true,json:async()=>({success:true,resource:0})};
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
