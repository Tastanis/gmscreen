import { renderSceneList } from './scene-manager.js';
import { renderTokenLibrary } from './token-library.js';
import { persistBoardState } from '../services/board-state-service.js';
import { updateSceneGrid } from '../services/scene-service.js';
import { normalizeGridState } from '../state/normalize/grid.js';

export function mountSettingsPanel(routes, store, user = {}) {
  const panel = document.getElementById('vtt-settings-panel');
  if (!panel) return;

  const title = panel.querySelector('[data-settings-title]');
  const closeButton = panel.querySelector('[data-action="close-settings"]');
  const toggleGridButton = panel.querySelector('[data-action="toggle-grid"]');
  const lockGridButton = panel.querySelector('[data-action="lock-grid"]');
  const calibrateGridButton = panel.querySelector('[data-action="calibrate-grid"]');
  const gridSizeInput = panel.querySelector('[data-grid-size-input]');
  const gridSizeDisplay = panel.querySelector('[data-grid-size-display]');
  const gridOffsetXDisplay = panel.querySelector('[data-grid-offset-x]');
  const gridOffsetYDisplay = panel.querySelector('[data-grid-offset-y]');
  const launchers = Array.from(document.querySelectorAll('[data-settings-launch]'));

  let isOpen = false;
  let activeViewId =
    panel.querySelector('[data-settings-view]:not([hidden])')?.getAttribute('data-settings-view') ?? 'tokens';

  const updateLauncherState = (activeView, open) => {
    launchers.forEach((launcher) => {
      const matches = launcher.getAttribute('data-settings-launch') === activeView;
      launcher.classList.toggle('is-active', open && matches);
      launcher.setAttribute('aria-pressed', String(open && matches));
    });
  };

  const setOpen = (open) => {
    if (isOpen === open) return;
    isOpen = open;

    panel.classList.toggle('vtt-settings-panel--open', open);
    panel.classList.toggle('vtt-settings-panel--closed', !open);
    panel.setAttribute('aria-hidden', open ? 'false' : 'true');
    updateLauncherState(activeViewId, open);
  };

  if (closeButton) {
    closeButton.addEventListener('click', () => setOpen(false));
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isOpen) {
      setOpen(false);
    }
  });

  const setPanelTitle = (viewId) => {
    if (!title) return;

    if (viewId === 'scenes') {
      title.textContent = 'Scenes';
    } else {
      title.textContent = 'Tokens';
    }
  };

  setPanelTitle(activeViewId);
  setOpen(false);

  const openView = (viewId) => {
    activeViewId = viewId || activeViewId;
    setActiveView(panel, activeViewId);
    setPanelTitle(activeViewId);
    setOpen(true);
  };

  launchers.forEach((launcher) => {
    launcher.addEventListener('click', () => {
      const tabId = launcher.getAttribute('data-settings-launch');
      // Fog panel is managed independently by fog-of-war.js; skip it here
      // to avoid opening the main settings panel alongside the fog panel.
      if (tabId === 'fog') return;
      openView(tabId);
    });
  });

  const storeApi = store ?? {};
  const initialState = typeof storeApi.getState === 'function' ? storeApi.getState() : {};
  const isGM = Boolean(user?.isGM ?? initialState?.user?.isGM);
  let gridSceneSaveTimer = null;
  let gridSceneSaveSequence = 0;
  let gridCalibrationActive = false;

  const formatGridNumber = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return '0';
    }

    return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(2).replace(/\.?0+$/, '');
  };

  const persistBoardStateSnapshot = () => {
    if (!routes?.state || typeof storeApi.getState !== 'function') {
      return;
    }

    const latest = storeApi.getState();
    if (!latest?.user?.isGM) {
      return;
    }

    if (typeof storeApi._markSceneStateDirty === 'function') {
      const activeSceneId = latest?.boardState?.activeSceneId ?? null;
      if (activeSceneId) {
        storeApi._markSceneStateDirty(activeSceneId);
      }
    }

    if (typeof storeApi._persistBoardState === 'function') {
      return storeApi._persistBoardState({ forceFullSnapshot: true });
    }

    const boardState = latest?.boardState ?? null;
    if (!boardState || typeof boardState !== 'object') {
      return;
    }

    const savePromise = persistBoardState(routes.state, boardState);
    if (savePromise && typeof savePromise.then === 'function') {
      savePromise.then((result) => {
        const numericVersion =
          typeof result?.data?._version === 'number'
            ? result.data._version
            : Number.parseInt(result?.data?._version, 10);
        if (!result?.success || !Number.isFinite(numericVersion) || numericVersion <= 0) {
          return result;
        }

        storeApi.updateState?.((draft) => {
          if (!draft.boardState || typeof draft.boardState !== 'object') {
            draft.boardState = {};
          }
          draft.boardState._version = Math.trunc(numericVersion);
        });
        return result;
      });
    }
    return savePromise;
  };

  const syncGridControls = (state) => {
    const gridState = normalizeGridState(state?.grid ?? {});
    const size = gridState.size;
    const visible = gridState.visible ?? true;
    const locked = gridState.locked ?? false;
    const hasMap = Boolean(state?.boardState?.mapUrl);

    if (gridSizeInput) {
      gridSizeInput.value = String(size);
      gridSizeInput.disabled = locked;
    }

    if (gridSizeDisplay) {
      gridSizeDisplay.textContent = formatGridNumber(size);
    }

    if (gridOffsetXDisplay) {
      gridOffsetXDisplay.textContent = formatGridNumber(gridState.offsetX);
    }

    if (gridOffsetYDisplay) {
      gridOffsetYDisplay.textContent = formatGridNumber(gridState.offsetY);
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

    if (calibrateGridButton) {
      calibrateGridButton.disabled = !isGM || !hasMap || locked;
      calibrateGridButton.classList.toggle('is-active', gridCalibrationActive);
      calibrateGridButton.setAttribute('aria-pressed', String(gridCalibrationActive));
      calibrateGridButton.textContent = gridCalibrationActive ? 'Cancel Align' : 'Align Grid';
    }
  };

  syncGridControls(storeApi.getState?.());

  if (typeof storeApi.subscribe === 'function') {
    storeApi.subscribe((state) => syncGridControls(state));
  }

  const ensureGridDraft = (draft) => {
    if (!draft.grid || typeof draft.grid !== 'object') {
      draft.grid = normalizeGridState({});
    } else {
      draft.grid = normalizeGridState(draft.grid);
    }
  };

  const persistActiveSceneGrid = (gridState, { debounceMs = 0 } = {}) => {
    if (!routes?.scenes || typeof storeApi.getState !== 'function') {
      return;
    }

    const latest = storeApi.getState();
    if (!latest?.user?.isGM) {
      return;
    }

    const activeSceneId = latest?.boardState?.activeSceneId ?? null;
    if (!activeSceneId) {
      return;
    }

    const normalizedGrid = normalizeGridState(gridState ?? latest.grid ?? {});
    const sequence = ++gridSceneSaveSequence;
    const run = async () => {
      try {
        const updatedScene = await updateSceneGrid(routes.scenes, activeSceneId, normalizedGrid);
        if (sequence !== gridSceneSaveSequence || !updatedScene?.id) {
          return;
        }

        storeApi.updateState?.((draft) => {
          if (!draft.scenes || typeof draft.scenes !== 'object') {
            draft.scenes = { folders: [], items: [] };
          }
          draft.scenes.items = Array.isArray(draft.scenes.items) ? draft.scenes.items : [];
          const index = draft.scenes.items.findIndex((scene) => scene?.id === updatedScene.id);
          if (index >= 0) {
            draft.scenes.items[index] = {
              ...draft.scenes.items[index],
              ...updatedScene,
              grid: normalizeGridState(updatedScene.grid ?? normalizedGrid),
            };
          }
        });
        persistBoardStateSnapshot();
      } catch (error) {
        console.warn('[VTT] Failed to persist scene grid', error);
      }
    };

    if (gridSceneSaveTimer) {
      clearTimeout(gridSceneSaveTimer);
      gridSceneSaveTimer = null;
    }

    if (debounceMs > 0) {
      gridSceneSaveTimer = setTimeout(() => {
        gridSceneSaveTimer = null;
        run();
      }, debounceMs);
      return;
    }

    run();
  };

  const syncGridToActiveScene = (draft) => {
    if (!draft || typeof draft !== 'object') {
      return;
    }

    if (!draft.boardState || typeof draft.boardState !== 'object') {
      draft.boardState = { activeSceneId: null, mapUrl: null, thumbnailUrl: null, placements: {}, sceneState: {} };
    }

    if (!draft.boardState.sceneState || typeof draft.boardState.sceneState !== 'object') {
      draft.boardState.sceneState = {};
    }

    const activeSceneId = draft.boardState.activeSceneId;
    if (!activeSceneId) {
      return;
    }

    const grid = normalizeGridState(draft.grid);
    draft.grid = grid;

    const entry = draft.boardState.sceneState[activeSceneId] ?? {};
    entry.grid = grid;
    draft.boardState.sceneState[activeSceneId] = entry;

    if (draft.scenes && Array.isArray(draft.scenes.items)) {
      const scene = draft.scenes.items.find((item) => item?.id === activeSceneId);
      if (scene) {
        scene.grid = grid;
      }
    }
  };

  if (gridSizeInput && typeof storeApi.updateState === 'function') {
    gridSizeInput.addEventListener('input', () => {
      const nextSize = Number.parseFloat(gridSizeInput.value);
      if (!Number.isFinite(nextSize)) return;
      let nextGrid = null;

      storeApi.updateState((draft) => {
        ensureGridDraft(draft);
        draft.grid = normalizeGridState({ ...draft.grid, size: nextSize });
        syncGridToActiveScene(draft);
        nextGrid = draft.grid;
      });
      persistBoardStateSnapshot();
      persistActiveSceneGrid(nextGrid, { debounceMs: 350 });
    });
  }

  if (toggleGridButton && typeof storeApi.updateState === 'function') {
    toggleGridButton.addEventListener('click', () => {
      storeApi.updateState((draft) => {
        ensureGridDraft(draft);
        draft.grid = normalizeGridState({ ...draft.grid, visible: !draft.grid.visible });
        syncGridToActiveScene(draft);
      });
      persistBoardStateSnapshot();
      persistActiveSceneGrid(storeApi.getState?.().grid ?? {});
    });
  }

  if (lockGridButton && typeof storeApi.updateState === 'function') {
    lockGridButton.addEventListener('click', () => {
      storeApi.updateState((draft) => {
        ensureGridDraft(draft);
        draft.grid = normalizeGridState({ ...draft.grid, locked: !draft.grid.locked });
        syncGridToActiveScene(draft);
      });
      persistBoardStateSnapshot();
      persistActiveSceneGrid(storeApi.getState?.().grid ?? {});
    });
  }

  calibrateGridButton?.addEventListener('click', () => {
    const eventName = gridCalibrationActive ? 'vtt:grid-calibration-cancel' : 'vtt:grid-calibration-start';
    window.dispatchEvent(new CustomEvent(eventName));
  });

  window.addEventListener('vtt:grid-calibration-state', (event) => {
    gridCalibrationActive = Boolean(event?.detail?.active);
    syncGridControls(storeApi.getState?.());
  });

  if (isGM) {
    renderSceneList(routes, storeApi);
  }
  renderTokenLibrary(routes, storeApi, { isGM });
}

function setActiveView(panel, tabId) {
  const views = panel.querySelectorAll('[data-settings-view]');

  views.forEach((view) => {
    const isActive = view.getAttribute('data-settings-view') === tabId;
    view.toggleAttribute('hidden', !isActive);
  });
}
