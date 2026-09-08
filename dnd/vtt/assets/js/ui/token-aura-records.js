export function normalizeAutomationAuraId(value) {
  return String(value || '').trim();
}

export function createAutomationAuraId(automation = {}, payload = {}) {
  const explicit = normalizeAutomationAuraId(payload.auraId || payload.id || automation.id);
  if (explicit) return explicit;
  const abilityId = normalizeAutomationAuraId(automation.abilityId);
  const sourceId = normalizeAutomationAuraId(automation.sourceId || payload.placementId);
  const abilityName = normalizeAutomationAuraId(automation.abilityName || 'Aura')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return [sourceId, abilityId || abilityName || 'aura'].filter(Boolean).join(':');
}

export function cloneAutomationAuraRecord(record) {
  if (!record || typeof record !== 'object') return null;
  const automation = record.automation && typeof record.automation === 'object'
    ? record.automation
    : null;
  if (!automation) return null;
  const id = normalizeAutomationAuraId(record.id) || createAutomationAuraId(automation);
  return {
    id,
    enabled: record.enabled !== false,
    radius: Math.max(1, Math.min(20, Number.parseInt(record.radius, 10) || 1)),
    color: typeof record.color === 'string' && record.color ? record.color : '#3b82f6',
    automation,
    legacy: Boolean(record.legacy),
  };
}

export function getAutomationAuraRecords(placement, { includeDisabled = false } = {}) {
  if (!placement || typeof placement !== 'object') return [];
  const records = [];
  const manualAura = placement.aura && typeof placement.aura === 'object' ? placement.aura : null;
  if (manualAura?.automation && (includeDisabled || manualAura.enabled !== false)) {
    const legacyRecord = cloneAutomationAuraRecord({
      id: '__legacy__',
      enabled: manualAura.enabled !== false,
      radius: manualAura.radius,
      color: manualAura.color,
      automation: manualAura.automation,
      legacy: true,
    });
    if (legacyRecord) records.push(legacyRecord);
  }
  const stored = Array.isArray(placement.automationAuras) ? placement.automationAuras : [];
  stored.forEach((record) => {
    if (!includeDisabled && record?.enabled === false) return;
    const normalized = cloneAutomationAuraRecord(record);
    if (normalized) records.push(normalized);
  });
  return records;
}

export function getRenderableAurasForPlacement(placement) {
  if (!placement || typeof placement !== 'object') return [];
  const result = [];
  const manualAura = placement.aura && typeof placement.aura === 'object' ? placement.aura : null;
  if (manualAura?.enabled) {
    result.push({
      id: 'manual',
      radius: manualAura.radius,
      color: manualAura.color || '#3b82f6',
    });
  }
  getAutomationAuraRecords(placement).forEach((record) => {
    if (record.legacy && manualAura?.enabled) return;
    result.push({
      id: `automation:${record.id}`,
      radius: record.radius,
      color: record.color,
    });
  });
  return result;
}
