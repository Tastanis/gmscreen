import test from 'node:test';
import assert from 'node:assert/strict';
import {floorSupported} from '../floor-support.js';
const floor={kind:'floor',levelId:'upper',points:[{x:0,y:0},{x:6,y:0},{x:0,y:6}],holes:[[{x:1,y:1},{x:3,y:1},{x:3,y:3},{x:1,y:3}]]};
test('polygon support distinguishes holes, partial footprint and touching edges',()=>{
 for(const [column,row,expected] of [[1,1,false],[4,4,false],[3,1,true],[5.5,0,true],[6,0,false]])assert.equal(floorSupported({column,row,levelId:'upper'},[floor]),expected);
 assert.equal(floorSupported({column:1,row:1,levelId:'upper'},[{...floor,holes:[...floor.holes,...floor.holes]}]),false);
 assert.equal(floorSupported({column:1,row:1,levelId:'upper'},[]),null);
 assert.equal(floorSupported({column:1,row:1,levelId:'new-floor'},[floor]),null);
});
