import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Brandon, October 12, 2026: "I need a way to undo a breakthrough or to reset the broken walls on a map."
//
// Build 483 taught the server to mend the walls a push broke when that push is undone. The tester then found the
// Director's page never asked: Undo Move answered "Select a token or group with an unchanged movement of yours to
// undo." The page (and the server) held a move undoable only while NOTHING had changed on the token since, and a
// push through a wall hurts the pushed creature at once, as a change of its own. The token's revision went from
// 58 to 59 and its receipt stayed at 58, so no push that broke through could ever be taken back.
//
// The rule is now: undoable while the token still stands where that move left it. The server's half, through the
// real store, is api/v2/tests/hurl-through-walls.test.php and floor-movement.test.php.

const board = readFileSync(new URL('../board-interactions.js', import.meta.url), 'utf8');
const source = board.match(/const movementReceiptStands = (\(token\) => \{[\s\S]*?\n {6}\});/);
assert.ok(source, 'the page has the rule');
const stands = (0, eval)(`(${source[1]})`);

const receipt = (to, revision = 58) => ({ actorId: 'GM', revision, history: [{ from: { column: 34, row: 31, levelId: 'level-0' }, to, broke: ['medpilis-cart-1-0'] }] });

test('the tester\'s case: pushed through the cart, then hurt for it, and still undoable', () => {
  const token = { column: 35, row: 31, levelId: 'level-0', hp: { current: 45, max: 50 }, _entityRevision: 59, _movementUndo: receipt({ column: 35, row: 31, levelId: 'level-0' }) };
  assert.notEqual(token._movementUndo.revision, token._entityRevision, 'the damage came after the move');
  assert.equal(stands(token), true);
  assert.equal(stands({ ...token, conditions: ['Prone'], _entityRevision: 61 }), true, 'nor does a condition end it');
});

test('a token that no longer stands where the move left it cannot have it undone', () => {
  const to = { column: 35, row: 31, levelId: 'upper' };
  const token = { column: 35, row: 31, levelId: 'upper', _entityRevision: 58, _movementUndo: receipt(to) };
  assert.equal(stands(token), true);
  assert.equal(stands({ ...token, column: 36 }), false);
  assert.equal(stands({ ...token, row: 30 }), false);
  assert.equal(stands({ ...token, levelId: 'level-0' }), false, 'a floor change by hand');
  assert.equal(stands({ ...token, _movementUndo: { actorId: 'GM', revision: 58, history: [] } }), false);
  assert.equal(stands({ ...token, _movementUndo: null }), false);
  // The ground floor is the floor of a token that names none.
  assert.equal(stands({ column: 2, row: 3, _movementUndo: receipt({ column: 2, row: 3, levelId: 'level-0' }) }), true);
  assert.equal(stands({ column: 2.5, row: 3, _movementUndo: receipt({ column: '2.5', row: 3 }) }), true);
});

test('Undo Move uses that rule, still only for the user who made the move, and sends what the server asks for', () => {
  assert.match(board, /if \(!last \|\| !movementReceiptStands\(current\)\s*\|\| String\(receipt\.actorId\)\.toLowerCase\(\) !== String\(getCurrentUserId\(\)\)\.toLowerCase\(\)\) return null;/);
  assert.doesNotMatch(board, /receipt\.revision !== current\._entityRevision/, 'the old rule is gone');
  // The receipt is named by its own number; the token by the revision it has now.
  assert.match(board, /column: last\.from\.column, row: last\.from\.row, undoRevision: receipt\.revision \}\]\);/);
  assert.match(board, /await tokenMovementRuntime\.undoMovementGroup\(sceneId, placementId, current\._entityRevision\);/);
  const server = readFileSync(new URL('../../../../lib/MovementUndo.php', import.meta.url), 'utf8');
  assert.match(server, /\|\| !self::standsWhereLeft\(\$current\)\) \{/);
  assert.doesNotMatch(server, /\(\$receipt\['revision'\] \?\? -1\) !== \(\$current\['_entityRevision'\] \?\? 0\)/);
});

test('undoing a push gives back the damage the push itself dealt', () => {
  // The list it goes by is tested in services/__tests__/collision-effects.test.mjs: applied collisions of that
  // move, never a fall.
  assert.match(board, /const givenBack = last\.groupMove \? 0 : await giveBackCollisionDamage\(last\.operationId\);/);
  const giveBack = board.slice(board.indexOf('async function giveBackCollisionDamage('), board.indexOf('function getAutomationCollisionStopCell('));
  assert.match(giveBack, /for \(const dealt of await collisionDamageDealt\(operationId\)\) \{/);
  assert.match(giveBack, /const amount = Math\.max\(0, dealt\.amount \+ adjustment\.vulnerability - adjustment\.immunity\);/, 'as much as was dealt: the same weakness and immunity');
  assert.match(giveBack, /applyDamageHealToPlacement\(dealt\.targetId, 'heal', amount\)/, 'as healing, which stops at the maximum and reaches a hero\'s sheet');
  assert.doesNotMatch(giveBack, /allowTempHp/);
  // A failure to give back does not undo the undo: the move is back and the wall is whole.
  assert.match(giveBack, /\} catch \(error\) \{\s*console\.warn\(/);
});
