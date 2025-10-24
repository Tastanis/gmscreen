const listeners = new Set();

export const PLAYER_VISIBLE_TOKEN_FOLDER = "PC's";
const MAX_PERSISTED_PINGS = 8;
const MAP_PING_RETENTION_MS = 10_000;

const state = {
  scenes: { folders: [], items: [] },
  tokens: { folders: [], items: [] },
  boardState: {
    activeSceneId: null,
    placements: {},
    mapUrl: null,
    sceneState: {},
    templates: {},
    overlay: { mapUrl: null, mask: createEmptyOverlayMask() },
    pings: [],
  },
  grid: { size: 64, locked: false, visible: true },
  user: { isGM: false, name: '' },
};

export function initializeState(snapshot = {}) {
  state.scenes = normalizeScenes(snapshot.scenes);
  state.tokens = normalizeTokens(snapshot.tokens);
  const boardSnapshot = snapshot.boardState && typeof snapshot.boardState === 'object' ? snapshot.boardState : {};
  state.boardState = {
    ...state.boardState,
    ...boardSnapshot,
  };
  state.boardState.placements = normalizePlacements(
    boardSnapshot.placements ?? state.boardState.placements ?? {}
  );
  state.boardState.sceneState = normalizeSceneBoardState(
    boardSnapshot.sceneState ?? state.boardState.sceneState ?? {}
  );
  state.boardState.templates = normalizeTemplates(
    boardSnapshot.templates ?? state.boardState.templates ?? {}
  );
  state.boardState.overlay = normalizeOverlayEntry(
    boardSnapshot.overlay ?? state.boardState.overlay ?? {}
  );
  state.boardState.pings = normalizePings(
    boardSnapshot.pings ?? state.boardState.pings ?? []
  );
  syncBoardOverlayState(state.boardState);
  if (snapshot.grid && typeof snapshot.grid === 'object') {
    state.grid = {
      ...state.grid,
      ...snapshot.grid,
    };
  }

  applySceneGridState(state);

  const snapshotUser = snapshot.user && typeof snapshot.user === 'object' ? snapshot.user : {};
  const isGM = Boolean(
    snapshotUser.isGM ?? snapshot.isGM ?? snapshotUser.gm ?? snapshot?.user?.is_gm
  );
  const name =
    typeof snapshotUser.name === 'string'
      ? snapshotUser.name
      : typeof snapshot.currentUser === 'string'
      ? snapshot.currentUser
      : '';

  state.user = { isGM, name };

  if (!state.user.isGM) {
    state.boardState.placements = restrictPlacementsToPlayerView(state.boardState.placements);
    state.tokens = restrictTokensToPlayerView(state.tokens);
  }
  notify();
}

export function getState() {
  return JSON.parse(JSON.stringify(state));
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function updateState(updater) {
  updater(state);
  syncBoardOverlayState(state.boardState);
  if (!state.user?.isGM) {
    state.boardState.placements = restrictPlacementsToPlayerView(state.boardState.placements);
    state.tokens = restrictTokensToPlayerView(state.tokens);
  }
  state.boardState.pings = normalizePings(state.boardState.pings);
  notify();
}

function notify() {
  listeners.forEach((listener) => listener(getState()));
}

function normalizeScenes(raw = {}) {
  if (Array.isArray(raw)) {
    return { folders: [], items: raw };
  }

  const folders = Array.isArray(raw?.folders) ? raw.folders : [];
  const items = Array.isArray(raw?.items)
    ? raw.items
    : Array.isArray(raw?.scenes)
    ? raw.scenes
    : [];

  return {
    folders: folders.filter((folder) => folder && typeof folder.id === 'string'),
    items: items.filter((scene) => scene && typeof scene.id === 'string'),
  };
}

function normalizeTokens(raw = {}) {
  if (Array.isArray(raw)) {
    return { folders: [], items: raw };
  }

  const folders = Array.isArray(raw?.folders) ? raw.folders : [];
  const items = Array.isArray(raw?.items)
    ? raw.items
    : Array.isArray(raw?.tokens)
    ? raw.tokens
    : [];

  return {
    folders: folders.filter((folder) => folder && typeof folder.id === 'string'),
    items: items.filter((token) => token && typeof token.id === 'string'),
  };
}

function normalizePlacements(raw = {}) {
  if (!raw || typeof raw !== 'object') {
    return {};
  }

  const normalized = {};
  Object.keys(raw).forEach((sceneId) => {
    const placements = Array.isArray(raw[sceneId]) ? raw[sceneId] : [];
    normalized[sceneId] = placements
      .map((entry) => normalizePlacementEntry(entry))
      .filter(Boolean);
  });
  return normalized;
}

function normalizeTemplates(raw = {}) {
  if (!raw || typeof raw !== 'object') {
    return {};
  }

  const normalized = {};
  Object.keys(raw).forEach((sceneId) => {
    const key = typeof sceneId === 'string' ? sceneId.trim() : String(sceneId || '');
    if (!key) {
      return;
    }

    const templates = Array.isArray(raw[sceneId]) ? raw[sceneId] : [];
    normalized[key] = templates.map((entry) => normalizeTemplateEntry(entry)).filter(Boolean);
  });

  return normalized;
}

function normalizeTemplateEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const type = typeof entry.type === 'string' ? entry.type.trim().toLowerCase() : '';
  const id = typeof entry.id === 'string' ? entry.id.trim() : '';
  if (!id || (type !== 'circle' && type !== 'rectangle' && type !== 'wall')) {
    return null;
  }

  const color = typeof entry.color === 'string' ? entry.color : undefined;

  if (type === 'circle') {
    const column = clampToFinite(entry.center?.column, 0, 4);
    const row = clampToFinite(entry.center?.row, 0, 4);
    const radius = Math.max(0.5, clampToFinite(entry.radius, 0.5, 4));
    const normalized = {
      id,
      type: 'circle',
      center: { column, row },
      radius,
    };
    if (color) {
      normalized.color = color;
    }
    return normalized;
  }

  if (type === 'rectangle') {
    const startColumn = Math.max(0, clampToFinite(entry.start?.column, 0, 4));
    const startRow = Math.max(0, clampToFinite(entry.start?.row, 0, 4));
    const length = Math.max(1, clampToFinite(entry.length, 1, 4));
    const width = Math.max(1, clampToFinite(entry.width, 1, 4));
    const rotation = clampToFinite(entry.rotation, 0, 2);
    const normalized = {
      id,
      type: 'rectangle',
      start: { column: startColumn, row: startRow },
      length,
      width,
      rotation,
    };
    if (color) {
      normalized.color = color;
    }
    if (Number.isFinite(entry.anchor?.column) && Number.isFinite(entry.anchor?.row)) {
      normalized.anchor = {
        column: Math.max(0, clampToFinite(entry.anchor.column, 0, 4)),
        row: Math.max(0, clampToFinite(entry.anchor.row, 0, 4)),
      };
    }
    if (Number.isFinite(entry.orientation?.x) || Number.isFinite(entry.orientation?.y)) {
      normalized.orientation = {
        x: entry.orientation?.x >= 0 ? 1 : -1,
        y: entry.orientation?.y >= 0 ? 1 : -1,
      };
    }
    return normalized;
  }

  if (type === 'wall') {
    const rawSquares = Array.isArray(entry.squares) ? entry.squares : [];
    const squares = rawSquares
      .map((square) => {
        const column = Math.round(Number(square?.column ?? square?.col ?? square?.x));
        const row = Math.round(Number(square?.row ?? square?.y));
        if (!Number.isFinite(column) || !Number.isFinite(row)) {
          return null;
        }
        return { column: Math.max(0, column), row: Math.max(0, row) };
      })
      .filter(Boolean);
    const normalized = {
      id,
      type: 'wall',
      squares,
    };
    if (color) {
      normalized.color = color;
    }
    return normalized;
  }

  return null;
}

function normalizePings(raw = []) {
  if (!Array.isArray(raw)) {
    return [];
  }

  const byId = new Map();
  const retentionThreshold = Date.now() - MAP_PING_RETENTION_MS;
  raw.forEach((entry) => {
    const ping = normalizePingEntry(entry);
    if (!ping) {
      return;
    }
    if (ping.createdAt < retentionThreshold) {
      return;
    }
    const previous = byId.get(ping.id);
    if (!previous || (ping.createdAt ?? 0) >= (previous.createdAt ?? 0)) {
      byId.set(ping.id, ping);
    }
  });

  if (byId.size === 0) {
    return [];
  }

  const sorted = Array.from(byId.values()).sort(
    (a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0)
  );

  if (sorted.length > MAX_PERSISTED_PINGS) {
    return sorted.slice(sorted.length - MAX_PERSISTED_PINGS);
  }

  return sorted;
}

function normalizePingEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const id = typeof entry.id === 'string' ? entry.id.trim() : '';
  if (!id) {
    return null;
  }

  const createdAtRaw = Number(entry.createdAt ?? entry.timestamp ?? 0);
  if (!Number.isFinite(createdAtRaw)) {
    return null;
  }
  const createdAt = Math.max(0, Math.trunc(createdAtRaw));

  const x = normalizePingCoordinate(entry.x ?? entry.column ?? entry.left);
  const y = normalizePingCoordinate(entry.y ?? entry.row ?? entry.top);
  if (x === null || y === null) {
    return null;
  }

  const typeRaw = typeof entry.type === 'string' ? entry.type.trim().toLowerCase() : '';
  const type = typeRaw === 'focus' ? 'focus' : 'ping';

  const sceneIdRaw = typeof entry.sceneId === 'string' ? entry.sceneId.trim() : '';
  const sceneId = sceneIdRaw === '' ? null : sceneIdRaw;

  const authorRaw =
    typeof entry.authorId === 'string'
      ? entry.authorId.trim().toLowerCase()
      : null;
  const authorId = authorRaw ? authorRaw : null;

  const normalized = { id, sceneId, x, y, type, createdAt };
  if (authorId) {
    normalized.authorId = authorId;
  }
  return normalized;
}

function normalizePingCoordinate(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  const clamped = Math.min(1, Math.max(0, numeric));
  const rounded = Math.round(clamped * 10_000) / 10_000;
  return Number.isFinite(rounded) ? rounded : null;
}

function clampToFinite(value, fallback = 0, precision = 4) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  if (!Number.isFinite(precision) || precision <= 0) {
    return parsed;
  }
  const factor = 10 ** precision;
  return Math.round(parsed * factor) / factor;
}

function normalizeSceneBoardState(raw = {}) {
  if (!raw || typeof raw !== 'object') {
    return {};
  }

  const normalized = {};
  Object.keys(raw).forEach((sceneId) => {
    const key = typeof sceneId === 'string' ? sceneId.trim() : String(sceneId || '');
    if (!key) {
      return;
    }

    const value = raw[sceneId];
    if (!value || typeof value !== 'object') {
      return;
    }

    const grid = normalizeGridState(value.grid ?? value);
    const combat = normalizeCombatStateEntry(value.combat ?? value.combatState ?? null);
    const overlay = normalizeOverlayEntry(value.overlay ?? null);
    const entry = { grid };

    if (combat) {
      entry.combat = combat;
    }

    entry.overlay = overlay;

    normalized[key] = entry;
  });

  return normalized;
}

function normalizeGridState(raw = {}) {
  const sizeValue = Number.parseInt(raw.size, 10);
  const size = Number.isFinite(sizeValue) ? sizeValue : Number(raw.size);
  const resolvedSize = Number.isFinite(size) ? Math.max(8, Math.min(320, Math.trunc(size))) : 64;

  return {
    size: resolvedSize,
    locked: Boolean(raw.locked),
    visible: raw.visible === undefined ? true : Boolean(raw.visible),
  };
}

function normalizeCombatStateEntry(raw = {}) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const active = Boolean(raw.active ?? raw.isActive);
  const round = Math.max(0, toInt(raw.round, 0));
  const activeCombatantId = typeof raw.activeCombatantId === 'string' ? raw.activeCombatantId.trim() : '';
  const completedCombatantIds = uniqueStringList(raw.completedCombatantIds ?? []);
  const startingTeam = normalizeCombatTeamValue(raw.startingTeam ?? raw.initialTeam ?? null);
  const currentTeam = normalizeCombatTeamValue(raw.currentTeam ?? raw.activeTeam ?? null);
  const lastTeam = normalizeCombatTeamValue(raw.lastTeam ?? raw.previousTeam ?? null);
  const roundTurnCount = Math.max(0, toInt(raw.roundTurnCount, 0));
  const turnLock = normalizeTurnLockEntry(raw.turnLock ?? null);
  const hasTimestamp = Number.isFinite(Number(raw.updatedAt));
  const hasMeaningfulState =
    active ||
    round > 0 ||
    Boolean(activeCombatantId) ||
    completedCombatantIds.length > 0 ||
    Boolean(startingTeam) ||
    Boolean(currentTeam) ||
    Boolean(lastTeam) ||
    roundTurnCount > 0 ||
    Boolean(turnLock);

  if (!hasMeaningfulState && !hasTimestamp) {
    return null;
  }

  return {
    active,
    round,
    activeCombatantId: activeCombatantId || null,
    completedCombatantIds,
    startingTeam,
    currentTeam,
    lastTeam,
    roundTurnCount,
    updatedAt: Math.max(0, toInt(raw.updatedAt, Date.now())),
    turnLock,
  };
}

function normalizeOverlayEntry(raw) {
  if (!raw || typeof raw !== 'object') {
    return createEmptyOverlayState();
  }

  const mapUrl = typeof raw.mapUrl === 'string' ? raw.mapUrl.trim() : '';
  const mask = normalizeOverlayMaskEntry(raw.mask ?? null);

  return {
    mapUrl: mapUrl ? mapUrl : null,
    mask,
  };
}

function createEmptyOverlayState() {
  return { mapUrl: null, mask: createEmptyOverlayMask() };
}

function createEmptyOverlayMask() {
  return { visible: true, polygons: [] };
}

function normalizeOverlayMaskEntry(raw) {
  if (!raw || typeof raw !== 'object') {
    return createEmptyOverlayMask();
  }

  const normalized = {
    visible: raw.visible === undefined ? true : Boolean(raw.visible),
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

    const points = pointsSource.map((point) => normalizeOverlayPoint(point)).filter(Boolean);
    if (points.length >= 3) {
      normalized.polygons.push({ points });
    }
  });

  return normalized;
}

function normalizeOverlayPoint(point) {
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

function syncBoardOverlayState(boardState) {
  if (!boardState || typeof boardState !== 'object') {
    return;
  }

  if (!boardState.sceneState || typeof boardState.sceneState !== 'object') {
    boardState.overlay = createEmptyOverlayState();
    return;
  }

  Object.keys(boardState.sceneState).forEach((sceneId) => {
    const entry = boardState.sceneState[sceneId];
    if (!entry || typeof entry !== 'object') {
      return;
    }

    entry.overlay = normalizeOverlayEntry(entry.overlay ?? null);
  });

  const activeSceneId =
    typeof boardState.activeSceneId === 'string' ? boardState.activeSceneId.trim() : '';

  if (activeSceneId && boardState.sceneState[activeSceneId]) {
    boardState.overlay = normalizeOverlayEntry(
      boardState.sceneState[activeSceneId].overlay ?? boardState.overlay ?? null
    );
    return;
  }

  boardState.overlay = normalizeOverlayEntry(boardState.overlay ?? null);
}

function normalizeCombatTeamValue(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'ally' || normalized === 'enemy') {
    return normalized;
  }

  return null;
}

function normalizeTurnLockEntry(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const holderId = typeof raw.holderId === 'string' ? raw.holderId.trim().toLowerCase() : '';
  if (!holderId) {
    return null;
  }

  const holderName = typeof raw.holderName === 'string' ? raw.holderName.trim() : '';
  const combatantId = typeof raw.combatantId === 'string' ? raw.combatantId.trim() : '';

  return {
    holderId,
    holderName: holderName || holderId,
    combatantId: combatantId || null,
    lockedAt: Math.max(0, toInt(raw.lockedAt, Date.now())),
  };
}

function uniqueStringList(raw = []) {
  if (!Array.isArray(raw)) {
    return [];
  }

  const seen = new Set();
  const result = [];

  raw.forEach((value) => {
    if (typeof value !== 'string') {
      return;
    }

    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) {
      return;
    }

    seen.add(trimmed);
    result.push(trimmed);
  });

  return result;
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

function applySceneGridState(state) {
  if (!state || !state.boardState) {
    return;
  }

  const activeSceneId = state.boardState.activeSceneId;
  if (!activeSceneId) {
    return;
  }

  const sceneState = state.boardState.sceneState ?? {};
  if (!sceneState || typeof sceneState !== 'object') {
    return;
  }

  const sceneEntry = sceneState[activeSceneId];
  if (!sceneEntry || typeof sceneEntry !== 'object') {
    return;
  }

  const gridState = normalizeGridState(sceneEntry.grid ?? sceneEntry);
  state.grid = {
    ...state.grid,
    ...gridState,
  };
}

export function restrictTokensToPlayerView(tokenState = {}) {
  const folders = Array.isArray(tokenState.folders) ? tokenState.folders : [];
  const items = Array.isArray(tokenState.items) ? tokenState.items : [];

  const visibleFolders = [];
  const allowedIds = new Set();

  folders.forEach((folder) => {
    if (!folder || typeof folder !== 'object') {
      return;
    }

    const name = typeof folder.name === 'string' ? folder.name.trim() : '';
    if (name !== PLAYER_VISIBLE_TOKEN_FOLDER) {
      return;
    }

    const id = typeof folder.id === 'string' ? folder.id : '';
    if (!id) {
      return;
    }

    if (!allowedIds.has(id)) {
      allowedIds.add(id);
      visibleFolders.push(folder);
    }
  });

  const visibleItems = [];

  items.forEach((token) => {
    if (!token || typeof token !== 'object') {
      return;
    }

    const folderId = typeof token.folderId === 'string' ? token.folderId : '';
    if (folderId && allowedIds.has(folderId)) {
      visibleItems.push(token);
      return;
    }

    const folderName =
      typeof token.folder?.name === 'string' ? token.folder.name.trim() : '';
    if (folderName === PLAYER_VISIBLE_TOKEN_FOLDER) {
      if (folderId && !allowedIds.has(folderId)) {
        allowedIds.add(folderId);
        visibleFolders.push({ id: folderId, name: PLAYER_VISIBLE_TOKEN_FOLDER });
      }
      visibleItems.push(token);
    }
  });

  return {
    folders: dedupeFoldersById(visibleFolders),
    items: visibleItems,
  };
}

export function restrictPlacementsToPlayerView(placements = {}) {
  if (!placements || typeof placements !== 'object') {
    return {};
  }

  const filtered = {};
  Object.keys(placements).forEach((sceneId) => {
    const entries = Array.isArray(placements[sceneId]) ? placements[sceneId] : [];
    const visibleEntries = entries.filter((entry) => {
      if (!entry || typeof entry !== 'object') {
        return false;
      }
      const hidden = toBoolean(entry.hidden ?? entry.isHidden ?? entry?.flags?.hidden ?? false, false);
      return hidden !== true;
    });
    filtered[sceneId] = visibleEntries;
  });

  return filtered;
}

function dedupeFoldersById(folders) {
  const seen = new Set();
  const result = [];
  folders.forEach((folder) => {
    if (!folder || typeof folder !== 'object') {
      return;
    }
    const id = typeof folder.id === 'string' ? folder.id : '';
    if (!id || seen.has(id)) {
      return;
    }
    seen.add(id);
    result.push(folder);
  });
  return result;
}

function normalizePlacementEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const id = typeof entry.id === 'string' ? entry.id : null;
  if (!id) {
    return null;
  }

  const tokenId = typeof entry.tokenId === 'string' ? entry.tokenId : null;
  const name = typeof entry.name === 'string' ? entry.name : '';
  const imageUrl = typeof entry.imageUrl === 'string' ? entry.imageUrl : '';
  const column = toNonNegativeInt(entry.column ?? entry.col ?? entry.x ?? 0);
  const row = toNonNegativeInt(entry.row ?? entry.y ?? 0);
  const width = Math.max(1, toNonNegativeInt(entry.width ?? entry.columns ?? entry.w ?? 1));
  const height = Math.max(1, toNonNegativeInt(entry.height ?? entry.rows ?? entry.h ?? 1));
  const size = typeof entry.size === 'string' && entry.size ? entry.size : `${width}x${height}`;
  const hp = normalizePlacementHitPoints(
    entry.hp ??
      entry.hitPoints ??
      entry?.overlays?.hitPoints ??
      entry?.overlays?.hitPoints?.value ??
      entry?.stats?.hp ??
      null
  );
  const showHp = Boolean(
    entry.showHp ?? entry.showHitPoints ?? entry?.overlays?.hitPoints?.visible ?? false
  );
  const showTriggeredAction = Boolean(
    entry.showTriggeredAction ?? entry?.overlays?.triggeredAction?.visible ?? false
  );
  const triggeredActionReady =
    entry.triggeredActionReady ?? entry?.overlays?.triggeredAction?.ready ?? true;
  const rawConditionSources = [];
  if (entry.conditions !== undefined) {
    rawConditionSources.push(entry.conditions);
  }
  if (entry?.overlays?.conditions !== undefined) {
    rawConditionSources.push(entry.overlays.conditions);
  }

  const legacyConditionSource =
    entry.condition ?? entry.status ?? entry?.overlays?.condition ?? null;
  if (legacyConditionSource !== null && legacyConditionSource !== undefined) {
    rawConditionSources.push(legacyConditionSource);
  }

  const conditions = normalizePlacementConditions(rawConditionSources);
  const condition = conditions[0] ?? null;
  const combatTeam = normalizeCombatTeam(
    entry.combatTeam ?? entry.team ?? entry?.tags?.team ?? entry?.faction ?? null
  );
  const hidden = toBoolean(entry.hidden ?? entry.isHidden ?? entry?.flags?.hidden ?? false, false);

  return {
    id,
    tokenId,
    name,
    imageUrl,
    column,
    row,
    width,
    height,
    size,
    hp,
    showHp,
    showTriggeredAction,
    triggeredActionReady: triggeredActionReady !== false,
    conditions,
    condition,
    combatTeam,
    hidden,
  };
}

function toNonNegativeInt(value, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value));
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isFinite(parsed)) {
    return Math.max(0, parsed);
  }

  return Math.max(0, Math.trunc(fallback));
}

function toBoolean(value, fallback = false) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return fallback;
    }
    return value !== 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return fallback;
    }
    if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') {
      return true;
    }
    if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off') {
      return false;
    }
    return fallback;
  }

  if (typeof value === 'object' && value !== null) {
    return toBoolean(value.valueOf(), fallback);
  }

  return fallback;
}

function normalizeHitPointsValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  if (value && typeof value === 'object') {
    if (typeof value.value === 'number' && Number.isFinite(value.value)) {
      return String(Math.trunc(value.value));
    }
    if (typeof value.value === 'string') {
      return value.value.trim();
    }
  }

  return '';
}

function normalizePlacementHitPoints(value, fallbackMax = '') {
  const normalized = { current: '', max: '' };

  if (value && typeof value === 'object') {
    const currentSource =
      value.current ?? value.value ?? value.hp ?? value.currentHp ?? value.hpCurrent ?? null;
    const maxSource =
      value.max ??
      value.maxHp ??
      value.total ??
      value.maximum ??
      value.value ??
      value.hp ??
      value.hitPoints ??
      null;

    normalized.current = normalizeHitPointsValue(currentSource);
    normalized.max = normalizeHitPointsValue(maxSource);
  } else {
    const parsed = normalizeHitPointsValue(value);
    normalized.current = parsed;
    normalized.max = parsed;
  }

  const fallback = normalizeHitPointsValue(fallbackMax);
  if (normalized.max === '' && fallback !== '') {
    normalized.max = fallback;
  }

  if (normalized.current === '' && normalized.max !== '') {
    normalized.current = normalized.max;
  }

  return normalized;
}

function normalizeCombatTeam(value) {
  if (typeof value !== 'string') {
    return 'enemy';
  }
  const normalized = value.trim().toLowerCase();
  return normalized === 'ally' ? 'ally' : 'enemy';
}

function normalizeConditionDurationValue(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!normalized) {
    return 'save-ends';
  }
  if (normalized.includes('eot') || normalized.includes('end')) {
    return 'end-of-turn';
  }
  return 'save-ends';
}

function normalizePlacementCondition(value) {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    const name = value.trim();
    if (!name) {
      return null;
    }
    return { name, duration: { type: 'save-ends' } };
  }

  if (typeof value !== 'object') {
    return null;
  }

  const name = typeof value.name === 'string' ? value.name.trim() : '';
  if (!name) {
    return null;
  }

  const durationSource =
    typeof value.duration === 'string' || (value.duration && typeof value.duration === 'object')
      ? value.duration
      : value.mode ?? value.type ?? value.persist ?? null;

  const durationType = normalizeConditionDurationValue(
    typeof durationSource === 'string'
      ? durationSource
      : typeof durationSource?.type === 'string'
      ? durationSource.type
      : typeof durationSource?.value === 'string'
      ? durationSource.value
      : typeof durationSource?.mode === 'string'
      ? durationSource.mode
      : ''
  );

  const normalized = { name, duration: { type: durationType } };

  const targetTokenId =
    typeof durationSource?.targetTokenId === 'string'
      ? durationSource.targetTokenId.trim()
      : typeof durationSource?.tokenId === 'string'
      ? durationSource.tokenId.trim()
      : typeof durationSource?.id === 'string'
      ? durationSource.id.trim()
      : typeof value.targetTokenId === 'string'
      ? value.targetTokenId.trim()
      : null;

  const targetTokenName =
    typeof durationSource?.targetTokenName === 'string'
      ? durationSource.targetTokenName.trim()
      : typeof durationSource?.tokenName === 'string'
      ? durationSource.tokenName.trim()
      : typeof value.targetTokenName === 'string'
      ? value.targetTokenName.trim()
      : typeof value.tokenName === 'string'
      ? value.tokenName.trim()
      : '';

  if (normalized.duration.type === 'end-of-turn') {
    if (targetTokenId) {
      normalized.duration.targetTokenId = targetTokenId;
    }
    if (targetTokenName) {
      normalized.duration.targetTokenName = targetTokenName;
    }
  }

  return normalized;
}

function normalizePlacementConditions(value) {
  if (value === null || value === undefined) {
    return [];
  }

  const queue = Array.isArray(value) ? [...value] : [value];
  const normalized = [];
  const seen = new Set();

  while (queue.length) {
    const current = queue.shift();
    if (current === null || current === undefined) {
      continue;
    }
    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    const condition = normalizePlacementCondition(current);
    if (!condition) {
      continue;
    }

    const key = buildConditionKey(condition);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalized.push(condition);
  }

  return normalized;
}

function buildConditionKey(condition) {
  const name = typeof condition?.name === 'string' ? condition.name.trim().toLowerCase() : '';
  const type = condition?.duration?.type ?? 'save-ends';
  const targetId =
    typeof condition?.duration?.targetTokenId === 'string'
      ? condition.duration.targetTokenId.trim().toLowerCase()
      : '';
  const targetName =
    typeof condition?.duration?.targetTokenName === 'string'
      ? condition.duration.targetTokenName.trim().toLowerCase()
      : '';
  const targetKey = type === 'end-of-turn' ? `${targetId}|${targetName}` : '';
  return `${name}|${type}|${targetKey}`;
}
