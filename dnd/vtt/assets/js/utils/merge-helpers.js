/**
 * Board state merge helpers.
 *
 * Extracted from dnd/vtt/assets/js/ui/board-interactions.js as part of the
 * phase 4 refactor. Pure functions — no module-level state, no DOM access,
 * no other imports. All inputs produce deterministic outputs.
 */

export function cloneSectionSimple(section) {
  if (!section || typeof section !== 'object') {
    return {};
  }
  try {
    return JSON.parse(JSON.stringify(section));
  } catch (error) {
    return {};
  }
}

export function cloneArraySimple(arr) {
  if (!Array.isArray(arr)) {
    return [];
  }
  try {
    return JSON.parse(JSON.stringify(arr));
  } catch (error) {
    return [];
  }
}

/**
 * Merge arrays of entities by ID using timestamp-based conflict resolution.
 * Keeps the entry with the higher _lastModified timestamp.
 * @param {Array} existingArray - Current array of entities
 * @param {Array} incomingArray - Incoming array of entities
 * @returns {Array} Merged array with newer entries winning conflicts
 */
export function mergeArrayByIdWithTimestamp(existingArray, incomingArray) {
  const existing = Array.isArray(existingArray) ? existingArray : [];
  const incoming = Array.isArray(incomingArray) ? incomingArray : [];

  const byId = new Map(existing.map((item) => [item.id, item]));

  incoming.forEach((item) => {
    if (item && item.id) {
      const existingItem = byId.get(item.id);
      if (existingItem) {
        const existingTime = existingItem._lastModified || 0;
        const incomingTime = item._lastModified || 0;
        if (incomingTime >= existingTime) {
          byId.set(item.id, item);
        }
      } else {
        byId.set(item.id, item);
      }
    }
  });

  return Array.from(byId.values());
}

/**
 * Merge scene-keyed objects (placements, templates, drawings) with timestamp-based resolution.
 * @param {Object} existingSection - Current scene-keyed object
 * @param {Object} incomingSection - Incoming scene-keyed object
 * @param {Object} options - Merge options
 * @param {boolean} options.fullSync - If true, incoming is authoritative (deletions propagate)
 * @returns {Object} Merged scene-keyed object
 */
export function mergeSceneKeyedSection(existingSection, incomingSection, { fullSync = false } = {}) {
  const existing = existingSection && typeof existingSection === 'object' ? existingSection : {};
  const incoming = incomingSection && typeof incomingSection === 'object' ? incomingSection : {};

  const merged = {};

  const allSceneIds = fullSync
    ? new Set(Object.keys(incoming))
    : new Set([...Object.keys(existing), ...Object.keys(incoming)]);

  allSceneIds.forEach((sceneId) => {
    const existingArray = existing[sceneId];
    const incomingArray = incoming[sceneId];

    if (incomingArray !== undefined) {
      if (fullSync) {
        const incomingItems = Array.isArray(incomingArray) ? incomingArray : [];
        const existingItems = Array.isArray(existingArray) ? existingArray : [];

        if (existingItems.length === 0) {
          try {
            merged[sceneId] = JSON.parse(JSON.stringify(incomingArray));
          } catch (e) {
            merged[sceneId] = [];
          }
        } else {
          const incomingById = new Map();
          incomingItems.forEach((item) => {
            if (item && item.id) incomingById.set(item.id, item);
          });
          const existingById = new Map();
          existingItems.forEach((item) => {
            if (item && item.id) existingById.set(item.id, item);
          });

          const result = [];
          incomingById.forEach((incomingItem, id) => {
            const existingItem = existingById.get(id);
            if (existingItem) {
              const existingTime = existingItem._lastModified || 0;
              const incomingTime = incomingItem._lastModified || 0;
              result.push(incomingTime >= existingTime ? incomingItem : existingItem);
            } else {
              result.push(incomingItem);
            }
          });
          try {
            merged[sceneId] = JSON.parse(JSON.stringify(result));
          } catch (e) {
            merged[sceneId] = result;
          }
        }
      } else {
        merged[sceneId] = mergeArrayByIdWithTimestamp(existingArray, incomingArray);
      }
    } else if (existingArray !== undefined && !fullSync) {
      try {
        merged[sceneId] = JSON.parse(JSON.stringify(existingArray));
      } catch (e) {
        merged[sceneId] = [];
      }
    }
  });

  return merged;
}

/**
 * Merge sceneState while preserving grid settings from existing state.
 * Grid size is a permanent scene setting that should NOT be overwritten by sync.
 * Only combat, overlay, and other transient state should be synced.
 * @param {Object} existingSceneState - Current scene state
 * @param {Object} incomingSceneState - Incoming scene state from server
 * @returns {Object} Merged scene state with preserved grid settings
 */
export function mergeSceneStatePreservingGrid(existingSceneState, incomingSceneState) {
  const existing = existingSceneState && typeof existingSceneState === 'object' ? existingSceneState : {};
  const incoming = incomingSceneState && typeof incomingSceneState === 'object' ? incomingSceneState : {};

  const merged = {};
  const allSceneIds = new Set([...Object.keys(existing), ...Object.keys(incoming)]);

  allSceneIds.forEach((sceneId) => {
    const existingEntry = existing[sceneId];
    const incomingEntry = incoming[sceneId];

    if (!incomingEntry || typeof incomingEntry !== 'object') {
      if (existingEntry && typeof existingEntry === 'object') {
        try {
          merged[sceneId] = JSON.parse(JSON.stringify(existingEntry));
        } catch (e) {
          merged[sceneId] = { grid: { size: 64, locked: false, visible: true } };
        }
      }
      return;
    }

    let mergedEntry;
    try {
      mergedEntry = JSON.parse(JSON.stringify(incomingEntry));
    } catch (e) {
      mergedEntry = {};
    }

    // CRITICAL: Preserve grid settings from existing state — grid is a
    // permanent scene setting, not transient board state.
    if (existingEntry && typeof existingEntry === 'object' && existingEntry.grid) {
      mergedEntry.grid = JSON.parse(JSON.stringify(existingEntry.grid));
    }

    // CRITICAL: Protect combat state from stale server data. A player's
    // keepalive save can overwrite the server's combat state with stale
    // data; the next poll would then revert the GM's changes ("popback").
    // Prefer the newer sequence number (clock-drift immune) or updatedAt.
    if (existingEntry && typeof existingEntry === 'object' &&
        existingEntry.combat && typeof existingEntry.combat === 'object' &&
        mergedEntry.combat && typeof mergedEntry.combat === 'object') {
      const existingSeq = Number(existingEntry.combat.sequence) || 0;
      const incomingSeq = Number(mergedEntry.combat.sequence) || 0;
      const existingTs = Number(existingEntry.combat.updatedAt) || 0;
      const incomingTs = Number(mergedEntry.combat.updatedAt) || 0;

      let keepExisting = false;
      if (existingSeq > 0 && incomingSeq > 0) {
        keepExisting = existingSeq > incomingSeq;
      } else if (existingTs > 0 && incomingTs > 0) {
        keepExisting = existingTs > incomingTs;
      }

      if (keepExisting) {
        mergedEntry.combat = JSON.parse(JSON.stringify(existingEntry.combat));
      }
    }

    // fogOfWar: trust incoming (server) as authoritative so the GM can
    // re-add fog. Only fall back to existing when incoming has none.
    if (existingEntry && typeof existingEntry === 'object' && existingEntry.fogOfWar &&
        typeof existingEntry.fogOfWar === 'object') {
      if (!mergedEntry.fogOfWar || typeof mergedEntry.fogOfWar !== 'object') {
        mergedEntry.fogOfWar = JSON.parse(JSON.stringify(existingEntry.fogOfWar));
      } else if (Array.isArray(mergedEntry.fogOfWar.revealedCells)) {
        // PHP encodes empty {} as [] — coerce back to a plain object.
        mergedEntry.fogOfWar.revealedCells = {};
      }
    }

    if (mergedEntry.fogOfWar && Array.isArray(mergedEntry.fogOfWar.revealedCells)) {
      mergedEntry.fogOfWar.revealedCells = {};
    }

    merged[sceneId] = mergedEntry;
  });

  return merged;
}

/**
 * Merge board state snapshots with timestamp-based conflict resolution for placements, templates, and drawings.
 * This ensures that concurrent updates don't cause data loss.
 * When incoming has _fullSync: true (from GET responses), deletions will propagate correctly.
 * IMPORTANT: Grid settings are NEVER overwritten by sync — they are permanent scene settings.
 * @param {Object} existing - Current board state
 * @param {Object} incoming - Incoming board state from server
 * @returns {Object} Merged board state
 */
export function mergeBoardStateSnapshot(existing, incoming) {
  if (!incoming || typeof incoming !== 'object') {
    return existing ?? {};
  }

  const fullSync = Boolean(incoming._fullSync);

  if (!existing || typeof existing !== 'object') {
    return {
      activeSceneId: typeof incoming.activeSceneId === 'string' ? incoming.activeSceneId : null,
      mapUrl: typeof incoming.mapUrl === 'string' ? incoming.mapUrl : null,
      placements: cloneSectionSimple(incoming.placements),
      sceneState: cloneSectionSimple(incoming.sceneState),
      templates: cloneSectionSimple(incoming.templates),
      drawings: cloneSectionSimple(incoming.drawings),
      overlay: cloneSectionSimple(incoming.overlay),
      pings: cloneArraySimple(incoming.pings),
      metadata: cloneSectionSimple(incoming.metadata ?? incoming.meta),
    };
  }

  const mergeOptions = { fullSync };
  const snapshot = {
    activeSceneId: typeof incoming.activeSceneId === 'string' ? incoming.activeSceneId : existing.activeSceneId,
    mapUrl: typeof incoming.mapUrl === 'string' ? incoming.mapUrl : existing.mapUrl,
    placements: mergeSceneKeyedSection(existing.placements, incoming.placements, mergeOptions),
    sceneState: mergeSceneStatePreservingGrid(existing.sceneState, incoming.sceneState),
    templates: mergeSceneKeyedSection(existing.templates, incoming.templates, mergeOptions),
    drawings: mergeSceneKeyedSection(existing.drawings, incoming.drawings, mergeOptions),
    overlay: cloneSectionSimple(incoming.overlay),
    pings: cloneArraySimple(incoming.pings),
  };

  const metadata = cloneSectionSimple(incoming.metadata ?? incoming.meta);
  if (metadata && typeof metadata === 'object' && Object.keys(metadata).length > 0) {
    snapshot.metadata = metadata;
  }

  return snapshot;
}
