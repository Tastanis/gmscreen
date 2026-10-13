import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createEntityStore } from '../entity-store.js';
import { createEventStream } from '../event-stream.js';

// Brandon, October 12, 2026: "Popup tests for others, liike for other people to roll a test. those arent working.
// does it have the code for it to make it happen already and it just didnt work?"
//
// The code was there and worked without live push. With live push on, every player's page (the one meant to roll
// included) was sent a blanked copy of the request over the channel all players share. The page took the blank as
// the whole of it and moved past the event, so when it next asked the server "what is new after N" the real
// request was no longer new. The Director waited on "0 of N accepted" for ever.
//
// The blank now says "ask", and a page that hears it asks the server for its own copy of what it has missed.

// The server's log: revision 1 is a test asked of the player "sharon".
const request = { id: 'req-1', sceneId: 's', initiatorId: 'gm', recipientId: 'sharon', status: 'pending', attribute: 'Might', targetIds: ['pc'] };
const real = { revision: 1, operationId: 'op-1', type: 'requestedTest.changed', actorId: 'gm', sceneId: 's', entityId: 'req-1', payload: { requestId: 'req-1', request, visibleTo: ['gm', 'sharon'] } };
const blank = (payload) => ({ revision: 1, operationId: 'op-1', type: 'sync.redacted', actorId: null, sceneId: null, entityId: null, entityRevision: null, payload });

// A player's page: what its own questions to the server are answered with (`mine`), and what it ends up holding.
function page(mine) {
  const store = createEntityStore({ revision: 0, state: {} }), asked = [], told = [];
  const recoveryClient = { recoverAfter: async (after) => { asked.push(after); return { mode: 'events', fromRevision: after, revision: 1, events: [mine].filter((e) => e.revision > after) }; } };
  const stream = createEventStream({ store, recoveryClient, changeRouter: { route: (changes) => { if (changes?.requestedTests) told.push('requestedTests'); } } });
  const held = () => Object.keys((store.getConfirmedSnapshot?.() ?? store.getSnapshot()).state.requestedTests ?? {});
  return { store, stream, asked, told, held };
}

test('a blank that says ask makes the page fetch its own copy: the player meant to roll gets the request', async () => {
  const sharon = page(real);
  const result = await sharon.stream.ingest(blank({ ask: true }), 'pusher');
  assert.equal(result.status, 'recovered');
  assert.deepEqual(sharon.asked, [0], 'it asked the server what is new after the revision it held, not after the blank');
  assert.deepEqual(sharon.held(), ['req-1'], 'and holds the request');
  assert.deepEqual(sharon.told, ['requestedTests'], 'so the roll window is told to open');
  assert.equal(sharon.store.getRevision(), 1);
});

test('a player it is not for asks too, is given a plain blank, and moves on', async () => {
  const cal = page(blank([]));
  await cal.stream.ingest(blank({ ask: true }), 'pusher');
  assert.deepEqual(cal.asked, [0]);
  assert.deepEqual(cal.held(), [], 'nothing of the request reaches him');
  assert.equal(cal.store.getRevision(), 1, 'and his page is not left waiting');
  assert.deepEqual(cal.told, []);
});

test('a plain blank (something hidden from every player) is taken as before, with no question asked', async () => {
  const cal = page(real);
  const result = await cal.stream.ingest(blank([]), 'pusher');
  assert.equal(result.status, 'applied');
  assert.deepEqual(cal.asked, [], 'no extra request to the server for the Director\'s hidden work');
  assert.deepEqual(cal.held(), []);
  assert.equal(cal.store.getRevision(), 1);
});

test('when asking brings nothing, the blank still moves the page on', async () => {
  const store = createEntityStore({ revision: 0, state: {} });
  const recoveryClient = { recoverAfter: async () => { throw new Error('the server did not answer'); } };
  const errors = [];
  const stream = createEventStream({ store, recoveryClient, changeRouter: { route() {} }, onError: (error) => errors.push(error.message) });
  const result = await stream.ingest(blank({ ask: true }), 'pusher');
  assert.equal(result.status, 'applied');
  assert.equal(store.getRevision(), 1, 'the page is not stuck behind an event it cannot fetch');
  assert.ok(errors.length >= 1, 'and the failure was reported');
});

test('the server marks the shared channel\'s blank, and only that one', () => {
  const common = readFileSync(new URL('../../../../api/v2/_common.php', import.meta.url), 'utf8');
  assert.match(common, /if \(\$userId === ''\) \{\s*return \[\.\.\.vttSyncV2RedactedEvent\(\$event\), 'payload' => \['ask' => true\]\];\s*\}\s*if \(!in_array\(\$userId, \$visibleTo, true\)\) \{\s*return vttSyncV2RedactedEvent\(\$event\);/, 'no user (the shared channel): a blank that says ask. A named user it is not for: a plain blank');
});
