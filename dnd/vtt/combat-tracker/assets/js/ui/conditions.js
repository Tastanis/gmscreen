// Inactive shell condition manager. Live condition handling remains on the board.
export function renderConditions(root) {
  if (!root) return () => {};
  root.innerHTML = '';
  return () => {
    root.innerHTML = '';
  };
}
