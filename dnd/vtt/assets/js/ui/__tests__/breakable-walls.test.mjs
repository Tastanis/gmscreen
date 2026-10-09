import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MATERIALS, validateProperties, restrictions, liveWalls, isBreakable, isBroken, isOneWay, movementBlocked, movementPathBlocked } from '../wall-properties.mjs';
import { validateWalls, split, cutIntoSquares } from '../wall-geometry.mjs';
import { makeSight } from '../vision-height.mjs';
import { rubbleKind, rubblePieces, rubbleLibrary, rubblePicture, rubbleSize, rubbleStrip, RUBBLE_STRIP_ACROSS, RUBBLE_SOLID, pickVersion, stableHash, standInRubble, plateUnder, insideRing, heapKind, RUBBLE_KINDS, RUBBLE_MAX_ACROSS, RUBBLE_MIN_ACROSS } from '../wall-rubble.mjs';

// A wall running north to south along x = 3, one square long per piece, with a door in the middle.
const wall = (extra = {}) => ({
  version: 1,
  nodes: [{ id: 'n0', x: 3, y: 0 }, { id: 'n1', x: 3, y: 1 }, { id: 'n2', x: 3, y: 2 }, { id: 'n3', x: 3, y: 3 }],
  segments: [
    { id: 'top', a: 'n0', b: 'n1', baseMode: 'fixed', base: 0, height: 2, ...extra.top },
    { id: 'door', a: 'n1', b: 'n2', baseMode: 'fixed', base: 0, height: 2, interaction: 'door', ...extra.door },
    { id: 'bottom', a: 'n2', b: 'n3', baseMode: 'fixed', base: 0, height: 2, ...extra.bottom },
  ],
});
const flat = () => 0;
const walker = (column, row) => ({ column, row, width: 1, height: 1 });
const crosses = (model, row) => movementBlocked(model, walker(2, row), walker(3, row), flat, flat);

test('a wall is breakable only when it has a material, and a one-way wall never is', () => {
  assert.deepEqual(MATERIALS, ['glass', 'wood', 'stone', 'metal']);
  assert.equal(isBreakable({ id: 'w' }), false, 'an unmarked wall is not breakable');
  for (const material of MATERIALS) assert.equal(isBreakable({ id: 'w', material }), true);
  assert.equal(isBreakable({ id: 'w', material: 'paper' }), false);
  for (const direction of ['left', 'right']) {
    assert.equal(isOneWay({ movementDirection: direction }), true);
    assert.throws(() => validateProperties({ material: 'stone', movementDirection: direction }), /One-way walls cannot be breakable/);
    assert.throws(() => validateProperties({ material: 'stone', sightDirection: direction }), /One-way walls cannot be breakable/);
    assert.equal(isBreakable({ material: 'stone', movementDirection: direction }), false);
  }
  assert.throws(() => validateProperties({ material: 'paper' }), /Invalid wall material/);
  assert.throws(() => validateProperties({ broken: true }), /Only a wall with a material can be broken/);
  assert.throws(() => validateProperties({ material: 'wood', broken: 'yes' }), /Invalid wall broken/);
  validateProperties({ material: 'wood', broken: true });
  validateProperties({ material: 'glass', interaction: 'window', broken: false });
  validateProperties({ movementDirection: 'left' });
});

test('a broken wall stops neither movement nor sight, and the wall beside it still does', () => {
  const standing = wall({ top: { material: 'stone' } });
  assert.equal(crosses(standing, 0), true, 'a breakable wall that is not broken is still a wall');
  const broken = validateWalls(wall({ top: { material: 'stone', broken: true } }));
  assert.equal(crosses(broken, 0), false, 'the broken piece lets a walker through');
  assert.equal(crosses(broken, 1), true, 'the closed door beside it still blocks');
  assert.equal(crosses(broken, 2), true, 'the wall piece beyond still blocks');
  assert.equal(movementPathBlocked(broken, walker(2, 0), { column: 4, row: 0, path: [{ column: 3, row: 0 }] }, flat, flat), false);
  assert.deepEqual([restrictions(broken.segments[0]).sight, restrictions(broken.segments[0]).movement], ['pass', 'pass']);
  // Everything except the editor reads the standing walls only.
  const live = liveWalls(broken);
  assert.deepEqual(live.segments.map((edge) => edge.id), ['door', 'bottom']);
  assert.equal(live.nodes, broken.nodes, 'nodes are untouched');
  assert.equal(liveWalls(standing), standing, 'a scene with nothing broken is handed back as it is');
  // Sight, by the same function the board's fog uses, straight from the stored walls.
  const sees = (model, row) => makeSight({ viewer: walker(2, row), viewerGround: 0, groundAt: flat, walls: model })({ x: 3.5, y: row + 0.5 }, 0.5);
  assert.equal(sees(standing, 0), false);
  assert.equal(sees(broken, 0), true, 'you can see through the gap');
  assert.equal(sees(live, 0), true);
  assert.equal(sees(broken, 2), false, 'but not through the wall that is left');
});

test('a broken door or window is open for good, whatever its door state', () => {
  for (const door of [{ open: false }, { open: false, locked: true }, { interaction: 'window', sight: 'pass' }]) {
    const model = validateWalls(wall({ door: { material: 'wood', broken: true, ...door } }));
    assert.equal(crosses(model, 1), false, JSON.stringify(door));
    assert.equal(isBroken(model.segments[1]), true);
  }
});

test('repairing puts the wall back, and cutting a wall keeps what it is made of', () => {
  const model = validateWalls(wall({ top: { material: 'stone', broken: true } }));
  delete model.segments[0].broken;
  assert.equal(crosses(validateWalls(model), 0), true);
  // The editor cuts a long wall into squares by splitting it; both halves stay breakable.
  const long = { version: 1, nodes: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 2, y: 0 }], segments: [{ id: 'long', a: 'a', b: 'b', material: 'wood' }] };
  split(long, 'long', { x: 1, y: 0 }, 'mid', 'second');
  assert.deepEqual(long.segments.map((edge) => [edge.id, edge.material]), [['long', 'wood'], ['second', 'wood']]);
  validateWalls(long);
});

test('rubble: one piece per square of broken wall, of the right kind', () => {
  assert.deepEqual(rubblePieces(wall()), [], 'nothing broken, nothing drawn');
  const model = wall({ top: { material: 'stone', broken: true }, door: { material: 'wood', broken: true }, bottom: { material: 'metal' } });
  const pieces = rubblePieces(model);
  assert.deepEqual(pieces.map((piece) => [piece.id, piece.kind]), [['top', 'stone'], ['door', 'door']]);
  assert.deepEqual([pieces[0].a, pieces[0].b], [{ x: 3, y: 0 }, { x: 3, y: 1 }]);
  assert.equal(rubbleKind({ material: 'glass', interaction: 'window' }), 'window');
  assert.equal(rubbleKind({ material: 'metal' }), 'metal');
  // A wall three squares long is three pictures end to end, not one stretched picture.
  const long = { version: 1, nodes: [{ id: 'a', x: 0, y: 5 }, { id: 'b', x: 3, y: 5 }], segments: [{ id: 'long', a: 'a', b: 'b', material: 'stone', broken: true }] };
  const tiles = rubblePieces(long);
  assert.deepEqual(tiles.map((piece) => piece.id), ['long#0', 'long#1', 'long#2']);
  assert.deepEqual(tiles.map((piece) => [piece.a.x, piece.b.x]), [[0, 1], [1, 2], [2, 3]]);
  // A short stub of wall still gets one.
  const stub = { version: 1, nodes: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 0.22, y: 0 }], segments: [{ id: 'stub', a: 'a', b: 'b', material: 'stone', broken: true }] };
  assert.equal(rubblePieces(stub).length, 1);
});

test('rubble size: a little longer than the wall piece; a picture keeps its own shape', () => {
  const one = rubbleSize(1);
  assert.ok(one.along > 1 && one.along < 1.2, 'overlaps its neighbours a little');
  // The stand-in: three long by two high, kept between a third of a square and most of one.
  assert.ok(Math.abs(one.across - 0.747) < 0.01);
  assert.equal(rubbleSize(0.22).across, RUBBLE_MIN_ACROSS, 'a stub is still wide enough to hide the painted wall');
  assert.equal(rubbleSize(1.4).across, RUBBLE_MAX_ACROSS, 'never a whole square across');
  // A heap picture: scaled by its long side, its height follows from its own shape. Never stretched.
  assert.ok(Math.abs(rubbleSize(2, 475 / 512).across - 2 * 1.12 * 475 / 512) < 1e-9, 'a heap stays nearly square');
});

test('a strip picture is drawn big enough to hide the painted wall, and shown only over its piece', () => {
  const shape = 200 / 600;
  for (const [length, id] of [[1, 'wall-1'], [1, 'wall-2'], [0.22, 'stub'], [Math.SQRT2, 'slant'], [1.49, 'long'], [1, 'wall-7#3']]) {
    const strip = rubbleStrip(length, shape, id);
    // The band through the middle of a strip is about a third of its height. Three quarters of a
    // square high makes that band thicker than a wall painted a fifth of a square thick.
    assert.ok(strip.across >= RUBBLE_STRIP_ACROSS, `${id}: ${strip.across} squares across`);
    assert.ok(strip.across < 1, `${id}: never a whole square across`);
    assert.ok(Math.abs(strip.across / strip.along - shape) < 1e-9, `${id}: the picture keeps its own shape`);
    // Seen: the whole piece, and a short fade past each end. Never a neighbouring square.
    assert.ok(Math.abs(strip.shown - (length + 2 * strip.fade)) < 1e-9);
    assert.ok(strip.fade > 0 && strip.fade <= 0.15, `${id}: the fade past each end is short`);
    // What is seen lies inside the middle of the picture, where its band is whole.
    const reach = Math.abs(strip.shift) + strip.shown / 2;
    assert.ok(reach <= (RUBBLE_SOLID * strip.along) / 2 + 1e-9, `${id}: reaches ${reach} of ${strip.along / 2}`);
    assert.deepEqual(rubbleStrip(length, shape, id), strip, 'the same on every redraw and every screen');
  }
  assert.equal(rubbleStrip(1, shape, 'wall-1').across, RUBBLE_STRIP_ACROSS, 'a one-square piece is three quarters of a square across');
  assert.notEqual(rubbleStrip(1, shape, 'wall-1').shift, rubbleStrip(1, shape, 'wall-2').shift, 'neighbours show different stretches of the picture');
  // A picture whose size could not be read is taken as three to one, not stretched to fit.
  assert.deepEqual(rubbleStrip(1, null, 'wall-1'), rubbleStrip(1, 1 / 3, 'wall-1'));
});

test('pictures are found by file name, and a wall always gets the same one', () => {
  const at = (name, width, height) => ({ url: `assets/images/rubble/${name}?v=9`, width, height });
  const library = rubbleLibrary([
    at('rubble-stone-2.webp', 600, 200),
    at('rubble-stone-1.webp', 600, 200),
    at('rubble-stone-10.webp', 600, 220),
    at('rubble-wood-1.webp', 600, 200),
    at('rubble-heap-stone-1.webp', 512, 442),
    at('rubble-heap-wood-1.webp', 512, 468),
    'assets/images/rubble/rubble-glass-1.png',
    at('readme.md', 0, 0),
    at('rubble-lava-1.png', 10, 10),
    at('rubble-heap-1.webp', 10, 10),
    '/dnd/vtt/assets/images/wall-stone.png',
  ]);
  assert.deepEqual(Object.keys(library).sort(), ['glass', 'heap-stone', 'heap-wood', 'stone', 'wood']);
  assert.deepEqual(library.stone.map((picture) => picture.url.split('/').pop()), ['rubble-stone-1.webp?v=9', 'rubble-stone-2.webp?v=9', 'rubble-stone-10.webp?v=9'], 'in number order');
  assert.ok(Math.abs(library.stone[0].aspect - 1 / 3) < 1e-9, 'each picture keeps its own shape');
  assert.ok(Math.abs(library['heap-stone'][0].aspect - 442 / 512) < 1e-9);
  assert.equal(library.glass[0].aspect, null, 'a bare address has no known shape');
  assert.deepEqual(rubbleLibrary(undefined), {});
  for (const id of ['bath-wall-007013fa', 'deadroot-edge-4-20-5-20', 'long#2']) {
    const first = rubblePicture(library, 'stone', id);
    assert.ok(library.stone.includes(first));
    for (let i = 0; i < 5; i++) assert.equal(rubblePicture(library, 'stone', id), first, 'the same on every redraw and every screen');
  }
  assert.equal(rubblePicture(library, 'metal', 'any'), null, 'a kind with no picture yet uses the stand-in');
  assert.equal(pickVersion('any', 0), -1);
  // Spread across versions: forty walls do not all land on one picture.
  const used = new Set(Array.from({ length: 40 }, (_, i) => pickVersion(`wall-${i}`, 3)));
  assert.equal(used.size, 3);
  assert.equal(stableHash('wall-1'), stableHash('wall-1'));
});

test('a door uses wood rubble and a window glass rubble until they have pictures of their own', () => {
  const at = (name) => ({ url: `assets/images/rubble/${name}`, width: 600, height: 200 });
  const library = rubbleLibrary([at('rubble-wood-1.webp'), at('rubble-glass-1.webp')]);
  assert.equal(rubblePicture(library, 'door', 'front-door').url, 'assets/images/rubble/rubble-wood-1.webp');
  assert.equal(rubblePicture(library, 'window', 'east-window').url, 'assets/images/rubble/rubble-glass-1.webp');
  // Once a door picture exists it is used instead.
  const withDoor = rubbleLibrary([at('rubble-wood-1.webp'), at('rubble-door-1.webp')]);
  assert.equal(rubblePicture(withDoor, 'door', 'front-door').url, 'assets/images/rubble/rubble-door-1.webp');
  assert.equal(rubblePicture(rubbleLibrary([]), 'door', 'front-door'), null, 'with no pictures at all the stand-in is drawn');
});

test('a broken object uses the heap of its own material', () => {
  assert.deepEqual(['stone', 'wood', 'glass', 'metal'].map(heapKind), ['heap-stone', 'heap-wood', 'heap-glass', 'heap-metal']);
  assert.equal(heapKind('paper'), 'heap-stone');
  for (const kind of ['heap-stone', 'heap-wood', 'heap-glass', 'heap-metal']) assert.ok(RUBBLE_KINDS.includes(kind));
  assert.ok(!RUBBLE_KINDS.includes('heap'), 'there is no plain heap any more');
});

test('the stand-in is the same drawing each time, fills its box, and differs by wall and by kind', () => {
  for (const kind of RUBBLE_KINDS) {
    const drawing = standInRubble(kind, 'wall-a');
    assert.deepEqual(standInRubble(kind, 'wall-a'), drawing, `${kind}: same wall, same drawing`);
    assert.notDeepEqual(standInRubble(kind, 'wall-b').bits, drawing.bits, `${kind}: another wall looks different`);
    assert.ok(drawing.bits.length >= 20 && /^M-0\.5,/.test(drawing.band), `${kind}: the band starts at the end of the picture`);
    assert.ok(drawing.band.includes('0.5,'), `${kind}: and reaches the other end`);
    for (const path of [drawing.band, ...drawing.bits.map((bit) => bit.d)]) {
      for (const [, x, y] of path.matchAll(/(-?\d*\.?\d+),(-?\d*\.?\d+)/g)) assert.ok(Math.abs(Number(x)) <= 0.5 && Math.abs(Number(y)) <= 0.5, `${kind}: stays inside its picture`);
    }
  }
  assert.notEqual(standInRubble('stone', 'w').bandFill, standInRubble('wood', 'w').bandFill);
  assert.equal(standInRubble('door', 'w').bandFill, standInRubble('wood', 'w').bandFill, 'a door breaks like wood');
});

test('rubble on a floor plate is told apart from rubble on bare ground', () => {
  const square = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  const ground = { id: 'ground', kind: 'floor', levelId: 'ground', height: 2, points: square(0, 0, 10, 10), holes: [square(6, 6, 8, 8)] };
  const roof = { id: 'roof', kind: 'roof', levelId: 'ground', height: 2, points: square(0, 0, 10, 10) };
  const balcony = { id: 'balcony', kind: 'floor', levelId: 'balcony', height: 4, points: square(0, 0, 10, 10) };
  const piece = { a: { x: 3, y: 0 }, b: { x: 3, y: 1 } };
  assert.equal(plateUnder(piece, 2, [roof, ground, balcony])?.id, 'ground', 'the plate at the wall\'s foot');
  assert.equal(plateUnder(piece, 4, [roof, ground, balcony])?.id, 'balcony');
  assert.equal(plateUnder(piece, 0, [roof, ground, balcony]), null, 'a wall on the ground below the plates is on bare ground');
  assert.equal(plateUnder({ a: { x: 7, y: 6.5 }, b: { x: 7, y: 7.5 } }, 2, [ground]), null, 'over a hole in the plate');
  assert.equal(plateUnder({ a: { x: 12, y: 0 }, b: { x: 12, y: 1 } }, 2, [ground]), null, 'beyond the plate');
  assert.equal(plateUnder(piece, 2, []), null);
  assert.equal(insideRing({ x: 1, y: 1 }, square(0, 0, 2, 2)), true);
});

test('marking a long wall breakable cuts it into one-square pieces', () => {
  let next = 0; const makeId = () => `new-${++next}`;
  const model = { version: 1, nodes: [{ id: 'a', x: 2, y: 5 }, { id: 'b', x: 6, y: 5 }], segments: [{ id: 'long', a: 'a', b: 'b', material: 'stone', height: 3 }] };
  const ids = cutIntoSquares(model, 'long', makeId);
  assert.equal(ids.length, 4);
  assert.equal(ids[0], 'long', 'the original is the first piece, so it stays selected');
  validateWalls(model);
  const node = (id) => model.nodes.find((n) => n.id === id);
  const spans = ids.map((id) => { const edge = model.segments.find((e) => e.id === id); return [node(edge.a).x, node(edge.b).x, edge.material, edge.height]; });
  assert.deepEqual(spans, [[2, 3, 'stone', 3], [3, 4, 'stone', 3], [4, 5, 'stone', 3], [5, 6, 'stone', 3]], 'four pieces end to end, each still stone and the same height');
  // Breaking one of them leaves the other three standing.
  model.segments.find((e) => e.id === ids[1]).broken = true;
  assert.deepEqual(rubblePieces(model).map((piece) => [piece.a.x, piece.b.x]), [[3, 4]]);
  assert.equal(liveWalls(model).segments.length, 3);
  // A wall about one square long is left alone, and so is a slanted one of that length.
  for (const [x, y] of [[1, 0], [1.4, 0], [0.22, 0], [1, 1]]) {
    const short = { version: 1, nodes: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x, y }], segments: [{ id: 'short', a: 'a', b: 'b', material: 'wood' }] };
    assert.deepEqual(cutIntoSquares(short, 'short', makeId), ['short']);
    assert.equal(short.segments.length, 1);
  }
  assert.deepEqual(cutIntoSquares(model, 'missing', makeId), []);
});
