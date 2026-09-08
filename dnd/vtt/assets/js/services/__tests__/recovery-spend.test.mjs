import test from 'node:test';
import assert from 'node:assert/strict';
import {spendCharacterRecoveries} from '../recovery-spend.js';
test('recovery spending sends only the cost and requires a confirmed result',async()=>{
 let body;
 const result=await spendCharacterRecoveries('/sheet','cal',1,{fetchImpl:async(url,options)=>{body=options.body;return {ok:true,json:async()=>({success:true,spent:0,currentRecoveries:0})};}});
 assert.equal(result.spent,0);assert.equal(body.get('spendRecoveries'),'1');assert.equal(body.has('data'),false);
 await assert.rejects(spendCharacterRecoveries('/sheet','cal',1,{fetchImpl:async()=>({ok:true,json:async()=>({success:false,error:'failed'})})}),/failed/);
});
test('uncertain recovery spending is bounded and never retried',async()=>{
 let calls=0,signal;
 await assert.rejects(spendCharacterRecoveries('/sheet','cal',1,{timeoutMs:10,fetchImpl:async(url,options)=>{calls++;signal=options.signal;return new Promise(()=>{});}}),/timed out/);
 assert.equal(calls,1);assert.equal(signal.aborted,true);
});
