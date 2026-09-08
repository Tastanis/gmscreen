import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePlacementForRender} from '../token-render-normalize.js';

test('passive and interactive token hydration interpret legacy overlays and readiness consistently',()=>{
  const source={id:'legacy',column:2.5,row:3.25,width:2,showHitPoints:true,hitPoints:{value:25,max:20},
    status:['Prone'],readyTriggerAbilities:['readied-ability'],flags:{hidden:'false'},alignment:'enemy',
    marks:{judgment:{sourceName:'Cal'}}};
  const before=structuredClone(source),result=normalizePlacementForRender(source);
  assert.equal(result.column,2.5);assert.equal(result.row,3.25);
  assert.equal(result.showHp,true);assert.deepEqual(result.hp,{current:'25',max:'20'});
  assert.equal(result.conditions[0].name,'Prone');assert.equal(result.hasReadyTrigger,true);
  assert.equal(result.hidden,false);assert.equal(result.team,'enemy');
  result.marks.judgment.sourceName='Changed';assert.deepEqual(source,before);
});
