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
 for(const z of [1.874,0,-6,2.2])assert.equal(terrainFloorContact(p,[s],levels,z),null);
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

import {walkFloorContact} from '../floor-support.js';
test('raised room edge contact retains support over basements without acquiring ceilings',()=>{
 const s={id:'room',kind:'floor',levelId:'room',height:2,points:[{x:2,y:0},{x:10,y:0},{x:10,y:4},{x:2,y:4}]},levels={levels:[{id:'room',elevationSquares:2}]},from={column:0,row:1,width:1,height:1,levelId:'level-0'},to={column:8,row:1};
 for(const [outside,inside,height] of [[2,2,2],[2,0,2],[2,0,1.9],[2.05,0,2],[0,-2,0]]){
  const plate={...s,height};assert.equal(walkFloorContact(from,to,[],[plate],levels,p=>p.column<1.5?outside:inside),plate);
 }
 assert.equal(walkFloorContact(from,to,[],[s],levels,p=>p.column<.5?2:0),null,'No bridge from a distant height');
 assert.equal(walkFloorContact(from,to,[],[s],levels,()=>0),null,'No ceiling acquisition');
 assert.equal(walkFloorContact(from,to,[],[s],{levels:[{id:'room',hidden:true}]},()=>2),null);
 assert.equal(walkFloorContact({...from,movementMode:'fly',flightHeight:3},to,[],[s],levels,()=>2),null);
 assert.equal(walkFloorContact(from,to,[],[s],levels,()=>1.8),null,'No large step');
});

test('a walker standing level with a deck it overlaps is on it, so a bridge that ends on the land can be crossed',()=>{
 // A rope bridge at height 2 whose end is laid over the landing square; the land there is a hair higher (2.02).
 const bridge={id:'bridge',kind:'floor',levelId:'level-0',height:2,points:[{x:2,y:1},{x:9,y:1},{x:9,y:2},{x:2,y:2}]},levels={levels:[]};
 const land=p=>p.column<2.5?2.02:0,onLanding={column:2,row:1,width:1,height:1,levelId:'level-0'};
 assert.equal(terrainFloorContact(onLanding,[bridge],levels,2.02),null,'standing still, the strict rule is unchanged');
 assert.equal(terrainFloorContact(onLanding,[bridge],levels,2.02,.1),bridge);
 // It climbed up beside the bridge and now walks out along it: it is carried, where before it dropped through.
 assert.equal(walkFloorContact(onLanding,{column:6,row:1},[],[bridge],levels,land),bridge);
 assert.equal(walkFloorContact(onLanding,{column:8,row:1},[{column:4,row:1}],[bridge],levels,land),bridge,'through a waypoint too');
 // Walking back onto the land and off the bridge's footprint leaves it.
 assert.equal(walkFloorContact({...onLanding,column:3,_supportSurfaceId:'bridge'},{column:0,row:1},[],[bridge],levels,land),null);
 // Not level: the land is more than a tenth of a square above or below the deck.
 assert.equal(walkFloorContact(onLanding,{column:6,row:1},[],[bridge],levels,p=>p.column<2.5?2.2:0),null,'a real step down onto the deck is not bridged');
 assert.equal(walkFloorContact(onLanding,{column:6,row:1},[],[bridge],levels,p=>p.column<2.5?1.8:0),null,'a real step up is not bridged');
 // Under the bridge, in the canal: never lifted onto it.
 assert.equal(walkFloorContact({column:5,row:1,width:1,height:1,levelId:'level-0'},{column:7,row:1},[],[bridge],levels,()=>0),null);
 // A flier is not put on it.
 assert.equal(walkFloorContact({...onLanding,movementMode:'fly',flightHeight:2},{column:6,row:1},[],[bridge],levels,land),null);
});
