import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { breakableThings, thingAt, toggleBreak, plateSquares, syncHeldSquares, newlyBrokenSquares } from '../break-tool.mjs';
import { resolveSupportSurfaces, intersectsFloor } from '../floor-support.js';
import { brokenPieces, pieceMismatch } from '../../../../board3d/breakable-art.mjs';

// Breakable floor plates (plan part 4). Brandon, November 11, 2026, Dead Root: "All of the bridges and stuff need this
// so that the floors of them can be broken"; November 12: "if any one of the pillars breaks, that whole side should
// collapse". The server half is api/v2/tests/breakable-floors.test.php.

const deck = () => ({ id: 'deck', kind: 'floor', levelId: 'level-0', height: 4, material: 'wood', points: [{ x: 2, y: 1 }, { x: 8, y: 1 }, { x: 8, y: 2 }, { x: 2, y: 2 }] });
const pillar = () => {
  const nodes = [[6, 3], [7, 3], [7, 4], [6, 4]].map(([x, y], i) => ({ id: `obj:pillar:p${i}`, x, y }));
  return { nodes, segments: nodes.map((n, i) => ({ id: `obj:pillar:${i}`, a: n.id, b: nodes[(i + 1) % 4].id, material: 'stone', object: 'pillar' })) };
};
const design = () => { const p = pillar(); return { version: 1, nodes: p.nodes, segments: p.segments, roofs: [deck()], objects: [{ id: 'pillar', material: 'stone', holds: [{ roof: 'deck', squares: ['5,1', '6,1'] }] }] }; };

test('a broken square is a hole in the plate, on the page as on the server', () => {
  const [plate] = resolveSupportSurfaces({ roofs: [{ ...deck(), broken: ['4,1'] }] });
  assert.equal(intersectsFloor({ column: 4, row: 1 }, plate), false);
  assert.equal(intersectsFloor({ column: 3, row: 1 }, plate), true);
  assert.equal(intersectsFloor({ column: 3.5, row: 1 }, plate), true, 'half over the hole is still on the deck');
  const plain = { roofs: [deck()] };
  assert.equal(resolveSupportSurfaces(plain), plain.roofs, 'nothing broken: the same list as before');
  assert.equal(plateSquares(deck()).length, 6);
});

test('the Break tool: each square of a breakable plate is its own thing, at the deck\'s height', () => {
  const model = design(), things = breakableThings(model), squares = things.filter((t) => t.plate);
  assert.equal(squares.length, 6);
  assert.equal(thingAt(things, { x: 4.5, y: 1.5 })?.key, 'square:deck@4,1');
  assert.equal(thingAt(things, { x: 6.5, y: 3.5 })?.key, 'object:pillar', 'the pillar under the deck is its own thing');
  assert.equal(toggleBreak(model, things.find((t) => t.key === 'square:deck@4,1')), true);
  assert.deepEqual(model.roofs[0].broken, ['4,1']);
  assert.equal(toggleBreak(model, breakableThings(model).find((t) => t.key === 'square:deck@4,1')), false, 'a second click mends it');
  assert.equal('broken' in model.roofs[0], false);
  const page = readFileSync(new URL('../wall-prototype.js', import.meta.url), 'utf8');
  assert.match(page, /const h=thing\.plate\?\{base:thing\.height,top:thing\.height\}:breakHeights/);
  assert.match(page, /return hit\?\.squares\?\{\.\.\.hit\.squares,z:hit\.height\}:null;/, 'the 3D pick tells the height, so stacked decks pick right');
});

test('an object that breaks takes the squares it holds up; mended, it puts them back', () => {
  const model = design(), before = structuredClone(model);
  toggleBreak(model, breakableThings(model).find((t) => t.key === 'object:pillar'));
  assert.deepEqual(syncHeldSquares(before, model), ['deck@5,1', 'deck@6,1']);
  assert.deepEqual(model.roofs[0].broken, ['5,1', '6,1']);
  assert.deepEqual(newlyBrokenSquares(before, model), ['deck@5,1', 'deck@6,1'], 'whoever stands there drops after the save');
  const broken = structuredClone(model);
  toggleBreak(model, breakableThings(model).find((t) => t.key === 'object:pillar'));
  syncHeldSquares(broken, model);
  assert.equal('broken' in model.roofs[0], false);
  const page = readFileSync(new URL('../wall-prototype.js', import.meta.url), 'utf8');
  assert.match(page, /function change\(before\)\{syncHeldSquares\(before,model\);/);
  assert.match(page, /window\.vttDropFromBrokenFloor\?\.\(drops,savingScene\)/);
  const board = readFileSync(new URL('../board-interactions.js', import.meta.url), 'utf8');
  assert.match(board, /patch: \{ movementMode: 'hover', flightHeight: height \}[\s\S]{0,200}patch: \{ movementMode: 'ground', flightHeight: null \}/);
});

test('the art: a broken square shows its piece\'s rubble, and the check names squares with no piece', () => {
  const model = { ...design(), roofs: [{ ...deck(), broken: ['4,1'] }] };
  const pieces = { 'deck@4,1': {}, 'deck@5,1': {}, pillar: {} };
  assert.deepEqual([...brokenPieces(model, pieces)], ['deck@4,1']);
  const { material, ...playerDeck } = model.roofs[0];
  assert.deepEqual([...brokenPieces({ roofs: [playerDeck] }, pieces)], ['deck@4,1'], 'a player\'s copy has no material, and still shows it');
  const check = pieceMismatch(model, pieces);
  assert.deepEqual(check.missing.sort(), ['deck@2,1', 'deck@3,1', 'deck@6,1', 'deck@7,1']);
  assert.deepEqual(check.unused, []);
});

test('a break keeps the 3D camera where it was (Brandon, November 12: "after each break it pops me out to the farthest map view")', () => {
  const board = readFileSync(new URL('../../../../board3d/integration.mjs', import.meta.url), 'utf8');
  // A broken square changes the floors, so the board is built again: for the same scene the camera is carried over.
  assert.match(board, /const kept=view&&builtSceneId===sceneId\?keptCamera\(view\):null;\s*if\(view\)\{/, 'read from the old view before it goes');
  assert.match(board, /if\(kept\)restoreCamera\(view,kept\);else if\(own\)focus\(own\.id\);else view\.home\(\);/, 'home only on a new scene');
  assert.match(board, /function restoreCamera\(v,kept\)\{v\.camera\.position\.copy\(kept\.position\);v\.controls\.target\.copy\(kept\.target\);/);
  // And the rebuilt board has the hole: drawn plates and 3D picks leave the broken square open.
  assert.match(board, /map\(r=>withBrokenHoles\(\{\.\.\.r,points:/);
});
