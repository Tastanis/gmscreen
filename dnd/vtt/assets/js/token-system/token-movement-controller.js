import {
  buildSquareMovementShape,
  getGridBoundsFromView,
  measureChebyshevDistance,
  normalizeFootprint,
} from './movement-math.js';
import { createMovementOverlay } from './movement-overlay.js';
import { createMovementState } from './movement-state.js';
import { createTokenSpeedResolver } from './speed-resolver.js';

export function createTokenMovementController({
  mapTransform,
  routes = {},
  getViewState = () => ({}),
  getBoardState = () => ({}),
  getCombatContext = () => ({}),
  getActiveScenePlacements = () => [],
  getPlacementById = () => null,
  isActiveCombatantPlacement = () => false,
  getPlacementTeam = () => 'ally',
  getPlacementLevelId = () => null,
  setRulerSupplement = () => {},
  clearRulerSupplement = () => {},
  restoreMove = () => false,
  cancelActiveDrag = () => {},
  isUndoSuppressed = () => false,
  windowRef = typeof window === 'undefined' ? undefined : window,
  documentRef = typeof document === 'undefined' ? undefined : document,
} = {}) {
  const movementState = createMovementState();
  const overlay = createMovementOverlay({ mapTransform });
  const speedResolver = createTokenSpeedResolver({ routes });
  let dragSession = null;
  let cancelingForTurnChange = false;

  function syncCombatTurn() {
    const previousSession = dragSession;
    const context = getTurnContext();
    movementState.syncTurn(context);
    if (previousSession && !canTrackPlacement(previousSession.tokenId)) {
      hideDragUi();
      if (!cancelingForTurnChange) {
        cancelingForTurnChange = true;
        try {
          cancelActiveDrag();
        } finally {
          cancelingForTurnChange = false;
        }
      }
    }
  }

  function handleDragStart({ primaryToken, originalPositions } = {}) {
    const tokenId = typeof primaryToken?.id === 'string' ? primaryToken.id : '';
    if (!tokenId || !canTrackPlacement(tokenId)) {
      hideDragUi();
      return;
    }

    const placement = getPlacementById(tokenId) ?? primaryToken;
    const original = originalPositions?.get?.(tokenId) ?? primaryToken;
    const context = getTurnContext();
    const spent = movementState.getSpent(tokenId, context);
    const speed = speedResolver.getInitialSpeed(placement);

    dragSession = {
      tokenId,
      placement,
      original: normalizeFootprint(original),
      speed,
      spentBeforeDrag: spent,
      resolveVersion: 0,
    };

    renderDragSession(0);
    const version = ++dragSession.resolveVersion;
    speedResolver.resolveSpeed(placement).then((result) => {
      if (!dragSession || dragSession.tokenId !== tokenId || dragSession.resolveVersion !== version) {
        return;
      }
      if (Number.isFinite(result?.speed)) {
        dragSession.speed = Math.max(0, Math.trunc(result.speed));
        renderDragSession(currentDragCost());
      }
    });
  }

  function handleDragMove({ preview } = {}) {
    if (!dragSession) {
      return;
    }
    renderDragSession(getPreviewCost(preview));
  }

  function handleDragEnd({ commit = false, moved = false } = {}) {
    overlay.hide();
    clearRulerSupplement();
    if (!commit || !moved) {
      dragSession = null;
    }
  }

  function handleDragCommitted({ sceneId, movedIds = [], originalPositions, preview } = {}) {
    if (!dragSession || !movedIds.includes(dragSession.tokenId)) {
      return;
    }
    const tokenId = dragSession.tokenId;
    const from = originalPositions?.get?.(tokenId) ?? dragSession.original;
    const to = preview?.get?.(tokenId);
    const cost = measureChebyshevDistance(from, to);
    if (cost <= 0) {
      return;
    }

    movementState.recordMove(
      {
        tokenId,
        sceneId,
        from: normalizeFootprint(from),
        to: normalizeFootprint(to),
        cost,
      },
      getTurnContext()
    );
    dragSession = null;
  }

  function dispose() {
    overlay.hide();
    clearRulerSupplement();
    documentRef?.removeEventListener?.('keydown', handleKeydown, true);
  }

  function hideDragUi() {
    dragSession = null;
    overlay.hide();
    clearRulerSupplement();
  }

  function renderDragSession(dragCost = 0) {
    if (!dragSession) {
      return;
    }

    const context = getTurnContext();
    const spent = movementState.getSpent(dragSession.tokenId, context);
    dragSession.spentBeforeDrag = spent;

    const remaining = Math.max(0, dragSession.speed - spent);
    const blockers = getOpposingSameLevelBlockers(dragSession.tokenId);
    const gridMetrics = getGridBoundsFromView(getViewState());
    const shape = buildSquareMovementShape({
      origin: dragSession.original,
      remaining,
      blockers,
      bounds: {
        minColumn: 0,
        minRow: 0,
        columns: gridMetrics.columns,
        rows: gridMetrics.rows,
      },
    });

    overlay.render(shape, gridMetrics);
    setRulerSupplement(formatMovementSummary({
      spent,
      dragCost,
      speed: dragSession.speed,
    }));
  }

  function getOpposingSameLevelBlockers(tokenId) {
    const activePlacement = getPlacementById(tokenId);
    const activeLevelId = getPlacementLevelId(activePlacement);
    const activeTeam = getPlacementTeam(tokenId, activePlacement);
    const placements = getActiveScenePlacements(getBoardState()) ?? [];
    const blockers = [];

    placements.forEach((placement) => {
      if (!placement || placement.id === tokenId || placement.hidden || placement.isHidden) {
        return;
      }
      const team = getPlacementTeam(placement.id, placement);
      if (team === activeTeam) {
        return;
      }
      const levelId = getPlacementLevelId(placement);
      if ((levelId || '') !== (activeLevelId || '')) {
        return;
      }
      blockers.push(normalizeFootprint(placement));
    });

    return blockers;
  }

  function getPreviewCost(preview) {
    if (!dragSession) {
      return 0;
    }
    const position = preview?.get?.(dragSession.tokenId);
    if (!position) {
      return 0;
    }
    return measureChebyshevDistance(dragSession.original, position);
  }

  function currentDragCost() {
    const dragState = getViewState()?.dragState;
    return getPreviewCost(dragState?.cursorSquare ?? dragState?.previewPositions ?? null);
  }

  function canTrackPlacement(tokenId) {
    const context = getTurnContext();
    return Boolean(context.active && tokenId && isActiveCombatantPlacement(tokenId));
  }

  function getTurnContext() {
    const combat = getCombatContext() ?? {};
    return {
      active: Boolean(combat.active),
      sceneId: combat.sceneId ?? null,
      round: combat.round ?? 0,
      activeCombatantId: combat.activeCombatantId ?? null,
    };
  }

  async function handleKeydown(event) {
    if (!event || event.defaultPrevented || isUndoSuppressed()) {
      return;
    }
    const key = typeof event.key === 'string' ? event.key.toLowerCase() : '';
    if (key !== 'z' || (!event.ctrlKey && !event.metaKey) || event.shiftKey) {
      return;
    }
    if (isEditableEventTarget(event.target)) {
      return;
    }

    const context = getTurnContext();
    const tokenId = context.activeCombatantId;
    const move = movementState.peekLastMove(tokenId, context);
    if (!move) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const restored = await Promise.resolve(restoreMove(move));
    if (!restored) {
      return;
    }

    movementState.undoLastMove(tokenId, context);
    clearRulerSupplement();
  }

  documentRef?.addEventListener?.('keydown', handleKeydown, true);
  windowRef?.addEventListener?.('beforeunload', dispose, { once: true });

  return {
    syncCombatTurn,
    handleDragStart,
    handleDragMove,
    handleDragEnd,
    handleDragCommitted,
    dispose,
  };
}

export function formatMovementSummary({ spent = 0, dragCost = 0, speed = 0 } = {}) {
  const current = Math.max(0, Math.trunc(spent + dragCost));
  const total = Math.max(0, Math.trunc(speed));
  const left = Math.max(0, total - current);
  const over = Math.max(0, current - total);
  if (over > 0) {
    return `Moved ${current} / ${total} - ${over} over`;
  }
  return `Moved ${current} / ${total} - ${left} left`;
}

function isEditableEventTarget(target) {
  if (!(target instanceof Element)) {
    return false;
  }
  const tagName = target.tagName.toLowerCase();
  return (
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select' ||
    target.isContentEditable
  );
}
