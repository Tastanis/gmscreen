/**
 * Manual fog is retired. Saved records and pure legacy helpers remain compatible,
 * but rendering and interaction use automatic height/wall/floor vision only.
 * The existing panel retains the automatic Reset explored areas control.
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
import {normalizeCombatTeam} from '../state/normalize/placements.js';
import {preparePlayerVisibility,confirmPlayerFogPaint} from './player-visibility-ready.js';

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
    deactivateFogSelect();
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
  preparePlayerVisibility(state,{isGm,levelId:activeLevelId});
  syncPanelToggle(false);

  renderFogSurface({ state, canvas: fogCanvas, view: viewStateRef ?? {},
    sceneId: activeSceneId, levelId: activeLevelId, gmViewing: isGm });
  confirmPlayerFogPaint(state,viewStateRef,isGm,activeLevelId);
}

/** Paint a separate fog canvas without mounting handlers or changing GM context. */
export function renderFogSurface({ canvas, view = {} } = {}) {
  const ctx = canvas?.getContext('2d');
  if (!canvas || !ctx) return;
  const width = Math.max(0, Number(view.mapPixelSize?.width) || 0);
  const height = Math.max(0, Number(view.mapPixelSize?.height) || 0);
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  ctx.clearRect(0, 0, width, height);
}

/**
 * Render the selection highlight overlay (separate canvas).
 */
export function renderFogSelection() {
  if (selCanvas && selCtx) clearCanvas(selCtx, selCanvas);
}

/**
 * Legacy manual-fog interaction check. Automatic vision owns visibility now.
 */
export function isPositionFogged() {
  return false;
}

/**
 * Legacy manual-fog batch check, inactive for both board and passive preview.
 */
export function createFogChecker() {
  return null;
}

export function isFogSelectActive() {
  return false;
}

/**
 * Retired manual-fog toggle retained for source compatibility.
 */
export function toggleFogForLevel() {
  // Compatibility entry point: old callers cannot revive retired manual fog.
  return false;
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
    const team=normalizeCombatTeam(placement.combatTeam ?? placement.team ?? placement?.tags?.team ?? placement.faction);
    const isPc = pcTokenIds.has(tokenId) || team === 'ally';
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

  // Remove obsolete controls if an existing panel survives a remount.
  panelEl.querySelectorAll('.vtt-fog-panel__toggle-row, .vtt-fog-panel__divider, .vtt-fog-panel__actions, [data-fog-status]').forEach(node => node.remove());

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
    boardApi._markSceneStateDirty(sceneId, 'fogOfWar');
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
