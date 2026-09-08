import test from 'node:test';
import assert from 'node:assert/strict';
import {runZoneBoundary} from '../zone-boundary.js';

test('zone boundaries await expiration before start effects and ticks before end expiration',async()=>{
  for(const when of ['startOfTurn','endOfTurn']) {
    const order=[];let release;
    const gate=new Promise(resolve=>{release=resolve;});
    const result=runZoneBoundary(when,{
      expire:async()=>{order.push('expire');if(when==='startOfTurn')await gate;},
      tick:async()=>{order.push('tick');if(when==='endOfTurn')await gate;},
      occupants:async()=>{order.push('occupants');},
    });
    await new Promise(resolve=>setTimeout(resolve,0));
    assert.deepEqual(order,[when==='startOfTurn'?'expire':'tick']);
    release();await result;
    assert.deepEqual(order,when==='startOfTurn'?['expire','tick','occupants']:['tick','expire']);
  }
});

test('failed expiration and scene changes stop later zone effects',async()=>{
  let ticks=0;
  await assert.rejects(runZoneBoundary('startOfTurn',{expire:async()=>false,tick:async()=>{ticks++;},occupants:async()=>{}}),/not confirmed/);
  let current=true;
  await assert.rejects(runZoneBoundary('startOfTurn',{
    expire:async()=>{current=false;},tick:async()=>{ticks++;},occupants:async()=>{},
    assertCurrent:()=>{if(!current)throw Error('scene changed');},
  }),/scene changed/);
  assert.equal(ticks,0);
});


test('a failed final tick preserves the zone instead of expiring it',async()=>{
  let expired=false;
  await assert.rejects(runZoneBoundary('endOfTurn',{
    tick:async()=>{throw Error('condition rejected after damage');},
    expire:async()=>{expired=true;},occupants:async()=>{},
  }),/condition rejected/);
  assert.equal(expired,false);
});
