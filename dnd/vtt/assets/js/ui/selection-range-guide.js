function positiveInt(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function resolveSelectionRangeGuide(targetConfig = {}) {
  if (!targetConfig || typeof targetConfig !== 'object') return null;
  const explicit = targetConfig.selectionGuide && typeof targetConfig.selectionGuide === 'object'
    ? targetConfig.selectionGuide
    : null;
  const distance = explicit?.distance && typeof explicit.distance === 'object'
    ? explicit.distance
    : targetConfig.distance && typeof targetConfig.distance === 'object'
      ? targetConfig.distance
      : null;
  const form = String(explicit?.form || distance?.form || (targetConfig.mode === 'area' ? targetConfig.shape : 'ranged')).toLowerCase();
  if (form === 'self') return null;
  let range = positiveInt(explicit?.range);
  if (!range && distance) {
    range = positiveInt(distance.value);
    if (form === 'meleeorranged') range = Math.max(range, positiveInt(distance.secondary));
    if (['cube', 'line', 'wall', 'rectangle', 'area'].includes(form) || targetConfig.mode === 'area') {
      range = positiveInt(distance.within) || range;
    }
  }
  if (!range) range = positiveInt(targetConfig.range);
  if (!range) return null;
  return {
    range,
    form,
    enforce: false,
    sourcePlacement: explicit?.sourcePlacement || targetConfig.sourcePlacement || null,
  };
}
