// Placeholder controls renderer for advancing turns.
export function renderControls(root, { store }) {
  if (!root) return () => {};

  root.innerHTML = `
    <div class="vtt-combat-tracker__controls">
      <button type="button" data-action="previous">Prev</button>
      <button type="button" data-action="next">Next</button>
    </div>
  `;

  function handleClick(event) {
    const action = event.target.dataset.action;
    if (!action) return;

    const state = store.getState();
    if (action === 'next') {
      store.setState({ turnIndex: (state.turnIndex + 1) % Math.max(state.combatants.length, 1) });
    }
    if (action === 'previous') {
      const length = Math.max(state.combatants.length, 1);
      store.setState({ turnIndex: (state.turnIndex - 1 + length) % length });
    }
  }

  root.addEventListener('click', handleClick);

  return () => {
    root.removeEventListener('click', handleClick);
    root.innerHTML = '';
  };
}
