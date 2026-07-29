import { createEntityStore } from './entity-store.js';
import { createEventStream, createPusherEventTransport } from './event-stream.js';
import { createRecoveryClient } from './recovery-client.js';
import { createCommandClient } from './command-client.js';

function placementFromSnapshot(snapshot, sceneId, placementId) {
  return snapshot?.state?.placements?.[sceneId]?.[placementId] ?? null;
}

async function fetchSnapshot(endpoint, fetchImpl, signal) {
  const response = await fetchImpl(endpoint, {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    signal,
    headers: { Accept: 'application/json' },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.success !== true || !body?.snapshot) {
    const error = new Error(body?.error || `Sync V2 snapshot failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return body.snapshot;
}

/**
 * Live Phase 3 adapter. Confirmed movement always flows through the canonical
 * event reducer; the callbacks only mirror that confirmed projection into the
 * legacy feature store and patch the one affected token node.
 */
export function createTokenMovementRuntime({
  enabled = false,
  commandsEndpoint,
  eventsEndpoint,
  snapshotEndpoint,
  pusherConfig = null,
  PusherClass = globalThis.Pusher,
  fetchImpl = typeof fetch === 'function' ? fetch.bind(globalThis) : null,
  windowRef = typeof window === 'undefined' ? undefined : window,
  pollIntervalMs = 500,
  previewPlacement = () => {},
  applyConfirmedPlacement = () => {},
  reconcileSnapshot = () => {},
  onError = (error) => console.warn('[VTT Sync V2] Token movement failed', error),
} = {}) {
  if (!enabled) {
    return {
      enabled: false,
      start: async () => false,
      stop: () => {},
      submitMoves: async () => [],
      overlayBoardState: (boardState) => boardState,
      getEffectivePlacement: () => null,
      getRevision: () => 0,
    };
  }
  if (!commandsEndpoint || !eventsEndpoint || !snapshotEndpoint || typeof fetchImpl !== 'function') {
    throw new TypeError('Live token movement requires command, event, and snapshot endpoints');
  }

  const store = createEntityStore();
  const recoveryClient = createRecoveryClient({ endpoint: eventsEndpoint, fetchImpl });
  const pendingPreview = new Map();
  let intervalId = null;
  let stopped = false;
  let startPromise = null;

  const changeRouter = {
    route(changeSet, context = {}) {
      if (changeSet?.snapshot) {
        reconcileSnapshot(store.getConfirmedSnapshot(), context);
        return;
      }
      for (const placementId of changeSet?.placements?.updated ?? []) {
        const sceneId = context?.event?.sceneId;
        const placement = placementFromSnapshot(
          store.getConfirmedSnapshot(),
          sceneId,
          placementId
        );
        if (!placement) continue;
        pendingPreview.delete(`${sceneId}:${placementId}`);
        applyConfirmedPlacement(sceneId, placementId, placement, context);
      }
    },
  };
  const eventStream = createEventStream({
    store,
    recoveryClient,
    changeRouter,
    onError,
  });
  const pusherTransport = createPusherEventTransport({
    PusherClass,
    key: pusherConfig?.key,
    cluster: pusherConfig?.cluster,
    channel: pusherConfig?.channel,
    onEvent: (event, source) => eventStream.ingest(event, source).catch(onError),
  });
  const commandClient = createCommandClient({
    endpoint: commandsEndpoint,
    eventStream,
    fetchImpl,
    getRevision: () => store.getRevision(),
    getSocketId: () => pusherTransport.getSocketId(),
  });

  async function start() {
    if (startPromise) return startPromise;
    startPromise = (async () => {
      const snapshot = await fetchSnapshot(snapshotEndpoint, fetchImpl);
      store.replaceSnapshot(snapshot, { authoritative: true, source: 'bootstrap' });
      reconcileSnapshot(store.getConfirmedSnapshot(), { source: 'bootstrap' });
      pusherTransport.connect();
      if (!stopped && typeof windowRef?.setInterval === 'function') {
        intervalId = windowRef.setInterval(() => {
          eventStream.recover().catch(onError);
        }, Math.max(100, Number(pollIntervalMs) || 500));
      }
      return true;
    })().catch((error) => {
      startPromise = null;
      onError(error);
      throw error;
    });
    return startPromise;
  }

  function stop() {
    stopped = true;
    if (intervalId !== null && typeof windowRef?.clearInterval === 'function') {
      windowRef.clearInterval(intervalId);
    }
    intervalId = null;
    pusherTransport.disconnect();
  }

  async function submitOne(sceneId, move, retry = true) {
    const placementId = String(move?.placementId ?? move?.id ?? '').trim();
    if (!sceneId || !placementId) {
      throw new TypeError('A token move requires sceneId and placementId');
    }
    const current = placementFromSnapshot(store.getConfirmedSnapshot(), sceneId, placementId);
    if (!current) {
      await eventStream.recover();
    }
    const confirmed = placementFromSnapshot(store.getConfirmedSnapshot(), sceneId, placementId);
    if (!confirmed) {
      throw new Error(`Unknown Sync V2 placement: ${placementId}`);
    }
    const preview = {
      ...confirmed,
      column: Number(move.column),
      row: Number(move.row),
    };
    pendingPreview.set(`${sceneId}:${placementId}`, preview);
    previewPlacement(sceneId, placementId, preview);

    try {
      return await commandClient.submit(
        'token.move',
        {
          placementId,
          column: preview.column,
          row: preview.row,
        },
        {
          sceneId,
          entityId: placementId,
          entityRevision: Number(confirmed._entityRevision) || 0,
        }
      );
    } catch (error) {
      const conflictSnapshot = error?.response?.snapshot;
      if (retry && error?.status === 409 && conflictSnapshot) {
        store.replaceSnapshot(conflictSnapshot, { authoritative: true, source: 'conflict' });
        reconcileSnapshot(store.getConfirmedSnapshot(), { source: 'conflict' });
        return submitOne(sceneId, move, false);
      }
      pendingPreview.delete(`${sceneId}:${placementId}`);
      const latest = placementFromSnapshot(store.getConfirmedSnapshot(), sceneId, placementId);
      if (latest) {
        applyConfirmedPlacement(sceneId, placementId, latest, { source: 'rejected' });
      }
      throw error;
    }
  }

  async function submitMoves(sceneId, moves) {
    for (const move of moves ?? []) {
      const placementId = String(move?.placementId ?? move?.id ?? '').trim();
      if (!placementId) continue;
      const current = getEffectivePlacement(sceneId, placementId) ?? {};
      const preview = { ...current, ...move, id: placementId };
      pendingPreview.set(`${sceneId}:${placementId}`, preview);
      previewPlacement(sceneId, placementId, preview);
    }
    await start();
    const results = [];
    for (const move of moves ?? []) {
      results.push(await submitOne(sceneId, move));
    }
    return results;
  }

  function overlayBoardState(boardState) {
    if (!boardState || typeof boardState !== 'object') return boardState;
    const snapshot = store.getConfirmedSnapshot();
    for (const [sceneId, placements] of Object.entries(snapshot?.state?.placements ?? {})) {
      const target = boardState?.placements?.[sceneId];
      if (!Array.isArray(target)) continue;
      for (const placement of target) {
        const canonical = placements?.[placement?.id];
        if (!canonical) continue;
        placement.column = canonical.column;
        placement.row = canonical.row;
        placement._syncV2EntityRevision = canonical._entityRevision;
      }
    }
    return boardState;
  }

  function getEffectivePlacement(sceneId, placementId) {
    return pendingPreview.get(`${sceneId}:${placementId}`)
      ?? placementFromSnapshot(store.getConfirmedSnapshot(), sceneId, placementId);
  }

  return {
    enabled: true,
    start,
    stop,
    submitMoves,
    overlayBoardState,
    getEffectivePlacement,
    getRevision: () => store.getRevision(),
    __testing: { store, eventStream, pendingPreview, pusherTransport },
  };
}
