import {
  initializeState,
  getState,
  subscribe,
  updateState,
  restrictTokensToPlayerView,
  restrictPlacementsToPlayerView,
} from './state/store.js';

// Default scene ID used when no scene is explicitly selected.
// This allows drawings, templates, and other per-scene data to persist
// even when the user hasn't created or activated a scene.
const DEFAULT_SCENE_ID = '_default';
import { mountSettingsPanel } from './ui/settings-panel.js';
import { mountChatPanel } from './ui/chat-panel.js';
import { mountBoardInteractions } from './ui/board-interactions.js';
import { mountDragRuler } from './ui/drag-ruler.js';
import { mountDrawingTool } from './ui/drawing-tool.js';
import { mountDiceRoller } from './ui/dice-roller.js';
import { mountMemoryMonitor } from './ui/memory-monitor.js'; // [REMOVABLE] Memory monitor widget
import { fetchScenes } from './services/scene-service.js';
import { fetchTokens } from './services/token-service.js';
import { fetchBoardState } from './services/board-state-service.js';
import {
  BASE_MAP_LEVEL_ID,
  normalizeMapLevelsState,
  resolvePcTokenLevelIdForUser,
} from './state/normalize/map-levels.js';

async function bootstrap() {
  const config = window.vttConfig ?? {};
  const routes = config.routes ?? {};

  const userContext = {
    isGM: Boolean(config.isGM),
    name: typeof config.currentUser === 'string' ? config.currentUser : '',
  };

  const rawBoardState =
    config.boardState && typeof config.boardState === 'object' ? config.boardState : {};
  const initialBoardState = userContext.isGM
    ? rawBoardState
    : {
        ...rawBoardState,
        placements: restrictPlacementsToPlayerView(rawBoardState.placements ?? {}),
        // Reset metadata for non-GM users to prevent them from inheriting
        // GM-authored metadata which would cause the poller authority check
        // to incorrectly trigger and skip new placement syncs.
        metadata: {
          ...(rawBoardState.metadata ?? {}),
          authorIsGm: false,
          authorRole: 'player',
        },
      };

  initializeState({
    scenes: config.scenes,
    tokens: config.tokens,
    boardState: initialBoardState,
    user: userContext,
  });

  const storeApi = { getState, subscribe, updateState };

  mountSettingsPanel(routes, storeApi, userContext);
  const chatParticipants = Array.isArray(config.chatParticipants) ? config.chatParticipants : [];
  mountChatPanel(routes, userContext, chatParticipants);
  mountBoardInteractions(storeApi, routes);
  mountDragRuler();
  mountDrawingTool({
    onDrawingChange: (drawings) => {
      const currentState = getState();
      // Use the active scene ID or fall back to the default scene ID.
      // This allows drawings to persist even when no scene is selected.
      const sceneId = currentState?.boardState?.activeSceneId || DEFAULT_SCENE_ID;

      // Add timestamps to drawings for conflict resolution
      const timestamp = Date.now();
      const drawingsWithTimestamps = drawings.map((drawing) => ({
        ...drawing,
        _lastModified: drawing._lastModified || timestamp,
      }));

      updateState((draft) => {
        if (!draft.boardState.drawings) {
          draft.boardState.drawings = {};
        }
        draft.boardState.drawings[sceneId] = drawingsWithTimestamps;
      });
    },
    getCurrentUserId: () => {
      const currentState = getState();
      const rawName = typeof currentState?.user?.name === 'string' ? currentState.user.name : '';
      const normalized = rawName.trim().toLowerCase();
      return normalized || null;
    },
  });
  mountDiceRoller();
  mountMemoryMonitor({ getState }); // [REMOVABLE] Memory monitor widget

  await hydrateFromServer(routes, userContext);
}

async function hydrateFromServer(routes, userContext) {
  const isGM = Boolean(userContext?.isGM);

  try {
    // Only GM can access scenes.php directly - players get scene data from state.php
    const [scenesResult, tokensResult, boardStateResult] = await Promise.all([
      isGM && routes.scenes ? fetchScenes(routes.scenes) : Promise.resolve([]),
      routes.tokens ? fetchTokens(routes.tokens) : Promise.resolve([]),
      routes.state ? fetchBoardState(routes.state) : Promise.resolve(null),
    ]);

    const scenes = boardStateResult?.scenes ?? scenesResult;
    const tokens = boardStateResult?.tokens ?? tokensResult;
    const boardStateSnapshot = boardStateResult?.boardState ?? null;

    const currentState = getState();
    // Use the fresh isGM value from the current state (which may have been updated)
    // instead of the initial userContext value. Renamed to avoid TDZ shadowing issue.
    const currentIsGM = Boolean(currentState?.user?.isGM);

    updateState((draft) => {
      if (scenes) {
        draft.scenes = normalizeSceneState(scenes);
      }
      if (tokens) {
        const normalized = normalizeTokenState(tokens);
        draft.tokens = currentIsGM ? normalized : restrictTokensToPlayerView(normalized);
      }
      if (boardStateSnapshot && typeof boardStateSnapshot === 'object') {
        const normalizedBoard = normalizeBoardStateSnapshot(boardStateSnapshot);
        if (normalizedBoard && Object.keys(normalizedBoard).length > 0) {
          // Preserve existing fogOfWar data so locally-set fog cells are not
          // overwritten when the hydration response replaces sceneState.
          const existingSceneState = draft.boardState?.sceneState;
          const nextBoardState = {
            ...draft.boardState,
            ...normalizedBoard,
          };
          // Re-merge fogOfWar from existing scene entries that had cells.
          // Per-level shape: walk byLevel[levelId].revealedCells.
          if (existingSceneState && typeof existingSceneState === 'object' &&
              nextBoardState.sceneState && typeof nextBoardState.sceneState === 'object') {
            Object.keys(existingSceneState).forEach((sid) => {
              const existingFog = existingSceneState[sid]?.fogOfWar;
              if (!existingFog || typeof existingFog !== 'object') return;
              const existingByLevel = existingFog.byLevel;
              if (!existingByLevel || typeof existingByLevel !== 'object') return;

              const target = nextBoardState.sceneState[sid];
              if (!target || typeof target !== 'object') return;
              if (!target.fogOfWar || typeof target.fogOfWar !== 'object') {
                target.fogOfWar = JSON.parse(JSON.stringify(existingFog));
                return;
              }
              if (!target.fogOfWar.byLevel || typeof target.fogOfWar.byLevel !== 'object'
                  || Array.isArray(target.fogOfWar.byLevel)) {
                target.fogOfWar.byLevel = {};
              }

              Object.keys(existingByLevel).forEach((levelId) => {
                const existingLevel = existingByLevel[levelId];
                if (!existingLevel || typeof existingLevel !== 'object') return;
                const existingCells = existingLevel.revealedCells;
                if (!existingCells || typeof existingCells !== 'object'
                    || Object.keys(existingCells).length === 0) return;

                let targetLevel = target.fogOfWar.byLevel[levelId];
                if (!targetLevel || typeof targetLevel !== 'object') {
                  target.fogOfWar.byLevel[levelId] = JSON.parse(JSON.stringify(existingLevel));
                  return;
                }
                if (!targetLevel.revealedCells || typeof targetLevel.revealedCells !== 'object'
                    || Array.isArray(targetLevel.revealedCells)) {
                  targetLevel.revealedCells = {};
                }
                Object.keys(existingCells).forEach((key) => {
                  if (!(key in targetLevel.revealedCells)) {
                    targetLevel.revealedCells[key] = true;
                  }
                });
              });
            });
          }
          if (!currentIsGM) {
            nextBoardState.placements = restrictPlacementsToPlayerView(
              nextBoardState.placements ?? {}
            );
            // Reset metadata for non-GM users to prevent inheriting GM-authored
            // metadata which would cause the poller authority check to incorrectly
            // trigger and skip syncing new placements from other users.
            nextBoardState.metadata = {
              ...(nextBoardState.metadata ?? {}),
              authorIsGm: false,
              authorRole: 'player',
            };
            applyPcTokenLevelOverride(nextBoardState, currentState?.user?.name);
          }
          draft.boardState = nextBoardState;
        }
      }
    });
  } catch (error) {
    console.warn('[VTT] Failed to hydrate data', error);
  }
}

// On player login, snap the viewer to the level of their claimed PC token
// so a stale `userLevelState[userId]` (mutated by a GM Activate while the
// player was away) does not strand them on the wrong level. The override
// only fires here, on page load — once it writes a fresh entry, the normal
// resolver chain handles in-session navigation. We skip silently when the
// player has zero or 2+ PC-named claims (the existing chain handles those).
function applyPcTokenLevelOverride(nextBoardState, userName) {
  const userKey = typeof userName === 'string' ? userName.trim().toLowerCase() : '';
  if (!userKey) return;
  const sceneId =
    typeof nextBoardState?.activeSceneId === 'string' ? nextBoardState.activeSceneId : '';
  if (!sceneId) return;
  if (!nextBoardState.sceneState || typeof nextBoardState.sceneState !== 'object') {
    nextBoardState.sceneState = {};
  }
  const sceneEntry =
    nextBoardState.sceneState[sceneId] && typeof nextBoardState.sceneState[sceneId] === 'object'
      ? nextBoardState.sceneState[sceneId]
      : null;
  if (!sceneEntry) return;
  const placements = Array.isArray(nextBoardState.placements?.[sceneId])
    ? nextBoardState.placements[sceneId]
    : [];
  const normalizedMapLevels = normalizeMapLevelsState(sceneEntry.mapLevels ?? null, {
    sceneGrid: sceneEntry.grid ?? null,
  });
  const validLevelIds = [BASE_MAP_LEVEL_ID];
  normalizedMapLevels.levels.forEach((level) => {
    if (level && typeof level.id === 'string' && level.id) {
      validLevelIds.push(level.id);
    }
  });
  const pcLevelId = resolvePcTokenLevelIdForUser({
    sceneState: sceneEntry,
    userId: userKey,
    placements,
    validLevelIds,
  });
  if (!pcLevelId) return;
  if (!sceneEntry.userLevelState || typeof sceneEntry.userLevelState !== 'object') {
    sceneEntry.userLevelState = {};
  }
  sceneEntry.userLevelState[userKey] = {
    levelId: pcLevelId,
    _lastModified: Date.now(),
  };
}

document.addEventListener('DOMContentLoaded', bootstrap);

function normalizeBoardStateSnapshot(raw = {}) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const snapshot = {};

  if (Object.prototype.hasOwnProperty.call(raw, 'activeSceneId')) {
    const rawId = raw.activeSceneId;
    snapshot.activeSceneId =
      typeof rawId === 'string'
        ? rawId
        : rawId == null
        ? null
        : String(rawId);
  }

  if (Object.prototype.hasOwnProperty.call(raw, 'mapUrl')) {
    const mapUrl = raw.mapUrl;
    if (typeof mapUrl === 'string') {
      snapshot.mapUrl = mapUrl;
    } else if (mapUrl === null) {
      snapshot.mapUrl = null;
    }
  }

  if (Object.prototype.hasOwnProperty.call(raw, 'thumbnailUrl')) {
    const thumbnailUrl = raw.thumbnailUrl;
    if (typeof thumbnailUrl === 'string') {
      snapshot.thumbnailUrl = thumbnailUrl;
    } else if (thumbnailUrl === null) {
      snapshot.thumbnailUrl = null;
    }
  }

  if (Object.prototype.hasOwnProperty.call(raw, 'placements')) {
    snapshot.placements = cloneBoardSection(raw.placements);
  }

  if (Object.prototype.hasOwnProperty.call(raw, 'sceneState')) {
    snapshot.sceneState = cloneBoardSection(raw.sceneState);
  }

  if (Object.prototype.hasOwnProperty.call(raw, 'templates')) {
    snapshot.templates = cloneBoardSection(raw.templates);
  }

  if (Object.prototype.hasOwnProperty.call(raw, 'drawings')) {
    snapshot.drawings = cloneBoardSection(raw.drawings);
  }

  if (Object.prototype.hasOwnProperty.call(raw, 'pings')) {
    snapshot.pings = Array.isArray(raw.pings) ? [...raw.pings] : [];
  }

  if (Object.prototype.hasOwnProperty.call(raw, 'metadata')) {
    const metadata = cloneBoardSection(raw.metadata);
    if (metadata && typeof metadata === 'object') {
      snapshot.metadata = metadata;
    } else if (raw.metadata === null) {
      snapshot.metadata = null;
    }
  }

  return snapshot;
}

function cloneBoardSection(section) {
  if (!section || typeof section !== 'object') {
    return {};
  }
  try {
    return JSON.parse(JSON.stringify(section));
  } catch (error) {
    return {};
  }
}

function normalizeSceneState(raw = {}) {
  if (Array.isArray(raw)) {
    return { folders: [], items: raw };
  }

  return {
    folders: Array.isArray(raw?.folders) ? raw.folders : [],
    items: Array.isArray(raw?.items)
      ? raw.items
      : Array.isArray(raw?.scenes)
      ? raw.scenes
      : [],
  };
}

function normalizeTokenState(raw = {}) {
  if (Array.isArray(raw)) {
    return { folders: [], items: raw };
  }

  return {
    folders: Array.isArray(raw?.folders) ? raw.folders : [],
    items: Array.isArray(raw?.items)
      ? raw.items
      : Array.isArray(raw?.tokens)
      ? raw.tokens
      : [],
  };
}
