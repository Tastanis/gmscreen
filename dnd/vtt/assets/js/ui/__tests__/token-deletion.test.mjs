import assert from 'node:assert/strict';
import test from 'node:test';

import { getRemovableSelectedTokenIds } from '../board-interactions.js';

const placements = [
  { id: 'hero', hidden: false },
  { id: 'hidden-hero', hidden: true },
  { id: 'enemy', hidden: false },
];

test('GM token deletion accepts every selected canonical placement', () => {
  assert.deepEqual(
    getRemovableSelectedTokenIds({
      placements,
      selectedIds: new Set(['hero', 'hidden-hero', 'missing']),
      isGM: true,
    }),
    ['hero', 'hidden-hero'],
  );
});

test('players cannot delete allied or enemy tokens', () => {
  assert.deepEqual(
    getRemovableSelectedTokenIds({
      placements,
      selectedIds: ['hero', 'hidden-hero', 'enemy'],
      isGM: false,
    }),
    [],
  );
});
