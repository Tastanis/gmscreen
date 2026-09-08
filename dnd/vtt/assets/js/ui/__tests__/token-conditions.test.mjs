import test from 'node:test';
import assert from 'node:assert/strict';
import {ensurePlacementConditions} from '../token-conditions.js';

test('shared condition hydration retains distinct sources and typed weaknesses without mutating input',()=>{
  const source=['Prone',['Prone',
    {name:'damageWeakness',amount:5,damageType:'fire'},
    {name:'damageWeakness',amount:5,damageType:'cold'},
    {name:'Slowed',duration:{type:'eot',targetTokenId:'one'}},
    {name:'Slowed',duration:{type:'eot',targetTokenId:'two'}},
    {name:'hiddenEffect',label:'Ready',sourceId:'one',rider:{type:'rollModifier',modifier:'edge'}},
  ]];
  const before=structuredClone(source),result=ensurePlacementConditions(source);
  assert.equal(result.length,6);
  assert.deepEqual(result.filter(c=>c.name==='damageWeakness').map(c=>c.damageType),['fire','cold']);
  assert.deepEqual(result.filter(c=>c.name==='Slowed').map(c=>c.duration.targetTokenId),['one','two']);
  assert.equal(result.at(-1).hidden,true);
  result.at(-1).rider.modifier='bane';
  assert.deepEqual(source,before);
});

test('rehydrating display conditions preserves persistent rider identity and handled boundaries',()=>{
  const source=[{name:'Burning',instanceId:'condition-one',riders:[
    {id:'tick',when:'turnStart',target:'bearer',effects:[{kind:'damage',amount:2}]},
  ],riderExecutions:{tick:'round-2-turn-one'}}];
  const first=ensurePlacementConditions(source);
  assert.equal(first[0].instanceId,'condition-one');
  assert.deepEqual(first[0].riderExecutions,source[0].riderExecutions);
  assert.deepEqual(ensurePlacementConditions(first),first);
});
