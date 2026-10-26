import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseSurface } from '../../../../board3d/surface-choice.mjs';

// Medpilis, October 25, 2026 (the Map maker): with every floor shown, the pointer over the hall's south aisle met the
// gallery overhead (height 6) first, so a hero walking in from the yard was told "Can't walk there". And with the
// hall floor hidden by the Height control, a drop over the hall went to the chapel under it.
const gallery = { x: 22.5, y: 25.5, z: 6, levelId: 'upper', surfaceId: 'gallery', hidden: false };
const hallUnderGallery = { x: 22.5, y: 23.5, z: 3, levelId: 'ground', surfaceId: 'hall', hidden: false };
const chapel = { x: 22.5, y: 22.5, z: 0, levelId: 'level-0', surfaceId: null, hidden: false };
const reachOnly = (...ok) => (hit) => ok.includes(hit);

test('under an overhang the walker is put down on the floor his walk reaches, not the one above', () => {
  assert.equal(chooseSurface([gallery, hallUnderGallery, chapel], { reaches: reachOnly(hallUnderGallery) }), hallUnderGallery);
});

test('only a surface at or near his own level is taken instead: never a drop to a floor far below that he did not point at', () => {
  // On the gallery (6), pointing at a gallery square his straight walk does not reach: the hall floor (3) under the
  // ray is reachable by vaulting the rail, but it is not what he pointed at.
  const farGallery = { ...gallery, x: 30.5, y: 12.5 };
  const hallBelow = { ...hallUnderGallery, x: 29.5, y: 14.5 };
  assert.equal(chooseSurface([farGallery, hallBelow], { reaches: reachOnly(hallBelow), level: 6 }), farGallery);
  // In the yard (3) under the gallery: the floor at his level is.
  assert.equal(chooseSurface([gallery, hallUnderGallery, chapel], { reaches: reachOnly(hallUnderGallery, chapel), level: 3 }), hallUnderGallery);
});

test('the first surface shown is kept whenever his walk reaches it, or nothing can say', () => {
  assert.equal(chooseSurface([gallery, hallUnderGallery], { reaches: reachOnly(gallery, hallUnderGallery) }), gallery);
  assert.equal(chooseSurface([gallery, hallUnderGallery], { reaches: () => null }), gallery, 'a flier, or no design');
  assert.equal(chooseSurface([gallery, hallUnderGallery]), gallery, 'no walker');
});

test('when nothing under the pointer is reached the first shown stands, so the board can say why', () => {
  assert.equal(chooseSurface([gallery, hallUnderGallery], { reaches: () => false }), gallery);
});

test('a floor hidden by the Height control is taken only when his walk reaches it and the shown one is not', () => {
  const hiddenHall = { ...hallUnderGallery, x: 24.5, y: 17.5, hidden: true };
  const chapelBelow = { ...chapel, x: 24.5, y: 17.5 };
  assert.equal(chooseSurface([hiddenHall, chapelBelow], { reaches: reachOnly(hiddenHall) }), hiddenHall, 'from the yard: the hall floor');
  assert.equal(chooseSurface([hiddenHall, chapelBelow], { reaches: reachOnly(chapelBelow, hiddenHall) }), chapelBelow, 'in the chapel: the chapel, as shown');
  assert.equal(chooseSurface([hiddenHall, chapelBelow], { reaches: () => false }), chapelBelow, 'never a hidden floor by default');
  assert.equal(chooseSurface([hiddenHall], { reaches: () => false }), null);
  assert.equal(chooseSurface([]), null);
});
