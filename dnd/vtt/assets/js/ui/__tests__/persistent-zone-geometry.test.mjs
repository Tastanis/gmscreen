import test from 'node:test';
import assert from 'node:assert/strict';
import {doesPersistentZoneOverlapPlacement,resolvePersistentZoneLevelId,doesPersistentZoneMovementEnter} from '../persistent-zone-geometry.js';

test('teleports check destination entry while forced movement checks the traversed segment',()=>{
  const zone={template:{column:3,row:0,width:1,height:1},levelId:'level-0'};
  const from={column:0,row:0,width:1,height:1,levelId:'level-0'};
  assert.equal(doesPersistentZoneMovementEnter(zone,from,{...from,column:7},'forced'),true);
  assert.equal(doesPersistentZoneMovementEnter(zone,from,{...from,column:7},'teleport'),false);
  assert.equal(doesPersistentZoneMovementEnter(zone,from,{...from,column:3},'teleport'),true);
  assert.equal(doesPersistentZoneMovementEnter(zone,{...from,column:3},{...from,column:3.5},'teleport'),false);
});

test('persistent zones retain their floor independently of caster movement',()=>{
  const zone={levelId:'balcony',template:{column:2,row:3,width:2,height:2},casterId:'caster'};
  const token={column:2,row:3,width:1,height:1,levelId:'level-0'};
  assert.equal(doesPersistentZoneOverlapPlacement(zone,token),false);
  assert.equal(doesPersistentZoneOverlapPlacement(zone,{...token,levelId:'balcony'}),true);
  assert.equal(resolvePersistentZoneLevelId({...zone,casterLevelId:'roof'}),'balcony');
  assert.equal(resolvePersistentZoneLevelId({template:{column:2,row:3}}),'level-0');
});

test('zone entry detects pass-through and excludes tangent movement, existing occupants and unrelated floors',()=>{
  const zone={levelId:'upper',template:{column:3,row:3,width:1,height:1}};
  const from={column:0,row:3,width:1,height:1,levelId:'upper'},to={...from,column:6};
  assert.equal(doesPersistentZoneMovementEnter(zone,from,to),true);
  assert.equal(doesPersistentZoneMovementEnter(zone,to,from),true);
  assert.equal(doesPersistentZoneMovementEnter(zone,{...from,row:2},{...to,row:2}),false);
  assert.equal(doesPersistentZoneMovementEnter(zone,{...from,column:3},to),false);
  assert.equal(doesPersistentZoneMovementEnter(zone,{...from,levelId:'level-0'},{...to,levelId:'level-0'}),false);
  assert.equal(doesPersistentZoneMovementEnter(zone,{...from,levelId:'level-0'},to),false);
  assert.equal(doesPersistentZoneMovementEnter(zone,{...from,levelId:'level-0'},{...to,column:3}),true);
});

test('diagonal wall-zone entry requires positive footprint overlap, not corner contact',()=>{
  const zone={squares:[{column:3,row:3}]};
  const from={column:0,row:0,width:1,height:1};
  assert.equal(doesPersistentZoneMovementEnter(zone,from,{...from,column:6,row:6}),true);
  assert.equal(doesPersistentZoneMovementEnter(zone,{...from,row:4},{...from,column:4,row:0}),false);
});

test('wall zones detect partial fractional overlap, exclude touching edges and other floors',()=>{
  const zone={levelId:'balcony',squares:[{column:2,row:3}]};
  const token={column:2.5,row:3.5,width:2,height:2,levelId:'balcony'};
  assert.equal(doesPersistentZoneOverlapPlacement(zone,token),true);
  assert.equal(doesPersistentZoneOverlapPlacement(zone,{...token,column:3}),false);
  assert.equal(doesPersistentZoneOverlapPlacement(zone,{...token,levelId:'roof'}),false);
  assert.equal(doesPersistentZoneOverlapPlacement({...zone,squares:[{column:'bad',row:3}]},token),false);
});
