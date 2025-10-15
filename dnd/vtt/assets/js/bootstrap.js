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
import { mountDiceRoller } from './ui/dice-roller.js';
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

  mountSettingsPanel(routes, { getState, subscribe, updateState }, userContext);
  const chatParticipants = Array.isArray(config.chatParticipants) ? config.chatParticipants : [];
  mountChatPanel(routes, userContext, chatParticipants);
  mountBoardInteractions({ getState, subscribe, updateState }, routes);
  mountDragRuler();
  mountDiceRoller();

  await hydrateFromServer(routes);
}

async function hydrateFromServer(routes) {
  try {
    const [scenes, tokens] = await Promise.all([
      routes.scenes ? fetchScenes(routes.scenes) : [],
      routes.tokens ? fetchTokens(routes.tokens) : [],
    ]);

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
