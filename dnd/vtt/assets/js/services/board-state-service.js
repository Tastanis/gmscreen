import { queueSave } from '../state/persistence.js';

const SAVE_KEY = 'board-state';
const COMBAT_SAVE_KEY_PREFIX = 'combat-state';

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

export function persistCombatState(endpoint, sceneId, combatState = {}) {
  if (!endpoint) {
    return;
  }

  const payload = buildCombatPayload(sceneId, combatState);
  if (!payload) {
    return;
  }

  const key = `${COMBAT_SAVE_KEY_PREFIX}-${payload.sceneId}`;
  const { sceneId: _sceneId, ...rest } = payload;
  queueSave(key, rest, endpoint);
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
        const combat = formatCombatState(value.combat ?? value.combatState ?? null);
        const entry = { grid };
        if (combat) {
          entry.combat = combat;
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
  const updatedAt = toInt(raw.updatedAt, Date.now());
  const turnLock = sanitizeTurnLock(raw.turnLock ?? null);

  return {
    active,
    round,
    activeCombatantId: activeCombatantId || null,
    completedCombatantIds,
    startingTeam,
    currentTeam,
    lastTeam,
    roundTurnCount,
    updatedAt,
    turnLock,
  };
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
