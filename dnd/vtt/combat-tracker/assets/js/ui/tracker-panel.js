// Placeholder renderer for the combat tracker panel shell.
export function renderTrackerPanel(root, { store }) {
  if (!root) return () => {};

  root.classList.add('vtt-combat-tracker');
  root.innerHTML = `
    <header class="vtt-combat-tracker__header">
      <h2>Combat Tracker</h2>
      <div class="vtt-combat-tracker__round">Round <span data-round>0</span></div>
    </header>
    <div class="vtt-combat-tracker__body" data-initiative-list></div>
  `;

  const roundEl = root.querySelector('[data-round]');

  const unsubscribe = store.subscribe((state) => {
    roundEl.textContent = state.round;
  });

  return () => {
    unsubscribe();
    root.innerHTML = '';
    root.classList.remove('vtt-combat-tracker');
  };
}
