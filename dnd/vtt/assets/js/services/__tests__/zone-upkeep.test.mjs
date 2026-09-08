import test from 'node:test';
import assert from 'node:assert/strict';
import {spendZoneUpkeep} from '../zone-upkeep.js';
test('upkeep distinguishes confirmed insufficient funds from rejected payment',async()=>{
  let body;
  const result=await spendZoneUpkeep('/sheet',{character:'cal',cost:2,resourceName:'Wrath'},{fetchImpl:async(url,options)=>{
    body=options.body;return {ok:true,json:async()=>({success:true,operationId:body.get('operationId'),paid:false,reason:'insufficient resource'})};
  }});
  assert.equal(result.paid,false);assert.equal(body.get('character'),'cal');assert.equal(body.get('spend'),'2');assert.equal(body.has('data'),false);
  await assert.rejects(spendZoneUpkeep('/sheet',{character:'cal',cost:2},{fetchImpl:async()=>({ok:true,json:async()=>({success:false,error:'rejected'})})}),/rejected/);
});
test('uncertain upkeep times out and is never retried',async()=>{
  let calls=0,signal;
  await assert.rejects(spendZoneUpkeep('/sheet',{character:'cal',cost:2},{timeoutMs:10,fetchImpl:async(url,options)=>{
    calls++;signal=options.signal;return new Promise(()=>{});
  }}),/timed out/);
  assert.equal(calls,1);assert.equal(signal.aborted,true);
});
