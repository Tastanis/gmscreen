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
