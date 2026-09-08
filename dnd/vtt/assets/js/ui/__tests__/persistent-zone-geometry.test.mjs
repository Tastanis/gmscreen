import test from 'node:test';
import assert from 'node:assert/strict';
import {doesPersistentZoneOverlapPlacement,resolvePersistentZoneLevelId} from '../persistent-zone-geometry.js';

test('persistent zones retain their floor independently of caster movement',()=>{
  const zone={levelId:'balcony',template:{column:2,row:3,width:2,height:2},casterId:'caster'};
  const token={column:2,row:3,width:1,height:1,levelId:'level-0'};
  assert.equal(doesPersistentZoneOverlapPlacement(zone,token),false);
  assert.equal(doesPersistentZoneOverlapPlacement(zone,{...token,levelId:'balcony'}),true);
  assert.equal(resolvePersistentZoneLevelId({...zone,casterLevelId:'roof'}),'balcony');
  assert.equal(resolvePersistentZoneLevelId({template:{column:2,row:3}}),'level-0');
});

test('wall zones detect partial fractional overlap, exclude touching edges and other floors',()=>{
  const zone={levelId:'balcony',squares:[{column:2,row:3}]};
  const token={column:2.5,row:3.5,width:2,height:2,levelId:'balcony'};
  assert.equal(doesPersistentZoneOverlapPlacement(zone,token),true);
  assert.equal(doesPersistentZoneOverlapPlacement(zone,{...token,column:3}),false);
  assert.equal(doesPersistentZoneOverlapPlacement(zone,{...token,levelId:'roof'}),false);
  assert.equal(doesPersistentZoneOverlapPlacement({...zone,squares:[{column:'bad',row:3}]},token),false);
});
