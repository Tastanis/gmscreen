// Placeholder condition manager.
export function renderConditions(root, { store }) {
  if (!root) return () => {};

  root.innerHTML = '<div class="vtt-combat-tracker__conditions">Conditions TBD</div>';

  const unsubscribe = store.subscribe((state) => {
    const active = state.combatants[state.turnIndex];
    root.querySelector('.vtt-combat-tracker__conditions').textContent = active?.conditions?.join(', ') || 'No conditions';
  });

  return () => {
    unsubscribe();
    root.innerHTML = '';
  };
}
