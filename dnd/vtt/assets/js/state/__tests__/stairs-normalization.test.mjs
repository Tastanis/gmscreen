import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  canonicalizeSegmentKey,
  makeSegmentKey,
  normalizeStairEntry,
  normalizeStairList,
} from '../normalize/stairs.js';
import { normalizeMapLevelsState } from '../normalize/map-levels.js';

describe('stairs normalization', () => {
  test('normalizeStairEntry accepts a well-formed stair', () => {
    const stair = normalizeStairEntry({
      id: 'stair-a',
      direction: 'down',
      corners: [
        { column: 1, row: 1 },
        { column: 4, row: 1 },
        { column: 4, row: 6 },
        { column: 1, row: 6 },
      ],
      edgeColors: {
        // unit segments along the top edge (row 1) and bottom edge (row 6)
        '1,1-2,1': 'green',
        '2,1-3,1': 'green',
        '1,6-2,6': 'red',
        // formatting variant — should still canonicalize and store
        ' 2,6 - 3,6 ': 'red',
        // invalid color gets dropped
        '3,6-4,6': 'purple',
        // non-unit segment gets dropped
        '1,1-9,9': 'green',
      },
      linkedLevelId: 'level-2',
    });
    assert.equal(stair.id, 'stair-a');
    assert.equal(stair.direction, 'down');
    assert.equal(stair.linkedLevelId, 'level-2');
    assert.equal(stair.corners.length, 4);
    assert.deepEqual(stair.corners[0], { column: 1, row: 1 });
    assert.equal(stair.edgeColors['1,1-2,1'], 'green');
    assert.equal(stair.edgeColors['1,6-2,6'], 'red');
    assert.equal(stair.edgeColors['2,6-3,6'], 'red');
    assert.ok(!('3,6-4,6' in stair.edgeColors));
    assert.ok(!('1,1-9,9' in stair.edgeColors));
  });

  test('normalizeStairEntry rejects missing direction or linkedLevelId', () => {
    const corners = [
      { column: 0, row: 0 }, { column: 1, row: 0 },
      { column: 1, row: 1 }, { column: 0, row: 1 },
    ];
    assert.equal(normalizeStairEntry({ corners, direction: 'sideways', linkedLevelId: 'l' }), null);
    assert.equal(normalizeStairEntry({ corners, direction: 'down', linkedLevelId: '' }), null);
    assert.equal(normalizeStairEntry({ direction: 'down', linkedLevelId: 'l' }), null);
    assert.equal(normalizeStairEntry({ corners: corners.slice(0, 3), direction: 'down', linkedLevelId: 'l' }), null);
  });

  test('normalizeStairList drops duplicates by id', () => {
    const entry = {
      direction: 'down',
      corners: [
        { column: 0, row: 0 }, { column: 1, row: 0 },
        { column: 1, row: 1 }, { column: 0, row: 1 },
      ],
      linkedLevelId: 'l',
    };
    const list = normalizeStairList([
      { ...entry, id: 'a' },
      { ...entry, id: 'a' },
      { ...entry, id: 'b' },
    ]);
    assert.equal(list.length, 2);
    assert.deepEqual(list.map((s) => s.id), ['a', 'b']);
  });

  test('makeSegmentKey canonicalizes endpoint order', () => {
    assert.equal(makeSegmentKey({ column: 4, row: 1 }, { column: 3, row: 1 }), '3,1-4,1');
    assert.equal(makeSegmentKey({ column: 3, row: 2 }, { column: 3, row: 1 }), '3,1-3,2');
    // non-unit / diagonal rejected
    assert.equal(makeSegmentKey({ column: 0, row: 0 }, { column: 2, row: 0 }), null);
    assert.equal(makeSegmentKey({ column: 0, row: 0 }, { column: 1, row: 1 }), null);
  });

  test('canonicalizeSegmentKey normalizes formatting and rejects junk', () => {
    assert.equal(canonicalizeSegmentKey('  4,1 - 3,1  '), '3,1-4,1');
    assert.equal(canonicalizeSegmentKey('not-a-key'), null);
  });

  test('mapLevels normalization carries stairs through per-level and baseStairs', () => {
    const normalized = normalizeMapLevelsState({
      levels: [
        {
          id: 'level-1',
          stairs: [
            {
              id: 'stair-x',
              direction: 'down',
              corners: [
                { column: 0, row: 0 }, { column: 1, row: 0 },
                { column: 1, row: 1 }, { column: 0, row: 1 },
              ],
              edgeColors: { '0,0-1,0': 'green', '0,1-1,1': 'red' },
              linkedLevelId: 'level-0',
            },
          ],
        },
      ],
      baseStairs: [
        {
          id: 'stair-x',
          direction: 'up',
          corners: [
            { column: 0, row: 0 }, { column: 1, row: 0 },
            { column: 1, row: 1 }, { column: 0, row: 1 },
          ],
          edgeColors: { '0,0-1,0': 'green', '0,1-1,1': 'red' },
          linkedLevelId: 'level-1',
        },
      ],
    });
    assert.equal(normalized.levels[0].stairs.length, 1);
    assert.equal(normalized.baseStairs.length, 1);
    assert.equal(normalized.levels[0].stairs[0].direction, 'down');
    assert.equal(normalized.baseStairs[0].direction, 'up');
    assert.equal(normalized.baseStairs[0].id, normalized.levels[0].stairs[0].id);
  });
});
