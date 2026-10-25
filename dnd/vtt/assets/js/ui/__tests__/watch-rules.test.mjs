import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalMovementDetail } from '../../sync-v2/confirmed-movement.js';

// Brandon, October 12, 2026: "Thorn in foot, isnt triggering the damage when things move." Build 490 made the
// damage land; the tester then found four faults in it, with three pages open (two Director pages and Cal's):
//  1. Arrow keys: three presses, three squares, 1 damage in all.
//  2. It ended a turn early: nothing during Cal's NEXT turn, though it lasts to the end of that turn.
//  3. A second use on another creature killed both watches, and an older list came back at the turn's end.
//  4. A creature moved by its own ability (a shift) was not counted.
// And the "!" on a card that does not resolve by itself: the chat said to click it, and a click threw it away.

const board = readFileSync(new URL('../board-interactions.js', import.meta.url), 'utf8');
const piece = (name) => { const found = board.match(new RegExp('  function ' + name + '\\([\\s\\S]*?\\n  \\}')); assert.ok(found, name); return found[0]; };
const rules = (combat) => new Function('combatActive', 'combatRound', 'activeCombatantId', 'completedCombatants',
  `${piece('watchKey')}\n${piece('sameWatch')}\n${piece('watchUntil')}\n${piece('watchHasRunOut')}\nreturn { watchKey, sameWatch, watchUntil, watchHasRunOut };`)(
  combat.active ?? true, combat.round ?? 1, combat.turn ?? null, new Set(combat.done ?? []));
const nextTurnEnd = { event: 'turnEnd', whose: 'self', count: 1, skipCurrent: true };

test('FAULT 2: "until the end of your next turn" runs through that turn, whatever pages are open', () => {
  // Set on Cal's own turn in round 1: it ends when his turn in round 2 ends.
  const until = rules({ round: 1, turn: 'cal' }).watchUntil(nextTurnEnd, 'cal');
  assert.deepEqual(until, { round: 2 });
  const at = (combat) => rules(combat).watchHasRunOut(until, 'cal');
  assert.equal(at({ round: 1, turn: 'cal' }), false, 'still his turn');
  assert.equal(at({ round: 1, turn: null, done: ['cal'] }), false, 'his turn over, round 1: the tester\'s drag that did 2');
  assert.equal(at({ round: 1, turn: 'ogre', done: ['cal'] }), false);
  assert.equal(at({ round: 2, turn: null, done: [] }), false, 'round 2 begun, nobody\'s turn');
  assert.equal(at({ round: 2, turn: 'cal', done: [] }), false, 'DURING his next turn: the tester\'s drag that did nothing');
  assert.equal(at({ round: 2, turn: null, done: ['cal'] }), true, 'that turn has ended: it has run out');
  assert.equal(at({ round: 3, turn: null, done: [] }), true);
  assert.equal(at({ active: false }), true, 'no watch outlives the fight');
  // The answer is read from the combat's record, so two pages cannot disagree, and nothing is counted off.
  assert.match(board, /if \(entry\?\.until\) \{\s*if \(watchHasRunOut\(entry\.until, entry\.tokenId\)\) \{[\s\S]{0,200}\}\s*continue;\s*\}/, 'a watch with a set end is not counted off at turn ends');
});

test('when a watch\'s time ends, for the other ways it can be set', () => {
  assert.deepEqual(rules({ round: 3, turn: 'cal' }).watchUntil({ event: 'turnEnd', whose: 'self', count: 1, skipCurrent: false }, 'cal'), { round: 3 }, '"until the end of your turn"');
  assert.deepEqual(rules({ round: 3, turn: 'ogre', done: [] }).watchUntil(nextTurnEnd, 'cal'), { round: 3 }, 'set off his turn, before he has gone: his turn this round');
  assert.deepEqual(rules({ round: 3, turn: 'ogre', done: ['cal'] }).watchUntil(nextTurnEnd, 'cal'), { round: 4 }, 'set off his turn, after he has gone: his turn next round');
  assert.deepEqual(rules({ round: 1, turn: 'cal' }).watchUntil({ ...nextTurnEnd, count: 2 }, 'cal'), { round: 3 });
  // Kinds of ending this rule does not cover keep the old counting; so does a watch set outside a fight.
  assert.equal(rules({ round: 1, turn: 'cal' }).watchUntil({ event: 'turnEnd', whose: 'target', count: 1 }, 'cal'), null);
  assert.equal(rules({ round: 1, turn: 'cal' }).watchUntil({ event: 'roundEnd', whose: 'any', count: 1 }, 'cal'), null);
  assert.equal(rules({ active: false }).watchUntil(nextTurnEnd, 'cal'), null);
  assert.equal(rules({ round: 9 }).watchHasRunOut(null, 'cal'), false, 'a watch with no set end is not ended by this rule');
});

test('FAULT 3: one watch for each creature it was set on', () => {
  const { watchKey, sameWatch } = rules({});
  const onGintaras = { abilityId: 'thorn', key: watchKey(['gintaras']), targetIds: ['gintaras'] };
  const onAlgis = { abilityId: 'thorn', key: watchKey(['algis']), targetIds: ['algis'] };
  assert.notEqual(onGintaras.key, onAlgis.key);
  assert.equal(sameWatch(onGintaras, 'thorn', onAlgis.key), false, 'a use on Algis does not take the place of the one on Gintaras');
  assert.equal(sameWatch(onGintaras, 'thorn', watchKey(['gintaras'])), true, 'a second use on Gintaras does');
  assert.equal(watchKey(['b', 'a', 'b']), watchKey(['a', 'b']), 'the same creatures in any order are the same watch');
  assert.equal(sameWatch({ abilityId: 'thorn', targetIds: ['gintaras'] }, 'thorn', 'gintaras'), true, 'a record written before this build is read by its creatures');
  // Kept, taken off and looked for by the ability AND its creatures, on the token and in each page's own list.
  assert.match(board, /target\.runtimeTriggers\.filter\(\(kept\) => !sameWatch\(kept, record\.abilityId, record\.key\)\)/);
  assert.match(board, /registrationKey: `watch:\$\{record\.key \?\? watchKey\(record\.targetIds\)\}`, until: record\.until \|\| null,/);
  assert.match(board, /entry\.abilityId === record\.abilityId\s*&& entry\.registrationKey === registrationKey && \['runtime', SHARED_WATCH\]\.includes\(entry\.registrationSource\)/);
});

test('a hero\'s standing triggers are not written to the token; only a watch set by a use is', () => {
  // The tester found eight of Cal's standing triggers on his token beside the one watch, and one left after the fight.
  assert.match(board, /if \(payload\.standing !== true\) \{\s*registered\.until = watchUntil\(registered\.lifetimeState, casterId\);\s*shareRuntimeWatch\(registered\);/);
  const panel = readFileSync(new URL('../character-summary-panel.js', import.meta.url), 'utf8');
  assert.match(panel, /requestAutomationRegisterTrigger\(\{[\s\S]{0,300}standing: true,\s*casterId: activeToken\.id,/);
  // The Director's page takes off what has run out at every boundary, and everything when a fight starts or ends.
  assert.match(board, /const all = eventType === 'combatEnd' \|\| eventType === 'combatStart';/);
  assert.match(board, /if \(all \|\| watchHasRunOut\(record\?\.until, placement\.id\)\) unshareRuntimeWatch\(/);
});

test('FAULT 1: every square counts, however the move is made', () => {
  const event = (operationId, extra = {}) => ({ type: 'token.moved', operationId, revision: 9, payload: { movementKind: 'walk', ...extra } });
  const moved = (from, to, operationId) => ({ id: 'gintaras', column: to[0], row: to[1], width: 1, height: 1, levelId: 'level-0',
    _movementUndo: { history: [{ operationId, from: { column: from[0], row: from[1], levelId: 'level-0' }, to: { column: to[0], row: to[1], levelId: 'level-0' } }] } });
  // An arrow press is drawn before it is confirmed: when the confirmation comes the page already shows the token
  // on its new square. Where it began is the server's receipt of that move.
  const drawnAhead = { id: 'gintaras', column: 18, row: 14, width: 1, height: 1, levelId: 'level-0' };
  const press = normalMovementDetail('scene', 'gintaras', drawnAhead, moved([18, 13], [18, 14], 'press-1'), { source: 'acknowledgement', event: event('press-1') });
  assert.deepEqual([press.from.column, press.from.row, press.to.column, press.to.row], [18, 13, 18, 14], 'one square, not "no move"');
  const second = normalMovementDetail('scene', 'gintaras', { ...drawnAhead, row: 15 }, moved([18, 14], [18, 15], 'press-2'), { source: 'acknowledgement', event: event('press-2') });
  assert.deepEqual([second.from.row, second.to.row], [14, 15], 'and the next press is its own square');
  // Without a receipt for this move (an older page), the page's picture is used as before.
  const plain = normalMovementDetail('scene', 'gintaras', { ...drawnAhead, row: 10 }, { ...moved([0, 0], [18, 14], 'another'), }, { source: 'acknowledgement', event: event('this-one') });
  assert.deepEqual([plain.from.row, plain.to.row], [10, 14]);
  // A drag round corners: the corners travel with the move, and the squares are counted along them.
  const cornered = normalMovementDetail('scene', 'gintaras', { ...drawnAhead, column: 10, row: 10 }, moved([10, 10], [12, 10], 'drag-1'),
    { source: 'acknowledgement', event: event('drag-1', { path: [{ column: 10, row: 13 }, { column: 12, row: 13 }, { nonsense: true }] }) });
  assert.deepEqual(cornered.path, [{ column: 10, row: 13 }, { column: 12, row: 13 }]);
  assert.match(board, /const stops = \[from, \.\.\.\(Array\.isArray\(detail\.path\) \? detail\.path\.map\(\(corner\) => \(\{ \.\.\.from, column: corner\.column, row: corner\.row \}\)\) : \[\]\), to\];\s*const walked = stops\.slice\(1\)\.reduce\(\(sum, stop, index\) => sum \+ automationChebyshevDistance\(stops\[index\], stop\), 0\);/,
    '3 down, 2 across, 3 up is 8 squares, not the 2 between its ends');
  const server = readFileSync(new URL('../../../../lib/SyncV2Store.php', import.meta.url), 'utf8');
  assert.match(server, /if \(\$restore === null && \$normalized\['path'\] !== \[\]\) \$event\['payload'\]\['path'\] = \$normalized\['path'\];/, 'the server sends the corners with the move');
});

test('FAULT 4: a creature moved by its own ability moved willingly; one moved by somebody else did not', () => {
  assert.match(board, /announceOwnAbilityMove\(request\);\s*flashAutomationTargetToken\(request\.targetSnapshot\.id\);/);
  const own = piece('announceOwnAbilityMove');
  assert.match(own, /if \(!moved\?\.id \|\| !mover\?\.id \|\| mover\.id !== moved\.id\) return;/, 'only when the mover is the creature itself');
  assert.match(own, /triggerFire\('move', \{ placementId: moved\.id, sourceId: moved\.id, from, to, distance: movedDistance, movedDistance, kind: 'shift',/);
});

test('the "!" says what it is: it marks the triggered action, it does not resolve a waiting trigger', () => {
  assert.match(board, /is READY\$\{triggerCauseText\(eventType, payload\)\}\. Use it from \$\{tokenName\}'s abilities to resolve it\./);
  assert.doesNotMatch(board, /click the ! to resolve/);
  assert.match(board, /if \(readyTriggerHint\(placementId\)\) return;\s*toggleTriggeredActionState\(placementId\);/, 'with a trigger waiting, the first click explains and changes nothing');
  assert.match(board, /if \(now - \(readyTriggerHintAt\.get\(placementId\) \|\| 0\) < 4000\) \{ readyTriggerHintAt\.delete\(placementId\); return false; \}/, 'a second click marks the action used, as before');
});

test('nothing the watches need is a constant that a start-up boundary could reach too early', () => {
  for (const name of ['watchKey', 'sameWatch', 'watchUntil', 'watchHasRunOut', 'readyTriggerHint', 'announceOwnAbilityMove']) {
    assert.match(board, new RegExp('\\n  function ' + name + '\\('), `${name} is a function declaration`);
  }
});
