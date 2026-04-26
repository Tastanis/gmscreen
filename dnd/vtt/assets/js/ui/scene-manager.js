import {
  createScene,
  createSceneFolder,
  deleteScene,
} from '../services/scene-service.js';
import { persistBoardState } from '../services/board-state-service.js';
import { normalizeGridState } from '../state/normalize/grid.js';
import {
  MAP_LEVEL_ID_PREFIX,
  MAP_LEVEL_MAX_LEVELS,
  createEmptyMapLevelsState,
  normalizeMapLevelsState,
} from '../state/normalize/map-levels.js';

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
  let overlayUploadTargetLayerId = null;
  let overlayUploadPending = false;
  let mapLevelUploadTargetSceneId = null;
  let mapLevelUploadTargetLevelId = null;
  let mapLevelUploadPending = false;
  let mapLevelUploadPendingSceneId = null;

  const isAssetUploadPending = () => overlayUploadPending || mapLevelUploadPending;

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
        mapLevelUploadsEnabled: Boolean(overlayInput && endpoints.uploads),
        mapLevelUploadPending,
        mapLevelUploadPendingSceneId,
        assetUploadPending: isAssetUploadPending(),
      }
    );
  };

  render(stateApi.getState?.());
  stateApi.subscribe?.((nextState) => render(nextState));

  const persistBoardStateSnapshot = (dirtySceneId = null) => {
    if (!endpoints.state || typeof stateApi.getState !== 'function') {
      return;
    }

    if (typeof stateApi._markSceneStateDirty === 'function' && dirtySceneId) {
      stateApi._markSceneStateDirty(dirtySceneId);
    }

    if (typeof stateApi._persistBoardState === 'function') {
      return stateApi._persistBoardState({ forceFullSnapshot: true });
    }

    const latest = stateApi.getState?.();
    const boardState = latest?.boardState ?? null;
    if (!boardState || typeof boardState !== 'object') {
      return;
    }

    const savePromise = persistBoardState(endpoints.state, boardState);
    if (savePromise && typeof savePromise.then === 'function') {
      savePromise.then((result) => {
        const version = normalizeBoardStateVersion(result?.data?._version);
        if (!result?.success || version <= 0) {
          return result;
        }

        stateApi.updateState?.((draft) => {
          if (!draft.boardState || typeof draft.boardState !== 'object') {
            draft.boardState = {};
          }
          draft.boardState._version = version;
        });
        return result;
      });
    }
    return savePromise;
  };

  container.addEventListener('click', async (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;

    const action = target.getAttribute('data-action');
    const sceneId = target.getAttribute('data-scene-id');

    if (action === 'toggle-folder') {
      const folderId = target.getAttribute('data-folder-id');
      if (!folderId) return;

      const section = target.closest('.scene-group');
      if (section) {
        const isNowCollapsed = toggleFolderCollapsed(folderId);
        section.classList.toggle('is-collapsed', isNowCollapsed);
      }
      return;
    }

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
        boardDraft.thumbnailUrl = scene.thumbnailUrl ?? null;
        // Ensure scene board state entry exists
        ensureSceneBoardStateEntry(
          boardDraft,
          scene.id,
          scene.grid ?? null
        );
        if (!draft.grid || typeof draft.grid !== 'object') {
          draft.grid = normalizeGridConfig({});
        }
        // CRITICAL: Always use the scene's permanent grid property, NOT the synced sceneState grid.
        // Grid is a permanent scene setting that should never be overwritten by sync.
        const sceneGrid = normalizeGridConfig(scene.grid ?? {});
        draft.grid = { ...draft.grid, ...sceneGrid };
        // Also update the sceneState entry to match the scene's permanent grid
        // This ensures consistency between the scene definition and the board state
        if (boardDraft.sceneState && boardDraft.sceneState[scene.id]) {
          boardDraft.sceneState[scene.id].grid = sceneGrid;
        }
      });

      persistBoardStateSnapshot();
    }

    if (action === 'add-map-level' && sceneId) {
      const currentState = stateApi.getState?.() ?? {};
      const sceneState = normalizeSceneState(currentState.scenes);
      const scene = sceneState.items.find((item) => item.id === sceneId);
      if (!scene) {
        return;
      }

      let levelAdded = false;
      let limitReached = false;
      mutateSceneMapLevels(stateApi, sceneId, (mapLevels) => {
        if (mapLevels.levels.length >= MAP_LEVEL_MAX_LEVELS) {
          limitReached = true;
          return false;
        }

        const orderedLevels = reindexMapLevels(getOrderedMapLevels(mapLevels.levels));
        const level = createMapLevel(`Level ${orderedLevels.length + 1}`, orderedLevels);
        orderedLevels.push(level);
        mapLevels.levels = reindexMapLevels(orderedLevels);
        mapLevels.activeLevelId = level.id;
        levelAdded = true;
        return true;
      });

      if (levelAdded) {
        persistBoardStateSnapshot();
        showFeedback(feedback, 'Map level added.', 'success');
      } else if (limitReached) {
        showFeedback(feedback, `Map levels are limited to ${MAP_LEVEL_MAX_LEVELS}.`, 'error');
      } else {
        showFeedback(feedback, 'Unable to add map level.', 'error');
      }
      return;
    }

    if (action === 'upload-map-level' && sceneId) {
      const levelId = target.getAttribute('data-map-level-id');
      if (!levelId) {
        return;
      }

      const currentState = stateApi.getState?.() ?? {};
      const sceneState = normalizeSceneState(currentState.scenes);
      const scene = sceneState.items.find((item) => item.id === sceneId);
      if (!scene) {
        return;
      }

      if (!overlayInput || !endpoints.uploads) {
        showFeedback(feedback, 'Map level uploads are unavailable right now.', 'error');
        return;
      }

      if (isAssetUploadPending()) {
        showFeedback(feedback, 'An image upload is already in progress.', 'info');
        return;
      }

      overlayUploadTargetSceneId = null;
      overlayUploadTargetLayerId = null;
      mapLevelUploadTargetSceneId = sceneId;
      mapLevelUploadTargetLevelId = levelId;
      overlayInput.value = '';
      overlayInput.click();
      return;
    }

    if (action === 'rename-map-level' && sceneId) {
      const levelId = target.getAttribute('data-map-level-id');
      if (!levelId) {
        return;
      }

      const currentState = stateApi.getState?.() ?? {};
      const sceneEntry = currentState.boardState?.sceneState?.[sceneId] ?? {};
      const sceneGrid = sceneEntry.grid ?? getSceneGridFromState(currentState, sceneId);
      const mapLevels = normalizeMapLevelsState(sceneEntry.mapLevels ?? null, { sceneGrid });
      const existingLevel = mapLevels.levels.find((level) => level.id === levelId);
      const currentName = existingLevel?.name ?? '';
      const name = window.prompt('Map level name', currentName);
      if (name === null) {
        return;
      }

      const trimmed = name.trim();
      if (!trimmed) {
        showFeedback(feedback, 'Map level name cannot be empty.', 'error');
        return;
      }

      let renamed = false;
      mutateSceneMapLevels(stateApi, sceneId, (draftLevels) => {
        const level = draftLevels.levels.find((entry) => entry.id === levelId);
        if (!level) {
          return false;
        }

        level.name = trimmed;
        renamed = true;
        return true;
      });

      if (renamed) {
        persistBoardStateSnapshot();
        showFeedback(feedback, 'Map level renamed.', 'success');
      } else {
        showFeedback(feedback, 'Unable to rename map level.', 'error');
      }
      return;
    }

    if (action === 'delete-map-level' && sceneId) {
      const levelId = target.getAttribute('data-map-level-id');
      if (!levelId) {
        return;
      }

      const confirmed = window.confirm('Delete this map level? This cannot be undone.');
      if (!confirmed) {
        return;
      }

      let deleted = false;
      mutateSceneMapLevels(stateApi, sceneId, (mapLevels) => {
        const initialLength = mapLevels.levels.length;
        mapLevels.levels = mapLevels.levels.filter((level) => level.id !== levelId);
        if (mapLevels.levels.length === initialLength) {
          return false;
        }

        mapLevels.levels = reindexMapLevels(getOrderedMapLevels(mapLevels.levels));
        if (mapLevels.activeLevelId === levelId) {
          mapLevels.activeLevelId = mapLevels.levels.find((level) => level.id)?.id ?? null;
        }
        deleted = true;
        return true;
      });

      if (deleted) {
        persistBoardStateSnapshot();
        showFeedback(feedback, 'Map level deleted.', 'info');
      } else {
        showFeedback(feedback, 'Unable to delete map level.', 'error');
      }
      return;
    }

    if (action === 'toggle-map-level-visibility' && sceneId) {
      const levelId = target.getAttribute('data-map-level-id');
      if (!levelId) {
        return;
      }

      let toggled = false;
      mutateSceneMapLevels(stateApi, sceneId, (mapLevels) => {
        const level = mapLevels.levels.find((entry) => entry.id === levelId);
        if (!level) {
          return false;
        }

        level.visible = level.visible === false;
        toggled = true;
        return true;
      });

      if (toggled) {
        persistBoardStateSnapshot();
      }
      return;
    }

    if (action === 'select-map-level' && sceneId) {
      const levelId = target.getAttribute('data-map-level-id');
      if (!levelId) {
        return;
      }

      let selected = false;
      mutateSceneMapLevels(stateApi, sceneId, (mapLevels) => {
        if (!mapLevels.levels.some((level) => level.id === levelId)) {
          return false;
        }

        mapLevels.activeLevelId = levelId;
        selected = true;
        return true;
      });

      if (selected) {
        persistBoardStateSnapshot();
        showFeedback(feedback, 'Active map level selected.', 'info');
      }
      return;
    }

    if ((action === 'raise-map-level' || action === 'lower-map-level') && sceneId) {
      const levelId = target.getAttribute('data-map-level-id');
      if (!levelId) {
        return;
      }

      let reordered = false;
      mutateSceneMapLevels(stateApi, sceneId, (mapLevels) => {
        const orderedLevels = getOrderedMapLevels(mapLevels.levels);
        const index = orderedLevels.findIndex((level) => level.id === levelId);
        if (index < 0) {
          return false;
        }

        const swapIndex = action === 'raise-map-level' ? index + 1 : index - 1;
        if (swapIndex < 0 || swapIndex >= orderedLevels.length) {
          return false;
        }

        [orderedLevels[index], orderedLevels[swapIndex]] = [orderedLevels[swapIndex], orderedLevels[index]];
        mapLevels.levels = reindexMapLevels(orderedLevels);
        reordered = true;
        return true;
      });

      if (reordered) {
        persistBoardStateSnapshot();
      }
      return;
    }

    if (action === 'upload-overlay-map' && sceneId) {
      const overlayId = target.getAttribute('data-overlay-id');
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

      if (isAssetUploadPending()) {
        showFeedback(feedback, 'An image upload is already in progress.', 'info');
        return;
      }

      mapLevelUploadTargetSceneId = null;
      mapLevelUploadTargetLevelId = null;
      overlayUploadTargetSceneId = sceneId;
      overlayUploadTargetLayerId = overlayId ?? null;
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
        showFeedback(feedback, 'Unable to add overlay.', 'error');
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

  container.addEventListener('change', (event) => {
    const opacityInput = event.target.closest('[data-action="set-map-level-opacity"]');
    if (!opacityInput) {
      return;
    }

    const sceneId = opacityInput.getAttribute('data-scene-id');
    const levelId = opacityInput.getAttribute('data-map-level-id');
    if (!sceneId || !levelId) {
      return;
    }

    const opacity = normalizeMapLevelOpacityInput(opacityInput.value);
    let updated = false;
    mutateSceneMapLevels(stateApi, sceneId, (mapLevels) => {
      const level = mapLevels.levels.find((entry) => entry.id === levelId);
      if (!level) {
        return false;
      }

      level.opacity = opacity;
      updated = true;
      return true;
    });

    if (updated) {
      persistBoardStateSnapshot();
    }
  });

  overlayInput?.addEventListener('change', async () => {
    const file = overlayInput.files?.[0] ?? null;
    overlayInput.value = '';
    const targetMapLevelSceneId = mapLevelUploadTargetSceneId;
    mapLevelUploadTargetSceneId = null;
    const targetMapLevelId = mapLevelUploadTargetLevelId;
    mapLevelUploadTargetLevelId = null;
    const targetSceneId = overlayUploadTargetSceneId;
    overlayUploadTargetSceneId = null;
    const targetLayerId = overlayUploadTargetLayerId;
    overlayUploadTargetLayerId = null;

    if (!file) {
      return;
    }

    if (targetMapLevelSceneId) {
      if (!endpoints.uploads) {
        showFeedback(feedback, 'Map level uploads are unavailable right now.', 'error');
        return;
      }

      mapLevelUploadPending = true;
      mapLevelUploadPendingSceneId = targetMapLevelSceneId;
      render(stateApi.getState?.());

      try {
        const url = await uploadOverlayAsset(file, endpoints.uploads);
        if (!url) {
          throw new Error('Upload endpoint returned no URL.');
        }

        let levelUpdated = false;
        let limitReached = false;
        mutateSceneMapLevels(stateApi, targetMapLevelSceneId, (mapLevels) => {
          let resolvedTargetId = targetMapLevelId ?? mapLevels.activeLevelId ?? null;

          if (resolvedTargetId && !mapLevels.levels.some((level) => level.id === resolvedTargetId)) {
            resolvedTargetId = null;
          }

          if (!resolvedTargetId) {
            if (mapLevels.levels.length >= MAP_LEVEL_MAX_LEVELS) {
              limitReached = true;
              return false;
            }

            const orderedLevels = reindexMapLevels(getOrderedMapLevels(mapLevels.levels));
            const level = createMapLevel(`Level ${orderedLevels.length + 1}`, orderedLevels);
            orderedLevels.push(level);
            mapLevels.levels = reindexMapLevels(orderedLevels);
            resolvedTargetId = level.id;
          }

          mapLevels.levels = mapLevels.levels.map((level, index) => {
            if (level.id !== resolvedTargetId) {
              return level;
            }

            return {
              ...level,
              name: level.name || `Level ${index + 1}`,
              mapUrl: url,
              visible: true,
            };
          });
          mapLevels.activeLevelId = resolvedTargetId;
          levelUpdated = true;
          return true;
        });

        if (!levelUpdated) {
          const message = limitReached
            ? `Map levels are limited to ${MAP_LEVEL_MAX_LEVELS}.`
            : 'Unable to apply the uploaded map level.';
          throw new Error(message);
        }

        persistBoardStateSnapshot();
        showFeedback(feedback, 'Map level uploaded successfully.', 'success');
      } catch (error) {
        console.error('[VTT] Failed to upload map level', error);
        showFeedback(feedback, error?.message || 'Unable to upload map level.', 'error');
      } finally {
        mapLevelUploadPending = false;
        mapLevelUploadPendingSceneId = null;
        render(stateApi.getState?.());
      }
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
        let resolvedTargetId = targetLayerId ?? overlay.activeLayerId ?? null;

        if (!overlay.layers.length) {
          const layer = createOverlayLayer(`Overlay ${overlay.layers.length + 1}`, overlay.layers);
          overlay.layers.push(layer);
          overlay.activeLayerId = layer.id;
          resolvedTargetId = layer.id;
        }

        if (resolvedTargetId && !overlay.layers.some((layer) => layer.id === resolvedTargetId)) {
          resolvedTargetId = null;
        }

        if (!resolvedTargetId) {
          const layer = createOverlayLayer(`Overlay ${overlay.layers.length + 1}`, overlay.layers);
          overlay.layers.push(layer);
          overlay.activeLayerId = layer.id;
          resolvedTargetId = layer.id;
        }

        overlay.layers = overlay.layers.map((layer, index) => {
          const shouldReset = layer.id === resolvedTargetId;
          return {
            ...layer,
            name: layer.name || `Overlay ${index + 1}`,
            mapUrl: shouldReset ? url : layer.mapUrl ?? null,
            mask: shouldReset ? createEmptyOverlayMask() : normalizeOverlayMask(layer.mask ?? {}),
          };
        });

        overlay.activeLayerId = resolvedTargetId;

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
    const thumbnailUrl = currentState.boardState?.thumbnailUrl ?? null;
    const gridState = normalizeGridConfig(currentState.grid ?? {});

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
        thumbnailUrl,
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
        boardDraft.thumbnailUrl = scene.thumbnailUrl ?? null;
        ensureSceneBoardStateEntry(boardDraft, scene.id, scene.grid ?? null);
        if (!draft.grid || typeof draft.grid !== 'object') {
          draft.grid = normalizeGridConfig({});
        }
        // CRITICAL: Always use the scene's permanent grid property.
        // Grid is saved with the scene and should be the authoritative source.
        const gridConfig = normalizeGridConfig(scene.grid ?? {});
        draft.grid = { ...draft.grid, ...gridConfig };
        // Also update the sceneState entry to match the scene's permanent grid
        if (boardDraft.sceneState && boardDraft.sceneState[scene.id]) {
          boardDraft.sceneState[scene.id].grid = gridConfig;
        }
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
    draft.boardState = { activeSceneId: null, mapUrl: null, thumbnailUrl: null, placements: {}, sceneState: {} };
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
    const grid = normalizeGridConfig(existing.grid ?? fallbackGrid ?? {});
    existing.grid = grid;
    existing.overlay = normalizeOverlayConfig(existing.overlay ?? {});
    existing.mapLevels = normalizeMapLevelsState(existing.mapLevels ?? null, { sceneGrid: grid });
    // Do NOT force fogOfWar defaults here. Missing fogOfWar means "not configured"
    // which renders as fog-off. Forcing { enabled: true } would override the user's
    // explicit choice to disable fog whenever any scene action (overlay toggle, etc.)
    // calls this function.
    return existing;
  }

  const entry = {
    grid: normalizeGridConfig(fallbackGrid ?? {}),
    overlay: createEmptyOverlayConfig(),
    mapLevels: createEmptyMapLevelsState(),
    fogOfWar: { enabled: true, revealedCells: {} },
  };
  boardState.sceneState[key] = entry;
  return entry;
}

function normalizeGridConfig(raw = {}) {
  return normalizeGridState(raw);
}

const mapLevelSeed = Date.now();
let mapLevelSequence = 0;

function mutateSceneMapLevels(stateApi, sceneId, mutator) {
  if (!sceneId || !stateApi || typeof stateApi.updateState !== 'function' || typeof mutator !== 'function') {
    return false;
  }

  let changed = false;
  stateApi.updateState((draft) => {
    ensureSceneDraft(draft);
    const boardDraft = ensureBoardStateDraft(draft);
    const fallbackGrid = getSceneGridFromDraft(draft, sceneId);
    const sceneBoardState = ensureSceneBoardStateEntry(boardDraft, sceneId, fallbackGrid);
    if (!sceneBoardState) {
      return;
    }

    const sceneGrid = normalizeGridConfig(sceneBoardState.grid ?? fallbackGrid ?? {});
    const mapLevels = normalizeMapLevelsState(sceneBoardState.mapLevels ?? null, { sceneGrid });
    const result = mutator(mapLevels, { draft, boardDraft, sceneBoardState, sceneGrid });
    if (result === false) {
      return;
    }

    sceneBoardState.mapLevels = normalizeMapLevelsState(mapLevels, { sceneGrid });
    changed = true;
  });

  return changed;
}

function getSceneGridFromDraft(draft, sceneId) {
  const scene = Array.isArray(draft?.scenes?.items)
    ? draft.scenes.items.find((item) => item?.id === sceneId)
    : null;
  return scene?.grid ?? draft?.grid ?? null;
}

function getSceneGridFromState(state, sceneId) {
  const scene = Array.isArray(state?.scenes?.items)
    ? state.scenes.items.find((item) => item?.id === sceneId)
    : null;
  return scene?.grid ?? state?.grid ?? null;
}

function createMapLevelId() {
  mapLevelSequence += 1;
  return `${MAP_LEVEL_ID_PREFIX}${mapLevelSeed.toString(36)}-${mapLevelSequence.toString(36)}`;
}

function createMapLevel(name = '', existingLevels = []) {
  const safeLevels = Array.isArray(existingLevels) ? existingLevels : [];
  const trimmed = typeof name === 'string' ? name.trim() : '';
  return {
    id: createMapLevelId(),
    name: ensureUniqueMapLevelName(trimmed || `Level ${safeLevels.length + 1}`, safeLevels),
    mapUrl: null,
    visible: true,
    opacity: 1,
    zIndex: safeLevels.length,
    grid: null,
    cutouts: [],
    blocksLowerLevelInteraction: true,
    blocksLowerLevelVision: true,
    defaultForPlayers: safeLevels.length === 0,
  };
}

function ensureUniqueMapLevelName(baseName, existingLevels = []) {
  const fallback = typeof baseName === 'string' && baseName.trim() ? baseName.trim() : 'Level 1';
  const normalizedExisting = new Set();
  const usedNumbers = new Set();

  existingLevels.forEach((level) => {
    if (!level || typeof level !== 'object') {
      return;
    }

    const candidate = typeof level.name === 'string' ? level.name.trim() : '';
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
  const prefixPattern = new RegExp(`^${escapeRegExp(prefix)}\\s+(\\d+)$`, 'i');

  existingLevels.forEach((level) => {
    if (!level || typeof level !== 'object') {
      return;
    }

    const candidate = typeof level.name === 'string' ? level.name.trim() : '';
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

function getOrderedMapLevels(levels = []) {
  return (Array.isArray(levels) ? levels : [])
    .map((level, sourceIndex) => ({ level, sourceIndex }))
    .filter(({ level }) => level && typeof level === 'object')
    .sort((left, right) => {
      const leftZ = Number.isFinite(left.level.zIndex) ? left.level.zIndex : left.sourceIndex;
      const rightZ = Number.isFinite(right.level.zIndex) ? right.level.zIndex : right.sourceIndex;
      if (leftZ !== rightZ) {
        return leftZ - rightZ;
      }
      return left.sourceIndex - right.sourceIndex;
    })
    .map(({ level }) => level);
}

function reindexMapLevels(levels = []) {
  return (Array.isArray(levels) ? levels : []).map((level, index) => ({
    ...level,
    zIndex: index,
  }));
}

function normalizeMapLevelOpacityInput(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 1;
  }
  return roundToPrecision(clamp(numeric, 0, 100) / 100, 2);
}

function formatMapLevelOpacityPercent(value) {
  const numeric = Number(value);
  const opacity = Number.isFinite(numeric) ? numeric : 1;
  return Math.round(clamp(opacity, 0, 1) * 100);
}

function normalizeBoardStateVersion(value) {
  const numeric = typeof value === 'number' ? value : Number.parseInt(value, 10);
  return Number.isFinite(numeric) ? Math.max(0, Math.trunc(numeric)) : 0;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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

  if (base.mapUrl) {
    const preferredId = raw.activeLayerId ?? raw.activeLayer ?? raw.selectedLayerId ?? null;
    let assigned = false;
    base.layers = base.layers.map((layer, index) => {
      if (layer.mapUrl) {
        return layer;
      }

      if (!assigned && (layer.id === preferredId || index === 0)) {
        assigned = true;
        return { ...layer, mapUrl: base.mapUrl };
      }

      return layer;
    });
  }

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
  const mapUrlSource = typeof raw.mapUrl === 'string' ? raw.mapUrl.trim() : '';
  const id = idSource || createOverlayLayerId();
  const name = nameSource || `Overlay ${index + 1}`;

  return {
    id,
    name,
    visible,
    mask,
    mapUrl: mapUrlSource || null,
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
    mapUrl: null,
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
  const prefixPattern = new RegExp(`^${escapeRegExp(prefix)}\\s+(\\d+)$`, 'i');

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
  const pattern = new RegExp(`^${escapeRegExp(prefix)}\\s+(\\d+)$`, 'i');
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
  const entries = Array.isArray(layers) ? layers : [];
  if (!entries.length) {
    return null;
  }

  if (typeof preferredId === 'string') {
    const trimmed = preferredId.trim();
    if (trimmed) {
      const preferredLayer = entries.find((layer) => layer && layer.id === trimmed);
      if (preferredLayer && preferredLayer.visible !== false) {
        return preferredLayer.id;
      }
    }
  }

  const visibleLayer = entries.find((layer) => layer && layer.visible !== false && layer.id);
  if (visibleLayer) {
    return visibleLayer.id;
  }

  const fallback = entries.find((layer) => layer && layer.id);
  return fallback ? fallback.id : null;
}

function rebuildOverlayAggregate(overlay) {
  if (!overlay || typeof overlay !== 'object') {
    return createEmptyOverlayConfig();
  }

  const mask = buildAggregateMask(Array.isArray(overlay.layers) ? overlay.layers : []);
  overlay.mask = mask;
  overlay.activeLayerId = resolveActiveLayerId(overlay.activeLayerId, overlay.layers);
  overlay.mapUrl = resolveOverlayMapUrl(overlay.layers, overlay.activeLayerId);
  return overlay;
}

function resolveOverlayMapUrl(layers = [], activeLayerId = null) {
  if (!Array.isArray(layers) || layers.length === 0) {
    return null;
  }

  if (activeLayerId) {
    const activeLayer = layers.find((layer) => layer && layer.id === activeLayerId);
    if (activeLayer?.mapUrl) {
      return activeLayer.mapUrl;
    }
  }

  const visibleLayer = layers.find((layer) => layer && layer.visible !== false && layer.mapUrl);
  if (visibleLayer?.mapUrl) {
    return visibleLayer.mapUrl;
  }

  const firstWithMap = layers.find((layer) => layer?.mapUrl);
  return firstWithMap?.mapUrl ?? null;
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

  const collapsedFolders = loadCollapsedFolders();

  const markup = groups
    .map((group) => {
      const folderId = group.id ?? 'unsorted';
      const isCollapsed = collapsedFolders.has(folderId);
      return `
      <section class="scene-group${isCollapsed ? ' is-collapsed' : ''}" data-folder-id="${group.id ?? ''}">
        <header class="scene-group__header">
          <button type="button" class="scene-group__toggle" data-action="toggle-folder" data-folder-id="${folderId}">
            <span class="scene-group__chevron"></span>
            <h4 class="scene-group__title">${escapeHtml(group.title)}</h4>
            <span class="scene-group__count">${group.scenes.length}</span>
          </button>
        </header>
        <div class="scene-group__body">
          ${group.scenes
            .map((scene) =>
              renderSceneItem(scene, activeSceneId, boardSceneState[scene.id] ?? {}, options)
            )
            .join('')}
        </div>
      </section>
    `;
    })
    .join('');

  return `<div class="scene-list">${markup}</div>`;
}

const COLLAPSED_FOLDERS_KEY = 'vtt-collapsed-scene-folders';

function loadCollapsedFolders() {
  try {
    const stored = localStorage.getItem(COLLAPSED_FOLDERS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        return new Set(parsed);
      }
    }
  } catch (error) {
    // Ignore localStorage errors
  }
  return new Set();
}

function saveCollapsedFolders(collapsedSet) {
  try {
    localStorage.setItem(COLLAPSED_FOLDERS_KEY, JSON.stringify([...collapsedSet]));
  } catch (error) {
    // Ignore localStorage errors
  }
}

function toggleFolderCollapsed(folderId) {
  const collapsed = loadCollapsedFolders();
  if (collapsed.has(folderId)) {
    collapsed.delete(folderId);
  } else {
    collapsed.add(folderId);
  }
  saveCollapsedFolders(collapsed);
  return collapsed.has(folderId);
}

function renderSceneItem(scene, activeSceneId, sceneBoardState = {}, options = {}) {
  const isActive = scene.id === activeSceneId;
  const name = escapeHtml(scene.name || 'Untitled Scene');
  const sceneGrid = normalizeGridConfig(sceneBoardState.grid ?? scene.grid ?? {});
  const mapLevelsState = normalizeMapLevelsState(sceneBoardState.mapLevels ?? null, { sceneGrid });
  const overlayState = normalizeOverlayConfig(sceneBoardState.overlay ?? {});
  const overlayMapSet = Boolean(overlayState.mapUrl);
  const hasOverlayContent = overlayMapSet || overlayState.layers.some((layer) => maskHasMeaningfulContent(layer.mask));
  const assetUploadPending = Boolean(options.assetUploadPending);

  const overlayUploadDisabled =
    !options.overlayUploadsEnabled || assetUploadPending || !isActive;
  const overlayUploadTitle = !options.overlayUploadsEnabled
    ? 'Overlay uploads are unavailable right now.'
    : !isActive
      ? 'Activate the scene before uploading an overlay.'
      : assetUploadPending
        ? 'An image upload is already in progress.'
        : '';
  const addOverlayDisabled = assetUploadPending;
  const addOverlayTitle = assetUploadPending
    ? 'Wait for the current image upload to finish before adding another overlay.'
    : '';
  const addMapLevelDisabled = assetUploadPending || mapLevelsState.levels.length >= MAP_LEVEL_MAX_LEVELS;
  const addMapLevelTitle = assetUploadPending
    ? 'Wait for the current image upload to finish before adding another map level.'
    : mapLevelsState.levels.length >= MAP_LEVEL_MAX_LEVELS
      ? `Maximum of ${MAP_LEVEL_MAX_LEVELS} map levels reached.`
      : '';
  const mapLevelUploadDisabled = !options.mapLevelUploadsEnabled || assetUploadPending;
  const mapLevelUploadTitle = !options.mapLevelUploadsEnabled
    ? 'Map level uploads are unavailable right now.'
    : assetUploadPending
      ? 'An image upload is already in progress.'
      : '';

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
        <div class="scene-item__levels" data-scene-id="${scene.id}">
          <div class="scene-level__actions">
            <span class="scene-level__title">Map Levels</span>
            <span class="scene-level__count">${mapLevelsState.levels.length}/${MAP_LEVEL_MAX_LEVELS}</span>
            <button
              type="button"
              class="btn btn--small"
              data-action="add-map-level"
              data-scene-id="${scene.id}"
              ${addMapLevelDisabled ? 'disabled' : ''}
              ${addMapLevelTitle ? ` title="${escapeHtml(addMapLevelTitle)}"` : ''}
            >
              Add Level
            </button>
            ${options.mapLevelUploadPending && options.mapLevelUploadPendingSceneId === scene.id
              ? '<span class="scene-level__status" role="status">Uploading level...</span>'
              : ''}
          </div>
          ${renderMapLevelList(scene.id, mapLevelsState, {
            isActiveScene: isActive,
            mapLevelUploadDisabled,
            mapLevelUploadTitle,
          })}
        </div>
        <div class="scene-item__overlays" data-scene-id="${scene.id}">
          <div class="scene-overlay__actions">
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
              ? '<span class="scene-overlay__status" role="status">Uploading overlay...</span>'
              : ''}
          </div>
          ${renderOverlayList(scene.id, overlayState, {
            isActiveScene: isActive,
            overlayMapSet,
            overlayUploadDisabled,
            overlayUploadTitle,
          })}
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

function renderMapLevelList(sceneId, mapLevelsState, options = {}) {
  const levels = getOrderedMapLevels(mapLevelsState?.levels ?? []);
  if (!levels.length) {
    return '<p class="scene-level__empty">No map levels added yet.</p>';
  }

  return `
    <ul class="scene-level__list">
      ${levels
        .map((level, index) => renderMapLevelListItem(sceneId, mapLevelsState, level, index, levels, options))
        .join('')}
    </ul>
  `;
}

function renderMapLevelListItem(sceneId, mapLevelsState, level, index, levels, options = {}) {
  const name = escapeHtml(level.name || `Level ${index + 1}`);
  const visible = level.visible !== false;
  const isActiveLevel = mapLevelsState.activeLevelId === level.id;
  const opacityPercent = formatMapLevelOpacityPercent(level.opacity);
  const hasMap = Boolean(level.mapUrl);
  const canLower = index > 0;
  const canRaise = index < levels.length - 1;
  const uploadDisabled = Boolean(options.mapLevelUploadDisabled);
  const uploadTitle = options.mapLevelUploadTitle || '';
  const cutoutCount = Array.isArray(level.cutouts) ? level.cutouts.length : 0;
  const cutoutDisabled = !options.isActiveScene || !isActiveLevel || !hasMap || !visible;
  const cutoutTitle = !options.isActiveScene
    ? 'Activate this scene to edit level cutouts.'
    : !isActiveLevel
      ? 'Select this level before editing cutouts.'
      : !hasMap
        ? 'Upload a map image before editing cutouts.'
        : !visible
          ? 'Show this level before editing cutouts.'
          : '';

  return `
    <li
      class="scene-level__item${isActiveLevel ? ' is-active' : ''}"
      data-map-level-id="${level.id}"
      data-scene-id="${sceneId}"
      data-map-level-visible="${visible ? 'true' : 'false'}"
      data-map-level-has-map="${hasMap ? 'true' : 'false'}"
    >
      <div class="scene-level__header">
        <label class="scene-level__visibility" title="Toggle map level visibility.">
          <input
            type="checkbox"
            class="scene-level__checkbox"
            data-action="toggle-map-level-visibility"
            data-scene-id="${sceneId}"
            data-map-level-id="${level.id}"
            aria-label="${visible ? 'Hide map level' : 'Show map level'}"
            ${visible ? 'checked' : ''}
          />
        </label>
        <span class="scene-level__name" title="${name}">${name}</span>
        <span class="scene-level__map-state">${hasMap ? 'Map' : 'No Map'}</span>
      </div>
      <label class="scene-level__opacity">
        <span class="scene-level__opacity-label">Opacity</span>
        <input
          type="range"
          min="0"
          max="100"
          step="5"
          value="${opacityPercent}"
          data-action="set-map-level-opacity"
          data-scene-id="${sceneId}"
          data-map-level-id="${level.id}"
          aria-label="Map level opacity"
        />
        <span class="scene-level__opacity-value">${opacityPercent}%</span>
      </label>
      <div class="scene-level__controls">
        <button
          type="button"
          class="btn btn--ghost btn--tiny scene-level__upload"
          data-action="upload-map-level"
          data-scene-id="${sceneId}"
          data-map-level-id="${level.id}"
          ${uploadDisabled ? 'disabled' : ''}
          ${uploadTitle ? ` title="${escapeHtml(uploadTitle)}"` : ''}
        >
          Upload
        </button>
        <button
          type="button"
          class="btn btn--ghost btn--tiny scene-level__rename"
          data-action="rename-map-level"
          data-scene-id="${sceneId}"
          data-map-level-id="${level.id}"
        >
          Rename
        </button>
        <button
          type="button"
          class="btn btn--ghost btn--tiny scene-level__select"
          data-action="select-map-level"
          data-scene-id="${sceneId}"
          data-map-level-id="${level.id}"
          aria-pressed="${isActiveLevel ? 'true' : 'false'}"
        >
          Select
        </button>
        <button
          type="button"
          class="btn btn--ghost btn--tiny scene-level__cutouts"
          data-action="edit-map-level-cutouts"
          data-scene-id="${sceneId}"
          data-map-level-id="${level.id}"
          data-map-level-cutout-count="${cutoutCount}"
          aria-pressed="false"
          ${cutoutDisabled ? 'disabled' : ''}
          ${cutoutTitle ? ` title="${escapeHtml(cutoutTitle)}"` : ''}
        >
          Cutouts${cutoutCount ? ` (${cutoutCount})` : ''}
        </button>
        <button
          type="button"
          class="btn btn--ghost btn--tiny scene-level__lower"
          data-action="lower-map-level"
          data-scene-id="${sceneId}"
          data-map-level-id="${level.id}"
          ${canLower ? '' : 'disabled'}
        >
          Lower
        </button>
        <button
          type="button"
          class="btn btn--ghost btn--tiny scene-level__raise"
          data-action="raise-map-level"
          data-scene-id="${sceneId}"
          data-map-level-id="${level.id}"
          ${canRaise ? '' : 'disabled'}
        >
          Raise
        </button>
        <button
          type="button"
          class="btn btn--ghost btn--tiny btn--danger scene-level__delete"
          data-action="delete-map-level"
          data-scene-id="${sceneId}"
          data-map-level-id="${level.id}"
        >
          Delete
        </button>
      </div>
    </li>
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
  const layerHasMap = Boolean(layer.mapUrl);
  const editDisabled = !options.isActiveScene || (!options.overlayMapSet && !layerHasMap);
  let editTitle = '';
  if (!options.overlayMapSet && !layerHasMap) {
    editTitle = 'Upload an overlay image before editing the overlay mask.';
  } else if (!options.isActiveScene) {
    editTitle = 'Activate this scene to edit this overlay.';
  }
  const isActiveLayer = overlayState.activeLayerId === layer.id;
  const uploadDisabled = options.overlayUploadDisabled;
  const uploadTitle = options.overlayUploadTitle || '';

  return `
    <li
      class="scene-overlay__item${isActiveLayer ? ' is-active' : ''}"
      data-overlay-id="${layer.id}"
      data-scene-id="${sceneId}"
      data-overlay-visible="${overlayVisible ? 'true' : 'false'}"
    >
      <div class="scene-overlay__header">
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
        <span class="scene-overlay__name" title="${name}">${name}</span>
      </div>
      <div class="scene-overlay__controls">
        <button
          type="button"
          class="btn btn--ghost btn--tiny scene-overlay__upload"
          data-action="upload-overlay-map"
          data-scene-id="${sceneId}"
          data-overlay-id="${layer.id}"
          ${uploadDisabled ? 'disabled' : ''}
          ${uploadTitle ? ` title="${escapeHtml(uploadTitle)}"` : ''}
        >
          New Over
        </button>
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
  const mapUrl = typeof scene.mapUrl === 'string' ? scene.mapUrl.trim() : '';
  if (!mapUrl) {
    return `
      <div class="scene-item__preview scene-item__preview--empty">
        <span class="scene-item__preview-text">No Map</span>
      </div>
    `;
  }

  const thumbUrl = typeof scene.thumbnailUrl === 'string' ? scene.thumbnailUrl.trim() : '';
  const previewSrc = thumbUrl || mapUrl;
  const safeName = typeof fallbackName === 'string' ? fallbackName.trim() : '';
  const label = safeName ? `Preview of ${safeName}` : 'Scene preview';
  return `
    <div class="scene-item__preview">
      <img src="${escapeHtml(previewSrc)}" alt="${escapeHtml(label)}" loading="lazy" />
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

  const url = payload.data?.url ?? null;
  return typeof url === 'string' ? url.trim() || null : null;
}

async function readUploadError(response) {
  try {
    const payload = await response.json();
    return payload.error ?? '';
  } catch (error) {
    return '';
  }
}

export const __testing = {
  buildSceneMarkup,
  createMapLevel,
  getOrderedMapLevels,
  mutateSceneMapLevels,
  normalizeMapLevelOpacityInput,
  reindexMapLevels,
};
