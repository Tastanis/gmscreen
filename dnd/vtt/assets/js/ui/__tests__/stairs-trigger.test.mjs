import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { evaluateStairCrossing } from '../stairs-trigger.js';

// A reusable down-stair: 3-wide, 4-tall rectangle from (1,1) to (4,5).
// Green is the top edge (row 1), red is the bottom edge (row 5).
function buildDownStair() {
  return {
    id: 'stair-test',
    direction: 'down',
    corners: [
      { column: 1, row: 1 },
      { column: 4, row: 1 },
      { column: 4, row: 5 },
      { column: 1, row: 5 },
    ],
    edgeColors: {
      '1,1-2,1': 'green',
      '2,1-3,1': 'green',
      '3,1-4,1': 'green',
      '1,5-2,5': 'red',
      '2,5-3,5': 'red',
      '3,5-4,5': 'red',
    },
    linkedLevelId: 'level-1',
  };
}

function buildUpStair() {
  return {
    ...buildDownStair(),
    direction: 'up',
    linkedLevelId: 'level-2',
  };
}

describe('stairs trigger — evaluateStairCrossing (down-stair, green→red triggers)', () => {
  test('walk straight through top (green) to bottom (red) fires', () => {
    const path = [
      { x: 2.5, y: 0.5 }, // outside, above
      { x: 2.5, y: 5.5 }, // outside, below
    ];
    assert.equal(evaluateStairCrossing(path, buildDownStair()), true);
  });

  test('enter green, exit green (same color back out) does not fire', () => {
    const path = [
      { x: 2.5, y: 0.5 },
      { x: 2.5, y: 3.0 },
      { x: 2.5, y: 0.5 },
    ];
    assert.equal(evaluateStairCrossing(path, buildDownStair()), false);
  });

  test('enter green, exit barrier (side wall) does not fire', () => {
    const path = [
      { x: 2.5, y: 0.5 }, // above (outside)
      { x: 2.5, y: 3.0 }, // inside
      { x: 0.5, y: 3.0 }, // left of polygon (outside, exited via left barrier)
    ];
    assert.equal(evaluateStairCrossing(path, buildDownStair()), false);
  });

  test('enter from barrier side does not fire even when exiting through red', () => {
    const path = [
      { x: 0.5, y: 3.0 }, // outside, left of polygon
      { x: 2.5, y: 3.0 }, // inside (entered through left barrier)
      { x: 2.5, y: 5.5 }, // outside, below (would have been red exit)
    ];
    assert.equal(evaluateStairCrossing(path, buildDownStair()), false);
  });

  test('starting inside the polygon never triggers', () => {
    const path = [
      { x: 2.5, y: 3.0 }, // already inside
      { x: 2.5, y: 5.5 }, // exit via red
    ];
    assert.equal(evaluateStairCrossing(path, buildDownStair()), false);
  });

  test('crossing green then red in a single straight segment also fires', () => {
    // A single A->B straight segment that goes from above the polygon
    // to below it — both crossings happen on one path segment.
    const path = [
      { x: 2.5, y: -0.5 },
      { x: 2.5, y: 6.0 },
    ];
    assert.equal(evaluateStairCrossing(path, buildDownStair()), true);
  });
});

describe('stairs trigger — evaluateStairCrossing (up-stair, red→green triggers)', () => {
  test('walk red->green on an up-stair fires', () => {
    const path = [
      { x: 2.5, y: 5.5 }, // outside, below
      { x: 2.5, y: 0.5 }, // outside, above
    ];
    assert.equal(evaluateStairCrossing(path, buildUpStair()), true);
  });

  test('walk green->red on an up-stair does NOT fire (wrong direction)', () => {
    const path = [
      { x: 2.5, y: 0.5 },
      { x: 2.5, y: 5.5 },
    ];
    assert.equal(evaluateStairCrossing(path, buildUpStair()), false);
  });
});

describe('stairs trigger — multi-waypoint paths', () => {
  test('zig-zag path that enters green, wanders inside, then exits red fires', () => {
    const path = [
      { x: 2.5, y: 0.5 },
      { x: 2.5, y: 2.0 },
      { x: 3.5, y: 3.0 },
      { x: 2.0, y: 4.0 },
      { x: 2.5, y: 5.5 },
    ];
    assert.equal(evaluateStairCrossing(path, buildDownStair()), true);
  });

  test('enter green, exit barrier, re-enter green, exit red fires (state resets cleanly)', () => {
    // Enter top green, exit left barrier, re-enter via top green, exit bottom red.
    const path = [
      { x: 2.5, y: 0.5 }, // above
      { x: 2.5, y: 3.0 }, // inside (green entry)
      { x: 0.5, y: 3.0 }, // left outside (barrier exit → state resets)
      { x: 0.5, y: 0.5 }, // top-left outside
      { x: 2.5, y: 0.5 }, // back to top center, outside
      { x: 2.5, y: 5.5 }, // straight down through polygon: green entry, red exit → fire
    ];
    assert.equal(evaluateStairCrossing(path, buildDownStair()), true);
  });
});
