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

test('combat commands apply one focused canonical transition without snapshot reconciliation', async () => {
  const combat = {
    active: false,
    round: 0,
    activeCombatantId: null,
    completedCombatantIds: [],
    sequence: 0,
  };
  let revision = 0;
  let reconciliations = 0;
  let automationClaimEvent = null;
  const applied = [];
  const fetchImpl = async (url, options = {}) => {
    if (String(url).includes('snapshot')) {
      return response(200, {
        success: true,
        snapshot: { revision, state: { combat: { 'scene-1': clone(combat) } } },
      });
    }
    if (String(url).includes('sync')) {
      const after = Number(new URL(String(url), 'http://local').searchParams.get('after') || 0);
      return response(200, {
        success: true,
        recovery: { mode: 'events', fromRevision: after, revision, events: [] },
      });
    }
    const command = JSON.parse(options.body);
    if (command.type === 'combat.automation.claim') {
      if (automationClaimEvent) {
        return response(200, {
          success: true,
          event: automationClaimEvent,
          idempotent: true,
        });
      }
      revision += 1;
      automationClaimEvent = {
        revision,
        operationId: command.operationId,
        type: 'combat.automationClaimed',
        actorId: null,
        sceneId: command.sceneId,
        payload: {
          transitionOperationId: command.payload.transitionOperationId,
          boundary: command.payload.boundary,
        },
      };
      return response(200, {
        success: true,
        event: automationClaimEvent,
        idempotent: false,
      });
    }
    revision += 1;
    const nextCombat = {
      ...combat,
      active: true,
      round: 1,
      currentTeam: command.payload.startingTeam,
      startingTeam: command.payload.startingTeam,
      sequence: 1,
    };
    const event = {
      revision,
      operationId: command.operationId,
      type: 'combat.transitioned',
      actorId: 'GM',
      sceneId: command.sceneId,
      payload: {
        combat: nextCombat,
        transition: { type: command.type, combatantId: null },
      },
    };
    return response(200, { success: true, event, idempotent: false });
  };
  const runtime = createTokenMovementRuntime({
    enabled: true,
    combatEnabled: true,
    commandsEndpoint: '/commands',
    eventsEndpoint: '/sync',
    snapshotEndpoint: '/snapshot',
    fetchImpl,
    windowRef: {},
    applyConfirmedCombat: (snapshot, confirmedCombat, transition) => {
      applied.push({
        revision: snapshot.revision,
        combat: clone(confirmedCombat),
        transition: clone(transition),
      });
    },
    reconcileSnapshot: () => {
      reconciliations += 1;
    },
  });

  await runtime.start();
  assert.equal(reconciliations, 1, 'bootstrap reconciles once');
  const transitionResult = await runtime.submitCombatCommand('combat.start', 'scene-1', {
    startingTeam: 'ally',
  });

  assert.equal(reconciliations, 1, 'accepted combat events do not reconcile the board snapshot');
  assert.equal(applied.length, 1);
  assert.equal(applied[0].revision, 1);
  assert.equal(applied[0].combat.currentTeam, 'ally');
  assert.equal(applied[0].transition.type, 'combat.start');

  const firstClaim = await runtime.claimCombatAutomation(
    'scene-1',
    transitionResult.event.operationId
  );
  const duplicateClaim = await runtime.claimCombatAutomation(
    'scene-1',
    transitionResult.event.operationId
  );
  assert.equal(firstClaim.idempotent, false);
  assert.equal(duplicateClaim.idempotent, true);
  assert.equal(automationClaimEvent.payload.boundary, 'transition');
  assert.equal(applied.length, 1, 'automation claim events do not replay combat transitions');
});

test('Pusher reconnect immediately recovers missed private-audience events', async () => {
  let revision = 0;
  const events = [];
  let connectionHandler = null;
  let pusherOptions = null;
  class FakePusher {
    constructor(_key, options) {
      pusherOptions = options;
      this.connection = {
        state: 'initialized',
        socket_id: '10.20',
        bind(name, handler) {
          if (name === 'state_change') connectionHandler = handler;
        },
      };
    }
    subscribe(channel) {
      assert.equal(channel, 'private-vtt-sync-v2-players');
      return { bind() {} };
    }
    unsubscribe() {}
    disconnect() {}
  }
  const fetchImpl = async (url) => {
    if (String(url).includes('snapshot')) {
      return response(200, { success: true, snapshot: { revision: 0, state: {} } });
    }
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
  };
  const runtime = createTokenMovementRuntime({
    enabled: true,
    commandsEndpoint: '/commands',
    eventsEndpoint: '/sync',
    snapshotEndpoint: '/snapshot',
    fetchImpl,
    PusherClass: FakePusher,
    pusherConfig: {
      key: 'key',
      cluster: 'us3',
      syncV2Channel: 'private-vtt-sync-v2-players',
      syncV2AuthEndpoint: '/dnd/vtt/api/v2/pusher-auth.php',
    },
    windowRef: { setInterval: () => 1, clearInterval() {} },
  });
  await runtime.start();
  revision = 1;
  events.push(shadowEventForRuntime(1, 'reconnect-event'));
  connectionHandler({ previous: 'unavailable', current: 'connected' });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(runtime.getRevision(), 1);
  assert.equal(
    pusherOptions.channelAuthorization.endpoint,
    '/dnd/vtt/api/v2/pusher-auth.php'
  );
});

function shadowEventForRuntime(revision, operationId) {
  return {
    revision,
    operationId,
    type: 'shadow.observed',
    actorId: null,
    sceneId: null,
    entityId: null,
    entityRevision: null,
    payload: { reconnect: true },
    serverTime: revision,
  };
}
