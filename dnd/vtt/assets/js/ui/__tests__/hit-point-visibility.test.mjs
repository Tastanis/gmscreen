import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldRevealPlacementHitPointValues } from '../board-interactions.js';

test('enemy hit-point totals are private to the GM', () => {
  const enemy = { id: 'enemy-1', combatTeam: 'enemy' };
  assert.equal(shouldRevealPlacementHitPointValues(enemy, { isGm: false }), false);
  assert.equal(shouldRevealPlacementHitPointValues(enemy, { isGm: true }), true);
});

test('ally hit-point totals remain visible to players', () => {
  assert.equal(
    shouldRevealPlacementHitPointValues({ id: 'ally-1', combatTeam: 'ally' }, { isGm: false }),
    true,
  );
});

test('legacy enemy team fields use the same privacy boundary', () => {
  assert.equal(shouldRevealPlacementHitPointValues({ team: 'enemy' }), false);
  assert.equal(shouldRevealPlacementHitPointValues({ tags: { team: 'enemy' } }), false);
  assert.equal(shouldRevealPlacementHitPointValues({ faction: 'enemy' }), false);
});
