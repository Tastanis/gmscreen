import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoofImageCache} from '../roof-image-cache.mjs';
const settle=()=>new Promise(resolve=>setImmediate(resolve));

test('a transient missing roof image recovers once and invalidates the renderer',async()=>{
 const timers=[],image={width:512},errors=[];let loads=0,revisions=0;
 const cache=createRoofImageCache({load:async()=>{if(++loads===1)throw Error('503');return image;},setTimer:(run,delay)=>timers.push({run,delay}),onLoaded:()=>revisions++,onError:e=>errors.push(e.message)});
 cache.request('roof');cache.request('roof');await settle();
 assert.equal(loads,1);assert.equal(cache.get('roof'),null);assert.equal(timers[0].delay,1000);
 timers.shift().run();cache.request('roof');await settle();
 assert.equal(loads,2);assert.equal(cache.get('roof'),image);assert.equal(revisions,1);assert.deepEqual(errors,['503']);
 cache.request('roof');await settle();assert.equal(loads,2);
});

test('unavailable images have a finite retry budget independent of rendering cadence',async()=>{
 const timers=[];let loads=0,revisions=0;
 const cache=createRoofImageCache({load:async()=>{loads++;throw Error('offline');},setTimer:(run,delay)=>timers.push({run,delay}),onLoaded:()=>revisions++});
 cache.request('missing');await settle();const delays=[];
 while(timers.length){const timer=timers.shift();delays.push(timer.delay);timer.run();await settle();}
 for(let i=0;i<100;i++)cache.request('missing');await settle();
 assert.equal(loads,4);assert.deepEqual(delays,[1000,2000,4000]);assert.equal(revisions,0);assert.equal(cache.get('missing'),null);
});

test('a null local image lookup uses the same bounded recovery instead of permanent success',async()=>{
 const timers=[],image={width:8};let loads=0,revisions=0;
 const cache=createRoofImageCache({load:async()=>++loads===1?null:image,setTimer:run=>timers.push(run),onLoaded:()=>revisions++});
 cache.request('local');await settle();assert.equal(revisions,0);assert.equal(timers.length,1);
 timers.shift()();await settle();assert.equal(cache.get('local'),image);assert.equal(revisions,1);
});
