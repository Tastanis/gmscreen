import { normalizePings } from './normalize/pings.js';
import { applySceneGridState } from './normalize/grid.js';
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
  normalizeOverlayEntry,
  syncBoardOverlayState,
  createEmptyOverlayState,
} from './normalize/overlay.js';
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

let overlayDirty = true;

export function markOverlayDirty() {
  overlayDirty = true;
}

function captureOverlaySignature(boardState) {
  const perSceneOverlay = new Map();
  const sceneState = boardState?.sceneState;
  if (sceneState && typeof sceneState === 'object') {
    for (const id of Object.keys(sceneState)) {
      perSceneOverlay.set(id, sceneState[id]?.overlay ?? null);
    }
  }
  return {
    activeSceneId: boardState?.activeSceneId ?? null,
    overlay: boardState?.overlay ?? null,
    sceneStateRef: boardState?.sceneState ?? null,
    perSceneOverlay,
  };
}

function overlaySignatureChanged(before, after) {
  if (before.activeSceneId !== after.activeSceneId) return true;
  if (before.overlay !== after.overlay) return true;
  if (before.sceneStateRef !== after.sceneStateRef) return true;
  if (before.perSceneOverlay.size !== after.perSceneOverlay.size) return true;
  for (const [id, overlayRef] of after.perSceneOverlay) {
    if (before.perSceneOverlay.get(id) !== overlayRef) return true;
  }
  return false;
}

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
    overlay: createEmptyOverlayState(),
    pings: [],
  },
  grid: { size: 64, locked: false, visible: true },
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
  state.boardState.overlay = normalizeOverlayEntry(
    boardSnapshot.overlay ?? state.boardState.overlay ?? {}
  );
  state.boardState.pings = normalizePings(
    boardSnapshot.pings ?? state.boardState.pings ?? []
  );
  syncBoardOverlayState(state.boardState);
  if (snapshot.grid && typeof snapshot.grid === 'object') {
    state.grid = {
      ...state.grid,
      ...snapshot.grid,
    };
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
  overlayDirty = false;
  notify();
}

export function getState() {
  return JSON.parse(JSON.stringify(state));
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function updateState(updater) {
  const beforeOverlay = captureOverlaySignature(state.boardState);
  updater(state);
  const afterOverlay = captureOverlaySignature(state.boardState);

  // Preserve fogOfWar data across syncBoardOverlayState AND notify().
  // The overlay normalization rebuilds overlay objects on each scene entry,
  // and subscribers triggered by notify() (e.g. poller merge, Pusher sync)
  // can call updateState again and replace draft.boardState entirely.
  // We deep-copy fogOfWar before those steps and restore afterwards.
  const fogSnap = captureFogOfWarSnapshot(state.boardState);

  // Only rebuild overlay state when the overlay / active scene / sceneState
  // slice actually changed since the updater started (or a caller
  // explicitly marked it dirty). Previously ran on every updateState.
  if (overlayDirty || overlaySignatureChanged(beforeOverlay, afterOverlay)) {
    syncBoardOverlayState(state.boardState);
    overlayDirty = false;
  }

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
