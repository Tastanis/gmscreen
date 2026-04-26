import { normalizeGridState } from './grid.js';
import { normalizeCombatStateEntry } from './combat.js';
import { normalizeOverlayEntry } from './overlay.js';
import { normalizeFogOfWarEntry } from './fog.js';
import {
  normalizeClaimedTokensMap,
  normalizeMapLevelsState,
  normalizeUserLevelStateMap,
} from './map-levels.js';

export function normalizeSceneBoardState(raw = {}) {
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
    const mapLevels = normalizeMapLevelsState(value.mapLevels ?? null, { sceneGrid: grid });
    const fogOfWar = normalizeFogOfWarEntry(value.fogOfWar ?? null);
    const claimedTokens = normalizeClaimedTokensMap(value.claimedTokens ?? null);
    const userLevelState = normalizeUserLevelStateMap(value.userLevelState ?? null);
    const entry = { grid, mapLevels, claimedTokens, userLevelState };

    if (combat) {
      entry.combat = combat;
    }

    entry.overlay = overlay;

    if (fogOfWar !== null) {
      entry.fogOfWar = fogOfWar;
    }

    normalized[key] = entry;
  });

  return normalized;
}
