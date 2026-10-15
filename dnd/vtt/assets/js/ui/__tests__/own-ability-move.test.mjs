import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { forcedMoveLegalCells, footprintsOverlap, cellsOnMap } from '../forced-move-cells.js';
import { normalMovementDetail } from '../../sync-v2/confirmed-movement.js';

// Brandon, October 13, 2026, on the tester's finding that a hero's own shift collided with what it met:
// "are you saying that shift is working like a push? That's incorrect. Shouldn't do that."
// An ability that moves its own user is a move, not forced movement: it never collides, it deals no collision
// damage, and a square with a creature in it is not offered as a place to land.
//
// These run the board's own functions, lifted from the file, with the page around them stood in for.

const board = readFileSync(new URL('../board-interactions.js', import.meta.url), 'utf8');
const piece = (name) => { const found = board.match(new RegExp('  (?:async )?function ' + name + '\\([\\s\\S]*?\\n  \\}')); assert.ok(found, name); return found[0]; };

const token = (id, column, row, more = {}) => ({ id, name: id, column, row, width: 1, height: 1, levelId: 'level-0', ...more });

/** The picker with a page stood in around it: who is on the map, who is looking, and what a move comes to. */
function picker({ tokens, gm = false, confirmedAfter = (id, to) => to, moveAnswers = () => undefined }) {
  const page = { tokens, statuses: [], sent: [], resolved: [], rejected: [], confirmed: Object.fromEntries(tokens.map((t) => [t.id, { ...t }])), overlays: 0 };
  const make = new Function('page', 'gm', 'confirmedAfter', 'moveAnswers', 'forcedMoveLegalCells', 'footprintsOverlap', 'cellsOnMap', `
    let pendingAutomationMove = null, automationMoveOverlay = null;
    const boardApi = { getState: () => ({}) }, tokenLayer = null, viewState = {};
    const tokenMovementRuntime = { getConfirmedSnapshot: () => ({ state: { placements: { scene: page.confirmed } } }) };
    const getActiveSceneId = () => 'scene';
    const getActiveScenePlacements = () => page.tokens;
    const getPlacementFromStore = (id) => page.tokens.find((token) => token.id === id) || null;
    const isGmUser = () => gm;
    const resolvePlacementLevelId = (placement) => placement.levelId || 'level-0';
    const clampPlacementToBounds = (column, row) => ({ column: Math.max(0, Math.min(19, column)), row: Math.max(0, Math.min(19, row)) });
    const updateStatus = (text) => page.statuses.push(text);
    const renderTokens = () => {}, flashAutomationTargetToken = () => {}, updateAutomationMovePreview = () => {}, notifyCoordinateView = () => {};
    const renderAutomationMoveOverlay = () => { page.overlays += 1; return { remove() {} }; };
    const cancelPendingAutomationMove = () => { pendingAutomationMove = null; };
    const clearAutomationMoveOverlay = () => { automationMoveOverlay = null; pendingAutomationMove = null; };
    const findRenderedPlacementAtPoint = (event) => event.on || null;
    const getAutomationGridCellFromEvent = (event) => event.cell || null;
    const automationFootprintsOverlap = (a, b) => footprintsOverlap(a, b);
    const buildAutomationMoveLegalCells = (source, target, distance, baseVerb) => forcedMoveLegalCells(source, target, distance, baseVerb);
    // What the page's walk-and-shift path does with a move: here it is only recorded, and answered.
    const commitCanonicalTokenMoves = async (move) => {
      page.sent.push(move);
      const answer = moveAnswers(move);
      if (answer !== false) { const to = confirmedAfter(move.moves[0].placementId, move.moves[0]); Object.assign(page.confirmed[move.moves[0].placementId], { column: to.column, row: to.row }); }
      return answer;
    };
    ${piece('tokenLabel')}
    ${piece('getAutomationPlacementSnapshot')}
    ${piece('getAutomationMoveVerb')}
    ${piece('getAutomationMoveVerbLabel')}
    ${piece('getAutomationMoveBaseVerb')}
    ${piece('automationChebyshevDistance')}
    ${piece('creatureInTheWay')}
    ${piece('commitOwnAbilityMove')}
    ${piece('startAutomationMoveSelection')}
    return {
      start: (request) => { startAutomationMoveSelection(request); return pendingAutomationMove; },
      pending: () => pendingAutomationMove,
      click: (event) => commitOwnAbilityMove(pendingAutomationMove, { target: null, ...event }, null),
    };`);
  return { page, ...make(page, gm, confirmedAfter, moveAnswers, forcedMoveLegalCells, footprintsOverlap, cellsOnMap) };
}

/** What the sheet's "shift" step sends the board (ability-automation/runner.js, applyShiftEffect). */
const shiftRequest = (page, mover, distance = 3) => ({
  payload: {}, verb: 'slide', verbLabel: 'Shift', sourcePlacement: mover, targetPlacement: mover, requestedDistance: distance, effectiveDistance: distance,
  resolve: (result) => page.resolved.push(result), reject: (error) => page.rejected.push(error),
});

test('a creature\'s own shift is known for a move, and somebody else\'s slide of it is not', () => {
  const cal = token('cal', 5, 5), ogre = token('ogre', 7, 5);
  const own = picker({ tokens: [cal, ogre] });
  assert.equal(own.start(shiftRequest(own.page, cal)).ownMove, true);
  const forced = picker({ tokens: [cal, ogre] });
  assert.equal(forced.start({ ...shiftRequest(forced.page, cal), sourcePlacement: ogre, verbLabel: 'Slide' }).ownMove, false, 'the ogre sliding Cal is forced movement, as before');
  const teleport = picker({ tokens: [cal, ogre] });
  assert.equal(teleport.start({ ...shiftRequest(teleport.page, cal), movementKind: 'teleport' }).ownMove, false, 'its own teleport keeps its own way');
  // The sheet's shift step is the creature moving itself.
  const runner = readFileSync(new URL('../../../../../character_sheet/ability-automation/runner.js', import.meta.url), 'utf8');
  assert.match(runner, /verbLabel: "Shift",[\s\S]{0,200}targetId: target\.id,\s*target,\s*sourcePlacement: target,/);
});

test('a square with a creature in it is not offered as a landing square', () => {
  const cal = token('cal', 5, 5), ogre = token('ogre', 7, 5), big = token('big', 4, 2, { width: 2, height: 2 }), upstairs = token('upstairs', 6, 6, { levelId: 'level-1' });
  const { start, page } = picker({ tokens: [cal, ogre, big, upstairs] });
  const offered = start(shiftRequest(page, cal)).legalCells.map((cell) => `${cell.column},${cell.row}`);
  assert.ok(offered.length > 20, 'squares are offered');
  assert.ok(!offered.includes('7,5'), 'not the ogre\'s square');
  for (const taken of ['4,2', '5,2', '4,3', '5,3']) assert.ok(!offered.includes(taken), `not a square of the large creature: ${taken}`);
  assert.ok(offered.includes('6,6'), 'a creature on another floor is not in the way');
  assert.ok(offered.includes('6,5') && offered.includes('8,5'), 'the squares beside and beyond the ogre are offered: passing is the ability\'s own matter');
  // The same squares a forced slide of Cal would be offered, less the occupied ones.
  const all = cellsOnMap(forcedMoveLegalCells(cal, cal, 3, 'slide'), (column, row) => ({ column: Math.max(0, Math.min(19, column)), row: Math.max(0, Math.min(19, row)) }), cal);
  assert.equal(offered.length, all.length - 5);
});

test('a hidden creature is not given away to a player by a missing square; the Director sees it as taken', () => {
  const cal = token('cal', 5, 5), lurker = token('lurker', 6, 5, { hidden: true });
  const player = picker({ tokens: [cal, lurker] });
  assert.ok(player.start(shiftRequest(player.page, cal)).legalCells.some((cell) => cell.column === 6 && cell.row === 5));
  const director = picker({ tokens: [cal, lurker], gm: true });
  assert.ok(!director.start(shiftRequest(director.page, cal)).legalCells.some((cell) => cell.column === 6 && cell.row === 5));
});

test('THE FAULT: picking a creature, or its square, moves nobody and hurts nobody; the picker stays open', async () => {
  const cal = token('cal', 5, 5), ogre = token('ogre', 7, 5);
  const { start, click, pending, page } = picker({ tokens: [cal, ogre] });
  start(shiftRequest(page, cal));
  // The ogre itself, as the map hands it over: what is drawn carries the id and the square, not the name. (Seen in
  // the page, October 13: the line read "Token is in that square".)
  await click({ on: { id: 'ogre', column: 7, row: 5, width: 1, height: 1 }, cell: { column: 7, row: 5 } });
  assert.match(page.statuses.at(-1), /^ogre is in that square\./);
  await click({ cell: { column: 7, row: 5 } });                                // its square, through the loupe
  assert.deepEqual(page.sent, [], 'nothing is sent: no slam');
  assert.deepEqual(page.resolved, []);
  assert.ok(pending() && pending().committing !== true, 'another square can still be picked');
  assert.match(page.statuses.at(-1), /^ogre is in that square\. Choose an empty square, or click Skip\.$/);
});

test('picking an empty square sends a SHIFT, the way a dragged shift goes: no forced movement, no collision', async () => {
  const cal = token('cal', 5, 5), ogre = token('ogre', 6, 5);
  const { start, click, pending, page } = picker({ tokens: [cal, ogre] });
  start(shiftRequest(page, cal));
  await click({ cell: { column: 8, row: 5 } });                                // straight past the ogre
  assert.equal(page.sent.length, 1);
  assert.deepEqual(page.sent[0], { sceneId: 'scene', moves: [{ placementId: 'cal', column: 8, row: 5 }], source: 'ability', movementKind: 'shift', drawnRuler: [] });
  assert.deepEqual(page.resolved, [{ skipped: false, name: 'cal', movedDistance: 3, collision: null }], 'the sheet is told how far, and that nothing was struck');
  assert.equal(pending(), null, 'the picker closes');
  // And in the code: the own move leaves before anything of forced movement is reached.
  const down = piece('handleAutomationMovePointerDown');
  assert.ok(down.indexOf('if (request.ownMove) return commitOwnAbilityMove(request, event, target);') > 0);
  assert.ok(down.indexOf('if (request.ownMove) return commitOwnAbilityMove(request, event, target);') < down.indexOf('getAutomationCollisionStopCell('), 'before a picked creature becomes something to slam into');
  const own = piece('commitOwnAbilityMove');
  for (const forcedOnly of ['resolveForcedDrag', 'forcedDestination', 'settleCollisionEffects', 'applyAutomationCollisionDamage', 'askForcedBreakThrough']) assert.ok(!own.includes(forcedOnly), `${forcedOnly} has no part in a creature's own move`);
});

test('a move that is refused (a wall, a climb declined) leaves the picker open for another square', async () => {
  const cal = token('cal', 5, 5);
  for (const answer of [false, undefined]) {
    // false: refused. undefined with the token where it was: a climb was declined.
    const { start, click, pending, page } = picker({ tokens: [cal], moveAnswers: () => answer, confirmedAfter: () => ({ column: 5, row: 5 }) });
    start(shiftRequest(page, cal));
    await click({ cell: { column: 7, row: 5 } });
    assert.deepEqual(page.resolved, []);
    assert.ok(pending() && pending().committing === false, 'still picking');
    await click({ cell: { column: 5, row: 6 } });
    assert.equal(page.sent.length, 2, 'and the next pick is sent');
  }
});

test('where the server puts the creature is what counts as moved', async () => {
  const cal = token('cal', 5, 5);
  const { start, click, page } = picker({ tokens: [cal], confirmedAfter: () => ({ column: 6, row: 5 }) });
  start(shiftRequest(page, cal));
  await click({ cell: { column: 8, row: 5 } });
  assert.equal(page.resolved[0].movedDistance, 1);
});

test('its own square, or Skip, is no move', async () => {
  const cal = token('cal', 5, 5);
  const { start, click, pending, page } = picker({ tokens: [cal] });
  start(shiftRequest(page, cal));
  await click({ cell: { column: 5, row: 5 } });
  assert.deepEqual(page.sent, []);
  assert.ok(pending());
  assert.match(board, /updateStatus\(request\.ownMove \? 'Move skipped\.' : 'Forced movement skipped\.'\);/);
});

test('a watch on "when it moves" still counts the creature\'s own shift, once', () => {
  // The confirmed shift tells the watches, as a dragged shift does...
  const moved = normalMovementDetail('scene', 'cal', token('cal', 5, 5), token('cal', 8, 5), { source: 'acknowledgement', event: { type: 'token.moved', payload: { movementKind: 'shift' } } });
  assert.equal(moved.kind, 'shift');
  assert.match(board, /if \(!\['normal','shift','teleport'\]\.includes\(detail\.kind\)\) return;/);
  // ...so the own move does not announce itself a second time.
  assert.ok(!piece('commitOwnAbilityMove').includes('announceOwnAbilityMove'));
  assert.ok(!piece('commitOwnAbilityMove').includes('triggerFire'));
});
