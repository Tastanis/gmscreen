const RIDER_TIMINGS = new Set(['turnStart', 'turnEnd']);
const RIDER_TARGETS = new Set(['bearer', 'source']);
const SUPPORTED_EFFECT_KINDS = new Set([
  'damage',
  'heal',
  'temporaryStamina',
  'surgeGain',
  'condition',
  'floatingText',
  'note',
  'other',
]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function slug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function stableHash(value) {
  const text = String(value || '');
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

// Zone tags as the map writes them: lower case, letters, digits, "-" and "_".
function zoneTag(value) {
  return String(value == null ? '' : value).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * A rider may name a terrain zone its bearer must be in for it to do anything:
 * { tags: ['blood'], adjacent?: true }. Accepts { tag }, { tags } or just "blood". Null when absent.
 */
export function normalizeRiderZone(value) {
  if (value == null || value === false) return null;
  const source = typeof value === 'string' ? { tag: value } : value;
  if (!source || typeof source !== 'object') return null;
  const raw = Array.isArray(source.tags) ? source.tags : source.tag != null ? [source.tag] : [];
  const tags = [...new Set(raw.map(zoneTag).filter(Boolean))];
  if (!tags.length) return null;
  return source.adjacent === true ? { tags, adjacent: true } : { tags };
}

/**
 * Whether a zone-bound rider acts this turn. `tags` is what the board says the bearer stands in
 * (or in and next to, for an adjacent rider), or null when the board cannot say.
 *   no zone on the rider      -> acts
 *   board cannot say          -> acts, flagged `unknown` so the table is told the condition
 *   bearer in one of the tags -> acts
 *   otherwise                 -> `skip`
 * `where` reads "in blood" or "in or next to blood or water".
 */
export function riderZoneVerdict(rider, tags) {
  const zone = normalizeRiderZone(rider?.zone);
  if (!zone) return { skip: false, unknown: false, where: '' };
  const where = `${zone.adjacent ? 'in or next to' : 'in'} ${zone.tags.join(' or ')}`;
  if (!Array.isArray(tags)) return { skip: false, unknown: true, where };
  const have = tags.map((tag) => String(tag).trim().toLowerCase());
  return { skip: !zone.tags.some((tag) => have.includes(tag)), unknown: false, where };
}

export function normalizeStoredConditionRiders(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const output = [];
  value.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object') return;
    const when = RIDER_TIMINGS.has(raw.when) ? raw.when : '';
    const effects = Array.isArray(raw.effects)
      ? raw.effects.filter((effect) => (
        effect
        && typeof effect === 'object'
        && SUPPORTED_EFFECT_KINDS.has(effect.kind)
        && !effect.damageTypeOptions
        && !effect.attribute
        && !effect.recoveries
        && !effect.amountFrom
      )).map(clone)
      : [];
    if (!when || !effects.length) return;
    const target = RIDER_TARGETS.has(raw.target) ? raw.target : 'bearer';
    const id = slug(raw.id) || `rider-${index + 1}`;
    if (seen.has(id)) return;
    seen.add(id);
    const rider = { id, when, target, effects };
    if (typeof raw.label === 'string' && raw.label.trim()) rider.label = raw.label.trim();
    const zone = normalizeRiderZone(raw.zone);
    if (zone) rider.zone = zone;
    output.push(rider);
  });
  return output;
}

export function normalizeRiderExecutions(value, validRiderIds = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const valid = new Set(validRiderIds);
  const output = {};
  Object.entries(value).forEach(([key, boundary]) => {
    if (!valid.has(key) || typeof boundary !== 'string' || !boundary.trim()) return;
    output[key] = boundary.trim().slice(0, 240);
  });
  return output;
}

export function createConditionInstanceId(condition, occurrence = 0) {
  const seed = JSON.stringify({
    name: condition?.name || '',
    duration: condition?.duration || null,
    sourceId: condition?.sourceId || '',
    sourceName: condition?.sourceName || '',
    sourceAbility: condition?.sourceAbility || '',
    riders: condition?.riders || [],
    occurrence,
  });
  return `condition-${slug(condition?.name) || 'effect'}-${stableHash(seed)}`;
}

export function createNewConditionInstanceId(condition) {
  const prefix = slug(condition?.name) || 'effect';
  if (globalThis.crypto?.randomUUID) return `condition-${prefix}-${globalThis.crypto.randomUUID()}`;
  return `condition-${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function buildConditionIdentityKey(condition) {
  const instanceId = typeof condition?.instanceId === 'string' ? condition.instanceId.trim() : '';
  if (instanceId) return `instance|${instanceId}`;
  const name = String(condition?.name || '').trim().toLowerCase();
  const type = String(condition?.duration?.type || 'save-ends').trim().toLowerCase();
  const sourceId = String(condition?.sourceId || '').trim().toLowerCase();
  const sourceAbility = String(condition?.sourceAbility || '').trim().toLowerCase();
  const riderSignature = JSON.stringify(condition?.riders || condition?.rider || null);
  return `${name}|${type}|${sourceId}|${sourceAbility}|${riderSignature}`;
}

export function buildConditionRiderBoundaryKey({
  encounterId = '',
  turnLockId = '',
  combatantId = '',
  round = 0,
  roundTurnCount = 0,
  when = '',
} = {}) {
  return [
    String(encounterId || 'encounter'),
    String(turnLockId || `round-${round}-turn-${roundTurnCount}`),
    String(combatantId || ''),
    String(when || ''),
  ].join('|');
}

export function getPendingConditionRiders(condition, when, boundaryKey) {
  const riders = normalizeStoredConditionRiders(condition?.riders);
  const executions = normalizeRiderExecutions(condition?.riderExecutions, riders.map((rider) => rider.id));
  return riders.filter((rider) => rider.when === when && executions[rider.id] !== boundaryKey);
}

export function markConditionRiderExecuted(condition, riderId, boundaryKey) {
  const riders = normalizeStoredConditionRiders(condition?.riders);
  const executions = normalizeRiderExecutions(condition?.riderExecutions, riders.map((rider) => rider.id));
  executions[riderId] = boundaryKey;
  return { ...condition, riderExecutions: executions };
}

export function formatConditionRider(rider) {
  if (!rider || typeof rider !== 'object') return '';
  const timing = rider.when === 'turnEnd' ? 'at end of turn' : 'at start of turn';
  const effects = Array.isArray(rider.effects) ? rider.effects : [];
  const parts = effects.map((effect) => {
    const amount = Number.parseInt(effect?.amount, 10) || 0;
    const damageType = String(effect?.damageType || '').trim();
    if (effect?.kind === 'damage') return `takes ${amount}${damageType ? ` ${damageType}` : ''} damage`;
    if (effect?.kind === 'heal') return `recovers ${amount} stamina`;
    if (effect?.kind === 'temporaryStamina') return `gains ${amount} temporary stamina`;
    if (effect?.kind === 'condition') return `gains ${effect.name || 'a condition'}`;
    if (effect?.kind === 'surgeGain') return `${amount >= 0 ? 'gains' : 'loses'} ${Math.abs(amount)} surge${Math.abs(amount) === 1 ? '' : 's'}`;
    return String(effect?.text || '').trim();
  }).filter(Boolean);
  const zone = normalizeRiderZone(rider.zone);
  const where = zone ? ` while ${zone.adjacent ? 'in or next to' : 'in'} ${zone.tags.join(' or ')}` : '';
  return parts.length ? `${parts.join(', ')} ${timing}${where}` : '';
}
