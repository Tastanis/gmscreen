import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fallBreakThrough } from '../fall-review.js';
import { MOVEMENT_RULES } from '../movement-rules.mjs';

// Brandon, November 10, 2026: "finish the falling through things". The server decides a fall breaks through what it
// lands on (FallOutcome::breakThrough, api/v2/tests/fall-breaks-through.test.php); the page shows it in the fall panel
// with the book's damage for the break added, and tells the server when the mover climbed down instead.

test('the fall panel adds the book\'s damage for each break and names what broke', () => {
  assert.deepEqual(fallBreakThrough({ breakThrough: [{ material: 'wood', damage: 5 }] }), { damage: 5, words: 'wood' });
  assert.deepEqual(fallBreakThrough({ breakThrough: [{ material: 'glass', damage: 3 }, { material: 'wood', damage: 5 }] }), { damage: 8, words: 'glass and wood' });
  assert.deepEqual(fallBreakThrough({ squares: 4 }), { damage: 0, words: '' }, 'a plain fall');
  const panel = readFileSync(new URL('../fall-review.js', import.meta.url), 'utf8');
  assert.match(panel, /computedDamage=fallDamage\(details\.squares,Number\(stats\.agility\)\|\|0,details\.forcedDown,shorter\)\+through\.damage,/);
  assert.match(panel, /\['Breaks through',through\.words\],\['Breaking it',`\+\$\{through\.damage\} damage`\]/);
  assert.match(panel, /fallAllowsClimbing\(details\)&&!through\.words\?/, 'no "Climbing" once it broke through: it is already below');
});

test('the limits are rows of the rules table', () => {
  assert.equal(MOVEMENT_RULES.fallBreakSquares, 1);
  assert.equal(MOVEMENT_RULES.fallBreakDamage, 1);
});

test('"Climb down" all the way travels with the move, so the server breaks nothing', () => {
  const board = readFileSync(new URL('../board-interactions.js', import.meta.url), 'utf8');
  assert.match(board, /if \(climbDown\.all\) \{ climbDownChosen\.add\(move\.placementId\); wallAnswers\.set\(move\.placementId, \{ \.\.\.\(wallAnswers\.get\(move\.placementId\) \|\| \{\}\), climbDown: true \}\); \}/);
  const runtime = readFileSync(new URL('../../sync-v2/token-movement-runtime.js', import.meta.url), 'utf8');
  assert.equal(runtime.match(/climbDown === true \? \{climbDown:true\} : \{\}/g)?.length, 3, 'on every way a move is sent');
});
