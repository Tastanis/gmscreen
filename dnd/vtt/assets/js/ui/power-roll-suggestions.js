import { floorElevations } from '../state/normalize/floor-elevation.js';
const EDGE = 'edge';
import { floorRelation, canReachFloor } from './floor-geometry.js';
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

function matchingConditionEntries(placement, name) {
  const wanted = normalizeText(name);
  return conditionEntries(placement)
    .map((entry) => entry.condition)
    .filter((condition) => normalizeText(condition?.name) === wanted);
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

function isAdjacentTo(a, b, mapLevels = []) {
  if (!a || !b || a.id === b.id) return false;
  if (a.hidden || a.isHidden || b.hidden || b.isHidden || !canReachFloor(a, b, 1, mapLevels)) return false;
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

function isAbilityRollContext(context = {}) {
  const rollEvent = rollEventFromContext(context);
  return rollEvent === 'powerroll' || rollEvent === 'abilitytest' || rollEvent === 'abilityroll';
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
  if (!rider || !['rollmodifier', 'rollbuff'].includes(normalizeText(rider.type))) return false;
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

function isFlanking(actor, target, placements = [], getTeam = null, mapLevels = []) {
  if (!actor || !target || floorRelation(actor,target,mapLevels) !== 'same' || !isAdjacentTo(actor, target, mapLevels)) return false;
  const actorTeam = placementTeam(actor, getTeam);
  const targetTeam = placementTeam(target, getTeam);
  if (actorTeam === targetTeam) return false;
  return (Array.isArray(placements) ? placements : []).some((candidate) => {
    if (!candidate || candidate.id === actor.id || candidate.id === target.id) return false;
    if (placementTeam(candidate, getTeam) !== actorTeam) return false;
    if (placementTeam(candidate, getTeam) === targetTeam) return false;
    if (hasCondition(candidate, 'dazed')) return false;
    if (floorRelation(candidate,target,mapLevels) !== 'same' || !isAdjacentTo(candidate, target, mapLevels)) return false;
    return areOppositeAroundTarget(actor, candidate, target);
  });
}

function makeSuggestion(id, kind, label, active = true, extra = {}) {
  return { id, kind, label, active, ...extra };
}

function conditionSourceId(condition) {
  return String(
    condition?.sourceId ||
    condition?.source?.id ||
    condition?.originId ||
    condition?.casterId ||
    condition?.appliedBy ||
    condition?.duration?.sourceId ||
    condition?.duration?.targetTokenId ||
    ''
  ).trim();
}

function targetIdSetFromContext(targets = [], context = {}) {
  const ids = new Set();
  (Array.isArray(targets) ? targets : []).forEach((target) => {
    if (target?.id) ids.add(String(target.id));
  });
  (Array.isArray(context.targetIds) ? context.targetIds : []).forEach((id) => {
    if (id) ids.add(String(id));
  });
  (Array.isArray(context.targets) ? context.targets : []).forEach((target) => {
    const id = typeof target === 'string' ? target : target?.id;
    if (id) ids.add(String(id));
  });
  return ids;
}

function hasTargetId(targetIds, id) {
  const wanted = String(id || '').trim();
  if (!wanted) return false;
  for (const targetId of targetIds) {
    if (String(targetId) === wanted) return true;
  }
  return false;
}

function hasSourceLinkedCondition(placement, name, sourceId) {
  const wanted = String(sourceId || '').trim();
  if (!wanted) return false;
  return matchingConditionEntries(placement, name)
    .some((condition) => conditionSourceId(condition) === wanted);
}

function hasConditionExcludingTargets(placement, name, targetIds) {
  return matchingConditionEntries(placement, name)
    .some((condition) => {
      const sourceId = conditionSourceId(condition);
      return sourceId && !hasTargetId(targetIds, sourceId);
    });
}

// Hidden effects and buffs on a token. `side` "own": the bearer's own rolls; "against": rolls made against the bearer
// (a buff with rider.side "against", e.g. "allies have an edge against this target"). A buff can give an edge/bane,
// +damage and +potency at once: one suggestion each, all used up together.
function hiddenEffectSuggestions(placement, context = {}, side = 'own') {
  const list = [];
  conditionEntries(placement).forEach(({ condition, index }) => {
    if (!condition || normalizeText(condition.name) !== 'hiddeneffect') return;
    if (!hiddenRiderApplies(condition, context)) return;
    const riderSide = normalizeText(condition.rider?.side) === 'against' ? 'against' : 'own';
    if (riderSide !== side) return;
    const label = String(condition.label || condition.sourceAbility || 'Hidden effect').trim() || 'Hidden effect';
    const shared = {
      consume: condition.rider?.consume || condition.consume || 'manual',
      conditionRef: { placementId: placement.id || '', conditionIndex: index },
    };
    const base = `hidden-effect-${placement.id || 'token'}-${index}`;
    const modifier = rollModifierKind(condition.rider?.modifier);
    if (modifier) list.push(makeSuggestion(base, modifier.kind, label, true, { count: modifier.count, ...shared }));
    const damage = Number.parseInt(condition.rider?.damageBonus, 10) || 0;
    if (damage) list.push(makeSuggestion(`${base}-damage`, 'damage', label, true, { amount: damage, ...shared }));
    const potency = Number.parseInt(condition.rider?.potencyBonus, 10) || 0;
    if (potency) list.push(makeSuggestion(`${base}-potency`, 'potency', label, true, { amount: potency, ...shared }));
  });
  return list;
}

// ---------- always-on edge/bane traits (passive kind "rollModifier") ----------
//
// Brandon, October 2026: shown in the roll window "just ticked on and with the name of why tied to that edge" — the
// trait's name. Gates the board can read (winded, a condition, an adjacent ally) decide whether the trait shows at
// all; a `note` gate ("outdoors") can't be read, so the trait shows ticked and the note is its reason.

function rollPassivesIn(automation, fallbackLabel) {
  if (!automation || typeof automation !== 'object') return [];
  const passives = Array.isArray(automation.passives) ? automation.passives : [];
  return passives
    .filter((passive) => normalizeText(passive?.kind).replace(/[^a-z]/g, '') === 'rollmodifier')
    .map((passive) => ({ ...passive, label: String(passive.label || fallbackLabel || 'Trait').trim() || 'Trait' }));
}

// Every rollModifier passive a token carries: a monster's traits and abilities, a hero's features.
export function collectRollPassives(monster, sheet) {
  const found = [];
  const traits = Array.isArray(monster?.traits) ? monster.traits : [];
  traits.forEach((trait) => found.push(...rollPassivesIn(trait?.automation, trait?.name)));
  const abilities = monster?.abilities && typeof monster.abilities === 'object' ? monster.abilities : {};
  Object.keys(abilities).forEach((key) => {
    (Array.isArray(abilities[key]) ? abilities[key] : []).forEach((ability) => found.push(...rollPassivesIn(ability?.automation, ability?.name)));
  });
  const features = Array.isArray(sheet?.features) ? sheet.features : [];
  features.forEach((feature) => found.push(...rollPassivesIn(feature?.automation, feature?.title || feature?.name)));
  return found;
}

function staminaOf(placement) {
  const hp = placement?.hp;
  const current = Number(hp && typeof hp === 'object' ? hp.current : hp);
  const max = Number(hp && typeof hp === 'object' ? hp.max : placement?.maxHp);
  return Number.isFinite(current) && Number.isFinite(max) && max > 0 ? { current, max } : null;
}

function isWindedPlacement(placement) {
  const stamina = staminaOf(placement);
  return Boolean(stamina && stamina.current <= Math.floor(stamina.max / 2));
}

function hasAnyCondition(placement, names) {
  return (Array.isArray(names) ? names : []).some((name) => hasCondition(placement, name)
    || conditionEntries(placement).some(({ condition }) => normalizeText(condition?.text || condition?.label) === normalizeText(name)));
}

function rollPassiveAppliesToRoll(passive, context) {
  const keywords = keywordsFromContext(context);
  const any = Array.isArray(passive.keywordsAny) ? passive.keywordsAny : [];
  if (any.length && !any.some((keyword) => listContainsNormalized(keywords, keyword))) return false;
  const all = Array.isArray(passive.keywordsAll) ? passive.keywordsAll : [];
  if (all.length && !all.every((keyword) => listContainsNormalized(keywords, keyword))) return false;
  switch (passive.appliesTo) {
    case 'strikes': return isStrike(context) && isAbilityRollContext(context);
    case 'melee': return isMeleeAbility(context) && isAbilityRollContext(context);
    case 'ranged': return keywords.some((word) => word === 'ranged' || word.startsWith('ranged ')) && isAbilityRollContext(context);
    case 'tests': return rollEventFromContext(context) === 'abilitytest';
    default: return rollEventFromContext(context) === 'powerroll' || rollEventFromContext(context) === 'abilityroll';
  }
}

// `self` carries the trait; `other` is the creature on the other side of the roll.
function rollPassiveGatePasses(when, self, other, placements, getTeam, mapLevels) {
  const gate = when && typeof when === 'object' ? when : {};
  if (gate.winded && !isWindedPlacement(self)) return false;
  if (gate.notWinded && isWindedPlacement(self)) return false;
  if (gate.targetWinded && !isWindedPlacement(other)) return false;
  if (gate.selfCondition && !hasAnyCondition(self, gate.selfCondition)) return false;
  if (gate.targetCondition && !hasAnyCondition(other, gate.targetCondition)) return false;
  if (gate.adjacentAlly) {
    const team = placementTeam(self, getTeam);
    const near = (Array.isArray(placements) ? placements : []).some((candidate) => candidate && candidate.id !== self.id
      && placementTeam(candidate, getTeam) === team && isAdjacentTo(self, candidate, mapLevels));
    if (!near) return false;
  }
  return true;
}

function withinSquares(a, b, squares, mapLevels) {
  if (!a || !b) return false;
  if (a.id === b.id) return true;
  return canReachFloor(a, b, squares, mapLevels) && rectDistance(tokenRect(a), tokenRect(b)) <= squares;
}

function traitSuggestion(id, passive, extra = {}) {
  const modifier = rollModifierKind(passive.modifier);
  if (!modifier) return null;
  return makeSuggestion(id, modifier.kind, passive.label, true, {
    count: modifier.count,
    reason: passive.when?.note || extra.reason || 'Trait',
  });
}

export function rollPassiveSuggestions({ actor, targets = [], placements = [], mapLevels = [], getTeam = null, context = {}, passivesFor = null } = {}) {
  if (typeof passivesFor !== 'function' || !actor) return [];
  const list = [];
  const targetList = (Array.isArray(targets) ? targets : []).filter(Boolean);
  // The roller's own traits ("it has an edge on strikes while winded").
  passivesFor(actor).forEach((passive, index) => {
    if (passive.scope === 'alliesWithin' || passive.side === 'against') return;
    if (!rollPassiveAppliesToRoll(passive, context)) return;
    const others = targetList.length ? targetList : [null];
    if (!others.some((other) => rollPassiveGatePasses(passive.when, actor, other, placements, getTeam, mapLevels))) return;
    const suggestion = traitSuggestion(`trait-own-${actor.id || 'actor'}-${index}`, passive);
    if (suggestion) list.push(suggestion);
  });
  // Each target's traits about rolls made against it ("strikes against it have an edge while it is winded").
  targetList.forEach((target) => {
    passivesFor(target).forEach((passive, index) => {
      if (passive.scope === 'alliesWithin' || passive.side === 'own') return;
      if (!rollPassiveAppliesToRoll(passive, context)) return;
      if (!rollPassiveGatePasses(passive.when, target, actor, placements, getTeam, mapLevels)) return;
      const suggestion = traitSuggestion(`trait-vs-${target.id || 'target'}-${index}`, passive);
      if (suggestion) {
        if (targetList.length > 1) suggestion.label = `${passive.label} (${target.name || target.label || 'target'})`;
        list.push(suggestion);
      }
    });
  });
  // Guards: "strikes against allies within 2 of it take a bane".
  if (targetList.length) {
    (Array.isArray(placements) ? placements : []).forEach((guard) => {
      if (!guard?.id) return;
      passivesFor(guard).forEach((passive, index) => {
        if (passive.scope !== 'alliesWithin') return;
        if (!rollPassiveAppliesToRoll(passive, context)) return;
        const guardTeam = placementTeam(guard, getTeam);
        const covered = targetList.some((target) => placementTeam(target, getTeam) === guardTeam
          && withinSquares(guard, target, Math.max(0, Number(passive.within) || 0), mapLevels));
        if (!covered) return;
        if (!rollPassiveGatePasses(passive.when, guard, actor, placements, getTeam, mapLevels)) return;
        const suggestion = traitSuggestion(`trait-guard-${guard.id}-${index}`, passive, { reason: `${guard.name || 'A guard'} is near` });
        if (suggestion) list.push(suggestion);
      });
    });
  }
  return list;
}

export function getPowerRollSuggestions({
  actor = null,
  targets = [],
  placements = [],
  mapLevels = [],
  getTeam = null,
  context = {},
  // What the actor's squad captain grants it right now (see minion-squads.mjs), or null.
  captainBonus = null,
  // (placement) => the rollModifier passives that token carries (see collectRollPassives).
  passivesFor = null,
} = {}) {
  const suggestions = [];
  const targetList = Array.isArray(targets) ? targets.filter(Boolean) : [];
  const primaryTarget = targetList[0] || null;
  if (!actor || !primaryTarget) return suggestions;

  const melee = isMeleeAbility(context);
  const strike = isStrike(context);
  const abilityRoll = isAbilityRollContext(context);
  const targetIds = targetIdSetFromContext(targetList, context);

  const heights = floorElevations(mapLevels);
  const standing = (!actor.movementMode || actor.movementMode === 'ground')
    && !hasCondition(actor,'prone') && !hasCondition(actor,'climbing');
  const highGround = abilityRoll && standing && targetList.every(target => {
    if (hasCondition(target,'burrowing')) return false;
    const terrain = globalThis.terrainPrototype;
    const groundedHeight = placement => terrain?.active && typeof terrain.groundFor === 'function'
      ? terrain.groundFor(placement)
      : ['fly','hover'].includes(placement.movementMode) ? placement.flightHeight : heights.get(placement.levelId || 'level-0');
    const feet = groundedHeight(actor), targetHeight = groundedHeight(target);
    const targetSpace = Math.max(1, Number(target.width) || 1, Number(target.height) || 1);
    return Number.isFinite(feet) && Number.isFinite(targetHeight) && feet >= targetHeight + targetSpace;
  });
  suggestions.push(makeSuggestion('edge-high-ground', EDGE, 'High ground', highGround, {
    reason: highGround ? 'Fully above target' : 'Confirm height and footing',
  }));
  const ranged = !melee && keywordsFromContext(context).some(word => word === 'ranged' || word.startsWith('ranged '));
  if (strike && ranged && placements.some(other => other?.id !== actor.id
      && placementTeam(other,getTeam) !== placementTeam(actor,getTeam) && isAdjacentTo(actor,other,mapLevels))) {
    suggestions.push(makeSuggestion('bane-enemy-adjacent', BANE, 'Enemy adjacent', true, {reason:'Ranged strike'}));
  }
  suggestions.push(makeSuggestion('edge-flanking', EDGE, 'Flanking', melee && strike && isFlanking(actor, primaryTarget, placements, getTeam, mapLevels), {
    reason: 'Automatic flanking checks use visible, adjacent creatures on the same floor. Cross-floor openings and vertical reach require manual confirmation.',
  }));
  suggestions.push(makeSuggestion('bane-cover', BANE, 'Cover', false));
  if (strike && hasCondition(actor, 'prone')) {
    suggestions.push(makeSuggestion('bane-prone', BANE, 'Prone'));
  }
  if (melee && hasCondition(primaryTarget, 'prone')) {
    suggestions.push(makeSuggestion('edge-prone', EDGE, 'Prone'));
  }
  if (hasCondition(primaryTarget, 'restrained')) {
    suggestions.push(makeSuggestion('edge-restrained', EDGE, 'Restrained'));
  }
  if (hasCondition(primaryTarget, 'unconscious')) {
    suggestions.push(makeSuggestion('edge-unconscious', EDGE, 'Unconscious', true, { count: 2 }));
  }
  if (hasCondition(actor, 'hidden')) {
    suggestions.push(makeSuggestion('edge-hidden', EDGE, 'Hidden'));
  }
  if (hasCondition(actor, 'weakened') && abilityRoll) {
    suggestions.push(makeSuggestion('bane-weakened', BANE, 'Weakened'));
  }
  if (hasCondition(actor, 'restrained') && abilityRoll) {
    suggestions.push(makeSuggestion('bane-restrained', BANE, 'Restrained'));
  }
  if (abilityRoll && hasConditionExcludingTargets(actor, 'taunted', targetIds)) {
    suggestions.push(makeSuggestion('bane-taunted', BANE, 'Taunted', true, { count: 2 }));
  }
  if (abilityRoll && hasConditionExcludingTargets(actor, 'grabbed', targetIds)) {
    suggestions.push(makeSuggestion('bane-grabbed', BANE, 'Grabbed'));
  }
  if (abilityRoll) {
    const actorId = actor?.id || '';
    if ([...targetIds].some((targetId) => hasSourceLinkedCondition(actor, 'frightened', targetId))) {
      suggestions.push(makeSuggestion('bane-frightened', BANE, 'Frightened'));
    }
    if (actorId && targetList.some((target) => hasSourceLinkedCondition(target, 'frightened', actorId))) {
      suggestions.push(makeSuggestion('edge-frightened', EDGE, 'Frightened'));
    }
  }
  suggestions.push(...hiddenEffectSuggestions(actor, context));
  targetList.forEach((target) => suggestions.push(...hiddenEffectSuggestions(target, context, 'against')));
  suggestions.push(...rollPassiveSuggestions({ actor, targets: targetList, placements, mapLevels, getTeam, context, passivesFor }));
  // A minion led by a captain: "Gain an edge on strikes" (or a double edge), already switched on.
  const captainEdge = Math.min(2, Math.max(0, Number.parseInt(captainBonus?.edge, 10) || 0));
  if (strike && abilityRoll && captainEdge > 0) {
    suggestions.push(makeSuggestion('edge-captain', EDGE, 'With Captain', true, {
      reason: `Led by ${captainBonus.captainName || 'its captain'}`,
      ...(captainEdge > 1 ? { count: captainEdge } : {}),
    }));
  }

  return suggestions;
}

export const __testing = {
  rollPassiveGatePasses,
  areOppositeAroundTarget,
  hiddenEffectSuggestions,
  hasCondition,
  hasSourceLinkedCondition,
  isAdjacentTo,
  isFlanking,
  tokenRect,
};
