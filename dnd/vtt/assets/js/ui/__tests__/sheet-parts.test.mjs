import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { readTheme, writeTheme, statusHtml, abilitiesHtml, abilitiesForTab, traitsHtml, recordHtml, words, parts, abilityCard, featureCard, costLabel, abilityText, skillBonus, mediaUrl, pickPortrait, initialsOf, toggleMore } from '../../../../../character_sheet/parts/sheet-parts.js';
import { parseImport, groupOfImported, reorder, mergeWithDefaults, normalizeAction } from '../../../../../character_sheet/parts/sheet-model.js';
import { openAbilityEditor } from '../../../../../character_sheet/parts/sheet-editor.js';
import { createSheetLive } from '../../../../../character_sheet/parts/sheet-live.js';

// The new character sheet's shared parts (October 2026; the design Brandon approved over five rounds of mock-ups).

function memoryStorage() {
  const data = new Map();
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)) };
}

test('theme: Diablo by default, the switch is remembered per browser', () => {
  const storage = memoryStorage();
  assert.equal(readTheme(storage), 'diablo');
  assert.equal(writeTheme('parchment', storage), 'parchment');
  assert.equal(storage.getItem('sheet-theme'), 'parchment');
  assert.equal(readTheme(storage), 'parchment');
  assert.equal(writeTheme('anything', storage), 'diablo');
  assert.equal(readTheme({ getItem() { throw new Error('blocked'); } }), 'diablo', 'no storage: still Diablo');
});

test('recoveries: always a third of max Stamina (rounded down); an old stored value is ignored, no "Stored" chip', async () => {
  // Brandon, October 2026: "It should just be 1/3 health." There is no stored recovery value any more.
  const sheet = mergeWithDefaults({ hero: { vitals: { staminaMax: 61, currentStamina: 40, recoveriesMax: 8, currentRecoveries: 3, recoveryValue: '15' } } });
  const html = statusHtml(sheet, { canEdit: true });
  assert.match(html, /Spend recovery \+20/);
  assert.doesNotMatch(html, /sp-warn|Stored|≠/, 'no chip, no tooltip about a stored value');
  assert.match(statusHtml(mergeWithDefaults({ hero: { vitals: { staminaMax: 37, recoveryValue: '31' } } })), /Spend recovery \+12/);
  // The edit form shows the value read-only and never sends it.
  const dom = new JSDOM('<!doctype html><body></body>');
  const { openCoreEditor } = await import('../../../../../character_sheet/parts/sheet-editor.js');
  let saved = null;
  const panel = openCoreEditor({ sheet, onSave: (patch) => { saved = patch; return true; }, doc: dom.window.document });
  const body = dom.window.document.body;
  assert.equal(body.querySelector('[data-f="vitals.recoveryValue"]'), null, 'not an editable field');
  const shown = [...body.querySelectorAll('input[readonly]')].find((i) => i.value === '20');
  assert.ok(shown, 'the computed value (20) is shown read-only');
  body.querySelector('[data-go]').click();
  await new Promise((r) => setTimeout(r, 0));
  assert.ok(saved, 'the form saved');
  assert.equal('recoveryValue' in (saved.hero?.vitals || {}), false, 'a save never writes it');
  panel?.close?.();
  // The printed sheet prints a third of max Stamina, not the stored number.
  const { makeSheetExports } = await import('../../../../../character_sheet/parts/sheet-export.js');
  const printed = makeSheetExports(sheet, 'cal').buildPrintableCharacterSheetHtml({});
  assert.match(printed, /<b>20<\/b>Stamina/);
  assert.doesNotMatch(printed, /<b>15<\/b>Stamina/);
});

test('weaknesses: one chip per damage type, the one with a value kept (Indigo: "Corruption" + "Corruption 5")', async () => {
  const { weaknessList } = await import('../../../../../character_sheet/parts/sheet-parts.js');
  // Indigo's sheet holds the current list and an old "weaknesses" key; the merge keeps both keys.
  const sheet = mergeWithDefaults({ sidebar: { lists: { vulnerability: ['Corruption 5'], weaknesses: ['Corruption'], vulnerabilities: [] } } });
  assert.deepEqual(weaknessList(sheet.sidebar.lists), ['Corruption 5']);
  assert.deepEqual(weaknessList({ vulnerability: ['Fire'], weaknesses: ['fire 3', 'Holy 2'] }), ['fire 3', 'Holy 2'], 'the valued one wins, in the first one’s place');
  assert.deepEqual(weaknessList({ vulnerability: ['Fire 5', 'Fire weakness 2'] }), ['Fire 5'], 'the first with a value stays');
  const html = traitsHtml(sheet);
  assert.equal((html.match(/Corruption/g) || []).length, 1);
  assert.match(html, /<span class="sp-chip bad">Corruption 5<\/span>/);
});

test('the "+2" / "+D3" chip by the Heroic Resource says it is the start-of-turn gain', async () => {
  const { resourceGainTip } = await import('../../../../../character_sheet/parts/sheet-parts.js');
  const dice = statusHtml(mergeWithDefaults({ hero: { resource: { title: 'Clarity', value: 3, autoDice: '1d3' } } }));
  assert.match(dice, /data-character-resource-roll title="Start-of-turn Clarity gain: roll 1D3 and add it to Clarity\. Press at the start of your turn\." aria-label="[^"]+">\+1d3<\/button>/);
  assert.equal(resourceGainTip('2', 'Wrath'), 'Start-of-turn Wrath gain: add 2 Wrath. Press at the start of your turn.');
});

test('the status bar shows temporary Stamina blue from the right, with "19 / 36 +5"', () => {
  const html = statusHtml(mergeWithDefaults({ hero: { vitals: { staminaMax: 36, currentStamina: 19, tempStamina: 5 } } }));
  assert.match(html, /19 \/ 36 <small class="sp-stam__tempnum">\+5<\/small>/);
  assert.match(html, /class="sp-stam__temp" style="width:13\.9%"/);
  assert.match(html, /sp-stam--stamina/, '19 of 36 is above half: not winded');
  assert.match(statusHtml(mergeWithDefaults({ hero: { vitals: { staminaMax: 36, currentStamina: 18, tempStamina: 5 } } })), /sp-stam--winded/, 'temporary Stamina does not stop winded');
  assert.match(html, /class="sp-stam sp-stam--stamina" style="--sp-temp:13\.9%"/, 'the blue width is handed to the CSS so the state word keeps clear of it');
  assert.doesNotMatch(statusHtml(mergeWithDefaults({ hero: { vitals: { staminaMax: 36, currentStamina: 19 } } })), /--sp-temp/, 'no temporary Stamina: no offset');
});

test('the stamina bar has an unlabelled tick at half (title "Winded at N"); the state pill is the one label', () => {
  const pill = (vitals) => statusHtml(mergeWithDefaults({ hero: { vitals } })).match(/<small class="sp-stam__state">([^<]*)<\/small>/)?.[1] ?? null;
  const healthy = statusHtml(mergeWithDefaults({ hero: { vitals: { staminaMax: 36, currentStamina: 30 } } }));
  assert.match(healthy, /<div class="sp-stam__winded" title="Winded at 18"><\/div>/);
  assert.doesNotMatch(healthy, /sp-stam__wlbl/, 'no "winded" word under the tick');
  assert.doesNotMatch(healthy, /sp-stam__state/, 'healthy with no temporary Stamina: no pill (never "stamina")');
  assert.equal(pill({ staminaMax: 36, currentStamina: 30, tempStamina: 5 }), '5 temp', 'healthy with temporary Stamina: just the temp');
  assert.equal(pill({ staminaMax: 36, currentStamina: 18 }), 'winded');
  assert.equal(pill({ staminaMax: 36, currentStamina: 18, tempStamina: 5 }), '5 temp · winded');
  assert.equal(pill({ staminaMax: 36, currentStamina: 0 }), 'dying');
  const winded = statusHtml(mergeWithDefaults({ hero: { vitals: { staminaMax: 36, currentStamina: 10 } } }));
  assert.equal(winded.replace(/<[^>]*>/g, ' ').match(/winded/gi).length, 1, '"winded" shows once on the bar: the pill');
  const none = statusHtml(mergeWithDefaults({ hero: { vitals: { staminaMax: 0, currentStamina: 0 } } }));
  assert.match(none, /<div class="sp-stam__winded"><\/div>/, 'no maximum: a bare tick with no title');
});

const sample = () => mergeWithDefaults({
  actions: {
    mains: [{ name: 'Mind Spike', tests: [{ label: 'Power Roll + Reason', tiers: { low: { damage: '2', damageType: 'psychic' }, mid: { damage: '4' }, high: { damage: '6' } } }] }, { name: 'Bolt', cost: '3 Clarity' }],
    maneuvers: [{ name: 'Levitate' }], triggers: [{ name: 'Precognition', trigger: 'An ally is hit.' }], freeStrikes: [{ name: 'Free Strike' }],
  },
});

test('ability sub-tabs: All / Main actions / Maneuvers / Triggered / Free strikes, with counts', () => {
  const sheet = sample();
  assert.deepEqual(abilitiesForTab(sheet, 'all').map((x) => x.ability.name), ['Mind Spike', 'Bolt', 'Levitate', 'Precognition', 'Free Strike']);
  assert.deepEqual(abilitiesForTab(sheet, 'maneuvers').map((x) => x.ability.name), ['Levitate']);
  const html = abilitiesHtml(sheet, { abTab: 'triggers' });
  assert.match(html, /data-sheet-ab-tab="all"[^>]*>All<i>5<\/i>/);
  assert.match(html, /data-sheet-ab-tab="mains"[^>]*>Main actions<i>2<\/i>/);
  assert.match(html, /Precognition/);
  assert.doesNotMatch(html, /Mind Spike/, 'another group is not shown');
  assert.match(html, /<b>Trigger:<\/b> An ally is hit\./);
});

test('an ability card: signature, cost pill, tiers ≤11 / 12–16 / 17+, labelled parts, use-when; repeated text once', () => {
  const card = abilityCard(normalizeAction({
    name: 'Bolt', cost: '3 Clarity', useWhen: 'it is <b>far</b>', description: 'A bolt.<br>Effect: Push 2.<br>Strained: You are slowed.',
    tests: [{ label: 'Power Roll + Reason', tiers: { low: { damage: '5' }, mid: { damage: '8' }, high: { damage: '11' } }, additionalEffect: 'Effect: Push 2.' }],
  }), 'mains', 0);
  assert.match(card, /<span class="sp-cost">3 Clarity<\/span>/);
  assert.doesNotMatch(card, /Signature ability/, 'a costed ability is not a signature');
  assert.match(card, /≤11<\/span><span><b>5<\/b> damage/);
  assert.match(card, /12–16/);
  assert.match(card, /17\+/);
  assert.equal((card.match(/<b>Effect:<\/b>/g) || []).length, 1, 'the repeated effect is shown once');
  assert.match(card, /<b>Strained:<\/b> You are slowed\./);
  assert.match(card, /Use when it is far/);
  assert.match(abilityCard(normalizeAction({ name: 'Spike' }), 'mains', 0), /Signature ability/);
});

test('skills & traits: groups by Draw Steel skill group; clean sheet text', () => {
  const sheet = mergeWithDefaults({ sidebar: { skills: { Climb: 'Trained', Magic: { level: 'Trained', bonus: '+1' } }, lists: { languages: ['Caelian'] } }, hero: { bonuses: [{ source: '<b>Ring</b>&nbsp;', bonus: '+1 save' }] } });
  const html = traitsHtml(sheet);
  assert.match(html, /<span class="sp-sgl">Exploration<\/span><div class="sp-chips"><span class="sp-chip skill">Climb<\/span>/);
  assert.match(html, /Magic<small title="Skill bonus \+1">\+1<\/small>/);
  assert.equal(skillBonus('1'), '+1', 'a bare number is shown signed');
  assert.equal(skillBonus('-1'), '-1');
  assert.equal(skillBonus('0'), '', 'no bonus: nothing shown');
  assert.match(traitsHtml(mergeWithDefaults({ sidebar: { skills: { 'Read Person': { level: 'Trained', bonus: '1' } } } })), /Read Person<small title="Skill bonus \+1">\+1<\/small>/);
  assert.match(html, /<b>Ring:<\/b> \+1 save/, 'markup and &nbsp; stripped');
  assert.equal(words('One<br>Two&nbsp; <i>three</i>'), 'One · Two three', 'intended line breaks kept');
  assert.deepEqual(parts('Flavour.<br>Spend 2 Clarity: more.'), { flavour: 'Flavour.', labelled: [['Spend 2 Clarity', 'more.']] });
});

test('the record: "—" when the campaign record is not available, inputs for the Director when it is', () => {
  const sheet = mergeWithDefaults({ hero: { ancestry: 'Human', wealth: '2' } });
  const missing = recordHtml(sheet, null, {});
  assert.match(missing, /The campaign record is not available right now\./);
  assert.doesNotMatch(missing, /data-sheet-info=/);
  const gm = recordHtml(sheet, { college: 'Lorehold', other: 'Notes' }, { canEditInfo: true, lockOf: (p) => (p === 'info.minor' ? 'Cal' : '') });
  assert.match(gm, /data-sheet-info="college" value="Lorehold"/);
  assert.match(gm, /data-sheet-info="minor" value="" disabled placeholder="Cal is editing"/);
});

test('import JSON: one ability, a list, {abilities}, invalid; each to its group by its action type', () => {
  assert.deepEqual(parseImport('{"name":"Mind Spike","actionLabel":"Main action"}').added, { mains: 1 });
  const list = parseImport(JSON.stringify([{ name: 'A', actionLabel: 'Maneuver' }, { name: 'B', type: 'Triggered action' }, { name: 'C', actionLabel: 'Free strike' }, { title: 'Feat' }]));
  assert.deepEqual(list.added, { maneuvers: 1, triggers: 1, freeStrikes: 1, features: 1 });
  assert.equal(list.items.find((i) => i.group === 'triggers').card.trigger, '', 'a triggered action has a trigger field');
  assert.deepEqual(parseImport(JSON.stringify({ abilities: [{ name: 'X' }, { name: 'Y', actionLabel: 'maneuver' }] })).added, { mains: 1, maneuvers: 1 });
  assert.deepEqual(parseImport('{"name":"Z","actionLabel":"Maneuver"}', 'triggers').added, { triggers: 1 }, 'a chosen group wins');
  assert.match(parseImport('{ nope').error, /not valid JSON/);
  assert.match(parseImport('[{"name":"ok"},{"tags":[]}]').error, /Item 2 has no "name"/);
  assert.equal(groupOfImported({ action: 'Free Triggered Action' }), 'triggers');
  const ids = list.items.map((i) => i.card.id);
  assert.equal(new Set(ids).size, ids.length, 'each import gets its own id');
});

test('reorder: a dragged card lands where it is dropped', () => {
  assert.deepEqual(reorder(['a', 'b', 'c', 'd'], 0, 2), ['b', 'a', 'c', 'd']);
  assert.deepEqual(reorder(['a', 'b', 'c', 'd'], 0, 2, true), ['b', 'c', 'a', 'd']);
  assert.deepEqual(reorder(['a', 'b', 'c', 'd'], 3, 0), ['d', 'a', 'b', 'c']);
});

test('the ability edit form round-trips an ability with its power roll, tiers and attribute check', async () => {
  const dom = new JSDOM('<body></body>');
  const ability = normalizeAction({
    id: 'a1', name: 'Mind Spike', actionLabel: 'Main action', tags: ['Psionic', 'Ranged'], range: 'Ranged 10', target: 'One creature', cost: '', useWhen: 'always',
    description: 'You drive a spike.', automation: null,
    tests: [{ id: 't1', label: 'Power Roll + Reason', rollMod: '2', beforeEffect: 'Before.', additionalEffect: 'After.',
      tiers: { low: { damage: '2', damageType: 'psychic', notes: 'push 1' }, mid: { damage: '4', damageType: 'psychic' }, high: { damage: '6', damageType: 'psychic', attributeCheck: { enabled: true, attribute: 'Reason', threshold: '2', effect: 'dazed (save ends)' } } } }],
  }, 'mains');
  let saved = null;
  const panel = openAbilityEditor({ ability, kind: 'mains', doc: dom.window.document, onSave: (result) => { saved = result; return true; } });
  dom.window.document.querySelector('[data-f="name"]').value = 'Mind Spike II';
  dom.window.document.querySelector('[data-row="test"] [data-f="tiers.mid.damage"]').value = '5';
  dom.window.document.querySelector('[data-go]').click();
  await new Promise((r) => setTimeout(r, 0));
  assert.ok(saved, 'saved');
  assert.equal(saved.kind, 'mains');
  const a = saved.ability;
  assert.equal(a.name, 'Mind Spike II');
  assert.deepEqual(a.tags, ['Psionic', 'Ranged']);
  assert.equal(a.tests.length, 1);
  assert.equal(a.tests[0].id, 't1');
  assert.equal(a.tests[0].rollMod, '2');
  assert.equal(a.tests[0].beforeEffect, 'Before.');
  assert.equal(a.tests[0].additionalEffect, 'After.');
  assert.deepEqual(a.tests[0].tiers.low, { damage: '2', damageType: 'psychic', notes: 'push 1', attributeCheck: { enabled: false, attribute: '', threshold: '', effect: '' } });
  assert.equal(a.tests[0].tiers.mid.damage, '5');
  assert.deepEqual(a.tests[0].tiers.high.attributeCheck, { enabled: true, attribute: 'Reason', threshold: '2', effect: 'dazed (save ends)' });
  assert.equal(dom.window.document.querySelector('.sp-modal'), null, 'the form closes once saved');
  panel.close();
  // A form whose save is refused stays open and says so.
  const again = openAbilityEditor({ ability, kind: 'mains', doc: dom.window.document, onSave: () => ({ ok: false, error: 'Cal is editing that.' }) });
  dom.window.document.querySelector('[data-go]').click();
  await new Promise((r) => setTimeout(r, 0));
  assert.match(dom.window.document.querySelector('[data-err]').textContent, /Cal is editing/);
  again.close();
  dom.window.close();
});

test('field locks from the page: taken, refused while somebody else holds one, renewed, released', async () => {
  const calls = [];
  const holders = {};
  const fetchImpl = async (url, options = {}) => {
    const body = options.body ? new URLSearchParams(options.body) : null;
    const action = body ? body.get('action') : new URL(url).searchParams.get('action');
    calls.push(action);
    const field = body?.get('field');
    if (action === 'live') return { json: async () => ({ success: true, revision: 4, locks: Object.entries(holders).map(([f, user]) => ({ field: f, user, name: user, mine: user === 'me' })) }) };
    if (action === 'lock' || action === 'heartbeat') {
      if (holders[field] && holders[field] !== 'me') return { json: async () => ({ success: false, locked: false, holder: { user: holders[field], name: 'Cal' } }) };
      holders[field] = 'me';
      return { json: async () => ({ success: true, locked: true }) };
    }
    if (action === 'unlock') { delete holders[field]; return { json: async () => ({ success: true, released: true }) }; }
    return { json: async () => ({ success: false }) };
  };
  let tick = null;
  const live = createSheetLive({ character: 'cal', endpoint: 'http://localhost/handler.php', fetchImpl, isHidden: () => false, timers: { set() {}, clear() {}, every: (fn) => { tick = fn; return 1; }, stop() {} } });
  assert.deepEqual(await live.acquire(['features']), { ok: true });
  assert.deepEqual(live.held(), ['features']);
  holders['hero.name'] = 'cal';
  await live.poll();
  assert.equal(live.lockOf('hero.name'), 'cal');
  assert.equal(live.lockOf('hero'), 'cal', 'a lock covers the paths inside and around it');
  assert.equal(live.lockOf('features'), '', 'my own lock is not somebody else\'s');
  const refused = await live.acquire(['actions.mains', 'hero.name']);
  assert.equal(refused.ok, false);
  assert.deepEqual(live.held(), ['features'], 'all or nothing: the first lock is given back');
  await tick();                                                  // heartbeat
  assert.ok(calls.includes('heartbeat'));
  await live.release(['features']);
  assert.deepEqual(live.held(), []);
  assert.equal(holders.features, undefined);
});


test('portraits: a stored path under dnd/ is resolved from the page; the first picture there is wins; initials otherwise', () => {
  assert.equal(mediaUrl('portraits/cal.png', '/dnd/'), '/dnd/portraits/cal.png');
  assert.equal(mediaUrl('./portraits/cal.png', '/dnd'), '/dnd/portraits/cal.png');
  assert.equal(mediaUrl('/dnd/vtt/storage/tokens/t.png', '/dnd/'), '/dnd/vtt/storage/tokens/t.png', 'absolute paths stay');
  assert.equal(mediaUrl('https://x.test/a.png', '/dnd/'), 'https://x.test/a.png');
  assert.equal(mediaUrl('', '/dnd/'), '');
  assert.equal(pickPortrait(['', null, 'portraits/heroes.png', '/dnd/vtt/storage/tokens/t.png'], '/dnd/'), '/dnd/portraits/heroes.png', 'the heroes list when the record has none');
  assert.equal(pickPortrait(['', undefined, '/dnd/vtt/storage/tokens/t.png'], '/dnd/'), '/dnd/vtt/storage/tokens/t.png', 'then the map token');
  assert.equal(pickPortrait(['', ''], '/dnd/'), '');
  assert.equal(initialsOf('Cal'), 'C');
  assert.equal(initialsOf('Nora Ann Vu'), 'NV');
  const sheet = mergeWithDefaults({ hero: { name: 'Cal' } });
  const withPic = statusHtml(sheet, { portrait: '/dnd/portraits/cal.png' });
  assert.match(withPic, /class="sp-pic" style="background-image:url\('\/dnd\/portraits\/cal\.png'\)"/);
  const none = statusHtml(sheet, { portrait: '' });
  assert.match(none, /class="sp-pic sp-pic--initials" style=""[^>]*>C<\/div>/, 'no picture anywhere: initials');
  const rec = recordHtml(sheet, { portrait: '/dnd/portraits/cal.png' }, {});
  assert.match(rec, /<img class="sp-portrait" src="\/dnd\/portraits\/cal\.png"/);
});

test('ability cards: no cost pill for "None"; flavour italic, rules text roman; long rules text clamped with More', () => {
  assert.equal(costLabel('None'), '');
  assert.equal(costLabel(' — '), '');
  assert.equal(costLabel('3 Clarity'), '3 Clarity');
  const plainCard = abilityCard(normalizeAction({ name: 'Protective Attack', cost: 'None', description: 'The target is taunted until the end of their next turn.' }), 'mains', 0);
  assert.doesNotMatch(plainCard, /sp-cost/, 'a "None" cost shows no pill');
  assert.match(plainCard, /<p class="sp-flavour">The target is taunted/);
  assert.doesNotMatch(plainCard, /data-sheet-more/, 'short text is not clamped');
  const long = 'Choose one of the following effects: You teleport a size 1S or smaller object adjacent to you into an unoccupied space adjacent to you. Until the start of your next turn, a part of your body shoots a shower of harmless noisy sparks that light up each square adjacent to you. You ignite or snuff out every mundane light source of 1L or smaller adjacent to you.';
  const t = abilityText(long);
  assert.equal(t.flavour, '', 'a long first line is rules text, not flavour');
  assert.equal(t.effect, long);
  const card = abilityCard(normalizeAction({ name: 'Minor Miracle', cost: 'None', description: long }), 'mains', 0);
  assert.match(card, /<div class="sp-fx sp-clamp"><p class="sp-effect">Choose one/);
  assert.doesNotMatch(card, /class="sp-flavour"/);
  assert.match(card, /class="sp-card sp-ab main long/);
  assert.match(card, /data-sheet-more aria-expanded="false">More<\/button>/);
  assert.deepEqual(abilityText('A bolt.<br>It hums.<br>Effect: Push 2.'), { flavour: 'A bolt.', effect: 'It hums.', labelled: [['Effect', 'Push 2.']] });
  // The toggle opens and closes the card.
  const dom = new JSDOM(`<body>${card}</body>`);
  const button = dom.window.document.querySelector('[data-sheet-more]');
  toggleMore(button);
  assert.ok(button.closest('.sp-ab').classList.contains('open'));
  assert.equal(button.textContent, 'Less');
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  toggleMore(button);
  assert.equal(button.textContent, 'More');
});

test('post-to-chat buttons are gold icons that say what they do', () => {
  const html = featureCard({ id: 'f1', title: 'Grit', text: 'Effect: tough.' }, 0, { chat: true });
  assert.match(html, /class="sp-ic sp-chat" data-sheet-chat="feature:f1" title="Post this feature to the chat" aria-label="Post Grit to chat"><svg/);
  assert.doesNotMatch(html, /💬/);
  const traits = traitsHtml(mergeWithDefaults({ sidebar: { lists: { languages: ['Caelian'] } } }), { chat: true });
  assert.match(traits, /data-sheet-chat="languages" title="Post this to the chat" aria-label="Post Languages to chat"><svg/);
});

test('skills: one row per group with one fixed label column, so groups line up and rules run the same length', async () => {
  const { readFileSync } = await import('node:fs');
  const css = readFileSync(new URL('../../../../../character_sheet/parts/sheet-parts.css', import.meta.url), 'utf8');
  assert.match(css, /\.sp-skills \.sp-body \{ display: grid; grid-template-columns: 1fr; \}/);
  assert.match(css, /\.sp-sg \{ display: grid; grid-template-columns: 108px minmax\(0, 1fr\);/);
  assert.match(css, /padding: 0 max\(12px, calc\(var\(--sp-temp, 0%\) \+ 6px\)\) 0 12px/, 'the state word keeps 6px+ clear of the blue segment');
});
