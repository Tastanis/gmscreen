import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMaliceChanges } from '../malice-changes.mjs';

// Brandon, October 12, 2026: "Malace sometimes pops back or doenst work right. make sure it comes and goes
// correctly. and doesnt pop back." The server's side is malice-changes.test.php.

// A server that applies amounts to its own stored number and counts its changes, answering when told to.
function server(malice = 10) {
  let sequence = 1; const asked = [], waiting = [];
  const apply = (amount) => { malice = Math.max(0, malice + amount); sequence += 1; return { malice, sequence }; };
  return {
    asked, apply, get stored() { return { malice, sequence }; },
    submit: (amount) => new Promise((resolve, reject) => { asked.push(amount); waiting.push({ amount, resolve, reject }); }),
    answer() { const next = waiting.shift(); next.resolve(apply(next.amount)); return tick(); },
    refuse() { const next = waiting.shift(); next.reject(new Error('rejected')); return tick(); },
  };
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test('a change is sent as an amount, and an older stored number heard meanwhile does not put the pips back', async () => {
  const site = server(10), shown = [];
  const changes = createMaliceChanges({ submit: site.submit, show: (value) => shown.push(value) });
  changes.send(-3); await tick();
  assert.deepEqual(site.asked, [-3], 'three taken, not "set to seven"');
  // Combat news handled before our change arrives: it still says 10.
  assert.equal(changes.heard(10, site.stored.sequence), null, 'while ours is unanswered the page is not told to show the old number');
  assert.deepEqual(shown, []);
  await site.answer();
  assert.deepEqual(shown, [7], 'answered: the stored number, which has ours in it');
  assert.equal(changes.busy, false);
  assert.equal(changes.heard(7, site.stored.sequence), 7, 'with nothing on its way a stored number is shown as it is heard');
});

test('changes go one at a time, and what waits behind is sent as one amount', async () => {
  const site = server(10), shown = [];
  const changes = createMaliceChanges({ submit: site.submit, show: (value) => shown.push(value) });
  changes.send(-3); changes.send(2); changes.send(-1); await tick();
  assert.deepEqual(site.asked, [-3], 'only the first is on its way');
  await site.answer();
  assert.deepEqual(site.asked, [-3, 1], 'then the rest, summed');
  assert.deepEqual(shown, [], 'nothing is shown until the last is answered');
  await site.answer();
  assert.deepEqual(shown, [8]);
  changes.send(0); changes.send('x'); await tick();
  assert.deepEqual(site.asked, [-3, 1], 'no change, nothing sent');
});

test('what another Director page did in between is kept, in whatever order the news arrives', async () => {
  const site = server(10), shown = [];
  const changes = createMaliceChanges({ submit: site.submit, show: (value) => shown.push(value) });
  changes.send(-3); await tick();
  // The other page adds 5 and its news reaches us before our own answer does; the server took ours first.
  const ours = site.apply(-3), theirs = site.apply(5);
  assert.equal(changes.heard(theirs.malice, theirs.sequence), null);
  assert.equal(changes.heard(ours.malice, ours.sequence), null, 'an older number arriving late is not taken for the newest');
  // Our answer comes last and carries the older of the two.
  const flight = createMaliceChanges({ submit: () => Promise.resolve(ours), show: (value) => shown.push(value) });
  flight.send(-3); flight.heard(theirs.malice, theirs.sequence); await tick();
  assert.deepEqual(shown, [12], 'the newest stored number is shown: ours and theirs both in it');
});

test('a change that is not taken puts the pips back to what is stored and drops what waited behind it', async () => {
  const site = server(10), shown = [], failures = [];
  const changes = createMaliceChanges({ submit: site.submit, show: (value) => shown.push(value), failed: (error) => failures.push(error.message) });
  assert.equal(changes.heard(10, 1), 10);
  changes.send(-3); changes.send(-2); await tick();
  await site.refuse();
  assert.deepEqual(failures, ['rejected']);
  assert.deepEqual(site.asked, [-3], 'the one waiting behind is not sent after a refusal');
  assert.deepEqual(shown, [10], 'the stored number is shown again');
  changes.reset();
  assert.equal(changes.busy, false);
});

test('the board sends Malice as amounts, alone, and clears the pips when combat ends', () => {
  const board = readFileSync(new URL('../board-interactions.js', import.meta.url), 'utf8');
  assert.match(board, /submitCombatCommand\('combat\.patch', activeSceneId, \{ patch: \{ maliceDelta: amount \} \}\)/, 'an amount for the server to apply');
  assert.match(board, /if \(combatV2Enabled\) \{\s*if \(isGmUser\(\) && options\.sync !== false\) maliceChanges\.send\(change\);\s*\} else \{\s*markCombatFieldDirty\('malice'\);\s*\}/, 'under the shared store Malice is never marked to ride along on another combat change');
  assert.match(board, /const settled = maliceChanges\.heard\(normalized\.malice, Number\(normalized\.sequence\) \|\| 0\);\s*if \(settled !== null\) maliceCount = settled;/, 'incoming combat state does not overwrite a change still on its way');
  assert.match(board, /if \(!combatActive\) \{\s*maliceCount = 0;\s*maliceChanges\.reset\(\);/, 'combat over: nothing waits');
  assert.match(board, /if \(!combatActive\) \{\s*\/\/ Out of combat there is no Malice: the pips go, not only the box round them\.\s*renderMalicePips\(malicePips, 0, 'vtt-malice__pip'\);/, 'and the pips are cleared (the tester: stored 0, both Director pages still showing 5)');
  assert.match(board, /submitCanonicalCombatIntent\('round\.advance', \{ expectedRound: combatRound \}\)/, 'End Round says which round it ends');
  assert.match(board, /const earlier = pendingCombatStateSave\.promise;\s*return Promise\.resolve\(earlier\)\.catch\(\(\) => \{\}\)\.then\(\(\) => \(pendingCombatStateSave\?\.promise === earlier \? null : submitCanonicalCombatIntent\(type, details\)\)\);/, 'a combat change asked for while another is being saved waits its turn');
});
