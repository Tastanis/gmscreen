import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeMapLevelCutout,normalizeMapLevelsState} from '../../state/normalize/map-levels.js';
import {buildMapLevelCutoutMask} from '../map-level-renderer.js';
import {resolveTemplateLevelPresentation} from '../template-presentation.js';
import {getTokenLevelPresentation} from '../token-levels.js';

test('fractional cutouts retain shared geometry through normalization and map/effect clipping',()=>{
  const raw={id:' hole ',col:'1.25',y:'1.25',w:'1.5',h:'1.5'};
  const cutout=normalizeMapLevelCutout(raw);
  assert.deepEqual(cutout,{id:'hole',column:1.25,row:1.25,width:1.5,height:1.5});
  const level={id:'upper',mapUrl:'/upper.png',cutouts:[raw]};
  const normalized=normalizeMapLevelsState({levels:[level]});assert.deepEqual(normalized.levels[0].cutouts,[cutout]);
  const view={gridSize:64,gridOffsets:{left:0,top:0},mapPixelSize:{width:512,height:512}};
  assert.match(decodeURIComponent(buildMapLevelCutoutMask([raw],view)),/M 80 80 H 176 V 176 H 80 Z/);
  const shape={levelId:'level-0',elements:{root:{style:{left:'0px',top:'0px',width:'512px',height:'512px'}}}};
  assert.deepEqual(resolveTemplateLevelPresentation(shape,view,{viewerLevelId:'upper',levels:[{id:'level-0'},level]}),{
    visible:true,maskRects:[{x:80,y:80,width:96,height:96}],
  });
});
test('look-down edge visibility expands all cells overlapped by fractional cutouts',()=>{
  const levels={levels:[{id:'upper',mapUrl:'/upper.png',cutouts:[{column:1.25,row:1.25,width:1.5,height:1.5}]}]};
  const options={viewerLevelId:'upper',gmViewing:false};
  assert.equal(getTokenLevelPresentation({levelId:'level-0',column:3,row:3},levels,options).visible,true);
  assert.equal(getTokenLevelPresentation({levelId:'level-0',column:4,row:3},levels,options).visible,false);
  assert.equal(normalizeMapLevelCutout({column:Infinity,row:1}),null);
  assert.deepEqual(normalizeMapLevelCutout({column:0,row:0,width:Infinity,height:NaN}),{column:0,row:0,width:1,height:1});
});
