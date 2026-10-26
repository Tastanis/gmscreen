import test from 'node:test';
import assert from 'node:assert/strict';
import { openingHeight, mainGroundHeight } from '../opening-height.mjs';

// Medpilis (October 25, 2026): ground (level-0) is mostly the yard and courtyard at 3, with the chapel, cellar and
// steam works at 0 under the floors at 3; raised floors "Ground floors over drops" at 3 and "Upper" at 6. The
// Director's page opened at Height 0, so the 3D board hid the hall floor and a drop on the hall went to the chapel.
const medpilis = { activeLevelId: 'level-0', levels: [
  { id: 'ground', name: 'Ground floors over drops', elevationSquares: 3, zIndex: 1 },
  { id: 'upper', name: 'Upper', elevationSquares: 6, zIndex: 2 },
] };
const castle = { h: [...Array(60).fill(3), ...Array(25).fill(0), ...Array(10).fill(-8.5), 2.6, 3.4, 0.2] };

test('a castle opens at its main ground floor, not the basement under it', () => {
  assert.equal(openingHeight({ mapLevels: medpilis, levelId: 'level-0', terrain: castle }), 3);
});

test('the scene\'s own activeLevelId, when it names a raised floor, is where it opens', () => {
  assert.equal(openingHeight({ mapLevels: { ...medpilis, activeLevelId: 'upper' }, levelId: 'level-0', terrain: castle }), 6);
  assert.equal(openingHeight({ mapLevels: { ...medpilis, activeLevelId: 'gone' }, levelId: 'level-0', terrain: castle }), 3, 'an unknown floor is passed over');
  const hidden = { ...medpilis, activeLevelId: 'upper', levels: medpilis.levels.map((l) => (l.id === 'upper' ? { ...l, hidden: true } : l)) };
  assert.equal(openingHeight({ mapLevels: hidden, levelId: 'level-0', terrain: castle }), 3, 'a hidden floor is passed over');
});

test('the floor his page is on wins when it is a raised one', () => {
  assert.equal(openingHeight({ mapLevels: { ...medpilis, activeLevelId: 'upper' }, levelId: 'ground', terrain: castle }), 3);
});

test('a scene with no raised floors opens at its floor, as before; terrain not loaded yet gives 0', () => {
  assert.equal(openingHeight({ mapLevels: { levels: [] }, levelId: 'level-0', terrain: castle }), 0);
  assert.equal(openingHeight({ mapLevels: null, terrain: null }), 0);
  assert.equal(openingHeight({ mapLevels: medpilis, levelId: 'level-0', terrain: null }), 0);
});

test('mainGroundHeight: commonest whole square, ties to the higher, never below 0', () => {
  assert.equal(mainGroundHeight(castle), 3);
  assert.equal(mainGroundHeight({ h: [0, 0, 2, 2] }), 2);
  assert.equal(mainGroundHeight({ h: Float32Array.from([-4, -4, -4, 1]) }), 0);
  assert.equal(mainGroundHeight({ h: [] }), null);
});
