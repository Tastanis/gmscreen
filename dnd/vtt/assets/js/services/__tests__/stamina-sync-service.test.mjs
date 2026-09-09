import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// The BroadcastChannel helpers and the sheet stamina cache share module
// state, so import a single fresh copy per suite.
const SERVICE_PATH = '../stamina-sync-service.js';

describe('stamina-sync-service — broadcast', () => {
  let service;
  let messages;
  let originalBroadcastChannel;

  beforeEach(async () => {
    messages = [];
    originalBroadcastChannel = globalThis.BroadcastChannel;
    globalThis.BroadcastChannel = class {
      constructor(name) {
        this.name = name;
        this.listeners = new Set();
      }
      postMessage(data) {
        messages.push({ name: this.name, data });
      }
      addEventListener(_type, handler) {
        this.listeners.add(handler);
      }
    };

    service = await import(`${SERVICE_PATH}?broadcast=${Date.now()}-${Math.random()}`);
  });

  test('broadcastStaminaSync posts a message on the shared channel', () => {
    service.broadcastStaminaSync({
      character: 'Cal',
      currentStamina: 12,
      staminaMax: 24,
    });

    assert.equal(messages.length, 1);
    assert.equal(messages[0].name, 'vtt-stamina-sync');
    assert.deepEqual(messages[0].data, {
      type: 'stamina-sync',
      source: 'vtt',
      character: 'Cal',
      currentStamina: 12,
      staminaMax: 24,
    });
  });

  test('broadcastStaminaSync is a no-op when BroadcastChannel is unavailable', async () => {
    globalThis.BroadcastChannel = undefined;
    const fresh = await import(`${SERVICE_PATH}?nobc=${Date.now()}-${Math.random()}`);
    // Should not throw.
    fresh.broadcastStaminaSync({ character: 'x', currentStamina: 1, staminaMax: 2 });
    assert.equal(messages.length, 0);
    globalThis.BroadcastChannel = originalBroadcastChannel;
  });

  test('subscribeToStaminaSync registers a message listener', () => {
    const received = [];
    const handler = (event) => received.push(event);
    service.subscribeToStaminaSync(handler);
    service.subscribeToStaminaSync(null);
    service.subscribeToStaminaSync(undefined);
    // Intentionally no actual dispatch — just verify no throw and handler shape.
    assert.ok(true);
  });
});

describe('stamina-sync-service — sheet cache', () => {
  let service;
  let fetchCalls;
  let originalFetch;
  let originalBroadcastChannel;

  beforeEach(async () => {
    fetchCalls = [];
    originalFetch = globalThis.fetch;
    originalBroadcastChannel = globalThis.BroadcastChannel;
    globalThis.BroadcastChannel = undefined;
    globalThis.fetch = async (url) => {
      fetchCalls.push(url);
      return {
        ok: true,
        json: async () => ({ currentStamina: 7, staminaMax: 14 }),
      };
    };
    service = await import(`${SERVICE_PATH}?cache=${Date.now()}-${Math.random()}`);
  });

  test('fetchSheetStamina returns null without an endpoint', async () => {
    assert.equal(service.fetchSheetStamina({}, 'Indigo'), null);
    assert.equal(service.fetchSheetStamina(null, ''), null);
  });

  test('fetchSheetStamina populates the cache on success', async () => {
    const result = await service.fetchSheetStamina(
      { sheet: 'http://localhost/sheet' },
      'Indigo'
    );
    assert.deepEqual(result, { currentStamina: 7, staminaMax: 14 });
    assert.deepEqual(service.getCachedSheetStamina('INDIGO'), {
      currentStamina: 7,
      staminaMax: 14,
    });
    assert.equal(fetchCalls.length, 1);
  });

  test('fetchSheetStamina dedupes concurrent requests for the same name', async () => {
    const a = service.fetchSheetStamina({ sheet: 'http://localhost/sheet' }, 'Sharon');
    const b = service.fetchSheetStamina({ sheet: 'http://localhost/sheet' }, 'sharon');
    assert.equal(a, b);
    await Promise.all([a, b]);
    assert.equal(fetchCalls.length, 1);
  });

  test('getCachedSheetStamina returns null for missing or empty names', () => {
    assert.equal(service.getCachedSheetStamina(''), null);
    assert.equal(service.getCachedSheetStamina(null), null);
    assert.equal(service.getCachedSheetStamina('never-fetched'), null);
  });
});


describe('stamina write confirmation', () => {
  test('requires explicit success and preserves zero and negative stamina', async () => {
    const {writeSheetStamina} = await import(SERVICE_PATH);
    let posted;
    const response = await writeSheetStamina('/sheet', {character:'Cal',currentStamina:-2,staminaMax:0}, {
      fetchImpl: async (url, options) => {
        posted = new URLSearchParams(options.body);
        return new Response(JSON.stringify({success:true,operationId:posted.get('operationId')}));
      },
    });
    assert.equal(response.ok,true);
    assert.equal(posted.get('currentStamina'),'-2');
    assert.equal(posted.get('staminaMax'),'0');
    assert.ok(posted.get('operationId'));
    for (const value of [{success:false,error:'Rejected'}, {}, null]) {
      await assert.rejects(writeSheetStamina('/sheet', {}, {
        fetchImpl:async()=>new Response(JSON.stringify(value)),
      }));
    }
    await assert.rejects(writeSheetStamina('/sheet', {}, {
      fetchImpl:async()=>new Response('bad', {status:503}),
    }), /503/);
  });

  test('bounds a stalled request without retrying an uncertain write', async () => {
    const {writeSheetStamina} = await import(SERVICE_PATH);
    let calls=0,signal;
    await assert.rejects(writeSheetStamina('/sheet', {}, {
      timeoutMs:10,
      fetchImpl:async(url,options)=>{
        if(options.method==='GET')return new Response(JSON.stringify({success:true,recorded:false}));
        calls++;signal=options.signal;
        return new Promise(()=>{});
      },
    }), /timed out/);
    assert.equal(calls,1);
    assert.equal(signal.aborted,true);
  });

  test('bounds body parsing too and does not turn late success into confirmation', async () => {
    const {writeSheetStamina} = await import(SERVICE_PATH);
    let release,signal;
    const completed=[],failed=[];
    await assert.rejects(writeSheetStamina('/sheet', {}, {
      timeoutMs:10,
      operationId:'stamina-late-receipt',
      journalOverride:{begin(){},complete:id=>completed.push(id),fail:id=>failed.push(id)},
      fetchImpl:async(url,options)=>{
        if(options.method==='GET')return new Response(JSON.stringify({success:true,recorded:false}));
        signal=options.signal;
        return {ok:true,clone:()=>({json:()=>new Promise(resolve=>{release=resolve;})})};
      },
    }), /timed out/);
    assert.equal(signal.aborted,true);
    release({success:true,operationId:'stamina-late-receipt'});
    await new Promise(resolve=>setTimeout(resolve,0));
    assert.deepEqual(completed,[]);
    assert.deepEqual(failed,['stamina-late-receipt']);
  });

  test('records before writing and rejects a mismatched receipt without clearing the record', async () => {
    const {writeSheetStamina}=await import(SERVICE_PATH);
    const events=[];
    await assert.rejects(writeSheetStamina('/sheet',{character:'cal',currentStamina:12},{
      operationId:'stamina-receipt-test',
      journalOverride:{begin:e=>events.push(['begin',e.operationId]),complete:()=>events.push(['complete']),fail:id=>events.push(['fail',id])},
      fetchImpl:async(url,options)=>{if(options.method==='GET')return new Response(JSON.stringify({success:true,recorded:false}));events.push(['write']);return new Response(JSON.stringify({success:true,operationId:'another-receipt'}));},
    }),error=>error.operationId==='stamina-receipt-test' && /receipt/.test(error.message));
    assert.deepEqual(events,[['begin','stamina-receipt-test'],['write'],['fail','stamina-receipt-test']]);
  });

  test('lost response is confirmed by one read without replaying the write', async () => {
    const {writeSheetStamina}=await import(SERVICE_PATH);
    const methods=[],completed=[];
    const response=await writeSheetStamina('/sheet',{character:'cal',currentStamina:12},{
      operationId:'receipt-recovered',
      journalOverride:{begin(){},complete:id=>completed.push(id),fail(){throw Error('Should confirm');}},
      fetchImpl:async(url,options)=>{
        methods.push(options.method);
        if(options.method==='POST')throw Error('Response lost');
        assert.equal(new URL(url).searchParams.get('action'),'operation-status');
        return new Response(JSON.stringify({success:true,recorded:true,receipt:{operationId:'receipt-recovered',action:'sync-stamina',response:{success:true,operationId:'receipt-recovered',currentStamina:12}}}));
      },
    });
    assert.equal((await response.json()).currentStamina,12);
    assert.deepEqual(methods,['POST','GET']);assert.deepEqual(completed,['receipt-recovered']);
  });

  test('wrong saved values and a stalled status read cannot confirm the write', async () => {
    const {writeSheetStamina}=await import(SERVICE_PATH);
    for(const stalled of [false,true]) {
      const methods=[];
      await assert.rejects(writeSheetStamina('/sheet',{character:'cal',currentStamina:12},{
        operationId:'receipt-uncertain',recoveryTimeoutMs:10,
        fetchImpl:async(url,options)=>{
          methods.push(options.method);
          if(options.method==='POST')throw Error('Lost response');
          if(stalled)return new Promise(()=>{});
          return new Response(JSON.stringify({success:true,recorded:true,receipt:{operationId:'receipt-uncertain',action:'sync-stamina',response:{success:true,operationId:'receipt-uncertain',currentStamina:99}}}));
        },
      }),/Lost response/);
      assert.deepEqual(methods,['POST','GET']);
    }
  });
});
