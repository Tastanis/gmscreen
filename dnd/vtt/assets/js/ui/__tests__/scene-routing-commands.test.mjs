import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoutingIntent, deriveRoutingCommands, activeSceneMapRepair, createSerialQueue, ROUTING_FIELDS } from '../scene-routing-commands.mjs';

const MAPS = { a: '/maps/a.jpg', b: '/maps/b.jpg', c: '/maps/c.jpg' };

// ---- a small copy of the server's routing rules (SyncV2Store) ------------------
function createServer(start = { activeSceneId: 'a', mapUrl: MAPS.a }) {
  const routing = { _revision: 0, playerMapDisabled: false, playerActiveSceneId: null, playerMapUrl: null, ...start };
  const log = [];
  return {
    routing,
    log,
    /** Returns {ok, routing}: the reply always carries the whole routing record, as the real server's does. */
    accept(command, entityRevision) {
      if (entityRevision !== routing._revision) { log.push(`409 ${command.type}`); return { ok: false, routing: { ...routing } }; }
      routing._revision += 1;
      if (command.type === 'scene.activate') {
        routing.activeSceneId = command.sceneId;
        if (Object.hasOwn(command.payload ?? {}, 'mapUrl')) routing.mapUrl = command.payload.mapUrl;
      } else Object.assign(routing, command.payload.routing);
      log.push(`${command.type} ${JSON.stringify(command.type === 'scene.activate' ? [command.sceneId, command.payload?.mapUrl] : command.payload.routing)}`);
      return { ok: true, routing: { ...routing } };
    },
  };
}

/**
 * A browser as the board behaves: local state, a server reply copied over local state field by
 * field (overlayBoardState), and saves that other parts of the board can ask for at any moment.
 * `mode` 'flags' is the old behaviour (remember only THAT a field is unsaved, read its value when
 * the save runs, scene and picture as two commands, saves not queued). 'intent' is the fix.
 */
function createBrowser(server, mode) {
  const local = { activeSceneId: server.routing.activeSceneId, mapUrl: server.routing.mapUrl };
  let known = server.routing._revision;
  const dirty = new Set();
  const intent = createRoutingIntent();
  const overlay = (routing) => { for (const [field, value] of Object.entries(routing)) if (!field.startsWith('_')) local[field] = value; known = routing._revision; };
  const mark = (field) => { dirty.add(field); intent.mark(field, local[field]); };
  /** One save, as a list of steps so a test can interleave another save between any two of them. */
  function* save() {
    let commands;
    if (mode === 'flags') {
      commands = [];
      if (dirty.has('activeSceneId') && local.activeSceneId) commands.push({ command: { type: 'scene.activate', sceneId: local.activeSceneId, payload: {} }, fields: ['activeSceneId'] });
      const routing = {};
      for (const field of ROUTING_FIELDS) if (dirty.has(field)) routing[field] = local[field] ?? null;
      if (Object.keys(routing).length) commands.push({ command: { type: 'routing.set', sceneId: null, payload: { routing } }, fields: Object.keys(routing) });
    } else {
      commands = deriveRoutingCommands(intent).map(({ command, settles }) => ({ command, settles }));
    }
    const sent = [];
    for (const entry of commands) {
      yield 'before send';
      let reply = server.accept(entry.command, known);
      overlay(reply.routing);
      if (!reply.ok) { yield 'after conflict'; reply = server.accept(entry.command, known); overlay(reply.routing); }
      if (reply.ok) {
        if (mode === 'flags') sent.push(...entry.fields);
        else for (const [field, stamp] of entry.settles) if (intent.settle(field, stamp)) dirty.delete(field);
      }
      yield 'after reply';
    }
    sent.forEach((field) => dirty.delete(field)); // the old code cleared its flags when the whole save was done
  }
  return {
    local,
    openScene(id) { local.activeSceneId = id; local.mapUrl = MAPS[id]; mark('activeSceneId'); mark('mapUrl'); },
    save,
    get unsaved() { return mode === 'flags' ? dirty.size : intent.size; },
  };
}
const finish = (steps) => { for (const _ of steps); };
const consistent = (routing) => routing.mapUrl === MAPS[routing.activeSceneId];

test('the old save could end with the new scene and the previous scene\u2019s map (one click, no double switch)', () => {
  const server = createServer();
  const gm = createBrowser(server, 'flags');
  gm.openScene('b');
  const first = gm.save();
  first.next();            // about to send "active scene is b"
  first.next();            // the server said "scene b, map a" and the browser copied that over its own state
  assert.equal(gm.local.mapUrl, MAPS.a, 'the reply put the old picture back in the browser');
  const second = gm.save(); // another part of the board asks for a save right now...
  second.next();            // ...and reads the picture to send from the browser's state: the old one
  finish(first);            // the first save sends the right picture
  finish(second);           // the second sends "scene b" again and then the old picture, last
  assert.deepEqual(server.log, ['scene.activate ["b",null]', `routing.set {"mapUrl":"${MAPS.b}"}`, 'scene.activate ["b",null]', `routing.set {"mapUrl":"${MAPS.a}"}`], 'the same four messages the sandbox recorded');
  assert.equal(server.routing.activeSceneId, 'b');
  assert.equal(server.routing.mapUrl, MAPS.a, 'saved half-switched: scene b with scene a\u2019s map');
  assert.ok(!consistent(server.routing));
});

test('the fix: the same moment, the same second save, and the scene and its map are saved together', () => {
  const server = createServer();
  const gm = createBrowser(server, 'intent');
  gm.openScene('b');
  const first = gm.save();
  first.next();
  first.next();
  assert.equal(gm.local.mapUrl, MAPS.b, 'the reply already carries the new picture');
  finish(first);
  finish(gm.save());        // the second save waited its turn; there is nothing left for it to send
  assert.deepEqual(server.log, [`scene.activate ["b","${MAPS.b}"]`], 'one click, one message');
  assert.deepEqual([server.routing.activeSceneId, server.routing.mapUrl], ['b', MAPS.b]);
  assert.equal(gm.unsaved, 0);
});

test('whenever the GM clicks, and however many saves are asked for, a scene is never split from its map', () => {
  // The fix queues saves, so the things that can still interleave are the steps of the running
  // save, a second click on another scene, and extra save requests from other parts of the board.
  let checked = 0;
  for (const second of [null, 'c']) {
    for (let clickAt = 0; clickAt <= 3; clickAt++) {
      for (let extraAt = 0; extraAt <= 3; extraAt++) {
        for (const conflict of [false, true]) {
          const server = createServer();
          const gm = createBrowser(server, 'intent');
          gm.openScene('b');
          const running = gm.save();
          let queued = 0;
          for (let step = 0; step <= 3; step++) {
            if (step === clickAt && second) { gm.openScene(second); queued += 1; }
            if (step === extraAt) queued += 1;
            // another browser tab, or the player list, changes routing underneath: the next command conflicts once
            if (conflict && step === 1) server.accept({ type: 'routing.set', sceneId: null, payload: { routing: { playerMapDisabled: true } } }, server.routing._revision);
            running.next();
          }
          finish(running);
          for (let i = 0; i < queued; i++) finish(gm.save());
          checked += 1;
          assert.ok(consistent(server.routing), `scene ${server.routing.activeSceneId} saved with ${server.routing.mapUrl}: ${server.log.join(' | ')}`);
          assert.equal(server.routing.activeSceneId, second ?? 'b', `the last scene chosen is the one saved: ${server.log.join(' | ')}`);
          assert.equal(gm.unsaved, 0);
        }
      }
    }
  }
  assert.equal(checked, 64);
  // The same harness with the old behaviour and step-by-step interleaving does produce split saves.
  const interleavings = (a, b) => (a === 0 && b === 0 ? [[]] : [...(a ? interleavings(a - 1, b).map((rest) => [0, ...rest]) : []), ...(b ? interleavings(a, b - 1).map((rest) => [1, ...rest]) : [])]);
  let oldBroken = 0;
  for (const order of interleavings(4, 4)) {
    const server = createServer();
    const gm = createBrowser(server, 'flags');
    gm.openScene('b');
    const saves = [gm.save(), null];
    for (const turn of order) { if (turn === 1 && !saves[1]) saves[1] = gm.save(); saves[turn].next(); }
    saves.forEach((steps) => steps && finish(steps));
    if (!consistent(server.routing)) oldBroken += 1;
  }
  assert.ok(oldBroken > 0, 'the simulation reproduces the bug with the old behaviour');
});

test('a scene switch is one command carrying the scene’s map; other routing goes separately', () => {
  const intent = createRoutingIntent();
  intent.mark('activeSceneId', 'b');
  intent.mark('mapUrl', MAPS.b);
  let commands = deriveRoutingCommands(intent);
  assert.equal(commands.length, 1);
  assert.deepEqual(commands[0].command, { type: 'scene.activate', sceneId: 'b', payload: { mapUrl: MAPS.b } });
  assert.deepEqual(commands[0].settles.map(([field]) => field), ['activeSceneId', 'mapUrl']);
  // Show Players: its three fields travel in one routing command, as before.
  intent.clear();
  intent.mark('playerMapDisabled', false); intent.mark('playerActiveSceneId', 'b'); intent.mark('playerMapUrl', MAPS.b); intent.mark('playerThumbnailUrl', undefined);
  commands = deriveRoutingCommands(intent);
  assert.deepEqual(commands.map((entry) => entry.command), [{ type: 'routing.set', sceneId: null, payload: { routing: { playerMapDisabled: false, playerActiveSceneId: 'b', playerMapUrl: MAPS.b, playerThumbnailUrl: null } } }]);
  // A picture change with no scene change still goes by itself.
  intent.clear(); intent.mark('mapUrl', null);
  assert.deepEqual(deriveRoutingCommands(intent).map((entry) => entry.command), [{ type: 'routing.set', sceneId: null, payload: { routing: { mapUrl: null } } }]);
  // Clearing the active scene (the last scene was deleted).
  intent.clear(); intent.mark('activeSceneId', null); intent.mark('mapUrl', null);
  assert.deepEqual(deriveRoutingCommands(intent).map((entry) => entry.command), [{ type: 'routing.set', sceneId: null, payload: { routing: { mapUrl: null, activeSceneId: null } } }]);
  // Domains switched off send nothing.
  intent.clear(); intent.mark('activeSceneId', 'b'); intent.mark('mapUrl', MAPS.b);
  assert.deepEqual(deriveRoutingCommands(intent, { scenesEnabled: false, routingEnabled: false }), []);
  assert.deepEqual(deriveRoutingCommands(createRoutingIntent()), []);
});

test('a change made while its save is in flight is not lost when that save lands', () => {
  const intent = createRoutingIntent();
  intent.mark('activeSceneId', 'b'); intent.mark('mapUrl', MAPS.b);
  const [sent] = deriveRoutingCommands(intent);
  intent.mark('activeSceneId', 'c'); intent.mark('mapUrl', MAPS.c);   // the GM clicks another scene before the reply
  for (const [field, stamp] of sent.settles) assert.equal(intent.settle(field, stamp), false, `${field} is still unsaved`);
  assert.deepEqual(deriveRoutingCommands(intent)[0].command, { type: 'scene.activate', sceneId: 'c', payload: { mapUrl: MAPS.c } });
  const [next] = deriveRoutingCommands(intent);
  for (const [field, stamp] of next.settles) assert.equal(intent.settle(field, stamp), true);
  assert.equal(intent.size, 0);
});

test('self-repair: the GM’s browser restores the active scene’s own map, and leaves everything else alone', () => {
  const scenes = [{ id: 'a', mapUrl: MAPS.a }, { id: 'b', mapUrl: MAPS.b }, { id: 'bare' }];
  assert.deepEqual(activeSceneMapRepair({ isGM: true, activeSceneId: 'b', mapUrl: MAPS.a, scenes }), { sceneId: 'b', mapUrl: MAPS.b });
  assert.deepEqual(activeSceneMapRepair({ isGM: true, activeSceneId: 'b', mapUrl: null, scenes }), { sceneId: 'b', mapUrl: MAPS.b });
  assert.equal(activeSceneMapRepair({ isGM: true, activeSceneId: 'b', mapUrl: MAPS.b, scenes }), null, 'nothing wrong');
  assert.equal(activeSceneMapRepair({ isGM: false, activeSceneId: 'b', mapUrl: MAPS.a, scenes }), null, 'a player never writes routing');
  assert.equal(activeSceneMapRepair({ isGM: true, activeSceneId: null, mapUrl: MAPS.a, scenes }), null, 'no active scene');
  assert.equal(activeSceneMapRepair({ isGM: true, activeSceneId: 'gone', mapUrl: MAPS.a, scenes }), null, 'a scene the list does not know');
  assert.equal(activeSceneMapRepair({ isGM: true, activeSceneId: 'bare', mapUrl: MAPS.a, scenes }), null, 'a scene with no picture of its own is not guessed at');
  assert.equal(activeSceneMapRepair({ isGM: true, activeSceneId: 'b', mapUrl: MAPS.a, scenes: null }), null, 'the scene list has not loaded yet');
  assert.equal(activeSceneMapRepair(), null);
});

test('saves run one at a time and in order; a save that hangs does not hold up the rest for ever', async () => {
  const enqueue = createSerialQueue({ stallMs: 5000 });
  const events = [];
  const task = (name, ms, fail = false) => () => new Promise((resolve, reject) => { events.push(`start ${name}`); setTimeout(() => { events.push(`end ${name}`); fail ? reject(new Error(name)) : resolve(name); }, ms); });
  const results = await Promise.allSettled([enqueue(task('one', 15)), enqueue(task('two', 1, true)), enqueue(task('three', 1))]);
  assert.deepEqual(events, ['start one', 'end one', 'start two', 'end two', 'start three', 'end three'], 'never two in flight');
  assert.deepEqual(results.map((result) => result.status), ['fulfilled', 'rejected', 'fulfilled'], 'a failed save does not block the next, and still reports its failure');
  assert.equal(results[0].value, 'one');
  // A save that never answers: the next one starts after the stall limit.
  const stalled = createSerialQueue({ stallMs: 20 });
  const never = stalled(() => new Promise(() => {}));
  const started = Date.now();
  assert.equal(await stalled(() => Promise.resolve('after the stall')), 'after the stall');
  assert.ok(Date.now() - started >= 15);
  void never;
});
