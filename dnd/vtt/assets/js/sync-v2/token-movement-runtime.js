import { createEntityStore } from './entity-store.js';
import { createEventStream, createPusherEventTransport } from './event-stream.js';
import { createRecoveryClient } from './recovery-client.js';
import { createCommandClient } from './command-client.js';

function clone(value) {
  return JSON.parse(JSON.stringify(value ?? {}));
}

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
  placementsEnabled = false,
  combatEnabled = false,
  boardDomainsEnabled = false,
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
  applyConfirmedPlacementBatch = () => {},
  applyConfirmedCombat = () => {},
  applyConfirmedBoardDomain = () => {},
  reconcileSnapshot = () => {},
  onError = (error) => console.warn('[VTT Sync V2] Token movement failed', error),
} = {}) {
  if (!enabled) {
    return {
      enabled: false,
      start: async () => false,
      stop: () => {},
      submitMoves: async () => [],
      submitPlacementOps: async () => null,
      submitCombatCommand: async () => null,
      submitBoardDomainCommands: async () => [],
      claimCombatAutomation: async () => null,
      overlayBoardState: (boardState) => boardState,
      getEffectivePlacement: () => null,
      getConfirmedSnapshot: () => ({ revision: 0, state: {} }),
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
      if (
        context?.event?.type === 'placement.batchApplied'
        && (
          changeSet?.placements?.added?.length
          || changeSet?.placements?.updated?.length
          || changeSet?.placements?.removed?.length
          || changeSet?.claims
        )
      ) {
        applyConfirmedPlacementBatch(
          store.getConfirmedSnapshot(),
          context.event.payload?.mutations ?? [],
          context
        );
      }
      if (changeSet?.combat && context?.event?.type === 'combat.transitioned') {
        applyConfirmedCombat(
          store.getConfirmedSnapshot(),
          context.event.payload?.combat ?? null,
          context.event.payload?.transition ?? null,
          context
        );
      }
      if (
        changeSet?.templates
        || changeSet?.drawings
        || changeSet?.pings
        || changeSet?.fog
        || changeSet?.levels
        || changeSet?.grid
        || changeSet?.sceneRouting
      ) {
        applyConfirmedBoardDomain(
          store.getConfirmedSnapshot(),
          changeSet,
          context
        );
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
    if (placementsEnabled && (moves?.length ?? 0) > 1) {
      const result = await submitPlacementOps(
        moves.map((move) => ({
          type: 'placement.move',
          sceneId,
          placementId: String(move?.placementId ?? move?.id ?? '').trim(),
          column: Number(move?.column),
          row: Number(move?.row),
        }))
      );
      return [result];
    }
    const results = [];
    for (const move of moves ?? []) {
      results.push(await submitOne(sceneId, move));
    }
    return results;
  }

  function legacyOpsToActions(ops) {
    const actions = [];
    const patchIndex = new Map();
    for (const op of ops ?? []) {
      const sceneId = String(op?.sceneId ?? '').trim();
      const placementId = String(op?.placementId ?? op?.placement?.id ?? '').trim();
      if (!sceneId || !placementId) continue;
      const current = placementFromSnapshot(store.getConfirmedSnapshot(), sceneId, placementId);
      if (op.type === 'placement.add') {
        actions.push({
          kind: 'add',
          sceneId,
          placementId,
          placement: { ...(op.placement ?? {}), id: placementId },
        });
      } else if (op.type === 'placement.remove') {
        actions.push({
          kind: 'remove',
          sceneId,
          placementId,
          entityRevision: Number(current?._entityRevision) || 0,
        });
      } else if (op.type === 'placement.update' || op.type === 'placement.move') {
        const patch = op.type === 'placement.move'
          ? { column: Number(op.column), row: Number(op.row) }
          : { ...(op.patch ?? {}) };
        const key = `${sceneId}:${placementId}`;
        const existingIndex = patchIndex.get(key);
        if (Number.isInteger(existingIndex) && actions[existingIndex]?.kind === 'patch') {
          actions[existingIndex].patch = { ...actions[existingIndex].patch, ...patch };
        } else {
          patchIndex.set(key, actions.length);
          actions.push({
            kind: 'patch',
            sceneId,
            placementId,
            patch,
            entityRevision: Number(current?._entityRevision) || 0,
          });
        }
      } else if (op.type === 'claim.set') {
        actions.push({
          kind: 'claim.set',
          sceneId,
          placementId,
          owner: op.userId ?? op.owner ?? null,
        });
      } else if (op.type === 'claim.clear') {
        actions.push({ kind: 'claim.clear', sceneId, placementId });
      }
    }
    return actions;
  }

  async function submitPlacementOps(ops, retry = true) {
    if (!placementsEnabled) return null;
    await start();
    const actions = legacyOpsToActions(ops);
    if (!actions.length) return null;
    try {
      return await commandClient.submit('placement.batch', { actions });
    } catch (error) {
      const conflictSnapshot = error?.response?.snapshot;
      if (retry && error?.status === 409 && conflictSnapshot) {
        store.replaceSnapshot(conflictSnapshot, { authoritative: true, source: 'conflict' });
        reconcileSnapshot(store.getConfirmedSnapshot(), { source: 'conflict' });
        return submitPlacementOps(ops, false);
      }
      reconcileSnapshot(store.getConfirmedSnapshot(), { source: 'rejected' });
      throw error;
    }
  }

  async function submitCombatCommand(type, sceneId, payload = {}) {
    if (!combatEnabled) return null;
    if (!sceneId) {
      throw new TypeError('A combat command requires sceneId');
    }
    await start();
    try {
      return await commandClient.submit(type, payload, { sceneId });
    } catch (error) {
      const conflictSnapshot = error?.response?.snapshot;
      if (error?.status === 409 && conflictSnapshot) {
        store.replaceSnapshot(conflictSnapshot, { authoritative: true, source: 'conflict' });
        reconcileSnapshot(store.getConfirmedSnapshot(), { source: 'conflict' });
      }
      throw error;
    }
  }

  function boardDomainEntityRevision(type, sceneId, entityId) {
    const state = store.getConfirmedSnapshot()?.state ?? {};
    if (type.startsWith('template.')) {
      return Number(state.templates?.[sceneId]?.[entityId]?._entityRevision) || 0;
    }
    if (type.startsWith('drawing.')) {
      return Number(state.drawings?.[sceneId]?.[entityId]?._entityRevision) || 0;
    }
    if (
      type === 'fog.set'
      || type === 'levels.set'
      || type === 'level.user.set'
      || type === 'level.activate'
      || type === 'grid.set'
    ) {
      return Number(state.sceneConfig?.[sceneId]?._revision) || 0;
    }
    if (type === 'scene.activate' || type === 'routing.set') {
      return Number(state.routing?._revision) || 0;
    }
    return 0;
  }

  async function submitBoardDomainCommands(commands, retry = true) {
    if (!boardDomainsEnabled || !Array.isArray(commands) || commands.length === 0) {
      return [];
    }
    await start();
    const results = [];
    for (const descriptor of commands) {
      const type = String(descriptor?.type ?? '');
      const sceneId = descriptor?.sceneId ?? null;
      const entityId = descriptor?.entityId ?? null;
      try {
        results.push(await commandClient.submit(
          type,
          descriptor?.payload ?? {},
          {
            sceneId,
            entityId,
            entityRevision: boardDomainEntityRevision(type, sceneId, entityId),
          }
        ));
      } catch (error) {
        const conflictSnapshot = error?.response?.snapshot;
        const retryableSharedConfig = new Set([
          'fog.set', 'levels.set', 'level.user.set', 'level.activate',
          'grid.set', 'scene.activate', 'routing.set',
        ]);
        if (error?.status === 409 && conflictSnapshot) {
          store.replaceSnapshot(conflictSnapshot, { authoritative: true, source: 'conflict' });
          reconcileSnapshot(store.getConfirmedSnapshot(), { source: 'conflict' });
        }
        if (
          retry
          && error?.status === 409
          && conflictSnapshot
          && retryableSharedConfig.has(type)
        ) {
          return [
            ...results,
            ...await submitBoardDomainCommands(commands.slice(results.length), false),
          ];
        }
        throw error;
      }
    }
    return results;
  }

  function automationClaimOperationId(transitionOperationId) {
    const direct = `combat-automation:${transitionOperationId}`;
    if (direct.length <= 128) return direct;
    let first = 2166136261;
    let second = 2246822519;
    for (let index = 0; index < transitionOperationId.length; index += 1) {
      const code = transitionOperationId.charCodeAt(index);
      first = Math.imul(first ^ code, 16777619) >>> 0;
      second = Math.imul(second ^ code, 3266489917) >>> 0;
    }
    return `combat-automation:${first.toString(16)}${second.toString(16)}`;
  }

  async function claimCombatAutomation(sceneId, transitionOperationId) {
    if (!combatEnabled) return null;
    const target = String(transitionOperationId ?? '').trim();
    if (!sceneId || !target) {
      throw new TypeError('A combat automation claim requires sceneId and transition operation ID');
    }
    await start();
    return commandClient.submit(
      'combat.automation.claim',
      { transitionOperationId: target },
      {
        sceneId,
        operationId: automationClaimOperationId(target),
      }
    );
  }

  function overlayBoardState(boardState) {
    if (!boardState || typeof boardState !== 'object') return boardState;
    const snapshot = store.getConfirmedSnapshot();
    boardState.placements =
      boardState.placements && typeof boardState.placements === 'object'
        ? boardState.placements
        : {};
    for (const [sceneId, placements] of Object.entries(snapshot?.state?.placements ?? {})) {
      boardState.placements[sceneId] = Object.values(placements ?? {}).map((placement) => ({
        ...placement,
        _syncV2EntityRevision: placement._entityRevision,
      }));
    }
    boardState.sceneState =
      boardState.sceneState && typeof boardState.sceneState === 'object'
        ? boardState.sceneState
        : {};
    for (const [sceneId, claims] of Object.entries(snapshot?.state?.claims ?? {})) {
      boardState.sceneState[sceneId] =
        boardState.sceneState[sceneId] && typeof boardState.sceneState[sceneId] === 'object'
          ? boardState.sceneState[sceneId]
          : {};
      boardState.sceneState[sceneId].claimedTokens = { ...(claims ?? {}) };
    }
    for (const [sceneId, combat] of Object.entries(snapshot?.state?.combat ?? {})) {
      boardState.sceneState[sceneId] =
        boardState.sceneState[sceneId] && typeof boardState.sceneState[sceneId] === 'object'
          ? boardState.sceneState[sceneId]
          : {};
      boardState.sceneState[sceneId].combat = clone(combat);
    }
    for (const [sceneId, templates] of Object.entries(snapshot?.state?.templates ?? {})) {
      boardState.templates = boardState.templates && typeof boardState.templates === 'object'
        ? boardState.templates
        : {};
      boardState.templates[sceneId] = Object.values(templates ?? {}).map((entry) => clone(entry));
    }
    for (const [sceneId, drawings] of Object.entries(snapshot?.state?.drawings ?? {})) {
      boardState.drawings = boardState.drawings && typeof boardState.drawings === 'object'
        ? boardState.drawings
        : {};
      boardState.drawings[sceneId] = Object.values(drawings ?? {}).map((entry) => clone(entry));
    }
    if (snapshot?.state?.pings && typeof snapshot.state.pings === 'object') {
      boardState.pings = Object.values(snapshot.state.pings).map((entry) => clone(entry));
    }
    for (const [sceneId, config] of Object.entries(snapshot?.state?.sceneConfig ?? {})) {
      boardState.sceneState[sceneId] =
        boardState.sceneState[sceneId] && typeof boardState.sceneState[sceneId] === 'object'
          ? boardState.sceneState[sceneId]
          : {};
      for (const field of ['grid', 'fogOfWar', 'mapLevels', 'userLevelState']) {
        if (Object.prototype.hasOwnProperty.call(config ?? {}, field)) {
          boardState.sceneState[sceneId][field] = clone(config[field]);
        }
      }
    }
    for (const [field, value] of Object.entries(snapshot?.state?.routing ?? {})) {
      if (!field.startsWith('_')) boardState[field] = clone(value);
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
    submitPlacementOps,
    submitCombatCommand,
    submitBoardDomainCommands,
    claimCombatAutomation,
    overlayBoardState,
    getEffectivePlacement,
    getConfirmedSnapshot: () => store.getSnapshot(),
    getRevision: () => store.getRevision(),
    __testing: { store, eventStream, pendingPreview, pusherTransport },
  };
}
