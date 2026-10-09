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

// ---- picking an offered square from what is painted -------------------------------------------
// Found on the islands map: clicking an offered square that hangs over a drop sent the target to
// the square whose ground was under the pointer, a square or two away (the height times the slant).
{
  const { paintedCellAt, paintProjectedMovementCell: paint, projectedMovementCell: projected } = await import('../movement-cell-projection.js');
  const { test: check } = await import('node:test');
  const assertStrict = (await import('node:assert/strict')).default;
  /** A painted cell as the page holds it: its box on the screen and its outline inside that box. */
  const painted = (cell, shape, { scale = 1, shift = { x: 0, y: 0 } } = {}) => {
    const attributes = {}, polygon = { getAttribute: (name) => attributes['polygon.' + name] };
    const svg = { getAttribute: (name) => attributes['svg.' + name], setAttribute: (name, value) => { attributes['svg.' + name] = value; }, firstElementChild: { setAttribute: (name, value) => { attributes['polygon.' + name] = value; } } };
    const node = { dataset: {}, style: {}, classList: { add() {} }, querySelector: (selector) => (selector === 'svg' ? svg : selector === 'polygon' ? polygon : null),
      getBoundingClientRect: () => ({ left: shape.minX * scale + shift.x, top: shape.minY * scale + shift.y, right: (shape.minX + shape.width) * scale + shift.x, bottom: (shape.minY + shape.height) * scale + shift.y, width: shape.width * scale, height: shape.height * scale }) };
    paint(node, cell, shape);
    return node;
  };
  const grid = { left: 0, top: 0, size: 64 };
  // A slant of 0.12: a thing h squares up is drawn 0.12 h squares up the screen and a third of that right.
  const lifted = (h) => (p) => ({ x: p.x + h * 0.04 * 64, y: p.y - h * 0.12 * 64 });

  check('a click on an offered square picks that square, however high it is drawn', () => {
    // Three squares in a column off a ledge, drawn 18 squares up: on the screen they sit over other ground.
    const cells = [{ column: 22, row: 45 }, { column: 22, row: 44 }, { column: 22, row: 43 }];
    const nodes = cells.map((cell) => painted(cell, projected(cell, grid, lifted(18))));
    for (const [i, cell] of cells.entries()) {
      const box = nodes[i].getBoundingClientRect();
      assertStrict.deepEqual(paintedCellAt(nodes, box.left + box.width / 2, box.top + box.height / 2), cell, `the middle of (${cell.column},${cell.row}) as drawn`);
    }
    // The ground under that same point is somewhere else: this is what the picker used to return.
    const box = nodes[0].getBoundingClientRect(), under = { column: Math.floor((box.left + box.width / 2) / 64), row: Math.floor((box.top + box.height / 2) / 64) };
    assertStrict.deepEqual(under, { column: 23, row: 43 });
  });

  check('zoomed and panned, the pick still follows what is on the screen', () => {
    const cell = { column: 24, row: 37 }, node = painted(cell, projected(cell, grid, lifted(6)), { scale: 0.5, shift: { x: 300, y: -40 } });
    const box = node.getBoundingClientRect();
    assertStrict.deepEqual(paintedCellAt([node], box.left + box.width / 2, box.top + box.height / 2), cell);
    assertStrict.equal(paintedCellAt([node], box.left - 3, box.top + 5), null, 'beside it is not it');
    assertStrict.equal(paintedCellAt([node], box.right + 1, box.bottom + 1), null);
  });

  check('where painted squares overlap, the one painted last is on top; outside a slanted outline is a miss', () => {
    const low = painted({ column: 5, row: 5 }, projected({ column: 5, row: 5 }, grid)), high = painted({ column: 5, row: 6 }, projected({ column: 5, row: 6 }, grid, lifted(8)));
    // The higher square is drawn 0.96 of a square up the screen, almost wholly over the lower one.
    const box = low.getBoundingClientRect();
    assertStrict.deepEqual(paintedCellAt([low, high], box.left + box.width / 2, box.top + box.height / 2), { column: 5, row: 6 });
    assertStrict.deepEqual(paintedCellAt([high, low], box.left + box.width / 2, box.top + box.height / 2), { column: 5, row: 5 });
    // A square whose corners are at different heights is a slanted shape: its box has empty corners.
    const tilted = painted({ column: 9, row: 9 }, projected({ column: 9, row: 9 }, grid, (p) => ({ x: p.x, y: p.y - (p.y > 9.5 * 64 ? 0 : 40) })));
    const tb = tilted.getBoundingClientRect();
    assertStrict.deepEqual(paintedCellAt([tilted], tb.left + tb.width / 2, tb.top + tb.height / 2), { column: 9, row: 9 });
    assertStrict.equal(paintedCellAt([], 10, 10), null);
    assertStrict.equal(paintedCellAt(null, 10, 10), null);
  });

  check('the ability move picker asks what is painted before anything else', async () => {
    const { readFileSync } = await import('node:fs');
    const board = readFileSync(new URL('../board-interactions.js', import.meta.url), 'utf8');
    assertStrict.match(board, /paintedCellAt\(automationMoveOverlay\?\.querySelectorAll\('\[data-automation-move-legal\] > \.vtt-automation-move__cell'\), event\.clientX, event\.clientY\)/);
    assertStrict.match(board, /if \(painted\) return pendingAutomationMove\.legalCells\.find\(cell => cell\.column === painted\.column && cell\.row === painted\.row\) \|\| painted;\s*const point = getLocalMapPoint\(event, \{terrain: false\}\);/);
  });
}
