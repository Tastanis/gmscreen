import { test } from 'node:test';
import assert from 'node:assert/strict';
import { traceSurfaceLeg, commandSurfaceEnding, stepGhost, surfaceBelow } from '../route-walker.mjs';
import { intersectsFloor } from '../floor-support.js';

// Thornbriar (November 10, 2026, the map chat): from the arch crown (an object's top at 9) a walk onto the great
// crossing under its edge (an object's top at 2) was told "Can't walk there" while held. The server takes the same
// move: a fall of 7 that lands on the crossing (FallOutcome::surfaceBelow). The page's walker dropped the token to
// the ground under the crossing (0), so it never reached the picked deck. Now it comes down on the highest surface
// under it, as the server does.
const ring = (l, t, r, b) => [{ x: l, y: t }, { x: r, y: t }, { x: r, y: b }, { x: l, y: b }];
const tops = [
  { id: 'box-top:obj:arch-crown', kind: 'floor', boxTop: true, levelId: 'level-0', height: 9, points: ring(14, 9, 17, 12) },
  { id: 'box-top:obj:great-crossing', kind: 'floor', boxTop: true, levelId: 'level-0', height: 2, points: ring(10, 12, 21, 15) },
];
const mapLevels = { baseStairs: [], levels: [] };
const terrain = () => 0;
const standing = (p) => { const s = tops.find((q) => q.id === p._supportSurfaceId); return s && intersectsFloor(p, s, []) ? s.height : terrain(p); };
const on = (column, row, plate) => ({ id: 'hero', column, row, width: 1, height: 1, levelId: 'level-0', _supportSurfaceId: plate });
const crown = on(15, 11, 'box-top:obj:arch-crown');

test('off the arch crown onto the crossing: the walk and the move both land on the crossing at 2', () => {
  const walked = traceSurfaceLeg({ actor: crown, end: { column: 15, row: 12 }, surfaces: tops, mapLevels, terrain, standing });
  assert.equal(walked.height, 2);
  assert.equal(walked.placement._supportSurfaceId, 'box-top:obj:great-crossing');
  const moved = commandSurfaceEnding({ actor: crown, points: [{ column: 15, row: 11 }, { column: 15, row: 12 }], surfaces: tops, mapLevels, terrain, standing, kind: 'walk' });
  assert.equal(moved.known, true);
  assert.equal(moved.height, 2, 'so the held token is not told it cannot walk there');
  assert.equal(moved.placement._supportSurfaceId, 'box-top:obj:great-crossing');
});

test('the 2D walker lands there too', () => {
  const stepped = stepGhost({ ghost: crown, column: 15, row: 12, actor: crown, surfaces: tops, mapLevels, terrain, plainHeight: () => 0 });
  assert.equal(stepped.height, 2);
  assert.equal(stepped.ghost._supportSurfaceId, 'box-top:obj:great-crossing');
});

test('off the crown onto bare ground is unchanged: the ground', () => {
  const walked = traceSurfaceLeg({ actor: crown, end: { column: 15, row: 8 }, surfaces: tops, mapLevels, terrain, standing });
  assert.equal(walked.height, 0);
  assert.equal(walked.placement._supportSurfaceId, null);
  const moved = commandSurfaceEnding({ actor: crown, points: [{ column: 15, row: 11 }, { column: 15, row: 8 }], surfaces: tops, mapLevels, terrain, standing, kind: 'walk' });
  assert.equal(moved.height, 0);
});

test('only what is under him and not above where he was; never the top he left; never under the ground', () => {
  const at = { column: 15, row: 12, width: 1, height: 1 };
  assert.equal(surfaceBelow(at, tops, mapLevels, 9, 0, 'box-top:obj:arch-crown')?.id, 'box-top:obj:great-crossing');
  assert.equal(surfaceBelow(at, tops, mapLevels, 1, 0, null), null, 'the crossing is above a walker at 1');
  assert.equal(surfaceBelow(at, tops, mapLevels, 9, 3, null), null, 'the crossing is under ground at 3 there');
  assert.equal(surfaceBelow({ column: 15, row: 11, width: 1, height: 1 }, tops, mapLevels, 9, 0, 'box-top:obj:arch-crown'), null);
});

// The same chat, item 3: on a labelled map nothing showed the Director the load check (walls.checks). The import
// preview now sends it and the import panel lists it before "Import as new scene".
import { readFileSync } from 'node:fs';
test('the import panel lists the map check', () => {
  const endpoint = readFileSync(new URL('../../../../api/v2/scene-import-preview.php', import.meta.url), 'utf8');
  assert.match(endpoint, /\$preview\['mapChecks'\] = array_values\(array_filter\(\$checks, 'is_string'\)\);/);
  const panel = readFileSync(new URL('../scene-import-preview.js', import.meta.url), 'utf8');
  assert.match(panel, /if \(Array\.isArray\(preview\.mapChecks\)\) \{/);
  assert.ok(panel.indexOf('preview.mapChecks') < panel.indexOf("install.textContent='Import as new scene'"), 'shown before the import button');
});

// The same chat, after Brandon's rule that trees are climbed: a drag onto a labelled object taller than 4 (the elders
// at 5, the climbing shoots at 9) was "Can't walk there", because a walk could end on a box top only a storey above
// the picked ground. A labelled object's top is the thing on the picked square, however tall.
test('a drag onto a tall labelled object reaches its top; an old map\'s box keeps the storey limit', () => {
  const source = readFileSync(new URL('../terrain-prototype.js', import.meta.url), 'utf8');
  const body = source.match(/function endsOnBoxAbove\(ending,picked\)\{[\s\S]*?\n\}/);
  assert.ok(body, 'the page has the rule');
  const endsOnBoxAbove = (0, eval)(`(${body[0]})`);
  const ending = (id, height) => ({ height, placement: { _supportSurfaceId: id } });
  assert.equal(endsOnBoxAbove(ending('box-top:obj:west-elder', 7), { surfaceElevation: 2 }), true, 'the West elder, rise 5');
  assert.equal(endsOnBoxAbove(ending('box-top:obj:shoot-3', 9), { surfaceElevation: 0 }), true, 'a climbing shoot at 9');
  assert.equal(endsOnBoxAbove(ending('box-top:seg-12', 9), { surfaceElevation: 0 }), false, 'a guessed box on an old map: a storey at most');
  assert.equal(endsOnBoxAbove(ending('box-top:obj:west-elder', 1), { surfaceElevation: 2 }), false, 'never below the picked height');
});
