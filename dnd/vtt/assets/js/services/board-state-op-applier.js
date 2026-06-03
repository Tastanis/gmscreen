/**
 * Phase 3-C: Client-side delta op applier.
 *
 * Mirrors `applyBoardStateOp()` in `dnd/vtt/api/state.php` so a Pusher
 * broadcast carrying `{type: 'ops', ops: [...]}` can be applied to the
 * local board state without re-fetching the full state from
 * `api/state.php`.
 *
 * Each function mutates the passed-in `boardState` object in place. The
 * caller is expected to wrap calls in `boardApi.updateState((draft) => …)`
 * (which uses Immer-style mutation under the hood) so the mutations
 * become a single committed state transition.
 *
 * Op shapes:
 *   { type: 'placement.move',     sceneId, placementId, x, y }
 *   { type: 'placement.add',      sceneId, placement: { id, ... } }
 *   { type: 'placement.remove',   sceneId, placementId }
 *   { type: 'placement.update',   sceneId, placementId, patch: { ... } }
 *   { type: 'template.upsert',    sceneId, template: { id, ... } }
 *   { type: 'template.remove',    sceneId, templateId }
 *   { type: 'drawing.add',        sceneId, drawing:  { id, ... } }
 *   { type: 'drawing.remove',     sceneId, drawingId }
 *   { type: 'claim.set',          sceneId, placementId, userId }
 *   { type: 'claim.clear',        sceneId, placementId }
 *   { type: 'user-level.set',     sceneId, userId, levelId, source?, tokenId? }
 *   { type: 'user-level.activate',sceneId, levelId, userIds: [...] }
 *   { type: 'combat.set',         sceneId, combat: { active, round, ... } }
 *
 * Unknown or malformed ops are silently ignored — the function returns
 * the boardState unchanged for that op. This matches the server's
 * tolerance for ops it can't apply and protects clients on older
 * builds from getting stuck on a payload they don't understand.
 */

/**
 * Apply a single op to a board state object in place.
 *
 * @param {object} boardState - Mutable board state object (the `boardState`
 *   slice of the store, not the wrapping container).
 * @param {object} op - The op to apply.
 * @returns {boolean} True if the op caused a state change, false otherwise.
 */
export function applyBoardStateOpLocally(boardState, op) {
  if (!boardState || typeof boardState !== 'object') {
    return false;
  }
  if (!op || typeof op !== 'object') {
    return false;
  }
  const type = typeof op.type === 'string' ? op.type : '';
  if (!type) {
    return false;
  }
  const sceneId = extractSceneId(op);
  if (!sceneId) {
    return false;
  }

  if (type === 'placement.move') {
    const placementId = extractOpEntityId(op, 'placementId');
    if (!placementId) return false;
    const x = Number(op.x);
    const y = Number(op.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    const list = boardState?.placements?.[sceneId];
    if (!Array.isArray(list)) return false;
    for (let i = 0; i < list.length; i++) {
      const entry = list[i];
      if (!entry || typeof entry !== 'object') continue;
      if (entry.id !== placementId) continue;
      // The wire format uses x/y for coordinates, but the canonical
      // placement record stores column/row. Mirror the server.
      entry.column = x;
      entry.row = y;
      // The server stamps `_lastModified` so timestamp-based merges
      // downstream treat the move as newer than any in-flight stale
      // payload. Mirror that locally too — without it, a polling
      // response that arrived just before this Pusher broadcast could
      // win the timestamp tie and snap the token back.
      entry._lastModified = Date.now();
      return true;
    }
    return false;
  }

  if (type === 'placement.add') {
    if (!op.placement || typeof op.placement !== 'object') return false;
    const placementId = entryId(op.placement);
    if (!placementId) return false;
    if (!boardState.placements || typeof boardState.placements !== 'object') {
      boardState.placements = {};
    }
    if (!Array.isArray(boardState.placements[sceneId])) {
      boardState.placements[sceneId] = [];
    }
    // Clone to avoid sharing the broadcast object across the store.
    const next = { ...op.placement, _lastModified: Date.now() };
    const list = boardState.placements[sceneId];
    for (let i = 0; i < list.length; i++) {
      const existing = list[i];
      if (existing && typeof existing === 'object' && entryId(existing) === placementId) {
        list[i] = next;
        return true;
      }
    }
    list.push(next);
    return true;
  }

  if (type === 'placement.remove') {
    const placementId = extractOpEntityId(op, 'placementId');
    if (!placementId) return false;
    const list = boardState?.placements?.[sceneId];
    if (!Array.isArray(list)) return false;
    const filtered = list.filter((entry) => {
      if (!entry || typeof entry !== 'object') return true;
      return entryId(entry) !== placementId;
    });
    if (filtered.length === list.length) return false;
    boardState.placements[sceneId] = filtered;
    return true;
  }

  if (type === 'placement.update') {
    const placementId = extractOpEntityId(op, 'placementId');
    if (!placementId) return false;
    if (!op.patch || typeof op.patch !== 'object') return false;
    const list = boardState?.placements?.[sceneId];
    if (!Array.isArray(list)) return false;
    for (let i = 0; i < list.length; i++) {
      const entry = list[i];
      if (!entry || typeof entry !== 'object') continue;
      if (entryId(entry) !== placementId) continue;
      // Shallow merge — never overwrite the id. A null value signals
      // that the property was deleted on the source client (e.g. the
      // last condition was removed from a token), so delete locally.
      for (const key of Object.keys(op.patch)) {
        if (key === 'id') continue;
        if (op.patch[key] === null) {
          delete entry[key];
        } else {
          entry[key] = op.patch[key];
        }
      }
      entry._lastModified = Date.now();
      return true;
    }
    return false;
  }

  if (type === 'template.upsert') {
    if (!op.template || typeof op.template !== 'object') return false;
    const templateId = entryId(op.template);
    if (!templateId) return false;
    if (!boardState.templates || typeof boardState.templates !== 'object') {
      boardState.templates = {};
    }
    if (!Array.isArray(boardState.templates[sceneId])) {
      boardState.templates[sceneId] = [];
    }
    const next = { ...op.template, _lastModified: Date.now() };
    const list = boardState.templates[sceneId];
    for (let i = 0; i < list.length; i++) {
      const existing = list[i];
      if (existing && typeof existing === 'object' && entryId(existing) === templateId) {
        list[i] = next;
        return true;
      }
    }
    list.push(next);
    return true;
  }

  if (type === 'template.remove') {
    const templateId = extractOpEntityId(op, 'templateId');
    if (!templateId) return false;
    const list = boardState?.templates?.[sceneId];
    if (!Array.isArray(list)) return false;
    const filtered = list.filter((entry) => {
      if (!entry || typeof entry !== 'object') return true;
      return entryId(entry) !== templateId;
    });
    if (filtered.length === list.length) return false;
    boardState.templates[sceneId] = filtered;
    return true;
  }

  if (type === 'drawing.add') {
    if (!op.drawing || typeof op.drawing !== 'object') return false;
    const drawingId = entryId(op.drawing);
    if (!drawingId) return false;
    if (!boardState.drawings || typeof boardState.drawings !== 'object') {
      boardState.drawings = {};
    }
    if (!Array.isArray(boardState.drawings[sceneId])) {
      boardState.drawings[sceneId] = [];
    }
    const next = { ...op.drawing, _lastModified: Date.now() };
    const list = boardState.drawings[sceneId];
    for (let i = 0; i < list.length; i++) {
      const existing = list[i];
      if (existing && typeof existing === 'object' && entryId(existing) === drawingId) {
        list[i] = next;
        return true;
      }
    }
    list.push(next);
    return true;
  }

  if (type === 'drawing.remove') {
    const drawingId = extractOpEntityId(op, 'drawingId');
    if (!drawingId) return false;
    const list = boardState?.drawings?.[sceneId];
    if (!Array.isArray(list)) return false;
    const filtered = list.filter((entry) => {
      if (!entry || typeof entry !== 'object') return true;
      return entryId(entry) !== drawingId;
    });
    if (filtered.length === list.length) return false;
    boardState.drawings[sceneId] = filtered;
    return true;
  }

  // Levels v2: per-scene claim of a token to a user.
  if (type === 'claim.set') {
    const placementId = extractOpEntityId(op, 'placementId');
    if (!placementId) return false;
    const userId = normalizeProfileIdField(op.userId);
    if (!userId) return false;
    const sceneState = ensureSceneStateEntry(boardState, sceneId);
    if (!sceneState.claimedTokens || typeof sceneState.claimedTokens !== 'object') {
      sceneState.claimedTokens = {};
    }
    if (sceneState.claimedTokens[placementId] === userId) {
      return false;
    }
    sceneState.claimedTokens[placementId] = userId;
    return true;
  }

  if (type === 'claim.clear') {
    const placementId = extractOpEntityId(op, 'placementId');
    if (!placementId) return false;
    const sceneState = boardState?.sceneState?.[sceneId];
    if (!sceneState || typeof sceneState !== 'object') return false;
    const claims = sceneState.claimedTokens;
    if (!claims || typeof claims !== 'object') return false;
    if (!(placementId in claims)) return false;
    delete claims[placementId];
    return true;
  }

  if (type === 'user-level.set') {
    const userId = normalizeProfileIdField(op.userId);
    if (!userId) return false;
    const levelId = typeof op.levelId === 'string' ? op.levelId.trim() : '';
    if (!levelId) return false;
    const sceneState = ensureSceneStateEntry(boardState, sceneId);
    if (!sceneState.userLevelState || typeof sceneState.userLevelState !== 'object') {
      sceneState.userLevelState = {};
    }
    const entry = buildUserLevelEntry({
      levelId,
      source: op.source,
      tokenId: op.tokenId,
    });
    sceneState.userLevelState[userId] = entry;
    return true;
  }

  if (type === 'user-level.activate') {
    const levelId = typeof op.levelId === 'string' ? op.levelId.trim() : '';
    if (!levelId) return false;
    const userIds = Array.isArray(op.userIds)
      ? op.userIds
          .map((id) => normalizeProfileIdField(id))
          .filter((id) => id)
      : [];
    if (userIds.length === 0) return false;
    const sceneState = ensureSceneStateEntry(boardState, sceneId);
    if (!sceneState.userLevelState || typeof sceneState.userLevelState !== 'object') {
      sceneState.userLevelState = {};
    }
    let mutated = false;
    const updatedAt = Date.now();
    userIds.forEach((userId) => {
      sceneState.userLevelState[userId] = {
        levelId,
        source: 'activate',
        updatedAt,
      };
      mutated = true;
    });
    return mutated;
  }

  if (type === 'combat.set') {
    if (!op.combat || typeof op.combat !== 'object') return false;
    const sceneState = ensureSceneStateEntry(boardState, sceneId);
    let combat = normalizeCombatOpPayload(op.combat);
    const existing =
      sceneState.combat && typeof sceneState.combat === 'object' ? sceneState.combat : null;
    const explicitEndCombat = Boolean(existing?.active) && isExplicitInactiveCombatPayload(op.combat);
    const endCombatEncounterMatches = combatEncounterMatches(op.combat, existing);
    if (explicitEndCombat && !endCombatEncounterMatches) {
      return false;
    }
    const endsActiveCombat = explicitEndCombat && endCombatEncounterMatches;
    if (existing && !endsActiveCombat && !shouldApplyCombatPayload(combat, existing)) {
      return false;
    }
    if (existing) {
      combat = advanceAcceptedCombatPayload(combat, existing);
    }
    const before = existing ? JSON.stringify(existing) : '';
    sceneState.combat = combat;
    return JSON.stringify(sceneState.combat) !== before;
  }

  // Unknown op type — ignored so the client tolerates payloads from
  // newer servers without crashing.
  return false;
}

/**
 * Apply a list of ops to a board state in order. Returns the count of
 * ops that actually mutated state. Stops if any op throws (it
 * shouldn't, but if it does the partial application would leave the
 * state inconsistent and the caller should resync).
 *
 * @param {object} boardState
 * @param {Array<object>} ops
 * @returns {number}
 */
export function applyBoardStateOpsLocally(boardState, ops) {
  if (!Array.isArray(ops) || ops.length === 0) return 0;
  let mutated = 0;
  for (const op of ops) {
    if (applyBoardStateOpLocally(boardState, op)) {
      mutated++;
    }
  }
  return mutated;
}

function extractSceneId(op) {
  const raw = op.sceneId;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    return trimmed === '' ? '' : trimmed;
  }
  return '';
}

function extractOpEntityId(op, field) {
  const raw = op[field];
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    return trimmed === '' ? '' : trimmed;
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return String(raw);
  }
  return '';
}

function entryId(entry) {
  if (!entry || typeof entry !== 'object') return '';
  const raw = entry.id;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    return trimmed === '' ? '' : trimmed;
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return String(raw);
  }
  return '';
}

function normalizeProfileIdField(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim().toLowerCase();
  return trimmed;
}

function ensureSceneStateEntry(boardState, sceneId) {
  if (!boardState.sceneState || typeof boardState.sceneState !== 'object') {
    boardState.sceneState = {};
  }
  const existing = boardState.sceneState[sceneId];
  if (!existing || typeof existing !== 'object') {
    boardState.sceneState[sceneId] = {};
  }
  return boardState.sceneState[sceneId];
}

const USER_LEVEL_OP_SOURCES = new Set(['manual', 'activate', 'claim']);

function buildUserLevelEntry({ levelId, source, tokenId }) {
  const sourceRaw = typeof source === 'string' ? source.trim().toLowerCase() : '';
  const normalizedSource = USER_LEVEL_OP_SOURCES.has(sourceRaw) ? sourceRaw : 'manual';
  const entry = {
    levelId,
    source: normalizedSource,
    updatedAt: Date.now(),
  };
  if (typeof tokenId === 'string' && tokenId.trim()) {
    entry.tokenId = tokenId.trim();
  }
  return entry;
}

function normalizeCombatOpPayload(raw) {
  const active = Boolean(raw.active ?? raw.isActive);
  const activeCombatantId = normalizeNullableString(raw.activeCombatantId);
  const completedCombatantIds = Array.from(
    new Set(
      (Array.isArray(raw.completedCombatantIds) ? raw.completedCombatantIds : [])
        .map((id) => (typeof id === 'string' ? id.trim() : ''))
        .filter((id) => id)
    )
  );
  return {
    active,
    round: normalizeNonNegativeInt(raw.round, 0),
    activeCombatantId,
    completedCombatantIds,
    startingTeam: normalizeCombatTeam(raw.startingTeam ?? raw.initialTeam),
    currentTeam: normalizeCombatTeam(raw.currentTeam ?? raw.activeTeam),
    lastTeam: normalizeCombatTeam(raw.lastTeam ?? raw.previousTeam),
    turnPhase: normalizeCombatTurnPhase(raw.turnPhase ?? raw.phase, active, activeCombatantId),
    roundTurnCount: normalizeNonNegativeInt(raw.roundTurnCount, 0),
    malice: normalizeNonNegativeInt(raw.malice ?? raw.maliceCount, 0),
    encounterId: normalizeNullableString(raw.encounterId ?? raw.combatEncounterId),
    updatedAt: normalizeNonNegativeInt(raw.updatedAt, Date.now()),
    sequence: normalizeNonNegativeInt(raw.sequence ?? raw.seq, 0),
    turnLock: normalizeCombatTurnLock(raw.turnLock),
    groups: normalizeCombatGroups(raw.groups ?? raw.groupings ?? raw.combatGroups ?? raw.combatantGroups),
    lastEffect: normalizeCombatTurnEffect(raw.lastEffect ?? raw.lastEvent),
  };
}

function shouldApplyCombatPayload(incoming, existing) {
  const existingSequence = normalizeNonNegativeInt(existing.sequence, 0);
  const incomingSequence = normalizeNonNegativeInt(incoming.sequence, 0);
  const existingUpdatedAt = normalizeNonNegativeInt(existing.updatedAt, 0);
  const incomingUpdatedAt = normalizeNonNegativeInt(incoming.updatedAt, 0);

  if (existingSequence > 0 && incomingSequence > 0) {
    if (incomingSequence !== existingSequence) {
      return incomingSequence > existingSequence;
    }
    if (existingUpdatedAt > 0 && incomingUpdatedAt > 0) {
      return incomingUpdatedAt > existingUpdatedAt;
    }
    return false;
  }

  if (existingUpdatedAt > 0 && incomingUpdatedAt > 0) {
    return incomingUpdatedAt > existingUpdatedAt;
  }

  return true;
}

function isExplicitInactiveCombatPayload(raw) {
  if (!raw || typeof raw !== 'object') {
    return false;
  }
  if (Object.prototype.hasOwnProperty.call(raw, 'active')) {
    return !normalizeBoolean(raw.active, false);
  }
  if (Object.prototype.hasOwnProperty.call(raw, 'isActive')) {
    return !normalizeBoolean(raw.isActive, false);
  }
  return false;
}

function combatEncounterMatches(incomingRaw, existing) {
  const existingEncounterId = normalizeNullableString(existing?.encounterId ?? existing?.combatEncounterId);
  const incomingEncounterId = normalizeNullableString(incomingRaw?.encounterId ?? incomingRaw?.combatEncounterId);
  if (!existingEncounterId || !incomingEncounterId) {
    return true;
  }
  return existingEncounterId === incomingEncounterId;
}

function advanceAcceptedCombatPayload(incoming, existing) {
  const combat = { ...incoming };
  const existingSequence = normalizeNonNegativeInt(existing.sequence, 0);
  const incomingSequence = normalizeNonNegativeInt(combat.sequence, 0);
  if (existingSequence > 0 && incomingSequence <= existingSequence) {
    combat.sequence = existingSequence + 1;
  }

  const existingUpdatedAt = normalizeNonNegativeInt(existing.updatedAt, 0);
  const incomingUpdatedAt = normalizeNonNegativeInt(combat.updatedAt, 0);
  if (existingUpdatedAt > 0 && incomingUpdatedAt <= existingUpdatedAt) {
    combat.updatedAt = existingUpdatedAt + 1;
  }

  return combat;
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return fallback;
    }
    if (['true', '1', 'yes', 'on'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'off'].includes(normalized)) {
      return false;
    }
  }
  return fallback;
}

function normalizeNonNegativeInt(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return Math.max(0, Math.trunc(fallback));
  }
  return Math.max(0, Math.trunc(numeric));
}

function normalizeNullableString(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeCombatTeam(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === 'ally' || normalized === 'enemy' ? normalized : null;
}

function normalizeCombatTurnPhase(value, active, activeCombatantId) {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'idle' || normalized === 'pick' || normalized === 'active') {
      return normalized;
    }
  }
  return active ? (activeCombatantId ? 'active' : 'pick') : 'idle';
}

function normalizeCombatTurnLock(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const holderId = normalizeProfileIdField(raw.holderId);
  if (!holderId) {
    return null;
  }
  return {
    holderId,
    holderName: typeof raw.holderName === 'string' ? raw.holderName.trim() : '',
    combatantId: normalizeNullableString(raw.combatantId),
    lockedAt: normalizeNonNegativeInt(raw.lockedAt, Date.now()),
  };
}

function normalizeCombatGroups(raw) {
  const source = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object'
    ? Object.entries(raw).map(([representativeId, memberIds]) => ({
        representativeId,
        memberIds: Array.isArray(memberIds) ? memberIds : [],
      }))
    : [];
  const groups = [];
  source.forEach((entry) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }
    const representativeId = normalizeNullableString(entry.representativeId ?? entry.id);
    if (!representativeId) {
      return;
    }
    const membersSource = Array.isArray(entry.memberIds)
      ? entry.memberIds
      : Array.isArray(entry.members)
      ? entry.members
      : Array.isArray(entry.ids)
      ? entry.ids
      : [];
    const memberIds = [];
    membersSource.forEach((memberId) => {
      if (typeof memberId !== 'string') {
        return;
      }
      const trimmed = memberId.trim();
      if (trimmed && !memberIds.includes(trimmed)) {
        memberIds.push(trimmed);
      }
    });
    if (!memberIds.includes(representativeId)) {
      memberIds.push(representativeId);
    }
    if (memberIds.length > 1) {
      groups.push({ representativeId, memberIds });
    }
  });
  return groups;
}

function normalizeCombatTurnEffect(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const type = typeof raw.type === 'string' ? raw.type.trim().toLowerCase() : '';
  if (!type) {
    return null;
  }
  const effect = {
    type,
    triggeredAt: normalizeNonNegativeInt(raw.triggeredAt ?? raw.timestamp ?? raw.updatedAt, Date.now()),
  };
  const combatantId = normalizeNullableString(raw.combatantId);
  const initiatorId = normalizeProfileIdField(raw.initiatorId);
  if (combatantId) {
    effect.combatantId = combatantId;
  }
  if (initiatorId) {
    effect.initiatorId = initiatorId;
  }
  return effect;
}
