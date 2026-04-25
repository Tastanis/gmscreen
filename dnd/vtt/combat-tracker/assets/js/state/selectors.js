// Selector helpers for the combat tracker store.
export function selectSortedCombatants(state = {}) {
  const combatants = Array.isArray(state?.combatants) ? state.combatants : [];
  return [...combatants].sort((a, b) => {
    const bInitiative = Number(b?.initiative ?? 0);
    const aInitiative = Number(a?.initiative ?? 0);
    return bInitiative - aInitiative;
  });
}

export function selectActiveCombatant(state = {}) {
  const order = selectSortedCombatants(state);
  const activeId = typeof state?.activeCombatantId === 'string' ? state.activeCombatantId : '';
  if (activeId) {
    return order.find((combatant) => combatant?.id === activeId) ?? null;
  }
  const turnIndex = Number.isInteger(state?.turnIndex) ? state.turnIndex : 0;
  return order[turnIndex] ?? null;
}
