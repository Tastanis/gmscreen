// Inactive shell controls. Live turn controls are owned by the board tracker.
export function renderControls(root) {
  if (!root) return () => {};
  root.innerHTML = '';
  return () => {
    root.innerHTML = '';
  };
}
