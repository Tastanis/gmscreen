import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReachableMovementShape, buildSquareMovementShape } from '../movement-math.js';

const bounds = { minColumn: 0, minRow: 0, columns: 30, rows: 30 };
const origin = { column: 10, row: 10, width: 1, height: 1 };
const flat = () => ({ height: 0, multiplier: 1 });
const has = (shape, column, row) => shape.cells.some(([c, r]) => c === column && r === row);

test('with nothing changing the cost the outline is the plain square, exactly as before', () => {
  const square = buildSquareMovementShape({ origin, remaining: 4, bounds });
  assert.deepEqual(buildReachableMovementShape({ origin, remaining: 4, bounds }), square, 'no terrain lookup');
  assert.deepEqual(buildReachableMovementShape({ origin, remaining: 4, bounds, cellInfo: flat }), square, 'flat ground, no zones');
  assert.equal(buildReachableMovementShape({ origin, remaining: 4, bounds, cellInfo: flat }).edges, undefined);
});

test('difficult terrain pulls the outline in by its real cost', () => {
  // Columns 12 and beyond are x2: with 4 movement the token gets 1 square on dry ground
  // to column 11, then 2 for column 12, and cannot afford column 13 (needs 5).
  const cellInfo = (column) => ({ height: 0, multiplier: column >= 12 ? 2 : 1 });
  const shape = buildReachableMovementShape({ origin, remaining: 4, bounds, cellInfo });
  assert.ok(shape.edges.length > 0, 'a terrain-aware outline is drawn');
  assert.ok(has(shape, 11, 10) && has(shape, 12, 10), 'one dry square then one difficult square is affordable');
  assert.ok(!has(shape, 13, 10), 'the second difficult square would cost 5 of 4');
  assert.ok(has(shape, 6, 10) && has(shape, 10, 6) && has(shape, 6, 14), 'dry ground still reaches the full 4 squares');
  assert.ok(!has(shape, 14, 10));
  // x4 next to the token: 4 movement buys exactly one such square and nothing beyond it.
  const mud = buildReachableMovementShape({ origin, remaining: 4, bounds, cellInfo: (column) => ({ height: 0, multiplier: column >= 11 ? 4 : 1 }) });
  assert.ok(has(mud, 11, 10) && !has(mud, 12, 10));
  const short = buildReachableMovementShape({ origin, remaining: 3, bounds, cellInfo: (column) => ({ height: 0, multiplier: column >= 11 ? 4 : 1 }) });
  assert.ok(!has(short, 11, 10), 'with 3 movement a x4 square is out of reach');
});

test('climbing is charged, and a detour around difficult terrain is found', () => {
  // A 3-high ledge east of column 11: stepping up costs 3.
  const ledge = buildReachableMovementShape({ origin, remaining: 4, bounds, cellInfo: (column) => ({ height: column >= 12 ? 3 : 0, multiplier: 1 }) });
  assert.ok(has(ledge, 12, 10), '1 + 3 = 4 reaches the top of the ledge');
  assert.ok(!has(ledge, 13, 10), 'nothing is left to walk along the top');
  // A single difficult square straight ahead: going around it diagonally costs no more than usual.
  const pillar = buildReachableMovementShape({ origin, remaining: 3, bounds, cellInfo: (column, row) => ({ height: 0, multiplier: column === 11 && row === 10 ? 4 : 1 }) });
  assert.ok(has(pillar, 13, 10), 'the square beyond the obstacle is reached by stepping around it');
  assert.ok(!has(pillar, 11, 10), 'the x4 square itself needs 4 of 3');
});

test('a large token covers its whole body, and a broken lookup never shrinks or crashes the outline', () => {
  // The lookup is asked about the token's top-left square; at column 11 a 2 by 2 body would be in the x4 terrain.
  const big = buildReachableMovementShape({ origin: { column: 10, row: 10, width: 2, height: 2 }, remaining: 1, bounds, cellInfo: (column) => ({ height: 0, multiplier: column >= 11 ? 4 : 1 }) });
  assert.ok(has(big, 9, 9) && has(big, 11, 12), 'the body of a 2 by 2 token is included at each reachable position');
  assert.ok(!has(big, 12, 10), 'it cannot step east into x4 terrain with 1 movement');
  const square = buildSquareMovementShape({ origin, remaining: 2, bounds });
  assert.deepEqual(buildReachableMovementShape({ origin, remaining: 2, bounds, cellInfo: () => { throw new Error('no data'); } }), square);
  assert.deepEqual(buildReachableMovementShape({ origin, remaining: 2, bounds, cellInfo: () => ({ height: Number.NaN, multiplier: 'x' }) }), square);
  assert.equal(buildReachableMovementShape({ origin, remaining: 0, bounds, cellInfo: (column) => ({ height: 0, multiplier: column > 10 ? 2 : 1 }) }).outer.width, 1);
});

test('the board can supply the price of a step, so a new surcharge needs no change here', () => {
  // A 2-high ledge east of column 11. Priced as usual, 4 movement gets on top and one square along it.
  const cellInfo = (column) => ({ height: column >= 12 ? 2 : 0, multiplier: 1 });
  const usual = buildReachableMovementShape({ origin, remaining: 4, bounds, cellInfo });
  assert.ok(has(usual, 12, 10) && has(usual, 13, 10));
  // The same ledge with the squares of a climb after the first charged double: 1 + 1 + 2 = 4, nothing left on top.
  const climb = (from, to) => { const rise = to.height - from.height; return (rise >= 2 ? 1 + 2 * (rise - 1) : Math.max(1, Math.abs(rise))) + to.multiplier - 1; };
  const surcharged = buildReachableMovementShape({ origin, remaining: 4, bounds, cellInfo, stepCost: climb });
  assert.ok(has(surcharged, 12, 10) && !has(surcharged, 13, 10));
  // A broken or silly price falls back to the usual one instead of opening the whole map.
  for (const stepCost of [() => { throw new Error('no'); }, () => Number.NaN, () => 0, () => -5]) {
    assert.deepEqual(buildReachableMovementShape({ origin, remaining: 4, bounds, cellInfo, stepCost }), usual);
  }
});

test('a bridge is followed from the land: the outline reaches along it, and the canal under it is a separate walk', () => {
  // Bank at height 2 for rows up to 10, a canal bed at 0 below it, and a bridge at height 2 along
  // column 10 from the bank southwards. A walker on the bank edge has 4 movement.
  const onBridge = (column, row) => column === 10 && row >= 10 && row <= 16;
  const ground = (row) => (row <= 10 ? 2 : 0);
  const enter = (from, column, row) => {
    const arrivesOnBridge = onBridge(column, row) && (!from || from.state === 'bridge' || (from.height === 2 && from.row <= 10));
    return { height: arrivesOnBridge ? 2 : ground(row), multiplier: 1, state: arrivesOnBridge ? 'bridge' : '' };
  };
  const start = { column: 10, row: 10, width: 1, height: 1 };
  const shape = buildReachableMovementShape({ origin: start, remaining: 4, bounds, enter });
  assert.ok(shape.edges.length > 0);
  assert.ok(has(shape, 10, 14), 'four squares out along the bridge');
  // Stepping off the bank beside the bridge is a 2-square drop: 2 to get down, 2 left along the bed.
  assert.ok(has(shape, 11, 11) && has(shape, 11, 13) && !has(shape, 11, 14));
  // Without the walk, the same squares are priced as a drop from the bank: the bridge is cut short.
  const plain = buildReachableMovementShape({ origin: start, remaining: 4, bounds, cellInfo: (column, row) => ({ height: ground(row), multiplier: 1 }) });
  assert.ok(!has(plain, 10, 14), 'the old outline stopped at 13');
  // The walk is told where it came from, and a broken one changes nothing.
  const seen = [];
  buildReachableMovementShape({ origin: start, remaining: 1, bounds, enter: (from, column, row) => { seen.push(from ? [from.column, from.row] : null); return enter(from, column, row); } });
  assert.equal(seen[0], null, 'the starting square has no square before it');
  assert.ok(seen.length > 1 && seen.slice(1).every((from) => from && Math.abs(from[0] - 10) <= 1 && Math.abs(from[1] - 10) <= 1), 'every other square is entered from a square already reached');
  const square = buildSquareMovementShape({ origin: start, remaining: 2, bounds });
  assert.deepEqual(buildReachableMovementShape({ origin: start, remaining: 2, bounds, enter: () => { throw new Error('no data'); } }), square);
});
