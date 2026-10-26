// The character sheet's data model, shared by the full sheet (character_sheet/app.js), its edit forms and the map's
// side panel. Ported from the classic sheet (sheet.js) so both read and save a sheet the same way: the same
// defaults, the same normalising, the same kit rule, the same chat text. Pure apart from sanitizeRichText (needs a
// document).

import { staminaState } from './stamina-math.js';
import { normalizeSheetConditions } from './conditions.js';

export const SKILL_GROUPS = {
  Crafting: ['Alchemy', 'Architecture', 'Blacksmithing', 'Carpentry', 'Cooking', 'Fletching', 'Forgery', 'Jewelry', 'Mechanics', 'Tailoring'],
  Exploration: ['Climb', 'Drive', 'Endurance', 'Gymnastics', 'Heal', 'Jump', 'Lift', 'Navigate', 'Ride', 'Swim', 'Track'],
  Interpersonal: ['Brag', 'Empathize', 'Flirt', 'Gamble', 'Handle Animals', 'Interrogate', 'Intimidate', 'Lead', 'Lie', 'Music', 'Perform', 'Persuade', 'Read Person'],
  Intrigue: ['Alertness', 'Conceal Object', 'Disguise', 'Eavesdrop', 'Escape Artist', 'Hide', 'Pick Lock', 'Pick Pocket', 'Sabotage', 'Search', 'Sneak'],
  Lore: ['Culture', 'Criminal Underworld', 'History', 'Magic', 'Monsters', 'Nature', 'Psionics', 'Religion', 'Rumors', 'Society', 'Strategy', 'Timescape'],
};
export const ALL_SKILLS = Object.values(SKILL_GROUPS).flat().sort((a, b) => a.localeCompare(b));
export const getSkillGroup = (skill) => Object.keys(SKILL_GROUPS).find((group) => SKILL_GROUPS[group].includes(skill)) || 'Other';

export const ACTION_TYPES = ['mains', 'maneuvers', 'triggers', 'freeStrikes'];
export const ACTION_LABELS = { mains: 'Main Action', maneuvers: 'Maneuver', triggers: 'Triggered Action', freeStrikes: 'Free Strike' };
export const ATTRIBUTES = ['Might', 'Agility', 'Reason', 'Intuition', 'Presence'];
export const TEST_TIERS = [{ key: 'low', label: '≤11' }, { key: 'mid', label: '12–16' }, { key: 'high', label: '17+' }];

export const DEFAULT_CULTURE_FIELDS = { culture: '', environment: '', organization: '', upbringing: '' };
export const DEFAULT_CAREER_FIELDS = { career: '', incitingIncident: '' };
export const DEFAULT_KIT_FIELDS = {
  name: '', weapon: '', armor: '', speed: '', disengage: '', stamina: '', stability: '', meleeDistance: '', rangedDistance: '',
  meleeDamageLow: '', meleeDamageMid: '', meleeDamageHigh: '', rangedDamageLow: '', rangedDamageMid: '', rangedDamageHigh: '',
};
export const KIT_FIELD_LABELS = [
  ['name', 'Kit name'], ['weapon', 'Weapon / implement'], ['armor', 'Armor / ward'], ['speed', 'Speed'], ['disengage', 'Disengage'],
  ['stamina', 'Stamina'], ['stability', 'Stability'], ['meleeDistance', 'Melee distance'], ['rangedDistance', 'Ranged distance'],
  ['meleeDamageLow', 'Melee dmg ≤11'], ['meleeDamageMid', 'Melee dmg 12–16'], ['meleeDamageHigh', 'Melee dmg 17+'],
  ['rangedDamageLow', 'Ranged dmg ≤11'], ['rangedDamageMid', 'Ranged dmg 12–16'], ['rangedDamageHigh', 'Ranged dmg 17+'],
];
export const DEFAULT_VITALS = {
  size: '', speed: '', stability: '', disengage: '', save: '', staminaMax: 0, recoveriesMax: 0, currentStamina: 0,
  currentRecoveries: 0, recoveryValue: '', tempStamina: 0, staminaHistory: [],
};
export const MAX_HIRELING_SKILLS = 10;
export const MAX_HIRELING_BONUS = 5;

export const deepClone = (value) => JSON.parse(JSON.stringify(value ?? null));
export const createId = (prefix = 'id') => `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;

export function defaultSheet() {
  return {
    hero: {
      name: '', level: 1, class: '', complication: '', ancestry: '',
      culture: { ...DEFAULT_CULTURE_FIELDS }, career: { ...DEFAULT_CAREER_FIELDS }, kit: { ...DEFAULT_KIT_FIELDS },
      classTrack: '', wealth: '', renown: '', xp: '', victories: '', surges: '', surgesUsed: 0,
      resource: { title: 'Resource', value: 0, autoDice: '', allowNegative: false, discountOnPowerRollEdge: false, automation: null },
      heroTokens: [false, false],
      stats: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 },
      vitals: { ...DEFAULT_VITALS },
      bonuses: [], hirelings: [], conditions: [],
    },
    sidebar: { lists: { common: [], vulnerability: [], immunity: [], languages: [] }, skills: {}, resource: { title: 'Resource', text: '' } },
    features: [],
    actions: { mains: [], maneuvers: [], triggers: [], freeStrikes: [] },
  };
}

export function hasAbilityAutomation(automation) {
  if (!automation || typeof automation !== 'object') return false;
  const hasCards = (Array.isArray(automation.cards) && automation.cards.length > 0) || (Array.isArray(automation.blocks) && automation.blocks.length > 0);
  const hasModifiers = Array.isArray(automation.modifiers) && automation.modifiers.length > 0;
  const hasPassives = Array.isArray(automation.passives) && automation.passives.length > 0;
  return hasCards || hasModifiers || hasPassives;
}

/** Saved automation always goes through the schema's normaliser, as the classic sheet did. */
export function normalizeAutomationBlock(automation) {
  if (!hasAbilityAutomation(automation)) return null;
  const schema = typeof window !== 'undefined' ? window.AbilityAutomationSchema : null;
  if (schema?.normalizeAutomation) return schema.normalizeAutomation(automation);
  return deepClone(automation);
}

export function hasResourceAutomation(automation) {
  return Boolean(automation && typeof automation === 'object' && Array.isArray(automation.rules) && automation.rules.length > 0);
}

export const defaultTestTier = () => ({ damage: '', damageType: '', notes: '', attributeCheck: { enabled: false, attribute: '', threshold: '', effect: '' } });
export const defaultTest = () => ({ id: createId('test'), label: '', rollMod: '', beforeEffect: '', tiers: { low: defaultTestTier(), mid: defaultTestTier(), high: defaultTestTier() }, additionalEffect: '' });

export function normalizeTestTier(tier = {}) {
  return {
    damage: tier?.damage || '', damageType: tier?.damageType || '', notes: tier?.notes || '',
    attributeCheck: {
      enabled: Boolean(tier?.attributeCheck?.enabled), attribute: tier?.attributeCheck?.attribute || '',
      threshold: tier?.attributeCheck?.threshold || '', effect: tier?.attributeCheck?.effect || '',
    },
  };
}

export function normalizeTest(test = {}) {
  const tiers = test?.tiers || {};
  const isArray = Array.isArray(tiers);
  return {
    id: test?.id || createId('test'), label: test?.label || '', rollMod: test?.rollMod ?? '', beforeEffect: test?.beforeEffect || '',
    tiers: { low: normalizeTestTier(isArray ? tiers[0] : tiers.low), mid: normalizeTestTier(isArray ? tiers[1] : tiers.mid), high: normalizeTestTier(isArray ? tiers[2] : tiers.high) },
    additionalEffect: test?.additionalEffect || '',
  };
}

export function actionDefaults(type) {
  const defaults = { id: createId('action'), name: '', actionLabel: ACTION_LABELS[type] || 'Action', tags: [], range: '', target: '', cost: '', description: '', useWhen: '', tests: [], automation: null };
  if (type === 'triggers') defaults.trigger = '';
  return defaults;
}

const splitTags = (value) => (Array.isArray(value) ? value : String(value || '').split(',')).map((tag) => String(tag).trim()).filter(Boolean);

export function normalizeAction(action = {}, type = 'mains') {
  const tests = Array.isArray(action.tests)
    ? action.tests.map(normalizeTest)
    : (Array.isArray(action.effects) ? action.effects : []).map((effect) => normalizeTest({ label: effect?.label || '', additionalEffect: effect?.text || '' }));
  const normalized = {
    id: action.id || createId('action'), name: action.name || action.title || '', actionLabel: action.actionLabel || '', tags: splitTags(action.tags ?? action.keywords),
    range: action.range || action.distance || '', target: action.target || '', cost: action.cost === undefined || action.cost === null ? '' : String(action.cost),
    description: action.description || '', useWhen: action.useWhen || '', tests, automation: normalizeAutomationBlock(action.automation),
  };
  if (type === 'triggers') normalized.trigger = action.trigger || '';
  return normalized;
}

export function normalizeFeature(feature = {}) {
  return {
    id: feature.id || createId('feature'), title: feature.title || feature.name || '', useWhen: feature.useWhen || '',
    tags: splitTags(feature.tags), text: feature.text || feature.description || '', isWide: Boolean(feature.isWide),
    automation: normalizeAutomationBlock(feature.automation),
  };
}

export function normalizeSkillsState(skills = {}) {
  const normalized = {};
  if (!skills || typeof skills !== 'object') return normalized;
  Object.entries(skills).forEach(([skill, value]) => {
    const entry = { bonus: '' };
    if (typeof value === 'string') entry.level = value;
    else if (value && typeof value === 'object') { entry.level = value.level || 'Trained'; entry.bonus = value.bonus ?? ''; }
    if (entry.level && entry.level !== 'Untrained') normalized[skill] = entry;
  });
  return normalized;
}

export function normalizeCommonThings(list) {
  if (!Array.isArray(list)) return [];
  return list.map((item) => (typeof item === 'string'
    ? { id: createId('common'), title: item, details: '' }
    : { ...(item || {}), id: item?.id || createId('common'), title: item?.title || '', details: item?.details || item?.text || '' }));
}

function normalizeIdentityGroup(value, defaults) {
  if (typeof value === 'string') return { ...defaults, [Object.keys(defaults)[0]]: value };
  if (!value || typeof value !== 'object') return { ...defaults };
  return { ...defaults, ...value };
}

export function normalizeVitals(vitals = {}) {
  const v = vitals && typeof vitals === 'object' ? vitals : {};
  const out = { ...DEFAULT_VITALS };
  for (const key of ['size', 'speed', 'stability', 'disengage', 'save', 'recoveryValue']) out[key] = v[key] ?? out[key];
  const staminaMax = v.staminaMax ?? v.stamina;
  const recoveriesMax = v.recoveriesMax ?? v.recoveries;
  out.staminaMax = staminaMax === '' ? '' : Number(staminaMax || 0);
  out.recoveriesMax = recoveriesMax === '' ? '' : Number(recoveriesMax || 0);
  out.currentStamina = v.currentStamina === '' ? '' : Number(v.currentStamina ?? v.stamina ?? 0);
  out.currentRecoveries = v.currentRecoveries === '' ? '' : Number(v.currentRecoveries ?? v.recoveries ?? 0);
  out.tempStamina = Math.max(0, Number.parseInt(v.tempStamina, 10) || 0);
  // Stamina above the maximum (temporary Stamina the old way) reads as temporary Stamina.
  if (out.currentStamina !== '' && out.staminaMax !== '') {
    const s = staminaState(out);
    out.currentStamina = s.current;
    out.tempStamina = s.temp;
  }
  const history = Array.isArray(v.staminaHistory) ? v.staminaHistory.map(Number).filter(Number.isFinite) : [];
  if (!history.length && Number.isFinite(out.currentStamina)) history.push(out.currentStamina);
  out.staminaHistory = history.slice(-4);
  return out;
}

export function normalizeResourceValue(value) {
  if (value === '' || value === null || value === undefined) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** A sheet from the server, with every part the page reads present and in shape (sheet.js mergeWithDefaults). */
export function mergeWithDefaults(data) {
  const merged = defaultSheet();
  if (!data || typeof data !== 'object') return merged;
  const inputHero = data.hero || {};
  merged.hero = { ...merged.hero, ...inputHero };
  merged.hero.resource = { ...merged.hero.resource, ...(inputHero.resource || {}) };
  merged.hero.resource.value = normalizeResourceValue(inputHero.resource?.value ?? merged.hero.resource.value);
  merged.hero.resource.allowNegative = Boolean(merged.hero.resource.allowNegative);
  merged.hero.resource.discountOnPowerRollEdge = Boolean(merged.hero.resource.discountOnPowerRollEdge);
  merged.hero.stats = { ...merged.hero.stats, ...(inputHero.stats || {}) };
  merged.hero.vitals = normalizeVitals(inputHero.vitals);
  merged.hero.culture = normalizeIdentityGroup(inputHero.culture, DEFAULT_CULTURE_FIELDS);
  merged.hero.career = normalizeIdentityGroup(inputHero.career, DEFAULT_CAREER_FIELDS);
  merged.hero.kit = normalizeIdentityGroup(inputHero.kit, DEFAULT_KIT_FIELDS);
  merged.hero.heroTokens = [Boolean(inputHero.heroTokens?.[0]), Boolean(inputHero.heroTokens?.[1])];
  // Structured ({name, duration: {type}}): an old sheet's free text is read leniently (parts/conditions.js).
  merged.hero.conditions = normalizeSheetConditions(inputHero.conditions);
  merged.hero.bonuses = Array.isArray(inputHero.bonuses) ? inputHero.bonuses.map((b) => ({ id: b?.id || createId('bonus'), bonus: b?.bonus || '', source: b?.source || '' })) : [];
  merged.hero.hirelings = Array.isArray(inputHero.hirelings) ? inputHero.hirelings.map((h) => ({
    id: h?.id || createId('hireling'), name: h?.name || '', image: h?.image || '', skills: Array.isArray(h?.skills) ? h.skills.slice(0, MAX_HIRELING_SKILLS) : [],
    bonus: Math.min(Math.max(Number.parseInt(h?.bonus, 10) || 0, 0), MAX_HIRELING_BONUS), notes: h?.notes || '',
  })) : [];
  merged.sidebar = { ...merged.sidebar, ...(data.sidebar || {}) };
  merged.sidebar.lists = { ...merged.sidebar.lists, ...(data.sidebar?.lists || {}) };
  merged.sidebar.lists.common = normalizeCommonThings(data.sidebar?.lists?.common || []);
  if (data.sidebar?.lists?.weaknesses && !data.sidebar?.lists?.vulnerability) merged.sidebar.lists.vulnerability = data.sidebar.lists.weaknesses;
  if (data.sidebar?.lists?.vulnerabilities && !data.sidebar?.lists?.immunity) merged.sidebar.lists.immunity = data.sidebar.lists.vulnerabilities;
  for (const key of ['vulnerability', 'immunity', 'languages']) {
    merged.sidebar.lists[key] = (Array.isArray(merged.sidebar.lists[key]) ? merged.sidebar.lists[key] : []).map((x) => (typeof x === 'string' ? x : x?.title || '')).filter(Boolean);
  }
  merged.sidebar.skills = normalizeSkillsState(data.sidebar?.skills);
  merged.sidebar.resource = { ...merged.sidebar.resource, ...(data.sidebar?.resource || {}) };
  merged.features = (Array.isArray(data.features) ? data.features : []).map(normalizeFeature);
  merged.actions = { ...merged.actions, ...(data.actions || {}) };
  ACTION_TYPES.forEach((type) => { merged.actions[type] = (merged.actions[type] || []).map((action) => normalizeAction(action, type)); });
  return merged;
}

// ---------------------------------------------------------------- kit (one source: the kit's feature card)
export function kitFeatureOf(state) {
  const features = Array.isArray(state?.features) ? state.features : [];
  const isKit = (feature) => /\bkit\b/i.test(String(feature?.title || feature?.name || ''));
  return features.find((feature) => isKit(feature) && feature?.automation?.modifiers?.length) || features.find(isKit) || null;
}

export function kitValuesFromFeature(feature) {
  if (!feature) return {};
  const values = {};
  const name = String(feature.title || feature.name || '').replace(/\bkit\b/gi, '').replace(/^[\s\-–—:]+|[\s\-–—:]+$/g, '').replace(/\s+/g, ' ').trim();
  if (name) values.name = name.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
  const modifiers = Array.isArray(feature.automation?.modifiers) ? feature.automation.modifiers : [];
  const reachOf = (modifier) => {
    if (modifier?.match?.reach === 'melee' || modifier?.match?.reach === 'ranged') return modifier.match.reach;
    const keywords = [...(modifier?.match?.keywordsAll || []), ...(modifier?.match?.keywordsAny || [])].map((k) => String(k).toLowerCase());
    return keywords.includes('melee') ? 'melee' : keywords.includes('ranged') ? 'ranged' : '';
  };
  for (const reach of ['melee', 'ranged']) {
    const mine = modifiers.filter((modifier) => reachOf(modifier) === reach);
    const damage = mine.reduce((sum, modifier) => sum + (Number(modifier?.apply?.damageBonus) || 0), 0);
    const distance = mine.reduce((sum, modifier) => sum + (Number(modifier?.apply?.rangeBonus) || 0), 0);
    if (damage) ['Low', 'Mid', 'High'].forEach((tier) => { values[`${reach}Damage${tier}`] = `+${damage}`; });
    if (distance) values[`${reach}Distance`] = `+${distance}`;
  }
  return values;
}

export function effectiveKit(state) {
  const card = kitFeatureOf(state);
  const fromCard = kitValuesFromFeature(card);
  return { values: { ...DEFAULT_KIT_FIELDS, ...(state?.hero?.kit || {}), ...fromCard }, fromCard, card };
}

// ---------------------------------------------------------------- heroic resource
export function heroResourceFloor(hero) {
  const resource = hero?.resource;
  if (!resource || !resource.allowNegative) return 0;
  return -(1 + (Number(hero?.stats?.reason) || 0));
}

export function resolveAutoResourceGain(value, random = Math.random) {
  const raw = String(value || '').trim();
  const dice = /^d(\d+)$/i.exec(raw);
  if (dice && Number(dice[1]) > 0) {
    const roll = Math.floor(random() * Number(dice[1])) + 1;
    return { amount: roll, label: `rolled ${raw.toLowerCase()} = ${roll}` };
  }
  const flat = /^\+?(\d+)$/.exec(raw);
  if (flat && Number(flat[1]) > 0) return { amount: Number(flat[1]), label: `static +${flat[1]}` };
  return null;
}

// ---------------------------------------------------------------- rich text
export function formatMultiline(text) {
  if (!text) return '';
  return String(text).split('\n').map((line) => line.trim()).filter((line, index, arr) => line !== '' || index < arr.length - 1).map((line) => line || ' ').join('<br>');
}

export function normalizeRichText(value) {
  if (!value) return '';
  const text = String(value);
  return /<[a-z][\s\S]*>/i.test(text) ? text : formatMultiline(text);
}

/** Keeps bold, underline, line breaks, paragraphs and lists; drops every other tag and every attribute. */
export function sanitizeRichText(html, doc = typeof document !== 'undefined' ? document : null) {
  if (!html || !doc) return html ? String(html).replace(/<(?!\/?(b|strong|u|br|p|div|ul|ol|li|em|span)\b)[^>]*>/gi, '') : '';
  const allowed = new Set(['B', 'STRONG', 'U', 'BR', 'P', 'DIV', 'UL', 'OL', 'LI', 'EM', 'SPAN']);
  const holder = doc.createElement('div');
  holder.innerHTML = String(html);
  const clean = (node) => {
    if (node.nodeType === 3) return doc.createTextNode(node.textContent || '');
    if (node.nodeType !== 1) return doc.createTextNode('');
    if (!allowed.has(node.tagName.toUpperCase())) {
      const fragment = doc.createDocumentFragment();
      Array.from(node.childNodes).forEach((child) => fragment.appendChild(clean(child)));
      return fragment;
    }
    const element = doc.createElement(node.tagName.toLowerCase());
    Array.from(node.childNodes).forEach((child) => element.appendChild(clean(child)));
    return element;
  };
  const out = doc.createElement('div');
  Array.from(holder.childNodes).forEach((child) => out.appendChild(clean(child)));
  return out.innerHTML;
}

export const renderRichText = (value, doc) => sanitizeRichText(normalizeRichText(value), doc);

export function stripHtmlToText(html) {
  return String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li)>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ---------------------------------------------------------------- chat text (as the classic sheet posted it)
export function formatRoll(rollMod) {
  if (rollMod === '' || rollMod === null || rollMod === undefined) return '2d10';
  const mod = String(rollMod).trim();
  return mod ? `2d10${mod.startsWith('-') ? '' : '+'}${mod}` : '2d10';
}

export function formatActionForChat(sheet, action, type) {
  const lines = [`${sheet?.hero?.name || 'Hero'} — ${action?.name || 'Unnamed Action'}`];
  const tags = (action?.tags || []).join(', ');
  lines.push(`Type: ${action?.actionLabel || ACTION_LABELS[type] || 'Action'}${tags ? ' | ' + tags : ''}`);
  if (action?.range) lines.push(`Range: ${action.range}`);
  if (action?.target) lines.push(`Target: ${action.target}`);
  if (type === 'triggers' && action?.trigger) lines.push(`Trigger: ${action.trigger}`);
  if (action?.cost) lines.push(`Cost: ${action.cost}`);
  if (action?.useWhen) lines.push(`Use When: ${stripHtmlToText(action.useWhen)}`);
  if (action?.description) lines.push(`Effect: ${stripHtmlToText(action.description)}`);
  (action?.tests || []).forEach((test) => {
    lines.push(`--- ${test.label || 'Power Roll'} (${formatRoll(test.rollMod)}) ---`);
    if (test.beforeEffect) lines.push(`Before: ${test.beforeEffect}`);
    for (const { key, label } of TEST_TIERS) {
      const tier = test.tiers?.[key];
      if (!tier) continue;
      const parts = [];
      if (tier.damage || tier.damageType) parts.push(`${tier.damage || '-'} ${tier.damageType || ''}`.trim());
      if (tier.notes) parts.push(tier.notes);
      if (tier.attributeCheck?.enabled) parts.push(`${tier.attributeCheck.attribute || 'Attr'} < ${tier.attributeCheck.threshold || '?'}: ${tier.attributeCheck.effect || ''}`);
      if (parts.length) lines.push(`  ${label}: ${parts.join(' | ')}`);
    }
    if (test.additionalEffect) lines.push(`Additional: ${test.additionalEffect}`);
  });
  return lines.join('\n');
}

export function formatFeatureForChat(sheet, feature) {
  const lines = [`${sheet?.hero?.name || 'Hero'} — ${feature?.title || 'Untitled Feature'}`];
  if ((feature?.tags || []).length) lines.push(`Tags: ${feature.tags.join(', ')}`);
  if (String(feature?.useWhen || '').trim()) lines.push(`Use When: ${feature.useWhen.trim()}`);
  const body = stripHtmlToText(feature?.text);
  if (body) lines.push(body);
  return lines.join('\n');
}

export function formatSectionForChat(sheet, kind, id = '') {
  const hero = sheet?.hero || {};
  const name = hero.name || 'Hero';
  const lists = sheet?.sidebar?.lists || {};
  if (kind === 'skills') {
    const entries = Object.entries(normalizeSkillsState(sheet?.sidebar?.skills));
    return entries.length ? [`${name} — Skills`, ...entries.map(([skill, data]) => `  ${skill} (${getSkillGroup(skill)}) ${String(data.bonus ?? '').trim() || '—'}`)].join('\n') : null;
  }
  if (kind === 'languages') return (lists.languages || []).length ? `${name} — Languages\n  ${lists.languages.join(', ')}` : null;
  if (kind === 'vuln') {
    const v = lists.vulnerability || [], i = lists.immunity || [];
    if (!v.length && !i.length) return null;
    return [`${name} — Vulnerabilities & Immunities`, v.length ? `Vulnerable: ${v.join(', ')}` : '', i.length ? `Immune: ${i.join(', ')}` : ''].filter(Boolean).join('\n');
  }
  if (kind === 'common') {
    const thing = (lists.common || []).find((c) => c.id === id);
    return thing ? [`${name} — ${thing.title || 'Common Thing'}`, stripHtmlToText(thing.details)].filter(Boolean).join('\n') : null;
  }
  if (kind === 'background') {
    const c = hero.culture || {}, k = hero.career || {};
    const lines = [`${name} — Background`, hero.ancestry ? `Ancestry: ${hero.ancestry}` : '', hero.complication ? `Complication: ${hero.complication}` : '',
      c.culture ? `Culture: ${c.culture}` : '', c.environment ? `Environment: ${c.environment}` : '', c.organization ? `Organization: ${c.organization}` : '',
      c.upbringing ? `Upbringing: ${c.upbringing}` : '', k.career ? `Career: ${k.career}` : '', k.incitingIncident ? `Inciting Incident: ${k.incitingIncident}` : ''].filter(Boolean);
    return lines.length > 1 ? lines.join('\n') : null;
  }
  return null;
}

// ---------------------------------------------------------------- import JSON (abilities and features)
export const IMPORT_GROUP_LABELS = { mains: 'Main action', maneuvers: 'Maneuver', triggers: 'Triggered action', freeStrikes: 'Free strike', features: 'Feature' };

/** Which list an imported card goes to: by its actionLabel (or type / action), a feature when it has a title and no name. */
export function groupOfImported(card) {
  const label = String(card?.actionLabel || card?.type || card?.action || '').toLowerCase();
  if (/maneuver/.test(label)) return 'maneuvers';
  if (/trigger/.test(label)) return 'triggers';
  if (/free/.test(label)) return 'freeStrikes';
  if (/feature/.test(label) || (card?.title && !card?.name)) return 'features';
  return 'mains';
}

/**
 * Reads pasted or loaded JSON: one ability, a list, or {abilities: [...]} (also {features: [...]}). Each item goes to
 * its group (groupOfImported) unless `group` is chosen. Answers {items: [{group, card}], added: {group: n}} or {error}.
 */
export function parseImport(text, group = '') {
  let parsed;
  try { parsed = JSON.parse(String(text || '')); } catch (error) { return { error: `That is not valid JSON: ${error.message}` }; }
  let raw;
  if (Array.isArray(parsed)) raw = parsed;
  else if (parsed && typeof parsed === 'object' && (Array.isArray(parsed.abilities) || Array.isArray(parsed.features))) {
    raw = [...(parsed.abilities || []), ...(parsed.features || []).map((f) => ({ ...f, type: f?.type || 'feature' }))];
  } else raw = [parsed];
  if (!raw.length) return { error: 'There is nothing in that JSON to import.' };
  const bad = raw.findIndex((item) => !item || typeof item !== 'object' || Array.isArray(item) || !(String(item.name || item.title || '').trim()));
  if (bad >= 0) return { error: `Item ${bad + 1} has no "name" (abilities) or "title" (features).` };
  if (group && !IMPORT_GROUP_LABELS[group]) return { error: `Unknown group "${group}".` };
  const items = [], added = {};
  for (const item of raw) {
    const target = group || groupOfImported(item);
    const { id, ...rest } = item;
    const card = target === 'features'
      ? normalizeFeature({ ...rest, id: createId('feature') })
      : normalizeAction({ ...rest, id: createId('action'), actionLabel: rest.actionLabel || ACTION_LABELS[target] }, target);
    items.push({ group: target, card });
    added[target] = (added[target] || 0) + 1;
  }
  return { items, added };
}

/** Moves list[from] to stand at `to` (the index it is dropped on; `after` drops behind it). Returns a new list. */
export function reorder(list, from, to, after = false) {
  const copy = [...list];
  if (from < 0 || from >= copy.length) return copy;
  let target = to + (after ? 1 : 0);
  const [moved] = copy.splice(from, 1);
  if (from < target) target -= 1;
  copy.splice(Math.max(0, Math.min(copy.length, target)), 0, moved);
  return copy;
}
