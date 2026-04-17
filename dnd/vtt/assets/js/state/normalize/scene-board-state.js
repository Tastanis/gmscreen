import { normalizeGridState } from './grid.js';
import { normalizeCombatStateEntry } from './combat.js';
import { normalizeOverlayEntry } from './overlay.js';
import { normalizeFogOfWarEntry } from './fog.js';

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
    const fogOfWar = normalizeFogOfWarEntry(value.fogOfWar ?? null);
    const entry = { grid };

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
