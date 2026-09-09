import test from 'node:test';
import assert from 'node:assert/strict';
import {floorElevations, verticalFloorDistance, distanceWithFloorHeight} from '../../state/normalize/floor-elevation.js';

test('legacy floors default to one square steps in physical order, including hidden floors', () => {
 const levels={levels:[{id:'top',zIndex:2},{id:'hidden',zIndex:1,hidden:true},{id:'first',zIndex:0}]};
 assert.deepEqual([...floorElevations(levels)], [['level-0',0],['first',1],['hidden',2],['top',3]]);
 assert.equal(verticalFloorDistance({}, {levelId:'top'},levels),3);
});
test('explicit floor heights survive visibility changes and new floors default above their predecessor', () => {
 const levels={levels:[{id:'balcony',elevationSquares:5},{id:'roof'}]};
 assert.equal(floorElevations(levels).get('roof'),6);
 levels.levels[0].hidden=true;
 assert.equal(floorElevations(levels).get('roof'),6);
});
test('distance uses the greater horizontal or vertical separation, never a hypotenuse', () => {
 const levels={levels:[{id:'low',elevationSquares:2},{id:'high',elevationSquares:5}]};
 assert.equal(distanceWithFloorHeight(4,{}, {levelId:'low'},levels),4);
 assert.equal(distanceWithFloorHeight(2,{}, {levelId:'high'},levels),5);
 assert.equal(distanceWithFloorHeight(3,{}, {levelId:'high'},levels)<=3,false);
 assert.equal(distanceWithFloorHeight(0.5,{levelId:'high'}, {levelId:'high'},levels),0.5);
});
test('missing floors and invalid horizontal measurements cannot silently become in range', () => {
 assert.equal(distanceWithFloorHeight(1,{}, {levelId:'deleted'},{}),null);
 assert.equal(distanceWithFloorHeight(NaN,{}, {},{}),null);
 assert.equal(distanceWithFloorHeight(-1,{}, {},{}),null);
});
