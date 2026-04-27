/**
 * Map pings.
 *
 * Extracted from dnd/vtt/assets/js/ui/board-interactions.js as part of the
 * phase 4 refactor. Do not add unrelated code to this file.
 *
 * Owns the alt-click ping/focus interaction: spawning the local pulse, queuing
 * the ping into board state, deduping incoming pings from other clients, and
 * sanitizing the persisted ping list. The pinging DOM layer (`#vtt-ping-layer`)
 * is created by board-interactions.js and accessed via the `getPingLayer`
 * callback.
 *
 * See docs/vtt-sync-refactor/phase-4-extraction-targets.md target #5 for the
 * design history.
 */

const MAP_PING_ANIMATION_DURATION_MS = 900;
const MAP_PING_RETENTION_MS = 10000;
const MAP_PING_HISTORY_LIMIT = 8;
const MAP_PING_PROCESSED_RETENTION_MS = 60000;
const PING_PULSE_BASE_SIZE_PX = 160;
const PING_PULSE_CLEANUP_BUFFER_MS = 160;

export function createMapPings({
  documentRef = typeof document === 'undefined' ? undefined : document,
  windowRef = typeof window === 'undefined' ? undefined : window,
  getBoardElement = () => null,
  getPingLayer = () => null,
  getViewState = () => ({}),
  applyTransform = () => {},
  getBoardState = () => ({}),
  updateBoardState = () => {},
  getCurrentUserId = () => null,
  normalizeProfileId = (value) => value,
  getLocalMapPoint = () => null,
  markPingsDirty = () => {},
  persistBoardStateSnapshot = () => {},
} = {}) {
  const processedPings = new Map();

  function handleMapPing(event, { focus = false } = {}) {
    const viewState = getViewState() ?? {};
    if (!viewState.mapLoaded) {
      return false;
    }

    const pointer = getLocalMapPoint(event);
    const mapWidth = Number.isFinite(viewState.mapPixelSize?.width) ? viewState.mapPixelSize.width : 0;
    const mapHeight = Number.isFinite(viewState.mapPixelSize?.height) ? viewState.mapPixelSize.height : 0;
    if (!pointer || mapWidth <= 0 || mapHeight <= 0) {
      return false;
    }

    const normalizedX = Math.min(1, Math.max(0, pointer.x / mapWidth));
    const normalizedY = Math.min(1, Math.max(0, pointer.y / mapHeight));

    const state = getBoardState() ?? {};
    const sceneIdRaw = typeof state?.boardState?.activeSceneId === 'string'
      ? state.boardState.activeSceneId
      : null;
    const sceneId = sceneIdRaw && sceneIdRaw.trim() ? sceneIdRaw : null;
    const authorId = normalizeProfileId(getCurrentUserId());
    const now = Date.now();
    const signatureSeed = Math.random().toString(36).slice(2, 10);
    const baseId = authorId ? `${authorId}:${now}` : `${now}`;
    const pingId = `${baseId}:${signatureSeed}`;

    const pingEntry = {
      id: pingId,
      sceneId,
      x: normalizedX,
      y: normalizedY,
      type: focus ? 'focus' : 'ping',
      createdAt: now,
    };
    if (authorId) {
      pingEntry.authorId = authorId;
    }

    const queued = queuePingForState(pingEntry);
    recordProcessedPing(pingEntry);
    renderPing(pingEntry);
    if (focus) {
      centerViewOnPing(pingEntry);
    }
    if (queued) {
      // Mark only pings as dirty - don't include placements in the save
      markPingsDirty();
      persistBoardStateSnapshot();
    }

    return true;
  }

  function queuePingForState(pingEntry) {
    if (typeof updateBoardState !== 'function') {
      return false;
    }

    let updated = false;
    const retentionThreshold = Date.now() - MAP_PING_RETENTION_MS;
    updateBoardState((draft) => {
      if (!draft.boardState || typeof draft.boardState !== 'object') {
        draft.boardState = { pings: [] };
      }
      if (!Array.isArray(draft.boardState.pings)) {
        draft.boardState.pings = [];
      }

      draft.boardState.pings = draft.boardState.pings
        .filter((entry) => {
          if (!entry || typeof entry !== 'object') {
            return false;
          }
          const createdAt = Number(entry.createdAt ?? entry.timestamp ?? 0);
          if (!Number.isFinite(createdAt)) {
            return false;
          }
          return createdAt >= retentionThreshold;
        })
        .slice(-MAP_PING_HISTORY_LIMIT + 1);

      draft.boardState.pings.push({ ...pingEntry });
      if (draft.boardState.pings.length > MAP_PING_HISTORY_LIMIT) {
        draft.boardState.pings = draft.boardState.pings.slice(
          draft.boardState.pings.length - MAP_PING_HISTORY_LIMIT
        );
      }
      updated = true;
    });

    return updated;
  }

  function normalizeIncomingPing(entry) {
    if (!entry || typeof entry !== 'object') {
      return null;
    }

    const id = typeof entry.id === 'string' ? entry.id.trim() : '';
    if (!id) {
      return null;
    }

    const createdAtRaw = Number(entry.createdAt ?? entry.timestamp ?? Date.now());
    const createdAt = Number.isFinite(createdAtRaw) ? Math.max(0, Math.trunc(createdAtRaw)) : Date.now();
    const x = Number(entry.x);
    const y = Number(entry.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }

    const normalized = {
      id,
      sceneId:
        typeof entry.sceneId === 'string' && entry.sceneId.trim()
          ? entry.sceneId.trim()
          : null,
      x: Math.min(1, Math.max(0, x)),
      y: Math.min(1, Math.max(0, y)),
      type:
        typeof entry.type === 'string' && entry.type.trim().toLowerCase() === 'focus'
          ? 'focus'
          : 'ping',
      createdAt,
    };

    return normalized;
  }

  function renderPing(pingEntry) {
    const pingLayer = getPingLayer();
    const viewState = getViewState() ?? {};
    if (!pingLayer || !viewState.mapLoaded) {
      return;
    }

    const mapWidth = Number.isFinite(viewState.mapPixelSize?.width) ? viewState.mapPixelSize.width : 0;
    const mapHeight = Number.isFinite(viewState.mapPixelSize?.height) ? viewState.mapPixelSize.height : 0;
    if (mapWidth <= 0 || mapHeight <= 0) {
      return;
    }

    const localX = Math.min(1, Math.max(0, pingEntry.x)) * mapWidth;
    const localY = Math.min(1, Math.max(0, pingEntry.y)) * mapHeight;
    spawnPingPulse(localX, localY, pingEntry.type, 0);
  }

  function spawnPingPulse(localX, localY, type, delayMs) {
    const pingLayer = getPingLayer();
    if (!pingLayer || !documentRef) {
      return;
    }

    const element = documentRef.createElement('div');
    element.className = 'vtt-board__ping';
    if (type === 'focus') {
      element.classList.add('vtt-board__ping--focus');
    }
    element.style.left = `${localX}px`;
    element.style.top = `${localY}px`;
    element.style.setProperty('--vtt-ping-delay', `${delayMs}ms`);

    const viewState = getViewState() ?? {};
    const scale = Number.isFinite(viewState.scale) && viewState.scale !== 0 ? viewState.scale : 1;
    const size = PING_PULSE_BASE_SIZE_PX / scale;
    element.style.setProperty('--vtt-ping-size', `${size}px`);

    pingLayer.appendChild(element);
    const cleanupDelay = MAP_PING_ANIMATION_DURATION_MS + delayMs + PING_PULSE_CLEANUP_BUFFER_MS;
    scheduleTimeout(() => {
      element.remove();
    }, cleanupDelay);
  }

  function scheduleTimeout(callback, delayMs) {
    if (typeof callback !== 'function') {
      return;
    }
    const timer =
      windowRef && typeof windowRef.setTimeout === 'function'
        ? windowRef.setTimeout.bind(windowRef)
        : typeof setTimeout === 'function'
        ? setTimeout
        : null;
    if (timer) {
      timer(callback, delayMs);
    }
  }

  function recordProcessedPing(pingEntry) {
    if (!pingEntry || typeof pingEntry.id !== 'string') {
      return;
    }
    const timestamp = Number.isFinite(pingEntry.createdAt)
      ? pingEntry.createdAt
      : Date.now();
    processedPings.set(pingEntry.id, timestamp);
    pruneProcessedPings();
  }

  function pruneProcessedPings(now = Date.now()) {
    processedPings.forEach((timestamp, id) => {
      if (!Number.isFinite(timestamp) || now - timestamp > MAP_PING_PROCESSED_RETENTION_MS) {
        processedPings.delete(id);
      }
    });
  }

  function processIncomingPings(entries, activeSceneId) {
    const list = Array.isArray(entries) ? entries : [];
    const now = Date.now();
    pruneProcessedPings(now);

    const retentionThreshold = now - MAP_PING_RETENTION_MS;
    const staleIndexes = [];
    const pendingPings = [];

    list.forEach((entry, index) => {
      const ping = normalizeIncomingPing(entry);
      if (!ping) {
        return;
      }

      if (ping.createdAt < retentionThreshold) {
        staleIndexes.push(index);
        return;
      }

      pendingPings.push(ping);
    });

    if (staleIndexes.length && Array.isArray(entries)) {
      for (let i = staleIndexes.length - 1; i >= 0; i -= 1) {
        entries.splice(staleIndexes[i], 1);
      }
    }

    const viewState = getViewState() ?? {};
    if (!viewState.mapLoaded) {
      return;
    }

    pendingPings.forEach((ping) => {
      if (ping.sceneId && activeSceneId && ping.sceneId !== activeSceneId) {
        return;
      }
      if (processedPings.has(ping.id)) {
        return;
      }
      recordProcessedPing(ping);
      renderPing(ping);
      if (ping.type === 'focus') {
        centerViewOnPing(ping);
      }
    });
  }

  function centerViewOnPing(pingEntry) {
    const board = getBoardElement();
    const viewState = getViewState() ?? {};
    if (!board || !viewState.mapLoaded) {
      return;
    }

    const mapWidth = Number.isFinite(viewState.mapPixelSize?.width) ? viewState.mapPixelSize.width : 0;
    const mapHeight = Number.isFinite(viewState.mapPixelSize?.height) ? viewState.mapPixelSize.height : 0;
    if (mapWidth <= 0 || mapHeight <= 0) {
      return;
    }

    const boardRect = board.getBoundingClientRect();
    const scale = Number.isFinite(viewState.scale) && viewState.scale !== 0 ? viewState.scale : 1;
    const localX = Math.min(1, Math.max(0, pingEntry.x)) * mapWidth;
    const localY = Math.min(1, Math.max(0, pingEntry.y)) * mapHeight;
    const desiredX = boardRect.width / 2 - localX * scale;
    const desiredY = boardRect.height / 2 - localY * scale;

    const mapWidthScaled = mapWidth * scale;
    const mapHeightScaled = mapHeight * scale;
    const minX = Math.min(0, boardRect.width - mapWidthScaled);
    const maxX = Math.max(0, boardRect.width - mapWidthScaled);
    const minY = Math.min(0, boardRect.height - mapHeightScaled);
    const maxY = Math.max(0, boardRect.height - mapHeightScaled);

    if (viewState.translation && typeof viewState.translation === 'object') {
      viewState.translation.x = Math.min(Math.max(desiredX, minX), maxX);
      viewState.translation.y = Math.min(Math.max(desiredY, minY), maxY);
    }
    applyTransform();
  }

  function sanitizePingsForPersistence(source) {
    const entries = Array.isArray(source) ? source : [];
    const retentionThreshold = Date.now() - MAP_PING_RETENTION_MS;
    const byId = new Map();

    entries.forEach((entry) => {
      const normalized = normalizeIncomingPing(entry);
      if (!normalized) {
        return;
      }
      if (normalized.createdAt < retentionThreshold) {
        return;
      }
      const previous = byId.get(normalized.id);
      if (!previous || normalized.createdAt >= previous.createdAt) {
        byId.set(normalized.id, normalized);
      }
    });

    if (byId.size === 0) {
      return [];
    }

    const sorted = Array.from(byId.values()).sort(
      (a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0)
    );
    if (sorted.length > MAP_PING_HISTORY_LIMIT) {
      return sorted.slice(sorted.length - MAP_PING_HISTORY_LIMIT);
    }

    return sorted;
  }

  function clonePingEntries(entries) {
    if (!Array.isArray(entries)) {
      return [];
    }
    try {
      return JSON.parse(JSON.stringify(entries));
    } catch (error) {
      return [];
    }
  }

  // Levels v2 §5.2: expose the pan helper so claim-driven view-follow can
  // reuse the same camera-centering math as alt-shift-click focus pings.
  // Accepts a `{ x, y }` pair already normalized to [0, 1] of the active
  // map; returns false when the view isn't ready (no map loaded, missing
  // dimensions) so the caller can decide whether to retry.
  function centerViewOnPoint(point) {
    if (!point || typeof point !== 'object') {
      return false;
    }
    const x = Number(point.x);
    const y = Number(point.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return false;
    }
    const viewState = getViewState() ?? {};
    if (!viewState.mapLoaded) {
      return false;
    }
    centerViewOnPing({ x, y });
    return true;
  }

  return {
    handleMapPing,
    processIncomingPings,
    sanitizePingsForPersistence,
    clonePingEntries,
    normalizeIncomingPing,
    centerViewOnPoint,
  };
}
