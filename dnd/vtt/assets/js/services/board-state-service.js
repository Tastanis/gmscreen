import { queueSave } from '../state/persistence.js';

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
let boardStateOpSendSequence = 0;
const pendingBoardStateOps = new Map();

function boardStateOpDedupKey(op) {
  if (!op || typeof op !== 'object') {
    return null;
  }
  if (op.type === 'placement.move') {
    const sceneId = typeof op.sceneId === 'string' ? op.sceneId.trim() : '';
    const placementId = typeof op.placementId === 'string' ? op.placementId.trim() : '';
    if (!sceneId || !placementId) {
      return null;
    }
    return `placement.move:${sceneId}:${placementId}`;
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
    savePromise.then((result) => {
      if (result?.success) {
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
        const overlay = formatOverlayState(value.overlay ?? null);
        const entry = { grid, overlay };
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

  if ('overlay' in boardState) {
    payload.overlay = formatOverlayState(boardState.overlay ?? null);
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
    roundTurnCount,
    malice,
    updatedAt,
    sequence,
    turnLock,
    groups,
    lastEffect,
  };
}

const OVERLAY_LAYER_PREFIX = 'overlay-layer-';
let overlayLayerSeed = Date.now();
let overlayLayerSequence = 0;

function formatOverlayState(raw) {
  const overlay = createEmptyOverlayState();
  if (!raw || typeof raw !== 'object') {
    return overlay;
  }

  if (typeof raw.mapUrl === 'string') {
    const trimmed = raw.mapUrl.trim();
    if (trimmed) {
      overlay.mapUrl = trimmed;
    }
  }

  const layerSource = Array.isArray(raw.layers)
    ? raw.layers
    : Array.isArray(raw.items)
    ? raw.items
    : [];

  overlay.layers = layerSource
    .map((entry, index) => formatOverlayLayer(entry, index))
    .filter(Boolean);

  if (overlay.mapUrl) {
    const preferredId = raw.activeLayerId ?? raw.activeLayer ?? raw.selectedLayerId ?? null;
    let assigned = false;
    overlay.layers = overlay.layers.map((layer, index) => {
      if (layer.mapUrl) {
        return layer;
      }

      if (!assigned && (layer.id === preferredId || index === 0)) {
        assigned = true;
        return { ...layer, mapUrl: overlay.mapUrl };
      }

      return layer;
    });
  }

  const legacyMask = formatOverlayMask(raw.mask ?? null);
  if (
    !overlay.layers.length &&
    (maskHasMeaningfulContent(legacyMask) || typeof raw.name === 'string' || raw.visible !== undefined)
  ) {
    const legacyLayer = formatOverlayLayer(
      {
        id: typeof raw.id === 'string' ? raw.id : undefined,
        name: typeof raw.name === 'string' ? raw.name : undefined,
        visible: raw.visible,
        mask: legacyMask,
      },
      0
    );
    if (legacyLayer) {
      overlay.layers.push(legacyLayer);
    }
  }

  overlay.activeLayerId = resolveOverlayActiveLayerId(
    raw.activeLayerId ?? raw.activeLayer ?? raw.selectedLayerId,
    overlay.layers
  );

  overlay.mask = buildAggregateMask(overlay.layers);
  overlay.mapUrl = resolveOverlayMapUrl(overlay.layers, overlay.activeLayerId);
  return overlay;
}

function normalizeGridPayload(raw = {}) {
  const sizeValue = Number.parseInt(raw.size, 10);
  const size = Number.isFinite(sizeValue) ? sizeValue : Number(raw.size);
  const resolvedSize = Number.isFinite(size) ? Math.max(8, Math.min(320, Math.trunc(size))) : 64;

  return {
    size: resolvedSize,
    locked: Boolean(raw.locked),
    visible: raw.visible === undefined ? true : Boolean(raw.visible),
  };
}

function createEmptyOverlayState() {
  return { mapUrl: null, mask: createEmptyOverlayMask(), layers: [], activeLayerId: null };
}

function createEmptyOverlayMask() {
  return { visible: true, polygons: [] };
}

function formatOverlayLayer(raw = {}, index = 0) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const mask = formatOverlayMask(raw.mask ?? raw);
  const idSource = typeof raw.id === 'string' ? raw.id.trim() : '';
  const nameSource = typeof raw.name === 'string' ? raw.name.trim() : '';
  const visible = raw.visible === undefined ? true : Boolean(raw.visible);
  const mapUrlSource = typeof raw.mapUrl === 'string' ? raw.mapUrl.trim() : '';
  const id = idSource || generateOverlayLayerId();
  const name = nameSource || `Overlay ${index + 1}`;

  return {
    id,
    name,
    visible,
    mask,
    mapUrl: mapUrlSource || null,
  };
}

function resolveOverlayMapUrl(layers = [], activeLayerId = null) {
  if (!Array.isArray(layers) || layers.length === 0) {
    return null;
  }

  if (activeLayerId) {
    const activeLayer = layers.find((layer) => layer && layer.id === activeLayerId);
    if (activeLayer?.mapUrl) {
      return activeLayer.mapUrl;
    }
  }

  const visibleLayer = layers.find((layer) => layer && layer.visible !== false && layer.mapUrl);
  if (visibleLayer?.mapUrl) {
    return visibleLayer.mapUrl;
  }

  const firstWithMap = layers.find((layer) => layer?.mapUrl);
  return firstWithMap?.mapUrl ?? null;
}

function generateOverlayLayerId() {
  overlayLayerSequence += 1;
  return `${OVERLAY_LAYER_PREFIX}${overlayLayerSeed.toString(36)}-${overlayLayerSequence.toString(36)}`;
}

function resolveOverlayActiveLayerId(preferredId, layers = []) {
  const entries = Array.isArray(layers) ? layers : [];
  if (!entries.length) {
    return null;
  }

  if (typeof preferredId === 'string') {
    const trimmed = preferredId.trim();
    if (trimmed) {
      const preferredLayer = entries.find((layer) => layer && layer.id === trimmed);
      if (preferredLayer && preferredLayer.visible !== false) {
        return preferredLayer.id;
      }
    }
  }

  const visibleLayer = entries.find((layer) => layer && layer.visible !== false && layer.id);
  if (visibleLayer) {
    return visibleLayer.id;
  }

  const fallback = entries.find((layer) => layer && layer.id);
  return fallback ? fallback.id : null;
}

function buildAggregateMask(layers = []) {
  const aggregate = createEmptyOverlayMask();
  let hasVisibleLayer = false;

  layers.forEach((layer) => {
    if (!layer || typeof layer !== 'object' || layer.visible === false) {
      return;
    }

    const mask = formatOverlayMask(layer.mask ?? {});
    if (mask.visible === false) {
      return;
    }

    hasVisibleLayer = true;
    if (!aggregate.url && mask.url) {
      aggregate.url = mask.url;
    }

    if (Array.isArray(mask.polygons)) {
      mask.polygons.forEach((polygon) => {
        const points = Array.isArray(polygon?.points) ? polygon.points : [];
        if (points.length >= 3) {
          aggregate.polygons.push({ points });
        }
      });
    }
  });

  aggregate.visible = hasVisibleLayer;
  return aggregate;
}

function formatOverlayMask(raw) {
  if (!raw || typeof raw !== 'object') {
    return createEmptyOverlayMask();
  }

  const normalized = {
    visible: normalizeOverlayMaskVisibility(raw.visible),
    polygons: [],
  };

  if (typeof raw.url === 'string') {
    const trimmed = raw.url.trim();
    if (trimmed) {
      normalized.url = trimmed;
    }
  }

  const polygons = Array.isArray(raw.polygons) ? raw.polygons : [];
  polygons.forEach((polygon) => {
    const pointsSource = Array.isArray(polygon?.points) ? polygon.points : Array.isArray(polygon) ? polygon : [];
    if (!Array.isArray(pointsSource)) {
      return;
    }

    const points = pointsSource.map((point) => formatOverlayPoint(point)).filter(Boolean);
    if (points.length >= 3) {
      normalized.polygons.push({ points });
    }
  });

  return normalized;
}

function maskHasMeaningfulContent(mask = {}) {
  if (!mask || typeof mask !== 'object') {
    return false;
  }

  if (typeof mask.url === 'string' && mask.url.trim()) {
    return true;
  }

  return Array.isArray(mask.polygons) ? mask.polygons.length > 0 : false;
}

function normalizeOverlayMaskVisibility(value) {
  if (value === undefined) {
    return true;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return true;
    }
    if (normalized === 'false' || normalized === '0' || normalized === 'off' || normalized === 'no') {
      return false;
    }
    if (normalized === 'true' || normalized === '1' || normalized === 'on' || normalized === 'yes') {
      return true;
    }
  }

  return Boolean(value);
}

function formatOverlayPoint(point) {
  if (!point || typeof point !== 'object') {
    return null;
  }

  const column = Number(point.column ?? point.x);
  const row = Number(point.row ?? point.y);
  if (!Number.isFinite(column) || !Number.isFinite(row)) {
    return null;
  }

  return {
    column: roundToPrecision(column, 4),
    row: roundToPrecision(row, 4),
  };
}

function roundToPrecision(value, precision = 4) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const places = Number.isFinite(precision) ? Math.max(0, Math.trunc(precision)) : 0;
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
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
