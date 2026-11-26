// The universal actions (Brandon, November 25, 2026: "there are a bunch of universal actions, I want to create the
// json and add them as abilities for every pc, and some like knock back for monsters too ... Recovery based things
// and stuff would be just [heroes]").
//
// The list is one JSON file, character_sheet/ability-automation/universal-actions.json: Charge, Defend, Heal, Aid
// Attack, Catch Breath, Escape Grab, Grab, Hide, Knockback, Make or Assist a Test, Search for Hidden Creatures,
// Stand Up, Use Consumable (and the three move actions, kept for reference and not listed). Nothing is written into
// a hero's sheet or a monster's stat block: the trays add the list as they draw themselves, after the creature's own
// abilities, so a change to the file reaches everybody.
//
//   heroes    character-summary-panel.js getAbilityActions: Main goes in the Main Action tab, Maneuver in Maneuvers
//   monsters  monster-ability-tray.js abilitiesFor: Main goes in Actions, Maneuver in Maneuvers; only the actions
//             marked for monsters (none that spends a Recovery)
//
// The functions below are plain (data in, cards out), for the node tests. The page's copy of the list is fetched
// once; until it has arrived the trays show the creature's own abilities only, and are drawn again when it does.

import { objectRules } from './object-tokens.mjs';

const HERO_TABS = { Main: 'mains', Maneuver: 'maneuvers' };
const MONSTER_TABS = { Main: 'action', Maneuver: 'maneuver' };
const HERO_LABELS = { Main: 'Main Action', Maneuver: 'Maneuver', Move: 'Move Action' };
const TIER_KEYS = ['low', 'mid', 'high'];

const escapeText = (text) => String(text ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replace(/\n/g, '<br>');

const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

/** The actions of the file that are listed for `audience` ('heroes' or 'monsters'), in the file's order. */
export function universalActionsFor(data, audience) {
  const actions = Array.isArray(data?.actions) ? data.actions : [];
  return actions.filter((action) => action && typeof action === 'object' && typeof action.id === 'string' && action.id
    && typeof action.name === 'string' && action.name && action.show !== false
    && Array.isArray(action.for) && action.for.includes(audience));
}

function highestCharacteristic(stats, names) {
  const values = (Array.isArray(names) ? names : []).map((name) => Number.parseInt(stats?.[String(name).toLowerCase()], 10)).filter(Number.isFinite);
  return values.length ? Math.max(...values) : null;
}

/**
 * The universal actions of one tab of a hero's tray ('mains' or 'maneuvers'), as the sheet's own action cards are
 * shaped (parts/sheet-model.js): the tray draws, previews, posts and runs them like any other.
 */
export function heroUniversalActions(data, categoryKey, sheet = null) {
  const stats = sheet?.hero?.stats && typeof sheet.hero.stats === 'object' ? sheet.hero.stats : {};
  return universalActionsFor(data, 'heroes')
    .filter((action) => HERO_TABS[action.type] === categoryKey)
    .map((action) => {
      const roll = action.roll && Array.isArray(action.roll.tiers) ? action.roll : null;
      const bonus = roll ? highestCharacteristic(stats, roll.characteristics) : null;
      return {
        id: action.id,
        _stableActionId: action.id,
        _universal: true,
        name: action.name,
        actionLabel: HERO_LABELS[action.type] || 'Action',
        tags: Array.isArray(action.keywords) ? [...action.keywords] : [],
        range: action.range || '',
        target: action.target || '',
        cost: '',
        description: escapeText(action.effect || ''),
        trigger: '',
        useWhen: '',
        ...(action.automation ? { automation: clone(action.automation) } : {}),
        tests: roll ? [{
          id: `${action.id}-roll`,
          label: `Power Roll · ${(roll.characteristics || []).join(' or ')}`,
          rollMod: bonus === null ? '' : String(bonus),
          tiers: Object.fromEntries(TIER_KEYS.map((key, index) => [key, { damage: '', damageType: '', notes: String(roll.tiers[index] ?? '') }])),
        }] : [],
      };
    });
}

// A stat block's passives of one kind, from its traits and its abilities (as board-interactions monsterPassivesOfKind).
function passivesOfKind(monster, kind) {
  const found = [];
  const take = (automation) => (Array.isArray(automation?.passives) ? automation.passives : []).forEach((passive) => {
    if (String(passive?.kind || '').replace(/[^a-z]/gi, '').toLowerCase() === kind) found.push(passive);
  });
  (Array.isArray(monster?.traits) ? monster.traits : []).forEach((trait) => take(trait?.automation));
  const abilities = monster?.abilities && typeof monster.abilities === 'object' ? monster.abilities : {};
  Object.keys(abilities).forEach((key) => (Array.isArray(abilities[key]) ? abilities[key] : []).forEach((ability) => take(ability?.automation)));
  return found;
}

/**
 * The universal actions of one tab of a monster's tray ('action' or 'maneuver'), as a stat block's own abilities
 * are shaped (name, keywords, range, targets, roll_bonus, test, effect, automation). The power roll's bonus is the
 * monster's own characteristic (the highest of those the roll may use).
 */
export function monsterUniversalAbilities(data, categoryKey, monster = null) {
  // A trap, a hazard, a siege engine (an object token: object-tokens.mjs) is no creature and has none of them.
  if (objectRules(monster, passivesOfKind)) return [];
  const stats = monster?.attributes && typeof monster.attributes === 'object' ? monster.attributes : {};
  return universalActionsFor(data, 'monsters')
    .filter((action) => MONSTER_TABS[action.type] === categoryKey)
    .map((action) => {
      const roll = action.roll && Array.isArray(action.roll.tiers) ? action.roll : null;
      const bonus = roll ? highestCharacteristic(stats, roll.characteristics) : null;
      return {
        id: action.id,
        universal: true,
        name: action.name,
        keywords: (Array.isArray(action.keywords) ? action.keywords : []).join(', '),
        range: action.range || '',
        targets: action.target || '',
        effect: action.effect || '',
        ...(roll ? {
          roll_bonus: bonus ?? 0,
          has_test: true,
          test: Object.fromEntries([1, 2, 3].map((tier, index) => [`tier${tier}`, { damage_amount: '', damage_type: '', tier_effect: String(roll.tiers[index] ?? '') }])),
        } : { has_test: false }),
        ...(action.automation ? { automation: clone(action.automation) } : {}),
      };
    });
}

// ---------- the page's copy ----------

let loaded = null;
let loading = null;

/** The list as the page has it now: null until it has been fetched. */
export function universalActionsData() {
  return loaded;
}

/** For tests and previews: use this list without fetching. */
export function setUniversalActionsData(data) {
  loaded = data && Array.isArray(data.actions) ? data : null;
  return loaded;
}

/**
 * Fetches the list once (the build number keeps an old copy from being used) and tells the page it is here
 * ('vtt:universal-actions-loaded'), so open trays draw themselves again. A failed fetch is tried again at the next
 * call; the trays work without it.
 */
export function loadUniversalActions({ url = null, fetcher = globalThis.fetch, doc = globalThis.document } = {}) {
  if (loaded) return Promise.resolve(loaded);
  if (loading) return loading;
  if (typeof fetcher !== 'function') return Promise.resolve(null);
  const version = (() => { try { return new URL(import.meta.url).search; } catch { return ''; } })();
  const address = url || `/dnd/character_sheet/ability-automation/universal-actions.json${version}`;
  loading = Promise.resolve()
    .then(() => fetcher(address, { credentials: 'same-origin' }))
    .then((response) => (response && response.ok ? response.json() : null))
    .then((data) => {
      loading = null;
      if (!setUniversalActionsData(data)) return null;
      try { doc?.dispatchEvent?.(new CustomEvent('vtt:universal-actions-loaded')); } catch { /* no page */ }
      return loaded;
    })
    .catch((error) => {
      loading = null;
      console.warn('[VTT] The universal actions could not be loaded', error);
      return null;
    });
  return loading;
}

if (typeof window !== 'undefined') {
  // The monster tray is a plain script: it reads the list through here.
  window.VTTUniversalActions = {
    forHero: (categoryKey, sheet) => heroUniversalActions(loaded, categoryKey, sheet),
    forMonster: (categoryKey, monster) => monsterUniversalAbilities(loaded, categoryKey, monster),
    load: loadUniversalActions,
    get loaded() { return Boolean(loaded); },
  };
  loadUniversalActions();
}
