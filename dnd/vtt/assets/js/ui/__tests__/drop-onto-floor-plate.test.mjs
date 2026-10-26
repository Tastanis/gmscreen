import { test } from 'node:test';
import assert from 'node:assert/strict';
import { traceSurfaceLeg, commandSurfaceEnding, fallLanding } from '../route-walker.mjs';
import { intersectsFloor, floorSupported } from '../floor-support.js';

// Medpilis (October 25, 2026, the Map maker's walk test): Cal on the hall gallery (floor at 6) vaults the rail onto
// the hall floor, a plate at 3 over the chapel (ground at 0). The move itself lands him on the hall floor (the
// endpoint fall of FloorGeometry::move, mirrored by commandSurfaceEnding), but the 3D board's walk of the same leg
// (traceSurfaceLeg) dropped him through the plate to the chapel floor, so the drop was refused while held: "Can't
// walk there" and "The walking route does not reach the picked surface". Drops onto open ground worked.
// Here: the gallery is columns 16-18 at 6; the hall floor columns 18-30 at 3 over ground at 0; the yard west of the
// gallery is ground at 3.
const ring = (l, t, r, b) => [{ x: l, y: t }, { x: r, y: t }, { x: r, y: b }, { x: l, y: b }];
const mapLevels = {
  baseStairs: [],
  levels: [
    { id: 'ground3', zIndex: 1, elevationSquares: 3, cutouts: [] },
    { id: 'upper6', zIndex: 2, elevationSquares: 6, cutouts: [{ column: 18, row: 10, width: 12, height: 10 }] },
  ],
};
const plates = [
  { id: 'hall', kind: 'floor', levelId: 'ground3', height: 3, points: ring(18, 10, 30, 20) },
  { id: 'gallery', kind: 'floor', levelId: 'upper6', height: 6, points: ring(16, 4, 32, 26) }, // the hall cut out of it
];
const cutouts = (id) => mapLevels.levels.find((l) => l.id === id)?.cutouts || [];
const terrain = (p) => (p.column + (p.width || 1) / 2 >= 18 ? 0 : 3);
// Where a token stands (groundFor): its plate, else its floor's height where that floor holds it, else the ground.
const standing = (p) => {
  if (p._supportSurfaceId) { const s = plates.find((q) => q.id === p._supportSurfaceId); if (s && intersectsFloor(p, s, cutouts(s.levelId))) return s.height; }
  const level = p.levelId || 'level-0';
  if (level !== 'level-0' && floorSupported(p, plates, cutouts(level)) === true) return mapLevels.levels.find((l) => l.id === level).elevationSquares;
  return terrain(p);
};
const cal = (column, row, levelId, plate) => ({ id: 'cal', column, row, width: 1, height: 1, levelId, _supportSurfaceId: plate });
const walk = (actor, end) => traceSurfaceLeg({ actor, end, surfaces: plates, mapLevels, terrain, standing });
const move = (actor, end) => commandSurfaceEnding({ actor, points: [{ column: actor.column, row: actor.row }, end], surfaces: plates, mapLevels, terrain, standing, kind: 'walk' });

test('over the gallery rail: the walk lands on the hall floor at 3, as the move does, not on the chapel under it', () => {
  const from = cal(17, 15, 'upper6', 'gallery'), to = { column: 18, row: 15 };
  const walked = walk(from, to), moved = move(from, to);
  assert.equal(walked.height, 3);
  assert.equal(walked.placement.levelId, 'ground3');
  assert.equal(walked.placement._supportSurfaceId, 'hall');
  assert.equal(moved.known, true);
  assert.equal(moved.height, 3, 'the move lands him there too');
  assert.equal(moved.placement.levelId, walked.placement.levelId);
  assert.equal(walked.samples.at(-1).height, 3, 'the drawn line ends on the hall floor');
});

test('landed on the hall floor he walks on along it in the same leg', () => {
  const walked = walk(cal(17, 15, 'upper6', 'gallery'), { column: 22, row: 15 });
  assert.equal(walked.height, 3);
  assert.equal(walked.placement._supportSurfaceId, 'hall');
  assert.ok(walked.samples.filter((s) => s.column >= 18.5).every((s) => s.height === 3), 'no dip to the chapel on the way');
});

test('off the gallery onto open ground is unchanged: the ground where he lands', () => {
  const walked = walk(cal(16, 15, 'upper6', 'gallery'), { column: 15, row: 15 });
  assert.equal(walked.height, 3);
  assert.equal(walked.placement.levelId, 'level-0');
  assert.equal(walked.placement._supportSurfaceId, null);
});

test('fallLanding: no plate above where he was, none buried under the ground, none on his own ground floor', () => {
  const over = { ...cal(20, 15, 'upper6', null) };
  assert.equal(fallLanding(over, plates, mapLevels, terrain, 6)?.id, 'hall');
  assert.equal(fallLanding(over, plates, mapLevels, terrain, 2), null, 'a plate a storey above him is not landed on');
  assert.equal(fallLanding(over, plates, mapLevels, () => 5, 6), null, 'a plate under higher ground is not landed on');
  assert.equal(fallLanding(cal(20, 15, 'level-0', null), plates, mapLevels, terrain, 6), null, 'on the ground already');
  const hidden = { ...mapLevels, levels: mapLevels.levels.map((l) => (l.id === 'ground3' ? { ...l, hidden: true } : l)) };
  assert.equal(fallLanding(over, plates, hidden, terrain, 6), null, 'a hidden floor holds no one');
});
