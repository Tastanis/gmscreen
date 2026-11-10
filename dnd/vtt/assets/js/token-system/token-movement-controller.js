import {
  buildReachableMovementShape,
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
  getUndoMove = () => null,
  cancelActiveDrag = () => {},
  isUndoSuppressed = () => false,
  // Route cost in squares for a move (terrain height and difficult terrain), or null to use straight-line distance.
  measureRoute = () => null,
  // Per-square height and movement multiplier for the reach outline ({key, at(column,row)}), or null for a plain square.
  getCellInfo = () => null,
  // Optional (column,row) => {x,y} in map pixels, so the outline follows raised ground.
  projectCorner = null,
  // Extra squares of speed a token has right now (a minion while its captain is up). Asked every
  // time, never remembered, so the bonus ends the moment its cause does.
  getSpeedBonus = () => 0,
  // What a condition does to the speed right now (Brandon, November 9, 2026: it changes the ring and the count, never
  // refuses a move): null, or {limit} (Slowed 2, Grabbed and Restrained 0), {halve} (grabbing a creature its size or
  // larger) and {why}, the words shown beside the count. Asked every time, like the bonus.
  getSpeedRule = () => null,
  // The kind of the move being dragged now ('walk', 'shift', 'forced', 'teleport'), when the board knows it.
  getDragMovementKind = () => null,
  windowRef = typeof window === 'undefined' ? undefined : window,
  documentRef = typeof document === 'undefined' ? undefined : document,
} = {}) {
  const movementState = createMovementState();
  const overlay = createMovementOverlay({ mapTransform });
  const speedResolver = createTokenSpeedResolver({ routes });
  let dragSession = null;
  const knownSpeeds = new Map();
  const speedBonus = (tokenId) => {
    let bonus = 0;
    try { bonus = Number(getSpeedBonus(tokenId)); } catch (error) { bonus = 0; }
    return Number.isFinite(bonus) ? Math.trunc(bonus) : 0;
  };
  // A creature's speed this moment: its own, plus any bonus, then what its conditions do to it, with the reason.
  const speedNow = (tokenId, base) => {
    let speed = Math.max(0, Math.trunc(Number(base) || 0) + speedBonus(tokenId)), rule = null;
    try { rule = getSpeedRule(tokenId); } catch (error) { rule = null; }
    if (rule && Number.isFinite(rule.limit)) speed = Math.min(speed, Math.max(0, Math.trunc(rule.limit)));
    if (rule?.halve) speed = Math.floor(speed / 2);
    return { speed, why: typeof rule?.why === 'string' ? rule.why : '' };
  };
  // A flier's height on its own turn (Brandon, November 9, 2026): movement is counted once, the larger of the squares
  // moved across and the squares moved up or down. Height counts only on a finished move (the token let go), and a
  // stretch between sideways moves counts the furthest it went from where the stretch began, not every up and down:
  // up 3 then straight back down is 3; up 3, over, down 3 is 6. Kept for the running turn only.
  const flightTurns = new Map();
  const flightKey = (tokenId, context) => [context.sceneId, context.round, context.activeCombatantId, tokenId].join('|');
  const heightSpent = (tokenId, context) => { const turn = flightTurns.get(flightKey(tokenId, context)); return turn ? Math.round(turn.closed + turn.stretch) : 0; };
  const spentNow = (tokenId, context) => Math.max(movementState.getSpent(tokenId, context), heightSpent(tokenId, context));
  let cancelingForTurnChange = false;
  let undoPending = false;

  function syncCombatTurn() {
    const previousSession = dragSession;
    const context = getTurnContext();
    movementState.syncTurn(context);
    for (const key of flightTurns.keys()) if (!key.startsWith([context.sceneId, context.round, context.activeCombatantId].join('|') + '|')) flightTurns.delete(key);
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
    const spent = spentNow(tokenId, context);
    const { speed, why } = speedNow(tokenId, speedResolver.getInitialSpeed(placement));

    dragSession = {
      tokenId,
      placement,
      original: normalizeFootprint(original),
      speed,
      why,
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
        const base = Math.max(0, Math.trunc(result.speed));
        knownSpeeds.set(tokenId, base);
        const now = speedNow(tokenId, base);
        dragSession.speed = now.speed; dragSession.why = now.why;
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

  function moveCost(from, to, movementKind = null, tokenId = dragSession?.tokenId ?? null) {
    let measured = null;
    try { measured = measureRoute({ from: normalizeFootprint(from), to: normalizeFootprint(to), movementKind, tokenId }); } catch (error) { measured = null; }
    return Number.isFinite(measured) && measured >= 0 ? Math.trunc(measured) : measureChebyshevDistance(from, to);
  }

  function recordCommittedMove(tokenId, sceneId, from, to, movementKind) {
    // Being pushed, pulled or slid, or teleporting, is not the creature's own movement (Brandon, November 9, 2026:
    // "oops teleports should not count as movement").
    if (!from || !to || movementKind === 'forced' || movementKind === 'teleport') {
      return;
    }
    const cost = moveCost(from, to, movementKind, tokenId);
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
    // A finished sideways move closes a flier's height stretch: a height change after it counts again.
    const turn = flightTurns.get(flightKey(tokenId, getTurnContext()));
    if (turn) { turn.closed += turn.stretch; turn.stretch = 0; turn.base = turn.height; }
  }

  /** A flier let go at a new height on its own turn (from `before` to `after`, in squares). */
  function recordHeightChange(tokenId, before, after) {
    const context = getTurnContext();
    if (!tokenId || !context.active || context.activeCombatantId !== tokenId || !Number.isFinite(before) || !Number.isFinite(after)) return;
    const key = flightKey(tokenId, context);
    let turn = flightTurns.get(key);
    if (!turn) { turn = { base: before, height: before, stretch: 0, closed: 0 }; flightTurns.set(key, turn); }
    turn.height = after;
    turn.stretch = Math.max(turn.stretch, Math.abs(after - turn.base));
  }

  /** Speed, movement spent and movement left for a token during its turn; null when no turn is being counted. */
  function getMovementLeft(tokenId) {
    const context = getTurnContext();
    if (!tokenId || !context.active || context.activeCombatantId !== tokenId) {
      return null;
    }
    const { speed, why } = speedNow(tokenId, knownSpeeds.get(tokenId) ?? speedResolver.getInitialSpeed(getPlacementById(tokenId)));
    const spent = spentNow(tokenId, context);
    return { speed, spent, left: Math.max(0, speed - spent), ...(why ? { why } : {}) };
  }

  /**
   * The turn undo (Ctrl+Z, board-interactions performTurnUndo) put a token back from `to` to `from`: the move it undid
   * is given back when it is that token's last counted move this turn. True when something was given back.
   */
  function refundMove({ tokenId, from, to } = {}) {
    const context = getTurnContext(), last = tokenId ? movementState.peekLastMove(tokenId, context) : null;
    if (!last || !from || !to) return false;
    const same = (a, b) => Math.abs((a?.column ?? NaN) - b.column) < 1e-6 && Math.abs((a?.row ?? NaN) - b.row) < 1e-6;
    if (!same(last.from, from) || !same(last.to, to)) return false;
    movementState.undoLastMove(tokenId, context);
    clearRulerSupplement();
    return true;
  }

  /** Adds movement to the token's last move this turn (a climb chosen on the fall review). */
  function addMovementCost(tokenId, amount) {
    return Boolean(movementState.addToLastMove(tokenId, amount, getTurnContext()));
  }

  function handleDragCommitted({ sceneId, movedIds = [], originalPositions, preview, movementKind = null, source = null } = {}) {
    if (!dragSession || !movedIds.includes(dragSession.tokenId)) {
      // Arrow-key moves have no drag session; charge them the same route cost.
      if (source === 'keyboard' && getTurnContext().active) {
        movedIds.forEach((tokenId) => recordCommittedMove(tokenId, sceneId, originalPositions?.get?.(tokenId), preview?.get?.(tokenId), movementKind ?? 'walk'));
      }
      return;
    }
    const tokenId = dragSession.tokenId;
    const from = originalPositions?.get?.(tokenId) ?? dragSession.original;
    const to = preview?.get?.(tokenId);
    recordCommittedMove(tokenId, sceneId, from, to, movementKind);

    // `vtt:token-moved` is dispatched by the universal commit paths in
    // token-interactions.js (drag commit) and board-interactions.js
    // (arrow-key commit). Those fire regardless of combat state, so the
    // stairs trigger and opportunity-attack predicate both see every
    // willing move. Dispatching here too would double-fire during
    // combat (combat is the only time this controller actually runs to
    // this point) and break the stairs trigger's stateful tracking.

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
    const spent = spentNow(dragSession.tokenId, context);
    dragSession.spentBeforeDrag = spent;

    const remaining = Math.max(0, dragSession.speed - spent);
    const blockers = getOpposingSameLevelBlockers(dragSession.tokenId);
    const gridMetrics = getGridBoundsFromView(getViewState());
    // The reach outline is rebuilt only when something that shapes it changes, not on every pointer move.
    let cells = null;
    try { cells = getCellInfo(dragSession.tokenId); } catch (error) { cells = null; }
    const shapeKey = JSON.stringify([dragSession.tokenId, dragSession.original, remaining, cells?.key ?? null, blockers, gridMetrics.columns, gridMetrics.rows]);
    if (dragSession.shapeKey !== shapeKey) {
      dragSession.shapeKey = shapeKey;
      dragSession.shape = buildReachableMovementShape({
        origin: dragSession.original,
        remaining,
        cellInfo: typeof cells?.at === 'function' ? cells.at : null,
        stepCost: typeof cells?.stepCost === 'function' ? cells.stepCost : null,
        enter: typeof cells?.enter === 'function' ? cells.enter : null,
        wall: typeof cells?.wall === 'function' ? cells.wall : null,
        blockers,
        bounds: {
          minColumn: 0,
          minRow: 0,
          columns: gridMetrics.columns,
          rows: gridMetrics.rows,
        },
      });
    }

    overlay.render(dragSession.shape, projectCorner ? { ...gridMetrics, projectCorner } : gridMetrics);
    setRulerSupplement(formatMovementSummary({
      spent,
      dragCost,
      speed: dragSession.speed,
      why: dragSession.why,
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
    let kind = null;
    try { kind = getDragMovementKind(); } catch (error) { kind = null; }
    if (kind === 'forced' || kind === 'teleport') return 0;
    return moveCost(dragSession.original, position);
  }

  function currentDragCost() {
    const dragState = getViewState()?.dragState;
    return getPreviewCost(dragState?.cursorSquare ?? dragState?.previewPositions ?? null);
  }

  function canTrackPlacement(tokenId) {
    const context = getTurnContext();
    return Boolean(context.active && tokenId);
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
    // A held key, Alt, or a panel that owns Ctrl+Z (the walls panel, by isUndoSuppressed) is not a move undo
    // (November 9, 2026: these fell through and undid every move of the turn).
    if (event.repeat || event.altKey) {
      return;
    }
    if (isEditableEventTarget(event.target)) {
      return;
    }

    const context = getTurnContext();
    const tokenId = context.activeCombatantId;
    // On a turn: back to where the turn began (the 3D board's ghost), every move of it undone, last first (Brandon,
    // October 2026). Off a turn: the last move only, as before.
    if (movementState.peekLastMove(tokenId, context)) {
      event.preventDefault();
      event.stopPropagation();
      for (let step = 0; step < 32; step += 1) {
        const move = movementState.peekLastMove(tokenId, context);
        if (!move || !(await undoMove(move, tokenId, context)) || movementState.peekLastMove(tokenId, context) === move) break;
      }
      return;
    }
    const move = getUndoMove();
    if (!move) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    await undoMove(move, tokenId, context);
  }

  async function undoMove(move, tokenId, context) {
    if (!move || undoPending) return false;
    undoPending = true;
    let restored;
    try { restored = await Promise.resolve(restoreMove(move)); }
    finally { undoPending = false; }
    if (!restored) {
      return;
    }

    const tracked = movementState.peekLastMove(move.tokenId, context);
    if (tracked && tracked.from.column === move.from.column && tracked.from.row === move.from.row
      && tracked.to.column === move.to.column && tracked.to.row === move.to.row) {
      movementState.undoLastMove(move.tokenId, context);
    }
    clearRulerSupplement();
    return true;
  }

  documentRef?.addEventListener?.('keydown', handleKeydown, true);
  windowRef?.addEventListener?.('beforeunload', dispose, { once: true });

  return {
    syncCombatTurn,
    handleDragStart,
    handleDragMove,
    handleDragEnd,
    handleDragCommitted,
    getMovementLeft,
    addMovementCost,
    refundMove,
    recordHeightChange,
    undoSelectedMove: () => undoMove(getUndoMove(), getTurnContext().activeCombatantId, getTurnContext()),
    dispose,
  };
}

export function formatMovementSummary({ spent = 0, dragCost = 0, speed = 0, why = '' } = {}) {
  const current = Math.max(0, Math.trunc(spent + dragCost));
  const total = Math.max(0, Math.trunc(speed));
  const left = Math.max(0, total - current);
  const over = Math.max(0, current - total);
  // Why the speed is what it is, when a condition changed it ("Slowed: speed 2").
  const reason = why ? ` (${why})` : '';
  if (over > 0) {
    return `Moved ${current} / ${total} - ${over} over${reason}`;
  }
  return `Moved ${current} / ${total} - ${left} left${reason}`;
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
