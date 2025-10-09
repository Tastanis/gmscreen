// Placeholder combat tracker store slice.
// Intended to integrate with the core VTT state manager via dependency injection.
export function createCombatTrackerStore(initialState = {}) {
  const state = {
    sceneId: null,
    round: 0,
    turnIndex: 0,
    combatants: [],
    ...initialState
  };

  const subscribers = new Set();

  function getState() {
    return { ...state };
  }

  function setState(partial) {
    Object.assign(state, partial);
    subscribers.forEach((fn) => fn(getState()));
  }

  function subscribe(fn) {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  }

  return { getState, setState, subscribe };
}
