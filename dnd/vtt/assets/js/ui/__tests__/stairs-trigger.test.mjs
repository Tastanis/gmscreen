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
    assert.equal(evaluateStairCrossing(path, buildDownStair()).fired, true);
  });

  test('enter green, exit green (same color back out) does not fire', () => {
    const path = [
      { x: 2.5, y: 0.5 },
      { x: 2.5, y: 3.0 },
      { x: 2.5, y: 0.5 },
    ];
    assert.equal(evaluateStairCrossing(path, buildDownStair()).fired, false);
  });

  test('enter green, exit barrier (side wall) does not fire', () => {
    const path = [
      { x: 2.5, y: 0.5 }, // above (outside)
      { x: 2.5, y: 3.0 }, // inside
      { x: 0.5, y: 3.0 }, // left of polygon (outside, exited via left barrier)
    ];
    assert.equal(evaluateStairCrossing(path, buildDownStair()).fired, false);
  });

  test('enter from barrier side does not fire even when exiting through red', () => {
    const path = [
      { x: 0.5, y: 3.0 }, // outside, left of polygon
      { x: 2.5, y: 3.0 }, // inside (entered through left barrier)
      { x: 2.5, y: 5.5 }, // outside, below (would have been red exit)
    ];
    assert.equal(evaluateStairCrossing(path, buildDownStair()).fired, false);
  });

  test('starting inside the polygon never triggers', () => {
    const path = [
      { x: 2.5, y: 3.0 }, // already inside
      { x: 2.5, y: 5.5 }, // exit via red
    ];
    assert.equal(evaluateStairCrossing(path, buildDownStair()).fired, false);
  });

  test('crossing green then red in a single straight segment also fires', () => {
    // A single A->B straight segment that goes from above the polygon
    // to below it — both crossings happen on one path segment.
    const path = [
      { x: 2.5, y: -0.5 },
      { x: 2.5, y: 6.0 },
    ];
    assert.equal(evaluateStairCrossing(path, buildDownStair()).fired, true);
  });
});

describe('stairs trigger — evaluateStairCrossing (up-stair, red→green triggers)', () => {
  test('walk red->green on an up-stair fires', () => {
    const path = [
      { x: 2.5, y: 5.5 }, // outside, below
      { x: 2.5, y: 0.5 }, // outside, above
    ];
    assert.equal(evaluateStairCrossing(path, buildUpStair()).fired, true);
  });

  test('walk green->red on an up-stair does NOT fire (wrong direction)', () => {
    const path = [
      { x: 2.5, y: 0.5 },
      { x: 2.5, y: 5.5 },
    ];
    assert.equal(evaluateStairCrossing(path, buildUpStair()).fired, false);
  });
});

describe('stairs trigger — multi-step (square-by-square) traversal', () => {
  // Each arrow-key step is one move event with a 2-point path (from → to).
  // To complete a traversal the trigger must remember the entry color
  // recorded by a previous step.

  test('three-step traversal: enter green (step 1), cross inside (step 2), exit red (step 3)', () => {
    const stair = buildDownStair(); // green=top(row1), red=bottom(row5)
    // Step 1: from above to one row inside (crosses green).
    const step1 = evaluateStairCrossing(
      [{ x: 2.5, y: 0.5 }, { x: 2.5, y: 1.5 }],
      stair
    );
    assert.equal(step1.fired, false);
    assert.equal(step1.endsInside, true);
    assert.equal(step1.entry, 'green');

    // Step 2: still inside, no crossing. Entry must persist.
    const step2 = evaluateStairCrossing(
      [{ x: 2.5, y: 1.5 }, { x: 2.5, y: 3.5 }],
      stair,
      { priorEntry: step1.entry }
    );
    assert.equal(step2.fired, false);
    assert.equal(step2.endsInside, true);
    assert.equal(step2.entry, 'green');

    // Step 3: exit through red. Should fire on a down-stair.
    const step3 = evaluateStairCrossing(
      [{ x: 2.5, y: 3.5 }, { x: 2.5, y: 5.5 }],
      stair,
      { priorEntry: step2.entry }
    );
    assert.equal(step3.fired, true);
  });

  test('square-by-square: enter red (step 1) then exit green (step 2) fires on up-stair', () => {
    const stair = buildUpStair();
    const step1 = evaluateStairCrossing(
      [{ x: 2.5, y: 5.5 }, { x: 2.5, y: 4.5 }],
      stair
    );
    assert.equal(step1.entry, 'red');
    assert.equal(step1.endsInside, true);

    const step2 = evaluateStairCrossing(
      [{ x: 2.5, y: 4.5 }, { x: 2.5, y: 0.5 }],
      stair,
      { priorEntry: step1.entry }
    );
    assert.equal(step2.fired, true);
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
    assert.equal(evaluateStairCrossing(path, buildDownStair()).fired, true);
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
    assert.equal(evaluateStairCrossing(path, buildDownStair()).fired, true);
  });
});
