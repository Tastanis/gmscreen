import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizePlacementEntry } from '../normalize/placements.js';

test('normalizePlacementEntry preserves stackOrder when present', () => {
  const placement = normalizePlacementEntry({
    id: 'token-1',
    name: 'Large Token',
    stackOrder: '7',
  });

  assert.equal(placement.stackOrder, 7);
});

test('normalizePlacementEntry omits stackOrder when absent', () => {
  const placement = normalizePlacementEntry({
    id: 'token-1',
    name: 'Large Token',
  });

  assert.equal(Object.hasOwn(placement, 'stackOrder'), false);
});
