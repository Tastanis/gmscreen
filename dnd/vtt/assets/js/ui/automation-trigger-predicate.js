export function payloadPrimaryTokenId(event, payload) {
  if (!payload || typeof payload !== 'object') return '';
  if (event === 'damageDealt' || event === 'forcedMovementDealt') {
    return payload.sourceId || payload.casterId || payload.actorId || payload.tokenId || '';
  }
  if (event === 'powerRoll' || event === 'abilityTest' || event === 'abilityRoll' || event === 'actionUsed' || event === 'potency') {
    return payload.actorId || payload.placementId || payload.sourceId || payload.tokenId || '';
  }
  return payload.placementId || payload.targetId || payload.actorId || payload.newTargetId || payload.tokenId || '';
}

export function payloadTargetIds(payload) {
  if (!payload || typeof payload !== 'object') return [];
  const ids = [];
  if (Array.isArray(payload.targetIds)) ids.push(...payload.targetIds);
  if (payload.targetId) ids.push(payload.targetId);
  if (payload.placementId) ids.push(payload.placementId);
  return [...new Set(ids.filter(Boolean))];
}

function normalizeKeywords(value) {
  return Array.isArray(value) ? value.map((item) => String(item).toLowerCase()) : [];
}

export function createWhoseMatcher({
  casterId = '',
  casterTeam = '',
  targetIdsAtRegister = [],
  getTeamForPlacementId = () => null,
  getJudgedTargetForSource = () => null,
  getPlacementMark = () => null,
  getPlacementFromStore = () => null,
} = {}) {
  return function whosePredicateMatches(whose, payloadTokenId) {
    if (!whose || whose === 'any') return true;
    if (!payloadTokenId) return false;
    if (whose === 'self') return payloadTokenId === casterId;
    if (whose === 'target') {
      return Array.isArray(targetIdsAtRegister) && targetIdsAtRegister.includes(payloadTokenId);
    }
    if (whose === 'judgedTarget') {
      return getJudgedTargetForSource(casterId, 'judgment')?.id === payloadTokenId;
    }
    if (whose === 'markSource') {
      const mark = getPlacementMark(getPlacementFromStore(payloadTokenId), 'judgment');
      return mark?.sourceId === casterId;
    }
    const otherTeam = getTeamForPlacementId(payloadTokenId);
    if (whose === 'ally') {
      if (!otherTeam || !casterTeam) return false;
      return otherTeam === casterTeam;
    }
    if (whose === 'enemy') {
      if (!otherTeam || !casterTeam) return false;
      return otherTeam !== casterTeam;
    }
    return false;
  };
}

function anyTokenMatchesWhose(ids, matchWhose) {
  if (!Array.isArray(ids) || !ids.length) return false;
  return ids.some((id) => matchWhose(id));
}

export function buildAutomationTriggerPredicate(entry, env = {}) {
  const { casterId, casterTeam, match, targetIds } = entry;
  const filter = (match && match.filter) || {};
  const event = match?.event;
  const whose = filter.whose || 'any';
  const matchWhose = createWhoseMatcher({
    casterId,
    casterTeam,
    targetIdsAtRegister: targetIds,
    getTeamForPlacementId: env.getTeamForPlacementId,
    getJudgedTargetForSource: env.getJudgedTargetForSource,
    getPlacementMark: env.getPlacementMark,
    getPlacementFromStore: env.getPlacementFromStore,
  });

  return function predicate(payload) {
    if (!payload || typeof payload !== 'object') return false;
    if (!entry.freeTriggered && typeof env.isTriggerActionAvailable === 'function') {
      if (!env.isTriggerActionAvailable(casterId)) return false;
    }
    const payloadTokenId = payloadPrimaryTokenId(event, payload);
    if (!matchWhose(whose, payloadTokenId)) return false;
    if (filter.targetWhose && !anyTokenMatchesWhose(payloadTargetIds(payload), (id) => matchWhose(filter.targetWhose, id))) {
      return false;
    }
    if ((filter.withinSquares != null || filter.minSquares != null) && typeof env.getSquareDistance === 'function') {
      const otherDistanceId = payload.sourceId || payloadTokenId;
      const squares = env.getSquareDistance(casterId, otherDistanceId);
      if (Number.isFinite(squares)) {
        if (filter.withinSquares != null && squares > Number(filter.withinSquares)) return false;
        if (filter.minSquares != null && squares < Number(filter.minSquares)) return false;
      }
    }
    if (event === 'damage' || event === 'damageDealt') {
      if (event === 'damageDealt') {
        const sourceTokenId = payload.sourceId || payload.casterId || payload.actorId || '';
        if (!matchWhose(whose, sourceTokenId)) return false;
      }
      const amount = Number.parseInt(payload.amount, 10) || 0;
      const damageType = String(payload.damageType || '').toLowerCase();
      if (filter.minAmount && amount < filter.minAmount) return false;
      if (filter.maxAmount && amount > filter.maxAmount) return false;
      if (Array.isArray(filter.damageType) && filter.damageType.length && !filter.damageType.includes(damageType)) return false;
      if (filter.actionKind && String(payload.actionKind || '').toLowerCase() !== String(filter.actionKind).toLowerCase()) return false;
      if (filter.costIncludes && !String(payload.cost || payload.resourceCost || '').toLowerCase().includes(String(filter.costIncludes).toLowerCase())) return false;
      if (Array.isArray(filter.keywordsAny) && filter.keywordsAny.length) {
        const have = normalizeKeywords(payload.keywords);
        if (!filter.keywordsAny.some((keyword) => have.includes(String(keyword).toLowerCase()))) return false;
      }
      return true;
    }
    if (event === 'staminaChange' || event === 'staminaZero') {
      const direction = filter.direction || 'either';
      if (direction === 'either') return true;
      const delta = Number.parseInt(payload.delta, 10) || 0;
      if (direction === 'down') return delta < 0;
      if (direction === 'up') return delta > 0;
      return false;
    }
    if (
      event === 'turnStart' ||
      event === 'turnEnd' ||
      event === 'roundStart' ||
      event === 'roundEnd' ||
      event === 'combatStart' ||
      event === 'combatEnd'
    ) return true;
    if (event === 'actionUsed') {
      if (filter.actionKind && String(payload.actionKind || '').toLowerCase() !== String(filter.actionKind).toLowerCase()) return false;
      if (filter.costIncludes && !String(payload.cost || payload.resourceCost || '').toLowerCase().includes(String(filter.costIncludes).toLowerCase())) return false;
      if (Array.isArray(filter.keywordsAny) && filter.keywordsAny.length) {
        const have = normalizeKeywords(payload.keywords);
        if (!filter.keywordsAny.some((keyword) => have.includes(String(keyword).toLowerCase()))) return false;
      }
      return true;
    }
    if (event === 'powerRoll' || event === 'abilityTest' || event === 'abilityRoll') {
      if (filter.actionKind && String(payload.actionKind || '').toLowerCase() !== String(filter.actionKind).toLowerCase()) return false;
      if (filter.costIncludes && !String(payload.cost || payload.resourceCost || '').toLowerCase().includes(String(filter.costIncludes).toLowerCase())) return false;
      if (filter.attribute && String(payload.attribute || '').toLowerCase() !== String(filter.attribute).toLowerCase()) return false;
      if (filter.tier && String(payload.tier || '').toLowerCase() !== String(filter.tier).toLowerCase()) return false;
      const total = Number.parseInt(payload.rollTotal, 10) || 0;
      if (filter.minTotal && total < filter.minTotal) return false;
      if (filter.maxTotal && total > filter.maxTotal) return false;
      if (Array.isArray(filter.keywordsAny) && filter.keywordsAny.length) {
        const have = normalizeKeywords(payload.keywords);
        if (!filter.keywordsAny.some((keyword) => have.includes(String(keyword).toLowerCase()))) return false;
      }
      return true;
    }
    if (event === 'potency') {
      if (filter.attribute && String(payload.attribute || '').toLowerCase() !== String(filter.attribute).toLowerCase()) return false;
      if (filter.level && String(payload.level || '').toLowerCase() !== String(filter.level).toLowerCase()) return false;
      const targetCount = Number.parseInt(payload.targetCount, 10) || payloadTargetIds(payload).length;
      if (filter.minTargets && targetCount < filter.minTargets) return false;
      if (filter.maxTargets && targetCount > filter.maxTargets) return false;
      return true;
    }
    if (event === 'markApplied') {
      if (filter.markType && String(payload.markType || '').toLowerCase() !== String(filter.markType).toLowerCase()) return false;
      if (filter.source === 'self' && payload.sourceId !== casterId) return false;
      return true;
    }
    if (event === 'move') {
      let watcherState = null;
      if (payload.perWatcher instanceof Map) watcherState = payload.perWatcher.get(casterId);
      else if (payload.perWatcher && typeof payload.perWatcher === 'object') watcherState = payload.perWatcher[casterId];
      const leaves = Boolean(watcherState?.leaves);
      const enters = Boolean(watcherState?.enters);
      if (filter.leavesAdjacency && !leaves) return false;
      if (filter.entersAdjacency && !enters) return false;
      const distance = Number.parseInt(payload.distance ?? payload.movedDistance, 10) || 0;
      if (filter.minDistance && distance < filter.minDistance) return false;
      if (filter.maxDistance && distance > filter.maxDistance) return false;
      return true;
    }
    if (event === 'forcedMovement' || event === 'forcedMovementDealt') {
      const distance = Number.parseInt(payload.distance ?? payload.movedDistance, 10) || 0;
      if (filter.minDistance && distance < filter.minDistance) return false;
      if (filter.maxDistance && distance > filter.maxDistance) return false;
      if (filter.verb && String(payload.verb || '').toLowerCase() !== String(filter.verb).toLowerCase()) return false;
      return true;
    }
    return true;
  };
}
