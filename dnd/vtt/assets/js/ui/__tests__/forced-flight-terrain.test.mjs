import test from 'node:test';
import assert from 'node:assert/strict';
import {forcedFlightTerrainBlocked} from '../forced-flight-terrain.js';
import {resolveForcedDrag} from '../forced-drag.js';
test('forced flight rides gentle rising ground and clears terrain below its altitude',()=>{
 const from={id:'a',column:0,row:0,width:1,height:1,movementMode:'fly',flightHeight:2};
 const ground=(x,y)=>Math.max(0,x-1);
 const result=resolveForcedDrag(from,{column:5,row:0},[],{wallBlocked:(a,b)=>forcedFlightTerrainBlocked(a,b,ground)});
 assert.equal(result.destination.column,5);
 assert.equal(result.damage,0);assert.equal(result.wall,false);
 assert.equal(forcedFlightTerrainBlocked({...from,flightHeight:10},{column:5,row:0},ground),false);
 assert.equal(forcedFlightTerrainBlocked({...from,movementMode:'ground'},{column:5,row:0},ground),false);
});
import {forcedTerrainBlocked} from '../forced-flight-terrain.js';
test('yellow uphill slopes slam; green, downhill, cross-slope and elevated floors do not',()=>{
 const from={id:'a',column:0,row:0,width:1,height:1},to={column:4,row:0};
 for(const grade of [2,4])assert.equal(forcedTerrainBlocked(from,to,x=>grade*x),true);
 for(const grade of [0,1,1.99])assert.equal(forcedTerrainBlocked(from,to,x=>grade*x),false);
 assert.equal(forcedTerrainBlocked({...from,column:4},{column:0,row:0},x=>4*x),false);
 assert.equal(forcedTerrainBlocked(from,{column:0,row:4},x=>4*x),false);
 assert.equal(forcedTerrainBlocked(from,to,x=>2*x,()=>100),false);
 assert.equal(forcedTerrainBlocked(from,{column:0,row:0},x=>4*x),false);
 const result=resolveForcedDrag(from,to,[],{wallBlocked:(a,b)=>forcedTerrainBlocked(a,b,x=>2*Math.max(0,x-2.5))});
 assert.ok(Math.abs(result.destination.column-2)<.13);
 assert.equal(result.wall,true);assert.equal(result.damage,4);
});
