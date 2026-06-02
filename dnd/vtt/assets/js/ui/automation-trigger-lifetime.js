const LIFETIME_EVENTS = new Set(['turnStart', 'turnEnd', 'roundStart', 'roundEnd', 'combatStart', 'combatEnd']);

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeTriggerLifetime(input = {}) {
  if (!input || typeof input !== 'object') return null;
  const event = normalizeString(input.event);
  if (!LIFETIME_EVENTS.has(event)) return null;
  const whose = normalizeString(input.whose) || 'any';
  const count = Math.max(1, Math.trunc(Number(input.count) || 1));
  return {
    event,
    whose,
    count,
    skipCurrent: input.skipCurrent === true,
  };
}

export function createTriggerLifetimeState(lifetime, context = {}) {
  const normalized = normalizeTriggerLifetime(lifetime);
  if (!normalized) return null;
  return {
    ...normalized,
    seen: 0,
    skippedCurrent: false,
    registeredRound: Math.max(0, Math.trunc(Number(context.round) || 0)),
    registeredActiveCombatantId: normalizeString(context.activeCombatantId),
  };
}

export function lifetimeBoundaryMatches(entry = {}, payload = {}, env = {}) {
  const lifetime = entry.lifetimeState || createTriggerLifetimeState(entry.expires || entry.lifetime, env);
  if (!lifetime || lifetime.event !== payload?.eventType) return false;
  const whose = lifetime.whose || 'any';
  if (whose === 'any') return true;
  if (whose === 'self') return Boolean(entry.tokenId && payload.placementId === entry.tokenId);
  if (whose === 'target') {
    const ids = Array.isArray(entry.targetIds) ? entry.targetIds : [];
    return Boolean(payload.placementId && ids.includes(payload.placementId));
  }
  if (whose === 'ally' || whose === 'enemy') {
    const getTeamForPlacementId = typeof env.getTeamForPlacementId === 'function'
      ? env.getTeamForPlacementId
      : () => null;
    const casterTeam = entry.casterTeam || getTeamForPlacementId(entry.tokenId);
    const otherTeam = payload.team || getTeamForPlacementId(payload.placementId);
    if (!casterTeam || !otherTeam) return false;
    return whose === 'ally' ? casterTeam === otherTeam : casterTeam !== otherTeam;
  }
  return false;
}

export function shouldExpireTriggerEntry(entry = {}, payload = {}, env = {}) {
  const lifetime = entry.lifetimeState || createTriggerLifetimeState(entry.expires || entry.lifetime, env);
  if (!lifetime || !lifetimeBoundaryMatches({ ...entry, lifetimeState: lifetime }, payload, env)) {
    return false;
  }
  if (lifetime.skipCurrent && !lifetime.skippedCurrent) {
    const currentId = lifetime.registeredActiveCombatantId || env.activeCombatantId || '';
    if (currentId && payload.placementId === currentId) {
      lifetime.skippedCurrent = true;
      entry.lifetimeState = lifetime;
      return false;
    }
  }
  lifetime.seen += 1;
  entry.lifetimeState = lifetime;
  return lifetime.seen >= lifetime.count;
}

export function describeTriggerLifetime(lifetime) {
  const normalized = normalizeTriggerLifetime(lifetime);
  if (!normalized) return '';
  const who = normalized.whose === 'self'
    ? 'your'
    : normalized.whose === 'target'
      ? "the target's"
      : normalized.whose === 'ally'
        ? "an ally's"
        : normalized.whose === 'enemy'
          ? "an enemy's"
          : '';
  const eventText = normalized.event
    .replace(/([A-Z])/g, ' $1')
    .toLowerCase();
  const countText = normalized.count > 1 ? ` after ${normalized.count} matching boundaries` : '';
  return `Expires at ${who ? `${who} ` : ''}${eventText}${countText}.`;
}
