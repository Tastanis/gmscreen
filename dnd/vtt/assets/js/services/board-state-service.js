import { queueSave } from '../state/persistence.js';

const SAVE_KEY = 'board-state';

export function persistBoardState(endpoint, boardState = {}) {
  if (!endpoint) {
    return;
  }

  const payload = buildPayload(boardState);
  if (!payload) {
    return;
  }

  queueSave(SAVE_KEY, { boardState: payload }, endpoint);
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
        normalized[key] = { grid };
      });

      payload.sceneState = normalized;
    }
  }

  return Object.keys(payload).length > 0 ? payload : null;
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
