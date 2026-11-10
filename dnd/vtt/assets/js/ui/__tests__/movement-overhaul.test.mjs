import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeZones, buildZoneIndex, squareCostMultiplier, zoneCostFor, movementWaiver } from '../terrain-zones.mjs';
import { routeSteps, isClimb, stepCost } from '../terrain-math.mjs';
import { buildReachableMovementShape } from '../../token-system/movement-math.js';
import { portalKind, portalIcon, portalTitle } from '../door-icons.mjs';
import { moveQuestionText } from '../move-question.js';
import { MOVEMENT_RULES } from '../movement-rules.mjs';

// The movement overhaul, parts 2 and 3 (Brandon, November 8, 2026): labelled water and difficult squares, climbing
// and climbing down by the book, the reach outline going round walls, the questions and the door marks.

test('labelled squares: water and difficult cost one more and do not stack; no-climb costs nothing; a swimmer pays nothing in water', () => {
  const zones = normalizeZones({ version: 1, zones: [
    { id: 'pool', tag: 'pool', kind: 'water', squares: [[1, 1], [2, 1]] },
    { id: 'brush', tag: 'brush', kind: 'difficult', squares: [[2, 1], [3, 1]] },
    { id: 'bumps', tag: 'bumps', kind: 'no-climb', cost: 3, squares: [[4, 1]] },
  ] });
  const index = buildZoneIndex(zones);
  assert.equal(squareCostMultiplier(index, 1, 1), 2);
  assert.equal(squareCostMultiplier(index, 2, 1), 2, 'water and difficult together: one more, not two');
  assert.equal(squareCostMultiplier(index, 4, 1), 1, 'no-climb ground is walked as plain, whatever cost it says');
  const pool = zones.find((zone) => zone.id === 'pool');
  assert.equal(zoneCostFor(pool, movementWaiver({ metadata: { movement: 'Walk 5, swim 5' } })), 1, 'a swim speed waives labelled water even with an odd tag');
  assert.equal(pool.cost, 1 + MOVEMENT_RULES.cost.water);
});

test('a climb is over a plain step and steeper than 2 up for 1 across', () => {
  assert.equal(isClimb(1.5, 1, true), false, 'a square and a half is a plain step, even up a face');
  assert.equal(isClimb(1.8, 1, false), false, 'gentler than 2 up for 1 across is walked');
  assert.equal(isClimb(1.8, 1, true), true, 'unless it is a sharp face');
  assert.equal(isClimb(2.2, 1, false), true, 'steeper than 2:1 is a climb anywhere (a vine)');
  assert.equal(stepCost({ rise: 2, climb: true, multiplier: 2 }), 5, 'a climb into an enemy\'s square or brush: 2 climbed, 2 more, 1 for the square');
});

test('a steep stair or vine is climbed down at a climb\'s price; a drop off its side is walked over', () => {
  const heights = { '0,0': 12, '1,0': 8, '2,0': 4 }, height = (c, r) => heights[`${c},${r}`] ?? 0;
  const vine = routeSteps({ column: 0, row: 0 }, { column: 2, row: 0 }, height, null, () => false, { carried: () => true });
  assert.equal(vine.cost, 16, 'two steps of 4 down a vine: 4 climbed and 4 more each');
  const ledge = routeSteps({ column: 0, row: 0 }, { column: 2, row: 0 }, height, null, () => false, { carried: () => false });
  assert.equal(ledge.cost, 2, 'the same heights off a ledge: two squares');
  const climber = routeSteps({ column: 0, row: 0 }, { column: 2, row: 0 }, height, null, () => false, { carried: () => true, free: true });
  assert.equal(climber.cost, 8, 'a creature with a climb speed pays the squares it climbs down, nothing more');
});

test('the reach outline goes round a wall and climbs what can be climbed, at a climb\'s price', () => {
  const origin = { column: 5, row: 5, width: 1, height: 1 }, bounds = { minColumn: 0, minRow: 0, columns: 20, rows: 20 };
  // A wall along x = 6 from row 3 to row 8: nothing crosses it.
  const wall = (from, column, row) => ((from.column < 6) !== (column < 6) && row >= 3 && row < 8 && from.row >= 3 && from.row < 8 ? null : 0);
  const shape = buildReachableMovementShape({ origin, remaining: 3, wall, bounds });
  const cells = new Set(shape.cells.map(([c, r]) => `${c},${r}`));
  assert.equal(cells.has('6,5'), false, 'the square just over the wall is not in reach');
  assert.equal(cells.has('4,5'), true);
  const open = buildReachableMovementShape({ origin, remaining: 3, bounds });
  assert.ok(open.outer, 'with no walls the plain shape is unchanged');
  const climbable = buildReachableMovementShape({ origin, remaining: 5, wall: (from, column, row) => ((from.column < 6) !== (column < 6) && row >= 3 && row < 8 && from.row >= 3 && from.row < 8 ? 3 : 0), bounds });
  const reach = new Set(climbable.cells.map(([c, r]) => `${c},${r}`));
  assert.equal(reach.has('6,5'), true, 'a climbable face is climbed: 1 plus 3 for it');
  assert.equal(reach.has('7,5'), true, 'and one more beyond: 5');
  assert.equal(reach.has('8,5'), false);
});

test('door marks: closed, open, secret closed and secret open each look different; a locked door says so', () => {
  assert.deepEqual([{ interaction: 'door' }, { interaction: 'door', open: true }, { interaction: 'door', secret: true }, { interaction: 'door', secret: true, open: true }, { interaction: 'window' }].map(portalKind),
    ['door-closed', 'door-open', 'secret-closed', 'secret-open', 'window-closed']);
  assert.notEqual(portalIcon({ interaction: 'door' }), portalIcon({ interaction: 'door', open: true }));
  assert.match(portalIcon({ interaction: 'door', secret: true }), /stroke-dasharray/);
  assert.equal(portalTitle({ interaction: 'door', locked: true }), 'door — locked');
  assert.match(portalTitle({ interaction: 'door', secret: true }), /players see a wall/);
});

test('the questions: a drop asks Climb down / Fall / Cancel; flying while prone asks Fly anyway', () => {
  assert.deepEqual(moveQuestionText({ kind: 'drop', squares: 4 }), { title: 'Drop of 4 squares.', lines: [], answers: [['climb', 'Climb down'], ['fall', 'Fall'], ['cancel', 'Cancel']] });
  assert.deepEqual(moveQuestionText({ kind: 'fly', why: 'Cal is prone.' }).answers.map(([key]) => key), ['anyway', 'cancel']);
  const board = readFileSync(new URL('../board-interactions.js', import.meta.url), 'utf8');
  assert.match(board, /const choice = await askMoveQuestion\(\{ kind: 'drop', squares: drop\.squares \}, \{ anchor \}\);/);
  assert.match(board, /patch: \{ movementMode: 'hover', flightHeight: drop\.top, clinging: true \}/, 'part-way down it clings to the wall');
  assert.match(board, /if \(movementKind === 'forced' && moves\.length > 1\) \{/, 'several tokens pushed together are pushed in turn, never refused');
  const planner = readFileSync(new URL('../../../../board3d/route-planner.mjs', import.meta.url), 'utf8');
  assert.match(planner, /const DROP_WEIGHT=MOVEMENT_RULES\.detourLimit\+\.5;/, 'the way round is taken only within the rules table\'s detour limit');
  assert.match(planner, /if\(q\?\.kind==='wall'\|\|\(q\?\.kind==='door'&&q\.edge\?\.secret===true&&q\.edge\?\.open!==true\)\)return null;/, 'walls and closed secret doors are gone round; other doors and climbs are not');
});
