import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { travelPath, travelStep } from '../travel-height.mjs';
import { movementBlocked, movementPathBlocked } from '../wall-properties.mjs';
import { resolveForcedDrag } from '../forced-drag.js';
import { rampGround } from '../imported-ramps.mjs';

// A creature that leaves a plate or a ramp travels on level, at the height it left from, and falls
// when the move ends. What stands on the ground far below its path does not stop it; what reaches
// its own height does. Found on the islands map: pushes off an island 6 or 18 squares up were
// refused because a stone tooth or a crystal stood on the crater floor under them.
//
// The same scene as the server's push-over-floor.test.php: a low island (6 high, columns 20 to 29,
// rows 10 to 19) over a flat floor, a crater wall (18 high) west of column 8, a stone tooth on the
// floor at (24,20) and another at (24,26), each one square ringed by walls two squares tall.
const centre = (p) => ({ x: p.column + (p.width || 1) / 2, y: p.row + (p.height || 1) / 2 });
const terrain = (x) => (x < 8 ? 18 : 0);
const onIsland = (p) => { const c = centre(p); return (p.levelId || 'level-0') === 'low' && c.x >= 20 && c.x <= 30 && c.y >= 10 && c.y <= 20; };
const footing = (p) => (onIsland(p) ? 6 : terrain(centre(p).x));
const groundAt = (x) => terrain(x);
const object = (id, column, row, base, height) => {
  const c = [[column + 0.04, row + 0.04], [column + 0.96, row + 0.04], [column + 0.96, row + 0.96], [column + 0.04, row + 0.96]];
  return {
    nodes: c.map(([x, y], k) => ({ id: `${id}-n${k}`, x, y })),
    segments: [0, 1, 2, 3].map((k) => ({ id: `${id}-w${k}`, a: `${id}-n${k}`, b: `${id}-n${(k + 1) % 4}`, baseMode: 'fixed', base, height, sight: 'block', movement: 'block' })),
  };
};
const objects = [object('tooth', 24, 20, 0, 2), object('far', 24, 26, 0, 2), object('pillar', 27, 15, 6, 3), object('spire', 21, 20, 0, 9)];
const model = { nodes: objects.flatMap((o) => o.nodes), segments: objects.flatMap((o) => o.segments) };
const token = (column, row, levelId = 'low', extra = {}) => ({ id: 't', column, row, width: 1, height: 1, levelId, ...extra });
/** What the board asks: is this move stopped by a wall, with the mover at its travelling height. */
const blocked = (from, to, kind = 'forced') => {
  const path = travelPath(from, footing, { kind });
  return movementBlocked(model, from, to, (t) => path.heightAt(t), groundAt);
};

test('one step: when a mover leaves its footing and when it has it again', () => {
  // The same table as the server's test.
  assert.deepEqual(travelStep(6, false, 0, 0.125), [6, true], 'six squares of drop in one step: off its footing, still 6 up');
  assert.deepEqual(travelStep(6, true, 0, 0.125), [6, true]);
  assert.deepEqual(travelStep(6, true, 2, 0.125), [6, true], 'in the air it stays level over whatever is below');
  assert.deepEqual(travelStep(6, true, 6, 0.125), [6, false]);
  assert.deepEqual(travelStep(6, true, 6.5, 0.125), [6.5, false], 'ground that comes back up to it is footing again');
  assert.deepEqual(travelStep(6, false, 5.85, 0.125), [5.85, false]);
  assert.deepEqual(travelStep(6, false, 6.4, 0.125), [6.4, false], 'a slope down or up: still on it');
  assert.deepEqual(travelStep(6, false, 5.7, 0.125), [6, true], 'steeper than a slope: off it');
  assert.deepEqual(travelStep(1, false, 0, 0.125), [1, true], 'a one-square bank: a pushed creature leaves it');
  assert.deepEqual(travelStep(1, false, 0, 0.125, 'walk'), [0, false], 'a walker steps down it');
  assert.deepEqual(travelStep(2, false, 0, 0.125, 'walk'), [2, true], 'a two-square drop: a walker has left its footing too');
});

test('a mover that has gone over an edge stays level for the rest of the move, however long', () => {
  const from = token(24, 19), path = travelPath(from, footing);
  for (const row of [19.25, 19.5, 19.6, 20, 21, 23.9, 26, 29, 40]) assert.equal(path.heightAt({ column: 24, row }), 6, `row ${row}`);
  // Asked in any order, and about another line afterwards.
  for (const row of [22, 19.1, 35, 19]) assert.equal(path.heightAt({ column: 24, row }), 6, `row ${row} again`);
  assert.equal(path.heightAt({ column: 24, row: 12 }), 6, 'back along the island');
  assert.equal(path.heightAt({ column: 35, row: 19 }), 6, 'off its east edge');
  // The old reading was the ground under it at every point: the floor, the moment it cleared the edge.
  assert.equal(footing({ ...from, row: 20 }), 0);
});

test('it has footing again only where the ground comes back up to it', () => {
  // A second island across a three-square gap, at the same height; then one a little lower.
  const second = (height) => (p) => { const c = centre(p); return c.y >= 23 && c.y <= 26 && c.x >= 20 && c.x <= 30 ? height : footing(p); };
  const level = travelPath(token(24, 19), second(6));
  assert.equal(level.heightAt({ column: 24, row: 21 }), 6, 'over the gap');
  assert.equal(level.heightAt({ column: 24, row: 24 }), 6, 'on the second island');
  assert.equal(level.heightAt({ column: 24, row: 28 }), 6, 'and off its far edge');
  const lower = travelPath(token(24, 19), second(5));
  assert.equal(lower.heightAt({ column: 24, row: 24 }), 6, 'an island a square lower is passed over: the fall comes at the end');
  // A slope it can stay on carries it down: a ramp from the island's edge to the floor, 6 down over 6.
  const ramp = (p) => { const c = centre(p); return c.y > 20 && c.y <= 26 ? 6 - (c.y - 20) : c.y > 26 ? 0 : footing(p); };
  const down = travelPath(token(24, 19), ramp);
  assert.equal(down.heightAt({ column: 24, row: 22.5 }), 3, 'pushed down a slope, it follows the slope');
  assert.equal(down.heightAt({ column: 24, row: 28 }), 0);
});

test('what stands on the floor under a push off an island does not stop it', () => {
  for (const squares of [1, 2, 3, 10]) assert.equal(blocked(token(24, 19), token(24, 19 + squares)), false, `pushed ${squares} south over the teeth`);
  // With the mover measured at the ground under it, as before, the tooth stopped it.
  assert.equal(movementBlocked(model, token(24, 19), token(24, 22), footing, groundAt), true, 'the fault');
  // A walker who steps off the edge makes that step at the island's height.
  assert.equal(blocked(token(24, 19), token(24, 20), 'walk'), false);
  assert.equal(movementPathBlocked(model, token(24, 18), { ...token(24, 20), path: [{ column: 24, row: 19 }] }, (t, origin) => travelPath(origin, footing, { kind: 'walk' }).heightAt(t), groundAt), false, 'by a route too');
});

test('what reaches the mover\'s own height still stops it', () => {
  assert.equal(blocked(token(24, 21, 'level-0'), token(24, 20, 'level-0')), true, 'a creature on the floor pushed into the tooth');
  assert.equal(blocked(token(24, 21, 'level-0'), token(24, 20, 'level-0'), 'walk'), true, 'or walking into it');
  assert.equal(blocked(token(25, 15), token(28, 15)), true, 'the pillar that stands on the island');
  assert.equal(blocked(token(21, 19), token(21, 22)), true, 'a spire on the floor that rises past the island');
});

test('a creature in the air is stopped by ground that stands above it', () => {
  assert.equal(travelPath(token(20, 12), footing).slams({ column: 3, row: 12 }), true, 'pushed off the island at the crater wall');
  assert.equal(travelPath(token(20, 12), footing).slams({ column: 9, row: 12 }), false, 'short of the wall');
  assert.equal(travelPath(token(24, 19), footing).slams({ column: 24, row: 29 }), false, 'open floor below');
  assert.equal(travelPath(token(14, 12, 'level-0'), footing).slams({ column: 3, row: 12 }), false, 'from the floor the wall is a slope to hit, not a slam: the terrain test stops that push');
  // Asked short of the wall first, then past it, on one path.
  const path = travelPath(token(20, 12), footing);
  assert.equal(path.slams({ column: 12, row: 12 }), false);
  assert.equal(path.slams({ column: 5, row: 12 }), true);
  assert.equal(path.slams({ column: 12, row: 12 }), false);
});

test('a creature on the floor under a push is not hit; one at the mover\'s height is', () => {
  const from = token(24, 19), path = travelPath(from, footing);
  const options = { height: footing, moverHeight: (origin, at) => path.heightAt(at) };
  const below = resolveForcedDrag(from, { column: 24, row: 23 }, [{ id: 'below', column: 24, row: 21, width: 1, height: 1, levelId: 'low' }], options);
  assert.deepEqual([below.destination.row, below.collidedIds], [23, []]);
  const beside = resolveForcedDrag(token(24, 14), { column: 28, row: 14 }, [{ id: 'beside', column: 26, row: 14, width: 1, height: 1, levelId: 'low' }], { height: footing, moverHeight: (origin, at) => travelPath(origin, footing).heightAt(at) });
  assert.deepEqual([beside.destination.column, beside.collidedIds], [25, ['beside']]);
  // Without a mover height of its own the resolver reads the ground, as it always did.
  assert.deepEqual(resolveForcedDrag(from, { column: 24, row: 23 }, [{ id: 'below', column: 24, row: 21, width: 1, height: 1, levelId: 'low' }], { height: footing }).collidedIds, ['below']);
});

test('a flier is wherever its own flight puts it', () => {
  const path = travelPath(token(24, 19, 'low', { movementMode: 'fly' }), footing);
  assert.equal(path.heightAt({ column: 24, row: 22 }, 9), 9);
  assert.equal(path.slams({ column: 3, row: 19 }), false);
});

test('a vine that reaches the floor never catches a shoved creature', () => {
  // The vine is the square (30,14), from the floor (0) up to the island (6), climbed westward.
  const vine = [{ id: 'vine', left: 30, right: 31, top: 14, bottom: 15, base: 0, height: 6, fromLevel: 'level-0', toLevel: 'low', direction: 'west' }];
  const at = { x: 30.5, y: 14.5 };
  assert.equal(rampGround(vine, token(30, 14, 'level-0'), at), null, 'a creature that never climbed it is on the ground under it');
  assert.equal(rampGround(vine, token(30, 14, 'level-0', { _floorTraversal: { stairId: 'vine', entry: 'red' } }), at), 3, 'one that is climbing it is half-way up');
  assert.equal(rampGround(vine, token(30, 14, 'low', { _floorTraversal: { stairId: 'vine', entry: 'green' } }), at), 3, 'from the top as well');
  // A stair that is a slope keeps the old allowance: a creature at its foot with no record is on it.
  const steps = [{ id: 'steps', left: 30, right: 34, top: 14, bottom: 15, base: 0, height: 4, fromLevel: 'level-0', toLevel: 'low', direction: 'west' }];
  assert.equal(rampGround(steps, token(33, 14, 'level-0'), { x: 33.5, y: 14.5 }), 0.5);
});

test('the board measures movers at their travelling height', () => {
  const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
  const walls = read('wall-prototype.js'), board = read('board-interactions.js');
  assert.match(walls, /forcedBlockedMove:\(from,to\)=>[^\n]*moverHeight\(from,t,'forced',true\)[^\n]*pathFor\(from,'forced'\)\.slams\(to\)[^\n]*moverHeight\(origin,t,'forced'\)/, 'pushes: slopes, slams and walls');
  assert.match(walls, /blockedMove:\(from,to\)=>[^\n]*moverHeight\(origin,t,'walk'\)/, 'walks');
  assert.equal(board.split("moverHeight:(from,at)=>window.wallPrototype?.moverHeight?.(from,at,'forced')").length - 1, 3, 'every place a push is resolved passes the mover height on: a drag, an ability, and the break-through question');
});
