import { normalizeEntitySnapshot } from './entity-store.js';

const APPLIED_OPERATION_LIMIT = 2000;

function clone(value) {
  return JSON.parse(JSON.stringify(value ?? {}));
}

function validRevision(value) {
  return Number.isSafeInteger(Number(value)) && Number(value) > 0;
}

function appendAppliedOperation(ids, operationId) {
  if (!operationId || ids.includes(operationId)) {
    return ids;
  }
  return [...ids, operationId].slice(-APPLIED_OPERATION_LIMIT);
}

function emptyChangeSet(revision) {
  return {
    revision,
    placements: { added: [], updated: [], removed: [] },
    combat: false,
    fog: false,
    templates: false,
    drawings: false,
    sceneRouting: false,
    shadow: false,
  };
}

function reduceShadowObservation(state, event, changes) {
  const shadow = state.shadow && typeof state.shadow === 'object'
    ? clone(state.shadow)
    : { mode: 'shadow', observations: [] };
  const observations = Array.isArray(shadow.observations) ? shadow.observations.slice() : [];
  observations.push({
    revision: event.revision,
    operationId: event.operationId,
    actorId: event.actorId ?? null,
    sceneId: event.sceneId ?? null,
    entityId: event.entityId ?? null,
    payload: clone(event.payload),
    serverTime: event.serverTime ?? null,
  });
  state.shadow = {
    ...shadow,
    mode: 'shadow',
    observations: observations.slice(-200),
  };
  changes.shadow = true;
}

function getScenePlacements(state, sceneId) {
  const placements = state.placements && typeof state.placements === 'object'
    ? { ...state.placements }
    : {};
  const scenePlacements = placements[sceneId] && typeof placements[sceneId] === 'object'
    ? { ...placements[sceneId] }
    : {};
  placements[sceneId] = scenePlacements;
  state.placements = placements;
  return scenePlacements;
}

function reduceTokenMoved(state, event, changes) {
  const sceneId = typeof event.sceneId === 'string' ? event.sceneId : '';
  const entityId = typeof event.entityId === 'string' ? event.entityId : '';
  if (!sceneId || !entityId) {
    throw new Error('token.moved requires sceneId and entityId');
  }
  const placements = getScenePlacements(state, sceneId);
  const current = placements[entityId];
  if (!current || typeof current !== 'object') {
    throw new Error('token.moved references an unknown placement');
  }
  const currentEntityRevision = Number(current._entityRevision) || 0;
  const nextEntityRevision = Number(event.entityRevision);
  if (!Number.isSafeInteger(nextEntityRevision) || nextEntityRevision <= currentEntityRevision) {
    throw new Error('token.moved entity revision must increase');
  }
  const column = Number(event.payload?.column);
  const row = Number(event.payload?.row);
  if (!Number.isFinite(column) || !Number.isFinite(row)) {
    throw new Error('token.moved requires numeric column and row');
  }
  placements[entityId] = {
    ...current,
    column,
    row,
    _entityRevision: nextEntityRevision,
  };
  changes.placements.updated.push(entityId);
}

const reducers = Object.freeze({
  'shadow.observed': reduceShadowObservation,
  'token.moved': reduceTokenMoved,
});

/**
 * Pure canonical event reducer. It never mutates the input snapshot.
 */
export function reduceCanonicalEvent(currentSnapshot, event) {
  const current = normalizeEntitySnapshot(currentSnapshot);
  if (!event || typeof event !== 'object' || !validRevision(event.revision)) {
    return { status: 'invalid', reason: 'invalid_event', snapshot: current };
  }

  const revision = Number(event.revision);
  const operationId = typeof event.operationId === 'string' ? event.operationId : '';
  if (operationId && current.appliedOperationIds.includes(operationId)) {
    return { status: 'duplicate', snapshot: current, changeSet: emptyChangeSet(current.revision) };
  }
  if (revision <= current.revision) {
    return { status: 'stale', snapshot: current, changeSet: emptyChangeSet(current.revision) };
  }
  if (revision !== current.revision + 1) {
    return {
      status: 'gap',
      expectedRevision: current.revision + 1,
      receivedRevision: revision,
      snapshot: current,
    };
  }

  const reducer = reducers[event.type];
  if (typeof reducer !== 'function') {
    return {
      status: 'invalid',
      reason: 'unsupported_event_type',
      snapshot: current,
    };
  }

  const state = clone(current.state);
  const changeSet = emptyChangeSet(revision);
  try {
    reducer(state, event, changeSet);
  } catch (error) {
    return {
      status: 'invalid',
      reason: error instanceof Error ? error.message : 'event_reducer_failed',
      snapshot: current,
    };
  }

  return {
    status: 'applied',
    snapshot: {
      revision,
      state,
      appliedOperationIds: appendAppliedOperation(
        current.appliedOperationIds,
        operationId
      ),
    },
    changeSet,
  };
}
