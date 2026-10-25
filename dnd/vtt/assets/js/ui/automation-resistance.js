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

// Weakness first, then immunity (Draw Steel). `immunity` may be "all": every point of that damage is ignored
// (unless `ignoreImmunity` is true / "all"; a number ignores that much of it).
export function resolveAutomationDamageAmount({
  amount = 0,
  vulnerability = 0,
  immunity = 0,
  ignoreImmunity = false,
} = {}) {
  const normalizedAmount = toNonNegativeInt(amount);
  const normalizedVulnerability = toNonNegativeInt(vulnerability);
  const raised = normalizedAmount + normalizedVulnerability;
  const immunityAll = String(immunity).trim().toLowerCase() === 'all';
  const immunityResult = resolveIgnoredResistance(immunityAll ? raised : immunity, ignoreImmunity);
  return {
    amount: Math.max(0, raised - immunityResult.applied),
    originalAmount: normalizedAmount,
    vulnerability: normalizedVulnerability,
    immunity: immunityResult.applied,
    ignoredImmunity: immunityResult.ignored,
    totalImmunity: immunityResult.total,
    ...(immunityAll ? { immunityAll: true } : {}),
  };
}

// ---------- damage immunity and weakness: where they come from, which one counts ----------
// An entry: { kind: "immunity" | "weakness", type: "" (all damage) | "fire"..., value: number | "all",
// stacks?: true, source?: "stat block" | "sheet" | a condition's label }.
// Draw Steel: only the highest immunity (and the highest weakness) that fits the damage counts. An entry with
// `stacks: true` adds to it instead ("fire immunity equal to your level, added to any other fire immunity").

const ALL_TYPES = new Set(['', 'all', 'any', 'untyped', 'generic', 'damage']);

function cleanType(value) {
  const text = String(value ?? '').trim().toLowerCase();
  return ALL_TYPES.has(text) ? '' : text;
}

export function parseDefenseValue(value) {
  if (String(value ?? '').trim().toLowerCase() === 'all') return 'all';
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

// One line of a hero sheet's immunity / weakness list: "fire 5", "fire immunity 5", "5" (all damage),
// "fire all", "all 3", "+fire 2" (adds to the highest instead of competing with it).
export function parseDefenseText(text) {
  let line = String(text ?? '').trim().toLowerCase();
  if (!line) return null;
  let stacks = false;
  if (line.startsWith('+')) { stacks = true; line = line.slice(1).trim(); }
  const match = line.match(/^(.*?)\s*\b(all|\d+)\s*$/);
  if (!match) return null;
  const value = parseDefenseValue(match[2]);
  if (!value) return null;
  const type = match[1]
    .replace(/\b(damage|immunity|immune|weakness|weak|vulnerability|vulnerable|to)\b/g, ' ')
    .replace(/[^a-z\s-]/g, ' ').trim().replace(/\s+/g, ' ');
  return { type: cleanType(type), value, ...(stacks ? { stacks: true } : {}) };
}

export function defenseEntriesFromList(list, kind, source = 'sheet') {
  const lines = Array.isArray(list) ? list : typeof list === 'string' ? list.split(/[\n,;]+/) : [];
  return lines.flatMap((entry) => {
    const text = typeof entry === 'string' ? entry : entry && typeof entry === 'object' ? String(entry.name ?? entry.label ?? entry.value ?? '') : '';
    const parsed = parseDefenseText(text);
    return parsed ? [{ kind, source, ...parsed }] : [];
  });
}

export function defenseEntriesFromMonster(monster, kind) {
  if (!monster || typeof monster !== 'object') return [];
  const defenses = monster.defenses && typeof monster.defenses === 'object' ? monster.defenses : {};
  const listKey = kind === 'immunity' ? 'immunities' : 'weaknesses';
  const raw = [];
  if (Array.isArray(defenses[listKey])) raw.push(...defenses[listKey]);
  if (Array.isArray(monster[listKey])) raw.push(...monster[listKey]);
  if (!raw.length) {
    if (defenses[kind] && typeof defenses[kind] === 'object') raw.push(defenses[kind]);
    else if (monster[`${kind}_type`] || monster[`${kind}_value`] || monster[`${kind}Type`] || monster[`${kind}Value`]) {
      raw.push({ type: monster[`${kind}_type`] ?? monster[`${kind}Type`] ?? '', value: monster[`${kind}_value`] ?? monster[`${kind}Value`] ?? 0 });
    }
  }
  const seen = new Set();
  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const value = parseDefenseValue(entry.value ?? entry.amount);
    if (!value) return [];
    const type = cleanType(entry.type ?? entry.damageType);
    const key = `${type}|${value}|${entry.stacks === true}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ kind, type, value, source: 'stat block', ...(entry.stacks === true ? { stacks: true } : {}) }];
  });
}

export function defenseEntriesFromConditions(conditions) {
  return (Array.isArray(conditions) ? conditions : []).flatMap((condition) => {
    const name = String(condition?.name || '').trim().toLowerCase();
    if (name !== 'damageweakness' && name !== 'damageimmunity') return [];
    const value = parseDefenseValue(condition.amount);
    if (!value) return [];
    return [{
      kind: name === 'damageimmunity' ? 'immunity' : 'weakness',
      type: cleanType(condition.damageType),
      value,
      source: String(condition.label || condition.sourceAbility || '').trim() || 'effect',
      ...(condition.stacks === true ? { stacks: true } : {}),
    }];
  });
}

// The immunity or weakness that counts against this damage: { value: number | "all", entries: [...used] }.
export function pickDefense(entries, kind, damageType) {
  const type = cleanType(damageType);
  const fits = (Array.isArray(entries) ? entries : []).filter((entry) => entry && entry.kind === kind && (!entry.type || entry.type === type));
  if (!fits.length) return { value: 0, entries: [] };
  const all = fits.find((entry) => entry.value === 'all');
  if (all && kind === 'immunity') return { value: 'all', entries: [all] };
  const numeric = fits.filter((entry) => typeof entry.value === 'number');
  const best = numeric.filter((entry) => !entry.stacks).reduce((top, entry) => (!top || entry.value > top.value ? entry : top), null);
  const used = [...(best ? [best] : []), ...numeric.filter((entry) => entry.stacks)];
  return { value: used.reduce((sum, entry) => sum + entry.value, 0), entries: used };
}

// For chat: "fire immunity 5", "immune to fire", "weakness 3".
export function describeDefense(kind, picked, damageType) {
  if (!picked || !picked.value) return '';
  const type = cleanType(damageType);
  if (picked.value === 'all') return type ? `immune to ${type}` : 'immune';
  const own = type && picked.entries.every((entry) => entry.type) ? `${type} ` : '';
  return `${own}${kind} ${picked.value}`;
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
