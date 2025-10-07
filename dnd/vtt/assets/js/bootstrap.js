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

  mountSettingsPanel(routes, { getState, subscribe });
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
      draft.scenes = scenes ?? draft.scenes;
      draft.tokens = tokens ?? draft.tokens;
    });
  } catch (error) {
    console.warn('[VTT] Failed to hydrate data', error);
  }
}

document.addEventListener('DOMContentLoaded', bootstrap);
