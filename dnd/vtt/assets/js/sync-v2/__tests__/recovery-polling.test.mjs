import test from 'node:test';
import assert from 'node:assert/strict';
import {createRecoveryPolling} from '../recovery-polling.js';
import {createRecoveryClient} from '../recovery-client.js';
import {createCommandClient} from '../command-client.js';
import {createTokenMovementRuntime} from '../token-movement-runtime.js';
import {retryAfterMilliseconds} from '../retry-after.js';
const response=(status,body,header=null)=>({status,ok:status>=200&&status<300,json:async()=>body,headers:{get:()=>header}});

test('healthy polling stays at 500ms and suppresses overlap with pending/explicit recovery',async()=>{
 let callback,cleared=false,calls=0,release,external=false;
 const polling=createRecoveryPolling({windowRef:{setInterval(fn,ms){assert.equal(ms,500);callback=fn;return 7;},clearInterval(id){assert.equal(id,7);cleared=true;}},isRecovering:()=>external,recover:()=>{calls++;return new Promise(resolve=>release=resolve);}});
 polling.start();external=true;await callback();assert.equal(calls,0);external=false;
 const pending=callback();await callback();assert.equal(calls,1);release();await pending;
 const next=callback();assert.equal(calls,2);release();await next;
 polling.stop();await callback();assert.equal(calls,2);assert.equal(cleared,true);
});

test('fast failures make six recovery requests per minute instead of 120, then resume normal delivery',async()=>{
 let time=0,calls=0,failed=true,errors=0;
 const polling=createRecoveryPolling({now:()=>time,windowRef:{setInterval(){return 1;},clearInterval(){}},recover:async()=>{calls++;if(failed)throw Error('503 fixture');},onError:()=>errors++});polling.start();
 for(time=500;time<=60000;time+=500)await polling.tick();
 assert.equal(calls,6);assert.equal(errors,6);
 failed=false;time=61500;await polling.tick();assert.equal(calls,7);
 time=62000;await polling.tick();assert.equal(calls,8);polling.stop();
});

test('Retry-After is bounded, accepts dates, and suppresses duplicate EventStream errors',async()=>{
 assert.equal(retryAfterMilliseconds(response(503,{},'5')),5000);
 assert.equal(retryAfterMilliseconds(response(503,{},'999999')),60000);
 assert.equal(retryAfterMilliseconds(response(503,{},'bad header')),0);
 const now=Date.parse('2026-09-29T12:00:00Z');assert.equal(retryAfterMilliseconds(response(429,{},'Tue, 29 Sep 2026 12:00:08 GMT'),now),8000);
 let time=0,calls=0,errors=0;
 const polling=createRecoveryPolling({now:()=>time,windowRef:{setInterval(){return 1;}},recover:async()=>{calls++;throw Object.assign(Error('reported already'),{syncRecovery:true,retryAfterMs:10000});},onError:()=>errors++});polling.start();await polling.tick();time=9999;await polling.tick();assert.equal(calls,1);time=10000;await polling.tick();assert.equal(calls,2);assert.equal(errors,0);polling.stop();
});

test('recovery client propagates backpressure without changing the requested cursor',async()=>{
 let requested;const client=createRecoveryClient({endpoint:'/sync',fetchImpl:async(url)=>{requested=url;return response(503,{success:false},'9');}});
 await assert.rejects(client.recoverAfter(42),e=>e.status===503&&e.retryAfterMs===9000);assert.equal(requested,'/sync?after=42');
});

test('command backpressure retains identical operation/body and bounded retries',async()=>{
 const bodies=[],waits=[];
 const client=createCommandClient({endpoint:'/commands',eventStream:{ingest:async()=>({status:'applied'})},operationIdFactory:()=> 'same-operation',sleep:async ms=>waits.push(ms),fetchImpl:async(_url,options)=>{bodies.push(options.body);return bodies.length===1?response(503,{success:false},'3'):response(200,{success:true,event:{revision:1}});}});
 await client.submit('token.move',{column:3,row:4},{sceneId:'s',entityId:'t'});assert.equal(bodies.length,2);assert.equal(bodies[0],bodies[1]);assert.deepEqual(waits,[3000]);
});

test('runtime explicit recovery bypasses poll backoff and reports one failure',async()=>{
 let callback,requests=0,snapshots=0;const errors=[];
 const runtime=createTokenMovementRuntime({enabled:true,commandsEndpoint:'/commands',eventsEndpoint:'/sync',snapshotEndpoint:'/snapshot',windowRef:{setInterval(fn){callback=fn;return 1;},clearInterval(){}},onError:e=>errors.push(e),fetchImpl:async url=>{
  if(url==='/snapshot'){snapshots++;return response(200,{success:true,snapshot:{revision:0,state:{}}});}
  requests++;return requests===1?response(503,{success:false}):response(200,{success:true,recovery:{mode:'events',fromRevision:0,revision:0,events:[]}});
 }});await runtime.start();await callback();assert.equal(requests,1);assert.equal(errors.length,1);
 await runtime.recover();assert.equal(requests,2);assert.equal(snapshots,1);runtime.stop();
});
