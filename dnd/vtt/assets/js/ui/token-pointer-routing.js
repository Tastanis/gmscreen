/**
 * Small, DOM-independent helpers for token pointer routing.
 *
 * Rendered token hit-testing is intentionally separate from board-state
 * ownership. A rendered hit must be resolved against the active scene before
 * selection, dragging, or settings actions are allowed to continue.
 */

export function resolveCanonicalTokenPointerTarget({
  renderedPlacement = null,
  getCanonicalPlacement = () => null,
  onStaleToken = null,
} = {}) {
  if (!renderedPlacement?.id) {
    return {
      kind: 'empty',
      renderedPlacement: null,
      placement: null,
    };
  }

  const placement = getCanonicalPlacement(renderedPlacement.id);
  if (placement?.id === renderedPlacement.id) {
    return {
      kind: 'canonical',
      renderedPlacement,
      placement,
    };
  }

  if (typeof onStaleToken === 'function') {
    onStaleToken(renderedPlacement.id, renderedPlacement);
  }

  return {
    kind: 'stale',
    renderedPlacement,
    placement: null,
  };
}

/**
 * Apply the selection portion of an ordinary primary token pointerdown.
 *
 * A same-token click is not a selection mutation, but it is still an explicit
 * user request to restore the tray/panel. Refreshing the existing selection
 * dispatch is deliberately separate from renderTokens so this recovery path
 * does not cause an unnecessary full token render.
 */
export function applyCanonicalPrimaryTokenSelection({
  placementId,
  selectedTokenIds,
  shiftKey = false,
  ctrlKey = false,
  metaKey = false,
  updateSelection = () => false,
  refreshSelection = () => {},
} = {}) {
  const hasModifier = Boolean(shiftKey || ctrlKey || metaKey);
  const isSelected = Boolean(placementId && selectedTokenIds?.has?.(placementId));

  if (hasModifier || !isSelected) {
    return {
      selectionChanged: Boolean(
        updateSelection(placementId, {
          additive: Boolean(shiftKey),
          toggle: Boolean(ctrlKey || metaKey),
        })
      ),
      selectionRefreshed: false,
    };
  }

  refreshSelection();
  return {
    selectionChanged: false,
    selectionRefreshed: true,
  };
}

export function isTokenSettingsElementUsable(element, documentRef = null) {
  if (!element || typeof element !== 'object') {
    return false;
  }

  if (typeof element.isConnected === 'boolean') {
    return element.isConnected;
  }

  const root = documentRef?.documentElement;
  return Boolean(root && typeof root.contains === 'function' && root.contains(element));
}

export function ensureTokenSettingsElementConnected(element, documentRef = null) {
  if (isTokenSettingsElementUsable(element, documentRef)) {
    return true;
  }

  const body = documentRef?.body;
  if (!element || !body || typeof body.appendChild !== 'function') {
    return false;
  }
  body.appendChild(element);
  return (
    isTokenSettingsElementUsable(element, documentRef) &&
    (typeof body.contains !== 'function' || body.contains(element))
  );
}

export function reconcileStaleTokenPointerTarget({
  placementId = '',
  selectedTokenIds = null,
  activeSettingsId = null,
  dragState = null,
  closeSettings = () => {},
  cancelActiveDrag = () => {},
  clearDragCandidate = () => {},
  clearHover = () => {},
  refreshSelection = () => {},
  rerender = () => {},
  requestResync = () => {},
} = {}) {
  const staleId = typeof placementId === 'string' ? placementId.trim() : '';
  if (!staleId) {
    return { recovered: false, selectionChanged: false, activeDragCanceled: false };
  }

  const selectionChanged = Boolean(selectedTokenIds?.delete?.(staleId));
  if (activeSettingsId === staleId) {
    closeSettings();
  }

  const activeDragCanceled = Boolean(
    dragState?.tokens?.some?.((token) => token?.id === staleId)
  );
  if (activeDragCanceled) {
    cancelActiveDrag();
  }
  clearDragCandidate();
  clearHover(staleId);
  refreshSelection({ selectionChanged });
  rerender();
  requestResync('stale-rendered-token');

  return { recovered: true, selectionChanged, activeDragCanceled };
}
