/**
 * Levels v2 §5.2 view-follow helpers.
 *
 * When a claimant's `userLevelState` entry is updated with `source: 'claim'`
 * and a `tokenId`, that user's view should pan to the claimed token. This
 * module exposes the pure detector + geometry pieces so they can be tested
 * without DOM/state plumbing; board-interactions wires them into the live
 * view.
 *
 * Trigger rules (intentional):
 *   - First observation of a scene's per-user entry is the baseline; no pan.
 *   - A pan fires only when the entry has `source: 'claim'` AND `tokenId`
 *     AND something about it has changed since the last observation
 *     (different `tokenId`, `levelId`, or `updatedAt`).
 *   - GM browsing (`source: 'manual'`) and Activate (`source: 'activate'`)
 *     do not trigger pans because they do not match `source: 'claim'`.
 */

function normalizeEntrySnapshot(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }
  if (entry.source !== 'claim') {
    return null;
  }
  const tokenId = typeof entry.tokenId === 'string' ? entry.tokenId.trim() : '';
  if (!tokenId) {
    return null;
  }
  const levelId = typeof entry.levelId === 'string' ? entry.levelId : '';
  const updatedAtRaw = Number(entry.updatedAt);
  const updatedAt = Number.isFinite(updatedAtRaw) ? updatedAtRaw : 0;
  return { source: 'claim', tokenId, levelId, updatedAt };
}

export function detectClaimedTokenLevelTransition(prevEntry, nextEntry) {
  const next = normalizeEntrySnapshot(nextEntry);
  if (!next) {
    return false;
  }
  const prev = normalizeEntrySnapshot(prevEntry);
  if (!prev) {
    return false;
  }
  if (prev.tokenId !== next.tokenId) {
    return true;
  }
  if (prev.levelId !== next.levelId) {
    return true;
  }
  if (prev.updatedAt !== next.updatedAt) {
    return true;
  }
  return false;
}

export function computePlacementNormalizedCenter(placement, options = {}) {
  if (!placement || typeof placement !== 'object') {
    return null;
  }
  const column = Number(placement.column ?? placement.col ?? 0);
  const row = Number(placement.row ?? 0);
  if (!Number.isFinite(column) || !Number.isFinite(row)) {
    return null;
  }
  const widthRaw = Number(placement.width ?? placement.columns ?? 1);
  const heightRaw = Number(placement.height ?? placement.rows ?? 1);
  const width = Number.isFinite(widthRaw) && widthRaw > 0 ? widthRaw : 1;
  const height = Number.isFinite(heightRaw) && heightRaw > 0 ? heightRaw : 1;

  const cellSize = Number(options?.gridSize);
  if (!Number.isFinite(cellSize) || cellSize <= 0) {
    return null;
  }
  const mapWidth = Number(options?.mapPixelSize?.width);
  const mapHeight = Number(options?.mapPixelSize?.height);
  if (!Number.isFinite(mapWidth) || mapWidth <= 0) {
    return null;
  }
  if (!Number.isFinite(mapHeight) || mapHeight <= 0) {
    return null;
  }
  const offsets = options?.gridOffsets ?? null;
  const leftOffset = Number.isFinite(offsets?.left) ? offsets.left : 0;
  const topOffset = Number.isFinite(offsets?.top) ? offsets.top : 0;

  const centerX = leftOffset + (column + width / 2) * cellSize;
  const centerY = topOffset + (row + height / 2) * cellSize;
  const normalizedX = Math.min(1, Math.max(0, centerX / mapWidth));
  const normalizedY = Math.min(1, Math.max(0, centerY / mapHeight));
  if (!Number.isFinite(normalizedX) || !Number.isFinite(normalizedY)) {
    return null;
  }
  return { x: normalizedX, y: normalizedY };
}

export function createLevelViewFollowTracker() {
  const lastEntries = new Map();

  function reset(sceneId) {
    if (sceneId === undefined || sceneId === null) {
      lastEntries.clear();
      return;
    }
    lastEntries.delete(sceneId);
  }

  function consume({ sceneId, userLevelEntry } = {}) {
    if (typeof sceneId !== 'string' || !sceneId) {
      return false;
    }
    const previous = lastEntries.get(sceneId) ?? null;
    const fresh = detectClaimedTokenLevelTransition(previous, userLevelEntry);
    const next = normalizeEntrySnapshot(userLevelEntry);
    if (next) {
      lastEntries.set(sceneId, next);
    } else {
      lastEntries.delete(sceneId);
    }
    return fresh;
  }

  function peek(sceneId) {
    if (typeof sceneId !== 'string' || !sceneId) {
      return null;
    }
    const entry = lastEntries.get(sceneId);
    if (!entry) {
      return null;
    }
    return {
      tokenId: entry.tokenId,
      levelId: entry.levelId,
      updatedAt: entry.updatedAt,
    };
  }

  return { reset, consume, peek };
}
