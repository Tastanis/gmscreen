import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildStairPerimeter,
  resolveSegmentColor,
  stairWalk,
} from '../stairs-geometry.js';

describe('stairs geometry — stairWalk', () => {
  test('A == B returns a single point', () => {
    const walk = stairWalk({ column: 2, row: 3 }, { column: 2, row: 3 });
    assert.deepEqual(walk, [{ column: 2, row: 3 }]);
  });

  test('straight horizontal walk emits only H steps', () => {
    const walk = stairWalk({ column: 0, row: 0 }, { column: 4, row: 0 });
    assert.equal(walk.length, 5);
    walk.forEach((p) => assert.equal(p.row, 0));
    assert.deepEqual(walk.map((p) => p.column), [0, 1, 2, 3, 4]);
  });

  test('straight vertical walk emits only V steps', () => {
    const walk = stairWalk({ column: 1, row: 0 }, { column: 1, row: 3 });
    assert.deepEqual(walk.map((p) => p.row), [0, 1, 2, 3]);
    walk.forEach((p) => assert.equal(p.column, 1));
  });

  test('(0,0)->(6,6) produces a pure zigzag (alternating V/H steps)', () => {
    const walk = stairWalk({ column: 0, row: 0 }, { column: 6, row: 6 });
    // 12 unit steps total
    assert.equal(walk.length, 13);
    // No 3-in-a-row along either axis — alternation should hold.
    for (let i = 0; i < walk.length - 2; i += 1) {
      const dx1 = walk[i + 1].column - walk[i].column;
      const dx2 = walk[i + 2].column - walk[i + 1].column;
      const dy1 = walk[i + 1].row - walk[i].row;
      const dy2 = walk[i + 2].row - walk[i + 1].row;
      // Two consecutive steps on the same axis would mean dx1 === dx2 !== 0 or dy1 === dy2 !== 0.
      const sameAxis = (dx1 !== 0 && dx2 !== 0) || (dy1 !== 0 && dy2 !== 0);
      assert.equal(sameAxis, false, `unexpected same-axis pair at step ${i}`);
    }
  });

  test('(0,0)->(1,6) places the single H jut near the middle, not an L', () => {
    const walk = stairWalk({ column: 0, row: 0 }, { column: 1, row: 6 });
    assert.equal(walk[0].column, 0);
    assert.equal(walk[walk.length - 1].column, 1);
    // Find the index where the column transitions 0 -> 1
    let jut = -1;
    for (let i = 1; i < walk.length; i += 1) {
      if (walk[i].column === 1 && walk[i - 1].column === 0) {
        jut = i;
        break;
      }
    }
    // For a 1-wide / 6-tall span, ideal jut is at row 3.
    assert.equal(walk[jut].row, 3, 'H step should occur at row 3, not at the ends');
    // It must NOT be an L-shape — that would put the jut at the start (row 0) or end (row 6).
    assert.notEqual(walk[jut].row, 0);
    assert.notEqual(walk[jut].row, 6);
  });

  test('(0,0)->(3,5) interleaves V-heavy without bunching all-of-one-axis', () => {
    const walk = stairWalk({ column: 0, row: 0 }, { column: 3, row: 5 });
    // 8 unit steps total
    assert.equal(walk.length, 9);
    // Reject any run of 4 same-axis steps in a row.
    let sameAxisRun = 1;
    let lastAxis = null;
    for (let i = 1; i < walk.length; i += 1) {
      const axis = walk[i].column !== walk[i - 1].column ? 'h' : 'v';
      if (axis === lastAxis) {
        sameAxisRun += 1;
      } else {
        sameAxisRun = 1;
        lastAxis = axis;
      }
      assert.ok(sameAxisRun < 4, `axis run too long at step ${i}`);
    }
  });
});

describe('stairs geometry — buildStairPerimeter', () => {
  test('a 1x1 rectangle produces exactly 4 unit segments', () => {
    const corners = [
      { column: 0, row: 0 },
      { column: 1, row: 0 },
      { column: 1, row: 1 },
      { column: 0, row: 1 },
    ];
    const segments = buildStairPerimeter(corners);
    assert.equal(segments.length, 4);
    const ids = segments.map((s) => s.id).sort();
    assert.deepEqual(ids, ['0,0-1,0', '0,0-0,1', '0,1-1,1', '1,0-1,1'].sort());
  });

  test('a 3x2 rectangle perimeter has 10 segments (no stairstep on straight sides)', () => {
    const corners = [
      { column: 0, row: 0 },
      { column: 3, row: 0 },
      { column: 3, row: 2 },
      { column: 0, row: 2 },
    ];
    const segments = buildStairPerimeter(corners);
    assert.equal(segments.length, 10);
  });

  test('skips duplicate segment ids when a corner collapses', () => {
    // Triangle-ish quad: corner 3 sits on top of corner 0
    const corners = [
      { column: 0, row: 0 },
      { column: 2, row: 0 },
      { column: 0, row: 2 },
      { column: 0, row: 0 },
    ];
    const segments = buildStairPerimeter(corners);
    const ids = new Set(segments.map((s) => s.id));
    assert.equal(ids.size, segments.length, 'no duplicate ids should slip through');
  });
});

describe('stairs geometry — resolveSegmentColor', () => {
  test('returns "barrier" by default and the stored override otherwise', () => {
    assert.equal(resolveSegmentColor({}, '0,0-1,0'), 'barrier');
    assert.equal(resolveSegmentColor(null, 'x'), 'barrier');
    assert.equal(resolveSegmentColor({ '0,0-1,0': 'green' }, '0,0-1,0'), 'green');
    assert.equal(resolveSegmentColor({ '0,0-1,0': 'red' }, '0,0-1,0'), 'red');
    // Invalid stored values are ignored — caller default applies.
    assert.equal(resolveSegmentColor({ '0,0-1,0': 'purple' }, '0,0-1,0'), 'barrier');
  });
});
