// Inactive shell panel. The board-mounted tracker remains the live UI.
export function renderTrackerPanel(root) {
  if (!root) return () => {};

  root.classList.add('vtt-combat-tracker');
  root.dataset.initialized = 'false';
  root.innerHTML = '';

  return () => {
    root.innerHTML = '';
    root.classList.remove('vtt-combat-tracker');
  };
}
