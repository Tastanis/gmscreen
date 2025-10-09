import { renderSceneList } from './scene-manager.js';
import { renderTokenLibrary } from './token-library.js';
import { persistBoardState } from '../services/board-state-service.js';

export function mountSettingsPanel(routes, store, user = {}) {
  const panel = document.getElementById('vtt-settings-panel');
  if (!panel) return;

  const toggle = document.getElementById('vtt-settings-toggle');
  const closeButton = panel.querySelector('[data-action="close-settings"]');
  const toggleGridButton = panel.querySelector('[data-action="toggle-grid"]');
  const lockGridButton = panel.querySelector('[data-action="lock-grid"]');
  const gridSizeInput = panel.querySelector('[data-grid-size-input]');
  const gridSizeDisplay = panel.querySelector('[data-grid-size-display]');

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

  const storeApi = store ?? {};
  const initialState = typeof storeApi.getState === 'function' ? storeApi.getState() : {};
  const isGM = Boolean(user?.isGM ?? initialState?.user?.isGM);

  const persistBoardStateSnapshot = () => {
    if (!routes?.state || typeof storeApi.getState !== 'function') {
      return;
    }

    const latest = storeApi.getState();
    if (!latest?.user?.isGM) {
      return;
    }

    const boardState = latest?.boardState ?? null;
    if (!boardState || typeof boardState !== 'object') {
      return;
    }

    persistBoardState(routes.state, boardState);
  };

  const syncGridControls = (state) => {
    const gridState = state?.grid ?? {};
    const parsedSize = Number.parseInt(gridState.size, 10);
    const size = Number.isFinite(parsedSize) ? parsedSize : 64;
    const visible = gridState.visible ?? true;
    const locked = gridState.locked ?? false;

    if (gridSizeInput) {
      gridSizeInput.value = String(size);
      gridSizeInput.disabled = locked;
    }

    if (gridSizeDisplay) {
      gridSizeDisplay.textContent = String(size);
    }

    if (toggleGridButton) {
      toggleGridButton.textContent = visible ? 'Hide Grid' : 'Show Grid';
      toggleGridButton.setAttribute('aria-pressed', String(visible));
    }

    if (lockGridButton) {
      lockGridButton.textContent = locked ? 'Unlock Grid' : 'Lock Grid';
      lockGridButton.classList.toggle('is-active', locked);
      lockGridButton.setAttribute('aria-pressed', String(locked));
    }
  };

  syncGridControls(storeApi.getState?.());

  if (typeof storeApi.subscribe === 'function') {
    storeApi.subscribe((state) => syncGridControls(state));
  }

  const ensureGridDraft = (draft) => {
    if (!draft.grid || typeof draft.grid !== 'object') {
      draft.grid = { size: 64, locked: false, visible: true };
    }
  };

  const syncGridToActiveScene = (draft) => {
    if (!draft || typeof draft !== 'object') {
      return;
    }

    if (!draft.boardState || typeof draft.boardState !== 'object') {
      draft.boardState = { activeSceneId: null, mapUrl: null, placements: {}, sceneState: {} };
    }

    if (!draft.boardState.sceneState || typeof draft.boardState.sceneState !== 'object') {
      draft.boardState.sceneState = {};
    }

    const activeSceneId = draft.boardState.activeSceneId;
    if (!activeSceneId) {
      return;
    }

    const size = Math.max(8, Number.parseInt(draft.grid.size, 10) || 64);
    const locked = Boolean(draft.grid.locked);
    const visible = draft.grid.visible === undefined ? true : Boolean(draft.grid.visible);

    const entry = draft.boardState.sceneState[activeSceneId] ?? {};
    entry.grid = { size, locked, visible };
    draft.boardState.sceneState[activeSceneId] = entry;
  };

  if (gridSizeInput && typeof storeApi.updateState === 'function') {
    gridSizeInput.addEventListener('input', () => {
      const nextSize = Number.parseInt(gridSizeInput.value, 10);
      if (!Number.isFinite(nextSize)) return;

      storeApi.updateState((draft) => {
        ensureGridDraft(draft);
        draft.grid.size = Math.max(8, nextSize);
        syncGridToActiveScene(draft);
      });
      persistBoardStateSnapshot();
    });
  }

  if (toggleGridButton && typeof storeApi.updateState === 'function') {
    toggleGridButton.addEventListener('click', () => {
      storeApi.updateState((draft) => {
        ensureGridDraft(draft);
        draft.grid.visible = !draft.grid.visible;
        syncGridToActiveScene(draft);
      });
      persistBoardStateSnapshot();
    });
  }

  if (lockGridButton && typeof storeApi.updateState === 'function') {
    lockGridButton.addEventListener('click', () => {
      storeApi.updateState((draft) => {
        ensureGridDraft(draft);
        draft.grid.locked = !draft.grid.locked;
        syncGridToActiveScene(draft);
      });
      persistBoardStateSnapshot();
    });
  }

  if (isGM) {
    renderSceneList(routes, storeApi);
  }
  renderTokenLibrary(routes, storeApi, { isGM });
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
