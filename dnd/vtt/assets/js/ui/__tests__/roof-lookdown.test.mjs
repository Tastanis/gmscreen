import test from 'node:test';
import assert from 'node:assert/strict';
import {ceilingBlocks} from '../roof-geometry.mjs';
import {makeSight} from '../vision-height.mjs';
import {intersectsFloor,terrainFloorContact} from '../floor-support.js';

const rectangle=(id,height,left,top,right,bottom,kind='floor',holes=[])=>({id,height,kind,holes,points:[{x:left,y:top},{x:right,y:top},{x:right,y:bottom},{x:left,y:bottom}]});
const surfaces=[
 rectangle('basement',0,9,9,18,25),
 rectangle('walkway',2,5,34,8,37),
 rectangle('upper',4,18,13,29,24,'floor',[[{x:20,y:17},{x:27,y:17},{x:27,y:22},{x:20,y:22}]]),
 rectangle('lower-roof',4,9,9,18,25,'roof'),
 rectangle('upper-roof',6,18,13,29,24,'roof'),
];

test('elevated walkway casts a local floor shadow but leaves exterior ground beyond its edge visible',()=>{
 const viewer={x:6.5,y:35.5};
 assert.equal(ceilingBlocks(viewer,3,{x:4.5,y:35.5},0,surfaces),true,'near ground remains underneath the plate sightline');
 assert.equal(ceilingBlocks(viewer,3,{x:.5,y:35.5},0,surfaces),false,'far exterior ray clears the walkway edge');
 assert.equal(ceilingBlocks(viewer,3,{x:4.5,y:35.5},1.95,surfaces),false,'nearly flush surrounding terrain clears the edge');
 assert.equal(ceilingBlocks(viewer,3,{x:6.5,y:35.5},0,surfaces),true,'ground underneath the solid walkway stays covered');
});

test('look-down holes and rooftop edges preserve closed building privacy',()=>{
 assert.equal(ceilingBlocks({x:22.5,y:18.5},5,{x:22.5,y:18.5},2,surfaces),false,'upper-floor authored hole reveals the storey below');
 assert.equal(ceilingBlocks({x:19.5,y:15.5},5,{x:19.5,y:15.5},2,surfaces),true,'solid upper floor covers the storey below');
 assert.equal(ceilingBlocks({x:22.5,y:18.5},7,{x:22.5,y:18.5},2,surfaces),true,'unbroken roof still closes the building above its indoor hole');
 assert.equal(ceilingBlocks({x:29.5,y:18.5},5,{x:22.5,y:18.5},5,surfaces),false,'a horizontal ray never falsely crosses a ceiling');
});

test('a closed high wall still blocks an elevated observer while lower walls permit a clear ray',()=>{
 const viewer={column:5,row:35,width:1,height:1};
 const wall=height=>({nodes:[{id:'a',x:4,y:34},{id:'b',x:4,y:37}],segments:[{id:'edge',a:'a',b:'b',baseMode:'fixed',base:0,height,topMode:'follow',sight:'block'}]});
 assert.equal(makeSight({viewer,viewerGround:2,groundAt:()=>0,walls:wall(4)})({x:.5,y:35.5},0),false);
 assert.equal(makeSight({viewer,viewerGround:2,groundAt:()=>0,walls:wall(1)})({x:.5,y:35.5},0),true);
});

test('a token beside the stair-stepped walkway stays on terrain; its neighboring supported cells acquire the floor',()=>{
 const walkway={id:'walkway-edge',kind:'floor',height:2,levelId:'ground-floor',holes:[],points:[
  {x:20,y:25},{x:26,y:25},{x:26,y:26},{x:25,y:26},{x:25,y:27},{x:24,y:27},{x:24,y:28},{x:23,y:28},{x:23,y:29},{x:20,y:29},
 ]};
 const outside={column:24,row:27,width:1,height:1,levelId:'level-0'},levels={levels:[{id:'ground-floor',elevationSquares:2}]};
 assert.equal(intersectsFloor(outside,walkway),false,'corner/edge touching is not positive-area support');
 assert.equal(terrainFloorContact(outside,[walkway],levels,1.75),null);
 assert.equal(terrainFloorContact({...outside,column:23},[walkway],levels,1.954),walkway);
 assert.equal(terrainFloorContact({...outside,row:26},[walkway],levels,1.954),walkway);
});
