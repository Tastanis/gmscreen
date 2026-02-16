/**
 * Fog of War module.
 *
 * Renders a grid-aligned darkness overlay on a <canvas> element that sits
 * above the token layer. The GM sees a translucent overlay; players see
 * opaque black.  PC-folder tokens automatically reveal their grid cells.
 *
 * Data is stored per-scene in boardState.sceneState[sceneId].fogOfWar:
 *   { enabled: boolean, revealedCells: { "col,row": true, ... } }
 */

import {
  PLAYER_VISIBLE_TOKEN_FOLDER,
  normalizePlayerTokenFolderName,
} from '../state/store.js';

// ── Constants ────────────────────────────────────────────────────

const GM_FOG_ALPHA = 0.7;
const PLAYER_FOG_ALPHA = 1.0;
const FOG_COLOR = '0,0,0';
const SELECTION_FILL = 'rgba(70,160,255,0.25)';
const SELECTION_STROKE = 'rgba(70,160,255,0.8)';

// ── Debug logging (check F12 console) ────────────────────────────
const FOG_DEBUG = false; // set to false to silence fog diagnostics
function fogLog(...args) {
  if (FOG_DEBUG) console.log('[FOG DEBUG]', ...args);
}
function fogWarn(...args) {
  if (FOG_DEBUG) console.warn('[FOG DEBUG]', ...args);
}

// ── Module state ─────────────────────────────────────────────────

let fogCanvas = null;
let fogCtx = null;
let selCanvas = null;
let selCtx = null;
let panelEl = null;

let boardApi = null;
let viewStateRef = null;  // reference to the live viewState object
let isGm = false;

// Fog-select interaction state
let fogSelectActive = false;
let selectionStart = null;   // {col, row} grid coords of anchor corner
let selectionEnd = null;     // {col, row} grid coords of drag corner
let selectedCells = new Set(); // set of "col,row" strings currently highlighted
let pointerDownForFog = false;

// ── Public API ───────────────────────────────────────────────────

/**
 * Mount the fog-of-war system.  Called once at startup from bootstrap/board-interactions.
 */
export function mountFogOfWar(options = {}) {
  boardApi = options.boardApi ?? null;
  viewStateRef = options.viewState ?? null;
  isGm = Boolean(options.isGm);

  fogCanvas = document.getElementById('vtt-fog-layer');
  selCanvas = document.getElementById('vtt-fog-selection-layer');

  if (fogCanvas) fogCtx = fogCanvas.getContext('2d');
  if (selCanvas) selCtx = selCanvas.getContext('2d');

  fogLog('mountFogOfWar:', {
    isGm,
    hasBoardApi: !!boardApi,
    hasViewState: !!viewStateRef,
    hasFogCanvas: !!fogCanvas,
    hasFogCtx: !!fogCtx,
    hasSelCanvas: !!selCanvas,
    hasSelCtx: !!selCtx,
  });

  if (!selCanvas) fogWarn('vtt-fog-selection-layer element NOT found in DOM');
  if (!fogCanvas) fogWarn('vtt-fog-layer element NOT found in DOM');

  if (isGm) {
    mountPanel();
    mountFogSelectInteraction();
  }
}

/**
 * Re-render the fog overlay.  Called whenever the board state changes.
 */
export function renderFog(state) {
  if (!fogCanvas || !fogCtx) return;

  const activeSceneId = state?.boardState?.activeSceneId ?? null;
  if (!activeSceneId) {
    clearCanvas(fogCtx, fogCanvas);
    return;
  }

  const fogState = getFogState(state, activeSceneId);
  if (!fogState || !fogState.enabled) {
    fogLog('renderFog: fog OFF for scene', activeSceneId, '— fogState:', fogState);
    clearCanvas(fogCtx, fogCanvas);
    syncPanelToggle(false);
    return;
  }

  syncPanelToggle(true);

  const view = viewStateRef ?? {};
  const gridSize = Math.max(8, Number.isFinite(view.gridSize) ? view.gridSize : 64);
  const mapW = Number.isFinite(view.mapPixelSize?.width) ? view.mapPixelSize.width : 0;
  const mapH = Number.isFinite(view.mapPixelSize?.height) ? view.mapPixelSize.height : 0;
  if (mapW <= 0 || mapH <= 0) {
    clearCanvas(fogCtx, fogCanvas);
    return;
  }

  const offsets = view.gridOffsets ?? {};
  const offsetLeft = Number.isFinite(offsets.left) ? offsets.left : 0;
  const offsetTop = Number.isFinite(offsets.top) ? offsets.top : 0;

  // Size the canvas to the map
  if (fogCanvas.width !== mapW || fogCanvas.height !== mapH) {
    fogCanvas.width = mapW;
    fogCanvas.height = mapH;
  }
  fogCanvas.style.width = mapW + 'px';
  fogCanvas.style.height = mapH + 'px';

  const cols = Math.ceil((mapW - offsetLeft) / gridSize);
  const rows = Math.ceil((mapH - offsetTop) / gridSize);

  const revealed = fogState.revealedCells ?? {};

  // Build set of cells auto-revealed by PC tokens
  const pcCells = buildPcRevealedCells(state, activeSceneId);

  const alpha = isGm ? GM_FOG_ALPHA : PLAYER_FOG_ALPHA;

  fogCtx.clearRect(0, 0, mapW, mapH);
  fogCtx.fillStyle = `rgba(${FOG_COLOR},${alpha})`;

  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const key = c + ',' + r;
      if (revealed[key] || pcCells.has(key)) continue;

      const x = offsetLeft + c * gridSize;
      const y = offsetTop + r * gridSize;
      fogCtx.fillRect(x, y, gridSize, gridSize);
    }
  }
}

/**
 * Render the selection highlight overlay (separate canvas).
 */
export function renderFogSelection() {
  if (!selCanvas || !selCtx) {
    fogWarn('renderFogSelection: missing canvas/ctx — selCanvas:', !!selCanvas, 'selCtx:', !!selCtx);
    return;
  }

  const view = viewStateRef ?? {};
  const mapW = Number.isFinite(view.mapPixelSize?.width) ? view.mapPixelSize.width : 0;
  const mapH = Number.isFinite(view.mapPixelSize?.height) ? view.mapPixelSize.height : 0;
  if (mapW <= 0 || mapH <= 0) {
    fogWarn('renderFogSelection: mapPixelSize invalid — clearing canvas. mapW:', mapW, 'mapH:', mapH);
    clearCanvas(selCtx, selCanvas);
    return;
  }

  if (selCanvas.width !== mapW || selCanvas.height !== mapH) {
    selCanvas.width = mapW;
    selCanvas.height = mapH;
  }
  selCanvas.style.width = mapW + 'px';
  selCanvas.style.height = mapH + 'px';

  selCtx.clearRect(0, 0, mapW, mapH);

  if (selectedCells.size === 0) return;

  const gridSize = Math.max(8, Number.isFinite(view.gridSize) ? view.gridSize : 64);
  const offsets = view.gridOffsets ?? {};
  const offsetLeft = Number.isFinite(offsets.left) ? offsets.left : 0;
  const offsetTop = Number.isFinite(offsets.top) ? offsets.top : 0;

  selCtx.fillStyle = SELECTION_FILL;
  selCtx.strokeStyle = SELECTION_STROKE;
  selCtx.lineWidth = 2;

  selectedCells.forEach((key) => {
    const [cStr, rStr] = key.split(',');
    const c = parseInt(cStr, 10);
    const r = parseInt(rStr, 10);
    if (!Number.isFinite(c) || !Number.isFinite(r)) return;

    const x = offsetLeft + c * gridSize;
    const y = offsetTop + r * gridSize;
    selCtx.fillRect(x, y, gridSize, gridSize);
    selCtx.strokeRect(x + 1, y + 1, gridSize - 2, gridSize - 2);
  });
}

/**
 * Returns true if a placement at the given grid position is hidden by fog
 * for a non-GM user.  Used by board-interactions to block token clicks.
 */
export function isPositionFogged(state, col, row) {
  if (isGm) return false;

  const activeSceneId = state?.boardState?.activeSceneId ?? null;
  if (!activeSceneId) return false;

  const fogState = getFogState(state, activeSceneId);
  if (!fogState || !fogState.enabled) return false;

  const key = Math.floor(col) + ',' + Math.floor(row);
  const revealed = fogState.revealedCells ?? {};
  if (revealed[key]) return false;

  // Check PC auto-reveal
  const pcCells = buildPcRevealedCells(state, activeSceneId);
  if (pcCells.has(key)) return false;

  return true;
}

/**
 * Create a fog-check function with pre-computed data for efficient batch
 * checks (e.g. during token rendering).  Returns null when fog is inactive.
 */
export function createFogChecker(state) {
  if (isGm) return null;

  const activeSceneId = state?.boardState?.activeSceneId ?? null;
  if (!activeSceneId) return null;

  const fogState = getFogState(state, activeSceneId);
  if (!fogState || !fogState.enabled) return null;

  const revealed = fogState.revealedCells ?? {};
  const pcCells = buildPcRevealedCells(state, activeSceneId);

  return (col, row) => {
    const key = Math.floor(col) + ',' + Math.floor(row);
    return !revealed[key] && !pcCells.has(key);
  };
}

/**
 * Returns true if fog-select mode is currently active.
 */
export function isFogSelectActive() {
  return fogSelectActive;
}

/**
 * Toggle fog enabled/disabled for the given scene.
 */
export function toggleFogForScene(sceneId, enabled, options = {}) {
  fogLog('toggleFogForScene:', sceneId, 'enabled:', enabled);
  if (!boardApi || !sceneId) return;

  const markDirty = options.markSceneStateDirty;

  boardApi.updateState((draft) => {
    if (!draft.boardState.sceneState) {
      draft.boardState.sceneState = {};
    }
    if (!draft.boardState.sceneState[sceneId]) {
      draft.boardState.sceneState[sceneId] = { grid: { size: 64, locked: false, visible: true } };
    }
    if (!draft.boardState.sceneState[sceneId].fogOfWar) {
      draft.boardState.sceneState[sceneId].fogOfWar = { enabled: false, revealedCells: {} };
    }
    draft.boardState.sceneState[sceneId].fogOfWar.enabled = Boolean(enabled);
    // When enabling, start fully fogged (revealedCells stays as-is or empty)
  });

  if (typeof markDirty === 'function') markDirty(sceneId);
}

/**
 * Get the current fog state for a scene.
 */
export function getFogStateForScene(state, sceneId) {
  return getFogState(state, sceneId);
}

// ── Internal helpers ─────────────────────────────────────────────

function getFogState(state, sceneId) {
  if (!sceneId) return null;
  const sceneState = state?.boardState?.sceneState;
  if (!sceneState || typeof sceneState !== 'object') return null;
  const entry = sceneState[sceneId];
  if (!entry || typeof entry !== 'object') return null;
  return entry.fogOfWar ?? null;
}

function clearCanvas(ctx, canvas) {
  if (!ctx || !canvas) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

/**
 * Build a Set of "col,row" keys for cells occupied by PC-folder tokens.
 */
function buildPcRevealedCells(state, activeSceneId) {
  const cells = new Set();
  if (!state || !activeSceneId) return cells;

  const placements = state.boardState?.placements?.[activeSceneId];
  if (!Array.isArray(placements)) return cells;

  const tokens = state.tokens ?? { folders: [], items: [] };
  const playerFolderKey = normalizePlayerTokenFolderName(PLAYER_VISIBLE_TOKEN_FOLDER);
  if (!playerFolderKey) return cells;

  // Build a set of folder IDs that match the PC folder name
  const pcFolderIds = new Set();
  (tokens.folders ?? []).forEach((folder) => {
    if (!folder || typeof folder !== 'object') return;
    const nameKey = normalizePlayerTokenFolderName(folder.name);
    if (nameKey === playerFolderKey && folder.id) {
      pcFolderIds.add(folder.id);
    }
  });

  // Build a set of token IDs that belong to PC folders
  const pcTokenIds = new Set();
  (tokens.items ?? []).forEach((token) => {
    if (!token || typeof token !== 'object') return;
    if (token.folderId && pcFolderIds.has(token.folderId)) {
      pcTokenIds.add(token.id);
    }
    // Also check inline folder name
    if (token.folder && typeof token.folder.name === 'string') {
      if (normalizePlayerTokenFolderName(token.folder.name) === playerFolderKey) {
        pcTokenIds.add(token.id);
      }
    }
  });

  placements.forEach((placement) => {
    if (!placement || typeof placement !== 'object') return;
    const tokenId = typeof placement.tokenId === 'string' ? placement.tokenId : '';
    // Check if this placement's token is in a PC folder
    const isPc = pcTokenIds.has(tokenId) || placement.combatTeam === 'ally';
    if (!isPc) return;

    const col = Math.floor(Number(placement.column ?? 0));
    const row = Math.floor(Number(placement.row ?? 0));
    const w = Math.max(1, Math.floor(Number(placement.width ?? 1)));
    const h = Math.max(1, Math.floor(Number(placement.height ?? 1)));

    for (let dc = 0; dc < w; dc++) {
      for (let dr = 0; dr < h; dr++) {
        cells.add((col + dc) + ',' + (row + dr));
      }
    }
  });

  return cells;
}

// ── Panel (GM only) ──────────────────────────────────────────────

function mountPanel() {
  panelEl = document.getElementById('vtt-fog-panel');
  if (!panelEl) {
    panelEl = createPanelElement();
    document.getElementById('vtt-app')?.appendChild(panelEl);
  }

  // Launcher button
  const launcher = document.querySelector('[data-settings-launch="fog"]');
  const syncLauncherActive = (open) => {
    if (!launcher) return;
    launcher.classList.toggle('is-active', open);
    launcher.setAttribute('aria-pressed', String(open));
  };
  if (launcher) {
    launcher.addEventListener('click', () => {
      const isOpen = !panelEl.hidden;
      panelEl.hidden = isOpen;
      syncLauncherActive(!isOpen);
      if (isOpen) deactivateFogSelect();
    });
  }

  // Close button
  panelEl.querySelector('[data-fog-close]')?.addEventListener('click', () => {
    panelEl.hidden = true;
    syncLauncherActive(false);
    deactivateFogSelect();
  });

  // Toggle switch
  const toggleInput = panelEl.querySelector('[data-fog-toggle]');
  if (toggleInput) {
    toggleInput.addEventListener('change', () => {
      const state = boardApi?.getState?.() ?? {};
      const sceneId = state.boardState?.activeSceneId;
      if (!sceneId) return;
      toggleFogForScene(sceneId, toggleInput.checked, {
        markSceneStateDirty: boardApi._markSceneStateDirty,
      });
      if (typeof boardApi._persistBoardState === 'function') {
        boardApi._persistBoardState();
      }
    });
  }

  // Select button
  panelEl.querySelector('[data-fog-select]')?.addEventListener('click', () => {
    fogSelectActive = !fogSelectActive;
    fogLog('Select Area toggled:', fogSelectActive);
    updateSelectButtonState();
    if (!fogSelectActive) {
      clearFogSelection();
    }
    updateActionButtonStates();
  });

  // Clear Fog button
  panelEl.querySelector('[data-fog-clear]')?.addEventListener('click', () => {
    applyFogChange(false);
  });

  // Add Fog button
  panelEl.querySelector('[data-fog-add]')?.addEventListener('click', () => {
    applyFogChange(true);
  });

  panelEl.hidden = true;
}

function createPanelElement() {
  const div = document.createElement('div');
  div.id = 'vtt-fog-panel';
  div.className = 'vtt-fog-panel';
  div.hidden = true;
  div.innerHTML = `
    <div class="vtt-fog-panel__header">
      <h3 class="vtt-fog-panel__title">Fog of War</h3>
      <button type="button" class="vtt-fog-panel__close" data-fog-close>&times;</button>
    </div>
    <div class="vtt-fog-panel__toggle-row">
      <span class="vtt-fog-panel__toggle-label">Enabled</span>
      <label class="vtt-fog-toggle">
        <input type="checkbox" data-fog-toggle />
        <span class="vtt-fog-toggle__slider"></span>
      </label>
    </div>
    <hr class="vtt-fog-panel__divider" />
    <div class="vtt-fog-panel__actions">
      <button type="button" class="vtt-fog-panel__btn" data-fog-select aria-pressed="false">
        <span class="vtt-fog-panel__btn-icon">&#9634;</span> Select Area
      </button>
      <button type="button" class="vtt-fog-panel__btn" data-fog-clear disabled>
        <span class="vtt-fog-panel__btn-icon">&#9728;</span> Clear Fog
      </button>
      <button type="button" class="vtt-fog-panel__btn" data-fog-add disabled>
        <span class="vtt-fog-panel__btn-icon">&#9724;</span> Add Fog
      </button>
    </div>
    <div class="vtt-fog-panel__status" data-fog-status></div>
  `;
  return div;
}

function syncPanelToggle(enabled) {
  if (!panelEl) return;
  const toggle = panelEl.querySelector('[data-fog-toggle]');
  if (toggle && toggle.checked !== enabled) {
    toggle.checked = enabled;
  }
}

function deactivateFogSelect() {
  if (fogSelectActive) {
    fogSelectActive = false;
    updateSelectButtonState();
    clearFogSelection();
  }
}

function updateSelectButtonState() {
  if (!panelEl) return;
  const btn = panelEl.querySelector('[data-fog-select]');
  if (btn) {
    btn.setAttribute('aria-pressed', fogSelectActive ? 'true' : 'false');
    btn.classList.toggle('is-active', fogSelectActive);
  }
}

function updateActionButtonStates() {
  if (!panelEl) return;
  const hasSel = selectedCells.size > 0;
  const clearBtn = panelEl.querySelector('[data-fog-clear]');
  const addBtn = panelEl.querySelector('[data-fog-add]');
  if (clearBtn) clearBtn.disabled = !hasSel;
  if (addBtn) addBtn.disabled = !hasSel;

  const statusEl = panelEl.querySelector('[data-fog-status]');
  if (statusEl) {
    statusEl.textContent = hasSel
      ? selectedCells.size + ' square' + (selectedCells.size === 1 ? '' : 's') + ' selected'
      : fogSelectActive ? 'Click and drag to select' : '';
  }
}

function clearFogSelection() {
  selectedCells.clear();
  selectionStart = null;
  selectionEnd = null;
  renderFogSelection();
  updateActionButtonStates();
}

/**
 * Apply fog change (reveal or cover) to all selected cells.
 */
function applyFogChange(addFog) {
  fogLog('applyFogChange called — addFog:', addFog, 'selectedCells:', selectedCells.size);
  if (selectedCells.size === 0) {
    fogWarn('applyFogChange: no cells selected — aborting');
    return;
  }

  const state = boardApi?.getState?.() ?? {};
  const sceneId = state.boardState?.activeSceneId;
  if (!sceneId) {
    fogWarn('applyFogChange: no activeSceneId — aborting');
    return;
  }

  fogLog('applyFogChange: scene:', sceneId, 'cells:', Array.from(selectedCells).slice(0, 10).join('; '),
    selectedCells.size > 10 ? `... (${selectedCells.size} total)` : '');

  const cellKeys = Array.from(selectedCells);

  boardApi.updateState((draft) => {
    if (!draft.boardState.sceneState) draft.boardState.sceneState = {};
    if (!draft.boardState.sceneState[sceneId]) {
      draft.boardState.sceneState[sceneId] = { grid: { size: 64, locked: false, visible: true } };
    }
    if (!draft.boardState.sceneState[sceneId].fogOfWar) {
      draft.boardState.sceneState[sceneId].fogOfWar = { enabled: true, revealedCells: {} };
    }

    const fog = draft.boardState.sceneState[sceneId].fogOfWar;
    if (!fog.revealedCells || typeof fog.revealedCells !== 'object' || Array.isArray(fog.revealedCells)) {
      fog.revealedCells = {};
    }

    cellKeys.forEach((key) => {
      if (addFog) {
        delete fog.revealedCells[key];
      } else {
        fog.revealedCells[key] = true;
      }
    });

    fogLog('applyFogChange: after update — fog.enabled:', fog.enabled,
      'revealedCells count:', Object.keys(fog.revealedCells).length);
  });

  // Verify the state was actually updated
  const afterState = boardApi?.getState?.() ?? {};
  const afterFog = afterState.boardState?.sceneState?.[sceneId]?.fogOfWar;
  fogLog('applyFogChange: post-update verification — fogState:', afterFog ? {
    enabled: afterFog.enabled,
    revealedCount: afterFog.revealedCells ? Object.keys(afterFog.revealedCells).length : 0,
  } : null);

  if (typeof boardApi._markSceneStateDirty === 'function') {
    boardApi._markSceneStateDirty(sceneId);
  }
  if (typeof boardApi._persistBoardState === 'function') {
    boardApi._persistBoardState();
  }

  clearFogSelection();
}

// ── Fog selection interaction (GM only) ──────────────────────────

function mountFogSelectInteraction() {
  const mapSurface = document.getElementById('vtt-map-surface');
  if (!mapSurface) {
    fogWarn('mountFogSelectInteraction: vtt-map-surface not found — fog selection will not work');
    return;
  }

  fogLog('mountFogSelectInteraction: attaching pointerdown/move/up/cancel on', mapSurface.id);
  mapSurface.addEventListener('pointerdown', handleFogPointerDown, false);
  mapSurface.addEventListener('pointermove', handleFogPointerMove, false);
  mapSurface.addEventListener('pointerup', handleFogPointerUp, false);
  mapSurface.addEventListener('pointercancel', handleFogPointerCancel, false);
}

function handleFogPointerDown(event) {
  fogLog('pointerdown on map surface — fogSelectActive:', fogSelectActive, 'button:', event.button);
  if (!fogSelectActive) return;
  // Only handle left-click for fog selection
  if (event.button !== 0) return;

  const gridPos = pointerToGridCell(event);
  fogLog('pointerToGridCell result:', gridPos);
  if (!gridPos) {
    fogWarn('pointerToGridCell returned null — selection aborted. viewState:', JSON.stringify({
      scale: viewStateRef?.scale,
      translation: viewStateRef?.translation,
      gridSize: viewStateRef?.gridSize,
      gridOffsets: viewStateRef?.gridOffsets,
      mapPixelSize: viewStateRef?.mapPixelSize,
    }));
    return;
  }

  // Prevent the default board interactions from also firing
  event.stopPropagation();
  event.preventDefault();

  pointerDownForFog = true;
  selectionStart = gridPos;
  selectionEnd = gridPos;
  updateSelectedCellsFromRect();
  fogLog('selectedCells after pointerdown:', selectedCells.size, 'cells');
  renderFogSelection();
  updateActionButtonStates();
}

function handleFogPointerMove(event) {
  if (!pointerDownForFog || !fogSelectActive) return;

  const gridPos = pointerToGridCell(event);
  if (!gridPos) return;

  selectionEnd = gridPos;
  updateSelectedCellsFromRect();
  renderFogSelection();
  updateActionButtonStates();
}

function handleFogPointerUp(event) {
  if (!pointerDownForFog) return;
  pointerDownForFog = false;

  // Keep selection visible so user can click Clear/Add buttons
  updateActionButtonStates();
}

function handleFogPointerCancel() {
  if (!pointerDownForFog) return;
  pointerDownForFog = false;
  clearFogSelection();
}

/**
 * Convert a pointer event to grid cell {col, row}.
 */
function pointerToGridCell(event) {
  const mapSurface = document.getElementById('vtt-map-surface');
  if (!mapSurface) return null;

  const view = viewStateRef ?? {};
  const scale = Number.isFinite(view.scale) && view.scale !== 0 ? view.scale : 1;
  const translation = view.translation ?? { x: 0, y: 0 };
  const offsetX = Number.isFinite(translation.x) ? translation.x : 0;
  const offsetY = Number.isFinite(translation.y) ? translation.y : 0;

  const rect = mapSurface.getBoundingClientRect();
  const pointerX = event.clientX - rect.left;
  const pointerY = event.clientY - rect.top;

  const localX = (pointerX - offsetX) / scale;
  const localY = (pointerY - offsetY) / scale;

  const gridSize = Math.max(8, Number.isFinite(view.gridSize) ? view.gridSize : 64);
  const offsets = view.gridOffsets ?? {};
  const gOffLeft = Number.isFinite(offsets.left) ? offsets.left : 0;
  const gOffTop = Number.isFinite(offsets.top) ? offsets.top : 0;

  const col = Math.floor((localX - gOffLeft) / gridSize);
  const row = Math.floor((localY - gOffTop) / gridSize);

  if (col < 0 || row < 0) return null;

  return { col, row };
}

/**
 * Fill selectedCells from the rectangle defined by selectionStart → selectionEnd.
 */
function updateSelectedCellsFromRect() {
  selectedCells.clear();
  if (!selectionStart || !selectionEnd) return;

  const minCol = Math.min(selectionStart.col, selectionEnd.col);
  const maxCol = Math.max(selectionStart.col, selectionEnd.col);
  const minRow = Math.min(selectionStart.row, selectionEnd.row);
  const maxRow = Math.max(selectionStart.row, selectionEnd.row);

  for (let c = minCol; c <= maxCol; c++) {
    for (let r = minRow; r <= maxRow; r++) {
      if (c >= 0 && r >= 0) {
        selectedCells.add(c + ',' + r);
      }
    }
  }
}

// ── Normalize fog data (used by store.js) ────────────────────────

export function normalizeFogOfWarState(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const enabled = Boolean(raw.enabled);
  const revealedCells = {};

  if (raw.revealedCells && typeof raw.revealedCells === 'object') {
    Object.keys(raw.revealedCells).forEach((key) => {
      // Validate key format: "col,row" where both are non-negative integers
      const parts = key.split(',');
      if (parts.length === 2) {
        const col = parseInt(parts[0], 10);
        const row = parseInt(parts[1], 10);
        if (Number.isFinite(col) && Number.isFinite(row) && col >= 0 && row >= 0) {
          revealedCells[col + ',' + row] = true;
        }
      }
    });
  }

  return { enabled, revealedCells };
}
