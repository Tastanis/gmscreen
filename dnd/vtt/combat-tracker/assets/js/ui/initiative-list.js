// Placeholder initiative list renderer.
import { selectSortedCombatants, selectActiveCombatant } from '../state/selectors.js';

export function renderInitiativeList(root, { store }) {
  if (!root) return () => {};

  root.innerHTML = '<ol class="vtt-combat-tracker__list"></ol>';
  const list = root.querySelector('ol');

  const unsubscribe = store.subscribe((state) => {
    const combatants = selectSortedCombatants(state);
    const active = selectActiveCombatant(state);

    list.innerHTML = combatants.map((combatant) => {
      const isActive = active && active.id === combatant.id;
      return `
        <li class="vtt-combat-tracker__item ${isActive ? 'is-active' : ''}">
          <span class="vtt-combat-tracker__name">${combatant.name ?? 'Unknown'}</span>
          <span class="vtt-combat-tracker__initiative">${combatant.initiative ?? '-'}</span>
        </li>
      `;
    }).join('');
  });

  return () => {
    unsubscribe();
    root.innerHTML = '';
  };
}
