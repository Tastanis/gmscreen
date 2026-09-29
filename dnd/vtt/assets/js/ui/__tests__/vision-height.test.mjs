import test from 'node:test';
import assert from 'node:assert/strict';
import {makeSight} from '../vision-height.mjs';
const viewer={column:0,row:0,width:1,height:1};
function model(edges){return {nodes:edges.flatMap((e,i)=>[{id:'a'+i,x:e.x,y:e.y??-2},{id:'b'+i,x:e.x,y:e.endY??2}]),segments:edges.map((e,i)=>({id:'wall'+i,a:'a'+i,b:'b'+i,baseMode:'fixed',base:0,height:3,...e})),roofs:[]};}
const sight=walls=>makeSight({viewer,groundAt:()=>0,walls});
test('sight broad phase preserves near-contact, endpoint and above-wall rays',()=>{
 const see=sight(model([{x:2}]));
 assert.equal(see({x:3,y:.5},1),false);
 assert.equal(see({x:3,y:4},1),true);
 assert.equal(see({x:2,y:2},1),false);
 assert.equal(makeSight({viewer,viewerGround:4,groundAt:()=>0,walls:model([{x:2}])})({x:3,y:.5},5),true);
 // An endpoint just outside the physical bounding box remains in the existing
 // exact intersection's epsilon tolerance; broad phase may not discard it.
 assert.equal(see({x:2,y:2+1e-8},1),false);
});
test('sight broad phase preserves limited crossings, shared endpoints and open doors',()=>{
 assert.equal(sight(model([{x:2,sight:'limited'}]))({x:4,y:.5},1),true);
 assert.equal(sight(model([{x:2,sight:'limited'},{x:3,sight:'limited'}]))({x:4,y:.5},1),false);
 assert.equal(sight(model([{x:2,sight:'limited'},{x:2,sight:'limited'}]))({x:4,y:.5},1),true);
 assert.equal(sight(model([{x:2,interaction:'door',open:true}]))({x:4,y:.5},1),true);
 assert.equal(sight(model([{x:2,sightDirection:'left'}]))({x:4,y:.5},1),false);
 assert.equal(sight(model([{x:2,sightDirection:'right'}]))({x:4,y:.5},1),true);
});
test('distant walls cannot affect rays in another spatial region',()=>{
 const walls=model(Array.from({length:310},(_,i)=>({x:100+i,y:100,endY:102})));
 assert.equal(sight(walls)({x:10,y:10},1),true);
});
