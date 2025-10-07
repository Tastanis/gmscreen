const listeners = new Set();

const state = {
  scenes: [],
  tokens: [],
  boardState: { activeSceneId: null, placements: {}, mapUrl: null },
  grid: { size: 64, locked: false, visible: true },
};

export function initializeState(snapshot = {}) {
  state.scenes = snapshot.scenes ?? [];
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
