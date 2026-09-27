import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveForcedDrag} from '../forced-drag.js';
const from={id:'a',column:0,row:0,width:1,height:1};
test('forced drag stops at first creature and uses remaining distance',()=>{
 const r=resolveForcedDrag(from,{column:5,row:0},[{id:'b',column:2,row:0},{id:'c',column:4,row:0}]);
 assert.equal(r.destination.column,1);assert.equal(r.damage,4);assert.deepEqual(r.collidedIds,['b']);
});
test('solid object adds two damage; teleport does not use this resolver',()=>{
 const r=resolveForcedDrag(from,{column:5,row:0},[],{wallBlocked:(a,b)=>b.column>2});
 assert.ok(Math.abs(r.destination.column-2)<1e-6);assert.equal(r.damage,5);assert.equal(r.wall,true);
});
test('large token damages simultaneous creatures once each without multiplying self damage',()=>{
 const r=resolveForcedDrag({...from,height:2},{column:5,row:0},[{id:'b',column:2,row:0},{id:'c',column:2,row:1}]);
 assert.equal(r.damage,4);assert.deepEqual(r.collidedIds,['b','c']);
});
test('touching edges, different floors and separated heights do not collide',()=>{
 for(const other of [{id:'b',column:2,row:1},{id:'b',column:2,row:0,levelId:'up'}]) assert.equal(resolveForcedDrag(from,{column:5,row:0},[other]).damage,0);
 assert.equal(resolveForcedDrag(from,{column:5,row:0},[{id:'b',column:2,row:0}],{height:p=>p.id==='b'?5:0}).damage,0);
});

test('fliers at the same physical altitude collide across nominal floors',()=>{
 const r=resolveForcedDrag({...from,movementMode:'fly'},{column:5,row:0},[{id:'b',column:2,row:0,levelId:'upper',movementMode:'hover'}],{height:()=>8});
 assert.equal(r.damage,4);assert.deepEqual(r.collidedIds,['b']);
});

test('preexisting stacked tokens can separate without a new slam',()=>{
 assert.equal(resolveForcedDrag(from,{column:5,row:0},[{...from,id:'b'}]).damage,0);
});
