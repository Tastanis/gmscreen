export const GRID_SIZE_MIN = 8;
export const GRID_SIZE_MAX = 320;
export const GRID_SIZE_DEFAULT = 64;

function toFiniteNumber(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function roundGridValue(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function normalizeGridOffset(value, size = GRID_SIZE_DEFAULT) {
  const numeric = toFiniteNumber(value);
  const gridSize = Number.isFinite(size) && size > 0 ? size : GRID_SIZE_DEFAULT;
  if (numeric === null) {
    return 0;
  }

  const normalized = ((numeric % gridSize) + gridSize) % gridSize;
  if (normalized >= gridSize - 0.01 || normalized < 0.01) {
    return 0;
  }

  return roundGridValue(normalized);
}

export function normalizeGridState(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const size = toFiniteNumber(source.size);
  const resolvedSize =
    size === null
      ? GRID_SIZE_DEFAULT
      : roundGridValue(Math.max(GRID_SIZE_MIN, Math.min(GRID_SIZE_MAX, size)));

  return {
    size: resolvedSize,
    locked: Boolean(source.locked),
    visible: source.visible === undefined ? true : Boolean(source.visible),
    offsetX: normalizeGridOffset(source.offsetX ?? source.originX ?? source.x ?? 0, resolvedSize),
    offsetY: normalizeGridOffset(source.offsetY ?? source.originY ?? source.y ?? 0, resolvedSize),
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
