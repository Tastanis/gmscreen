import test from 'node:test';
import assert from 'node:assert/strict';
import {compileBuildingCutaway} from '../building-cutaway.mjs';
import {ceilingBlocks} from '../roof-geometry.mjs';
const rect=(id,height,left,right,kind='roof',extra={})=>({id,height,kind,points:[{x:left,y:0},{x:right,y:0},{x:right,y:4},{x:left,y:4}],...extra});
const native=[rect('floor',0,0,4,'floor'),rect('upstairs',2,0,4,'floor'),rect('roof',4,0,4)];

test('a touching cube lid cannot open a building for an exterior observer',()=>{
 const cube=rect('cube',3,4,5,'roof',{templateCube:true});
 assert.deepEqual([...compileBuildingCutaway([...native,cube])({x:4.5,y:2},1,0)],[]);
 assert.deepEqual([...compileBuildingCutaway([...native,cube])({x:4.5,y:2},4,3)],[]);
});

test('cube chains and overlapping cubes never extend native building cutaways',()=>{
 const cubes=[rect('touching',1,4,5,'roof',{templateCube:true}),rect('higher',3,5,6,'roof',{templateCube:true}),rect('overlap',5,3,5,'roof',{templateCube:true})];
 assert.deepEqual([...compileBuildingCutaway([...native,...cubes])({x:5.5,y:2},2,1)],[]);
 assert.deepEqual([...compileBuildingCutaway([...native,...cubes])({x:4.5,y:2},2,1)],[]);
});

test('native interiors keep their cutaway without removing cube obstacles',()=>{
 const cube=rect('inside-cube',3,1,2,'roof',{templateCube:true});
 assert.deepEqual([...compileBuildingCutaway([...native,cube])({x:1.5,y:2},1,0)].sort(),['roof','upstairs']);
 assert.equal(ceilingBlocks({x:1.5,y:2},1,{x:1.5,y:2},4,[cube]),true,'Cube lid still blocks vertical sight');
});
