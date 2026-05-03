export function createMovementState() {
  let activeTurnKey = null;
  const spentByToken = new Map();

  function syncTurn(context = {}) {
    const nextKey = getTurnKey(context);
    if (!nextKey) {
      activeTurnKey = null;
      spentByToken.clear();
      return null;
    }
    if (nextKey !== activeTurnKey) {
      activeTurnKey = nextKey;
      spentByToken.clear();
    }
    return activeTurnKey;
  }

  function getSpent(tokenId, context = {}) {
    if (!tokenId || syncTurn(context) === null) {
      return 0;
    }
    return spentByToken.get(tokenId)?.spent ?? 0;
  }

  function recordMove(move = {}, context = {}) {
    const turnKey = syncTurn(context);
    const tokenId = typeof move.tokenId === 'string' ? move.tokenId : '';
    const cost = Math.max(0, Math.trunc(move.cost ?? 0));
    if (!turnKey || !tokenId || cost <= 0) {
      return null;
    }

    const entry = spentByToken.get(tokenId) ?? { spent: 0, moves: [] };
    const stored = {
      ...move,
      tokenId,
      cost,
      turnKey,
      recordedAt: Date.now(),
    };
    entry.spent += cost;
    entry.moves.push(stored);
    spentByToken.set(tokenId, entry);
    return stored;
  }

  function peekLastMove(tokenId, context = {}) {
    if (!tokenId || syncTurn(context) === null) {
      return null;
    }
    const entry = spentByToken.get(tokenId);
    if (!entry?.moves?.length) {
      return null;
    }
    return entry.moves[entry.moves.length - 1] ?? null;
  }

  function undoLastMove(tokenId, context = {}) {
    if (!tokenId || syncTurn(context) === null) {
      return null;
    }
    const entry = spentByToken.get(tokenId);
    if (!entry?.moves?.length) {
      return null;
    }
    const move = entry.moves.pop();
    entry.spent = Math.max(0, entry.spent - (move?.cost ?? 0));
    if (entry.moves.length || entry.spent > 0) {
      spentByToken.set(tokenId, entry);
    } else {
      spentByToken.delete(tokenId);
    }
    return move ?? null;
  }

  return {
    syncTurn,
    getSpent,
    recordMove,
    peekLastMove,
    undoLastMove,
  };
}

export function getTurnKey(context = {}) {
  if (!context.active || !context.activeCombatantId || !context.sceneId) {
    return null;
  }
  const round = Number.isFinite(context.round) && context.round > 0 ? Math.trunc(context.round) : 0;
  return `${context.sceneId}:${round}:${context.activeCombatantId}`;
}
