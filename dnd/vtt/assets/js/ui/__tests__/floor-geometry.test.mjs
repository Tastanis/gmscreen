import test from 'node:test';
import assert from 'node:assert/strict';
import { orderedPhysicalFloors, floorRelation, canConfirmPlanarAdjacency, canReachFloor, placementSquareDistance } from '../floor-geometry.js';

test('physical floor order always includes base below zero-ranked upper floors and excludes disabled floors', () => {
  const model = { levels: [{ id: 'second', zIndex: 2 }, { id: 'first', zIndex: 0 }, { id: 'hidden', zIndex: 1, hidden: true }] };
  assert.deepEqual(orderedPhysicalFloors(model).map(level => level.id), ['level-0', 'first', 'second']);
  assert.equal(floorRelation({ levelId: 'first' }, {}, model), 'above');
  assert.equal(floorRelation({}, { levelId: 'first' }, model), 'below');
  assert.equal(floorRelation({ levelId: 'hidden' }, { levelId: 'hidden' }, model), 'unknown');
  assert.equal(floorRelation({ levelId: 'deleted' }, {}, model), 'unknown');
  assert.equal(canConfirmPlanarAdjacency({}, {}, model), true);
  assert.equal(canConfirmPlanarAdjacency({ hidden: true }, {}, model), false);
});


test('floor reach respects radius in both directions and exact shared openings', () => {
 const low={column:2,row:2,width:1,height:1,levelId:'level-0'};
 const high={...low,levelId:'balcony'};
 const model={levels:[{id:'balcony',mapUrl:'/floor.png',elevationSquares:5,cutouts:[{column:2,row:2,width:1,height:1}]}]};
 assert.equal(canReachFloor(low,high,3,model),false);
 assert.equal(canReachFloor(high,low,3,model),false);
 assert.equal(canReachFloor(low,high,5,model),true);
 assert.equal(canReachFloor(high,low,5,model),true);
 model.levels[0].cutouts=[];
 assert.equal(canReachFloor(high,low,5,model),false);
 model.levels[0].cutouts=[{column:2.75,row:2,width:0.25,height:1}];
 assert.equal(canReachFloor(high,low,5,model),true);
 assert.equal(canReachFloor(high,{...low,column:1.1},5,model),false);
 assert.equal(canReachFloor(high,{...low,levelId:'missing'},5,model),false);
});
test('different holes on intervening floors do not make a common opening', () => {
 const model={levels:[{id:'middle',mapUrl:'/floor.png',zIndex:0,cutouts:[{column:1.2,row:2,width:1,height:1}]},
 {id:'top',mapUrl:'/floor.png',zIndex:1,cutouts:[{column:2.4,row:2,width:1,height:1}]}]};
 assert.equal(canReachFloor({column:1,row:2,width:3},{column:2,row:2,levelId:'top'},3,model),false);
});

test('placement distance measures occupied squares and takes the largest axis', () => {
  const small = { column: 2, row: 0, width: 1, height: 1 };
  const large = { column: 3, row: 0, width: 4, height: 4, levelId: 'upper' };
  const levels = { levels: [{ id: 'upper', elevationSquares: 5 }] };
  assert.equal(placementSquareDistance(small, { ...large, levelId: 'level-0' }, levels), 1);
  assert.equal(placementSquareDistance(small, large, levels), 5);
  assert.equal(placementSquareDistance(large, small, levels), 5);
  assert.equal(placementSquareDistance(small, { ...large, column: 10 }, levels), 8);
  assert.equal(placementSquareDistance({ ...small, column: 2.5 }, { ...large, levelId: 'level-0' }, levels), 0.5);
  assert.equal(placementSquareDistance(small, { ...large, levelId: 'deleted' }, levels), null);
  assert.equal(placementSquareDistance(small, { row: 2 }, levels), null);
});
