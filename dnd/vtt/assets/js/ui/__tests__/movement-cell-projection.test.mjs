import test from 'node:test';
import assert from 'node:assert/strict';
import {projectedMovementCell, movementCellContains} from '../movement-cell-projection.js';
const grid = {size: 50, left: 10, top: 20};
test('projected cell picking follows raised terrain rather than the flat cell', () => {
  const shape = projectedMovementCell({column: 2, row: 3}, grid, p => ({x:p.x+12,y:p.y-36}));
  assert.deepEqual(shape.center,{x:147,y:159});
  assert.equal(movementCellContains(shape,{x:123,y:135}),true);
  assert.equal(movementCellContains(shape,{x:111,y:175}),false);
  assert.equal(shape.compressed,false);
});
test('compression responds to projected thickness, not elevation or stretched slopes', () => {
  const cell={column:0,row:0};
  assert.equal(projectedMovementCell(cell,grid,p=>({x:p.x,y:p.y*.2})).compressed,true);
  assert.equal(projectedMovementCell(cell,grid,p=>({x:p.x,y:p.y*2})).compressed,false);
  assert.equal(projectedMovementCell(cell,grid,p=>({x:p.x+900,y:p.y-900})).compressed,false);
});
