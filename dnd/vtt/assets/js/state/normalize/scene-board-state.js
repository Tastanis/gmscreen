import { normalizeGridState } from './grid.js';
import { normalizeCombatStateEntry } from './combat.js';
import { normalizeFogOfWarEntry } from './fog.js';
import {
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
    const mapLevels = normalizeMapLevelsState(value.mapLevels ?? null, { sceneGrid: grid });
    const fogOfWar = normalizeFogOfWarEntry(value.fogOfWar ?? null);
    const userLevelState = normalizeUserLevelStateMap(value.userLevelState ?? null);
    const entry = { grid, mapLevels, userLevelState };
    // Bootstrap already contains the server-projected canonical geometry. Keep it
    // available to the privacy renderers before the first V2 recovery response.
    if (value.environment && typeof value.environment === 'object' && !Array.isArray(value.environment)) {
      entry.environment = JSON.parse(JSON.stringify(value.environment));
    }
    if (value.pcTokenAssociations && typeof value.pcTokenAssociations === 'object') entry.pcTokenAssociations = Object.fromEntries(Object.entries(value.pcTokenAssociations).map(([id, tokenId]) => [id, typeof tokenId === 'string' ? tokenId : null]));

    if (combat) {
      entry.combat = combat;
    }

    if (fogOfWar !== null) {
      entry.fogOfWar = fogOfWar;
    }

    normalized[key] = entry;
  });

  return normalized;
}
