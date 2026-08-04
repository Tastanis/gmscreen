export function getAutomationMoveRangePresentation({ verbLabel = 'Move', distance = 0 } = {}) {
  const normalizedVerb = typeof verbLabel === 'string' && verbLabel.trim()
    ? verbLabel.trim()
    : 'Move';
  const normalizedDistance = Math.max(0, Math.trunc(Number(distance) || 0));
  return {
    kind: normalizedVerb.toLowerCase() === 'teleport' ? 'teleport' : 'movement',
    label: `${normalizedVerb}: up to ${normalizedDistance} square${normalizedDistance === 1 ? '' : 's'}`,
  };
}
