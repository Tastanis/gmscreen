import {
  initializeState,
  getState,
  subscribe,
  updateState,
  restrictTokensToPlayerView,
  restrictPlacementsToPlayerView,
} from './state/store.js';
import { mountSettingsPanel } from './ui/settings-panel.js';
import { mountChatPanel } from './ui/chat-panel.js';
import { mountBoardInteractions } from './ui/board-interactions.js';
import { mountDragRuler } from './ui/drag-ruler.js';
import { mountDrawingTool } from './ui/drawing-tool.js';
import { mountDiceRoller } from './ui/dice-roller.js';
import { fetchScenes } from './services/scene-service.js';
import { fetchTokens } from './services/token-service.js';
import { fetchBoardState } from './services/board-state-service.js';

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

  mountSettingsPanel(routes, { getState, subscribe, updateState }, userContext);
  const chatParticipants = Array.isArray(config.chatParticipants) ? config.chatParticipants : [];
  mountChatPanel(routes, userContext, chatParticipants);
  mountBoardInteractions({ getState, subscribe, updateState }, routes);
  mountDragRuler();
  mountDrawingTool({
    onDrawingChange: (drawings) => {
      const currentState = getState();
      const activeSceneId = currentState?.boardState?.activeSceneId;
      if (!activeSceneId) {
        return;
      }

      updateState((draft) => {
        if (!draft.boardState.drawings) {
          draft.boardState.drawings = {};
        }
        draft.boardState.drawings[activeSceneId] = drawings;
      });
    },
  });
  mountDiceRoller();

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
    const isGM = Boolean(currentState?.user?.isGM);

    updateState((draft) => {
      if (scenes) {
        draft.scenes = normalizeSceneState(scenes);
      }
      if (tokens) {
        const normalized = normalizeTokenState(tokens);
        draft.tokens = isGM ? normalized : restrictTokensToPlayerView(normalized);
      }
      if (boardStateSnapshot && typeof boardStateSnapshot === 'object') {
        const normalizedBoard = normalizeBoardStateSnapshot(boardStateSnapshot);
        if (normalizedBoard && Object.keys(normalizedBoard).length > 0) {
          const nextBoardState = {
            ...draft.boardState,
            ...normalizedBoard,
          };
          if (!isGM) {
            nextBoardState.placements = restrictPlacementsToPlayerView(
              nextBoardState.placements ?? {}
            );
          }
          draft.boardState = nextBoardState;
        }
      }
    });
  } catch (error) {
    console.warn('[VTT] Failed to hydrate data', error);
  }
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

  if (Object.prototype.hasOwnProperty.call(raw, 'overlay')) {
    const overlay = cloneBoardSection(raw.overlay);
    snapshot.overlay = overlay && typeof overlay === 'object' ? overlay : {};
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
