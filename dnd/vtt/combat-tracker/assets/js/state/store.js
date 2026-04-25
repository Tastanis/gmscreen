import { normalizeCombatState } from '../../../../assets/js/combat/combat-state.js';

export function createCombatTrackerStore(initialState = {}) {
  let state = normalizeCombatState(initialState);
  const subscribers = new Set();

  function getState() {
    return cloneCombatState(state);
  }

  function setState(partial) {
    const patch = partial && typeof partial === 'object' ? partial : {};
    const nextState = {
      ...state,
      ...patch,
    };
    if (
      !Object.prototype.hasOwnProperty.call(patch, 'turnPhase') &&
      (Object.prototype.hasOwnProperty.call(patch, 'active') ||
        Object.prototype.hasOwnProperty.call(patch, 'activeCombatantId'))
    ) {
      delete nextState.turnPhase;
    }
    state = normalizeCombatState(nextState);
    subscribers.forEach((fn) => fn(getState()));
  }

  function subscribe(fn) {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  }

  return { getState, setState, subscribe };
}

function cloneCombatState(state) {
  const source = normalizeCombatState(state);
  return {
    ...source,
    completedCombatantIds: [...source.completedCombatantIds],
    turnLock: source.turnLock ? { ...source.turnLock } : null,
    lastEffect: source.lastEffect ? { ...source.lastEffect } : null,
    groups: source.groups.map((group) => ({
      representativeId: group.representativeId,
      memberIds: [...group.memberIds],
    })),
  };
}
