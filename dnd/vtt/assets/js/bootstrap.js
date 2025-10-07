import {
  initializeState,
  getState,
  subscribe,
  updateState,
} from './state/store.js';
import { mountSettingsPanel } from './ui/settings-panel.js';
import { mountChatPanel } from './ui/chat-panel.js';
import { mountBoardInteractions } from './ui/board-interactions.js';
import { mountDragRuler } from './ui/drag-ruler.js';
import { fetchScenes } from './services/scene-service.js';
import { fetchTokens } from './services/token-service.js';

async function bootstrap() {
  const config = window.vttConfig ?? {};
  const routes = config.routes ?? {};

  initializeState({
    scenes: config.scenes,
    tokens: config.tokens,
    boardState: config.boardState,
  });

  mountSettingsPanel(routes, { getState, subscribe, updateState });
  mountChatPanel(routes);
  mountBoardInteractions({ getState, subscribe, updateState }, routes);
  mountDragRuler();

  await hydrateFromServer(routes);
}

async function hydrateFromServer(routes) {
  try {
    const [scenes, tokens] = await Promise.all([
      routes.scenes ? fetchScenes(routes.scenes) : [],
      routes.tokens ? fetchTokens(routes.tokens) : [],
    ]);

    updateState((draft) => {
      if (scenes) {
        draft.scenes = normalizeSceneState(scenes);
      }
      if (tokens) {
        draft.tokens = normalizeTokenState(tokens);
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
