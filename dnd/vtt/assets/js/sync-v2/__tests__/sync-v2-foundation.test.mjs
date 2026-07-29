import test from 'node:test';
import assert from 'node:assert/strict';

import { createChangeRouter } from '../change-router.js';
import { createCommandClient } from '../command-client.js';
import { createEntityStore } from '../entity-store.js';
import { reduceCanonicalEvent } from '../event-reducer.js';
import { createEventStream, createPusherEventTransport } from '../event-stream.js';
import { createMultiplayerFaultHarness } from '../testing/multiplayer-fault-harness.js';

function shadowEvent(revision, operationId, payload = {}) {
  return {
    revision,
    operationId,
    type: 'shadow.observed',
    actorId: 'GM',
    sceneId: 'scene-1',
    entityId: null,
    entityRevision: null,
    payload,
    serverTime: 1000 + revision,
  };
}

test('canonical reducer applies an acknowledgement/broadcast operation only once', () => {
  const initial = { revision: 0, state: {}, appliedOperationIds: [] };
  const first = reduceCanonicalEvent(initial, shadowEvent(1, 'operation-1', { value: 1 }));
  assert.equal(first.status, 'applied');
  assert.equal(first.snapshot.revision, 1);
  assert.equal(first.snapshot.state.shadow.observations.length, 1);

  const duplicate = reduceCanonicalEvent(
    first.snapshot,
    shadowEvent(1, 'operation-1', { value: 999 })
  );
  assert.equal(duplicate.status, 'duplicate');
  assert.deepEqual(duplicate.snapshot, first.snapshot);
});

test('entity store refuses revision decrease even for a recovery snapshot', () => {
  const store = createEntityStore({
    revision: 5,
    state: { marker: 'confirmed' },
  });
  const result = store.replaceSnapshot(
    { revision: 4, state: { marker: 'stale' } },
    { authoritative: true, source: 'recovery' }
  );
  assert.equal(result.applied, false);
  assert.equal(result.reason, 'revision_decrease');
  assert.equal(store.getRevision(), 5);
  assert.equal(store.getSnapshot().state.marker, 'confirmed');
});

test('token movement reducer returns a one-token change set without broad domains', () => {
  const initial = {
    revision: 4,
    state: {
      placements: {
        'scene-1': {
          'token-1': { column: 1, row: 1, _entityRevision: 8 },
          'token-2': { column: 9, row: 9, _entityRevision: 2 },
        },
      },
    },
  };
  const result = reduceCanonicalEvent(initial, {
    revision: 5,
    operationId: 'move-token-1',
    type: 'token.moved',
    sceneId: 'scene-1',
    entityId: 'token-1',
    entityRevision: 9,
    payload: { column: 2, row: 3 },
  });

  assert.equal(result.status, 'applied');
  assert.deepEqual(result.changeSet.placements.updated, ['token-1']);
  assert.equal(result.changeSet.combat, false);
  assert.equal(result.changeSet.fog, false);
  assert.equal(result.changeSet.templates, false);
  assert.equal(result.changeSet.drawings, false);
  assert.deepEqual(
    result.snapshot.state.placements['scene-1']['token-2'],
    initial.state.placements['scene-1']['token-2']
  );
});

test('event stream buffers a gap and deterministically replays missing events', async () => {
  const store = createEntityStore();
  const routed = [];
  const stream = createEventStream({
    store,
    changeRouter: createChangeRouter({
      shadow: (changeSet) => routed.push(changeSet.revision),
    }),
    recoveryClient: {
      recoverAfter: async (revision) => {
        assert.equal(revision, 0);
        return {
          mode: 'events',
          events: [
            shadowEvent(1, 'operation-1'),
            shadowEvent(2, 'operation-2'),
          ],
        };
      },
    },
  });

  const result = await stream.ingest(shadowEvent(2, 'operation-2'), 'pusher');
  assert.equal(result.status, 'buffered');
  assert.equal(store.getRevision(), 2);
  assert.deepEqual(stream.getBufferedRevisions(), []);
  assert.deepEqual(routed, [1, 2]);
});

test('three clients converge through reorder, duplicate, disconnect, and recovery', async () => {
  const harness = createMultiplayerFaultHarness();
  const canonicalEvents = [
    shadowEvent(1, 'operation-1', { step: 1 }),
    shadowEvent(2, 'operation-2', { step: 2 }),
    shadowEvent(3, 'operation-3', { step: 3 }),
  ];
  const clients = new Map();
  const deliveries = [];

  for (const id of ['gm', 'player-a', 'player-b']) {
    const store = createEntityStore();
    const stream = createEventStream({
      store,
      recoveryClient: {
        recoverAfter: async (revision) => ({
          mode: 'events',
          events: canonicalEvents.filter((event) => event.revision > revision),
        }),
      },
    });
    clients.set(id, { store, stream });
    harness.registerClient(id, ({ payload }) => {
      deliveries.push(stream.ingest(payload, 'fault-harness'));
    });
  }

  harness.setConnected('player-b', false);
  harness.broadcast({
    from: 'server',
    payload: canonicalEvents[0],
    includeSender: true,
    planByRecipient: {
      gm: { duplicates: 2 },
      'player-a': { delayTicks: 3 },
    },
  });
  harness.broadcast({
    from: 'server',
    payload: canonicalEvents[1],
    includeSender: true,
    planByRecipient: {
      'player-a': { delayTicks: 0 },
    },
  });
  harness.drain();
  await Promise.all(deliveries.splice(0));

  harness.setConnected('player-b', true);
  await clients.get('player-b').stream.recover();
  await clients.get('gm').stream.ingest(canonicalEvents[2], 'acknowledgement');
  await clients.get('player-a').stream.ingest(canonicalEvents[2], 'pusher');
  await clients.get('player-b').stream.ingest(canonicalEvents[2], 'pusher');

  const snapshots = Array.from(clients.values()).map(({ store }) => store.getSnapshot());
  assert.equal(snapshots.every((snapshot) => snapshot.revision === 3), true);
  assert.deepEqual(snapshots[1].state, snapshots[0].state);
  assert.deepEqual(snapshots[2].state, snapshots[0].state);
});

test('command acknowledgements and duplicate Pusher delivery share one reducer', async () => {
  const store = createEntityStore();
  const stream = createEventStream({ store });
  const event = shadowEvent(1, 'operation-command', { source: 'ack' });
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      success: true,
      idempotent: false,
      event,
    }),
  });
  const client = createCommandClient({
    endpoint: '/api/v2/commands.php',
    eventStream: stream,
    fetchImpl,
    getRevision: () => store.getRevision(),
    operationIdFactory: () => 'operation-command',
  });

  const submitted = await client.submit('shadow.observe', { source: 'ack' });
  assert.equal(submitted.applyResult.status, 'applied');
  assert.equal(store.getRevision(), 1);
  assert.equal((await stream.ingest(event, 'pusher')).status, 'duplicate');
  assert.equal(store.getSnapshot().state.shadow.observations.length, 1);
  assert.equal(client.pendingCommands.get('operation-command').status, 'acknowledged');
});

test('Pusher adapter only forwards canonical event envelopes', () => {
  let boundHandler = null;
  let forwarded = null;
  class FakePusher {
    constructor(key, options) {
      this.key = key;
      this.options = options;
      this.connection = { bind() {}, socket_id: '123.456' };
    }
    subscribe() {
      return {
        bind(name, handler) {
          if (name === 'sync-v2-event') {
            boundHandler = handler;
          }
        },
      };
    }
    unsubscribe() {}
    disconnect() {}
  }

  const transport = createPusherEventTransport({
    PusherClass: FakePusher,
    key: 'public-key',
    cluster: 'us3',
    channel: 'private-shadow',
    onEvent: (event, source) => {
      forwarded = { event, source };
    },
  });
  assert.equal(transport.connect(), true);
  boundHandler({ event: shadowEvent(1, 'operation-1') });
  assert.equal(forwarded.source, 'pusher');
  assert.equal(forwarded.event.revision, 1);
  assert.equal(transport.getSocketId(), '123.456');
});
