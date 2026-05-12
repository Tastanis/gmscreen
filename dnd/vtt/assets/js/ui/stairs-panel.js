/**
 * Stairs side panel — compact GM-only floating panel that owns:
 *   - placement buttons (↑ / ↓)
 *   - the list of stairs on the GM's current level
 *   - the edit/delete affordances for individual stairs
 *
 * The panel is hidden by default. The launcher button
 * `[data-settings-launch="stairs"]` toggles visibility. While the panel
 * is open, the stairs-renderer is in "edit mode" — that's the only time
 * stair polygons are visible (per the design spec).
 *
 * This module exposes a small public API consumed by stairs-tool.js and
 * stairs-renderer.js (added in later steps). At step-2 the panel is a
 * skeleton: launcher toggle works, mode subscriptions work, and the
 * stair list renders empty.
 */

import { BASE_MAP_LEVEL_ID } from '../state/normalize/map-levels.js';

let mounted = false;
let boardApi = null;
let panelEl = null;
let launcherEl = null;
let getViewerLevelId = () => BASE_MAP_LEVEL_ID;

// Active interaction mode. 'idle' when no tool is selected, 'place-up'
// or 'place-down' while the user is mid-placement. Subscribers (the
// renderer and the placement tool) receive change notifications.
let mode = 'idle';
let selectedStairId = null;
const modeSubscribers = new Set();

const isPanelOpen = () => Boolean(panelEl && !panelEl.hidden);

export function mountStairsPanel(options = {}) {
  if (mounted) return;
  boardApi = options.boardApi ?? null;
  const isGm = Boolean(options.isGm);
  if (!isGm) {
    // Non-GMs never get the panel — the launcher button isn't rendered
    // for them either, so there's nothing to do.
    return;
  }
  if (typeof options.getViewerLevelId === 'function') {
    getViewerLevelId = options.getViewerLevelId;
  }

  panelEl = ensurePanelElement();
  launcherEl = document.querySelector('[data-settings-launch="stairs"]');

  bindLauncher();
  bindPanelControls();

  // Subscribe to board-state changes so the stair list stays in sync
  // when the viewer level or stairs collection changes.
  if (boardApi?.subscribe) {
    boardApi.subscribe(() => {
      if (!isPanelOpen()) return;
      renderStairList();
    });
  }

  mounted = true;
}

export function isStairsEditMode() {
  return isPanelOpen();
}

export function getStairsMode() {
  return mode;
}

export function setStairsMode(next) {
  const normalized = normalizeMode(next);
  if (normalized === mode) return;
  mode = normalized;
  notifyModeSubscribers();
  updatePlaceButtonState();
}

export function subscribeStairsMode(callback) {
  if (typeof callback !== 'function') return () => {};
  modeSubscribers.add(callback);
  return () => modeSubscribers.delete(callback);
}

export function getSelectedStairId() {
  return selectedStairId;
}

export function setSelectedStairId(id) {
  const trimmed = typeof id === 'string' ? id.trim() : '';
  const next = trimmed || null;
  if (next === selectedStairId) return;
  selectedStairId = next;
  if (isPanelOpen()) {
    renderStairList();
  }
  notifyModeSubscribers();
}

// ── Internals ────────────────────────────────────────────────────

function normalizeMode(raw) {
  if (raw === 'place-up' || raw === 'place-down') return raw;
  return 'idle';
}

function notifyModeSubscribers() {
  modeSubscribers.forEach((callback) => {
    try {
      callback({ mode, isPanelOpen: isPanelOpen(), selectedStairId });
    } catch (error) {
      // Subscriber errors must never break the panel itself.
      console.error('[stairs-panel] subscriber error', error);
    }
  });
}

function ensurePanelElement() {
  let el = document.getElementById('vtt-stairs-panel');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'vtt-stairs-panel';
  el.className = 'vtt-stairs-panel';
  el.hidden = true;
  el.innerHTML = `
    <div class="vtt-stairs-panel__header">
      <h3 class="vtt-stairs-panel__title">Stairs</h3>
      <button type="button" class="vtt-stairs-panel__close" data-stairs-close aria-label="Close">&times;</button>
    </div>
    <div class="vtt-stairs-panel__section">
      <p class="vtt-stairs-panel__section-title">Place new</p>
      <div class="vtt-stairs-panel__place-row">
        <button type="button" class="vtt-stairs-panel__btn" data-stairs-place-up aria-pressed="false" title="Stairs going up from this level">&#x2191; Up</button>
        <button type="button" class="vtt-stairs-panel__btn" data-stairs-place-down aria-pressed="false" title="Stairs going down from this level">&#x2193; Down</button>
      </div>
    </div>
    <hr class="vtt-stairs-panel__divider" />
    <div class="vtt-stairs-panel__section">
      <p class="vtt-stairs-panel__section-title">On this level</p>
      <ul class="vtt-stairs-panel__list" data-stairs-list></ul>
    </div>
    <div class="vtt-stairs-panel__status" data-stairs-status></div>
  `;
  document.getElementById('vtt-app')?.appendChild(el);
  return el;
}

function bindLauncher() {
  if (!launcherEl) return;
  launcherEl.addEventListener('click', () => {
    const opening = panelEl.hidden;
    setPanelOpen(opening);
  });
}

function bindPanelControls() {
  panelEl.querySelector('[data-stairs-close]')?.addEventListener('click', () => {
    setPanelOpen(false);
  });

  panelEl.querySelector('[data-stairs-place-up]')?.addEventListener('click', () => {
    setStairsMode(mode === 'place-up' ? 'idle' : 'place-up');
  });
  panelEl.querySelector('[data-stairs-place-down]')?.addEventListener('click', () => {
    setStairsMode(mode === 'place-down' ? 'idle' : 'place-down');
  });
}

function setPanelOpen(open) {
  if (!panelEl) return;
  panelEl.hidden = !open;
  if (launcherEl) {
    launcherEl.classList.toggle('is-active', open);
    launcherEl.setAttribute('aria-pressed', String(open));
  }
  if (!open) {
    // Exiting the panel cancels any in-progress placement and selection.
    setStairsMode('idle');
    setSelectedStairId(null);
  } else {
    renderStairList();
  }
  // Notify renderer / tool: edit-mode visibility flipped.
  notifyModeSubscribers();
}

function updatePlaceButtonState() {
  if (!panelEl) return;
  const upBtn = panelEl.querySelector('[data-stairs-place-up]');
  const downBtn = panelEl.querySelector('[data-stairs-place-down]');
  if (upBtn) {
    const active = mode === 'place-up';
    upBtn.setAttribute('aria-pressed', String(active));
    upBtn.classList.toggle('is-active', active);
  }
  if (downBtn) {
    const active = mode === 'place-down';
    downBtn.setAttribute('aria-pressed', String(active));
    downBtn.classList.toggle('is-active', active);
  }
  // Disable "down" when the viewer is already on the bottom level —
  // there's no level below to mirror to.
  if (downBtn) {
    downBtn.disabled = isBottomLevel();
  }
}

function isBottomLevel() {
  // Level 0 is the base map; placing down-stairs from it has no target.
  // Future levels are stored above it, so we treat BASE_MAP_LEVEL_ID as
  // the floor. Stairs going down from Level 1 → 0 are allowed.
  const levelId = currentViewerLevelId();
  return levelId === BASE_MAP_LEVEL_ID;
}

function currentViewerLevelId() {
  try {
    const state = boardApi?.getState?.() ?? {};
    const sceneId = state?.boardState?.activeSceneId ?? null;
    return getViewerLevelId(state, sceneId) || BASE_MAP_LEVEL_ID;
  } catch (error) {
    return BASE_MAP_LEVEL_ID;
  }
}

function renderStairList() {
  if (!panelEl) return;
  const listEl = panelEl.querySelector('[data-stairs-list]');
  if (!listEl) return;

  const stairs = getStairsOnViewerLevel();
  listEl.innerHTML = '';

  if (stairs.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'vtt-stairs-panel__list-empty';
    empty.textContent = 'No stairs on this level yet.';
    listEl.appendChild(empty);
    updatePlaceButtonState();
    return;
  }

  stairs.forEach((stair, index) => {
    const li = document.createElement('li');
    li.className = 'vtt-stairs-panel__list-item';
    if (stair.id === selectedStairId) li.classList.add('is-selected');
    li.dataset.stairId = stair.id;

    const arrow = stair.direction === 'up' ? '↑' : '↓';
    const label = document.createElement('span');
    label.className = 'vtt-stairs-panel__list-label';
    label.textContent = `Stair ${index + 1}  ${arrow} ${formatLinkedLabel(stair)}`;
    li.appendChild(label);

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'vtt-stairs-panel__icon-btn';
    editBtn.dataset.stairsAction = 'edit';
    editBtn.title = 'Edit (select on board)';
    editBtn.textContent = '✎';
    li.appendChild(editBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'vtt-stairs-panel__icon-btn';
    deleteBtn.dataset.stairsAction = 'delete';
    deleteBtn.title = 'Delete';
    deleteBtn.textContent = '✕';
    li.appendChild(deleteBtn);

    listEl.appendChild(li);
  });

  updatePlaceButtonState();
}

function formatLinkedLabel(stair) {
  const linkedId = typeof stair.linkedLevelId === 'string' ? stair.linkedLevelId : '';
  if (!linkedId) return '';
  if (linkedId === BASE_MAP_LEVEL_ID) return 'to Level 0';
  // Try to look up a friendly name for the linked level.
  const state = boardApi?.getState?.() ?? {};
  const sceneId = state?.boardState?.activeSceneId ?? null;
  const sceneState = sceneId ? state?.boardState?.sceneState?.[sceneId] : null;
  const levels = sceneState?.mapLevels?.levels ?? [];
  const match = levels.find((lvl) => lvl?.id === linkedId);
  if (match?.name) return `to ${match.name}`;
  return 'to other level';
}

function getStairsOnViewerLevel() {
  const state = boardApi?.getState?.() ?? {};
  const sceneId = state?.boardState?.activeSceneId ?? null;
  if (!sceneId) return [];
  const sceneState = state?.boardState?.sceneState?.[sceneId];
  if (!sceneState) return [];
  const viewerLevelId = currentViewerLevelId();
  if (viewerLevelId === BASE_MAP_LEVEL_ID) {
    const base = sceneState?.mapLevels?.baseStairs;
    return Array.isArray(base) ? base : [];
  }
  const levels = sceneState?.mapLevels?.levels ?? [];
  const match = levels.find((lvl) => lvl?.id === viewerLevelId);
  return Array.isArray(match?.stairs) ? match.stairs : [];
}
