import {
  initializeState,
  getState,
  getIsGm,
  getUserName,
  subscribe,
  updateState,
  updateStateSilently,
  restrictTokensToPlayerView,
  restrictPlacementsToPlayerView,
} from './state/store.js';

// Default scene ID used when no scene is explicitly selected.
// This allows drawings, templates, and other per-scene data to persist
// even when the user hasn't created or activated a scene.
const DEFAULT_SCENE_ID = '_default';
import { mountSettingsPanel } from './ui/settings-panel.js';
import { mountCharacterSummaryPanel } from './ui/character-summary-panel.js';
import { mountChatPanel } from './ui/chat-panel.js';
import { mountBoardInteractions } from './ui/board-interactions.js';
import { mountDragRuler } from './ui/drag-ruler.js';
import { mountDrawingTool } from './ui/drawing-tool.js';
import { mountDiceRoller } from './ui/dice-roller.js';
import { mountMemoryMonitor } from './ui/memory-monitor.js'; // [REMOVABLE] Memory monitor widget
import { fetchScenes } from './services/scene-service.js';
import { fetchTokens } from './services/token-service.js';
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
      };

  initializeState({
    scenes: config.scenes,
    tokens: config.tokens,
    boardState: initialBoardState,
    user: userContext,
  });

  const storeApi = {
    getState,
    getIsGm,
    getUserName,
    subscribe,
    updateState,
    updateStateSilently,
  };

  mountSettingsPanel(routes, storeApi, userContext);
  mountCharacterSummaryPanel(routes, userContext);
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
    const [scenesResult, tokensResult] = await Promise.all([
      isGM && routes.scenes ? fetchScenes(routes.scenes) : Promise.resolve([]),
      routes.tokens ? fetchTokens(routes.tokens) : Promise.resolve([]),
    ]);

    const scenes = isGM ? scenesResult : null;
    const tokens = tokensResult;
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
    });
  } catch (error) {
    console.warn('[VTT] Failed to hydrate data', error);
  }
}

document.addEventListener('DOMContentLoaded', bootstrap);

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
