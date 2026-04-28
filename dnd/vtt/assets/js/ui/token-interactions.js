/**
 * Token drag and marquee selection.
 *
 * Extracted from dnd/vtt/assets/js/ui/board-interactions.js as part of the
 * phase 4 refactor. Do not add unrelated code to this file.
 *
 * Owns the token drag lifecycle (prepare, begin, update, end, commit) and the
 * click-drag marquee selection box. Pointer event listeners remain wired up in
 * board-interactions.js and dispatch here via the returned public methods.
 *
 * See docs/vtt-sync-refactor/phase-4-extraction-targets.md target #7 for the
 * design history.
 */

export function createTokenInteractions({
  // DOM references
  mapSurface,
  tokenLayer,
  selectionBox,
  getStatusElement = () => null,
  // Shared state (mutable references)
  viewState,
  selectedTokenIds,
  getRenderedPlacements = () => [],
  boardApi,
  // Tunables / feature flags
  dragActivationDistance = 6,
  isDeltaSavesEnabled = () => false,
  // External functions (closures over board-interactions.js scope)
  getLocalMapPoint,
  getPointerPosition,
  normalizePlacementForRender,
  getActiveScenePlacements,
  clampPlacementToBounds,
  renderTokens,
  notifySelectionChanged,
  isMeasureModeActive,
  beginExternalMeasurement,
  updateExternalMeasurement,
  finalizeExternalMeasurement,
  cancelExternalMeasurement,
  measurementPointFromToken,
  markPlacementDirty,
  ensureScenePlacementDraft,
  toNonNegativeNumber,
  persistBoardStateSnapshot,
  // Levels v2 (§5.6): post-commit fall detection. Optional; when omitted
  // commits run with no fall handling (matches pre-v2 behavior).
  processPlacementFalls = null,
  triggerTokenFallAnimations = null,
  windowRef = typeof window === 'undefined' ? undefined : window,
} = {}) {
  let dragRenderRafId = null;
  let dragElements = null;

  const requestFrame =
    typeof windowRef?.requestAnimationFrame === 'function'
      ? (cb) => windowRef.requestAnimationFrame(cb)
      : (cb) => setTimeout(cb, 16);
  const cancelFrame =
    typeof windowRef?.cancelAnimationFrame === 'function'
      ? (id) => windowRef.cancelAnimationFrame(id)
      : (id) => clearTimeout(id);

  // --- selection box ---

  function startSelectionBox(event) {
    if (!selectionBox || !viewState.mapLoaded) {
      return false;
    }

    const localPoint = getLocalMapPoint(event);
    if (!localPoint) {
      return false;
    }

    viewState.selectionBoxState = {
      pointerId: event.pointerId,
      startLocal: { x: localPoint.x, y: localPoint.y },
      currentLocal: { x: localPoint.x, y: localPoint.y },
      active: false,
    };

    try {
      mapSurface.setPointerCapture(event.pointerId);
    } catch (error) {
      console.warn('[VTT] Unable to set pointer capture for selection box', error);
    }

    return true;
  }

  function updateSelectionBox(event) {
    const state = viewState.selectionBoxState;
    if (!state || !selectionBox) {
      return;
    }

    const localPoint = getLocalMapPoint(event);
    if (!localPoint) {
      return;
    }

    state.currentLocal = { x: localPoint.x, y: localPoint.y };

    const deltaX = Math.abs(state.currentLocal.x - state.startLocal.x);
    const deltaY = Math.abs(state.currentLocal.y - state.startLocal.y);
    const distance = Math.hypot(deltaX, deltaY);

    if (!state.active && distance >= dragActivationDistance) {
      state.active = true;
      selectionBox.hidden = false;
    }

    if (!state.active) {
      return;
    }

    const minX = Math.min(state.startLocal.x, state.currentLocal.x);
    const minY = Math.min(state.startLocal.y, state.currentLocal.y);
    const width = Math.abs(state.currentLocal.x - state.startLocal.x);
    const height = Math.abs(state.currentLocal.y - state.startLocal.y);

    selectionBox.style.left = `${minX}px`;
    selectionBox.style.top = `${minY}px`;
    selectionBox.style.width = `${width}px`;
    selectionBox.style.height = `${height}px`;
  }

  function getTokensInSelectionBox() {
    const state = viewState.selectionBoxState;
    if (!state || !state.active) {
      return [];
    }

    const minX = Math.min(state.startLocal.x, state.currentLocal.x);
    const minY = Math.min(state.startLocal.y, state.currentLocal.y);
    const maxX = Math.max(state.startLocal.x, state.currentLocal.x);
    const maxY = Math.max(state.startLocal.y, state.currentLocal.y);

    const matching = [];
    const gridSize = viewState.gridSize || 64;
    const offsets = viewState.gridOffsets || { top: 0, right: 0, bottom: 0, left: 0 };

    const placements = getRenderedPlacements() ?? [];
    placements.forEach((placement) => {
      if (!placement || !placement.id) {
        return;
      }

      if (Array.isArray(placement.visibleCells) && placement.visibleCells.length > 0) {
        const overlapsVisibleCell = placement.visibleCells.some((cell) => {
          const cellColumn = Number.isFinite(cell?.column) ? cell.column : null;
          const cellRow = Number.isFinite(cell?.row) ? cell.row : null;
          if (cellColumn === null || cellRow === null) {
            return false;
          }

          const cellLeft = cellColumn * gridSize + offsets.left;
          const cellTop = cellRow * gridSize + offsets.top;
          const cellRight = cellLeft + gridSize;
          const cellBottom = cellTop + gridSize;
          return cellRight > minX && cellLeft < maxX && cellBottom > minY && cellTop < maxY;
        });

        if (overlapsVisibleCell) {
          matching.push(placement);
        }
        return;
      }

      // Levels v2 §5.5.5: marquee hit box scales around the cell center to
      // match the rendered token's footprint, so a shrunk below-level token
      // can only be lassoed when the box overlaps its visible area.
      const cellWidth = (placement.width ?? 1) * gridSize;
      const cellHeight = (placement.height ?? 1) * gridSize;
      const cellLeft = (placement.column ?? 0) * gridSize + offsets.left;
      const cellTop = (placement.row ?? 0) * gridSize + offsets.top;
      const scale = Number.isFinite(placement.scale) && placement.scale > 0 ? placement.scale : 1;
      const halfW = (cellWidth / 2) * scale;
      const halfH = (cellHeight / 2) * scale;
      const centerX = cellLeft + cellWidth / 2;
      const centerY = cellTop + cellHeight / 2;
      const tokenLeft = centerX - halfW;
      const tokenTop = centerY - halfH;
      const tokenRight = centerX + halfW;
      const tokenBottom = centerY + halfH;

      const overlapsX = tokenRight > minX && tokenLeft < maxX;
      const overlapsY = tokenBottom > minY && tokenTop < maxY;

      if (overlapsX && overlapsY) {
        matching.push(placement);
      }
    });

    return matching;
  }

  function finishSelectionBox(event, { additive = false } = {}) {
    const state = viewState.selectionBoxState;
    if (!state) {
      return;
    }

    const wasActive = state.active;
    const tokensInBox = wasActive ? getTokensInSelectionBox() : [];

    try {
      mapSurface.releasePointerCapture?.(state.pointerId);
    } catch (error) {
      // Ignore release errors
    }

    if (selectionBox) {
      selectionBox.hidden = true;
    }
    viewState.selectionBoxState = null;

    if (!wasActive || !tokensInBox.length) {
      return;
    }

    if (!additive) {
      selectedTokenIds.clear();
    }

    tokensInBox.forEach((placement) => {
      selectedTokenIds.add(placement.id);
    });

    notifySelectionChanged();
    renderTokens(boardApi.getState?.() ?? {}, tokenLayer, viewState);
  }

  function cancelSelectionBox() {
    const state = viewState.selectionBoxState;
    if (!state) {
      return;
    }

    try {
      mapSurface.releasePointerCapture?.(state.pointerId);
    } catch (error) {
      // Ignore release errors
    }

    if (selectionBox) {
      selectionBox.hidden = true;
    }
    viewState.selectionBoxState = null;
  }

  // --- drag lifecycle ---

  function prepareTokenDrag(event, placement) {
    if (!viewState.mapLoaded) {
      return;
    }
    if (!placement || typeof placement !== 'object' || !placement.id) {
      return;
    }

    const pointer = getLocalMapPoint(event);
    if (!pointer) {
      return;
    }

    const state = boardApi.getState?.() ?? {};
    const placements = getActiveScenePlacements(state);
    if (!Array.isArray(placements) || !placements.length) {
      return;
    }

    const candidateIds =
      selectedTokenIds.size && selectedTokenIds.has(placement.id)
        ? Array.from(selectedTokenIds)
        : [placement.id];
    if (!candidateIds.length) {
      return;
    }

    const placementMap = new Map();
    placements.forEach((entry) => {
      const normalized = normalizePlacementForRender(entry);
      if (normalized) {
        placementMap.set(normalized.id, normalized);
      }
    });

    const tokens = [];
    const originals = new Map();
    candidateIds.forEach((id) => {
      const info = placementMap.get(id);
      if (!info) {
        return;
      }
      tokens.push({ ...info });
      originals.set(id, {
        column: info.column,
        row: info.row,
        width: info.width,
        height: info.height,
      });
    });

    if (!tokens.length) {
      return;
    }

    viewState.dragCandidate = {
      pointerId: event.pointerId,
      startClient: { x: event.clientX, y: event.clientY },
      startPointer: pointer,
      tokens,
      originalPositions: originals,
    };
  }

  function beginTokenDrag(event) {
    const candidate = viewState.dragCandidate;
    if (!candidate || candidate.pointerId !== event.pointerId) {
      return false;
    }
    if (!candidate.tokens || !candidate.tokens.length) {
      viewState.dragCandidate = null;
      return false;
    }

    viewState.dragCandidate = null;

    const preview = new Map();
    candidate.tokens.forEach((token) => {
      if (!token || !token.id) {
        return;
      }
      preview.set(token.id, {
        column: token.column ?? 0,
        row: token.row ?? 0,
        width: token.width ?? 1,
        height: token.height ?? 1,
      });
    });

    // The ghost should spawn under the cursor, not at the original square.
    // On a fast drag the activation event is already a couple of squares
    // away from `startPointer`; using the original-square transform here
    // would render the ghost there for a frame before updateTokenDrag —
    // called in the same task — translates it to the cursor.
    const initialCursorPreview =
      computePreviewFromEvent(event, candidate) ?? clonePreviewMap(preview);

    viewState.dragState = {
      pointerId: candidate.pointerId,
      startPointer: candidate.startPointer,
      tokens: candidate.tokens.map((token) => ({ ...token })),
      originalPositions: candidate.originalPositions,
      // previewPositions stays at the original positions for the duration of
      // the drag so renderTokens (which reads it) keeps drawing the real
      // token at its starting square. cursorSquare tracks the live cursor
      // square and is copied into previewPositions in endTokenDrag right
      // before commitDragPreview runs.
      previewPositions: preview,
      cursorSquare: initialCursorPreview,
      hasMoved: false,
      measurement: null,
      startTime: Date.now(),
      deferredUpdates: new Map(),
    };

    const primaryToken = candidate.tokens.find((token) => token && token.id) ?? null;
    if (primaryToken) {
      const original = candidate.originalPositions.get(primaryToken.id) ?? {
        column: primaryToken.column ?? 0,
        row: primaryToken.row ?? 0,
        width: primaryToken.width ?? 1,
        height: primaryToken.height ?? 1,
      };
      const startPoint = measurementPointFromToken(original);
      const measureModeActiveAtStart = isMeasureModeActive();
      if (startPoint && beginExternalMeasurement(startPoint, { allowInactive: true })) {
        viewState.dragState.measurement = {
          tokenId: primaryToken.id,
          temporary: !measureModeActiveAtStart,
        };
      }
    }

    try {
      mapSurface.setPointerCapture?.(candidate.pointerId);
    } catch (error) {
      // Ignore capture issues for unsupported browsers
    }

    // No initial applyDragPreview/renderTokens call: previewPositions matches
    // the rendered positions already, and the ghost is positioned directly
    // below. Skipping the rAF render here is what keeps the just-appended
    // ghost from being wiped by the renderTokens cleanup pass.

    const gridSize = Math.max(8, Number.isFinite(viewState.gridSize) ? viewState.gridSize : 64);
    const offsets = viewState.gridOffsets ?? {};
    const leftOffset = Number.isFinite(offsets.left) ? offsets.left : 0;
    const topOffset = Number.isFinite(offsets.top) ? offsets.top : 0;
    dragElements = new Map();
    if (tokenLayer) {
      const renderedById = new Map();
      const renderedList = getRenderedPlacements?.() ?? [];
      renderedList.forEach((entry) => {
        if (entry && typeof entry === 'object' && entry.id) {
          renderedById.set(entry.id, entry);
        }
      });
      preview.forEach((pos, id) => {
        const el = tokenLayer.querySelector(`[data-placement-id="${id}"]`);
        if (el instanceof HTMLElement) {
          const baseLeft = leftOffset + (pos.column ?? 0) * gridSize;
          const baseTop = topOffset + (pos.row ?? 0) * gridSize;
          // Levels v2: preserve the per-level scale on the dragged element
          // so a below-level token stays shrunk while it follows the
          // pointer. updateTokenDrag re-applies this with translate3d.
          const rendered = renderedById.get(id);
          const scale = Number.isFinite(rendered?.scale) && rendered.scale > 0 ? rendered.scale : 1;

          // Spawn the ghost at the cursor-aligned position so a fast drag
          // doesn't show a brief flash at the original square.
          const cursorPos = initialCursorPreview.get(id) ?? pos;
          const ghostLeft = leftOffset + (cursorPos.column ?? 0) * gridSize;
          const ghostTop = topOffset + (cursorPos.row ?? 0) * gridSize;

          // Ghost-drag UX: the original token stays pinned at its starting
          // square (so the measurement arrow's tail anchors there), and a
          // translucent clone follows the cursor as the drag preview. On
          // drop, the ghost is removed and the real token teleports to the
          // committed position via the existing renderTokens() pass.
          let ghost = null;
          const cloned = el.cloneNode(true);
          if (cloned instanceof HTMLElement) {
            // Strip identity attributes so DOM queries (`[data-placement-id]`,
            // ID selectors, etc.) don't accidentally match the ghost. The
            // sentinel `data-vtt-drag-ghost` lets renderTokens detect and
            // skip the ghost during its child-cleanup passes — without it,
            // a single renderTokens call (e.g. from a 409 conflict snapshot)
            // would silently delete the ghost and the original token would
            // start sliding under the cursor instead.
            cloned.removeAttribute('data-placement-id');
            cloned.removeAttribute('id');
            cloned.dataset.vttDragGhost = '1';
            cloned.classList.add('vtt-token--drag-ghost');
            cloned.classList.add('is-dragging');
            cloned.style.zIndex = '100000';
            cloned.style.pointerEvents = 'none';
            cloned.style.transform = scale === 1
              ? `translate3d(${ghostLeft}px, ${ghostTop}px, 0)`
              : `translate3d(${ghostLeft}px, ${ghostTop}px, 0) scale(${scale})`;
            tokenLayer.appendChild(cloned);
            ghost = cloned;
          }

          dragElements.set(id, { element: el, ghost, baseLeft, baseTop, scale });
        }
      });
    }

    return true;
  }

  // Translate a pointer event into a cursor-aligned preview map keyed by
  // token id. Pulls token + original-position data from a candidate or
  // dragState (both expose the same shape: tokens[], originalPositions,
  // startPointer). Returns null if the pointer can't be mapped or grid
  // metrics are bogus — the caller should fall back to original positions.
  function computePreviewFromEvent(event, source) {
    if (!event || !source || !source.startPointer || !Array.isArray(source.tokens)) {
      return null;
    }
    const pointer = getLocalMapPoint(event);
    if (!pointer) {
      return null;
    }
    const gridSize = Math.max(8, Number.isFinite(viewState.gridSize) ? viewState.gridSize : 64);
    if (!Number.isFinite(gridSize) || gridSize <= 0) {
      return null;
    }
    const deltaX = (pointer.x - source.startPointer.x) / gridSize;
    const deltaY = (pointer.y - source.startPointer.y) / gridSize;
    if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) {
      return null;
    }

    const next = new Map();
    source.tokens.forEach((token) => {
      if (!token || !token.id) {
        return;
      }
      const origin = source.originalPositions?.get(token.id);
      if (!origin) {
        return;
      }
      const width = Math.max(1, toNonNegativeNumber(origin.width ?? token.width ?? 1, 1));
      const height = Math.max(1, toNonNegativeNumber(origin.height ?? token.height ?? 1, 1));
      const baseColumn = toNonNegativeNumber(origin.column ?? token.column ?? 0, 0);
      const baseRow = toNonNegativeNumber(origin.row ?? token.row ?? 0, 0);
      const clamped = clampPlacementToBounds(baseColumn + deltaX, baseRow + deltaY, width, height);
      next.set(token.id, {
        column: clamped.column,
        row: clamped.row,
        width,
        height,
      });
    });
    return next;
  }

  function clonePreviewMap(source) {
    const cloned = new Map();
    if (source instanceof Map) {
      source.forEach((value, key) => {
        cloned.set(key, { ...value });
      });
    }
    return cloned;
  }

  function updateTokenDrag(event) {
    const dragState = viewState.dragState;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    if ((event.buttons & 1) === 0) {
      endTokenDrag({ commit: false, pointerId: event.pointerId });
      return;
    }

    const nextPreview = computePreviewFromEvent(event, dragState);
    if (!nextPreview || !nextPreview.size) {
      return;
    }

    // `changed` tracks whether the cursor square moved since the last
    // pointermove — used both to flip hasMoved and to gate the fallback
    // render path.
    let changed = false;
    nextPreview.forEach((next, id) => {
      const previous = dragState.cursorSquare?.get(id);
      if (!previous || previous.column !== next.column || previous.row !== next.row) {
        changed = true;
      }
    });

    // Track cursor coords on a separate field; previewPositions stays
    // pointing at the original positions until endTokenDrag promotes
    // cursorSquare into it. This keeps any renderTokens call mid-drag
    // (e.g. from a 409 conflict snapshot recovery) from re-rendering
    // the original token at the cursor.
    if (viewState.dragState) {
      viewState.dragState.cursorSquare = nextPreview;
      if (changed) {
        viewState.dragState.hasMoved = true;
      }
      if (viewState.dragState.measurement) {
        syncTokenMeasurement(nextPreview);
      }
    }

    // Apply CSS transform directly on dragged elements (GPU-composited, no
    // layout). When dragElements is empty (e.g. test harness with no real
    // tokenLayer, or a token whose DOM element vanished mid-drag), skip the
    // visual transform — the state still flows through cursorSquare and
    // gets committed at endTokenDrag.
    if (dragElements && dragElements.size) {
      const gridSize = Math.max(8, Number.isFinite(viewState.gridSize) ? viewState.gridSize : 64);
      const offsets = viewState.gridOffsets ?? {};
      const lo = Number.isFinite(offsets.left) ? offsets.left : 0;
      const to = Number.isFinite(offsets.top) ? offsets.top : 0;
      nextPreview.forEach((pos, id) => {
        const cached = dragElements.get(id);
        if (!cached) {
          return;
        }
        const left = lo + (pos.column ?? 0) * gridSize;
        const top = to + (pos.row ?? 0) * gridSize;
        const scale = Number.isFinite(cached.scale) && cached.scale > 0 ? cached.scale : 1;
        // Move the ghost clone to follow the pointer; the original element
        // stays anchored at its starting square. If the ghost couldn't be
        // created for some reason, fall back to moving the original so
        // the drag still functions.
        const target = cached.ghost ?? cached.element;
        target.style.transform = scale === 1
          ? `translate3d(${left}px, ${top}px, 0)`
          : `translate3d(${left}px, ${top}px, 0) scale(${scale})`;
      });
    }
  }

  function endTokenDrag({ commit = false, pointerId = null } = {}) {
    // Cancel any pending drag render so the final render below is immediate
    if (dragRenderRafId != null) {
      cancelFrame(dragRenderRafId);
      dragRenderRafId = null;
    }

    const dragState = viewState.dragState;
    if (!dragState) {
      clearDragCandidate(pointerId);
      return;
    }

    if (pointerId !== null && dragState.pointerId !== pointerId) {
      return;
    }

    try {
      mapSurface.releasePointerCapture?.(dragState.pointerId);
    } catch (error) {
      // Ignore release errors
    }

    // Promote the live cursor square into previewPositions so the existing
    // commit path (which reads previewPositions) sees the user's final
    // position. During the drag we deliberately keep previewPositions
    // pointing at the original positions to avoid mid-drag renderTokens
    // calls dragging the real token under the cursor.
    if (dragState.cursorSquare instanceof Map && dragState.cursorSquare.size) {
      dragState.previewPositions = dragState.cursorSquare;
    }

    const preview = dragState.previewPositions;
    const moved = dragState.hasMoved;
    const measurement = dragState.measurement ?? null;
    const startTime = dragState.startTime ?? 0;
    const deferredUpdates = dragState.deferredUpdates ?? null;

    if (measurement) {
      if (measurement.temporary || !isMeasureModeActive()) {
        cancelExternalMeasurement();
      } else if (commit && moved && preview && preview.size && measurement.tokenId) {
        const finalPosition = preview instanceof Map ? preview.get(measurement.tokenId) : null;
        const finalPoint = finalPosition ? measurementPointFromToken(finalPosition) : null;
        if (finalPoint) {
          finalizeExternalMeasurement(finalPoint);
        } else {
          cancelExternalMeasurement();
        }
      } else {
        cancelExternalMeasurement();
      }
    }

    viewState.dragState = null;
    clearDragCandidate(pointerId);

    // Clear CSS-transform drag elements before final render so renderTokens
    // applies authoritative positions from state without leftover transforms.
    // In ghost-drag mode the original was never modified, but we still defensively
    // strip is-dragging in case a fallback path applied it.
    if (dragElements) {
      dragElements.forEach(({ element, ghost }) => {
        if (ghost && ghost.parentNode) {
          ghost.parentNode.removeChild(ghost);
        }
        element.classList.remove('is-dragging');
        element.style.zIndex = '';
      });
      dragElements = null;
    }

    if (commit && moved && preview && preview.size) {
      commitDragPreview(preview, { startTime, deferredUpdates });
    } else {
      renderTokens(boardApi.getState?.() ?? {}, tokenLayer, viewState);
    }
  }

  function applyDragPreview(preview, changed) {
    if (!viewState.dragState) {
      return;
    }
    viewState.dragState.previewPositions = preview;
    if (changed) {
      viewState.dragState.hasMoved = true;
    }
    if (viewState.dragState.measurement) {
      syncTokenMeasurement(preview);
    }
    if (dragRenderRafId == null) {
      dragRenderRafId = requestFrame(() => {
        dragRenderRafId = null;
        renderTokens(boardApi.getState?.() ?? {}, tokenLayer, viewState);
      });
    }
  }

  function syncTokenMeasurement(preview) {
    const dragState = viewState.dragState;
    if (!dragState || !dragState.measurement) {
      return;
    }

    if (!isMeasureModeActive() && !dragState.measurement.temporary) {
      cancelExternalMeasurement();
      dragState.measurement = null;
      return;
    }

    const tokenId = dragState.measurement.tokenId;
    if (!tokenId) {
      cancelExternalMeasurement();
      dragState.measurement = null;
      return;
    }

    const previewMap = preview instanceof Map ? preview : null;
    const position = previewMap?.get(tokenId) ?? dragState.originalPositions?.get(tokenId) ?? null;
    const nextPoint = position ? measurementPointFromToken(position) : null;
    if (!nextPoint) {
      cancelExternalMeasurement();
      dragState.measurement = null;
      return;
    }

    updateExternalMeasurement(nextPoint);
  }

  function commitDragPreview(preview, { startTime = 0, deferredUpdates = null } = {}) {
    if (typeof boardApi.updateState !== 'function') {
      renderTokens(boardApi.getState?.() ?? {}, tokenLayer, viewState);
      return;
    }

    const state = boardApi.getState?.() ?? {};
    const activeSceneId = state.boardState?.activeSceneId ?? null;
    if (!activeSceneId) {
      renderTokens(state, tokenLayer, viewState);
      return;
    }

    // Check which tokens have deferred updates that should take precedence
    // If another user moved a token AFTER we started dragging, their move wins
    const tokensWithNewerRemoteUpdate = new Set();
    if (deferredUpdates instanceof Map && startTime > 0) {
      deferredUpdates.forEach((deferredPlacement, tokenId) => {
        const deferredTime = deferredPlacement._lastModified || 0;
        if (deferredTime > startTime) {
          // This token was moved by someone else after we started dragging
          tokensWithNewerRemoteUpdate.add(tokenId);
          console.log('[VTT Drag] Token moved by another user during drag, deferring to their position:', tokenId);
        }
      });
    }

    const updates = new Map();
    preview.forEach((position, id) => {
      if (!id) {
        return;
      }
      // Skip tokens that have a newer remote update - their position takes precedence
      if (tokensWithNewerRemoteUpdate.has(id)) {
        return;
      }
      const column = toNonNegativeNumber(position.column ?? position.col ?? 0);
      const row = toNonNegativeNumber(position.row ?? position.y ?? 0);
      const width = Math.max(1, toNonNegativeNumber(position.width ?? position.columns ?? 1));
      const height = Math.max(1, toNonNegativeNumber(position.height ?? position.rows ?? 1));
      updates.set(id, { column, row, width, height });
    });

    // Apply deferred remote updates for tokens that were moved by other users
    const deferredToApply = [];
    if (tokensWithNewerRemoteUpdate.size > 0 && deferredUpdates instanceof Map) {
      tokensWithNewerRemoteUpdate.forEach((tokenId) => {
        const deferred = deferredUpdates.get(tokenId);
        if (deferred) {
          deferredToApply.push(deferred);
        }
      });
    }

    if (!updates.size && !deferredToApply.length) {
      renderTokens(state, tokenLayer, viewState);
      return;
    }

    let movedCount = 0;
    const movedIds = [];
    const moveTimestamp = Date.now();
    boardApi.updateState?.((draft) => {
      const scenePlacements = ensureScenePlacementDraft(draft, activeSceneId);
      if (!Array.isArray(scenePlacements) || !scenePlacements.length) {
        return;
      }

      // Apply our drag updates for tokens without newer remote updates
      scenePlacements.forEach((placement) => {
        if (!placement || typeof placement !== 'object') {
          return;
        }
        const next = updates.get(placement.id);
        if (!next) {
          return;
        }
        const clamped = clampPlacementToBounds(next.column, next.row, next.width, next.height);
        if (placement.column !== clamped.column || placement.row !== clamped.row) {
          placement.column = clamped.column;
          placement.row = clamped.row;
          // Add timestamp for conflict resolution
          placement._lastModified = moveTimestamp;
          movedCount += 1;
          movedIds.push(placement.id);
        }
      });

      // Apply deferred remote updates (these don't count as "moved by us")
      deferredToApply.forEach((deferred) => {
        const idx = scenePlacements.findIndex((p) => p?.id === deferred.id);
        if (idx >= 0) {
          scenePlacements[idx] = deferred;
        }
      });
    });

    if (movedCount) {
      // Mark only the moved placements as dirty
      movedIds.forEach((id) => markPlacementDirty(activeSceneId, id));

      // Phase 3-B (commit 2): this is the one and only save path that
      // currently goes out as delta ops. Every other write path in
      // this file still calls `persistBoardStateSnapshot()` with no
      // override, which preserves the legacy full-snapshot behavior.
      // Build one `placement.move` op per moved id using the freshly
      // committed column/row we just wrote into the store, then let
      // `persistBoardStateSnapshot` route it through the ops path.
      // The ops helper will fall back to a full snapshot on its own
      // if the op list is too large or spans too many scenes.
      let placementMoveOps = null;
      if (isDeltaSavesEnabled()) {
        const latestPlacements =
          boardApi.getState?.()?.boardState?.placements?.[activeSceneId] ?? [];
        const ops = [];
        movedIds.forEach((id) => {
          const placement = latestPlacements.find((entry) => entry?.id === id);
          if (!placement) {
            return;
          }
          ops.push({
            type: 'placement.move',
            sceneId: activeSceneId,
            placementId: id,
            x: placement.column,
            y: placement.row,
          });
        });
        if (ops.length > 0) {
          placementMoveOps = ops;
        }
      }

      persistBoardStateSnapshot({}, placementMoveOps);
    }

    // Levels v2 (§5.6): drag commit triggers raw-cutout fall detection
    // for the just-moved tokens. processPlacementFalls handles chained
    // falls, persists the level change as a `placement.update` op, and
    // mirrors the claimant's userLevelState. The animation is fired on
    // the post-render token DOM via triggerTokenFallAnimations after the
    // renderTokens call below paints the new size/indicator.
    let fallenIds = [];
    if (movedCount && typeof processPlacementFalls === 'function') {
      const result = processPlacementFalls(activeSceneId, movedIds);
      if (Array.isArray(result)) {
        fallenIds = result;
      }
    }

    const statusEl = getStatusElement();
    if (movedCount && statusEl) {
      const noun = movedCount === 1 ? 'token' : 'tokens';
      const fellNoun = fallenIds.length === 1 ? 'token' : 'tokens';
      statusEl.textContent = fallenIds.length
        ? `Moved ${movedCount} ${noun}; ${fallenIds.length} ${fellNoun} fell.`
        : `Moved ${movedCount} ${noun}.`;
    }

    renderTokens(boardApi.getState?.() ?? {}, tokenLayer, viewState);

    if (fallenIds.length && typeof triggerTokenFallAnimations === 'function') {
      triggerTokenFallAnimations(fallenIds);
    }
  }

  function clearDragCandidate(pointerId = null) {
    if (!viewState.dragCandidate) {
      return;
    }
    if (pointerId !== null && viewState.dragCandidate.pointerId !== pointerId) {
      return;
    }
    viewState.dragCandidate = null;
  }

  return {
    startSelectionBox,
    updateSelectionBox,
    finishSelectionBox,
    cancelSelectionBox,
    prepareTokenDrag,
    beginTokenDrag,
    updateTokenDrag,
    endTokenDrag,
    clearDragCandidate,
  };
}
