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
    pings: false,
    levels: false,
    grid: false,
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

function getSceneCollection(state, domain, sceneId) {
  const collection = state[domain] && typeof state[domain] === 'object'
    ? { ...state[domain] }
    : {};
  const sceneCollection = collection[sceneId] && typeof collection[sceneId] === 'object'
    ? { ...collection[sceneId] }
    : {};
  collection[sceneId] = sceneCollection;
  state[domain] = collection;
  return sceneCollection;
}

function requireSceneAndEntity(event) {
  const sceneId = typeof event.sceneId === 'string' ? event.sceneId.trim() : '';
  const entityId = typeof event.entityId === 'string' ? event.entityId.trim() : '';
  if (!sceneId || !entityId) {
    throw new Error(`${event.type} requires sceneId and entityId`);
  }
  return { sceneId, entityId };
}

function requireIncreasingEntityRevision(current, event) {
  const currentEntityRevision = Number(current?._entityRevision) || 0;
  const nextEntityRevision = Number(event.entityRevision);
  if (!Number.isSafeInteger(nextEntityRevision) || nextEntityRevision <= currentEntityRevision) {
    throw new Error(`${event.type} entity revision must increase`);
  }
  return nextEntityRevision;
}

function reduceTokenMoved(state, event, changes) {
  const { sceneId, entityId } = requireSceneAndEntity(event);
  const placements = getSceneCollection(state, 'placements', sceneId);
  const current = placements[entityId];
  if (!current || typeof current !== 'object') {
    throw new Error('token.moved references an unknown placement');
  }
  const nextEntityRevision = requireIncreasingEntityRevision(current, event);
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

function pushUnique(target, value) {
  if (!target.includes(value)) target.push(value);
}

function reducePlacementBatch(state, event, changes) {
  const mutations = event.payload?.mutations;
  if (!Array.isArray(mutations)) {
    throw new Error('placement.batchApplied requires mutations');
  }
  for (const mutation of mutations) {
    const sceneId = typeof mutation?.sceneId === 'string' ? mutation.sceneId.trim() : '';
    const placementId =
      typeof mutation?.placementId === 'string' ? mutation.placementId.trim() : '';
    if (!sceneId || !placementId) {
      throw new Error('Placement mutation requires sceneId and placementId');
    }
    if (mutation.kind === 'claim.set' || mutation.kind === 'claim.clear') {
      const claims = getSceneCollection(state, 'claims', sceneId);
      if (mutation.kind === 'claim.set') {
        claims[placementId] = String(mutation.owner ?? '');
      } else {
        delete claims[placementId];
      }
      changes.claims = true;
      continue;
    }
    const placements = getSceneCollection(state, 'placements', sceneId);
    const current = placements[placementId];
    if (mutation.kind === 'remove') {
      // A player projection may receive a remove for a token that was hidden
      // before this client joined. Treat that as an idempotent no-op.
      if (current) {
        delete placements[placementId];
        pushUnique(changes.placements.removed, placementId);
      }
      const claims = getSceneCollection(state, 'claims', sceneId);
      delete claims[placementId];
      continue;
    }
    if (mutation.kind !== 'upsert' || !mutation.placement || typeof mutation.placement !== 'object') {
      throw new Error('Unsupported placement mutation');
    }
    const entityRevision = Number(mutation.entityRevision);
    if (!Number.isSafeInteger(entityRevision) || entityRevision < 1) {
      throw new Error('Placement upsert requires a positive entity revision');
    }
    if (current && entityRevision <= (Number(current._entityRevision) || 0)) {
      throw new Error('Placement upsert entity revision must increase');
    }
    placements[placementId] = {
      ...clone(mutation.placement),
      id: placementId,
      _entityRevision: entityRevision,
    };
    pushUnique(
      current ? changes.placements.updated : changes.placements.added,
      placementId
    );
  }
}

function reduceTokenAdded(state, event, changes) {
  const { sceneId, entityId } = requireSceneAndEntity(event);
  const placements = getSceneCollection(state, 'placements', sceneId);
  if (placements[entityId]) {
    throw new Error('token.added references an existing placement');
  }
  const placement = event.payload?.placement;
  if (!placement || typeof placement !== 'object') {
    throw new Error('token.added requires a placement payload');
  }
  const entityRevision = Number(event.entityRevision);
  if (!Number.isSafeInteger(entityRevision) || entityRevision < 1) {
    throw new Error('token.added requires a positive entity revision');
  }
  placements[entityId] = {
    ...clone(placement),
    id: entityId,
    _entityRevision: entityRevision,
  };
  changes.placements.added.push(entityId);
}

function reduceTokenRemoved(state, event, changes) {
  const { sceneId, entityId } = requireSceneAndEntity(event);
  const placements = getSceneCollection(state, 'placements', sceneId);
  const current = placements[entityId];
  if (!current || typeof current !== 'object') {
    throw new Error('token.removed references an unknown placement');
  }
  requireIncreasingEntityRevision(current, event);
  delete placements[entityId];
  changes.placements.removed.push(entityId);
}

function reduceTokenField(state, event, changes, field, normalize) {
  const { sceneId, entityId } = requireSceneAndEntity(event);
  const placements = getSceneCollection(state, 'placements', sceneId);
  const current = placements[entityId];
  if (!current || typeof current !== 'object') {
    throw new Error(`${event.type} references an unknown placement`);
  }
  const nextEntityRevision = requireIncreasingEntityRevision(current, event);
  placements[entityId] = {
    ...current,
    [field]: normalize(event.payload?.[field]),
    _entityRevision: nextEntityRevision,
  };
  changes.placements.updated.push(entityId);
}

function reduceCombatEvent(state, event, changes) {
  const sceneId = typeof event.sceneId === 'string' ? event.sceneId.trim() : '';
  if (!sceneId) {
    throw new Error(`${event.type} requires sceneId`);
  }
  const combatByScene = state.combat && typeof state.combat === 'object'
    ? { ...state.combat }
    : {};
  const current = combatByScene[sceneId] && typeof combatByScene[sceneId] === 'object'
    ? combatByScene[sceneId]
    : {};
  combatByScene[sceneId] = {
    ...current,
    ...clone(event.payload),
    _revision: event.revision,
  };
  state.combat = combatByScene;
  changes.combat = true;
}

function reduceCombatTransitioned(state, event, changes) {
  const sceneId = typeof event.sceneId === 'string' ? event.sceneId.trim() : '';
  const combat = event.payload?.combat;
  if (!sceneId || !combat || typeof combat !== 'object') {
    throw new Error('combat.transitioned requires sceneId and combat');
  }
  const combatByScene = state.combat && typeof state.combat === 'object'
    ? { ...state.combat }
    : {};
  combatByScene[sceneId] = clone(combat);
  state.combat = combatByScene;
  changes.combat = true;
}

function reduceSceneEntityUpsert(state, event, changes, domain, changeKey, payloadKey) {
  const { sceneId, entityId } = requireSceneAndEntity(event);
  const entities = getSceneCollection(state, domain, sceneId);
  const payload = event.payload?.[payloadKey];
  if (!payload || typeof payload !== 'object') {
    throw new Error(`${event.type} requires ${payloadKey}`);
  }
  const current = entities[entityId];
  const entityRevision = Number(event.entityRevision);
  if (
    !Number.isSafeInteger(entityRevision)
    || entityRevision < 1
    || (
      current
      && entityRevision <= (Number(current._entityRevision) || 0)
    )
  ) {
    throw new Error(`${event.type} entity revision must increase`);
  }
  entities[entityId] = {
    ...clone(payload),
    id: entityId,
    _entityRevision: entityRevision,
  };
  changes[changeKey] = true;
}

function reduceSceneEntityRemove(state, event, changes, domain, changeKey) {
  const { sceneId, entityId } = requireSceneAndEntity(event);
  const entities = getSceneCollection(state, domain, sceneId);
  const current = entities[entityId];
  if (!current || typeof current !== 'object') {
    throw new Error(`${event.type} references an unknown entity`);
  }
  requireIncreasingEntityRevision(current, event);
  delete entities[entityId];
  changes[changeKey] = true;
}

function reduceFogPatched(state, event, changes) {
  const sceneId = typeof event.sceneId === 'string' ? event.sceneId.trim() : '';
  if (!sceneId || !event.payload || typeof event.payload !== 'object') {
    throw new Error('fog.patched requires sceneId and payload');
  }
  const fog = state.fog && typeof state.fog === 'object' ? { ...state.fog } : {};
  fog[sceneId] = {
    ...(fog[sceneId] && typeof fog[sceneId] === 'object' ? fog[sceneId] : {}),
    ...clone(event.payload),
    _revision: event.revision,
  };
  state.fog = fog;
  changes.fog = true;
}

function reduceFogReplaced(state, event, changes) {
  const sceneId = typeof event.sceneId === 'string' ? event.sceneId.trim() : '';
  const fogOfWar = event.payload?.fogOfWar;
  if (!sceneId || !fogOfWar || typeof fogOfWar !== 'object') {
    throw new Error('fog.replaced requires sceneId and fogOfWar');
  }
  const sceneConfig = state.sceneConfig && typeof state.sceneConfig === 'object'
    ? { ...state.sceneConfig }
    : {};
  sceneConfig[sceneId] = {
    ...(sceneConfig[sceneId] ?? {}),
    fogOfWar: clone(fogOfWar),
    _revision: Number(event.entityRevision) || event.revision,
  };
  state.sceneConfig = sceneConfig;
  changes.fog = true;
}

function reduceSceneConfigField(state, event, changes, field, payloadKey, changeKey) {
  const sceneId = typeof event.sceneId === 'string' ? event.sceneId.trim() : '';
  const value = event.payload?.[payloadKey];
  if (!sceneId || !value || typeof value !== 'object') {
    throw new Error(`${event.type} requires sceneId and ${payloadKey}`);
  }
  const sceneConfig = state.sceneConfig && typeof state.sceneConfig === 'object'
    ? { ...state.sceneConfig }
    : {};
  sceneConfig[sceneId] = {
    ...(sceneConfig[sceneId] ?? {}),
    [field]: clone(value),
    _revision: Number(event.entityRevision) || event.revision,
  };
  state.sceneConfig = sceneConfig;
  changes[changeKey] = true;
}

function reduceUserLevelChanged(state, event, changes) {
  const sceneId = typeof event.sceneId === 'string' ? event.sceneId.trim() : '';
  const userId = typeof event.payload?.userId === 'string' ? event.payload.userId.trim() : '';
  const entry = event.payload?.entry;
  if (!sceneId || !userId || !entry || typeof entry !== 'object') {
    throw new Error('level.userChanged requires sceneId, userId, and entry');
  }
  const sceneConfig = state.sceneConfig && typeof state.sceneConfig === 'object'
    ? { ...state.sceneConfig }
    : {};
  const current = sceneConfig[sceneId] ?? {};
  sceneConfig[sceneId] = {
    ...current,
    userLevelState: {
      ...(current.userLevelState ?? {}),
      [userId]: clone(entry),
    },
    _revision: Number(event.entityRevision) || event.revision,
  };
  state.sceneConfig = sceneConfig;
  changes.levels = true;
}

function reduceLevelActivated(state, event, changes) {
  const sceneId = typeof event.sceneId === 'string' ? event.sceneId.trim() : '';
  const userLevelState = event.payload?.userLevelState;
  if (!sceneId || !userLevelState || typeof userLevelState !== 'object') {
    throw new Error('level.activated requires sceneId and userLevelState');
  }
  const sceneConfig = state.sceneConfig && typeof state.sceneConfig === 'object'
    ? { ...state.sceneConfig }
    : {};
  sceneConfig[sceneId] = {
    ...(sceneConfig[sceneId] ?? {}),
    userLevelState: clone(userLevelState),
    _revision: Number(event.entityRevision) || event.revision,
  };
  state.sceneConfig = sceneConfig;
  changes.levels = true;
}

function reducePingAdded(state, event, changes) {
  const ping = event.payload?.ping;
  const entityId = typeof event.entityId === 'string' ? event.entityId.trim() : '';
  if (!entityId || !ping || typeof ping !== 'object') {
    throw new Error('ping.added requires entityId and ping');
  }
  state.pings = { ...(state.pings ?? {}), [entityId]: clone(ping) };
  changes.pings = true;
}

function reduceRoutingChanged(state, event, changes) {
  const routing = event.payload?.routing;
  if (!routing || typeof routing !== 'object') {
    throw new Error('routing.changed requires routing');
  }
  state.routing = clone(routing);
  changes.sceneRouting = true;
}

function reduceLevelChanged(state, event, changes) {
  const sceneId = typeof event.sceneId === 'string' ? event.sceneId.trim() : '';
  if (!sceneId) {
    throw new Error('level.changed requires sceneId');
  }
  const levels = state.levels && typeof state.levels === 'object' ? { ...state.levels } : {};
  levels[sceneId] = {
    ...(levels[sceneId] && typeof levels[sceneId] === 'object' ? levels[sceneId] : {}),
    ...clone(event.payload),
    _revision: event.revision,
  };
  state.levels = levels;
  changes.levels = true;
}

function reduceSceneActivated(state, event, changes) {
  const sceneId = typeof event.sceneId === 'string' ? event.sceneId.trim() : '';
  if (!sceneId) {
    throw new Error('scene.activated requires sceneId');
  }
  state.routing = {
    ...(state.routing ?? {}),
    ...(event.payload?.routing ?? {}),
    activeSceneId: sceneId,
  };
  changes.sceneRouting = true;
}

const reducers = Object.freeze({
  'sync.redacted': () => {},
  'shadow.observed': reduceShadowObservation,
  'token.added': reduceTokenAdded,
  'token.moved': reduceTokenMoved,
  'token.removed': reduceTokenRemoved,
  'token.staminaChanged': (state, event, changes) =>
    reduceTokenField(state, event, changes, 'stamina', (value) => {
      const stamina = Number(value);
      if (!Number.isFinite(stamina)) {
        throw new Error('token.staminaChanged requires numeric stamina');
      }
      return stamina;
    }),
  'token.conditionsChanged': (state, event, changes) =>
    reduceTokenField(state, event, changes, 'conditions', (value) => {
      if (!Array.isArray(value)) {
        throw new Error('token.conditionsChanged requires a conditions array');
      }
      return clone(value);
    }),
  'placement.batchApplied': reducePlacementBatch,
  'combat.transitioned': reduceCombatTransitioned,
  'combat.automationClaimed': () => {},
  'turn.started': reduceCombatEvent,
  'turn.completed': reduceCombatEvent,
  'template.updated': (state, event, changes) =>
    reduceSceneEntityUpsert(state, event, changes, 'templates', 'templates', 'template'),
  'template.removed': (state, event, changes) =>
    reduceSceneEntityRemove(state, event, changes, 'templates', 'templates'),
  'drawing.added': (state, event, changes) =>
    reduceSceneEntityUpsert(state, event, changes, 'drawings', 'drawings', 'drawing'),
  'drawing.updated': (state, event, changes) =>
    reduceSceneEntityUpsert(state, event, changes, 'drawings', 'drawings', 'drawing'),
  'drawing.removed': (state, event, changes) =>
    reduceSceneEntityRemove(state, event, changes, 'drawings', 'drawings'),
  'fog.patched': reduceFogPatched,
  'fog.replaced': reduceFogReplaced,
  'level.changed': reduceLevelChanged,
  'levels.replaced': (state, event, changes) =>
    reduceSceneConfigField(state, event, changes, 'mapLevels', 'mapLevels', 'levels'),
  'level.userChanged': reduceUserLevelChanged,
  'level.activated': reduceLevelActivated,
  'grid.changed': (state, event, changes) =>
    reduceSceneConfigField(state, event, changes, 'grid', 'grid', 'grid'),
  'ping.added': reducePingAdded,
  'scene.activated': reduceSceneActivated,
  'routing.changed': reduceRoutingChanged,
});

/**
 * Pure canonical event reducer. It never mutates the input snapshot.
 */
export function reduceCanonicalEvent(currentSnapshot, event) {
  const current = {
    revision:
      Number.isSafeInteger(Number(currentSnapshot?.revision))
      && Number(currentSnapshot.revision) >= 0
        ? Number(currentSnapshot.revision)
        : 0,
    state:
      currentSnapshot?.state && typeof currentSnapshot.state === 'object'
        ? currentSnapshot.state
        : {},
    appliedOperationIds: Array.isArray(currentSnapshot?.appliedOperationIds)
      ? currentSnapshot.appliedOperationIds
      : [],
  };
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

  const state = { ...current.state };
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
