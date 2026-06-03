const SCHEMA_ID = 'heroic-resource/v1';

const SUPPORTED_EVENTS = new Set([
  'combatStart',
  'combatEnd',
  'roundStart',
  'roundEnd',
  'turnStart',
  'turnEnd',
  'damage',
  'damageDealt',
  'forcedMovement',
  'forcedMovementDealt',
  'actionUsed',
  'powerRoll',
  'abilityTest',
  'abilityRoll',
]);

const LIMIT_SCOPES = new Set(['round', 'turn', 'encounter']);

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function asTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asInt(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeStringList(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => asTrimmedString(entry).toLowerCase()).filter(Boolean);
  }
  const text = asTrimmedString(value);
  return text ? [text.toLowerCase()] : [];
}

function normalizeEventName(value) {
  const raw = asTrimmedString(value);
  if (!raw) return '';
  const aliases = {
    combatstart: 'combatStart',
    combatend: 'combatEnd',
    roundstart: 'roundStart',
    roundend: 'roundEnd',
    turnstart: 'turnStart',
    turnend: 'turnEnd',
    damagedealt: 'damageDealt',
    forcedmovement: 'forcedMovement',
    forcedmovementdealt: 'forcedMovementDealt',
    actionused: 'actionUsed',
    powerroll: 'powerRoll',
    abilitytest: 'abilityTest',
    abilityroll: 'abilityRoll',
  };
  return aliases[raw.toLowerCase()] || raw;
}

function normalizeAmountSpec(input) {
  if (Number.isFinite(Number(input))) {
    return { amount: asInt(input, 0) };
  }
  const text = asTrimmedString(input);
  if (text) {
    if (/^\d+d\d+([+-]\d+)?$/i.test(text.replace(/\s+/g, ''))) {
      const compact = text.replace(/\s+/g, '').toLowerCase();
      const [, dice, bonus] = compact.match(/^(\d+d\d+)([+-]\d+)?$/i) || [];
      return { dice, bonus: asInt(bonus, 0) };
    }
    if (text.toLowerCase() === 'victories') {
      return { from: 'victories' };
    }
  }
  const source = asObject(input);
  if (!source) return { amount: 0 };
  const out = {};
  if (source.from) out.from = asTrimmedString(source.from);
  if (source.dice) out.dice = asTrimmedString(source.dice).toLowerCase();
  if (source.amount != null) out.amount = asInt(source.amount, 0);
  if (source.bonus != null) out.bonus = asInt(source.bonus, 0);
  if (Array.isArray(source.amountByLevel)) {
    out.amountByLevel = source.amountByLevel
      .map((entry) => {
        const item = asObject(entry);
        if (!item) return null;
        return {
          min: Math.max(0, asInt(item.min ?? item.level, 0)),
          amount: normalizeAmountSpec(item.amount ?? item.value ?? item),
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.min - b.min);
  }
  if (Array.isArray(source.bonusByLevel)) {
    out.bonusByLevel = source.bonusByLevel
      .map((entry) => {
        const item = asObject(entry);
        if (!item) return null;
        return {
          min: Math.max(0, asInt(item.min ?? item.level, 0)),
          bonus: asInt(item.bonus ?? item.amount, 0),
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.min - b.min);
  }
  return out;
}

function normalizeFilter(input) {
  const source = asObject(input) || {};
  const filter = {};
  const whose = asTrimmedString(source.whose || source.actor || '').toLowerCase();
  if (whose) filter.whose = whose;
  const targetWhose = asTrimmedString(source.targetWhose || '').toLowerCase();
  if (targetWhose) filter.targetWhose = targetWhose;
  const sourceWhose = asTrimmedString(source.sourceWhose || '').toLowerCase();
  if (sourceWhose) filter.sourceWhose = sourceWhose;
  if (source.withinSquares != null) filter.withinSquares = Math.max(0, asInt(source.withinSquares, 0));
  if (source.minDistance != null) filter.minDistance = Math.max(0, asInt(source.minDistance, 0));
  if (source.maxDistance != null) filter.maxDistance = Math.max(0, asInt(source.maxDistance, 0));
  if (source.minAmount != null) filter.minAmount = Math.max(0, asInt(source.minAmount, 0));
  if (source.maxAmount != null) filter.maxAmount = Math.max(0, asInt(source.maxAmount, 0));
  if (source.includesSurge != null) filter.includesSurge = Boolean(source.includesSurge);
  if (source.actionKind) filter.actionKind = asTrimmedString(source.actionKind).toLowerCase();
  if (source.costIncludes) filter.costIncludes = asTrimmedString(source.costIncludes).toLowerCase();
  if (source.verb) filter.verb = asTrimmedString(source.verb).toLowerCase();
  if (source.distanceTo) filter.distanceTo = asTrimmedString(source.distanceTo).toLowerCase();
  const keywordsAny = normalizeStringList(source.keywordsAny);
  if (keywordsAny.length) filter.keywordsAny = keywordsAny;
  const damageTypeAny = normalizeStringList(source.damageTypeAny ?? source.damageType);
  if (damageTypeAny.length) filter.damageTypeAny = damageTypeAny;
  const damageTypeNot = normalizeStringList(source.damageTypeNot);
  if (damageTypeNot.length) filter.damageTypeNot = damageTypeNot;
  return filter;
}

function normalizeLimit(input, ruleId) {
  const source = asObject(input);
  if (!source) return null;
  const scopeRaw = asTrimmedString(source.scope || source.per || 'round').toLowerCase();
  const scope = LIMIT_SCOPES.has(scopeRaw) ? scopeRaw : 'round';
  const key = asTrimmedString(source.key || source.id || ruleId);
  if (!key) return null;
  return {
    scope,
    key,
    target: asTrimmedString(source.target || 'self').toLowerCase() || 'self',
    markOn: asTrimmedString(source.markOn || 'offered').toLowerCase() === 'applied' ? 'applied' : 'offered',
  };
}

function normalizeEffect(input) {
  const source = asObject(input) || {};
  const kindRaw = asTrimmedString(source.kind || 'gain').toLowerCase();
  const kind = ['gain', 'set', 'lose', 'damage'].includes(kindRaw) ? kindRaw : 'gain';
  const amountSource = source.amount ?? source.value ?? 0;
  return {
    kind,
    amount: normalizeAmountSpec(amountSource),
  };
}

function normalizeRule(input, index, warnings) {
  const source = asObject(input);
  if (!source) return null;
  const id = asTrimmedString(source.id || source.key || `rule-${index + 1}`);
  const event = normalizeEventName(source.event || source.when);
  if (!event || !SUPPORTED_EVENTS.has(event)) {
    warnings.push(`rules[${index}].event: unsupported event "${source.event || source.when || ''}".`);
    return null;
  }
  const effect = normalizeEffect(source.effect || source);
  return {
    id,
    event,
    filter: normalizeFilter(source.filter),
    limit: normalizeLimit(source.limit || source.oncePer, id),
    effect,
    prompt: asTrimmedString(source.prompt),
    autoApply: source.autoApply === true,
    enabled: source.enabled !== false,
  };
}

export function normalizeHeroicResourceAutomation(input) {
  if (!input) {
    return { schema: SCHEMA_ID, rules: [], warnings: [] };
  }
  let source = input;
  const warnings = [];
  if (typeof input === 'string') {
    try {
      source = JSON.parse(input);
    } catch (error) {
      return { schema: SCHEMA_ID, rules: [], warnings: ['automation: invalid JSON.'] };
    }
  }
  if (!source || typeof source !== 'object') {
    return { schema: SCHEMA_ID, rules: [], warnings: ['automation: expected object.'] };
  }
  if (source.schema && source.schema !== SCHEMA_ID) {
    warnings.push(`schema: expected ${SCHEMA_ID}, got ${source.schema}.`);
  }
  const rawRules = Array.isArray(source.rules) ? source.rules : [];
  const rules = rawRules
    .map((rule, index) => normalizeRule(rule, index, warnings))
    .filter(Boolean);
  return { schema: SCHEMA_ID, rules, warnings };
}

export function hasHeroicResourceAutomation(input) {
  return normalizeHeroicResourceAutomation(input).rules.length > 0;
}

function rollDice(dice, random = Math.random) {
  const match = /^(\d+)d(\d+)$/i.exec(asTrimmedString(dice));
  if (!match) return { total: 0, rolls: [], label: '' };
  const count = Math.max(1, asInt(match[1], 1));
  const sides = Math.max(1, asInt(match[2], 1));
  const rolls = [];
  for (let i = 0; i < count; i += 1) {
    rolls.push(Math.floor(random() * sides) + 1);
  }
  return {
    total: rolls.reduce((sum, value) => sum + value, 0),
    rolls,
    label: `${dice}=${rolls.join('+')}`,
  };
}

function pickLevelEntry(entries, level) {
  if (!Array.isArray(entries) || !entries.length) return null;
  const heroLevel = Math.max(0, asInt(level, 0));
  return entries.reduce((best, entry) => {
    if (entry.min <= heroLevel && (!best || entry.min >= best.min)) return entry;
    return best;
  }, null);
}

export function resolveHeroicResourceAmount(spec, context = {}, random = Math.random) {
  const source = normalizeAmountSpec(spec);
  const levelEntry = pickLevelEntry(source.amountByLevel, context.level);
  if (levelEntry) {
    return resolveHeroicResourceAmount(levelEntry.amount, context, random);
  }
  let amount = 0;
  const labels = [];
  const from = asTrimmedString(source.from).toLowerCase();
  if (from === 'victories') {
    amount += Math.max(0, asInt(context.victories, 0));
    labels.push('Victories');
  }
  if (from === 'negativeresource' || from === 'negative-resource') {
    const currentResource = asInt(context.currentResource, 0);
    amount += Math.max(0, -currentResource);
    labels.push('negative resource');
  }
  if (source.amount != null) {
    amount += asInt(source.amount, 0);
  }
  if (source.dice) {
    const rolled = rollDice(source.dice, random);
    amount += rolled.total;
    if (rolled.label) labels.push(rolled.label);
  }
  amount += asInt(source.bonus, 0);
  const bonusEntry = pickLevelEntry(source.bonusByLevel, context.level);
  if (bonusEntry) {
    amount += asInt(bonusEntry.bonus, 0);
  }
  return { amount, label: labels.join(' + ') };
}

export function previewHeroicResourceAmount(spec, context = {}) {
  const source = normalizeAmountSpec(spec);
  const levelEntry = pickLevelEntry(source.amountByLevel, context.level);
  if (levelEntry) {
    return previewHeroicResourceAmount(levelEntry.amount, context);
  }
  let amount = 0;
  const labels = [];
  const from = asTrimmedString(source.from).toLowerCase();
  if (from === 'victories') {
    amount += Math.max(0, asInt(context.victories, 0));
    labels.push('Victories');
  }
  if (from === 'negativeresource' || from === 'negative-resource') {
    const currentResource = asInt(context.currentResource, 0);
    amount += Math.max(0, -currentResource);
    labels.push('negative resource');
  }
  if (source.amount != null) {
    amount += asInt(source.amount, 0);
  }
  const hasDice = Boolean(source.dice);
  if (source.dice) {
    labels.push(source.dice);
  }
  amount += asInt(source.bonus, 0);
  const bonusEntry = pickLevelEntry(source.bonusByLevel, context.level);
  if (bonusEntry) {
    amount += asInt(bonusEntry.bonus, 0);
  }
  return {
    amount,
    hasDice,
    label: labels.join(' + ') || String(amount),
  };
}

export function payloadPrimaryTokenId(event, payload) {
  if (!payload || typeof payload !== 'object') return '';
  if (event === 'damageDealt' || event === 'forcedMovementDealt') {
    return payload.sourceId || payload.casterId || payload.actorId || payload.tokenId || '';
  }
  if (event === 'powerRoll' || event === 'abilityTest' || event === 'abilityRoll' || event === 'actionUsed') {
    return payload.actorId || payload.placementId || payload.sourceId || payload.tokenId || '';
  }
  return payload.placementId || payload.targetId || payload.actorId || payload.newTargetId || payload.tokenId || '';
}

function payloadTargetIds(payload) {
  if (!payload || typeof payload !== 'object') return [];
  const ids = [];
  if (Array.isArray(payload.targetIds)) ids.push(...payload.targetIds);
  if (payload.targetId) ids.push(payload.targetId);
  if (payload.placementId) ids.push(payload.placementId);
  return [...new Set(ids.filter(Boolean))];
}

function normalizeKeywords(value) {
  return Array.isArray(value) ? value.map((item) => String(item).toLowerCase()) : [];
}

function matchesWhose(whose, tokenId, env) {
  if (!whose || whose === 'any') return true;
  if (!tokenId) return false;
  if (whose === 'self') return tokenId === env.casterId;
  if (whose === 'judgedtarget') return env.getJudgedTargetForSource?.(env.casterId, 'judgment')?.id === tokenId;
  if (whose === 'marksource') {
    const mark = env.getPlacementMark?.(env.getPlacementFromStore?.(tokenId), 'judgment');
    return mark?.sourceId === env.casterId;
  }
  const otherTeam = env.getTeamForPlacementId?.(tokenId);
  if (whose === 'ally') return Boolean(otherTeam && env.casterTeam && otherTeam === env.casterTeam);
  if (whose === 'enemy') return Boolean(otherTeam && env.casterTeam && otherTeam !== env.casterTeam);
  return false;
}

function resolveDistanceTargetId(filter, event, payload) {
  const mode = filter.distanceTo || 'eventtarget';
  if (mode === 'eventsource' || mode === 'source') return payload?.sourceId || payload?.actorId || '';
  if (mode === 'actor') return payload?.actorId || payload?.sourceId || payload?.placementId || '';
  if (mode === 'self') return payload?.casterId || payload?.sourceId || '';
  if (event === 'damageDealt' || event === 'forcedMovementDealt') {
    return payload?.targetId || payload?.placementId || '';
  }
  return payload?.placementId || payload?.targetId || payload?.newTargetId || payload?.actorId || '';
}

export function ruleMatchesHeroicResourceEvent(rule, eventType, payload = {}, env = {}) {
  if (!rule?.enabled || rule.event !== eventType) return false;
  const filter = rule.filter || {};
  const primaryId = payloadPrimaryTokenId(eventType, payload);
  if (!matchesWhose(filter.whose || 'any', primaryId, env)) return false;
  if (filter.sourceWhose) {
    const sourceId = payload?.sourceId || payload?.actorId || payload?.casterId || '';
    if (!matchesWhose(filter.sourceWhose, sourceId, env)) return false;
  }
  if (filter.targetWhose) {
    const targets = payloadTargetIds(payload);
    if (!targets.length || !targets.some((id) => matchesWhose(filter.targetWhose, id, env))) return false;
  }
  if (filter.withinSquares != null && typeof env.getSquareDistance === 'function') {
    const otherId = resolveDistanceTargetId(filter, eventType, payload);
    const distance = env.getSquareDistance(env.casterId, otherId);
    if (!Number.isFinite(distance) || distance > filter.withinSquares) return false;
  }
  const amount = asInt(payload.amount, 0);
  if (filter.minAmount != null && amount < filter.minAmount) return false;
  if (filter.maxAmount != null && amount > filter.maxAmount) return false;
  const moved = asInt(payload.distance ?? payload.movedDistance, 0);
  if (filter.minDistance != null && moved < filter.minDistance) return false;
  if (filter.maxDistance != null && moved > filter.maxDistance) return false;
  const damageType = asTrimmedString(payload.damageType).toLowerCase() || 'untyped';
  if (filter.damageTypeAny?.length && !filter.damageTypeAny.includes(damageType)) return false;
  if (filter.damageTypeNot?.length && filter.damageTypeNot.includes(damageType)) return false;
  if (filter.includesSurge != null) {
    const includesSurge = Boolean(payload.includesSurge || payload.surgeSpent || payload.surgeCount);
    if (includesSurge !== filter.includesSurge) return false;
  }
  if (filter.actionKind && asTrimmedString(payload.actionKind).toLowerCase() !== filter.actionKind) return false;
  if (filter.costIncludes && !String(payload.cost || payload.resourceCost || '').toLowerCase().includes(filter.costIncludes)) return false;
  if (filter.verb && asTrimmedString(payload.verb).toLowerCase() !== filter.verb) return false;
  if (filter.keywordsAny?.length) {
    const have = normalizeKeywords(payload.keywords);
    if (!filter.keywordsAny.some((keyword) => have.includes(keyword))) return false;
  }
  return true;
}

export function formatHeroicResourcePrompt(template, values = {}) {
  const text = template || '{action} {amount} {resource}: {reason}.';
  return text.replace(/\{(\w+)\}/g, (_match, key) => {
    const value = values[key];
    return value === null || value === undefined ? '' : String(value);
  });
}

export { SCHEMA_ID as HEROIC_RESOURCE_SCHEMA_ID };
