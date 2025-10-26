import {
  createScene,
  createSceneFolder,
  deleteScene,
} from '../services/scene-service.js';
import { persistBoardState } from '../services/board-state-service.js';

export function renderSceneList(routes, store) {
  const container = document.getElementById('scene-manager');
  if (!container) return;

  const form = document.querySelector('[data-scene-form]');
  const nameInput = document.querySelector('[data-scene-name-input]');
  const folderSelect = document.querySelector('[data-scene-folder-select]');
  const feedback = document.querySelector('[data-scene-feedback]');
  const folderButtons = document.querySelectorAll('[data-action="create-folder"]');
  const overlayInput = document.getElementById('vtt-overlay-upload-input');

  const stateApi = store ?? {};
  const endpoints = routes ?? {};
  let overlayUploadTargetSceneId = null;
  let overlayUploadPending = false;

  if (!endpoints.scenes) {
    folderButtons.forEach((button) => {
      button.disabled = true;
      button.title = 'Scene folders are unavailable right now.';
    });
    const submit = form?.querySelector('[type="submit"]');
    if (submit) {
      submit.disabled = true;
      submit.title = 'Scene saving is unavailable right now.';
    }
  }

  const render = (state = {}) => {
    const sceneState = normalizeSceneState(state.scenes);
    updateFolderOptions(folderSelect, sceneState.folders);
    const boardSceneState =
      state.boardState && typeof state.boardState.sceneState === 'object'
        ? state.boardState.sceneState
        : {};
    container.innerHTML = buildSceneMarkup(
      sceneState,
      state.boardState?.activeSceneId ?? null,
      boardSceneState,
      {
        overlayUploadsEnabled: Boolean(overlayInput && endpoints.uploads),
        overlayUploadPending,
      }
    );
  };

  render(stateApi.getState?.());
  stateApi.subscribe?.((nextState) => render(nextState));

  const persistBoardStateSnapshot = () => {
    if (!endpoints.state || typeof stateApi.getState !== 'function') {
      return;
    }

    const latest = stateApi.getState?.();
    const boardState = latest?.boardState ?? null;
    if (!boardState || typeof boardState !== 'object') {
      return;
    }

    persistBoardState(endpoints.state, boardState);
  };

  container.addEventListener('click', async (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;

    const action = target.getAttribute('data-action');
    const sceneId = target.getAttribute('data-scene-id');

    if (action === 'activate-scene' && sceneId) {
      const currentState = stateApi.getState?.() ?? {};
      const sceneState = normalizeSceneState(currentState.scenes);
      const scene = sceneState.items.find((item) => item.id === sceneId);
      if (!scene) return;

      stateApi.updateState?.((draft) => {
        ensureSceneDraft(draft);
        const boardDraft = ensureBoardStateDraft(draft);
        boardDraft.activeSceneId = scene.id;
        boardDraft.mapUrl = scene.mapUrl ?? null;
        const sceneBoardState = ensureSceneBoardStateEntry(
          boardDraft,
          scene.id,
          scene.grid ?? null
        );
        if (!draft.grid || typeof draft.grid !== 'object') {
          draft.grid = { size: 64, locked: false, visible: true };
        }
        const sceneGrid = sceneBoardState?.grid ?? normalizeGridConfig(scene.grid ?? {});
        draft.grid.size = sceneGrid.size;
        draft.grid.locked = sceneGrid.locked;
        draft.grid.visible = sceneGrid.visible;
      });

      persistBoardStateSnapshot();
    }

    if (action === 'upload-overlay-map' && sceneId) {
      const currentState = stateApi.getState?.() ?? {};
      const sceneState = normalizeSceneState(currentState.scenes);
      const scene = sceneState.items.find((item) => item.id === sceneId);
      if (!scene) {
        return;
      }

      if ((currentState.boardState?.activeSceneId ?? null) !== sceneId) {
        showFeedback(feedback, 'Activate the scene before uploading an overlay.', 'error');
        return;
      }

      if (!overlayInput || !endpoints.uploads) {
        showFeedback(feedback, 'Overlay uploads are unavailable right now.', 'error');
        return;
      }

      if (overlayUploadPending) {
        showFeedback(feedback, 'An overlay upload is already in progress.', 'info');
        return;
      }

      overlayUploadTargetSceneId = sceneId;
      overlayInput.value = '';
      overlayInput.click();
      return;
    }

    if (action === 'clear-overlay' && sceneId) {
      let overlayCleared = false;
      stateApi.updateState?.((draft) => {
        ensureSceneDraft(draft);
        const boardDraft = ensureBoardStateDraft(draft);
        const sceneBoardState = ensureSceneBoardStateEntry(boardDraft, sceneId, null);
        if (!sceneBoardState || !sceneBoardState.overlay) {
          return;
        }

        const currentOverlay = normalizeOverlayConfig(sceneBoardState.overlay);
        const hasLayers = Array.isArray(currentOverlay.layers) && currentOverlay.layers.length > 0;
        const hasMask = currentOverlay.mask && Object.keys(currentOverlay.mask).length > 0;
        if (!currentOverlay.mapUrl && !hasMask && !hasLayers) {
          return;
        }

        sceneBoardState.overlay = createEmptyOverlayConfig();
        if (boardDraft.activeSceneId === sceneId) {
          boardDraft.overlay = createEmptyOverlayConfig();
        }
        overlayCleared = true;
      });

      if (overlayCleared) {
        persistBoardStateSnapshot();
        showFeedback(feedback, 'Scene overlay cleared.', 'info');
      } else {
        showFeedback(feedback, 'Scene overlay is already empty.', 'info');
      }
      return;
    }

    if (action === 'add-overlay-layer' && sceneId) {
      let layerAdded = false;
      stateApi.updateState?.((draft) => {
        ensureSceneDraft(draft);
        const boardDraft = ensureBoardStateDraft(draft);
        const sceneBoardState = ensureSceneBoardStateEntry(boardDraft, sceneId, null);
        if (!sceneBoardState) {
          return;
        }

        const overlayEntry = normalizeOverlayConfig(sceneBoardState.overlay ?? {});
        if (!overlayEntry.mapUrl) {
          return;
        }

        const layer = createOverlayLayer(`Overlay ${overlayEntry.layers.length + 1}`, overlayEntry.layers);
        overlayEntry.layers.push(layer);
        overlayEntry.activeLayerId = layer.id;
        rebuildOverlayAggregate(overlayEntry);
        sceneBoardState.overlay = overlayEntry;
        if (boardDraft.activeSceneId === sceneId) {
          boardDraft.overlay = normalizeOverlayConfig(overlayEntry);
        }
        layerAdded = true;
      });

      if (layerAdded) {
        persistBoardStateSnapshot();
        showFeedback(feedback, 'Overlay added.', 'success');
      } else {
        showFeedback(feedback, 'Upload an overlay image before adding overlays.', 'error');
      }
      return;
    }

    if (action === 'rename-overlay-layer' && sceneId) {
      const overlayId = target.getAttribute('data-overlay-id');
      if (!overlayId) {
        return;
      }

      const currentState = stateApi.getState?.() ?? {};
      const sceneEntry = currentState.boardState?.sceneState?.[sceneId] ?? {};
      const overlayEntry = normalizeOverlayConfig(sceneEntry.overlay ?? {});
      const existingLayer = overlayEntry.layers.find((layer) => layer.id === overlayId);
      const currentName = existingLayer?.name ?? '';
      const name = window.prompt('Overlay name', currentName);
      if (name === null) {
        return;
      }

      const trimmed = name.trim();
      if (!trimmed) {
        showFeedback(feedback, 'Overlay name cannot be empty.', 'error');
        return;
      }

      let renamed = false;
      stateApi.updateState?.((draft) => {
        ensureSceneDraft(draft);
        const boardDraft = ensureBoardStateDraft(draft);
        const sceneBoardState = ensureSceneBoardStateEntry(boardDraft, sceneId, null);
        if (!sceneBoardState) {
          return;
        }

        const overlay = normalizeOverlayConfig(sceneBoardState.overlay ?? {});
        const layer = overlay.layers.find((entry) => entry.id === overlayId);
        if (!layer) {
          return;
        }

        layer.name = trimmed;
        rebuildOverlayAggregate(overlay);
        sceneBoardState.overlay = overlay;
        if (boardDraft.activeSceneId === sceneId) {
          boardDraft.overlay = normalizeOverlayConfig(overlay);
        }
        renamed = true;
      });

      if (renamed) {
        persistBoardStateSnapshot();
        showFeedback(feedback, 'Overlay renamed.', 'success');
      } else {
        showFeedback(feedback, 'Unable to rename overlay.', 'error');
      }
      return;
    }

    if (action === 'delete-overlay-layer' && sceneId) {
      const overlayId = target.getAttribute('data-overlay-id');
      if (!overlayId) {
        return;
      }

      const confirmed = window.confirm('Delete this overlay? This cannot be undone.');
      if (!confirmed) {
        return;
      }

      let deleted = false;
      stateApi.updateState?.((draft) => {
        ensureSceneDraft(draft);
        const boardDraft = ensureBoardStateDraft(draft);
        const sceneBoardState = ensureSceneBoardStateEntry(boardDraft, sceneId, null);
        if (!sceneBoardState) {
          return;
        }

        const overlay = normalizeOverlayConfig(sceneBoardState.overlay ?? {});
        const initialLength = overlay.layers.length;
        overlay.layers = overlay.layers.filter((layer) => layer.id !== overlayId);
        if (overlay.layers.length === initialLength) {
          return;
        }

        overlay.activeLayerId = resolveActiveLayerId(overlay.activeLayerId, overlay.layers);
        rebuildOverlayAggregate(overlay);
        sceneBoardState.overlay = overlay;
        if (boardDraft.activeSceneId === sceneId) {
          boardDraft.overlay = normalizeOverlayConfig(overlay);
        }
        deleted = true;
      });

      if (deleted) {
        persistBoardStateSnapshot();
        showFeedback(feedback, 'Overlay deleted.', 'info');
      } else {
        showFeedback(feedback, 'Unable to delete overlay.', 'error');
      }
      return;
    }

    if (action === 'toggle-overlay-layer-visibility' && sceneId) {
      const overlayId = target.getAttribute('data-overlay-id');
      if (!overlayId) {
        return;
      }

      let toggled = false;
      stateApi.updateState?.((draft) => {
        ensureSceneDraft(draft);
        const boardDraft = ensureBoardStateDraft(draft);
        const sceneBoardState = ensureSceneBoardStateEntry(boardDraft, sceneId, null);
        if (!sceneBoardState) {
          return;
        }

        const overlay = normalizeOverlayConfig(sceneBoardState.overlay ?? {});
        const layer = overlay.layers.find((entry) => entry.id === overlayId);
        if (!layer) {
          return;
        }

        layer.visible = layer.visible === false;
        rebuildOverlayAggregate(overlay);
        sceneBoardState.overlay = overlay;
        if (boardDraft.activeSceneId === sceneId) {
          boardDraft.overlay = normalizeOverlayConfig(overlay);
        }
        toggled = true;
      });

      if (toggled) {
        persistBoardStateSnapshot();
      }
      return;
    }

    if (action === 'edit-overlay-layer' && sceneId) {
      const overlayId = target.getAttribute('data-overlay-id');
      if (!overlayId) {
        return;
      }

      stateApi.updateState?.((draft) => {
        ensureSceneDraft(draft);
        const boardDraft = ensureBoardStateDraft(draft);
        const sceneBoardState = ensureSceneBoardStateEntry(boardDraft, sceneId, null);
        if (!sceneBoardState) {
          return;
        }

        const overlay = normalizeOverlayConfig(sceneBoardState.overlay ?? {});
        if (!overlay.layers.some((layer) => layer.id === overlayId)) {
          return;
        }

        overlay.activeLayerId = overlayId;
        rebuildOverlayAggregate(overlay);
        sceneBoardState.overlay = overlay;
        if (boardDraft.activeSceneId === sceneId) {
          boardDraft.overlay = normalizeOverlayConfig(overlay);
        }
      });

      persistBoardStateSnapshot();
      return;
    }

    if (action === 'delete-scene' && sceneId) {
      if (!endpoints.scenes) return;
      const confirmed = window.confirm('Delete this scene? This cannot be undone.');
      if (!confirmed) return;

      try {
        target.disabled = true;
        await deleteScene(endpoints.scenes, sceneId);
        stateApi.updateState?.((draft) => {
          ensureSceneDraft(draft);
          draft.scenes.items = draft.scenes.items.filter((item) => item.id !== sceneId);
          const boardDraft = ensureBoardStateDraft(draft);
          if (boardDraft.activeSceneId === sceneId) {
            boardDraft.activeSceneId = null;
            boardDraft.mapUrl = null;
            boardDraft.overlay = createEmptyOverlayConfig();
          }
          if (boardDraft.placements && typeof boardDraft.placements === 'object') {
            delete boardDraft.placements[sceneId];
          }
          if (boardDraft.sceneState && typeof boardDraft.sceneState === 'object') {
            delete boardDraft.sceneState[sceneId];
          }
        });
        persistBoardStateSnapshot();
        showFeedback(feedback, 'Scene deleted.', 'info');
      } catch (error) {
        console.error('[VTT] Failed to delete scene', error);
        showFeedback(feedback, error?.message || 'Unable to delete scene.', 'error');
      } finally {
        target.disabled = false;
      }
    }
  });

  overlayInput?.addEventListener('change', async () => {
    const file = overlayInput.files?.[0] ?? null;
    overlayInput.value = '';
    const targetSceneId = overlayUploadTargetSceneId;
    overlayUploadTargetSceneId = null;

    if (!file) {
      return;
    }

    if (!endpoints.uploads) {
      showFeedback(feedback, 'Overlay uploads are unavailable right now.', 'error');
      return;
    }

    if (!targetSceneId) {
      showFeedback(feedback, 'No scene selected for overlay upload.', 'error');
      return;
    }

    overlayUploadPending = true;
    render(stateApi.getState?.());

    try {
      const url = await uploadOverlayAsset(file, endpoints.uploads);
      if (!url) {
        throw new Error('Upload endpoint returned no URL.');
      }

      let overlayUpdated = false;
      stateApi.updateState?.((draft) => {
        ensureSceneDraft(draft);
        const boardDraft = ensureBoardStateDraft(draft);
        const sceneBoardState = ensureSceneBoardStateEntry(boardDraft, targetSceneId, null);
        if (!sceneBoardState) {
          return;
        }

        const overlay = normalizeOverlayConfig(sceneBoardState.overlay ?? {});
        overlay.mapUrl = url;
        if (!overlay.layers.length) {
          const layer = createOverlayLayer(`Overlay ${overlay.layers.length + 1}`, overlay.layers);
          overlay.layers.push(layer);
          overlay.activeLayerId = layer.id;
        }

        overlay.layers = overlay.layers.map((layer, index) => ({
          ...layer,
          mask: createEmptyOverlayMask(),
          name: layer.name || `Overlay ${index + 1}`,
        }));

        rebuildOverlayAggregate(overlay);
        sceneBoardState.overlay = overlay;

        if (boardDraft.activeSceneId === targetSceneId) {
          boardDraft.overlay = normalizeOverlayConfig(overlay);
        }

        overlayUpdated = true;
      });

      if (!overlayUpdated) {
        throw new Error('Unable to apply overlay to the selected scene.');
      }

      persistBoardStateSnapshot();
      showFeedback(feedback, 'Overlay uploaded successfully.', 'success');
    } catch (error) {
      console.error('[VTT] Failed to upload overlay', error);
      showFeedback(feedback, error?.message || 'Unable to upload overlay.', 'error');
    } finally {
      overlayUploadPending = false;
      render(stateApi.getState?.());
    }
  });

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!endpoints.scenes) {
      showFeedback(feedback, 'Scene saving is unavailable right now.', 'error');
      return;
    }

    const currentState = stateApi.getState?.() ?? {};
    const mapUrl = currentState.boardState?.mapUrl ?? null;
    const gridState = currentState.grid ?? { size: 64, locked: false, visible: true };

    if (!mapUrl) {
      showFeedback(feedback, 'Upload a map before saving a scene.', 'error');
      return;
    }

    const name = nameInput?.value?.trim() ?? '';
    const folderId = folderSelect?.value || null;

    try {
      setFormPending(form, true);
      const scene = await createScene(endpoints.scenes, {
        name,
        folderId,
        mapUrl,
        grid: gridState,
      });

      stateApi.updateState?.((draft) => {
        ensureSceneDraft(draft);
        draft.scenes.items.push(scene);
        const hasFolder = scene.folderId && draft.scenes.folders.some((folder) => folder.id === scene.folderId);
        if (scene.folderId && !hasFolder && scene.folder) {
          draft.scenes.folders.push(scene.folder);
        }
        const boardDraft = ensureBoardStateDraft(draft);
        boardDraft.activeSceneId = scene.id;
        boardDraft.mapUrl = scene.mapUrl ?? null;
        const sceneBoardState = ensureSceneBoardStateEntry(boardDraft, scene.id, scene.grid ?? null);
        if (!draft.grid || typeof draft.grid !== 'object') {
          draft.grid = { size: 64, locked: false, visible: true };
        }
        const gridConfig = sceneBoardState?.grid ?? normalizeGridConfig(scene.grid ?? {});
        draft.grid.size = gridConfig.size;
        draft.grid.locked = gridConfig.locked;
        draft.grid.visible = gridConfig.visible;
      });

      persistBoardStateSnapshot();

      if (nameInput) {
        nameInput.value = '';
      }

      showFeedback(feedback, 'Scene saved successfully.', 'success');
    } catch (error) {
      console.error('[VTT] Failed to save scene', error);
      showFeedback(feedback, error?.message || 'Unable to save scene.', 'error');
    } finally {
      setFormPending(form, false);
    }
  });

  folderButtons.forEach((button) => {
    button.addEventListener('click', async () => {
      if (!endpoints.scenes) return;
      const name = window.prompt('Folder name');
      const trimmed = name?.trim();
      if (!trimmed) return;

      try {
        button.disabled = true;
        const folder = await createSceneFolder(endpoints.scenes, trimmed);
        stateApi.updateState?.((draft) => {
          ensureSceneDraft(draft);
          const exists = draft.scenes.folders.some((item) => item.id === folder.id);
          if (!exists) {
            draft.scenes.folders.push(folder);
          }
        });
        if (folderSelect) {
          folderSelect.value = folder.id;
        }
        showFeedback(feedback, 'Folder created.', 'success');
      } catch (error) {
        console.error('[VTT] Failed to create folder', error);
        showFeedback(feedback, error?.message || 'Unable to create folder.', 'error');
      } finally {
        button.disabled = false;
      }
    });
  });
}

function normalizeSceneState(raw = {}) {
  const folders = Array.isArray(raw?.folders) ? raw.folders : [];
  const items = Array.isArray(raw?.items)
    ? raw.items
    : Array.isArray(raw?.scenes)
    ? raw.scenes
    : Array.isArray(raw)
    ? raw
    : [];
  return {
    folders: folders.filter((folder) => folder && typeof folder.id === 'string'),
    items: items.filter((scene) => scene && typeof scene.id === 'string'),
  };
}

function ensureSceneDraft(draft) {
  if (!draft.scenes || typeof draft.scenes !== 'object') {
    draft.scenes = { folders: [], items: [] };
  } else {
    draft.scenes.folders = Array.isArray(draft.scenes.folders) ? draft.scenes.folders : [];
    draft.scenes.items = Array.isArray(draft.scenes.items) ? draft.scenes.items : [];
  }
}

function ensureBoardStateDraft(draft) {
  if (!draft.boardState || typeof draft.boardState !== 'object') {
    draft.boardState = { activeSceneId: null, mapUrl: null, placements: {}, sceneState: {} };
  }

  if (!draft.boardState.placements || typeof draft.boardState.placements !== 'object') {
    draft.boardState.placements = {};
  }

  if (!draft.boardState.sceneState || typeof draft.boardState.sceneState !== 'object') {
    draft.boardState.sceneState = {};
  }

  if (!draft.boardState.overlay || typeof draft.boardState.overlay !== 'object') {
    draft.boardState.overlay = createEmptyOverlayConfig();
  } else {
    draft.boardState.overlay = normalizeOverlayConfig(draft.boardState.overlay);
  }

  return draft.boardState;
}

function ensureSceneBoardStateEntry(boardState, sceneId, fallbackGrid = null) {
  if (!boardState || !sceneId) {
    return null;
  }

  const key = typeof sceneId === 'string' ? sceneId : String(sceneId);
  if (!key) {
    return null;
  }

  if (!boardState.sceneState || typeof boardState.sceneState !== 'object') {
    boardState.sceneState = {};
  }

  const existing = boardState.sceneState[key];
  if (existing && typeof existing === 'object') {
    existing.grid = normalizeGridConfig(existing.grid ?? fallbackGrid ?? {});
    existing.overlay = normalizeOverlayConfig(existing.overlay ?? {});
    return existing;
  }

  const entry = {
    grid: normalizeGridConfig(fallbackGrid ?? {}),
    overlay: createEmptyOverlayConfig(),
  };
  boardState.sceneState[key] = entry;
  return entry;
}

function normalizeGridConfig(raw = {}) {
  const sizeValue = Number.parseInt(raw.size, 10);
  const size = Number.isFinite(sizeValue) ? sizeValue : Number(raw.size);
  const resolvedSize = Number.isFinite(size) ? Math.max(8, Math.min(320, Math.trunc(size))) : 64;

  return {
    size: resolvedSize,
    locked: Boolean(raw.locked),
    visible: raw.visible === undefined ? true : Boolean(raw.visible),
  };
}

const OVERLAY_LAYER_PREFIX = 'overlay-layer-';
let overlayLayerSeed = Date.now();
let overlayLayerSequence = 0;

function normalizeOverlayConfig(raw = {}) {
  const base = createEmptyOverlayConfig();
  if (!raw || typeof raw !== 'object') {
    return base;
  }

  if (typeof raw.mapUrl === 'string') {
    const trimmed = raw.mapUrl.trim();
    if (trimmed) {
      base.mapUrl = trimmed;
    }
  }

  const layerSource = Array.isArray(raw.layers)
    ? raw.layers
    : Array.isArray(raw.items)
    ? raw.items
    : [];

  base.layers = layerSource.map((entry, index) => normalizeOverlayLayer(entry, index)).filter(Boolean);

  const legacyMask = normalizeOverlayMask(raw.mask ?? null);
  const legacyHasMask = maskHasMeaningfulContent(legacyMask);

  if (!base.layers.length && (legacyHasMask || raw.name || raw.visible !== undefined)) {
    const legacyLayer = normalizeOverlayLayer(
      {
        id: typeof raw.id === 'string' ? raw.id : undefined,
        name: typeof raw.name === 'string' ? raw.name : undefined,
        visible: legacyMask.visible,
        mask: legacyMask,
      },
      0
    );
    if (legacyLayer) {
      base.layers.push(legacyLayer);
    }
  }

  base.activeLayerId = resolveActiveLayerId(raw.activeLayerId ?? raw.activeLayer ?? raw.selectedLayerId, base.layers);
  rebuildOverlayAggregate(base);

  return base;
}

function createEmptyOverlayConfig() {
  return {
    mapUrl: null,
    mask: createEmptyOverlayMask(),
    layers: [],
    activeLayerId: null,
  };
}

function normalizeOverlayLayer(raw = {}, index = 0) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const mask = normalizeOverlayMask(raw.mask ?? raw);
  const idSource = typeof raw.id === 'string' ? raw.id.trim() : '';
  const nameSource = typeof raw.name === 'string' ? raw.name.trim() : '';
  const visible = raw.visible === undefined ? true : Boolean(raw.visible);
  const id = idSource || createOverlayLayerId();
  const name = nameSource || `Overlay ${index + 1}`;

  return {
    id,
    name,
    visible,
    mask,
  };
}

function createOverlayLayerId() {
  overlayLayerSequence += 1;
  return `${OVERLAY_LAYER_PREFIX}${overlayLayerSeed.toString(36)}-${overlayLayerSequence.toString(36)}`;
}

function createOverlayLayer(name = '', existingLayers = []) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  const safeLayers = Array.isArray(existingLayers) ? existingLayers : [];
  const resolvedName = ensureUniqueOverlayName(trimmed || 'Overlay', safeLayers);
  return {
    id: createOverlayLayerId(),
    name: resolvedName,
    visible: true,
    mask: createEmptyOverlayMask(),
  };
}

function ensureUniqueOverlayName(baseName, existingLayers = []) {
  const fallback = typeof baseName === 'string' && baseName.trim() ? baseName.trim() : 'Overlay';
  const normalizedExisting = new Set();
  const usedNumbers = new Set();

  existingLayers.forEach((layer) => {
    if (!layer || typeof layer !== 'object') {
      return;
    }

    const candidate = typeof layer.name === 'string' ? layer.name.trim() : '';
    if (!candidate) {
      return;
    }

    normalizedExisting.add(candidate.toLowerCase());

    const prefixMatch = fallbackPrefixMatch(candidate, fallback);
    if (prefixMatch !== null) {
      usedNumbers.add(prefixMatch);
    }
  });

  if (!normalizedExisting.has(fallback.toLowerCase())) {
    return fallback;
  }

  const prefix = deriveNamePrefix(fallback);
  const prefixPattern = new RegExp(`^${escapeRegExp(prefix)}\s+(\d+)$`, 'i');

  existingLayers.forEach((layer) => {
    if (!layer || typeof layer !== 'object') {
      return;
    }

    const candidate = typeof layer.name === 'string' ? layer.name.trim() : '';
    if (!candidate) {
      return;
    }

    const match = candidate.match(prefixPattern);
    if (match) {
      const value = Number.parseInt(match[1], 10);
      if (Number.isFinite(value)) {
        usedNumbers.add(value);
      }
    }
  });

  let counter = 1;
  const fallbackMatch = fallback.match(prefixPattern);
  if (fallbackMatch) {
    const preferred = Number.parseInt(fallbackMatch[1], 10);
    if (Number.isFinite(preferred) && preferred > 0) {
      counter = preferred;
    }
  }

  while (
    usedNumbers.has(counter) || normalizedExisting.has(`${prefix} ${counter}`.toLowerCase())
  ) {
    counter += 1;
  }

  return `${prefix} ${counter}`;
}

function deriveNamePrefix(name) {
  const match = name.match(/^(.*?)(?:\s+\d+)?$/);
  if (match) {
    const prefix = match[1].trim();
    if (prefix) {
      return prefix;
    }
  }
  return 'Overlay';
}

function fallbackPrefixMatch(candidate, fallback) {
  const prefix = deriveNamePrefix(fallback);
  const pattern = new RegExp(`^${escapeRegExp(prefix)}\s+(\d+)$`, 'i');
  const match = candidate.match(pattern);
  if (!match) {
    return null;
  }

  const value = Number.parseInt(match[1], 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function resolveActiveLayerId(preferredId, layers = []) {
  if (typeof preferredId === 'string') {
    const trimmed = preferredId.trim();
    if (trimmed && layers.some((layer) => layer.id === trimmed)) {
      return trimmed;
    }
  }

  if (!layers.length) {
    return null;
  }

  const visibleLayer = layers.find((layer) => layer.visible !== false);
  if (visibleLayer) {
    return visibleLayer.id;
  }

  return layers[0].id;
}

function rebuildOverlayAggregate(overlay) {
  if (!overlay || typeof overlay !== 'object') {
    return createEmptyOverlayConfig();
  }

  const mask = buildAggregateMask(Array.isArray(overlay.layers) ? overlay.layers : []);
  overlay.mask = mask;
  overlay.activeLayerId = resolveActiveLayerId(overlay.activeLayerId, overlay.layers);
  return overlay;
}

function buildAggregateMask(layers = []) {
  const aggregate = createEmptyOverlayMask();
  let hasVisibleLayer = false;

  layers.forEach((layer) => {
    if (!layer || typeof layer !== 'object') {
      return;
    }

    if (layer.visible === false) {
      return;
    }

    const mask = normalizeOverlayMask(layer.mask ?? {});
    if (mask.visible === false) {
      return;
    }

    hasVisibleLayer = true;
    if (!aggregate.url && mask.url) {
      aggregate.url = mask.url;
    }

    if (Array.isArray(mask.polygons)) {
      mask.polygons.forEach((polygon) => {
        const points = Array.isArray(polygon?.points) ? polygon.points : [];
        if (points.length >= 3) {
          aggregate.polygons.push({ points: points.map((point) => ({ ...point })) });
        }
      });
    }
  });

  aggregate.visible = hasVisibleLayer;
  return aggregate;
}

function maskHasMeaningfulContent(mask = {}) {
  if (!mask || typeof mask !== 'object') {
    return false;
  }

  if (typeof mask.url === 'string' && mask.url.trim()) {
    return true;
  }

  return Array.isArray(mask.polygons) ? mask.polygons.length > 0 : false;
}

function createEmptyOverlayMask() {
  return { visible: true, polygons: [] };
}

function normalizeOverlayMask(raw) {
  if (!raw || typeof raw !== 'object') {
    return createEmptyOverlayMask();
  }

  const normalized = {
    visible: normalizeOverlayMaskVisibility(raw.visible),
    polygons: [],
  };

  if (typeof raw.url === 'string') {
    const trimmed = raw.url.trim();
    if (trimmed) {
      normalized.url = trimmed;
    }
  }

  const polygons = Array.isArray(raw.polygons) ? raw.polygons : [];
  polygons.forEach((polygon) => {
    const pointsSource = Array.isArray(polygon?.points)
      ? polygon.points
      : Array.isArray(polygon)
      ? polygon
      : [];
    if (!Array.isArray(pointsSource)) {
      return;
    }

    const points = pointsSource.map((point) => normalizeOverlayPoint(point)).filter(Boolean);
    if (points.length >= 3) {
      normalized.polygons.push({ points });
    }
  });

  return normalized;
}

function normalizeOverlayPoint(point) {
  if (!point || typeof point !== 'object') {
    return null;
  }

  const column = Number(point.column ?? point.x);
  const row = Number(point.row ?? point.y);
  if (!Number.isFinite(column) || !Number.isFinite(row)) {
    return null;
  }

  return {
    column: roundToPrecision(column, 4),
    row: roundToPrecision(row, 4),
  };
}

function roundToPrecision(value, precision = 4) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const places = Number.isFinite(precision) ? Math.max(0, Math.trunc(precision)) : 0;
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function normalizeOverlayMaskVisibility(value) {
  if (value === undefined) {
    return true;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return true;
    }
    if (normalized === 'false' || normalized === '0' || normalized === 'off' || normalized === 'no') {
      return false;
    }
    if (normalized === 'true' || normalized === '1' || normalized === 'on' || normalized === 'yes') {
      return true;
    }
  }

  return Boolean(value);
}

function updateFolderOptions(select, folders = []) {
  if (!select) return;
  const current = select.value;
  const options = ['<option value="">Unsorted</option>']
    .concat(
      folders.map(
        (folder) => `<option value="${folder.id}">${escapeHtml(folder.name || 'Untitled Folder')}</option>`
      )
    )
    .join('');
  select.innerHTML = options;
  select.value = folders.some((folder) => folder.id === current) ? current : '';
}

function buildSceneMarkup(sceneState, activeSceneId, boardSceneState = {}, options = {}) {
  if (!sceneState.items.length) {
    return '<p class="empty-state">No scenes saved yet. Upload a map and save your first scene.</p>';
  }

  const groups = [];
  sceneState.folders.forEach((folder) => {
    const scenes = sceneState.items.filter((scene) => scene.folderId === folder.id);
    if (scenes.length) {
      groups.push({
        id: folder.id,
        title: folder.name || 'Untitled Folder',
        scenes,
      });
    }
  });

  const unsorted = sceneState.items.filter(
    (scene) => !scene.folderId || !sceneState.folders.some((folder) => folder.id === scene.folderId)
  );
  if (unsorted.length) {
    groups.push({ id: null, title: 'Unsorted Scenes', scenes: unsorted });
  }

  const markup = groups
    .map((group) => `
      <section class="scene-group" data-folder-id="${group.id ?? ''}">
        <header class="scene-group__header">
          <h4>${escapeHtml(group.title)}</h4>
        </header>
        <div class="scene-group__body">
          ${group.scenes
            .map((scene) =>
              renderSceneItem(scene, activeSceneId, boardSceneState[scene.id] ?? {}, options)
            )
            .join('')}
        </div>
      </section>
    `)
    .join('');

  return `<div class="scene-list">${markup}</div>`;
}

function renderSceneItem(scene, activeSceneId, sceneBoardState = {}, options = {}) {
  const isActive = scene.id === activeSceneId;
  const name = escapeHtml(scene.name || 'Untitled Scene');
  const overlayState = normalizeOverlayConfig(sceneBoardState.overlay ?? {});
  const overlayMapSet = Boolean(overlayState.mapUrl);
  const hasOverlayContent = overlayMapSet || overlayState.layers.some((layer) => maskHasMeaningfulContent(layer.mask));

  const overlayUploadDisabled =
    !options.overlayUploadsEnabled || options.overlayUploadPending || !isActive;
  const overlayUploadTitle = !options.overlayUploadsEnabled
    ? 'Overlay uploads are unavailable right now.'
    : !isActive
      ? 'Activate the scene before uploading an overlay.'
      : options.overlayUploadPending
        ? 'An overlay upload is already in progress.'
        : '';
  const addOverlayDisabled = !overlayMapSet;
  const addOverlayTitle = overlayMapSet
    ? ''
    : 'Set an overlay image before adding overlay layers.';

  const clearOverlayDisabled = !hasOverlayContent;
  const clearOverlayTitle = hasOverlayContent ? '' : 'No overlay content to clear.';

  return `
    <article class="scene-item${isActive ? ' is-active' : ''}" data-scene-id="${scene.id}">
      ${renderScenePreview(scene, scene.name)}
      <div class="scene-item__content">
        <header class="scene-item__header">
          <h4>${name}</h4>
          <span class="scene-item__status">${isActive ? 'Active' : ''}</span>
        </header>
        <div class="scene-item__overlays" data-scene-id="${scene.id}">
          <div class="scene-overlay__actions">
            <button
              type="button"
              class="btn btn--small"
              data-action="upload-overlay-map"
              data-scene-id="${scene.id}"
              ${overlayUploadDisabled ? 'disabled' : ''}
              ${overlayUploadTitle ? ` title="${escapeHtml(overlayUploadTitle)}"` : ''}
            >
              Upload Overlay Image
            </button>
            <button
              type="button"
              class="btn btn--small"
              data-action="add-overlay-layer"
              data-scene-id="${scene.id}"
              ${addOverlayDisabled ? 'disabled' : ''}
              ${addOverlayTitle ? ` title="${escapeHtml(addOverlayTitle)}"` : ''}
            >
              Add Overlay
            </button>
            ${options.overlayUploadPending && isActive
              ? '<span class="scene-overlay__status" role="status">Uploading overlay…</span>'
              : ''}
          </div>
          ${renderOverlayList(scene.id, overlayState, { isActiveScene: isActive, overlayMapSet })}
        </div>
        <footer class="scene-item__footer">
          <button type="button" class="btn" data-action="activate-scene" data-scene-id="${scene.id}">Activate</button>
          <button
            type="button"
            class="btn"
            data-action="clear-overlay"
            data-scene-id="${scene.id}"
            ${clearOverlayDisabled ? 'disabled' : ''}
            ${clearOverlayTitle ? ` title="${escapeHtml(clearOverlayTitle)}"` : ''}
          >
            Clear Overlay
          </button>
          <button type="button" class="btn btn--danger" data-action="delete-scene" data-scene-id="${scene.id}">Delete</button>
        </footer>
      </div>
    </article>
  `;
}

function renderOverlayList(sceneId, overlayState, options = {}) {
  const layers = Array.isArray(overlayState.layers) ? overlayState.layers : [];
  if (!layers.length) {
    return '<p class="scene-overlay__empty">No overlays added yet.</p>';
  }

  return `
    <ul class="scene-overlay__list">
      ${layers
        .map((layer, index) => renderOverlayListItem(sceneId, overlayState, layer, index, options))
        .join('')}
    </ul>
  `;
}

function renderOverlayListItem(sceneId, overlayState, layer, index, options = {}) {
  const name = escapeHtml(layer.name || `Overlay ${index + 1}`);
  const overlayVisible = layer.visible !== false && normalizeOverlayMask(layer.mask ?? {}).visible !== false;
  const visibilityTitle = options.isActiveScene
    ? 'Toggle overlay visibility.'
    : 'Activate this scene to toggle overlay visibility.';
  const editDisabled = !options.isActiveScene || !options.overlayMapSet;
  let editTitle = '';
  if (!options.overlayMapSet) {
    editTitle = 'Upload an overlay image before editing the overlay mask.';
  } else if (!options.isActiveScene) {
    editTitle = 'Activate this scene to edit this overlay.';
  }
  const isActiveLayer = overlayState.activeLayerId === layer.id;

  return `
    <li class="scene-overlay__item${isActiveLayer ? ' is-active' : ''}" data-overlay-id="${layer.id}" data-scene-id="${sceneId}" data-overlay-visible="${overlayVisible ? 'true' : 'false'}">
      <label class="scene-overlay__visibility" ${visibilityTitle ? ` title="${escapeHtml(visibilityTitle)}"` : ''}>
        <input
          type="checkbox"
          class="scene-overlay__checkbox"
          data-action="toggle-overlay-layer-visibility"
          data-scene-id="${sceneId}"
          data-overlay-id="${layer.id}"
          aria-label="${overlayVisible ? 'Hide overlay' : 'Show overlay'}"
          ${overlayVisible ? 'checked' : ''}
          ${options.isActiveScene ? '' : 'disabled'}
        />
      </label>
      <div class="scene-overlay__meta">
        <span class="scene-overlay__name" title="${name}">${name}</span>
      </div>
      <div class="scene-overlay__controls">
        <button
          type="button"
          class="btn btn--ghost btn--tiny scene-overlay__rename"
          data-action="rename-overlay-layer"
          data-scene-id="${sceneId}"
          data-overlay-id="${layer.id}"
        >
          Rename
        </button>
        <button
          type="button"
          class="btn btn--ghost btn--tiny scene-overlay__edit"
          data-action="edit-overlay-layer"
          data-scene-id="${sceneId}"
          data-overlay-id="${layer.id}"
          aria-pressed="false"
          ${editDisabled ? 'disabled' : ''}
          ${editTitle ? ` title="${escapeHtml(editTitle)}"` : ''}
        >
          Edit
        </button>
        <button
          type="button"
          class="btn btn--ghost btn--tiny btn--danger scene-overlay__delete"
          data-action="delete-overlay-layer"
          data-scene-id="${sceneId}"
          data-overlay-id="${layer.id}"
        >
          Delete
        </button>
      </div>
    </li>
  `;
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderScenePreview(scene, fallbackName) {
  const url = typeof scene.mapUrl === 'string' ? scene.mapUrl.trim() : '';
  if (!url) {
    return `
      <div class="scene-item__preview scene-item__preview--empty">
        <span class="scene-item__preview-text">No Map</span>
      </div>
    `;
  }

  const safeName = typeof fallbackName === 'string' ? fallbackName.trim() : '';
  const label = safeName ? `Preview of ${safeName}` : 'Scene preview';
  return `
    <div class="scene-item__preview">
      <img src="${escapeHtml(url)}" alt="${escapeHtml(label)}" loading="lazy" />
    </div>
  `;
}

function showFeedback(element, message, type = 'info') {
  if (!element) return;
  element.textContent = message;
  element.hidden = !message;
  element.dataset.variant = type;
}

function setFormPending(form, isPending) {
  if (!form) return;
  form.classList.toggle('is-pending', Boolean(isPending));
  const submit = form.querySelector('[type="submit"]');
  if (submit) {
    submit.disabled = isPending;
  }
}

async function uploadOverlayAsset(file, endpoint) {
  const formData = new FormData();
  formData.append('map', file, file.name);

  const response = await fetch(endpoint, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const message = await readUploadError(response);
    throw new Error(message || `Upload failed with status ${response.status}`);
  }

  const payload = await response.json();
  if (!payload.success) {
    throw new Error(payload.error || 'Upload failed');
  }

  return payload.data?.url ?? null;
}

async function readUploadError(response) {
  try {
    const payload = await response.json();
    return payload.error ?? '';
  } catch (error) {
    return '';
  }
}
