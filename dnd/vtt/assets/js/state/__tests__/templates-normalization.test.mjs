import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { BASE_MAP_LEVEL_ID } from '../normalize/map-levels.js';
import { normalizeTemplateEntry } from '../normalize/templates.js';

describe('template normalization', () => {
  test('preserves explicit template level ids', () => {
    const template = normalizeTemplateEntry({
      id: 'burning-hands',
      type: 'rectangle',
      start: { column: 2, row: 3 },
      length: 3,
      width: 2,
      rotation: 45,
      levelId: 'upper-floor',
    });

    assert.equal(template.levelId, 'upper-floor');
  });

  test('defaults legacy templates without a level to Level 0', () => {
    const template = normalizeTemplateEntry({
      id: 'legacy-wall',
      type: 'wall',
      squares: [{ column: 1, row: 1 }],
    });

    assert.equal(template.levelId, BASE_MAP_LEVEL_ID);
  });

  test('preserves wall material on wall templates', () => {
    const template = normalizeTemplateEntry({
      id: 'fire-wall',
      type: 'wall',
      wallColor: 'fire',
      squares: [{ column: 2, row: 4 }],
    });

    assert.equal(template.wallColor, 'fire');
  });
});
