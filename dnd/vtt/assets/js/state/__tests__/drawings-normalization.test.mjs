import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { BASE_MAP_LEVEL_ID } from '../normalize/map-levels.js';
import { normalizeDrawingEntry } from '../normalize/drawings.js';

describe('drawing normalization', () => {
  test('preserves synchronization and map-level metadata', () => {
    const drawing = normalizeDrawingEntry({
      id: 'stroke-1',
      points: [{ x: 1, y: 2 }, { x: 3, y: 4 }],
      levelId: ' upper ',
      _lastModified: 4567,
      authorId: ' Player One ',
    });

    assert.equal(drawing.levelId, 'upper');
    assert.equal(drawing._lastModified, 4567);
    assert.equal(drawing.authorId, 'player one');
  });

  test('defaults legacy drawings to Level 0', () => {
    const drawing = normalizeDrawingEntry({
      id: 'legacy-stroke',
      points: [{ x: 1, y: 2 }, { x: 3, y: 4 }],
    });

    assert.equal(drawing.levelId, BASE_MAP_LEVEL_ID);
  });
});
