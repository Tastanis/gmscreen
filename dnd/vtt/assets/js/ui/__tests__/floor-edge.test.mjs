import { test } from 'node:test';
import assert from 'node:assert/strict';
import { edgeLooks, ownFloorHides, EDGE_REACH, EDGE_LEAN, hasOwnPicture, sceneStairs, climbMarkers } from '../height-view.mjs';
import { ceilingBlocks, floorBlocks } from '../roof-geometry.mjs';

// Brandon, October 10, on an island's rim: "the fact that I can't see pretty much straight down is a
// problem ... if you're standing on the edge of something and you are right on the edge of it, on that
// last square, you need to be able to see straight down too." And of the black beside the hero: "is
// there a box there blocking my vision? Is there a wall there? Or is it a hole?"

// An island from x 0 to 10, y 0 to 10, twelve squares up. A hero of size 1: eyes at 13.
const island = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
const on = (p) => p.x > 0 && p.x < 10 && p.y > 0 && p.y < 10;
const FLOOR = 12, EYE = 13, GROUND = 0;
const hidden = (centre, target, looks = edgeLooks(centre, 1, [island])) => ownFloorHides(centre, EYE, FLOOR, target, GROUND, on, looks);

test('from the middle of his square a hero on the rim could not see the ground for six squares out', () => {
  const rim = { x: 9.5, y: 5.5 };
  for (const out of [0.2, 1, 3, 5.5]) assert.equal(hidden(rim, { x: 10 + out, y: 5.5 }, []), true, out + ' squares beyond the edge was hidden');
  assert.equal(hidden(rim, { x: 17, y: 5.5 }, []), false, 'seven squares out was seen');
});

test('on the last square before a drop he looks over the edge and sees straight down', () => {
  const rim = { x: 9.5, y: 5.5 };
  assert.equal(edgeLooks(rim, 1, [island]).length, 1);
  for (const out of [0.2, 1, 3, 5.5, 20]) assert.equal(hidden(rim, { x: 10 + out, y: 5.5 }), false, out + ' squares beyond the edge');
  // And along the edge he stands at, north and south, just outside it.
  assert.equal(hidden(rim, { x: 10.3, y: 1 }), false);
  assert.equal(hidden(rim, { x: 10.3, y: 9.5 }), false);
});

test('he sees a little way in under the rim he stands on, and no further: the lean times the drop', () => {
  const rim = { x: 9.5, y: 5.5 };
  // Twelve down and leaning half a square out: six squares in under the edge.
  for (const under of [{ x: 9.8, y: 5.5 }, { x: 8, y: 5.5 }, { x: 4.5, y: 5.5 }]) assert.equal(hidden(rim, under), false, JSON.stringify(under));
  for (const under of [{ x: 3.5, y: 5.5 }, { x: 1, y: 5.5 }]) assert.equal(hidden(rim, under), true, JSON.stringify(under));
  // With no lean (a hair) nothing under his own floor is shown at all.
  const hair = edgeLooks(rim, 1, [island], EDGE_REACH, 0.01);
  for (const under of [{ x: 9.8, y: 5.5 }, { x: 9, y: 5.5 }, { x: 5, y: 5 }]) assert.equal(hidden(rim, under, hair), true, JSON.stringify(under));
  assert.equal(hidden(rim, { x: 10.2, y: 5.5 }, hair), false, 'and straight down outside the edge still is');
  assert.equal(EDGE_LEAN, 0.5);
});

test('one square back from the edge nothing changes: there is no edge to look over', () => {
  const back = { x: 8.5, y: 5.5 };
  assert.deepEqual(edgeLooks(back, 1, [island]), []);
  assert.equal(hidden(back, { x: 12, y: 5.5 }), true);
  assert.equal(hidden(back, { x: 12, y: 5.5 }), hidden(back, { x: 12, y: 5.5 }, []));
});

test('the far side of the island is still in the way: he looks over the edge beside him only', () => {
  // On the east rim, looking west across his own island at ground beyond its west edge.
  assert.equal(hidden({ x: 9.5, y: 5.5 }, { x: -3, y: 5.5 }), true);
  // A corner square looks over both edges that meet there.
  const corner = { x: 9.5, y: 9.5 };
  assert.equal(edgeLooks(corner, 1, [island]).length, 2);
  assert.equal(hidden(corner, { x: 12, y: 9.5 }), false);
  assert.equal(hidden(corner, { x: 9.5, y: 12 }), false);
});

test('an edge that cuts through the next square counts; one beyond it does not', () => {
  // The island ends 0.4 past the hero's own square: still his last square.
  const ragged = [{ x: 0, y: 0 }, { x: 10.4, y: 0 }, { x: 10.4, y: 10 }, { x: 0, y: 10 }];
  assert.equal(edgeLooks({ x: 9.5, y: 5.5 }, 1, [ragged]).length, 1);
  // It ends 0.6 past: the next square is floor too, and that is the last one.
  const further = [{ x: 0, y: 0 }, { x: 10.6, y: 0 }, { x: 10.6, y: 10 }, { x: 0, y: 10 }];
  assert.deepEqual(edgeLooks({ x: 9.5, y: 5.5 }, 1, [further]), []);
  assert.equal(EDGE_REACH, 0.5);
  // A large creature reaches from its own rim, not from its middle.
  assert.equal(edgeLooks({ x: 9, y: 5 }, 2, [island]).length, 1);
});

test('the rim of a hole (a balcony round a well) is an edge to look over too', () => {
  const well = [{ x: 4, y: 4 }, { x: 6, y: 4 }, { x: 6, y: 6 }, { x: 4, y: 6 }];
  const onBalcony = (p) => on(p) && !(p.x > 4 && p.x < 6 && p.y > 4 && p.y < 6);
  const hero = { x: 3.5, y: 5.5 }, looks = edgeLooks(hero, 1, [island, well]);
  assert.equal(looks.length, 2, 'the side of the well he stands at, and the corner of the side next to it');
  assert.equal(ownFloorHides(hero, 5, 4, { x: 4.5, y: 5.5 }, 2, onBalcony, []), true, 'the floor of the well, just below, was hidden');
  assert.equal(ownFloorHides(hero, 5, 4, { x: 4.5, y: 5.5 }, 2, onBalcony, looks), false, 'and is seen from the rim');
  assert.equal(ownFloorHides(hero, 5, 4, { x: 2.5, y: 5.5 }, 2, onBalcony, looks), true, 'the room under the balcony is not');
});

test('only what is below his floor is asked this way', () => {
  assert.equal(ownFloorHides({ x: 9.5, y: 5.5 }, EYE, FLOOR, { x: 12, y: 5.5 }, 12, on, []), false, 'level with the floor');
  assert.equal(ownFloorHides({ x: 9.5, y: 5.5 }, EYE, FLOOR, { x: 12, y: 5.5 }, 20, on, []), false, 'above it');
});

test('one floor asked by itself answers as the list of floors always did', () => {
  const roof = { height: 12, points: island, holes: [] }, origin = { x: 9.5, y: 5.5 };
  for (const [target, z] of [[{ x: 12, y: 5.5 }, 0], [{ x: 18, y: 5.5 }, 0], [{ x: 5, y: 5 }, 0], [{ x: 5, y: 5 }, 20], [{ x: 12, y: 5.5 }, 13]]) {
    assert.equal(floorBlocks(origin, EYE, target, z, roof), ceilingBlocks(origin, EYE, target, z, [roof]), JSON.stringify([target, z]));
  }
  assert.equal(ceilingBlocks(origin, EYE, { x: 12, y: 5.5 }, 0, []), false);
});

// ---- A floor with no picture of its own gets no outline (Dead Root's rope bridges, October 10:
// "it's showing there's something above you, but then I can also see the bridge").

test('a deck with no picture of its own is not outlined; a floor with one is', () => {
  assert.equal(hasOwnPicture({ id: 'deadroot-deck-1', height: 3, kind: 'floor', walkableDeckFor: 'rope bridge' }), false);
  assert.equal(hasOwnPicture({ id: 'deadroot-deck-1', imageId: null }), false);
  assert.equal(hasOwnPicture({ id: 'deadroot-walkway-0', imageId: '/dnd/vtt/storage/uploads/walkway.jpg' }), true);
});

// ---- Climb markers for players: "anything that uses that, I want that to show up for players too,
// because the red and green lines are great indicators that there's a ladder or something there."

test('a stair is taken once, though the ground and the floor it leads to each hold a copy', () => {
  const vine = { id: 'vine-1', corners: [] }, stair = { id: 'stair-2', corners: [] };
  const levels = { baseStairs: [vine], levels: [{ id: 'mid', stairs: [{ ...vine }, stair] }, { id: 'high', stairs: [{ ...stair }] }] };
  assert.deepEqual(sceneStairs(levels).map((s) => s.id), ['vine-1', 'stair-2']);
  assert.deepEqual(sceneStairs(null), []);
  assert.deepEqual(sceneStairs({ levels: [{ id: 'a' }] }), []);
});

test('the foot is drawn at the height the climb starts from and the head at the height it reaches', () => {
  // A vine one square long at column 12, row 30, from 12 up to 18, climbing north.
  const segments = [
    { from: { column: 12, row: 30 }, to: { column: 13, row: 30 }, colour: 'green' },
    { from: { column: 13, row: 30 }, to: { column: 13, row: 31 }, colour: 'barrier' },
    { from: { column: 12, row: 31 }, to: { column: 13, row: 31 }, colour: 'red' },
    { from: { column: 12, row: 30 }, to: { column: 12, row: 31 }, colour: 'barrier' },
  ];
  const rampHeight = (x, y) => (x >= 12 && x <= 13 && y >= 30 && y <= 31 ? 12 + (31 - y) * 6 : null);
  const lines = climbMarkers(segments, rampHeight, () => 0);
  assert.deepEqual(lines.map((l) => [l.colour, l.z, l.mid]), [['green', 18, { x: 12.5, y: 30 }], ['red', 12, { x: 12.5, y: 31 }]]);
  // The sides (not red, not green) are never drawn for a player.
  assert.equal(lines.some((l) => l.colour === 'barrier'), false);
});

test('a stair with no ramp of its own lies on the ground', () => {
  const lines = climbMarkers([{ from: { column: 4, row: 2 }, to: { column: 5, row: 2 }, colour: 'red' }], () => null, () => 0.24);
  assert.deepEqual(lines.map((l) => l.z), [0.24]);
});
