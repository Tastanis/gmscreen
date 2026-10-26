import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHitPointsNumber } from '../token-hit-points.js';

// Brandon, October 12, 2026: "Some weird things seem to not be syncing or staying correctly sometimes." And: "I
// also want to make sure that the VTT character sheet is working correctly and everything is syncing there right."
//
// A hero's token holds a copy of the sheet's Stamina and maximum. Every change to the token used to send both
// numbers to the sheet as they stood on the token. A token that was behind (the player healed on a phone; the
// maximum went up at a level) wrote the sheet back, and a token showing 0 of 0 for a sheet it could not read
// wrote the 0. And a change made on a sheet on another device never reached the token at all.
//
// Now a token says how much its Stamina changed by, never a maximum; it takes the sheet's answer; a sheet with
// no Stamina gives a token nothing; and the Director's page reads the party's Stamina every few seconds. The
// server's half is api/v2/tests/sheet-counters.test.php.

const board = readFileSync(new URL('../board-interactions.js', import.meta.url), 'utf8');
const source = board.match(/function sheetStaminaWrite\(waiting, change, lastFailed = false\) \{[\s\S]*?\n {2}\}/);
assert.ok(source, 'the page has the rule');
const write = new Function('parseHitPointsNumber', `${source[0]}; return sheetStaminaWrite;`)(parseHitPointsNumber);

test('a hit on a token is an amount', () => {
  assert.deepEqual(write(null, { now: '35', before: '40' }), { delta: -5 });
  assert.deepEqual(write(null, { now: 44, before: 40 }), { delta: 4 });
  assert.equal(write(null, { now: '40', before: '40' }), null, 'no change, nothing to say');
});

test('changes not yet sent are added together', () => {
  const first = write(null, { now: '35', before: '40' });
  const second = write(first, { now: '28', before: '35' });
  assert.deepEqual(second, { delta: -12 });
  assert.deepEqual(write(second, { now: '40', before: '28' }), { delta: 0 }, 'healed back before anything was sent: still sent, as nothing');
});

test('a token that had no number, or whose last write was not confirmed, sends the number it reads', () => {
  assert.deepEqual(write(null, { now: '30', before: '' }), { currentStamina: 30 });
  assert.deepEqual(write(null, { now: '30', before: null }), { currentStamina: 30 });
  assert.deepEqual(write(null, { now: '30', before: '35' }, true), { currentStamina: 30 }, 'after a write that failed, so the two cannot stay apart');
  assert.deepEqual(write({ currentStamina: 30 }, { now: '26', before: '30' }), { currentStamina: 26 }, 'and a later hit before it is sent moves that number');
});

test('a token with no number says nothing, and nothing is ever a maximum', () => {
  assert.equal(write(null, { now: '', before: '40' }), null);
  assert.deepEqual(write({ delta: -5 }, { now: '', before: '35' }), { delta: -5 }, 'what was waiting still goes');
  for (const result of [write(null, { now: 1, before: 2 }), write(null, { now: 1, before: '' })]) assert.equal('staminaMax' in result, false);
  assert.doesNotMatch(board, /staminaMax: snapshot\.max/, 'the token\'s maximum is no longer sent');
  assert.match(board, /currentStamina: snapshot\.current,\s*before,/);
});

test('both places a token\'s Stamina changes say what it was before', () => {
  assert.match(board, /savePromise: updateResult\.savePromise,\s*before: result\.previous,/);
  assert.match(board, /\{ savePromise: updateResult\.savePromise, before: baseSnapshot\.current \}/);
});

test('the token takes the sheet\'s answer, unless a newer change of its own is waiting', () => {
  assert.match(board, /if\(sheetSyncQueue\.get\(key\)===entry\)\{\s*sheetSyncQueue\.delete\(key\);[\s\S]{0,200}if\(stands\?\.success===true && stands\.hasStamina!==false\) applySheetStaminaToTokens\(name,stands\.currentStamina,stands\.staminaMax,stands\.tempStamina\);/);  // temporary Stamina too (October 2026)
  assert.match(board, /if\(!response\?\.ok\)\{ entry\.failed=true; return response; \}/);
  // Sheet pages in this browser are told where the sheet stands, not the token's copy.
  assert.match(board, /broadcastStaminaSync\(\{\s*character: payload\?\.character,\s*currentStamina: stands\.currentStamina,\s*staminaMax: stands\.staminaMax,/);
});

test('a sheet with no Stamina gives a token nothing; the Director\'s page hears of changes made elsewhere', () => {
  assert.match(board, /data\.success === false \|\| data\.hasStamina === false\) \{\s*return;/);
  assert.match(board, /url\.searchParams\.set\('action', 'party-vitals'\);\s*if \(partyVitalsStamp\) url\.searchParams\.set\('since', partyVitalsStamp\);/);
  assert.match(board, /if \(!endpoint \|\| !isGmUser\(\) \|\| partyVitalsBusy \|\| document\.visibilityState === 'hidden'\) return;/, 'the Director\'s page only, and not while its tab is hidden');
  assert.match(board, /if \(vitals\?\.hasStamina !== true\) continue;[\s\S]{0,300}if \(firstRead \|\| partyVitalsSeen\.get\(key\) === stands\) \{ partyVitalsSeen\.set\(key, stands\); continue; \}\s*if \(sending\.has\(key\) \|\| heroTokenJustChanged\(character\)\) \{ held = true; continue; \}\s*partyVitalsSeen\.set\(key, stands\);\s*applySheetStaminaToTokens\(character, vitals\.currentStamina, vitals\.staminaMax, vitals\.tempStamina\);/, 'a hero with a write of this page\'s on its way is left alone; the first read (the page loading) and an unchanged sheet put nothing on a token');
  assert.match(board, /window\.setInterval\(readPartyVitals, PARTY_VITALS_INTERVAL_MS\);/);
  // Putting a sheet's Stamina on a token does not send it back to the sheet.
  const apply = board.slice(board.indexOf('function applySheetStaminaToTokens('), board.indexOf('async function readPartyVitals('));
  assert.ok(apply.length > 200 && !/syncPlacementHitPointsToSheet|scheduleSheetHitPointSync/.test(apply));
});

// A timing fault found by reading Build 493 again: a hit made on a player's page reaches the Director's token at
// once and the sheet a moment later. The Director's read of the sheets, in that gap, would have put the token
// back to the sheet's older number and forward again when the write landed.
test('the party read leaves alone a hero whose token has just changed, on any page', () => {
  assert.match(board, /if \(mutation\?\.placementId && mutation\.changedFields\?\.some\(\(field\) => field === 'hp' \|\| field === 'tempStamina' \|\| field === '\*'\)\) \{\s*tokenStaminaChangedAt\.set\(mutation\.placementId, Date\.now\(\)\);/);
  assert.match(board, /if \(sending\.has\(key\) \|\| heroTokenJustChanged\(character\)\) \{ held = true; continue; \}/);
  assert.match(board, /partyVitalsStamp = held \? '' : String\(answer\.stamp \|\| ''\);/, 'and reads that hero again next time');
  assert.match(board, /const PARTY_VITALS_SETTLE_MS = 3000;/);
  // The map of times exists before anything that can run while the page starts up.
  assert.ok(board.indexOf('const tokenStaminaChangedAt = new Map();') < board.indexOf('function applyConfirmedPlacementBatch('));
});

// Build 493 broke the Director's page and no test saw it: the settings of the party read were declared thousands
// of lines below the line that starts the read while the page mounts, so the page stopped there with "Cannot
// access 'PARTY_VITALS_INTERVAL_MS' before initialization" and the rest of its start-up never ran. Opening the
// page found it at once. Everything startListeningForSheetSync touches as the page mounts must exist by then.
test('what the page starts as it mounts is declared before the line that starts it', () => {
  const started = board.indexOf('\n  startListeningForSheetSync();');
  assert.ok(started > 0, 'the page starts the sheet listener as it mounts');
  const body = board.slice(board.indexOf('function startListeningForSheetSync() {'), board.indexOf('function findExistingConditionDescription('));
  const declaredAt = (name) => board.search(new RegExp('(?:const|let) ' + name + '[ ,;=]'));
  for (const name of new Set(body.match(/\b[A-Z][A-Z0-9_]{5,}\b/g) || [])) {
    const declared = declaredAt(name);
    if (declared < 0) continue;                                   // a module-level import or constant
    assert.ok(declared < started, `${name} is declared before the page's start-up reaches it`);
  }
  for (const name of ['tokenStaminaChangedAt', 'partyVitalsStamp', 'PARTY_VITALS_INTERVAL_MS', 'PARTY_VITALS_SETTLE_MS', 'sheetSyncQueue']) {
    const declared = declaredAt(name);
    assert.ok(declared > 0 && declared < started, `${name} is declared before the page's start-up reaches it`);
  }
});
