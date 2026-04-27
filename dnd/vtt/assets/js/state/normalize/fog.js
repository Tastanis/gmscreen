export function normalizeFogOfWarEntry(raw) {
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
      // Deep copy so the snapshot is immune to later mutations or replacements
      snap.set(sceneId, JSON.parse(JSON.stringify(entry.fogOfWar)));
    }
  });
  return snap;
}

/**
 * Verify that each scene entry still has its fogOfWar data. If it was dropped
 * (e.g. the entry was rebuilt as a new object), re-attach the captured reference.
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
      // Entry lost its fogOfWar entirely — restore it.
      entry.fogOfWar = fogOfWar;
      return;
    }

    // Entry still has a fogOfWar object.  Make sure revealedCells were not
    // replaced with an empty object when the snapshot had actual cells.
    const snapCells = fogOfWar.revealedCells;
    const entryCells = entry.fogOfWar.revealedCells;
    if (
      snapCells && typeof snapCells === 'object' &&
      Object.keys(snapCells).length > 0 &&
      (!entryCells || typeof entryCells !== 'object' || Object.keys(entryCells).length === 0)
    ) {
      entry.fogOfWar.revealedCells = snapCells;
    }
  });
}
