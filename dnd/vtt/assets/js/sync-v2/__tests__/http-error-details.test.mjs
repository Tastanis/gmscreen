import test from 'node:test';
import assert from 'node:assert/strict';
import {attachHttpErrorDetails} from '../http-error-details.js';
import {createRecoveryClient} from '../recovery-client.js';
import {createCommandClient} from '../command-client.js';

test('diagnostics retain only bounded identifier headers',()=>{
 const error=Error('failed');attachHttpErrorDetails(error,{headers:new Headers({'CF-Ray':'abc123-SEA','X-Request-ID':'req:123'})});
 assert.equal(error.cfRay,'abc123-SEA');assert.equal(error.requestId,'req:123');
 const unsafe=Error('failed');attachHttpErrorDetails(unsafe,{headers:new Headers({'CF-Ray':'<html>secret</html>','X-Request-ID':'x'.repeat(161)})});
 assert.equal(unsafe.cfRay,undefined);assert.equal(unsafe.requestId,undefined);
});

test('recovery and command HTTP errors include diagnostic identifiers without HTML bodies',async()=>{
 const response=()=>new Response('<html>origin unavailable</html>',{status:503,headers:{'CF-Ray':'abc-SEA','X-Request-ID':'req123'}});
 const verify=error=>{assert.equal(error.status,503);assert.equal(error.cfRay,'abc-SEA');assert.equal(error.requestId,'req123');assert.equal(error.message.includes('origin unavailable'),false);return true;};
 await assert.rejects(createRecoveryClient({endpoint:'/events',fetchImpl:async()=>response()}).recoverAfter(4),verify);
 await assert.rejects(createCommandClient({endpoint:'/commands',eventStream:{ingest(){}},fetchImpl:async()=>response(),maxNetworkAttempts:1}).submit('token.move'),verify);
});
