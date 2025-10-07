import { renderSceneList } from './scene-manager.js';
import { renderTokenLibrary } from './token-library.js';

export function mountSettingsPanel(routes, store) {
  const panel = document.getElementById('vtt-settings-panel');
  if (!panel) return;

  const toggle = document.getElementById('vtt-settings-toggle');
  const closeButton = panel.querySelector('[data-action="close-settings"]');

  let isOpen = false;

  const setOpen = (open) => {
    if (isOpen === open) return;
    isOpen = open;

    panel.classList.toggle('vtt-settings-panel--open', open);
    panel.classList.toggle('vtt-settings-panel--closed', !open);
    panel.setAttribute('aria-hidden', open ? 'false' : 'true');

    if (toggle) {
      toggle.setAttribute('aria-expanded', String(open));
    }
  };

  if (toggle) {
    toggle.addEventListener('click', () => setOpen(!isOpen));
  }

  if (closeButton) {
    closeButton.addEventListener('click', () => setOpen(false));
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isOpen) {
      setOpen(false);
    }
  });

  setOpen(false);

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
