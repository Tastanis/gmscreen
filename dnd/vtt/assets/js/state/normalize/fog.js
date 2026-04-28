import { BASE_MAP_LEVEL_ID } from './map-levels.js';

function normalizeLevelFogEntry(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const enabled = Boolean(raw.enabled);
  const revealedCells = {};
  if (raw.revealedCells && typeof raw.revealedCells === 'object' && !Array.isArray(raw.revealedCells)) {
    Object.keys(raw.revealedCells).forEach((key) => {
      const parts = key.split(',');
      if (parts.length === 2) {
        const col = parseInt(parts[0], 10);
        const row = parseInt(parts[1], 10);
        if (Number.isFinite(col) && Number.isFinite(row) && col >= 0 && row >= 0) {
          revealedCells[col + ',' + row] = true;
        }
      }
    });
  }
  return { enabled, revealedCells };
}

export function normalizeFogOfWarEntry(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const byLevel = {};

  // New shape: fogOfWar.byLevel[levelId] = { enabled, revealedCells }
  if (raw.byLevel && typeof raw.byLevel === 'object' && !Array.isArray(raw.byLevel)) {
    Object.keys(raw.byLevel).forEach((levelId) => {
      const id = typeof levelId === 'string' ? levelId.trim() : '';
      if (!id) return;
      const entry = normalizeLevelFogEntry(raw.byLevel[levelId]);
      if (entry) {
        byLevel[id] = entry;
      }
    });
  }

  // Legacy migration: top-level { enabled, revealedCells } → byLevel[BASE_MAP_LEVEL_ID].
  // Only apply when no byLevel data is already present, so a partially-migrated
  // object never has the old fields override the new ones.
  if (Object.keys(byLevel).length === 0) {
    const legacy = normalizeLevelFogEntry(raw);
    if (legacy && (legacy.enabled || Object.keys(legacy.revealedCells).length > 0)) {
      byLevel[BASE_MAP_LEVEL_ID] = legacy;
    }
  }

  return { byLevel };
}

/**
 * Snapshot every scene entry's fogOfWar data so it can be restored if a
 * subsequent normalization step or subscriber-triggered updateState call
 * inadvertently replaces or clears the fog data.
 *
 * IMPORTANT: We deep-copy the fogOfWar objects rather than storing references,
 * because a subscriber (e.g. the poller merge) can replace `draft.boardState`
 * entirely during `notify()`, which would make a reference-based snapshot point
 * to the *new* (empty) object instead of preserving the original cells.
 */
export function captureFogOfWarSnapshot(boardState) {
  const snap = new Map();
  if (!boardState || typeof boardState !== 'object') return snap;
  const sceneState = boardState.sceneState;
  if (!sceneState || typeof sceneState !== 'object') return snap;

  Object.keys(sceneState).forEach((sceneId) => {
    const entry = sceneState[sceneId];
    if (entry && typeof entry === 'object' && entry.fogOfWar && typeof entry.fogOfWar === 'object') {
      snap.set(sceneId, JSON.parse(JSON.stringify(entry.fogOfWar)));
    }
  });
  return snap;
}

function cellCount(levelEntry) {
  if (!levelEntry || typeof levelEntry !== 'object') return 0;
  const cells = levelEntry.revealedCells;
  if (!cells || typeof cells !== 'object' || Array.isArray(cells)) return 0;
  return Object.keys(cells).length;
}

/**
 * Verify that each scene entry still has its fogOfWar data. If it was dropped
 * (e.g. the entry was rebuilt as a new object), re-attach the captured reference.
 * Operates per-level so a partial replacement does not erase other levels' fog.
 */
export function restoreFogOfWarSnapshot(boardState, snap) {
  if (!snap || !snap.size) return;
  if (!boardState || typeof boardState !== 'object') return;
  const sceneState = boardState.sceneState;
  if (!sceneState || typeof sceneState !== 'object') return;

  snap.forEach((fogOfWar, sceneId) => {
    const entry = sceneState[sceneId];
    if (!entry || typeof entry !== 'object') return;

    if (!entry.fogOfWar || typeof entry.fogOfWar !== 'object') {
      entry.fogOfWar = fogOfWar;
      return;
    }

    if (!entry.fogOfWar.byLevel || typeof entry.fogOfWar.byLevel !== 'object'
        || Array.isArray(entry.fogOfWar.byLevel)) {
      entry.fogOfWar.byLevel = {};
    }

    const snapByLevel = fogOfWar?.byLevel;
    if (!snapByLevel || typeof snapByLevel !== 'object') return;

    Object.keys(snapByLevel).forEach((levelId) => {
      const snapLevel = snapByLevel[levelId];
      const snapCount = cellCount(snapLevel);
      if (snapCount === 0) return;

      const currentLevel = entry.fogOfWar.byLevel[levelId];
      if (!currentLevel || cellCount(currentLevel) === 0) {
        // Preserve the enabled flag from currentLevel if it's set, since the
        // snapshot may predate a toggle change. Only the cells are restored.
        if (currentLevel && typeof currentLevel === 'object') {
          currentLevel.revealedCells = JSON.parse(JSON.stringify(snapLevel.revealedCells));
        } else {
          entry.fogOfWar.byLevel[levelId] = JSON.parse(JSON.stringify(snapLevel));
        }
      }
    });
  });
}
