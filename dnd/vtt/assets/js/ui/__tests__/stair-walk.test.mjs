import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stairStep, stairCrossing, stairLane, stairPerimeter, nearStair } from '../stair-walk.mjs';

// The browser's copy of the stair rule gives the answers the server's code gives. The answers in
// the fixture were written by dnd/vtt/tools/make-stair-walk-fixture.php from FloorGeometry.php:
// 240 short walks by tokens of size 1 to 3 over stairs of five shapes, from the ground to a floor
// and between two floors.
const server = JSON.parse(readFileSync(new URL('./fixtures/stair-walk-server.json', import.meta.url), 'utf8'));

test('every move in the server\'s answers comes out the same here', () => {
  let moves = 0, changed = 0, onStair = 0;
  for (const chain of server.cases) {
    const mapLevels = server.scenes[chain.scene];
    for (const [[column, row, size, levelId, entry, toColumn, toRow], [floor, changedFloor, entryAfter]] of chain.moves) {
      const placement = { column, row, width: size, height: size, levelId, _floorTraversal: entry ? { stairId: 's', entry } : null };
      const step = stairStep(placement, { column: toColumn, row: toRow }, mapLevels);
      const got = [step?.fired ? step.levelId : levelId, !!step?.fired, step && !step.fired ? step.traversal.entry : null];
      assert.deepEqual(got, [floor, changedFloor, entryAfter], `${chain.scene}: size ${size} on ${levelId}${entry ? ` (on the stair, came in by ${entry})` : ''} from ${column},${row} to ${toColumn},${toRow}`);
      moves++; changed += changedFloor ? 1 : 0; onStair += entryAfter ? 1 : 0;
    }
  }
  // The fixture really does exercise the rule.
  assert.ok(moves > 1000 && changed >= 40 && onStair >= 150, `${moves} moves, ${changed} floor changes, ${onStair} left on a stair`);
});

const box = (l, t, r, b) => [{ column: l, row: t }, { column: r, row: t }, { column: r, row: b }, { column: l, row: b }];
// The islands arch: two wide, eight long, its head (green) at the south end.
const arch = { id: 'arch', corners: box(10, 10, 12, 18), edgeColors: { '10,18-11,18': 'green', '11,18-12,18': 'green', '10,10-11,10': 'red', '11,10-12,10': 'red' } };
const islands = {
  baseStairs: [],
  levels: [
    { id: 'mid', zIndex: 1, elevationSquares: 12, stairs: [{ ...arch, direction: 'up', linkedLevelId: 'high' }] },
    { id: 'high', zIndex: 2, elevationSquares: 18, stairs: [{ ...arch, direction: 'down', linkedLevelId: 'mid' }] },
  ],
};
const token = (column, row, levelId, extra = {}) => ({ column, row, width: 1, height: 1, levelId, ...extra });

test('a walker is carried by a ramp it came onto by its own end, and changes floor at the far end', () => {
  // Down from the high island: onto the head, along, and off the foot.
  let step = stairStep(token(10, 18, 'high'), { column: 10, row: 17 }, islands);
  assert.deepEqual(step, { fired: false, levelId: 'high', traversal: { stairId: 'arch', entry: 'green' }, carried: true });
  step = stairStep(token(10, 17, 'high', { _floorTraversal: step.traversal }), { column: 10, row: 10 }, islands);
  assert.equal(step.carried, true);
  step = stairStep(token(10, 10, 'high', { _floorTraversal: step.traversal }), { column: 10, row: 9 }, islands);
  assert.deepEqual(step, { fired: true, levelId: 'mid', stairId: 'arch' });
  // Up from the mid island, the whole length in one step.
  assert.deepEqual(stairStep(token(11, 9, 'mid'), { column: 11, row: 18 }, islands), { fired: true, levelId: 'high', stairId: 'arch' });
  // Into its side: on the stair's squares, but not carried.
  step = stairStep(token(9, 15, 'high'), { column: 10, row: 15 }, islands);
  assert.equal(step.fired, false); assert.equal(step.traversal.entry, 'barrier'); assert.equal(step.carried, false);
  // Off its side: no stair any more.
  assert.equal(stairStep(token(10, 15, 'high', { _floorTraversal: { stairId: 'arch', entry: 'green' } }), { column: 8, row: 15 }, islands), null);
  // Nowhere near it, on a floor with no stairs, or flying: not a stair matter.
  assert.equal(stairStep(token(3, 3, 'high'), { column: 4, row: 3 }, islands), null);
  assert.equal(stairStep(token(10, 18, 'level-0'), { column: 10, row: 9 }, islands), null);
  assert.equal(stairStep(token(10, 18, 'high', { movementMode: 'fly' }), { column: 10, row: 9 }, islands), null);
});

test('a size 2 token walks a one-wide stair by the column of it that is on the stair', () => {
  const narrow = { id: 's', direction: 'up', linkedLevelId: 'upper', corners: box(18, 20, 19, 23), edgeColors: { '18,20-19,20': 'green', '18,23-19,23': 'red' } };
  const map = { baseStairs: [narrow], levels: [{ id: 'upper', zIndex: 1 }] };
  for (const column of [17, 18]) {
    assert.deepEqual(stairStep({ column, row: 23, width: 2, height: 2, levelId: 'level-0' }, { column, row: 18 }, map), { fired: true, levelId: 'upper', stairId: 's' }, `column ${column}`);
  }
  assert.equal(stairStep({ column: 20, row: 23, width: 2, height: 2, levelId: 'level-0' }, { column: 20, row: 18 }, map), null, 'clear of the stair');
  assert.deepEqual(stairLane([{ x: 18, y: 24 }], narrow, 2, 2), [{ x: 18.5, y: 24 }]);
  assert.deepEqual(stairLane([{ x: 18.5, y: 24 }], narrow, 1, 1), [{ x: 18.5, y: 24 }]);
});

test('the outline, a plain crossing and the near-a-stair test', () => {
  assert.equal(stairPerimeter(arch.corners).length, 20);
  assert.deepEqual(stairPerimeter([{ column: 0, row: 0 }]), []);
  const down = { ...arch, direction: 'down' };
  assert.deepEqual(stairCrossing([{ x: 10.5, y: 18.5 }, { x: 10.5, y: 9.5 }], down), { fired: true, entry: null, endsInside: false });
  assert.deepEqual(stairCrossing([{ x: 10.5, y: 18.5 }, { x: 10.5, y: 14.5 }], down), { fired: false, entry: 'green', endsInside: true });
  assert.deepEqual(stairCrossing([{ x: 10.5, y: 14.5 }, { x: 10.5, y: 9.5 }], down, 'green'), { fired: true, entry: null, endsInside: false });
  assert.equal(nearStair(token(10, 19, 'high'), { column: 10, row: 18 }, islands), true);
  assert.equal(nearStair(token(2, 2, 'high'), { column: 3, row: 2 }, islands), false);
  assert.equal(nearStair(token(10, 19, 'level-0'), { column: 10, row: 18 }, islands), false);
});
