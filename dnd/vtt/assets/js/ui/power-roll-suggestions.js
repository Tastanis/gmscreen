const EDGE = 'edge';
const BANE = 'bane';

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeTeam(value) {
  const raw = normalizeText(value);
  return raw === 'enemy' ? 'enemy' : 'ally';
}

function conditionNames(placement) {
  return new Set(
    conditionEntries(placement)
      .map((entry) => normalizeText(entry.condition?.name))
      .filter(Boolean)
  );
}

function conditionEntries(placement) {
  const source = Array.isArray(placement?.conditions)
    ? placement.conditions
    : placement?.condition
      ? [placement.condition]
      : [];
  return source
    .map((entry, index) => {
      if (typeof entry === 'string') {
        const name = entry.trim();
        return name ? { index, condition: { name } } : null;
      }
      if (entry && typeof entry === 'object') {
        return { index, condition: entry };
      }
      return null;
    })
    .filter(Boolean);
}

function hasCondition(placement, name) {
  return conditionNames(placement).has(normalizeText(name));
}

function tokenRect(placement) {
  const column = Number.isFinite(placement?.column) ? placement.column : Number.parseInt(placement?.column, 10) || 0;
  const row = Number.isFinite(placement?.row) ? placement.row : Number.parseInt(placement?.row, 10) || 0;
  const width = Math.max(1, Number.isFinite(placement?.width) ? placement.width : Number.parseInt(placement?.width, 10) || 1);
  const height = Math.max(1, Number.isFinite(placement?.height) ? placement.height : Number.parseInt(placement?.height, 10) || 1);
  return {
    left: column,
    top: row,
    right: column + width - 1,
    bottom: row + height - 1,
    centerX: column + width / 2,
    centerY: row + height / 2,
  };
}

function rectDistance(a, b) {
  const dx = a.right < b.left ? b.left - a.right : b.right < a.left ? a.left - b.right : 0;
  const dy = a.bottom < b.top ? b.top - a.bottom : b.bottom < a.top ? a.top - b.bottom : 0;
  return Math.max(dx, dy);
}

function isAdjacentTo(a, b) {
  if (!a || !b || a.id === b.id) return false;
  return rectDistance(tokenRect(a), tokenRect(b)) <= 1;
}

function sideVectorAroundTarget(placement, target) {
  const source = tokenRect(placement);
  const targetRect = tokenRect(target);
  const x = source.centerX < targetRect.left
    ? -1
    : source.centerX > targetRect.right + 1
      ? 1
      : 0;
  const y = source.centerY < targetRect.top
    ? -1
    : source.centerY > targetRect.bottom + 1
      ? 1
      : 0;
  return { x, y };
}

function areOppositeAroundTarget(a, b, target) {
  const av = sideVectorAroundTarget(a, target);
  const bv = sideVectorAroundTarget(b, target);
  return (av.x !== 0 && av.x * bv.x < 0) || (av.y !== 0 && av.y * bv.y < 0);
}

function levelRank(placement, mapLevels = []) {
  const levelId = placement?.levelId || '';
  const levels = Array.isArray(mapLevels) ? mapLevels : [];
  const index = levels.findIndex((level) => level && level.id === levelId);
  if (index < 0) return 0;
  const z = Number(levels[index]?.zIndex);
  return Number.isFinite(z) ? z : index;
}

function hasHighGround(actor, target, mapLevels = []) {
  if (!actor || !target) return false;
  return levelRank(actor, mapLevels) > levelRank(target, mapLevels);
}

function keywordsFromContext(context = {}) {
  const parts = [];
  if (Array.isArray(context.keywords)) parts.push(...context.keywords);
  if (Array.isArray(context.action?.keywords)) parts.push(...context.action.keywords);
  if (typeof context.action?.keywords === 'string') parts.push(context.action.keywords);
  if (typeof context.action?.range === 'string') parts.push(context.action.range);
  if (typeof context.range === 'string') parts.push(context.range);
  return parts.flatMap((part) => String(part).split(/[,;]+/)).map(normalizeText).filter(Boolean);
}

function isMeleeAbility(context = {}) {
  return keywordsFromContext(context).some((entry) => entry === 'melee' || entry.startsWith('melee '));
}

function isStrike(context = {}) {
  return keywordsFromContext(context).includes('strike');
}

function rollEventFromContext(context = {}) {
  const rollEvent = normalizeText(context.rollEvent || 'powerRoll');
  return rollEvent || 'powerroll';
}

function actionKindFromContext(context = {}) {
  return normalizeText(context.actionKind || context.action?.actionKind || context.action?.kind || context.action?.type || '');
}

function listContainsNormalized(list, value) {
  const normalized = normalizeText(value);
  if (!normalized) return false;
  return (Array.isArray(list) ? list : [])
    .map(normalizeText)
    .some((entry) => entry === normalized);
}

function hiddenRiderApplies(condition, context = {}) {
  const rider = condition?.rider && typeof condition.rider === 'object' ? condition.rider : null;
  if (!rider || normalizeText(rider.type) !== 'rollmodifier') return false;
  const appliesTo = rider.appliesTo && typeof rider.appliesTo === 'object' ? rider.appliesTo : {};
  const wantedRoll = normalizeText(appliesTo.rollEvent);
  const rollEvent = rollEventFromContext(context);
  if (wantedRoll && wantedRoll !== 'abilityroll' && wantedRoll !== rollEvent) return false;
  const wantedKind = normalizeText(appliesTo.actionKind);
  if (wantedKind && wantedKind !== actionKindFromContext(context)) return false;
  const keywords = keywordsFromContext(context);
  const keywordsAny = Array.isArray(appliesTo.keywordsAny) ? appliesTo.keywordsAny : [];
  if (keywordsAny.length && !keywordsAny.some((keyword) => listContainsNormalized(keywords, keyword))) return false;
  const keywordsAll = Array.isArray(appliesTo.keywordsAll) ? appliesTo.keywordsAll : [];
  if (keywordsAll.length && !keywordsAll.every((keyword) => listContainsNormalized(keywords, keyword))) return false;
  return true;
}

function rollModifierKind(modifier) {
  const normalized = normalizeText(modifier).replace(/[\s_-]+/g, '');
  if (normalized === 'edge') return { kind: EDGE, count: 1 };
  if (normalized === 'bane') return { kind: BANE, count: 1 };
  if (normalized === 'doubleedge') return { kind: EDGE, count: 2 };
  if (normalized === 'doublebane') return { kind: BANE, count: 2 };
  return null;
}

function placementTeam(placement, getTeam) {
  if (typeof getTeam === 'function' && placement?.id) {
    const team = getTeam(placement.id);
    if (team) return normalizeTeam(team);
  }
  return normalizeTeam(placement?.combatTeam ?? placement?.team ?? placement?.tags?.team ?? placement?.faction);
}

function isFlanking(actor, target, placements = [], getTeam = null) {
  if (!actor || !target || !isAdjacentTo(actor, target)) return false;
  const actorTeam = placementTeam(actor, getTeam);
  const targetTeam = placementTeam(target, getTeam);
  if (actorTeam === targetTeam) return false;
  return (Array.isArray(placements) ? placements : []).some((candidate) => {
    if (!candidate || candidate.id === actor.id || candidate.id === target.id) return false;
    if (placementTeam(candidate, getTeam) !== actorTeam) return false;
    if (placementTeam(candidate, getTeam) === targetTeam) return false;
    if (hasCondition(candidate, 'dazed')) return false;
    if (!isAdjacentTo(candidate, target)) return false;
    return areOppositeAroundTarget(actor, candidate, target);
  });
}

function makeSuggestion(id, kind, label, active = true, extra = {}) {
  return { id, kind, label, active, ...extra };
}

function hiddenEffectSuggestions(placement, context = {}) {
  return conditionEntries(placement)
    .map(({ condition, index }) => {
      if (!condition || normalizeText(condition.name) !== 'hiddeneffect') return null;
      if (!hiddenRiderApplies(condition, context)) return null;
      const modifier = rollModifierKind(condition.rider?.modifier);
      if (!modifier) return null;
      const label = String(condition.label || condition.sourceAbility || 'Hidden effect').trim();
      return makeSuggestion(
        `hidden-effect-${placement.id || 'token'}-${index}`,
        modifier.kind,
        label || 'Hidden effect',
        true,
        {
          count: modifier.count,
          consume: condition.rider?.consume || condition.consume || 'manual',
          conditionRef: {
            placementId: placement.id || '',
            conditionIndex: index,
          },
        }
      );
    })
    .filter(Boolean);
}

export function getPowerRollSuggestions({
  actor = null,
  targets = [],
  placements = [],
  mapLevels = [],
  getTeam = null,
  context = {},
} = {}) {
  const suggestions = [];
  const targetList = Array.isArray(targets) ? targets.filter(Boolean) : [];
  const primaryTarget = targetList[0] || null;
  if (!actor || !primaryTarget) return suggestions;

  const melee = isMeleeAbility(context);
  const strike = isStrike(context);

  suggestions.push(makeSuggestion('edge-high-ground', EDGE, 'High Ground', hasHighGround(actor, primaryTarget, mapLevels)));
  suggestions.push(makeSuggestion('edge-flanking', EDGE, 'Flanking', melee && strike && isFlanking(actor, primaryTarget, placements, getTeam)));
  suggestions.push(makeSuggestion('bane-cover', BANE, 'Cover', false));
  if (melee && hasCondition(primaryTarget, 'prone')) {
    suggestions.push(makeSuggestion('edge-prone', EDGE, 'Prone'));
  }
  if (hasCondition(primaryTarget, 'restrained')) {
    suggestions.push(makeSuggestion('edge-restrained', EDGE, 'Restrained'));
  }
  if (hasCondition(actor, 'hidden')) {
    suggestions.push(makeSuggestion('edge-hidden', EDGE, 'Hidden'));
  }
  if (hasCondition(actor, 'weakened')) {
    suggestions.push(makeSuggestion('bane-weakened', BANE, 'Weakened'));
  }
  if (hasCondition(actor, 'restrained')) {
    suggestions.push(makeSuggestion('bane-restrained', BANE, 'Restrained'));
  }
  suggestions.push(...hiddenEffectSuggestions(actor, context));

  return suggestions;
}

export const __testing = {
  areOppositeAroundTarget,
  hiddenEffectSuggestions,
  hasCondition,
  hasHighGround,
  isAdjacentTo,
  isFlanking,
  tokenRect,
};
