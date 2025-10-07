const listeners = new Set();

const state = {
  scenes: { folders: [], items: [] },
  tokens: [],
  boardState: { activeSceneId: null, placements: {}, mapUrl: null },
  grid: { size: 64, locked: false, visible: true },
};

export function initializeState(snapshot = {}) {
  state.scenes = normalizeScenes(snapshot.scenes);
  state.tokens = snapshot.tokens ?? [];
  if (snapshot.boardState && typeof snapshot.boardState === 'object') {
    state.boardState = {
      ...state.boardState,
      ...snapshot.boardState,
    };
  }
  if (snapshot.grid && typeof snapshot.grid === 'object') {
    state.grid = {
      ...state.grid,
      ...snapshot.grid,
    };
  }
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
  updater(state);
  notify();
}

function notify() {
  listeners.forEach((listener) => listener(getState()));
}

function normalizeScenes(raw = {}) {
  if (Array.isArray(raw)) {
    return { folders: [], items: raw };
  }

  const folders = Array.isArray(raw?.folders) ? raw.folders : [];
  const items = Array.isArray(raw?.items)
    ? raw.items
    : Array.isArray(raw?.scenes)
    ? raw.scenes
    : [];

  return {
    folders: folders.filter((folder) => folder && typeof folder.id === 'string'),
    items: items.filter((scene) => scene && typeof scene.id === 'string'),
  };
}
