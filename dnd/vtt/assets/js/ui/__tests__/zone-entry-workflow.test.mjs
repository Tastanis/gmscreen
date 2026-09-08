import test from 'node:test';
import assert from 'node:assert/strict';
import {executeClaimedZoneEntry,zoneEntryRequest} from '../../services/zone-entry-claims.js';

test('zone execution requires a fresh grant and acknowledges success once',async()=>{
  const calls=[];let executions=0;
  const result=await executeClaimedZoneEntry({zoneId:'zone'},async()=>{executions++;},{api:async request=>{
    calls.push(request);return request.action?{success:true}:{claimed:true,claimId:'claim',status:'pending'};
  }});
  assert.equal(executions,1);assert.equal(result.status,'completed');
  assert.deepEqual(calls[1],{action:'finish',claimId:'claim',status:'completed'});
});

test('duplicate, unresolved and final claims never replay effects',async()=>{
  for(const status of ['pending','needs_review','completed','dismissed']) {
    let executions=0;
    const result=await executeClaimedZoneEntry({},async()=>{executions++;},{api:async()=>({claimed:false,claimId:'claim',status})});
    assert.equal(executions,0);assert.equal(result.status,status);assert.equal(result.executed,false);
  }
});

test('lost claim responses never execute and partial effects remain for review',async()=>{
  let executions=0;
  const lost=await executeClaimedZoneEntry({},async()=>{executions++;},{api:async()=>{throw Error('lost response');}});
  assert.equal(executions,0);assert.equal(lost.status,'needs_review');
  const requests=[];
  const partial=await executeClaimedZoneEntry({},async()=>{executions++;throw Error('condition failed after damage');},{api:async request=>{
    requests.push(request);return {claimed:true,claimId:'claim'};
  }});
  assert.equal(executions,1);assert.equal(partial.status,'needs_review');
  assert.equal(requests.at(-1).status,'needs_review');
});

test('lost completion and review responses never retry gameplay',async()=>{
  let executions=0;const requests=[];
  const result=await executeClaimedZoneEntry({},async()=>{executions++;},{api:async request=>{
    requests.push(request);if(request.action)throw Error('offline');return {claimed:true,claimId:'claim'};
  }});
  assert.equal(executions,1);assert.equal(result.status,'needs_review');
  assert.deepEqual(requests.slice(1).map(request=>request.status),['completed','needs_review']);
});

test('claim transport rejects HTTP/application failures and aborts an unresponsive request',async()=>{
  await assert.rejects(zoneEntryRequest(null,{fetchImpl:async()=>({ok:false,json:async()=>({success:false,error:'denied'})})}),/denied/);
  await assert.rejects(zoneEntryRequest(null,{timeoutMs:1,fetchImpl:async(url,{signal})=>new Promise((resolve,reject)=>{
    signal.addEventListener('abort',()=>reject(Error('aborted')));
  })}),/aborted/);
});
