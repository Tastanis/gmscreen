/**
 * Fog of War module — per-level.
 *
 * Each level in a scene has its own fog layer:
 *
 *   boardState.sceneState[sceneId].fogOfWar = {
 *     byLevel: {
 *       [levelId]: { enabled: boolean, revealedCells: { "col,row": true } }
 *     }
 *   }
 *
 * The viewer sees fog for whichever level they're currently on. The GM panel
 * (Enabled toggle, Select Area, Clear Fog, Add Fog) acts on whichever level
 * the GM is currently viewing.
 *
 * Cutout cascade: when fog is revealed on a square that sits over a cutout,
 * the same square is auto-revealed on the level immediately below — and if
 * that level also has a cutout there, it cascades further down. "Add Fog"
 * does NOT cascade (one-way).
 */

import {
  PLAYER_VISIBLE_TOKEN_FOLDER,
  normalizePlayerTokenFolderName,
} from '../state/store.js';
import {
  BASE_MAP_LEVEL_ID,
  resolvePlacementLevelId,
  buildLevelViewModel,
} from '../state/normalize/map-levels.js';

// ── Constants ────────────────────────────────────────────────────

const GM_FOG_ALPHA = 0.7;
const PLAYER_FOG_ALPHA = 1.0;
const FOG_COLOR = '0,0,0';
const SELECTION_FILL = 'rgba(70,160,255,0.25)';
const SELECTION_STROKE = 'rgba(70,160,255,0.8)';

// ── Debug logging (check F12 console) ────────────────────────────
const FOG_DEBUG = false;
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
let viewStateRef = null;
let isGm = false;

// Resolves the viewer/editor's active level for a given scene. Set at mount.
let getActiveLevelId = () => BASE_MAP_LEVEL_ID;

// Fog-select interaction state
let fogSelectActive = false;
let selectionStart = null;
let selectionEnd = null;
let selectedCells = new Set();
let pointerDownForFog = false;

// ── Public API ───────────────────────────────────────────────────

export function mountFogOfWar(options = {}) {
  boardApi = options.boardApi ?? null;
  viewStateRef = options.viewState ?? null;
  isGm = Boolean(options.isGm);
  if (typeof options.getActiveLevelId === 'function') {
    getActiveLevelId = options.getActiveLevelId;
  }

  fogCanvas = document.getElementById('vtt-fog-layer');
  selCanvas = document.getElementById('vtt-fog-selection-layer');

  if (fogCanvas) fogCtx = fogCanvas.getContext('2d');
  if (selCanvas) selCtx = selCanvas.getContext('2d');

  if (isGm) {
    mountPanel();
    mountFogSelectInteraction();
  }
}

/**
 * Re-render the fog overlay for the viewer's current level.
 */
export function renderFog(state) {
  if (!fogCanvas || !fogCtx) return;

  const activeSceneId = state?.boardState?.activeSceneId ?? null;
  if (!activeSceneId) {
    clearCanvas(fogCtx, fogCanvas);
    syncPanelToggle(false);
    return;
  }

  const activeLevelId = resolveActiveLevelId(state, activeSceneId);
  const levelFog = getLevelFog(state, activeSceneId, activeLevelId);
  const enabled = Boolean(levelFog && levelFog.enabled);

  syncPanelToggle(enabled);

  const view = viewStateRef ?? {};
  const mapW = Number.isFinite(view.mapPixelSize?.width) ? view.mapPixelSize.width : 0;
  const mapH = Number.isFinite(view.mapPixelSize?.height) ? view.mapPixelSize.height : 0;
  if (mapW <= 0 || mapH <= 0) {
    clearCanvas(fogCtx, fogCanvas);
    return;
  }

  // Size the canvas to the map
  if (fogCanvas.width !== mapW || fogCanvas.height !== mapH) {
    fogCanvas.width = mapW;
    fogCanvas.height = mapH;
  }
  fogCanvas.style.width = mapW + 'px';
  fogCanvas.style.height = mapH + 'px';

  if (!enabled) {
    fogCtx.clearRect(0, 0, mapW, mapH);
    return;
  }

  const gridSize = Math.max(8, Number.isFinite(view.gridSize) ? view.gridSize : 64);
  const offsets = view.gridOffsets ?? {};
  const offsetLeft = Number.isFinite(offsets.left) ? offsets.left : 0;
  const offsetTop = Number.isFinite(offsets.top) ? offsets.top : 0;
  const offsetRight = Number.isFinite(offsets.right) ? offsets.right : 0;
  const offsetBottom = Number.isFinite(offsets.bottom) ? offsets.bottom : 0;

  const innerWidth = Math.max(0, mapW - offsetLeft - offsetRight);
  const innerHeight = Math.max(0, mapH - offsetTop - offsetBottom);
  const cols = Math.floor(innerWidth / gridSize);
  const rows = Math.floor(innerHeight / gridSize);

  const gridRight = offsetLeft + cols * gridSize;
  const gridBottom = offsetTop + rows * gridSize;

  const revealed = levelFog.revealedCells ?? {};
  const pcCells = buildPcRevealedCells(state, activeSceneId, activeLevelId);

  const alpha = isGm ? GM_FOG_ALPHA : PLAYER_FOG_ALPHA;

  fogCtx.clearRect(0, 0, mapW, mapH);
  fogCtx.fillStyle = `rgba(${FOG_COLOR},${alpha})`;

  // Border bands — anything outside the gridded area is unreachable, so it
  // always reads as fogged. Painting these covers the previously-visible
  // strips at the top/left/right/bottom of the map when a non-zero grid
  // origin shifts the addressable grid inward.
  if (offsetLeft > 0) {
    fogCtx.fillRect(0, 0, offsetLeft, mapH);
  }
  if (gridRight < mapW) {
    fogCtx.fillRect(gridRight, 0, mapW - gridRight, mapH);
  }
  if (offsetTop > 0) {
    fogCtx.fillRect(offsetLeft, 0, gridRight - offsetLeft, offsetTop);
  }
  if (gridBottom < mapH) {
    fogCtx.fillRect(offsetLeft, gridBottom, gridRight - offsetLeft, mapH - gridBottom);
  }

  // Addressable cells.
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
  if (!selCanvas || !selCtx) return;

  const view = viewStateRef ?? {};
  const mapW = Number.isFinite(view.mapPixelSize?.width) ? view.mapPixelSize.width : 0;
  const mapH = Number.isFinite(view.mapPixelSize?.height) ? view.mapPixelSize.height : 0;
  if (mapW <= 0 || mapH <= 0) {
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
 * Returns true if a placement at the given grid position on the given level
 * is hidden by fog for a non-GM user. Used to block token clicks.
 */
export function isPositionFogged(state, col, row, levelId) {
  if (isGm) return false;

  const activeSceneId = state?.boardState?.activeSceneId ?? null;
  if (!activeSceneId) return false;

  const lvlId = levelId || resolveActiveLevelId(state, activeSceneId);
  const levelFog = getLevelFog(state, activeSceneId, lvlId);
  if (!levelFog || !levelFog.enabled) return false;

  const key = Math.floor(col) + ',' + Math.floor(row);
  if (levelFog.revealedCells && levelFog.revealedCells[key]) return false;

  const pcCells = buildPcRevealedCells(state, activeSceneId, lvlId);
  if (pcCells.has(key)) return false;

  return true;
}

/**
 * Pre-compute a fog checker for a given level for use during batch rendering.
 * Returns null when fog is inactive on that level.
 */
export function createFogChecker(state, levelId) {
  if (isGm) return null;

  const activeSceneId = state?.boardState?.activeSceneId ?? null;
  if (!activeSceneId) return null;

  const lvlId = levelId || resolveActiveLevelId(state, activeSceneId);
  const levelFog = getLevelFog(state, activeSceneId, lvlId);
  if (!levelFog || !levelFog.enabled) return null;

  const revealed = levelFog.revealedCells ?? {};
  const pcCells = buildPcRevealedCells(state, activeSceneId, lvlId);

  return (col, row) => {
    const key = Math.floor(col) + ',' + Math.floor(row);
    return !revealed[key] && !pcCells.has(key);
  };
}

export function isFogSelectActive() {
  return fogSelectActive;
}

/**
 * Toggle fog enabled/disabled for a specific level within a scene.
 */
export function toggleFogForLevel(sceneId, levelId, enabled, options = {}) {
  if (!boardApi || !sceneId || !levelId) return;
  const markDirty = options.markSceneStateDirty;

  boardApi.updateState((draft) => {
    const sceneEntry = ensureSceneEntry(draft, sceneId);
    const levelEntry = ensureLevelFogEntry(sceneEntry, levelId);
    levelEntry.enabled = Boolean(enabled);
  });

  if (typeof markDirty === 'function') markDirty(sceneId);
}

/**
 * Get the fog state for a specific level within a scene.
 */
export function getFogStateForLevel(state, sceneId, levelId) {
  return getLevelFog(state, sceneId, levelId);
}

// Back-compat alias kept for any callers still using the old name.
export function getFogStateForScene(state, sceneId) {
  const lvlId = resolveActiveLevelId(state, sceneId);
  return getLevelFog(state, sceneId, lvlId);
}

// ── Internal helpers ─────────────────────────────────────────────

function resolveActiveLevelId(state, sceneId) {
  try {
    const id = getActiveLevelId(state, sceneId);
    return typeof id === 'string' && id ? id : BASE_MAP_LEVEL_ID;
  } catch (e) {
    return BASE_MAP_LEVEL_ID;
  }
}

function getLevelFog(state, sceneId, levelId) {
  if (!sceneId || !levelId) return null;
  const sceneState = state?.boardState?.sceneState;
  if (!sceneState || typeof sceneState !== 'object') return null;
  const entry = sceneState[sceneId];
  if (!entry || typeof entry !== 'object') return null;
  const fog = entry.fogOfWar;
  if (!fog || typeof fog !== 'object') return null;
  const byLevel = fog.byLevel;
  if (!byLevel || typeof byLevel !== 'object') return null;
  const levelEntry = byLevel[levelId];
  if (!levelEntry || typeof levelEntry !== 'object') return null;
  return levelEntry;
}

function ensureSceneEntry(draft, sceneId) {
  if (!draft.boardState.sceneState) draft.boardState.sceneState = {};
  if (!draft.boardState.sceneState[sceneId] || typeof draft.boardState.sceneState[sceneId] !== 'object') {
    draft.boardState.sceneState[sceneId] = { grid: { size: 64, locked: false, visible: true } };
  }
  const entry = draft.boardState.sceneState[sceneId];
  if (!entry.fogOfWar || typeof entry.fogOfWar !== 'object') {
    entry.fogOfWar = { byLevel: {} };
  }
  if (!entry.fogOfWar.byLevel || typeof entry.fogOfWar.byLevel !== 'object'
      || Array.isArray(entry.fogOfWar.byLevel)) {
    entry.fogOfWar.byLevel = {};
  }
  return entry;
}

function ensureLevelFogEntry(sceneEntry, levelId) {
  const byLevel = sceneEntry.fogOfWar.byLevel;
  if (!byLevel[levelId] || typeof byLevel[levelId] !== 'object') {
    byLevel[levelId] = { enabled: false, revealedCells: {} };
  }
  const levelEntry = byLevel[levelId];
  if (!levelEntry.revealedCells || typeof levelEntry.revealedCells !== 'object'
      || Array.isArray(levelEntry.revealedCells)) {
    levelEntry.revealedCells = {};
  }
  return levelEntry;
}

function clearCanvas(ctx, canvas) {
  if (!ctx || !canvas) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

/**
 * PC tokens auto-reveal the cells they occupy. With per-level fog this only
 * applies to the level the PC is on — a PC on Level 3 does not reveal
 * Level 2's fog beneath them.
 */
function buildPcRevealedCells(state, activeSceneId, levelId) {
  const cells = new Set();
  if (!state || !activeSceneId || !levelId) return cells;

  const placements = state.boardState?.placements?.[activeSceneId];
  if (!Array.isArray(placements)) return cells;

  const tokens = state.tokens ?? { folders: [], items: [] };
  const playerFolderKey = normalizePlayerTokenFolderName(PLAYER_VISIBLE_TOKEN_FOLDER);
  if (!playerFolderKey) return cells;

  const pcFolderIds = new Set();
  (tokens.folders ?? []).forEach((folder) => {
    if (!folder || typeof folder !== 'object') return;
    const nameKey = normalizePlayerTokenFolderName(folder.name);
    if (nameKey === playerFolderKey && folder.id) {
      pcFolderIds.add(folder.id);
    }
  });

  const pcTokenIds = new Set();
  (tokens.items ?? []).forEach((token) => {
    if (!token || typeof token !== 'object') return;
    if (token.folderId && pcFolderIds.has(token.folderId)) {
      pcTokenIds.add(token.id);
    }
    if (token.folder && typeof token.folder.name === 'string') {
      if (normalizePlayerTokenFolderName(token.folder.name) === playerFolderKey) {
        pcTokenIds.add(token.id);
      }
    }
  });

  placements.forEach((placement) => {
    if (!placement || typeof placement !== 'object') return;
    if (resolvePlacementLevelId(placement) !== levelId) return;

    const tokenId = typeof placement.tokenId === 'string' ? placement.tokenId : '';
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

// ── Cutout cascade ───────────────────────────────────────────────

/**
 * Build the per-scene level view model: ordered list of levels (Level 0
 * first, then stored levels by zIndex ascending) including their cutouts.
 */
function getLevelViewModel(state, sceneId) {
  if (!sceneId) return [];
  const sceneEntry = state?.boardState?.sceneState?.[sceneId];
  const sceneList = state?.scenes?.items ?? [];
  const sceneDef = sceneList.find((s) => s && s.id === sceneId) ?? null;
  return buildLevelViewModel({
    baseMapUrl: sceneDef?.mapUrl ?? null,
    mapLevels: sceneEntry?.mapLevels ?? null,
    sceneGrid: sceneEntry?.grid ?? null,
  });
}

export function levelHasCutoutAt(level, col, row) {
  if (!level || !Array.isArray(level.cutouts)) return false;
  return level.cutouts.some((cutout) => {
    if (!cutout || typeof cutout !== 'object') return false;
    const cCol = Math.floor(Number(cutout.column ?? 0));
    const cRow = Math.floor(Number(cutout.row ?? 0));
    const cW = Math.max(1, Math.floor(Number(cutout.width ?? 1)));
    const cH = Math.max(1, Math.floor(Number(cutout.height ?? 1)));
    return col >= cCol && col < cCol + cW && row >= cRow && row < cRow + cH;
  });
}

/**
 * For a given level, return the level immediately below it (highest zIndex
 * less than this level's zIndex). Returns null if there is no level below.
 */
function levelDirectlyBelow(viewModel, levelId) {
  const current = viewModel.find((lvl) => lvl && lvl.id === levelId);
  if (!current) return null;
  const currentZ = Number.isFinite(current.zIndex) ? current.zIndex : 0;
  let best = null;
  let bestZ = -Infinity;
  viewModel.forEach((lvl) => {
    if (!lvl || lvl.id === levelId) return;
    const z = Number.isFinite(lvl.zIndex) ? lvl.zIndex : 0;
    if (z < currentZ && z > bestZ) {
      best = lvl;
      bestZ = z;
    }
  });
  return best;
}

/**
 * For each (col, row) reveal happening on `originLevelId`, walk down through
 * cutouts and write reveals into each lower level whose own column over the
 * cell is gated by a cutout. Mutates `byLevel` in place.
 */
export function cascadeReveals(byLevel, viewModel, originLevelId, cellKeys) {
  if (!Array.isArray(viewModel) || viewModel.length === 0) return;
  if (!cellKeys || cellKeys.length === 0) return;

  cellKeys.forEach((key) => {
    const [cStr, rStr] = key.split(',');
    const col = parseInt(cStr, 10);
    const row = parseInt(rStr, 10);
    if (!Number.isFinite(col) || !Number.isFinite(row)) return;

    let currentLevel = viewModel.find((lvl) => lvl && lvl.id === originLevelId);
    while (currentLevel && levelHasCutoutAt(currentLevel, col, row)) {
      const below = levelDirectlyBelow(viewModel, currentLevel.id);
      if (!below) break;

      if (!byLevel[below.id] || typeof byLevel[below.id] !== 'object') {
        byLevel[below.id] = { enabled: false, revealedCells: {} };
      }
      const target = byLevel[below.id];
      if (!target.revealedCells || typeof target.revealedCells !== 'object'
          || Array.isArray(target.revealedCells)) {
        target.revealedCells = {};
      }
      target.revealedCells[key] = true;

      currentLevel = below;
    }
  });
}

// ── Panel (GM only) ──────────────────────────────────────────────

function mountPanel() {
  panelEl = document.getElementById('vtt-fog-panel');
  if (!panelEl) {
    panelEl = createPanelElement();
    document.getElementById('vtt-app')?.appendChild(panelEl);
  }

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

  panelEl.querySelector('[data-fog-close]')?.addEventListener('click', () => {
    panelEl.hidden = true;
    syncLauncherActive(false);
    deactivateFogSelect();
  });

  const toggleInput = panelEl.querySelector('[data-fog-toggle]');
  if (toggleInput) {
    toggleInput.addEventListener('change', () => {
      const state = boardApi?.getState?.() ?? {};
      const sceneId = state.boardState?.activeSceneId;
      if (!sceneId) return;
      const levelId = resolveActiveLevelId(state, sceneId);
      toggleFogForLevel(sceneId, levelId, toggleInput.checked, {
        markSceneStateDirty: boardApi._markSceneStateDirty,
      });
      if (typeof boardApi._persistBoardState === 'function') {
        boardApi._persistBoardState();
      }
    });
  }

  panelEl.querySelector('[data-fog-select]')?.addEventListener('click', () => {
    fogSelectActive = !fogSelectActive;
    updateSelectButtonState();
    if (!fogSelectActive) {
      clearFogSelection();
    }
    updateActionButtonStates();
  });

  panelEl.querySelector('[data-fog-clear]')?.addEventListener('click', () => {
    applyFogChange(false);
  });

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
      <span class="vtt-fog-panel__toggle-label">Enabled (this level)</span>
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
 * Apply fog change (reveal or cover) to all selected cells on the GM's
 * current level. Revealing cascades through cutouts to lower levels;
 * covering does NOT cascade.
 */
function applyFogChange(addFog) {
  if (selectedCells.size === 0) return;

  const state = boardApi?.getState?.() ?? {};
  const sceneId = state.boardState?.activeSceneId;
  if (!sceneId) return;

  const levelId = resolveActiveLevelId(state, sceneId);
  const cellKeys = Array.from(selectedCells);
  const viewModel = getLevelViewModel(state, sceneId);

  boardApi.updateState((draft) => {
    const sceneEntry = ensureSceneEntry(draft, sceneId);
    const levelEntry = ensureLevelFogEntry(sceneEntry, levelId);

    cellKeys.forEach((key) => {
      if (addFog) {
        delete levelEntry.revealedCells[key];
      } else {
        levelEntry.revealedCells[key] = true;
      }
    });

    if (!addFog) {
      cascadeReveals(sceneEntry.fogOfWar.byLevel, viewModel, levelId, cellKeys);
    }
  });

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
  if (!mapSurface) return;

  mapSurface.addEventListener('pointerdown', handleFogPointerDown, false);
  mapSurface.addEventListener('pointermove', handleFogPointerMove, false);
  mapSurface.addEventListener('pointerup', handleFogPointerUp, false);
  mapSurface.addEventListener('pointercancel', handleFogPointerCancel, false);
}

function handleFogPointerDown(event) {
  if (!fogSelectActive) return;
  if (event.button !== 0) return;

  const gridPos = pointerToGridCell(event);
  if (!gridPos) return;

  event.stopPropagation();
  event.preventDefault();

  pointerDownForFog = true;
  selectionStart = gridPos;
  selectionEnd = gridPos;
  updateSelectedCellsFromRect();
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

function handleFogPointerUp() {
  if (!pointerDownForFog) return;
  pointerDownForFog = false;
  updateActionButtonStates();
}

function handleFogPointerCancel() {
  if (!pointerDownForFog) return;
  pointerDownForFog = false;
  clearFogSelection();
}

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
