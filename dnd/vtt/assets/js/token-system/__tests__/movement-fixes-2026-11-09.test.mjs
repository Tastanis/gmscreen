import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTokenMovementController, formatMovementSummary } from '../token-movement-controller.js';
import { movementAdjacencyChanges } from '../../ui/movement-adjacency.js';
import { normalMovementDetail } from '../../sync-v2/confirmed-movement.js';
import { resolveForcedDrag } from '../../ui/forced-drag.js';
import { moveQuestionText } from '../../ui/move-question.js';

// The movement fix list of November 9, 2026 (docs/vtt-movement-fix-list-2026-11-09.md), Brandon's rulings:
// A forced moves are not the creature's own; B Ctrl+Z gives movement back and never falls through; C conditions change
// the ring and the count; E moves through creatures; G a wall before a creature right behind it; H a slide announced
// once; I/J reminders follow the route and spare a captive; K ending a grab is asked; L teleport falls round as falls.
globalThis.Element ??= class Element {};

function harness({ rule = null, kind = null } = {}) {
  let keydown = null;
  const restored = [];
  const controller = createTokenMovementController({
    mapTransform: null,
    getCombatContext: () => ({ active: true, sceneId: 'scene', round: 1, activeCombatantId: 'hero' }),
    getPlacementById: (id) => ({ id, column: 2, row: 2, width: 1, height: 1, speed: 6 }),
    measureRoute: () => 3,
    restoreMove: (move) => { restored.push(move); return true; },
    getUndoMove: () => ({ tokenId: 'hero', from: { column: 2, row: 2 }, to: { column: 3, row: 2 } }),
    getSpeedRule: () => rule,
    getDragMovementKind: () => kind,
    documentRef: { addEventListener: (type, handler) => { if (type === 'keydown') keydown = handler; } },
    windowRef: null,
  });
  controller.syncCombatTurn();
  const move = (from, to, movementKind = 'walk') => {
    controller.handleDragStart({ primaryToken: { id: 'hero', ...from }, originalPositions: new Map([['hero', from]]) });
    controller.handleDragEnd({ commit: true, moved: true });
    controller.handleDragCommitted({ sceneId: 'scene', movedIds: ['hero'], originalPositions: new Map([['hero', from]]), preview: new Map([['hero', to]]), movementKind, source: 'drag' });
  };
  const key = (extra = {}) => keydown({ key: 'z', ctrlKey: true, preventDefault() {}, stopPropagation() {}, target: null, ...extra });
  return { controller, move, key, restored };
}

test('A: a push, pull, slide or teleport is not counted against the creature moved', () => {
  const { controller, move } = harness();
  move({ column: 2, row: 2 }, { column: 5, row: 2 }, 'forced');
  assert.equal(controller.getMovementLeft('hero').spent, 0);
  move({ column: 5, row: 2 }, { column: 6, row: 2 }, 'walk');
  assert.equal(controller.getMovementLeft('hero').spent, 3, 'a walk still is');
  move({ column: 6, row: 2 }, { column: 9, row: 2 }, 'teleport');
  assert.equal(controller.getMovementLeft('hero').spent, 3, 'nor a teleport (Brandon, November 9, 2026)');
});

test('B: the turn undo gives back the move it undid; a held key or Alt never undoes moves', async () => {
  const { controller, move, key, restored } = harness();
  move({ column: 2, row: 2 }, { column: 3, row: 2 });
  move({ column: 3, row: 2 }, { column: 4, row: 2 });
  assert.equal(controller.refundMove({ tokenId: 'hero', from: { column: 2, row: 2 }, to: { column: 3, row: 2 } }), false, 'only the last move');
  assert.equal(controller.refundMove({ tokenId: 'hero', from: { column: 3, row: 2 }, to: { column: 4, row: 2 } }), true);
  assert.equal(controller.getMovementLeft('hero').spent, 3);
  await key({ repeat: true });
  await key({ altKey: true });
  assert.equal(restored.length, 0, 'held Ctrl+Z and Ctrl+Alt+Z fell through to the move undo before');
  assert.equal(controller.getMovementLeft('hero').spent, 3);
  const board = readFileSync(new URL('../../ui/board-interactions.js', import.meta.url), 'utf8');
  assert.match(board, /tokenMovementController\?\.refundMove\?\.\(\{ tokenId: step\.entityId,/, 'performTurnUndo refunds a placement step that moved a token');
  assert.match(board, /isCustomConditionDialogOpen\(\) \|\|\n\s*document\.getElementById\('wall-panel'\)\?\.hidden === false,/, 'the walls panel suppresses the move undo too');
});

test('C: conditions change the speed shown and the ring, and say why; nothing is refused', () => {
  assert.equal(harness({ rule: { limit: 2, why: 'Slowed: speed 2' } }).controller.getMovementLeft('hero').speed, 2);
  assert.equal(harness({ rule: { limit: 0, why: 'Grabbed: speed 0' } }).controller.getMovementLeft('hero').speed, 0);
  assert.equal(harness({ rule: { halve: true, why: 'Grabbing Ogre: speed halved' } }).controller.getMovementLeft('hero').speed, 3);
  assert.equal(harness({ rule: { limit: 2 } }).controller.getMovementLeft('hero').why, undefined);
  assert.equal(formatMovementSummary({ spent: 1, dragCost: 2, speed: 2, why: 'Slowed: speed 2' }), 'Moved 3 / 2 - 1 over (Slowed: speed 2)');
  const board = readFileSync(new URL('../../ui/board-interactions.js', import.meta.url), 'utf8');
  assert.match(board, /if \(names\.has\('slowed'\)\) \{ rule\.limit = Math\.min\(rule\.limit \?\? Infinity, 2\);/);
  assert.match(board, /size\(placement\) <= size\(p\)/, 'halved only when grabbing a creature its size or larger');
  const zones = readFileSync(new URL('../../ui/terrain-zones-overlay.js', import.meta.url), 'utf8');
  assert.match(zones, /window\.vttIsProne\?\.\(actor\)\) crawl = 1;/, 'prone crawls at one more a square');
  assert.match(zones, /return Math\.max\(cost, enemy\) \+ crawl;/, 'on top of difficult terrain or an enemy\'s square, by the book (November 10, 2026)');
  const board3 = readFileSync(new URL('../../ui/board-interactions.js', import.meta.url), 'utf8');
  assert.match(board3, /if \(movedId && dealt\.targetId === movedId\) \{ const cut = await forcedMovementDamageReduction\(dealt\.targetId\);/, 'R3: undo gives back only what the pushed creature took after its cut');
  assert.match(board3, /&& !\(request\.wallCells \|\| \[\]\)\.some\(/, 'R6: a square past a wall on the push line is a push into it, not a warning');
  assert.match(board3, /if \(Number\.isFinite\(lastMoveOutcome\?\.beyondLeft\)\) budget = lastMoveOutcome\.beyondLeft;/, 'R4: a slide\'s later legs are cut to what the break left');
});

test('C: a forced drag does not show as movement spent', () => {
  const { controller } = harness({ kind: 'forced' });
  controller.handleDragStart({ primaryToken: { id: 'hero', column: 2, row: 2 }, originalPositions: new Map([['hero', { column: 2, row: 2 }]]) });
  // getPreviewCost is private; the summary it renders is the check.
  let text = '';
  const c = createTokenMovementController({ mapTransform: null, getCombatContext: () => ({ active: true, activeCombatantId: 'hero', round: 1 }), getPlacementById: (id) => ({ id, column: 2, row: 2, speed: 6 }), measureRoute: () => 4, getDragMovementKind: () => 'forced', setRulerSupplement: (t) => { text = t; }, documentRef: null, windowRef: null });
  c.syncCombatTurn();
  c.handleDragStart({ primaryToken: { id: 'hero', column: 2, row: 2 }, originalPositions: new Map([['hero', { column: 2, row: 2 }]]) });
  c.handleDragMove({ preview: new Map([['hero', { column: 6, row: 2 }]]) });
  assert.match(text, /^Moved 0 \/ 6/);
  assert.ok(controller);
});

test('E: moves through creatures switches the enemy surcharge off; a closed secret door stops the outline and the route', () => {
  const board = readFileSync(new URL('../../ui/board-interactions.js', import.meta.url), 'utf8');
  assert.match(board, /if \(rules\?\.moveThroughCreatures\) \{ enemySquaresCache = \{ state, id, squares \}; return squares; \}/);
  const zones = readFileSync(new URL('../../ui/terrain-zones-overlay.js', import.meta.url), 'utf8');
  assert.match(zones, /q\?\.kind === 'door' && q\.edge\?\.secret === true && q\.edge\?\.open !== true\)\) return null;/);
  const planner = readFileSync(new URL('../../../../board3d/route-planner.mjs', import.meta.url), 'utf8');
  assert.match(planner, /q\?\.kind==='door'&&q\.edge\?\.secret===true&&q\.edge\?\.open!==true/);
});

test('G: a creature right behind a wall is not hit through it (browser side; ForcedMovement::resolve is the same)', () => {
  const wall = (from, at) => from.column + 1 <= 7 && at.column + 1 > 7 + 1e-9;   // a wall on x = 7
  const mover = { id: 'm', column: 5, row: 5, width: 1, height: 1 };
  const behind = resolveForcedDrag(mover, { column: 9, row: 5 }, [{ id: 'c', column: 7, row: 5, width: 1, height: 1 }], { wallBlocked: wall });
  assert.deepEqual([behind.destination.column, behind.wall, behind.collidedIds, behind.damage], [6, true, [], 5], 'the wall, not the creature behind it');
  const before = resolveForcedDrag(mover, { column: 9, row: 5 }, [{ id: 'c', column: 6, row: 5, width: 1, height: 1 }], { wallBlocked: wall });
  assert.deepEqual([before.wall, before.collidedIds], [false, ['c']], 'a creature in front of the wall is still hit');
  const beyond = resolveForcedDrag(mover, { column: 9, row: 5 }, [{ id: 'c', column: 8, row: 5, width: 1, height: 1 }], { wallBlocked: wall });
  assert.deepEqual([beyond.wall, beyond.collidedIds, beyond.damage], [true, [], 5]);
});

test('H: a hand slide with corners is announced once, as a slide, with its total', () => {
  const board = readFileSync(new URL('../../ui/board-interactions.js', import.meta.url), 'utf8');
  assert.match(board, /slideBeyond: leg\.beyond, announce: false \}\);/, 'no leg announces itself');
  assert.match(board, /if \(slid > 0 && sceneId === getActiveSceneId\(\)\) announceHandForcedMove\(id, slid, 'slide'\);/);
  assert.match(board, /if \(moved > 0\) announceHandForcedMove\(id, moved, 'push'\);/, 'a straight Ctrl-drag stays a push');
});

test('I: reminders walk the route the creature took', () => {
  const enemy = { column: 5, row: 0, width: 1, height: 1 };
  // A route drawn wide round the enemy: the straight line between its ends passes it, the route does not.
  const from = { column: 3, row: 5 }, to = { column: 7, row: 5 };
  assert.equal(movementAdjacencyChanges(from, to, { column: 5, row: 4, width: 1, height: 1 }, null, [{ column: 3, row: 9 }, { column: 7, row: 9 }]).leaves, false, 'wide round: not flagged');
  // Met only at a corner of the route.
  assert.equal(movementAdjacencyChanges({ column: 3, row: 3 }, { column: 7, row: 3 }, enemy, null, [{ column: 5, row: 1 }]).leaves, true, 'met at a corner, then left');
  assert.equal(movementAdjacencyChanges({ column: 3, row: 3 }, { column: 7, row: 3 }, enemy, null).leaves, false, 'without the corner, never met');
  // Left and come back to the same square: still a move.
  const event = { type: 'token.moved', operationId: 'op', payload: { movementKind: 'walk', path: [{ column: 9, row: 9 }] } };
  const detail = normalMovementDetail('scene', 'hero', { column: 4, row: 4 }, { column: 4, row: 4 }, { source: 'acknowledgement', event });
  assert.ok(detail && detail.path.length === 1, 'out and back is a move with its route');
  const store = readFileSync(new URL('../../../../lib/SyncV2Store.php', import.meta.url), 'utf8');
  assert.match(store, /if \(count\(\$kinds\) === 1 && in_array\(\$kinds\[0\], \['walk', 'shift'\], true\)\) \$event\['payload'\]\['movementKind'\] = \$kinds\[0\];/, 'a group walk says it is a walk (only walks and shifts: a restore is not a walk)');
});

test('J and K: a captive is no watcher of its own grabber; ending a grab is asked, with the likely answer first', () => {
  const board = readFileSync(new URL('../../ui/board-interactions.js', import.meta.url), 'utf8');
  assert.match(board, /if \(grabsOnScene\(\)\.some\(\(grab\) => grab\.grabberId === movingId && grab\.grabbedId === watcher\.id\)\) continue;/);
  assert.match(board, /if \(grabbedMoved && !grabberMoved\) \{ await askEndGrab\(grab, 'it was moved away'\); continue; \}/);
  assert.deepEqual(moveQuestionText({ kind: 'grab', squares: 2, why: 'x' }).answers.map(([k]) => k), ['end', 'keep'], 'apart: ending suggested');
  assert.deepEqual(moveQuestionText({ kind: 'grab', squares: 0, why: 'x' }).answers.map(([k]) => k), ['keep', 'end'], 'still side by side: keeping suggested');
});

test('D: a flier\'s height counts once a move is finished, and a reversal only after a sideways move', () => {
  const { controller, move } = harness();
  controller.recordHeightChange('hero', 0, 3);
  assert.equal(controller.getMovementLeft('hero').spent, 3, 'up 3, let go: 3');
  controller.recordHeightChange('hero', 3, 0);
  assert.equal(controller.getMovementLeft('hero').spent, 3, 'straight back down with no sideways move: still 3');
  move({ column: 2, row: 2 }, { column: 3, row: 2 });
  assert.equal(controller.getMovementLeft('hero').spent, 3, 'a sideways move of 3 (the route price here): the larger is still 3');
  controller.recordHeightChange('hero', 0, 3);
  assert.equal(controller.getMovementLeft('hero').spent, 6, 'after the sideways move, up again counts: 3 + 3');
  controller.recordHeightChange('other', 0, 5);
  assert.equal(controller.getMovementLeft('hero').spent, 6, 'only the creature whose turn it is');
  const board = readFileSync(new URL('../../ui/board-interactions.js', import.meta.url), 'utf8');
  assert.match(board, /tokenMovementController\?\.recordHeightChange\?\.\(id, before, z\);/, 'the 3D height drag, on letting go');
  assert.match(board, /tokenMovementController\?\.recordHeightChange\?\.\(token\.id,current,requested\);/, 'the height box');
});
