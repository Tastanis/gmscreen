import { TURN_PHASE, normalizeCombatTeam } from './combat-state.js';

export function validateTurnStartState(
  {
    combatActive = false,
    combatantId = '',
    representativeId = '',
    team = null,
    currentPhase = TURN_PHASE.IDLE,
    currentTurnTeam = null,
    activeCombatantId = null,
    completedCombatantIds = [],
    turnLockState = null,
  } = {},
  options = {}
) {
  const isOverride = options.override === true;
  const isSharonOverride = options.sharonOverride === true;
  const normalizedCombatantId = normalizeId(combatantId);
  const normalizedRepresentativeId = normalizeId(representativeId) || normalizedCombatantId;
  const completed = toStringSet(completedCombatantIds);
  const phase = Object.values(TURN_PHASE).includes(currentPhase) ? currentPhase : TURN_PHASE.IDLE;
  const result = {
    valid: false,
    requiresConfirmation: false,
    confirmationType: null,
    team,
    currentPhase: phase,
    expectedTeam: currentTurnTeam,
  };

  if (!combatActive) {
    return result;
  }

  if (normalizedRepresentativeId && completed.has(normalizedRepresentativeId)) {
    return result;
  }

  const lockCombatantId = normalizeId(turnLockState?.combatantId);
  const lockHeldByDifferentCombatant =
    Boolean(turnLockState?.holderId) &&
    Boolean(lockCombatantId) &&
    lockCombatantId !== normalizedCombatantId;

  if (lockHeldByDifferentCombatant) {
    if (isOverride || isSharonOverride) {
      result.valid = true;
      return result;
    }
    result.requiresConfirmation = true;
    result.confirmationType = 'override_active_turn';
    return result;
  }

  if (phase === TURN_PHASE.PICK) {
    result.valid = true;
    return result;
  }

  if (phase === TURN_PHASE.ACTIVE && activeCombatantId === normalizedCombatantId) {
    result.valid = true;
    return result;
  }

  result.requiresConfirmation = true;
  if (isOverride || isSharonOverride) {
    result.valid = true;
  }

  return result;
}

export function getWaitingCombatantsByTeam({
  entries = [],
  completedCombatantIds = [],
  getRepresentativeIdFor = (id) => id,
  getCombatantTeam = () => 'ally',
} = {}) {
  const waiting = { ally: [], enemy: [] };
  const completed = toStringSet(completedCombatantIds);
  const seen = new Set();
  const source = Array.isArray(entries) ? entries : [];

  source.forEach((entry) => {
    if (!entry || typeof entry.id !== 'string') {
      return;
    }

    const representativeId = normalizeId(getRepresentativeIdFor(entry.id));
    const targetId = representativeId || entry.id;
    if (seen.has(targetId)) {
      return;
    }
    seen.add(targetId);

    if (completed.has(targetId)) {
      return;
    }

    const team = normalizeCombatTeam(getCombatantTeam(targetId));
    if (team === 'ally') {
      waiting.ally.push(targetId);
    } else {
      waiting.enemy.push(targetId);
    }
  });

  return waiting;
}

export function pickNextCombatantId({ waiting = null, preferredTeams = [] } = {}) {
  const pools = waiting && typeof waiting === 'object' ? waiting : { ally: [], enemy: [] };
  const order = Array.isArray(preferredTeams) ? preferredTeams : [];

  for (const candidate of order) {
    const team = normalizeCombatTeam(candidate);
    const pool = Array.isArray(pools[team]) ? pools[team] : [];
    if (pool.length) {
      return { combatantId: pool[0], currentTurnTeam: team };
    }
  }

  if (Array.isArray(pools.ally) && pools.ally.length) {
    return { combatantId: pools.ally[0], currentTurnTeam: 'ally' };
  }

  if (Array.isArray(pools.enemy) && pools.enemy.length) {
    return { combatantId: pools.enemy[0], currentTurnTeam: 'enemy' };
  }

  return { combatantId: null, currentTurnTeam: null };
}

export function completeCombatantTurnState({
  activeCombatantId = null,
  completedCombatantIds = [],
  roundTurnCount = 0,
  getRepresentativeIdFor = (id) => id,
  getCombatantTeam = () => null,
} = {}) {
  const activeId = normalizeId(activeCombatantId);
  if (!activeId) {
    return {
      completed: false,
      finishedId: null,
      finishedTeam: null,
      nextTeam: null,
      preferredTeams: [],
      completedCombatantIds: uniqueStringList(completedCombatantIds),
      roundTurnCount: toNonNegativeNumber(roundTurnCount),
    };
  }

  const representativeId = normalizeId(getRepresentativeIdFor(activeId)) || activeId;
  const rawTeam = getCombatantTeam(representativeId);
  const finishedTeam = typeof rawTeam === 'string' && rawTeam.trim()
    ? normalizeCombatTeam(rawTeam)
    : null;
  const nextTeam = finishedTeam === 'ally' ? 'enemy' : 'ally';
  const completedIds = uniqueStringList([...iterableToArray(completedCombatantIds), representativeId]);

  return {
    completed: true,
    finishedId: representativeId,
    finishedTeam,
    nextTeam,
    preferredTeams: [nextTeam, finishedTeam],
    completedCombatantIds: completedIds,
    roundTurnCount: toNonNegativeNumber(roundTurnCount) + 1,
  };
}

export function advanceCombatRoundState({
  combatActive = false,
  combatRound = 0,
  startingTeam = null,
  currentTeam = null,
} = {}) {
  if (!combatActive) {
    return {
      advanced: false,
      round: toNonNegativeNumber(combatRound),
      currentTeam,
      preferredTeams: [],
      roundTurnCount: 0,
      completedCombatantIds: [],
      activeCombatantId: null,
    };
  }

  const nextRound = Math.max(1, toNonNegativeNumber(combatRound) + 1);
  const preferredTeam = normalizeCombatTeam(startingTeam ?? currentTeam ?? 'ally');
  const secondaryTeam = preferredTeam === 'ally' ? 'enemy' : 'ally';

  return {
    advanced: true,
    round: nextRound,
    currentTeam: preferredTeam,
    preferredTeams: [preferredTeam, secondaryTeam],
    roundTurnCount: 0,
    completedCombatantIds: [],
    activeCombatantId: null,
  };
}

function normalizeId(value) {
  return typeof value === 'string' && value ? value : null;
}

function toStringSet(values) {
  if (values instanceof Set) {
    return values;
  }

  if (!values || typeof values === 'string' || typeof values[Symbol.iterator] !== 'function') {
    return new Set();
  }

  return new Set(
    Array.from(values).filter((value) => typeof value === 'string' && value.length > 0)
  );
}

function uniqueStringList(values) {
  const seen = new Set();
  const result = [];

  iterableToArray(values).forEach((value) => {
    if (typeof value !== 'string') {
      return;
    }

    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) {
      return;
    }

    seen.add(trimmed);
    result.push(trimmed);
  });

  return result;
}

function iterableToArray(values) {
  if (!values || typeof values === 'string' || typeof values[Symbol.iterator] !== 'function') {
    return [];
  }
  return Array.from(values);
}

function toNonNegativeNumber(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.trunc(parsed));
}
