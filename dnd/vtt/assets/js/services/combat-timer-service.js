const DEFAULT_UNKNOWN_PLAYER_LABEL = 'Unknown Player';

function formatDisplayName(name) {
  if (!name) {
    return DEFAULT_UNKNOWN_PLAYER_LABEL;
  }
  const trimmed = name.trim();
  if (!trimmed) {
    return DEFAULT_UNKNOWN_PLAYER_LABEL;
  }
  if (trimmed.toUpperCase() === 'GM') {
    return 'GM';
  }
  return trimmed
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

const VALID_ROLES = new Set(['gm', 'player', 'pc', 'ally']);

function normalizeRole(role) {
  if (role === 'gm') {
    return 'gm';
  }
  if (role === 'pc') {
    return 'pc';
  }
  if (role === 'ally') {
    return 'ally';
  }
  return 'player';
}

function createParticipant(id, { name = DEFAULT_UNKNOWN_PLAYER_LABEL, role = 'player' } = {}) {
  return {
    id,
    name: formatDisplayName(name),
    role: normalizeRole(role),
    totalMs: 0,
    longestTurnMs: 0,
    longestTurnRound: null,
    perRound: new Map(),
  };
}

function cloneParticipantSummary(participant, totalDurationMs) {
  const perRound = Array.from(participant.perRound.entries())
    .map(([round, entry]) => ({
      round: Number(round),
      totalMs: entry.totalMs,
      longestTurnMs: entry.longestTurnMs,
      turns: entry.turns.slice(),
    }))
    .sort((a, b) => a.round - b.round);

  const percentage = totalDurationMs > 0 ? (participant.totalMs / totalDurationMs) * 100 : 0;

  return {
    id: participant.id,
    name: participant.name,
    role: participant.role,
    totalMs: participant.totalMs,
    percentage,
    longestTurnMs: participant.longestTurnMs,
    longestTurnRound: participant.longestTurnRound,
    perRound,
  };
}

function mapToSortedArray(map) {
  return Array.from(map.entries())
    .map(([round, durationMs]) => ({ round: Number(round), durationMs }))
    .sort((a, b) => a.round - b.round);
}

export function createCombatTimerService({ now = () => Date.now() } = {}) {
  const initialState = () => ({
    combatActive: false,
    startedAt: null,
    endedAt: null,
    currentRound: 0,
    highestRound: 0,
    waiting: {
      ally: null,
      enemy: null,
    },
    waitingTotals: new Map(),
    enemyWaitingTotals: new Map(),
    participants: new Map(),
    activeTurn: null,
    lastSummary: null,
  });

  let state = initialState();

  function reset() {
    state = initialState();
  }

  function ensureParticipant(id, { name, role } = {}) {
    const key = typeof id === 'string' && id ? id : 'unknown';
    const normalizedRole = normalizeRole(role);
    if (!state.participants.has(key)) {
      state.participants.set(key, createParticipant(key, { name, role: normalizedRole }));
    }
    const participant = state.participants.get(key);
    if (name && name.trim() && participant.name !== name) {
      participant.name = formatDisplayName(name);
    }
    if (VALID_ROLES.has(normalizedRole)) {
      participant.role = normalizedRole;
    }
    return participant;
  }

  function registerRoundUsage(round) {
    const roundNumber = Math.max(1, Number(round) || state.currentRound || 1);
    state.currentRound = roundNumber;
    state.highestRound = Math.max(state.highestRound, roundNumber);
    return roundNumber;
  }

  function startCombat({ round = 1, startedAt } = {}) {
    reset();
    const timestamp = Number.isFinite(startedAt) ? Math.max(0, startedAt) : now();
    state.startedAt = timestamp;
    state.combatActive = true;
    state.currentRound = Math.max(1, Number(round) || 1);
    state.highestRound = state.currentRound;
  }

  function updateRound(round) {
    if (!state.combatActive) {
      state.currentRound = Math.max(1, Number(round) || state.currentRound || 1);
      state.highestRound = Math.max(state.highestRound, state.currentRound);
      return;
    }
    registerRoundUsage(round);
  }

  function stopWaiting(team, timestamp = now()) {
    const key = team === 'enemy' ? 'enemy' : 'ally';
    const entry = state.waiting[key];
    if (!entry) {
      return 0;
    }
    const duration = Math.max(0, timestamp - entry.startedAt);
    if (key === 'ally') {
      const current = state.waitingTotals.get(entry.round) || 0;
      state.waitingTotals.set(entry.round, current + duration);
    } else {
      const current = state.enemyWaitingTotals.get(entry.round) || 0;
      state.enemyWaitingTotals.set(entry.round, current + duration);
    }
    state.waiting[key] = null;
    return duration;
  }

  function startWaiting({ team, round = state.currentRound, combatantId } = {}) {
    if (!state.combatActive) {
      return;
    }
    const key = team === 'enemy' ? 'enemy' : team === 'ally' ? 'ally' : null;
    if (!key) {
      return;
    }
    const timestamp = now();
    const roundNumber = registerRoundUsage(round);
    const normalizedCombatant = combatantId || null;
    const existing = state.waiting[key];
    if (
      existing &&
      existing.combatantId === normalizedCombatant &&
      existing.round === roundNumber
    ) {
      return;
    }
    stopWaiting(key, timestamp);
    state.waiting[key] = {
      startedAt: timestamp,
      round: roundNumber,
      combatantId: normalizedCombatant,
    };
  }

  function clearWaiting(timestamp = now()) {
    stopWaiting('ally', timestamp);
    stopWaiting('enemy', timestamp);
  }

  function startTurn({
    userId,
    displayName,
    team,
    round = state.currentRound,
    combatantId = null,
    role = 'player',
    startedAt,
  } = {}) {
    if (!state.combatActive) {
      return;
    }
    const timestamp = Number.isFinite(startedAt) ? Math.max(0, startedAt) : now();
    const normalizedTeam = team === 'enemy' ? 'enemy' : 'ally';
    const roundNumber = registerRoundUsage(round);
    stopWaiting(normalizedTeam, timestamp);
    if (state.activeTurn) {
      endTurn({ timestamp });
    }
    const participantId = normalizedTeam === 'enemy' ? 'gm' : userId || combatantId || 'unknown';
    const participantRole = normalizedTeam === 'enemy' ? 'gm' : role || 'player';
    const participant = ensureParticipant(participantId, {
      name: displayName,
      role: participantRole,
    });
    state.activeTurn = {
      userId: participant.id,
      name: participant.name,
      role: participant.role,
      startedAt: timestamp,
      round: roundNumber,
      team: normalizedTeam,
      combatantId,
    };
  }

  function endTurn({ timestamp = now() } = {}) {
    if (!state.activeTurn) {
      return 0;
    }
    const active = state.activeTurn;
    const duration = Math.max(0, timestamp - active.startedAt);
    const participant = ensureParticipant(active.userId, {
      name: active.name,
      role: active.role,
    });
    participant.totalMs += duration;
    const roundKey = registerRoundUsage(active.round);
    if (!participant.perRound.has(roundKey)) {
      participant.perRound.set(roundKey, {
        totalMs: 0,
        longestTurnMs: 0,
        turns: [],
      });
    }
    const roundEntry = participant.perRound.get(roundKey);
    roundEntry.totalMs += duration;
    roundEntry.turns.push(duration);
    if (duration > roundEntry.longestTurnMs) {
      roundEntry.longestTurnMs = duration;
    }
    if (duration > participant.longestTurnMs) {
      participant.longestTurnMs = duration;
      participant.longestTurnRound = roundKey;
    }
    state.activeTurn = null;
    return duration;
  }

  function buildSummary({ endedAt } = {}) {
    if (!state.startedAt) {
      return null;
    }
    const timestamp = Number.isFinite(endedAt) ? Math.max(0, endedAt) : now();
    const totalDurationMs = Math.max(0, timestamp - state.startedAt);
    const waitingByRound = mapToSortedArray(state.waitingTotals);
    const enemyWaitingByRound = mapToSortedArray(state.enemyWaitingTotals);
    const participants = Array.from(state.participants.values()).map((participant) =>
      cloneParticipantSummary(participant, totalDurationMs)
    );
    const pcs = participants
      .filter((participant) => participant.role === 'pc' || participant.role === 'player')
      .sort((a, b) => b.totalMs - a.totalMs);
    const allies = participants
      .filter((participant) => participant.role === 'ally')
      .sort((a, b) => b.totalMs - a.totalMs);
    const gm = participants.find((participant) => participant.role === 'gm') || null;
    const highestRound = Math.max(
      state.highestRound,
      ...waitingByRound.map((entry) => entry.round),
      ...enemyWaitingByRound.map((entry) => entry.round),
      ...participants.flatMap((participant) => participant.perRound.map((round) => round.round))
    );
    const decisionTotalMs = waitingByRound.reduce((sum, entry) => sum + entry.durationMs, 0);
    const playerTotalMs = pcs.reduce((sum, participant) => sum + participant.totalMs, 0);
    const allyTotalMs = allies.reduce((sum, participant) => sum + participant.totalMs, 0);
    const gmTotalMs = gm?.totalMs ?? 0;

    return {
      startedAt: state.startedAt,
      endedAt: timestamp,
      totalDurationMs,
      highestRound,
      waitingByRound,
      enemyWaitingByRound,
      participants: {
        pcs,
        allies,
        gm,
        all: participants,
      },
      totals: {
        decisionMs: decisionTotalMs,
        playerMs: playerTotalMs,
        allyMs: allyTotalMs,
        gmMs: gmTotalMs,
      },
    };
  }

  function finishCombat({ endedAt } = {}) {
    if (!state.combatActive && !state.startedAt) {
      return state.lastSummary;
    }
    const timestamp = Number.isFinite(endedAt) ? Math.max(0, endedAt) : now();
    clearWaiting(timestamp);
    endTurn({ timestamp });
    state.endedAt = timestamp;
    state.combatActive = false;
    const summary = buildSummary({ endedAt: timestamp });
    state.lastSummary = summary;
    return summary;
  }

  return {
    startCombat,
    updateRound,
    startWaiting,
    stopWaiting,
    clearWaiting,
    startTurn,
    endTurn,
    finishCombat,
    reset,
    buildSummary,
  };
}

export default createCombatTimerService;
