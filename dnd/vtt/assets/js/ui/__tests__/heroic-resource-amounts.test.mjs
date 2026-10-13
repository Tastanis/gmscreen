import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { __testing } from '../character-summary-panel.js';

// Brandon, October 12, 2026: "specifically, the heroic resources making sure those are triggering correctly when
// players start their turns and stuff".
//
// Traced end to end. The rules themselves (start of fight, start of turn, first time each round) fire once, on
// one page, and that part held. What went wrong was the writing down:
//  - A gain was sent as "the number is now N, and was M" from the page's own copy of the sheet. Whenever that
//    copy was behind (the Director's page at the end of a fight; a player's page on the first turn, after the
//    start-of-fight set; a turn's gain while a zone's upkeep was taken) the server refused it and the gain or the
//    reset was lost, with only a line in the status bar.
//  - An ability's cost and its gains were "the number is now N" from the copy the ability was started with, and
//    erased whatever had been gained since.
//  - "First time this round" marks are kept per page, and only the Director's page cleared them, so in the next
//    fight a player's page thought round 1's gain had already been had.
//  - A gain that was another player's to accept was left on the hero's token, where a page already open never
//    looked.
// Now every gain, loss and cost is an amount the server adds to the number it holds (the server's half is
// api/v2/tests/sheet-counters.test.php), marks are cleared on every page, and an open page sees an offer arrive.

const board = readFileSync(new URL('../board-interactions.js', import.meta.url), 'utf8');

async function posted(run) {
  const originalFetch = globalThis.fetch, originalChannel = globalThis.BroadcastChannel;
  const bodies = [];
  globalThis.fetch = async (endpoint, options = {}) => { bodies.push(options.body); return { ok: true, json: async () => ({ success: true, resource: 9 }) }; };
  globalThis.BroadcastChannel = class { postMessage() {} close() {} };
  try { return { result: await run(), bodies }; } finally { globalThis.fetch = originalFetch; globalThis.BroadcastChannel = originalChannel; }
}

test('an ability\'s cost or gain is sent as the amount of the change, and the sheet\'s answer is taken', async () => {
  // The ability was started when Insight read 7 and now costs 5. Whatever the sheet really holds, 5 comes off it;
  // the server here answers 9, and that answer is what the ability's copy is given.
  const sheet = { hero: { resource: { title: 'Insight', value: 2 } } };
  const { result, bodies } = await posted(() => __testing.saveCharacterHeroicResource(sheet, { characterId: 'sharon', before: 7 }));
  assert.equal(result, true);
  assert.equal(bodies[0].get('action'), 'sync-resource');
  assert.equal(bodies[0].get('delta'), '-5');
  assert.equal(bodies[0].has('value'), false, 'never "the number is now 2"');
  assert.equal(sheet.hero.resource.value, 9, 'the copy the ability holds is given where the sheet now stands');
  // A gain.
  const gain = await posted(() => __testing.saveCharacterHeroicResource({ hero: { resource: { value: 6 } } }, { characterId: 'sharon', before: 4 }));
  assert.equal(gain.bodies[0].get('delta'), '2');
  const panel = readFileSync(new URL('../character-summary-panel.js', import.meta.url), 'utf8');
  assert.equal(panel.match(/await saveCharacterHeroicResource\(sheet, \{ \.\.\.options, before: current \}\);/g)?.length, 3, 'the cost, the rider\'s spend and the gain all say what the number was');
  assert.doesNotMatch(panel, /await saveCharacterHeroicResource\(sheet, options\);/);
});

test('a rule\'s gain or loss is an amount; only "set to" is a set; nothing is refused for a copy that was behind', () => {
  assert.match(board, /rule\.effect\.kind === 'set' \? \{ value: change\.next \} : \{ delta: rule\.effect\.kind === 'lose' \? -amount : amount \}, sheet\);/);
  assert.doesNotMatch(board, /expectedValue/, 'the write no longer says what the page thought the number was');
  assert.match(board, /\? \{ delta: String\(Math\.trunc\(Number\(write\.delta\)\)\) \}\s*: \{ value: String\(Math\.trunc\(Number\(write\?\.value\) \|\| 0\)\) \}\),/);
  assert.match(board, /sheetForCache\.hero\.resource\.value = saved\.resource;/, 'the copy kept on the page is given the sheet\'s answer');
  // The refund of a cancelled requested test gives back what was spent, as an amount.
  assert.match(board, /await syncHeroResourceValueForProfile\(profileId, \{ delta: spent \}, sheet\);/);
});

test('"already this fight" marks are cleared on every page, not only the Director\'s', () => {
  assert.match(board, /const clearsOwnMarks = transition\?\.type === 'combat\.start'\s*\|\| \(transition\?\.type === 'combat\.end' && !isGmUser\(\)\);\s*if \(clearsOwnMarks\) resetAutomationScopedFlags\('all'\);/);
  assert.match(board, /\} else if \(boundary === 'transition' && transition\?\.type === 'combat\.end'\) \{\s*resetAutomationScopedFlags\('all'\);/, 'a second Director\'s page too');
  // The page that runs the end of the fight still clears after its end-of-fight rules.
  assert.match(board, /fireTimingBoundary\('combatEnd', \{ round: previousRound \}\);[\s\S]{0,260}resetAutomationScopedFlags\('all'\);/);
});

test('a gain offered to another player is seen by a page that is already open', () => {
  assert.match(board, /if \(activeMutations\.some\(\(mutation\) => mutation\?\.kind === 'upsert'\s*&& \(mutation\.changedFields\?\.includes\('pendingHeroResourcePrompts'\) \|\| mutation\.changedFields\?\.includes\('\*'\)\)\)\) \{\s*processPendingHeroResourcePrompts\(boardApi\.getState\?\.\(\) \?\? \{\}\);/);
  // One offer is shown once on a page however often its token changes.
  assert.match(board, /if \(handledHeroResourcePromptIds\.has\(record\.id\)\) continue;\s*handledHeroResourcePromptIds\.add\(record\.id\);/);
});
