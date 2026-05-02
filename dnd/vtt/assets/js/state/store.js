import { normalizePings } from './normalize/pings.js';
import { applySceneGridState, normalizeGridState } from './normalize/grid.js';
import { normalizeTemplates } from './normalize/templates.js';
import { normalizeDrawings } from './normalize/drawings.js';
import {
  captureFogOfWarSnapshot,
  restoreFogOfWarSnapshot,
} from './normalize/fog.js';
import { normalizeMonsterSnapshot } from './normalize/monsters.js';
import { normalizeScenes } from './normalize/scenes.js';
import {
  normalizePlacements,
  restrictPlacementsToPlayerView,
} from './normalize/placements.js';
import {
  PLAYER_VISIBLE_TOKEN_FOLDER,
  normalizePlayerTokenFolderName,
  normalizeTokens,
  restrictTokensToPlayerView,
} from './normalize/tokens.js';
import { normalizeSceneBoardState } from './normalize/scene-board-state.js';

export {
  normalizeMonsterSnapshot,
  PLAYER_VISIBLE_TOKEN_FOLDER,
  normalizePlayerTokenFolderName,
  restrictTokensToPlayerView,
  restrictPlacementsToPlayerView,
};

const listeners = new Set();

const state = {
  scenes: { folders: [], items: [] },
  tokens: { folders: [], items: [] },
  boardState: {
    activeSceneId: null,
    placements: {},
    mapUrl: null,
    thumbnailUrl: null,
    sceneState: {},
    templates: {},
    drawings: {},
    pings: [],
  },
  grid: { size: 64, locked: false, visible: true, offsetX: 0, offsetY: 0 },
  user: { isGM: false, name: '' },
};

export function initializeState(snapshot = {}) {
  state.scenes = normalizeScenes(snapshot.scenes);
  state.tokens = normalizeTokens(snapshot.tokens);
  const boardSnapshot = snapshot.boardState && typeof snapshot.boardState === 'object' ? snapshot.boardState : {};
  state.boardState = {
    ...state.boardState,
    ...boardSnapshot,
  };
  state.boardState.placements = normalizePlacements(
    boardSnapshot.placements ?? state.boardState.placements ?? {}
  );
  state.boardState.sceneState = normalizeSceneBoardState(
    boardSnapshot.sceneState ?? state.boardState.sceneState ?? {}
  );
  state.boardState.templates = normalizeTemplates(
    boardSnapshot.templates ?? state.boardState.templates ?? {}
  );
  state.boardState.drawings = normalizeDrawings(
    boardSnapshot.drawings ?? state.boardState.drawings ?? {}
  );
  state.boardState.pings = normalizePings(
    boardSnapshot.pings ?? state.boardState.pings ?? []
  );
  if (snapshot.grid && typeof snapshot.grid === 'object') {
    state.grid = normalizeGridState({
      ...state.grid,
      ...snapshot.grid,
    });
  }

  applySceneGridState(state);

  const snapshotUser = snapshot.user && typeof snapshot.user === 'object' ? snapshot.user : {};
  const isGM = Boolean(
    snapshotUser.isGM ?? snapshot.isGM ?? snapshotUser.gm ?? snapshot?.user?.is_gm
  );
  const name =
    typeof snapshotUser.name === 'string'
      ? snapshotUser.name
      : typeof snapshot.currentUser === 'string'
      ? snapshot.currentUser
      : '';

  state.user = { isGM, name };

  if (!state.user.isGM) {
    state.boardState.placements = restrictPlacementsToPlayerView(state.boardState.placements);
    state.tokens = restrictTokensToPlayerView(state.tokens);
  }
  notify();
}

export function getState() {
  return JSON.parse(JSON.stringify(state));
}

export function getIsGm() {
  return state.user?.isGM === true;
}

export function getUserName() {
  return typeof state.user?.name === 'string' ? state.user.name : '';
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function updateState(updater) {
  updater(state);

  // Preserve fogOfWar data across notify(). Subscribers triggered by
  // notify() (e.g. poller merge, Pusher sync) can call updateState again
  // and replace draft.boardState entirely. Deep-copy fogOfWar before
  // those steps and restore afterwards.
  const fogSnap = captureFogOfWarSnapshot(state.boardState);

  restoreFogOfWarSnapshot(state.boardState, fogSnap);

  if (!state.user?.isGM) {
    state.boardState.placements = restrictPlacementsToPlayerView(state.boardState.placements);
    state.tokens = restrictTokensToPlayerView(state.tokens);
  }
  state.boardState.pings = normalizePings(state.boardState.pings);
  notify();

  // After notify(), subscribers may have triggered nested updateState calls
  // that replaced boardState (e.g. the poller merging server state).
  // Re-check and restore fog data if it was lost during notification.
  restoreFogOfWarSnapshot(state.boardState, fogSnap);
}

function notify() {
  listeners.forEach((listener) => listener(getState()));
}
