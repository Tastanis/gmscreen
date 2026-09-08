import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeTokenRenderGeometry,resolveVisibleTokenPresentation} from '../token-presentation.js';
test('canonical fractional geometry survives rendering and partially revealed footprints remain visible',()=>{
  const token={id:'large',column:8.5,row:'5.25',width:2,height:1,levelId:'level-0'};
  const geometry=normalizeTokenRenderGeometry(token);
  assert.deepEqual(geometry,{column:8.5,row:5.25,width:2,height:1});
  const placement={...token,...geometry};
  assert.ok(resolveVisibleTokenPresentation(placement,{levels:[]},{viewerLevelId:'level-0',isCellFogged:col=>col>9}));
  assert.equal(resolveVisibleTokenPresentation(placement,{levels:[]},{isCellFogged:()=>true}),null);
  assert.equal(resolveVisibleTokenPresentation({...placement,hidden:true},{levels:[]}),null);
});
