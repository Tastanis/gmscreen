import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STAIR_NEAR, STAIR_AIM, stairEnds, stairAssume } from '../stair-assume.mjs';

// Brandon, October 10, 2026, of the bathhouse stair: "if I'm really close to it, like one square up. It should
// just push me down ... assuming I'm trying to get onto it. Needs to be a smart assume though so it doesn't snap
// me to it when I'm not trying to go up the stairs."

const at = (column, row) => ({ column, row });
// The bathhouse balcony stair: one square wide at column 18, rows 20 to 22; its foot edge is the south one
// (row 23), its head the north one (row 20). In front of the foot is 18,23; in front of the head, 18,19.
const corners = [at(18, 20), at(19, 20), at(19, 23), at(18, 23)];
const outline = [
  { from: at(18, 20), to: at(19, 20), colour: 'green' }, { from: at(19, 20), to: at(19, 21), colour: 'barrier' }, { from: at(19, 21), to: at(19, 22), colour: 'barrier' },
  { from: at(19, 22), to: at(19, 23), colour: 'barrier' }, { from: at(18, 23), to: at(19, 23), colour: 'red' }, { from: at(18, 20), to: at(18, 21), colour: 'barrier' },
];
const stair = stairEnds(corners, outline);
const down = (hero, target) => stairAssume(stair, true, hero, target), up = (hero, target) => stairAssume(stair, false, hero, target);

test('a stair object says which squares it covers and which side its foot is on', () => {
  assert.deepEqual(stair, { left: 18, right: 19, top: 20, bottom: 23, footSide: 'south' });
  const flip = (colour) => (colour === 'red' ? 'green' : colour === 'green' ? 'red' : colour);
  assert.equal(stairEnds(corners, outline.map((s) => ({ ...s, colour: flip(s.colour) }))).footSide, 'north');
  assert.equal(stairEnds(corners, outline.filter((s) => s.colour !== 'red')), null, 'no foot marked: nothing is assumed of it');
  assert.equal(stairEnds(corners.slice(0, 3), outline), null);
  assert.deepEqual([STAIR_NEAR, STAIR_AIM], [1, 1]);
});

test('going down from beside the head: he is taken to the head and down the stair', () => {
  // What he did in the bathhouse: stood beside the head and dragged to the foot. The straight line crossed the
  // stairwell and left him upstairs, on the square above the foot.
  assert.deepEqual(down(at(19, 19), at(18, 23)), [at(18, 19)]);
  assert.deepEqual(down(at(19, 19), at(18, 22)), [at(18, 19)], 'held over the run');
  assert.deepEqual(down(at(17, 18), at(18, 21)), [at(18, 19)], 'from the other side, a square back');
  assert.deepEqual(down(at(19, 19), at(19, 23)), [at(18, 19), at(18, 23)], 'held beside the foot: down the stair, then across');
});

test('going up from beside the foot: the same', () => {
  assert.deepEqual(up(at(19, 23), at(18, 19)), [at(18, 23)]);
  assert.deepEqual(up(at(19, 22), at(18, 20)), [at(18, 23)], 'held over the top step');
  assert.deepEqual(up(at(19, 22), at(19, 19)), [at(18, 23), at(18, 19)], 'held beside the head: up the stair, then across');
  assert.deepEqual(up(at(17, 24), at(18, 18)), [at(18, 23), at(18, 19)], 'held one past the head');
});

test('standing on the square in front of the end, the straight line already runs along the stair', () => {
  assert.equal(down(at(18, 19), at(18, 23)), null);
  assert.equal(up(at(18, 23), at(18, 21)), null);
  assert.deepEqual(up(at(18, 23), at(19, 19)), [at(18, 19)], 'but held beside the far end he is given its corner');
});

test('it does not grab: from further off, or held over somewhere the stair does not lead', () => {
  assert.equal(down(at(20, 19), at(18, 23)), null, 'two squares from the head');
  assert.equal(up(at(22, 22), at(18, 19)), null, 'from across the hall');
  assert.equal(down(at(19, 19), at(19, 21)), null, 'held over the balcony beside the stairwell');
  assert.equal(down(at(19, 19), at(21, 23)), null, 'held two squares from the foot');
  assert.equal(up(at(19, 23), at(21, 21)), null, 'held over the hall');
  assert.equal(up(at(19, 23), at(18, 17)), null, 'held two past the head');
  assert.equal(up(at(19, 23), at(18, 23)), null, 'only stepping to the square in front of the foot');
  assert.equal(down(at(18, 21), at(18, 23)), null, 'already on the stair');
});

test('a wide stair keeps him in the lane he is held over', () => {
  // An arch two squares wide (columns 17 and 18), rows 46 to 51, foot at the north.
  const arch = stairEnds([at(17, 46), at(19, 46), at(19, 52), at(17, 52)], [{ from: at(17, 46), to: at(18, 46), colour: 'red' }, { from: at(18, 46), to: at(19, 46), colour: 'red' }, { from: at(17, 52), to: at(18, 52), colour: 'green' }]);
  assert.equal(arch.footSide, 'north');
  assert.deepEqual(stairAssume(arch, false, at(19, 45), at(18, 49)), [at(18, 45)], 'held over the east lane');
  assert.deepEqual(stairAssume(arch, false, at(16, 45), at(17, 52)), [at(17, 45)], 'held over the west lane, at the far end');
  // A large creature is kept within the stair's width.
  assert.deepEqual(stairAssume(arch, false, at(16, 44), at(18, 49), 2), [at(17, 45)], 'held over the east lane, it still enters at 17: two wide, it fills the stair');
});

test('a stair that runs east and west', () => {
  const ramp = stairEnds([at(4, 2), at(8, 2), at(8, 3), at(4, 3)], [{ from: at(4, 2), to: at(4, 3), colour: 'red' }, { from: at(8, 2), to: at(8, 3), colour: 'green' }]);
  assert.equal(ramp.footSide, 'west');
  assert.deepEqual(stairAssume(ramp, false, at(3, 3), at(8, 2)), [at(3, 2)]);
  assert.deepEqual(stairAssume(ramp, true, at(8, 1), at(5, 2)), [at(8, 2)]);
});

test('the ruler shows the app\'s corners, sends them, and drops them the moment he drops his own or forces the move', () => {
  const ruler = readFileSync(new URL('../drag-ruler.js', import.meta.url), 'utf8');
  assert.match(ruler, /if \(state\.mode !== 'external' \|\| !state\.measuring \|\| state\.points\.length !== 1 \|\| !state\.hoverPoint\) return null;/);
  assert.match(ruler, /return state\.assumed\?\.length && state\.points\.length === 1 \? \[state\.points\[0\], \.\.\.state\.assumed\] : state\.points;/);
  assert.match(ruler, /sharedState\.assumed = assumedCorners\(sharedState\);/);
  const terrain = readFileSync(new URL('../terrain-prototype.js', import.meta.url), 'utf8');
  // Only when the straight line would not do, and the way by the stair is free of walls.
  assert.match(terrain, /const kind=getCurrentMovementKind\(\);if\(kind!=='walk'&&kind!=='shift'\)return null;/);
  assert.match(terrain, /if\(!Number\.isFinite\(byStair\.height\)\|\|\(Number\.isFinite\(plain\.height\)&&Math\.abs\(byStair\.height-plain\.height\)<\.05&&plain\.how===byStair\.how\)\)continue;/);
  assert.match(terrain, /if\(window\.wallPrototype\?\.blockedMove\?\.\(placement,\{column,row,path:corners\}\)\)continue;/);
  // The ghost and the pointer's pick follow the same route as the ruler.
  assert.match(terrain, /const corners=own\.length\?own:getCurrentMovementKind\(\)==='forced'\?\[\]:\(stairCorners\(placement,column,row\)\|\|\[\]\);/);
});
