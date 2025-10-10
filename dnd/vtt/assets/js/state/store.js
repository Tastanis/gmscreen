const listeners = new Set();

export const PLAYER_VISIBLE_TOKEN_FOLDER = "PC's";

const state = {
  scenes: { folders: [], items: [] },
  tokens: { folders: [], items: [] },
  boardState: { activeSceneId: null, placements: {}, mapUrl: null, sceneState: {} },
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
  if (!state.user?.isGM) {
    state.tokens = restrictTokensToPlayerView(state.tokens);
  }
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
    normalized[key] = { grid };
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
  const condition = normalizePlacementCondition(
    entry.condition ?? entry.status ?? entry?.overlays?.condition ?? null
  );

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
    condition,
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
