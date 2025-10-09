// Selector helpers for the combat tracker store.
export function selectSortedCombatants(state) {
  return [...state.combatants].sort((a, b) => b.initiative - a.initiative);
}

export function selectActiveCombatant(state) {
  const order = selectSortedCombatants(state);
  return order[state.turnIndex] ?? null;
}
