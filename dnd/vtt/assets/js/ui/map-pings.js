const MAP_PING_RETENTION_MS = 10000;
const MAP_PING_HISTORY_LIMIT = 8;
const MAP_PING_PROCESSED_RETENTION_MS = 60000;

export function createMapPings({
  windowRef = typeof window === 'undefined' ? undefined : window,
  getViewState = () => ({}),
  getBoardState = () => ({}),
  updateBoardState = () => {},
  getCurrentUserId = () => null,
  normalizeProfileId = (value) => value,
  getLocalMapPoint = () => null,
  markPingsDirty = () => {},
  persistBoardStateSnapshot = () => {},
} = {}) {
  const processedPings = new Map();
  // 3D board: pulses are drawn by board3d/layers/pings.mjs at the point clicked, and a focus turns the camera.
  const board3d = () => (windowRef?.vtt3d?.active && windowRef.vtt3dLayers?.pings) || null;

  // `point` ({x, y, height} in map pixels) names the spot outright: a ping on a token is on the token's own square,
  // not on the ground seen behind its picture.
  function handleMapPing(event, { focus = false, point = null } = {}) {
    const viewState = getViewState() ?? {};
    if (!viewState.mapLoaded || !board3d()) {
      return false;
    }

    const pointer = point && Number.isFinite(point.x) && Number.isFinite(point.y) ? point : getLocalMapPoint(event);
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
    // The height of what was clicked (getLocalMapPoint says), so the ping is drawn on that floor and not under it.
    if (Number.isFinite(pointer.height) && pointer.height !== 0) {
      pingEntry.z = Math.round(pointer.height * 100) / 100;
    }
    if (authorId) {
      pingEntry.authorId = authorId;
    }
    // The Director's own camera, so every 3D board is put exactly where he is looking from (Brandon, October 2026).
    const camera = focus ? windowRef?.vtt3dRenderer?.cameraState?.() : null;
    if (camera) {
      pingEntry.camera = camera;
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

  /** A camera carried by a focus ping: {position: [x, y, z], target: [x, y, z]} in board units, or null. */
  function cameraFrom(camera) {
    const three = (list) => Array.isArray(list) && list.length === 3 && list.every((n) => Number.isFinite(Number(n))) ? list.map(Number) : null;
    const position = three(camera?.position), target = three(camera?.target);
    return position && target ? { position, target } : null;
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
      ...(Number.isFinite(Number(entry.z)) && Number(entry.z) !== 0 ? { z: Number(entry.z) } : {}),
      ...(cameraFrom(entry.camera) ? { camera: cameraFrom(entry.camera) } : {}),
      createdAt,
    };

    return normalized;
  }

  function renderPing(pingEntry) {
    const viewState = getViewState() ?? {};
    if (!viewState.mapLoaded) return;
    const mapWidth = Number.isFinite(viewState.mapPixelSize?.width) ? viewState.mapPixelSize.width : 0;
    const mapHeight = Number.isFinite(viewState.mapPixelSize?.height) ? viewState.mapPixelSize.height : 0;
    if (mapWidth <= 0 || mapHeight <= 0) {
      return;
    }

    board3d()?.pulse({x:pingEntry.x*mapWidth,y:pingEntry.y*mapHeight,z:pingEntry.z ?? null,type:pingEntry.type});
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
    if (!board3d()) return;
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
    if (!viewState.mapLoaded || !board3d()) {
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
    const viewState = getViewState() ?? {};
    if (!board3d() || !viewState.mapLoaded) {
      return;
    }

    const mapWidth = Number.isFinite(viewState.mapPixelSize?.width) ? viewState.mapPixelSize.width : 0;
    const mapHeight = Number.isFinite(viewState.mapPixelSize?.height) ? viewState.mapPixelSize.height : 0;
    if (mapWidth <= 0 || mapHeight <= 0) {
      return;
    }

    // The Director's exact camera, when his move carries it.
    if (board3d() && pingEntry.type === 'focus' && cameraFrom(pingEntry.camera) && windowRef?.vtt3dRenderer?.setCameraState?.(cameraFrom(pingEntry.camera))) {
      return;
    }
    if (board3d() && windowRef?.vtt3dRenderer?.focus) {
      const helpers = windowRef.vtt3d.helpers;
      const at = helpers.toSquares(Math.min(1, Math.max(0, pingEntry.x)) * mapWidth, Math.min(1, Math.max(0, pingEntry.y)) * mapHeight);
      const z = Number(pingEntry.z);
      windowRef.vtt3dRenderer.focus({ x: at.x, y: at.y, z: Number.isFinite(z) ? z : helpers.groundAt(at.x, at.y) });
      return;
    }

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

  // Expose the pan helper so map-level navigation can reuse the same
  // camera-centering math as alt-shift-click focus pings.
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
    if (!viewState.mapLoaded || !board3d()) {
      return false;
    }
    centerViewOnPing({ x, y });
    return true;
  }

  return {
    handleMapPing,
    // A pulse on this page only, at a point of the board as drawn (the find-my-token button).
    // On the 3D board the point is a map point, and `z` the height it is at (the ground under it when not given).
    pulseAt: (localX, localY, z = null) => {
      const layer3d = board3d();
      if (layer3d) layer3d.pulse({ x: localX, y: localY, z: Number.isFinite(z) ? z : null, type: 'ping' });

    },
    processIncomingPings,
    sanitizePingsForPersistence,
    clonePingEntries,
    normalizeIncomingPing,
    centerViewOnPoint,
  };
}
