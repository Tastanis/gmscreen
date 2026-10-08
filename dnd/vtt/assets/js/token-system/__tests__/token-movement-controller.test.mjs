import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTokenMovementController } from '../token-movement-controller.js';

function harness({ measureRoute, getSpeedBonus } = {}) {
  const shown = [];
  const calls = [];
  const controller = createTokenMovementController({
    mapTransform: null,
    getCombatContext: () => ({ active: true, sceneId: 'scene', round: 1, activeCombatantId: 'hero' }),
    getPlacementById: (id) => ({ id, column: 2, row: 2, width: 1, height: 1, speed: 6 }),
    setRulerSupplement: (text) => shown.push(text),
    ...(getSpeedBonus ? { getSpeedBonus } : {}),
    ...(measureRoute ? { measureRoute: (move) => { calls.push(move); return measureRoute(move); } } : {}),
  });
  controller.syncCombatTurn();
  return { controller, shown, calls };
}
const start = (controller) => controller.handleDragStart({ primaryToken: { id: 'hero', column: 2, row: 2 }, originalPositions: new Map([['hero', { column: 2, row: 2 }]]) });
const speedOf = (text) => Number(text.match(/\/ (\d+)/)[1]);

test('with no route measurement the counter still charges straight-line distance', () => {
  const { controller, shown } = harness();
  start(controller);
  controller.handleDragMove({ preview: new Map([['hero', { column: 6, row: 3 }]]) });
  assert.match(shown.at(-1), /^Moved 4 \/ /);
});

test('the counter charges the measured route cost while dragging and when the move is committed', () => {
  // A 4-square walk that crosses one x2 square and one x4 square costs 8.
  const { controller, shown, calls } = harness({ measureRoute: () => 8 });
  start(controller);
  controller.handleDragMove({ preview: new Map([['hero', { column: 6, row: 2 }]]) });
  assert.match(shown.at(-1), /^Moved 8 \/ /);
  assert.deepEqual({ from: [calls.at(-1).from.column, calls.at(-1).from.row], to: [calls.at(-1).to.column, calls.at(-1).to.row], tokenId: calls.at(-1).tokenId }, { from: [2, 2], to: [6, 2], tokenId: 'hero' });
  const speed = speedOf(shown.at(-1));
  controller.handleDragEnd({ commit: true, moved: true });
  controller.handleDragCommitted({ sceneId: 'scene', movedIds: ['hero'], originalPositions: new Map([['hero', { column: 2, row: 2 }]]), preview: new Map([['hero', { column: 6, row: 2 }]]), movementKind: 'walk' });
  assert.equal(calls.at(-1).movementKind, 'walk', 'the committed move reports how it was made');
  // The next drag starts from 8 already spent, so the summary carries the true cost forward.
  controller.handleDragStart({ primaryToken: { id: 'hero', column: 6, row: 2 }, originalPositions: new Map([['hero', { column: 6, row: 2 }]]) });
  assert.match(shown.at(-1), new RegExp(`^Moved 8 / ${speed}`));
});

test('arrow-key moves are charged too, at the measured cost', () => {
  const { controller, shown, calls } = harness({ measureRoute: ({ to }) => (to.column === 3 ? 2 : 1) });
  // One key press into a x2 square: no drag session exists for keyboard moves.
  controller.handleDragCommitted({ sceneId: 'scene', movedIds: ['hero'], originalPositions: new Map([['hero', { column: 2, row: 2 }]]), preview: new Map([['hero', { column: 3, row: 2 }]]), source: 'keyboard' });
  assert.equal(calls.at(-1).movementKind, 'walk');
  controller.handleDragStart({ primaryToken: { id: 'hero', column: 3, row: 2 }, originalPositions: new Map([['hero', { column: 3, row: 2 }]]) });
  assert.match(shown.at(-1), /^Moved 2 \/ /, 'the key press into difficult terrain used 2 of the turn');
  // A commit that is neither a tracked drag nor a keyboard move is still ignored.
  const other = harness({ measureRoute: () => 5 });
  other.controller.handleDragCommitted({ sceneId: 'scene', movedIds: ['hero'], originalPositions: new Map([['hero', { column: 2, row: 2 }]]), preview: new Map([['hero', { column: 7, row: 2 }]]) });
  other.controller.handleDragStart({ primaryToken: { id: 'hero', column: 7, row: 2 }, originalPositions: new Map([['hero', { column: 7, row: 2 }]]) });
  assert.match(other.shown.at(-1), /^Moved 0 \/ /);
});

test('a measurement that fails or returns nothing falls back to straight-line distance', () => {
  for (const measureRoute of [() => null, () => Number.NaN, () => { throw new Error('no terrain'); }, () => -3]) {
    const { controller, shown } = harness({ measureRoute });
    start(controller);
    controller.handleDragMove({ preview: new Map([['hero', { column: 5, row: 5 }]]) });
    assert.match(shown.at(-1), /^Moved 3 \/ /);
  }
});

test('movement left this turn, and a climb added after the move, share one undoable entry', () => {
  const { controller } = harness({ measureRoute: () => 3 });
  assert.deepEqual(controller.getMovementLeft('hero'), { speed: 6, spent: 0, left: 6 });
  assert.equal(controller.getMovementLeft('someone-else'), null, 'only the creature whose turn it is');
  assert.equal(controller.addMovementCost('hero', 2), false, 'nothing to add to before any move');
  start(controller);
  controller.handleDragEnd({ commit: true, moved: true });
  controller.handleDragCommitted({ sceneId: 'scene', movedIds: ['hero'], originalPositions: new Map([['hero', { column: 2, row: 2 }]]), preview: new Map([['hero', { column: 5, row: 2 }]]), movementKind: 'walk', source: 'drag' });
  assert.deepEqual(controller.getMovementLeft('hero'), { speed: 6, spent: 3, left: 3 });
  // Walked off a 3-high edge and chose Climbing: 2 more movement.
  assert.equal(controller.addMovementCost('hero', 2), true);
  assert.deepEqual(controller.getMovementLeft('hero'), { speed: 6, spent: 5, left: 1 });
  assert.equal(controller.addMovementCost('hero', 0), false);
  assert.equal(controller.addMovementCost('hero', -4), false);
  assert.equal(controller.getMovementLeft('hero').spent, 5);
  // Spending past the speed is shown, never refused, and "left" does not go below zero.
  controller.addMovementCost('hero', 4);
  assert.deepEqual(controller.getMovementLeft('hero'), { speed: 6, spent: 9, left: 0 });
});

test('a speed bonus that comes and goes (a captain leading a minion) is asked for every time, never remembered', async () => {
  let bonus = 2;
  const asked = [];
  const { controller, shown } = harness({ getSpeedBonus: (tokenId) => { asked.push(tokenId); return bonus; } });
  assert.deepEqual(controller.getMovementLeft('hero'), { speed: 8, spent: 0, left: 8 });
  start(controller);
  assert.equal(speedOf(shown.at(-1)), 8, 'the counter shows speed 6 + 2 while dragging');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(speedOf(shown.at(-1)), 8, 'and still does once the speed has been looked up');
  controller.handleDragEnd({ commit: false, moved: false });
  // The captain drops: the bonus is gone at once, on the summary and on the next drag.
  bonus = 0;
  assert.deepEqual(controller.getMovementLeft('hero'), { speed: 6, spent: 0, left: 6 });
  start(controller);
  assert.equal(speedOf(shown.at(-1)), 6);
  assert.ok(asked.every((tokenId) => tokenId === 'hero'));
  // A bonus that is not a number, or a lookup that throws, counts as none; speed never goes below 0.
  for (const [value, speed] of [[NaN, 6], ['x', 6], [-9, 0], [1.9, 7]]) {
    assert.equal(harness({ getSpeedBonus: () => value }).controller.getMovementLeft('hero').speed, speed);
  }
  assert.equal(harness({ getSpeedBonus: () => { throw new Error('no'); } }).controller.getMovementLeft('hero').speed, 6);
});
