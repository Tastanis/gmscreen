import { queueSave } from '../state/persistence.js';
import { normalizeGridState } from '../state/normalize/grid.js';
import {
  normalizeClaimedTokensMap,
  normalizeMapLevelsState,
  normalizeUserLevelStateMap,
} from '../state/normalize/map-levels.js';

const SAVE_KEY = 'board-state';
const COMBAT_SAVE_KEY_PREFIX = 'combat-state';

// Phase 3-B (commit 2): delta-op escape thresholds. If a single flush
// would carry more than this many ops, or ops spanning more than this
// many scenes, `persistBoardStateOps` bails out and asks the caller to
// fall back to a full snapshot save. These are deliberately generous;
// the intent is to catch pathological cases (e.g. a scene-wide template
// change) rather than to nudge normal multi-select drags into the
// snapshot path.
export const PHASE_3B_MAX_OPS_PER_FLUSH = 64;
export const PHASE_3B_MAX_SCENES_PER_FLUSH = 4;

// Cross-call ops buffer. Rapidly repeated moves of the same token get
// coalesced by key (the later op overwrites the earlier one), matching
// how the full-snapshot path already behaves. Moves of *different*
// tokens, on the other hand, accumulate so that a second drag started
// while the first save is still in flight does not cause the first
// token to "pop back" to its pre-save position. Entries are cleared
// from the buffer only after the save that carried them resolves
// successfully, so an aborted/failed save leaves its ops in place for
// the next flush to pick up.
//
// Phase 3-B (commit 3): `placement.add`, `placement.remove`, and
// `placement.update` join `placement.move` in the buffer. Keys are
// per-type so cross-type ops on the same placement are preserved in
// insertion order (e.g. an add followed by an update lands in that
// order on the server). Same-key collisions follow the commit-2
// convention (later wins) for add/remove/move, but two
// `placement.update` ops for the same placement instead *shallow-merge*
// their patches so distinct field changes (HP and conditions, for
// example) both reach the server.
let boardStateOpSendSequence = 0;
const pendingBoardStateOps = new Map();

function boardStateOpDedupKey(op) {
  if (!op || typeof op !== 'object') {
    return null;
  }
  const sceneId = typeof op.sceneId === 'string' ? op.sceneId.trim() : '';
  if (!sceneId) {
    return null;
  }
  if (op.type === 'placement.move') {
    const placementId = typeof op.placementId === 'string' ? op.placementId.trim() : '';
    if (!placementId) {
      return null;
    }
    return `placement.move:${sceneId}:${placementId}`;
  }
  if (op.type === 'placement.remove') {
    const placementId = typeof op.placementId === 'string' ? op.placementId.trim() : '';
    if (!placementId) {
      return null;
    }
    return `placement.remove:${sceneId}:${placementId}`;
  }
  if (op.type === 'placement.update') {
    const placementId = typeof op.placementId === 'string' ? op.placementId.trim() : '';
    if (!placementId || !op.patch || typeof op.patch !== 'object') {
      return null;
    }
    return `placement.update:${sceneId}:${placementId}`;
  }
  if (op.type === 'placement.add') {
    const placement = op.placement;
    if (!placement || typeof placement !== 'object') {
      return null;
    }
    const placementId = typeof placement.id === 'string' ? placement.id.trim() : '';
    if (!placementId) {
      return null;
    }
    return `placement.add:${sceneId}:${placementId}`;
  }
  // Phase 3-B (commit 4): template ops. Keys are per-type so an upsert
  // and a remove for the same template can coexist in the buffer; the
  // snapshot path that commitShapes used to take had no such conflict
  // because it shipped the whole templates array. Later-wins dedup
  // applies within a single key, matching placement.add/remove.
  if (op.type === 'template.upsert') {
    const template = op.template;
    if (!template || typeof template !== 'object') {
      return null;
    }
    const templateId = typeof template.id === 'string' ? template.id.trim() : '';
    if (!templateId) {
      return null;
    }
    return `template.upsert:${sceneId}:${templateId}`;
  }
  if (op.type === 'template.remove') {
    const templateId = typeof op.templateId === 'string' ? op.templateId.trim() : '';
    if (!templateId) {
      return null;
    }
    return `template.remove:${sceneId}:${templateId}`;
  }
  // Phase 3-B (commit 5): drawing ops. Drawings are add-only or
  // removed — the drawing tool never modifies a drawing in place
  // (erase splits into new fragments with fresh ids; undo restores
  // an older snapshot), so there is no drawing.upsert. Per-type
  // later-wins dedup applies within a key, matching template.*.
  if (op.type === 'drawing.add') {
    const drawing = op.drawing;
    if (!drawing || typeof drawing !== 'object') {
      return null;
    }
    const drawingId = typeof drawing.id === 'string' ? drawing.id.trim() : '';
    if (!drawingId) {
      return null;
    }
    return `drawing.add:${sceneId}:${drawingId}`;
  }
  if (op.type === 'drawing.remove') {
    const drawingId = typeof op.drawingId === 'string' ? op.drawingId.trim() : '';
    if (!drawingId) {
      return null;
    }
    return `drawing.remove:${sceneId}:${drawingId}`;
  }
  // Levels v2 ops. Per-(scene, placement) keys for claim ops and per-(scene,
  // user) keys for user-level ops so rapid repeats coalesce; the activate op
  // is broadcast-style so it has no per-user key (later wins on the scene).
  if (op.type === 'claim.set') {
    const placementId = typeof op.placementId === 'string' ? op.placementId.trim() : '';
    if (!placementId) {
      return null;
    }
    return `claim.set:${sceneId}:${placementId}`;
  }
  if (op.type === 'claim.clear') {
    const placementId = typeof op.placementId === 'string' ? op.placementId.trim() : '';
    if (!placementId) {
      return null;
    }
    return `claim.clear:${sceneId}:${placementId}`;
  }
  if (op.type === 'user-level.set') {
    const userId = typeof op.userId === 'string' ? op.userId.trim().toLowerCase() : '';
    if (!userId) {
      return null;
    }
    return `user-level.set:${sceneId}:${userId}`;
  }
  if (op.type === 'user-level.activate') {
    return `user-level.activate:${sceneId}`;
  }
  return null;
}

export async function fetchBoardState(endpoint, { fetchFn = typeof fetch === 'function' ? fetch : null } = {}) {
  if (!endpoint || typeof fetchFn !== 'function') {
    return null;
  }

  try {
    const response = await fetchFn(endpoint, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });

    if (!response?.ok) {
      throw new Error(`Unexpected status ${response?.status ?? 'unknown'}`);
    }

    const payload = (await response.json().catch(() => null)) ?? null;
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const data = payload.data && typeof payload.data === 'object' ? payload.data : payload;
    const boardState = data.boardState && typeof data.boardState === 'object' ? data.boardState : null;
    const scenes = data.scenes && typeof data.scenes === 'object' ? data.scenes : null;
    const tokens = data.tokens && typeof data.tokens === 'object' ? data.tokens : null;

    return { boardState, scenes, tokens };
  } catch (error) {
    console.warn('[VTT] Failed to fetch board state', error);
    return null;
  }
}

export function persistBoardState(endpoint, boardState = {}, options = {}) {
  if (!endpoint) {
    return null;
  }

  const payload = buildPayload(boardState);
  if (!payload) {
    return null;
  }

  // Use immediate mode by default for board state saves to reduce the window
  // where stale state could be applied by polling, preventing token popback
  const normalizedOptions = { immediate: true, ...options };
  return queueSave(SAVE_KEY, { boardState: payload }, endpoint, normalizedOptions);
}

/**
 * Phase 3-B (commit 2): queue a delta-op save for the board state.
 *
 * Accepts a list of typed ops (currently only `placement.move`) plus a
 * small envelope carrying the metadata / `_version` / `_socketId` that
 * the existing snapshot path rides on the payload. Returns either:
 *   - the save promise, identical in shape to `persistBoardState`; or
 *   - `null` if there is nothing to send / the endpoint is missing; or
 *   - `{ escape: true }` if the pending ops buffer exceeds the size or
 *     scene-count thresholds. The caller should treat this as "ops path
 *     unavailable for this flush, fall back to snapshot."
 *
 * Rapidly repeated ops for the same (type, sceneId, placementId) are
 * deduplicated: the later op overwrites the earlier one, so only the
 * freshest intent is sent. Ops for *different* keys accumulate in a
 * process-wide buffer until a save resolves successfully, then the
 * sent ops are drained. This matches the snapshot path's behavior
 * where the later snapshot always wins, but preserves concurrent
 * work on unrelated tokens that would otherwise be lost if a second
 * call simply aborted the first's in-flight save.
 */
export function persistBoardStateOps(endpoint, ops, envelope = {}, options = {}) {
  if (!endpoint || !Array.isArray(ops)) {
    return null;
  }

  boardStateOpSendSequence += 1;
  const sendSeq = boardStateOpSendSequence;

  for (const op of ops) {
    const key = boardStateOpDedupKey(op);
    if (!key) {
      continue;
    }
    // Phase 3-B (commit 3): two `placement.update` ops for the same
    // placement shallow-merge their patches. This preserves distinct
    // field changes (e.g. an HP edit followed by a condition toggle)
    // that would otherwise be clobbered by a plain later-wins replace.
    // All other op types keep the commit-2 "later wins" semantic.
    if (op.type === 'placement.update') {
      const existing = pendingBoardStateOps.get(key);
      if (
        existing &&
        existing.op &&
        existing.op.type === 'placement.update' &&
        existing.op.patch &&
        typeof existing.op.patch === 'object' &&
        op.patch &&
        typeof op.patch === 'object'
      ) {
        const mergedPatch = { ...existing.op.patch, ...op.patch };
        pendingBoardStateOps.set(key, {
          op: { ...op, patch: mergedPatch },
          seq: sendSeq,
        });
        continue;
      }
    }
    pendingBoardStateOps.set(key, { op, seq: sendSeq });
  }

  const bufferedOps = Array.from(pendingBoardStateOps.values(), (entry) => entry.op);
  if (bufferedOps.length === 0) {
    return null;
  }

  const uniqueScenes = new Set();
  for (const op of bufferedOps) {
    if (op && typeof op.sceneId === 'string') {
      uniqueScenes.add(op.sceneId);
    }
  }
  if (
    bufferedOps.length > PHASE_3B_MAX_OPS_PER_FLUSH ||
    uniqueScenes.size > PHASE_3B_MAX_SCENES_PER_FLUSH
  ) {
    // Signal "use snapshot fallback" to the caller. The buffered ops
    // are intentionally left in place: a subsequent snapshot save will
    // persist the canonical state, and then the next op-based save
    // (if any) will observe an empty or reduced buffer.
    return { escape: true };
  }

  // Build the wire payload. `ops` lives at the top level; metadata and
  // internal fields (`_version`, `_socketId`) ride in a small
  // `boardState` envelope so the server's existing extraction logic
  // for those fields works unchanged.
  const boardStateEnvelope = {};
  if (envelope && typeof envelope === 'object') {
    if (envelope.metadata && typeof envelope.metadata === 'object') {
      boardStateEnvelope.metadata = envelope.metadata;
    }
    if (typeof envelope._version === 'number' && envelope._version > 0) {
      boardStateEnvelope._version = envelope._version;
    }
    if (typeof envelope._socketId === 'string' && envelope._socketId.trim()) {
      boardStateEnvelope._socketId = envelope._socketId.trim();
    }
  }

  const wirePayload = { ops: bufferedOps };
  if (Object.keys(boardStateEnvelope).length > 0) {
    wirePayload.boardState = boardStateEnvelope;
  }

  const normalizedOptions = { immediate: true, ...options };
  const savePromise = queueSave(SAVE_KEY, wirePayload, endpoint, normalizedOptions);

  if (savePromise && typeof savePromise.then === 'function') {
    savePromise.sentOps = bufferedOps.map((op) => ({ ...op }));
    savePromise.then((result) => {
      if (result?.success || result?.error?.name === 'ConflictError') {
        for (const [key, entry] of pendingBoardStateOps) {
          if (entry.seq <= sendSeq) {
            pendingBoardStateOps.delete(key);
          }
        }
      }
      return result;
    });
  }

  return savePromise;
}

/**
 * Test-only helper. Clears the module-level ops buffer between tests
 * so state from one test does not leak into another.
 */
export function _resetBoardStateOpsBufferForTest() {
  boardStateOpSendSequence = 0;
  pendingBoardStateOps.clear();
}

export function persistCombatState(endpoint, sceneId, combatState = {}, options = {}) {
  if (!endpoint) {
    return null;
  }

  const payload = buildCombatPayload(sceneId, combatState);
  if (!payload) {
    return null;
  }

  const key = `${COMBAT_SAVE_KEY_PREFIX}-${payload.sceneId}`;
  const { sceneId: _sceneId, ...rest } = payload;
  const normalizedOptions = options ?? {};
  return queueSave(
    key,
    rest,
    endpoint,
    { ...normalizedOptions, coalesce: normalizedOptions.coalesce ?? false }
  );
}

function buildPayload(boardState = {}) {
  if (!boardState || typeof boardState !== 'object') {
    return null;
  }

  const payload = {};

  if ('activeSceneId' in boardState) {
    const rawId = boardState.activeSceneId;
    if (typeof rawId === 'string') {
      const trimmed = rawId.trim();
      payload.activeSceneId = trimmed === '' ? null : trimmed;
    } else {
      payload.activeSceneId = null;
    }
  }

  if ('mapUrl' in boardState) {
    const rawUrl = boardState.mapUrl;
    if (typeof rawUrl === 'string') {
      const trimmed = rawUrl.trim();
      payload.mapUrl = trimmed === '' ? null : trimmed;
    } else {
      payload.mapUrl = null;
    }
  }

  if ('thumbnailUrl' in boardState) {
    const rawThumbUrl = boardState.thumbnailUrl;
    if (typeof rawThumbUrl === 'string') {
      const trimmed = rawThumbUrl.trim();
      payload.thumbnailUrl = trimmed === '' ? null : trimmed;
    } else {
      payload.thumbnailUrl = null;
    }
  }

  if ('placements' in boardState) {
    const rawPlacements = boardState.placements;
    if (rawPlacements && typeof rawPlacements === 'object') {
      payload.placements = rawPlacements;
    }
  }

  if ('sceneState' in boardState) {
    const rawSceneState = boardState.sceneState;
    if (rawSceneState && typeof rawSceneState === 'object') {
      const normalized = {};
      Object.keys(rawSceneState).forEach((sceneId) => {
        const key = typeof sceneId === 'string' ? sceneId.trim() : String(sceneId || '');
        if (!key) {
          return;
        }

        const value = rawSceneState[sceneId];
        if (!value || typeof value !== 'object') {
          return;
        }

        const grid = normalizeGridPayload(value.grid ?? value);
        const combat = formatCombatState(value.combat ?? value.combatState ?? null);
        const mapLevels = normalizeMapLevelsState(value.mapLevels ?? null, { sceneGrid: grid });
        // Levels v2: preserve per-scene claim and active-level state so
        // snapshot saves do not silently drop the new fields.
        const claimedTokens = normalizeClaimedTokensMap(value.claimedTokens ?? null);
        const userLevelState = normalizeUserLevelStateMap(value.userLevelState ?? null);
        const entry = { grid, mapLevels, claimedTokens, userLevelState };
        if (combat) {
          entry.combat = combat;
        }
        // Pass through fogOfWar data if present
        if (value.fogOfWar && typeof value.fogOfWar === 'object') {
          entry.fogOfWar = value.fogOfWar;
        }
        normalized[key] = entry;
      });

      if (Object.keys(normalized).length > 0) {
        payload.sceneState = normalized;
      }
    }
  }

  if ('templates' in boardState) {
    const rawTemplates = boardState.templates;
    if (rawTemplates && typeof rawTemplates === 'object') {
      payload.templates = rawTemplates;
    }
  }

  if ('drawings' in boardState) {
    const rawDrawings = boardState.drawings;
    if (rawDrawings && typeof rawDrawings === 'object') {
      payload.drawings = rawDrawings;
    }
  }

  if ('pings' in boardState) {
    const rawPings = boardState.pings;
    if (Array.isArray(rawPings)) {
      payload.pings = rawPings;
    }
  }

  if ('metadata' in boardState) {
    const rawMetadata = boardState.metadata;
    if (rawMetadata && typeof rawMetadata === 'object') {
      const metadata = {};
      if (typeof rawMetadata.authorId === 'string') {
        const authorId = rawMetadata.authorId.trim().toLowerCase();
        if (authorId) {
          metadata.authorId = authorId;
        }
      }
      const updatedAtRaw = Number(rawMetadata.updatedAt ?? rawMetadata.timestamp);
      if (Number.isFinite(updatedAtRaw)) {
        const updatedAt = Math.max(0, Math.trunc(updatedAtRaw));
        metadata.updatedAt = updatedAt;
      }
      if (typeof rawMetadata.signature === 'string') {
        const signature = rawMetadata.signature.trim();
        if (signature) {
          metadata.signature = signature;
        }
      }
      if (typeof rawMetadata.authorRole === 'string') {
        const role = rawMetadata.authorRole.trim().toLowerCase();
        if (role === 'gm' || role === 'player') {
          metadata.authorRole = role;
        }
      }
      if (typeof rawMetadata.authorIsGm === 'boolean') {
        metadata.authorIsGm = rawMetadata.authorIsGm;
      }
      if (Object.keys(metadata).length > 0) {
        payload.metadata = metadata;
      }
    }
  }

  // Include internal fields for server-side processing
  // These are prefixed with _ to indicate they are not persisted to the state file
  if (boardState._deltaOnly === true) {
    payload._deltaOnly = true;
  }
  if (typeof boardState._version === 'number' && boardState._version > 0) {
    payload._version = boardState._version;
  }
  if (typeof boardState._socketId === 'string' && boardState._socketId.trim()) {
    payload._socketId = boardState._socketId.trim();
  }
  if (Array.isArray(boardState._replaceDrawings) && boardState._replaceDrawings.length > 0) {
    payload._replaceDrawings = boardState._replaceDrawings;
  }

  return Object.keys(payload).length > 0 ? payload : null;
}

function buildCombatPayload(sceneId, combatState = {}) {
  const key = typeof sceneId === 'string' ? sceneId.trim() : String(sceneId || '');
  if (!key) {
    return null;
  }

  const combat = formatCombatState(combatState);
  if (!combat) {
    return null;
  }

  return {
    sceneId: key,
    sceneState: {
      [key]: { combat },
    },
  };
}

function formatCombatState(raw = {}) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const active = Boolean(raw.active ?? raw.isActive);
  const round = toInt(raw.round, 0);
  const activeCombatantId = typeof raw.activeCombatantId === 'string' ? raw.activeCombatantId.trim() : '';
  const completedSource = Array.isArray(raw.completedCombatantIds) ? raw.completedCombatantIds : [];
  const completedCombatantIds = Array.from(
    new Set(
      completedSource
        .map((id) => (typeof id === 'string' ? id.trim() : ''))
        .filter((id) => id.length > 0)
    )
  );
  const startingTeam = sanitizeCombatTeam(raw.startingTeam ?? raw.initialTeam ?? null);
  const currentTeam = sanitizeCombatTeam(raw.currentTeam ?? raw.activeTeam ?? null);
  const lastTeam = sanitizeCombatTeam(raw.lastTeam ?? raw.previousTeam ?? null);
  const turnPhase = sanitizeTurnPhase(raw.turnPhase ?? raw.phase ?? null, active, activeCombatantId);
  const roundTurnCount = toInt(raw.roundTurnCount, 0);
  const malice = Math.max(0, toInt(raw.malice ?? raw.maliceCount ?? 0, 0));
  const updatedAt = toInt(raw.updatedAt, Date.now());
  const turnLock = sanitizeTurnLock(raw.turnLock ?? null);
  const groups = sanitizeCombatGroups(
    raw.groups ?? raw.groupings ?? raw.combatGroups ?? raw.combatantGroups ?? null
  );
  const lastEffect = sanitizeTurnEffect(raw.lastEffect ?? raw.lastEvent ?? null);
  // Preserve the sequence counter for reliable cross-client ordering.
  const sequence = Math.max(0, toInt(raw.sequence, 0));

  return {
    active,
    round,
    activeCombatantId: activeCombatantId || null,
    completedCombatantIds,
    startingTeam,
    currentTeam,
    lastTeam,
    turnPhase,
    roundTurnCount,
    malice,
    updatedAt,
    sequence,
    turnLock,
    groups,
    lastEffect,
  };
}


function normalizeGridPayload(raw = {}) {
  return normalizeGridState(raw);
}


function sanitizeCombatTeam(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'ally' || normalized === 'enemy') {
    return normalized;
  }
  return null;
}

function sanitizeTurnPhase(value, active = false, activeCombatantId = '') {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'idle' || normalized === 'pick' || normalized === 'active') {
      return normalized;
    }
  }
  return active ? (activeCombatantId ? 'active' : 'pick') : 'idle';
}

function sanitizeTurnLock(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const holderId = typeof raw.holderId === 'string' ? raw.holderId.trim().toLowerCase() : '';
  if (!holderId) {
    return null;
  }

  const holderName = typeof raw.holderName === 'string' ? raw.holderName.trim() : '';
  const combatantId = typeof raw.combatantId === 'string' ? raw.combatantId.trim() : '';
  const lockedAt = toInt(raw.lockedAt, Date.now());

  return {
    holderId,
    holderName,
    combatantId: combatantId || null,
    lockedAt,
  };
}

function sanitizeTurnEffect(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const type = typeof raw.type === 'string' ? raw.type.trim().toLowerCase() : '';
  if (!type) {
    return null;
  }

  const combatantId = typeof raw.combatantId === 'string' ? raw.combatantId.trim() : '';
  const triggeredAt = toInt(raw.triggeredAt ?? raw.timestamp ?? raw.updatedAt, Date.now());
  const initiatorId = typeof raw.initiatorId === 'string' ? raw.initiatorId.trim().toLowerCase() : '';

  const effect = {
    type,
    triggeredAt,
  };

  if (combatantId) {
    effect.combatantId = combatantId;
  }

  if (initiatorId) {
    effect.initiatorId = initiatorId;
  }

  return effect;
}

function sanitizeCombatGroups(raw) {
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

    const representativeSource =
      typeof entry.representativeId === 'string'
        ? entry.representativeId
        : typeof entry.id === 'string'
        ? entry.id
        : null;
    const representativeId = representativeSource ? representativeSource.trim() : '';
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

    const normalizedMembers = [];
    membersSource.forEach((memberId) => {
      if (typeof memberId !== 'string') {
        return;
      }
      const trimmed = memberId.trim();
      if (!trimmed || normalizedMembers.includes(trimmed)) {
        return;
      }
      normalizedMembers.push(trimmed);
    });

    if (!normalizedMembers.includes(representativeId)) {
      normalizedMembers.push(representativeId);
    }

    if (normalizedMembers.length <= 1) {
      return;
    }

    groups.push({ representativeId, memberIds: normalizedMembers });
  });

  return groups;
}

function toInt(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return Math.trunc(numeric);
  }
  return Math.trunc(fallback);
}
