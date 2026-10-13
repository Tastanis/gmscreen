import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTriggerLifetimeState, shouldExpireTriggerEntry } from '../automation-trigger-lifetime.js';

// Brandon, October 12, 2026: "Thorn in foot, isnt triggering the damage when things move. is this a json or code
// issue". And, of how it should work: "let's have the damage land by itself."
//
// Code. The ability's card was valid. The watch it set ("when the target moves") lived only in the memory of the
// browser tab that used the ability, and a move is announced only in the tab that makes it: when the Director moved
// the creature, the player's page, which alone knew of the watch, never heard. And when a page did hear, it only
// raised a "!" to click.
//
// The watch is now also kept on the caster's token (`runtimeTriggers`), which every page holds, so the page that
// makes the move answers for it. Thorn In Foot's own text (from Cal's sheet): "Each time the target willingly moves
// before the end of your next turn, they take 1 psychic damage for each square they move." Willing movement only:
// a walk, a shift, a climb, a fly. Not a push, pull or slide; not a teleport.
//
// Most of this lives in handlers that need a real board, so it is read from the page's own source here; the tester
// walks it in a browser.
const board = readFileSync(new URL('../board-interactions.js', import.meta.url), 'utf8');

test('a watch an ability sets is kept on the caster\'s token for every page', () => {
  assert.match(board, /const watch = runtimeWatchEntry\(casterId, \{ \.\.\.entry, usageLimit: entry\.usageLimit, lifetimeState: null \}, 'runtime'\);\s*const registered = triggerRegister\(watch\);\s*if \(registered\) \{\s*authoredTriggerTokenIds\.add\(casterId\);[\s\S]{0,140}shareRuntimeWatch\(registered\);/, 'set on the page that used the ability, and shared');
  assert.match(board, /target\.runtimeTriggers = \[\.\.\.others, record\];/, 'on the token, beside any other watch it holds');
  assert.match(board, /const others = Array\.isArray\(target\.runtimeTriggers\) \? target\.runtimeTriggers\.filter\(\(kept\) => kept\?\.abilityId !== record\.abilityId\) : \[\];/, 'using the ability again replaces its own watch, it does not stack');
});

test('every page takes the scene\'s watches before anything fires, and the page that makes the move answers', () => {
  assert.match(board, /function triggerFire\(eventType, payload\) \{\s*try \{ syncSharedWatches\(\); \}/, 'read at the moment of firing, so a watch set a moment ago on another page is known');
  assert.match(board, /const mine = \(triggerRegistry\.byToken\.get\(placement\.id\) \|\| \[\]\)\.some\(\(entry\) => entry\.abilityId === record\.abilityId && \['runtime', SHARED_WATCH\]\.includes\(entry\.registrationSource\)\);\s*if \(!mine && triggerRegister\(runtimeWatchEntry\(placement\.id, record, SHARED_WATCH\)\)\)/, 'once each: the page that set it does not take it a second time');
  assert.match(board, /if \(entry\?\.registrationSource === SHARED_WATCH && !held\.has\(`\$\{entry\.tokenId\}\|\$\{entry\.abilityId\}`\)\) triggerUnregisterEntry\(entry\);/, 'and one the scene no longer holds is dropped');
  // A move is announced on the page that made it, and nowhere else: one page answers.
  const moved = readFileSync(new URL('../../sync-v2/confirmed-movement.js', import.meta.url), 'utf8');
  assert.match(moved, /if \(context\.source !== 'acknowledgement' \|\| !previous \|\| !placement\) return null;/);
  assert.match(moved, /if \(!\['walk','shift'\]\.includes\(kind\)\) return null;/, 'a walk or a shift: a push, pull or slide is not the creature\'s own move');
});

test('a watch that lands by itself does not wait on a triggered action, and a teleport is not a move through squares', () => {
  assert.match(board, /freeTriggered: Boolean\(record\.freeTriggered \|\| record\.autoResolve\)/);
  assert.match(board, /entry\.predicate = \(payload, self\) => \(entry\.eventType === 'move' && payload\?\.kind === 'teleport' && entry\.match\?\.filter\?\.teleport !== true \? false : matches\(payload, self\)\);/, 'a teleport counts only for a watch that says so');
});

test('the damage is one for each square of the move that set it off', () => {
  assert.match(board, /const moved = Math\.max\(0, Math\.trunc\(Number\(payload\?\.movedDistance \?\? payload\?\.distance\) \|\| 0\)\);/);
  assert.match(board, /if \(!\['triggeringForcedMovement', 'triggeringMovement', 'movedDistance'\]\.includes\(from\)\) return effect;\s*const \{ amountFrom: _from, \.\.\.rest \} = effect;\s*return \{ \.\.\.rest, amount: moved \* \(Number\(effect\.amountFrom\?\.multiplier\) \|\| 1\) \};/);
  const schema = readFileSync(new URL('../../../../../character_sheet/ability-automation/schema.js', import.meta.url), 'utf8');
  assert.match(schema, /const fromTheMove = \["triggeringForcedMovement", "triggeringMovement", "movedDistance"\]\.includes\(effect\?\.amountFrom\?\.source\);/, 'and the card editor no longer warns that such an amount cannot resolve by itself');
  const card = readFileSync(new URL('../../../../../ai-reference/characters/cal-automations.md', import.meta.url), 'utf8');
  assert.match(card, /"id":\s+"trigger-thorn-move",[\s\S]{0,400}"autoResolve":\s+true,/, 'Thorn In Foot\'s reference card says it lands by itself');
});

test('the watch runs out at the end of the caster\'s next turn, and the Director\'s page keeps the shared record in step', () => {
  // The lifetime on Thorn In Foot's card, set during Cal's own turn in round 2.
  const entry = { tokenId: 'cal', expires: { event: 'turnEnd', whose: 'self', count: 1, skipCurrent: true } };
  entry.lifetimeState = createTriggerLifetimeState(entry.expires, { round: 2, activeCombatantId: 'cal' });
  const turnEnd = (who) => shouldExpireTriggerEntry(entry, { eventType: 'turnEnd', placementId: who }, { activeCombatantId: who });
  assert.equal(turnEnd('cal'), false, 'the end of the turn he used it in does not count');
  assert.equal(turnEnd('gintaras'), false, 'nor does anybody else\'s turn');
  // What a page that loads now is handed: the record with its count so far.
  const handed = JSON.parse(JSON.stringify(entry.lifetimeState));
  assert.equal(handed.skippedCurrent, true);
  const later = { tokenId: 'cal', expires: entry.expires, lifetimeState: handed };
  assert.equal(shouldExpireTriggerEntry(later, { eventType: 'turnEnd', placementId: 'cal' }, { activeCombatantId: 'cal' }), true, 'it ends at the end of his next turn, on a page that loaded part-way too');
  assert.match(board, /if \(\(entry\.expires \|\| entry\.lifetime\) && !entry\.lifetimeState\) \{/, 'a count that came with the watch is kept, not started again');
  assert.match(board, /triggerUnregisterEntry\(entry\);\s*if \(shared && isGmUser\(\)\) unshareRuntimeWatch\(entry\.tokenId, entry\.abilityId\);/, 'run out: the Director\'s page takes it off the token');
  assert.match(board, /\/\/ Part of its time has gone[\s\S]{0,120}shareRuntimeWatch\(entry\);/, 'part of its time gone: the shared record says so');
  assert.match(board, /if \(eventType === 'combatEnd' && isGmUser\(\)\) \{/, 'and no watch outlives the combat');
});
