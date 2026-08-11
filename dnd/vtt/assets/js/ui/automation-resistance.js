function toNonNegativeInt(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export function resolveIgnoredResistance(total, ignored) {
  const normalizedTotal = toNonNegativeInt(total);
  const normalizedIgnored = ignored === true || String(ignored || '').trim().toLowerCase() === 'all'
    ? normalizedTotal
    : Math.min(normalizedTotal, toNonNegativeInt(ignored));
  return {
    total: normalizedTotal,
    ignored: normalizedIgnored,
    applied: Math.max(0, normalizedTotal - normalizedIgnored),
  };
}

export function resolveAutomationDamageAmount({
  amount = 0,
  vulnerability = 0,
  immunity = 0,
  ignoreImmunity = false,
} = {}) {
  const immunityResult = resolveIgnoredResistance(immunity, ignoreImmunity);
  const normalizedAmount = toNonNegativeInt(amount);
  const normalizedVulnerability = toNonNegativeInt(vulnerability);
  return {
    amount: Math.max(0, normalizedAmount + normalizedVulnerability - immunityResult.applied),
    originalAmount: normalizedAmount,
    vulnerability: normalizedVulnerability,
    immunity: immunityResult.applied,
    ignoredImmunity: immunityResult.ignored,
    totalImmunity: immunityResult.total,
  };
}

export function resolveAutomationForcedMovementDistance({
  distance = 0,
  stability = 0,
  sizePenalty = 0,
  ignoreStability = false,
  ignoreSizePenalty = false,
} = {}) {
  const stabilityResult = resolveIgnoredResistance(stability, ignoreStability);
  const sizeResult = resolveIgnoredResistance(sizePenalty, ignoreSizePenalty);
  const requestedDistance = toNonNegativeInt(distance);
  return {
    distance: Math.max(0, requestedDistance - stabilityResult.applied - sizeResult.applied),
    requestedDistance,
    stability: stabilityResult.applied,
    ignoredStability: stabilityResult.ignored,
    sizePenalty: sizeResult.applied,
    ignoredSizePenalty: sizeResult.ignored,
  };
}
