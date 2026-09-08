import test from 'node:test';
import assert from 'node:assert/strict';
import {assertPersistentZoneStillActive} from '../persistent-zone-lifecycle.js';

const zone={id:'zone',casterId:'caster',levelId:'level-0',effects:[{kind:'damage',amount:3}],template:{column:2,row:0,width:1,height:1}};
test('queued effects stop when a zone ends, moves floors, changes owner or effects',()=>{
  assert.throws(()=>assertPersistentZoneStillActive(zone,[]),/ended/);
  for(const change of [{casterId:'other'},{levelId:'upper'},{effects:[{kind:'damage',amount:5}]},{template:{...zone.template,column:3}}]) {
    assert.throws(()=>assertPersistentZoneStillActive(zone,[{...zone,...change}]),/changed/);
  }
});
test('unchanged zones tolerate fresh wrappers, local entry caches and cosmetic labels',()=>{
  const copy=JSON.parse(JSON.stringify(zone));copy.enteredThisRound=new Set(['mover']);copy.abilityName='New label';
  assert.doesNotThrow(()=>assertPersistentZoneStillActive(zone,[copy]));
  delete copy.levelId;
  assert.doesNotThrow(()=>assertPersistentZoneStillActive(zone,[copy]),'Legacy base-floor identity is equivalent');
});
