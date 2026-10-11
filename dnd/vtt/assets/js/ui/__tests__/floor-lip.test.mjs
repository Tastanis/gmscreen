import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lipDepth, inLip, lipInSight, rampEnds, ladderHeads, LIP_BACK, LIP_LEAST, LIP_MOST, RAISED_REACH, LADDER_NEAR, LADDER_TOP } from '../height-view.mjs';

// The lip of a floor above the eyes: what a player looking up is shown of it in picture. The rest
// of the floor is dark. Brandon, October 10: "it would show me the first square or the first half a
// square, depending on how far back I am ... as I move further back maybe I could see more of it."

// A boardwalk from x 10 to 20, y 0 to 4, with a square hole at x 14..16, y 1..3.
const boardwalk = (p) => p.x >= 10 && p.x <= 20 && p.y >= 0 && p.y <= 4 && !(p.x > 14 && p.x < 16 && p.y > 1 && p.y < 3);

test('the lip is half a square up close and grows as the viewer stands further back', () => {
  assert.equal(lipDepth(0.5), LIP_LEAST);
  assert.equal(lipDepth(3), LIP_LEAST);
  assert.equal(lipDepth(LIP_BACK), 1);
  assert.equal(lipDepth(LIP_BACK * 1.5), 1.5);
  assert.equal(lipDepth(100), LIP_MOST);
  assert.ok(lipDepth(8) > lipDepth(4), 'further back, more lip');
});

test('a viewer south of a boardwalk sees its near edge and not its far side', () => {
  const viewer = { x: 12, y: 10 };   // six squares south of the near edge at y 4
  assert.equal(inLip(viewer, { x: 12, y: 3.8 }, boardwalk), true, 'just inside the near edge');
  assert.equal(inLip(viewer, { x: 12, y: 3.2 }, boardwalk), true, 'most of a square in, from six squares back');
  assert.equal(inLip(viewer, { x: 12, y: 2.0 }, boardwalk), false, 'two squares in is not lip from there');
  assert.equal(inLip(viewer, { x: 12, y: 0.3 }, boardwalk), false, 'the far side is not seen from below');
});

test('standing further back shows more of it, up to the most', () => {
  const point = { x: 12, y: 2.4 };   // 1.6 squares in from the near edge
  assert.equal(inLip({ x: 12, y: 7 }, point, boardwalk), false, 'close: half a square of lip');
  assert.equal(inLip({ x: 12, y: 14 }, point, boardwalk), true, 'well back: nearly two squares of lip');
  assert.equal(inLip({ x: 12, y: 60 }, { x: 12, y: 1.5 }, boardwalk), false, 'never more than the most');
});

test('a viewer under the floor sees no lip: there is no edge between', () => {
  const viewer = { x: 12, y: 2 };
  assert.equal(inLip(viewer, { x: 12.3, y: 2.2 }, boardwalk), false);
  assert.equal(inLip(viewer, { x: 12, y: 2 }, boardwalk), false, 'nor straight overhead');
  // But stepping out from under it brings the edge into view.
  assert.equal(inLip({ x: 12, y: 5 }, { x: 12, y: 3.8 }, boardwalk), true);
});

test('the edge of a hole is a lip too, for a viewer looking across it', () => {
  // Under the hole, looking east at the floor on its far side: the hole's edge is between.
  assert.equal(inLip({ x: 15, y: 2 }, { x: 16.3, y: 2 }, boardwalk), true);
  // From outside to the west, the west rim of the hole is two squares in from the outer edge: not lip.
  assert.equal(inLip({ x: 2, y: 2 }, { x: 13.5, y: 2 }, boardwalk), false);
});

test('the numbers Brandon can ask to change are plain numbers', () => {
  for (const n of [LIP_BACK, LIP_LEAST, LIP_MOST, RAISED_REACH]) assert.ok(Number.isFinite(n) && n > 0);
  assert.equal(RAISED_REACH, 10);
});

// ---- the outline at the usual view: drawn when some of the lip is in sight and within reach

const ring = [{ x: 10, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 4 }, { x: 10, y: 4 }];
const hole = [{ x: 14, y: 1 }, { x: 16, y: 1 }, { x: 16, y: 3 }, { x: 14, y: 3 }];

test('the outline shows when the hero has a line to the lip, and not when a wall is in the way', () => {
  const viewer = { x: 12, y: 9 };
  assert.equal(lipInSight(viewer, [ring, hole], boardwalk, () => true), true);
  assert.equal(lipInSight(viewer, [ring, hole], boardwalk, () => false), false, 'no line to any of it');
  // A wall hides everything north of y 3.9 except nothing: the near edge itself is at y 4, so its lip (just inside) is hidden.
  assert.equal(lipInSight(viewer, [ring, hole], boardwalk, (p) => p.y > 4.5), false);
});

test('a floor out of reach, or straight overhead, draws no outline', () => {
  assert.equal(lipInSight({ x: 12, y: 30 }, [ring, hole], boardwalk, () => true), false, 'more than the reach away');
  assert.equal(lipInSight({ x: 12, y: 30 }, [ring, hole], boardwalk, () => true, 40), true, 'unless the reach is made longer');
  // Deep under a wide floor with no edge near: nothing to see.
  const wide = [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 60 }, { x: 0, y: 60 }];
  assert.equal(lipInSight({ x: 30, y: 30 }, [wide], (p) => p.x >= 0 && p.x <= 60 && p.y >= 0 && p.y <= 60, () => true), false);
});

// ---- ladder points

test('a ramp has a foot, a head and a steepness', () => {
  const vine = { left: 12, right: 13, top: 30, bottom: 31, base: 12, height: 18, direction: 'north' };
  assert.deepEqual(rampEnds(vine), { foot: { x: 12.5, y: 31 }, head: { x: 12.5, y: 30 }, grade: 6 });
  const arch = { left: 17, right: 19, top: 46, bottom: 52, base: 12, height: 18, direction: 'south' };
  assert.deepEqual(rampEnds(arch), { foot: { x: 18, y: 46 }, head: { x: 18, y: 52 }, grade: 1 });
  const east = { left: 4, right: 8, top: 2, bottom: 3, base: 0, height: 2, direction: 'east' };
  assert.deepEqual(rampEnds(east), { foot: { x: 4, y: 2.5 }, head: { x: 8, y: 2.5 }, grade: 0.5 });
});

test('a hero near the foot of a climb is shown its top; a stair or an arch is not a ladder point', () => {
  const vine = { left: 12, right: 13, top: 30, bottom: 31, base: 12, height: 18, direction: 'north' };
  const arch = { left: 17, right: 19, top: 46, bottom: 52, base: 12, height: 18, direction: 'south' };
  const ramps = [vine, arch], CLIMB = 1.5;
  assert.deepEqual(ladderHeads(ramps, { x: 12.5, y: 32.5 }, 12, 18, CLIMB), [{ x: 12.5, y: 30 }], 'at the foot of the vine');
  assert.deepEqual(ladderHeads(ramps, { x: 14.5, y: 32.5 }, 12, 18, CLIMB), [{ x: 12.5, y: 30 }], 'two and a half squares from the foot');
  assert.deepEqual(ladderHeads(ramps, { x: 12.5, y: 36 }, 12, 18, CLIMB), [], 'too far from the foot');
  assert.deepEqual(ladderHeads(ramps, { x: 18, y: 45.5 }, 12, 18, CLIMB), [], 'the arch is a slope, not a climb');
  assert.deepEqual(ladderHeads(ramps, { x: 12.5, y: 32.5 }, 0, 18, CLIMB), [], 'a hero on the ground far below the foot');
  assert.deepEqual(ladderHeads(ramps, { x: 12.5, y: 32.5 }, 12, 24, CLIMB), [], 'a floor the vine does not lead to');
  assert.ok(LADDER_NEAR === 3 && LADDER_TOP === 2);
});
