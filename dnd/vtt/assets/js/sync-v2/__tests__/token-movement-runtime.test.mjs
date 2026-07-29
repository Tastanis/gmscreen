import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createTokenMovementRuntime } from '../token-movement-runtime.js';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => clone(body),
  };
}

function createCanonicalServer() {
  let revision = 0;
  let placement = {
    id: 'token-1',
    column: 1,
    row: 1,
    width: 1,
    height: 1,
    _entityRevision: 0,
  };
  const events = [];

  const snapshot = () => ({
    revision,
    state: { placements: { 'scene-1': { 'token-1': clone(placement) } } },
  });

  async function fetchImpl(url, options = {}) {
    if (String(url).includes('snapshot')) {
      return response(200, { success: true, snapshot: snapshot() });
    }
    if (String(url).includes('sync')) {
      const after = Number(new URL(String(url), 'http://local').searchParams.get('after') || 0);
      return response(200, {
        success: true,
        recovery: {
          mode: 'events',
          fromRevision: after,
          revision,
          events: events.filter((event) => event.revision > after),
        },
      });
    }
    const command = JSON.parse(options.body);
    if (Number(command.entityRevision) !== placement._entityRevision) {
      return response(409, {
        success: false,
        error: 'entity_revision_mismatch',
        snapshot: snapshot(),
      });
    }
    revision += 1;
    placement = {
      ...placement,
      column: Number(command.payload.column),
      row: Number(command.payload.row),
      _entityRevision: placement._entityRevision + 1,
    };
    const event = {
      revision,
      operationId: command.operationId,
      type: 'token.moved',
      actorId: 'test',
      sceneId: 'scene-1',
      entityId: 'token-1',
      entityRevision: placement._entityRevision,
      payload: { column: placement.column, row: placement.row },
      serverTime: revision,
    };
    events.push(event);
    return response(200, { success: true, event, idempotent: false });
  }

  return { fetchImpl, snapshot };
}

function createClient(server, id) {
  const patches = [];
  const previews = [];
  let snapshotReconciliations = 0;
  const runtime = createTokenMovementRuntime({
    enabled: true,
    commandsEndpoint: '/commands',
    eventsEndpoint: '/sync',
    snapshotEndpoint: '/snapshot',
    fetchImpl: server.fetchImpl,
    windowRef: {},
    previewPlacement: (sceneId, placementId, placement) => {
      previews.push({ sceneId, placementId, placement: clone(placement) });
    },
    applyConfirmedPlacement: (sceneId, placementId, placement) => {
      patches.push({ sceneId, placementId, placement: clone(placement) });
    },
    reconcileSnapshot: () => {
      snapshotReconciliations += 1;
    },
    onError: (error) => {
      throw error;
    },
  });
  return { id, runtime, patches, previews, get snapshotReconciliations() { return snapshotReconciliations; } };
}

test('three clients converge through replay and simultaneous same-token conflicts without full-board work', async () => {
  const server = createCanonicalServer();
  const clients = ['gm', 'player-a', 'player-b'].map((id) => createClient(server, id));
  await Promise.all(clients.map((client) => client.runtime.start()));

  await clients[0].runtime.submitMoves('scene-1', [
    { placementId: 'token-1', column: 4, row: 3 },
  ]);
  await Promise.all(clients.slice(1).map((client) => client.runtime.__testing.eventStream.recover()));

  assert.equal(clients[0].patches.at(-1).placement.column, 4);
  assert.equal(clients[1].patches.at(-1).placement.column, 4);
  assert.equal(clients[2].patches.at(-1).placement.column, 4);

  // Both clients start from entity revision 1. The server accepts one, rejects
  // the other, and the runtime rebases/retries against the conflict snapshot.
  await Promise.all([
    clients[0].runtime.submitMoves('scene-1', [
      { placementId: 'token-1', column: 6, row: 3 },
    ]),
    clients[1].runtime.submitMoves('scene-1', [
      { placementId: 'token-1', column: 7, row: 3 },
    ]),
  ]);
  await Promise.all(clients.map((client) => client.runtime.__testing.eventStream.recover()));

  for (const client of clients) {
    const confirmed =
      client.runtime.__testing.store.getSnapshot().state.placements['scene-1']['token-1'];
    assert.equal(confirmed.column, 7);
    assert.equal(confirmed._entityRevision, 3);
  }
  assert.equal(server.snapshot().revision, 3);
  assert.ok(clients[0].previews.length > 0, 'movement uses an ephemeral preview');
  assert.equal(clients[2].snapshotReconciliations, 1, 'ordinary replay does not reconcile the full board');
});
