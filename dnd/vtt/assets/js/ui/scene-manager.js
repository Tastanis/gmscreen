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

  const stateApi = store ?? {};
  const endpoints = routes ?? {};

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
      boardSceneState
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

    if (action === 'create-overlay' && sceneId) {
      const currentState = stateApi.getState?.() ?? {};
      const sceneState = normalizeSceneState(currentState.scenes);
      const scene = sceneState.items.find((item) => item.id === sceneId);
      if (!scene) {
        return;
      }

      if ((currentState.boardState?.activeSceneId ?? null) !== sceneId) {
        showFeedback(feedback, 'Activate the scene before duplicating its overlay.', 'error');
        return;
      }

      const mapUrl = typeof scene.mapUrl === 'string' ? scene.mapUrl.trim() : '';
      if (!mapUrl) {
        showFeedback(feedback, 'Upload a map before creating an overlay.', 'error');
        return;
      }

      let overlayUpdated = false;
      stateApi.updateState?.((draft) => {
        ensureSceneDraft(draft);
        const boardDraft = ensureBoardStateDraft(draft);
        const sceneBoardState = ensureSceneBoardStateEntry(
          boardDraft,
          scene.id,
          scene.grid ?? null
        );
        if (!sceneBoardState) {
          return;
        }
        const nextOverlay = normalizeOverlayConfig(sceneBoardState.overlay ?? {});
        if (nextOverlay.mapUrl !== mapUrl) {
          nextOverlay.mapUrl = mapUrl;
          overlayUpdated = true;
        }
        sceneBoardState.overlay = nextOverlay;
      });

      if (overlayUpdated) {
        persistBoardStateSnapshot();
        showFeedback(feedback, 'Overlay duplicated from the active map.', 'success');
      } else {
        showFeedback(feedback, 'Overlay already matches the active map.', 'info');
      }
    }

    if (action === 'remove-overlay' && sceneId) {
      let overlayCleared = false;
      stateApi.updateState?.((draft) => {
        ensureSceneDraft(draft);
        const boardDraft = ensureBoardStateDraft(draft);
        const sceneBoardState = ensureSceneBoardStateEntry(boardDraft, sceneId, null);
        if (!sceneBoardState || !sceneBoardState.overlay) {
          return;
        }

        const currentOverlay = normalizeOverlayConfig(sceneBoardState.overlay);
        const hasMask = currentOverlay.mask && Object.keys(currentOverlay.mask).length > 0;
        if (!currentOverlay.mapUrl && !hasMask) {
          return;
        }

        sceneBoardState.overlay = normalizeOverlayConfig({});
        overlayCleared = true;
      });

      if (overlayCleared) {
        persistBoardStateSnapshot();
        showFeedback(feedback, 'Scene overlay cleared.', 'info');
      } else {
        showFeedback(feedback, 'Scene overlay is already empty.', 'info');
      }
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
            boardDraft.overlay = normalizeOverlayConfig({});
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
    draft.boardState.overlay = { mapUrl: null, mask: createEmptyOverlayMask() };
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
    overlay: normalizeOverlayConfig({}),
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

function normalizeOverlayConfig(raw = {}) {
  if (!raw || typeof raw !== 'object') {
    return { mapUrl: null, mask: createEmptyOverlayMask() };
  }

  const mapUrl = typeof raw.mapUrl === 'string' ? raw.mapUrl.trim() : '';
  const mask = normalizeOverlayMask(raw.mask ?? null);

  return {
    mapUrl: mapUrl ? mapUrl : null,
    mask,
  };
}

function createEmptyOverlayMask() {
  return { visible: true, polygons: [] };
}

function normalizeOverlayMask(raw) {
  if (!raw || typeof raw !== 'object') {
    return createEmptyOverlayMask();
  }

  const normalized = {
    visible: raw.visible === undefined ? true : Boolean(raw.visible),
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
    const pointsSource = Array.isArray(polygon?.points) ? polygon.points : Array.isArray(polygon) ? polygon : [];
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

function buildSceneMarkup(sceneState, activeSceneId, boardSceneState = {}) {
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
            .map((scene) => renderSceneItem(scene, activeSceneId, boardSceneState[scene.id] ?? {}))
            .join('')}
        </div>
      </section>
    `)
    .join('');

  return `<div class="scene-list">${markup}</div>`;
}

function renderSceneItem(scene, activeSceneId, sceneBoardState = {}) {
  const isActive = scene.id === activeSceneId;
  const name = escapeHtml(scene.name || 'Untitled Scene');
  const overlayState = normalizeOverlayConfig(sceneBoardState.overlay ?? {});
  const hasOverlay = Boolean(overlayState.mapUrl) || Object.keys(overlayState.mask).length > 0;
  const isActiveScene = isActive;
  const hasMap = typeof scene.mapUrl === 'string' && scene.mapUrl.trim() !== '';
  return `
    <article class="scene-item${isActive ? ' is-active' : ''}" data-scene-id="${scene.id}">
      ${renderScenePreview(scene, scene.name)}
      <div class="scene-item__content">
        <header class="scene-item__header">
          <h4>${name}</h4>
          <span class="scene-item__status">${isActive ? 'Active' : ''}</span>
        </header>
        <footer class="scene-item__footer">
          <button type="button" class="btn" data-action="activate-scene" data-scene-id="${scene.id}">Activate</button>
          <button
            type="button"
            class="btn"
            data-action="create-overlay"
            data-scene-id="${scene.id}"
            ${isActiveScene && hasMap ? '' : 'disabled'}
          >
            Duplicate Overlay
          </button>
          <button
            type="button"
            class="btn"
            data-action="remove-overlay"
            data-scene-id="${scene.id}"
            ${hasOverlay ? '' : 'disabled'}
          >
            Clear Overlay
          </button>
          <button type="button" class="btn btn--danger" data-action="delete-scene" data-scene-id="${scene.id}">Delete</button>
        </footer>
      </div>
    </article>
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
