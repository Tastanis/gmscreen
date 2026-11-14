import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pieceKeysOf, brokenPieces, pieceMismatch, attachPieces, hasArtPiece } from '../../../../board3d/breakable-art.mjs';

// Breakable map art (Brandon, November 8, 2026, plan part 4: "Breaking a square hides the intact piece and shows its
// rubble. Everything else stays."). The art keeps its merged meshes; a pieces file names index ranges to hide and to
// show for each breakable thing. First used on Thornbriar, November 10, 2026.

const index = (n) => ({ array: Uint32Array.from({ length: n }, (_, i) => i + 1), count: n, needsUpdate: false });
const file = { pieces: {
  'west-elder': { hide: { Bark: [[6, 6]], Leaves: [[0, 3]] }, rubble: { Bark: [[18, 3]] } },
  'crate-row': { hide: { Bark: [[12, 6]] }, rubble: { Bark: [[21, 3]] } },
} };
const drawn = (mesh, start, count) => [...mesh.index.array.slice(start, start + count)].some((v) => v !== 0);

test('a wall names its piece by its object, then its group, then itself', () => {
  assert.deepEqual(pieceKeysOf({ id: 'obj:west-elder:2', object: 'west-elder', group: 'west-elder' }), ['west-elder', 'west-elder', 'obj:west-elder:2']);
  assert.deepEqual(pieceKeysOf({ id: 'obj:west-elder:2' }), ['west-elder', 'obj:west-elder:2'], 'a player is not sent the object or group of a standing wall: the id still says it');
  assert.deepEqual(pieceKeysOf({ id: 'w7', group: 'crate-row' }), ['crate-row', 'w7']);
  assert.deepEqual(pieceKeysOf({ id: 'w9' }), ['w9']);
});

test('the broken pieces are read from the walls the map plays with', () => {
  const model = { segments: [
    { id: 'obj:west-elder:0', broken: true }, { id: 'obj:west-elder:1', broken: true },
    { id: 'w7', group: 'crate-row', material: 'wood' },
    { id: 'obj:no-piece:0', broken: true },
  ] };
  assert.deepEqual([...brokenPieces(model, file.pieces)], ['west-elder']);
  assert.deepEqual([...brokenPieces({ segments: [] }, file.pieces)], []);
  assert.deepEqual([...brokenPieces(null, file.pieces)], []);
});

test('rubble is hidden until its piece breaks; the piece is hidden once it has; repair puts both back', () => {
  const meshes = new Map([['Bark', { index: index(24) }], ['Leaves', { index: index(6) }]]);
  const before = { Bark: meshes.get('Bark').index.array.slice(), Leaves: meshes.get('Leaves').index.array.slice() };
  const art = attachPieces(meshes, file);
  const bark = meshes.get('Bark'), leaves = meshes.get('Leaves');
  assert.deepEqual(art.problems, []);
  assert.ok(drawn(bark, 0, 6) && drawn(bark, 6, 6) && drawn(bark, 12, 6) && drawn(leaves, 0, 3), 'nothing broken: all the art is drawn');
  assert.ok(!drawn(bark, 18, 3) && !drawn(bark, 21, 3), 'and no rubble');

  bark.index.needsUpdate = false;
  assert.equal(art.apply(new Set(['west-elder'])), true);
  assert.ok(!drawn(bark, 6, 6) && !drawn(leaves, 0, 3), 'the broken tree is gone from every mesh it is in');
  assert.ok(drawn(bark, 18, 3), 'its rubble is drawn');
  assert.ok(drawn(bark, 0, 6) && drawn(bark, 12, 6) && !drawn(bark, 21, 3) && drawn(leaves, 3, 3), 'everything else stays as it was');
  assert.equal(bark.index.needsUpdate, true, 'the graphics card is told');
  assert.deepEqual([...art.broken], ['west-elder']);

  bark.index.needsUpdate = false;
  assert.equal(art.apply(new Set(['west-elder'])), false, 'the same set again changes nothing');
  assert.equal(bark.index.needsUpdate, false);

  assert.equal(art.sync({ segments: [] }), true, 'repaired');
  assert.deepEqual([...bark.index.array.slice(0, 18)], [...before.Bark.slice(0, 18)], 'the art is back exactly');
  assert.deepEqual([...leaves.index.array], [...before.Leaves]);
  assert.ok(!drawn(bark, 18, 6), 'and the rubble is gone again');
});

test('a pieces file that does not fit the art is said, and the rest still works', () => {
  const meshes = new Map([['Bark', { index: index(12) }]]);
  const art = attachPieces(meshes, { pieces: { a: { hide: { Bark: [[0, 6]], Moss: [[0, 3]] } }, b: { hide: { Bark: [[9, 6]] }, rubble: { Bark: [[1, 3]] } } } });
  assert.equal(art.problems.length, 3);
  assert.match(art.problems.join('\n'), /no mesh "Moss"/);
  assert.match(art.problems.join('\n'), /outside the mesh/);
  art.apply(new Set(['a']));
  assert.ok(!drawn(meshes.get('Bark'), 0, 6) && drawn(meshes.get('Bark'), 6, 6));
  assert.doesNotThrow(() => attachPieces(new Map(), null).apply(new Set(['x'])));
});

test('the load check: breakable things with no piece, and pieces nothing breaks', () => {
  const model = { segments: [{ id: 'obj:west-elder:0', object: 'west-elder', material: 'wood' }, { id: 'obj:boulder:0', object: 'boulder', material: 'stone' }, { id: 'w1' }] };
  assert.deepEqual(pieceMismatch(model, file.pieces), { missing: ['boulder'], unused: ['crate-row'] });
});

test('the board ties it together: the art loads its pieces, the board follows the broken walls, the zone fill can be left off', () => {
  const art = readFileSync(new URL('../../../../board3d/scene-art.mjs', import.meta.url), 'utf8');
  assert.match(art, /scene\.userData\.pieces=attachPieces\(named,pieces\)/);
  assert.match(art, /if\(option\.animation==='swamp-ripples'\)applySwampWaterAnimation\(material,option\);/);
  const board = readFileSync(new URL('../../../../board3d/integration.mjs', import.meta.url), 'utf8');
  assert.match(board, /const design=context\.environment\?\.walls,[^;]+;if\(piecesKey!==piecesAt\)\{piecesAt=piecesKey;sceneArtPieces\.sync\(design\?\.value\);\}/, 'a push, the Broken box, Repair and Undo all reach the art through the walls design of the map (the walls the page moves by leave broken ones out)');
  assert.match(board, /view\.terrainZoneFills=entry\.terrainZoneFills\|\|null;/);
  const zones = readFileSync(new URL('../../../../board3d/layers/terrain-zones.mjs', import.meta.url), 'utf8');
  assert.match(zones, /editing=!!c\.isGM&&!!panel&&!panel\.hidden;/);
  assert.match(zones, /if\(zone\.kind==='no-climb'&&!editing\)continue;/, 'no-climb ground is outlined for the Director while the Walls panel is open, never for players');
  assert.match(zones, /view\.terrainZoneFills\?\.\[zone\.tag\]!==false/);
});

test('no-climb ground is walked down as well as up: no ledge question, and the planner sees no drop', () => {
  const board = readFileSync(new URL('../board-interactions.js', import.meta.url), 'utf8');
  assert.match(board, /high - height < MOVEMENT_RULES\.climbGrade - 1e-6 && window\.terrainZones\?\.noClimb\?\.\(/);
  const planner = readFileSync(new URL('../../../../board3d/route-planner.mjs', import.meta.url), 'utf8');
  assert.match(planner, /const drop=!onStair&&!walkedDown&&/);
});

test('a broken wall with rubble in the art gets no broken marks on the 3D board (Brandon, November 13, 2026: "white circles in a line")', () => {
  const pieces = { 'west-elder': {}, 'gate-group': {}, 'w-9': {} };
  assert.equal(hasArtPiece({ id: 'obj:west-elder:3' }, pieces), true, 'by its object');
  assert.equal(hasArtPiece({ id: 'w-2', group: 'gate-group' }, pieces), true, 'by its group');
  assert.equal(hasArtPiece({ id: 'w-9' }, pieces), true, 'by itself');
  assert.equal(hasArtPiece({ id: 'w-1' }, pieces), false, 'no piece: the marks stay');
  const walls = readFileSync(new URL('../wall-prototype.js', import.meta.url), 'utf8');
  assert.match(walls, /const rubble=isBroken\(e\)&&board3d\(\)\?\.hasArtPiece\?\.\(e\);[\s\S]{0,300}if\(context\.isGM&&!rubble\)for/, 'the dashed line');
  assert.match(walls, /if\(!rubble\)strokes3d\.push\(\{kind:'dot'/, 'and its mark');
  assert.match(walls, /document\.addEventListener\('vtt3d:scene-built',\(\)=>\{try\{render\(true\);\}/, 'drawn again once the art is in');
  const board = readFileSync(new URL('../../../../board3d/integration.mjs', import.meta.url), 'utf8');
  assert.match(board, /hasArtPiece:edge=>!!sceneArtPieces&&hasArtPiece\(edge,sceneArtPieces\.pieces\)/);
});

test('an object\'s walls are not drawn faintly through the deck over them (Dead Root pillars, November 13, 2026)', () => {
  const walls = readFileSync(new URL('../wall-prototype.js', import.meta.url), 'utf8');
  assert.match(walls, /const through=!\(typeof e\.object==='string'&&e\.object\|\|\/\^obj:\/\.test\(String\(e\.id\)\)\);/);
  assert.match(walls, /opacity:panel\.hidden\?\.45:\.95,through,dash:/, 'the wall line');
  assert.match(walls, /opacity:panel\.hidden\?\.6:1,through\}\);/, 'and its breakable mark');
  const overlay = readFileSync(new URL('../../../../board3d/wall-overlay.mjs', import.meta.url), 'utf8');
  assert.match(overlay, /if\(!through\)return \[mat\];const ghost=mat\.clone\(\);ghost\.depthFunc=THREE\.GreaterDepth;/, 'no faint copy for those');
  assert.match(overlay, /through=item\.through!==false;/, 'any other wall keeps it');
});
