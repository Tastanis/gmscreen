export function normalizeGridState(raw = {}) {
  const sizeValue = Number.parseInt(raw.size, 10);
  const size = Number.isFinite(sizeValue) ? sizeValue : Number(raw.size);
  const resolvedSize = Number.isFinite(size) ? Math.max(8, Math.min(320, Math.trunc(size))) : 64;

  return {
    size: resolvedSize,
    locked: Boolean(raw.locked),
    visible: raw.visible === undefined ? true : Boolean(raw.visible),
  };
}

export function applySceneGridState(state) {
  if (!state || !state.boardState) {
    return;
  }

  const activeSceneId = state.boardState.activeSceneId;
  if (!activeSceneId) {
    return;
  }

  // CRITICAL: Read grid from the scene's PERMANENT grid property first.
  // Grid is stored with the scene definition and should be the authoritative source.
  // This prevents grid resets when polling/Pusher updates arrive with stale grid values.
  const scenes = state.scenes?.items ?? [];
  const activeScene = scenes.find((scene) => scene && scene.id === activeSceneId);

  if (activeScene && activeScene.grid) {
    // Use the scene's permanent grid property
    const gridState = normalizeGridState(activeScene.grid);
    state.grid = {
      ...state.grid,
      ...gridState,
    };

    // Also update the sceneState entry to match the scene's permanent grid
    // This ensures consistency between the scene definition and the board state
    if (state.boardState.sceneState && state.boardState.sceneState[activeSceneId]) {
      state.boardState.sceneState[activeSceneId].grid = gridState;
    }
    return;
  }

  // Fallback to boardState.sceneState if scene definition not available
  // (this shouldn't happen in normal operation, but provides backwards compatibility)
  const sceneState = state.boardState.sceneState ?? {};
  if (!sceneState || typeof sceneState !== 'object') {
    return;
  }

  const sceneEntry = sceneState[activeSceneId];
  if (!sceneEntry || typeof sceneEntry !== 'object') {
    return;
  }

  const gridState = normalizeGridState(sceneEntry.grid ?? sceneEntry);
  state.grid = {
    ...state.grid,
    ...gridState,
  };
}
