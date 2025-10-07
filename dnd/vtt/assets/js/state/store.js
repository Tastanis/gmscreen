const listeners = new Set();

const state = {
  scenes: [],
  tokens: [],
  boardState: { activeSceneId: null, placements: {} },
  grid: { size: 64, locked: false, visible: true },
};

export function initializeState(snapshot = {}) {
  state.scenes = snapshot.scenes ?? [];
  state.tokens = snapshot.tokens ?? [];
  state.boardState = snapshot.boardState ?? state.boardState;
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
