// Inactive shell list. Live combatant rendering is owned by the board tracker.
export function renderInitiativeList(root) {
  if (!root) return () => {};
  root.innerHTML = '';
  return () => {
    root.innerHTML = '';
  };
}
