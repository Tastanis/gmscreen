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

import {terrainFloorContact} from '../floor-support.js';
test('terrain contact matches near-flush paving without exposing ceilings or holes',()=>{
 const s={...floor,levelId:'paved',height:2},levels={levels:[{id:'paved',elevationSquares:2}]},p={column:3,row:1,width:1,height:1,levelId:'level-0'};
 assert.equal(terrainFloorContact(p,[s],levels,1.95416665),s);
 for(const z of [1.899,0,-6,2.2])assert.equal(terrainFloorContact(p,[s],levels,z),null);
 assert.equal(terrainFloorContact({...p,column:1,row:1},[s],levels,1.95),null);
 assert.equal(terrainFloorContact(p,[s],{levels:[{...levels.levels[0],hidden:true}]},1.95),null);
 assert.equal(terrainFloorContact(p,[{...s,kind:'roof'}],levels,1.95),null);
 assert.equal(terrainFloorContact(p,[s],{levels:[{...levels.levels[0],cutouts:[{column:3,row:1,width:1,height:1}]}]},1.95),null);
});

import {resolveSupportSurfaces} from '../floor-support.js';
test('roof-only levels have polygon support; truly unmodeled levels keep legacy fallback',()=>{
 const roof={...floor,kind:'roof',levelId:'roof',height:6};
 for(const [column,row,expected] of [[3,1,true],[4,4,false],[1,1,false],[6,0,false],[5.5,0,true]])assert.equal(floorSupported({column,row,levelId:'roof'},[roof]),expected);
 assert.equal(floorSupported({column:9,row:9,levelId:'legacy'},[roof]),null);
 const smallRoof={...roof,kind:'roof',levelId:'upper',points:[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}]};
 assert.equal(floorSupported({column:3,row:1,levelId:'upper'},[floor,smallRoof]),true,'A floor remains authoritative below a smaller roof');
 const nodeRoof=resolveSupportSurfaces({nodes:[{id:'a',x:0,y:0},{id:'b',x:4,y:0},{id:'c',x:4,y:4},{id:'d',x:0,y:4}],roofs:[{id:'nodeRoof',levelId:'roof',height:6,nodes:['a','b','c','d']}]});
 assert.equal(floorSupported({column:1,row:1,levelId:'roof'},nodeRoof),true);
 assert.equal(floorSupported({column:5,row:1,levelId:'roof'},nodeRoof),false);
});
