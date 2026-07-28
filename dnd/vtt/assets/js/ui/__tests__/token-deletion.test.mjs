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
    ['hero', 'hidden-hero']
  );
});

test('player token deletion is limited to the visible token claimed by that player', () => {
  assert.deepEqual(
    getRemovableSelectedTokenIds({
      placements,
      selectedIds: ['hero', 'hidden-hero', 'enemy'],
      currentUserId: ' Cal ',
      claimedTokens: {
        hero: 'CAL',
        'hidden-hero': 'cal',
        enemy: 'gm',
      },
    }),
    ['hero']
  );
});

test('invalid claims and stale selected ids cannot delete a token', () => {
  assert.deepEqual(
    getRemovableSelectedTokenIds({
      placements,
      selectedIds: ['hero', 'missing'],
      currentUserId: 'cal',
      claimedTokens: {
        hero: null,
        missing: 'cal',
      },
    }),
    []
  );
});
