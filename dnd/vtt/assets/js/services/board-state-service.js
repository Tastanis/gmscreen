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

  return Object.keys(payload).length > 0 ? payload : null;
}
