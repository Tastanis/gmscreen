import { renderSceneList } from './scene-manager.js';
import { renderTokenLibrary } from './token-library.js';

export function mountSettingsPanel(routes, store) {
  const panel = document.querySelector('[data-module="vtt-settings"]');
  if (!panel) return;

  const toggle = panel.querySelector('[data-action="toggle-settings"]');
  if (toggle) {
    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!expanded));
      panel.classList.toggle('is-collapsed');
    });
  }

  panel.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-settings-tab]');
    if (!tab) return;

    const tabId = tab.getAttribute('data-settings-tab');
    setActiveTab(panel, tabId);
  });

  renderSceneList(routes, store);
  renderTokenLibrary(routes, store);
}

function setActiveTab(panel, tabId) {
  const tabs = panel.querySelectorAll('.settings-tab');
  const views = panel.querySelectorAll('[data-settings-view]');

  tabs.forEach((tab) => {
    const isActive = tab.getAttribute('data-settings-tab') === tabId;
    tab.classList.toggle('is-active', isActive);
  });

  views.forEach((view) => {
    const isActive = view.getAttribute('data-settings-view') === tabId;
    view.toggleAttribute('hidden', !isActive);
  });
}
