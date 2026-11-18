import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  dummyOf, isTestDummy, dummyIdFor, isDummyId, dummyPlacementId, dummySheet, newDummyRecord, answerDummyRequest,
  requestFields, installDummySheetShim, dummyName,
} from '../test-dummy.mjs';

// Brandon, November 17, 2026: a test dummy "will behave exactly as my PC except that it will basically be a duplicate
// copy that will leave all of their character sheet and stuff alone. SO its super importatn that it doesnt touch
// anything for the actual players." Only the Director sees it, it uses its own abilities, its Stamina starts full.

const heroSheet = {
  hero: { name: 'Cal', vitals: { staminaMax: 30, currentStamina: 12, currentRecoveries: 2, recoveries: 8 }, resource: { title: 'Wrath', value: 3 }, surges: 1, victories: 2 },
  actions: { main: [{ name: 'Judgment' }] }, sidebar: { lists: { immunity: ['fire 5'] } },
};
const dummy = (record = {}, hp = { current: '30', max: '30' }, extra = {}) => ({ id: 'tok-1', name: 'Test · Cal', hp, metadata: { testDummy: { hero: 'cal', resource: 3, surges: 0, recoveries: 8, victories: 2, ...record } }, ...extra });

test('a dummy is known by its record, and goes by its own id', () => {
  assert.equal(isTestDummy(dummy()), true);
  assert.equal(isTestDummy({ id: 'x', name: 'Cal', metadata: { sourceFolderName: "PC's" } }), false);
  assert.equal(dummyIdFor(dummy()), 'dummy:tok-1');
  assert.equal(isDummyId('dummy:tok-1'), true);
  assert.equal(isDummyId('cal'), false);
  assert.equal(dummyPlacementId('dummy:tok-1'), 'tok-1');
  assert.equal(dummyName('Cal'), 'Test · Cal');
  assert.deepEqual(newDummyRecord('Cal', heroSheet), { hero: 'cal', resource: 3, surges: 0, recoveries: 8, victories: 2 }, 'Recoveries full, no surges');
});

test('its sheet is the hero\'s, with its own numbers in place; the hero\'s sheet is not changed', () => {
  const before = JSON.stringify(heroSheet);
  const sheet = dummySheet(heroSheet, dummy({ resource: 5, surges: 2, recoveries: 6 }, { current: '17', max: '30' }, { tempStamina: 4 }));
  assert.equal(sheet.hero.vitals.currentStamina, 17);
  assert.equal(sheet.hero.vitals.tempStamina, 4);
  assert.equal(sheet.hero.vitals.currentRecoveries, 6);
  assert.equal(sheet.hero.resource.value, 5);
  assert.equal(sheet.hero.surges, 2);
  assert.deepEqual(sheet.actions, heroSheet.actions, 'the hero\'s abilities');
  assert.deepEqual(sheet.sidebar.lists.immunity, ['fire 5'], 'and immunities');
  assert.equal(JSON.stringify(heroSheet), before);
});

test('every write lands on the dummy, and a write it has no part in is refused', () => {
  const ask = (action, params, placement = dummy()) => answerDummyRequest({ action, method: 'POST', params, heroSheet, placement });
  assert.deepEqual(ask('sync-resource', { delta: '-2' }).record.resource, 1);
  assert.deepEqual(ask('sync-resource', { spend: '5' }).json, { success: true, paid: false, reason: 'insufficient resource', resource: 3 });
  assert.equal(ask('sync-surges', { delta: '2' }).record.surges, 2);
  assert.equal(ask('sync-surges', { value: '0' }).record.surges, 0);
  assert.equal(ask('sync-victories', { delta: '1' }).record.victories, 3);
  assert.equal(ask('sync-vitals', { spendRecoveries: '1' }).record.recoveries, 7);
  const recovery = ask('sync-vitals', { useRecovery: '1' }, dummy({}, { current: '5', max: '30' }));
  assert.equal(recovery.json.spent, 1);
  assert.equal(recovery.json.currentStamina, 15, 'a third of 30');
  assert.deepEqual(recovery.stamina, { mode: 'heal', amount: 10 });
  assert.equal(recovery.record.recoveries, 7);
  assert.deepEqual(ask('sync-vitals', { staminaDelta: '-12' }).stamina, { mode: 'damage', amount: 12 });
  assert.deepEqual(ask('sync-stamina', { delta: '-5' }).stamina, { set: { current: 25, temp: 0 } });
  for (const action of ['save', 'save-fields', 'respite', 'sync-hero-tokens', 'lock'])
    assert.equal(ask(action, {}).json.success, false, `${action} is refused`);
  assert.equal(answerDummyRequest({ action: 'summary', heroSheet, placement: { id: 'x', name: 'Cal' } }).json.success, false, 'only a dummy');
});

test('the stand-in answers on the page: a dummy\'s request never reaches the server', async () => {
  const sent = [], records = [], staminas = [];
  const target = {
    location: { href: 'http://site/dnd/vtt/' },
    fetch: async (url, init = {}) => { sent.push([String(url), init?.body ? String(init.body) : '']); return new Response(JSON.stringify({ success: true, data: heroSheet }), { headers: { 'Content-Type': 'application/json' } }); },
  };
  const placement = dummy();
  installDummySheetShim(target, {
    placement: (id) => (id === 'tok-1' ? placement : null),
    heroSheet: async () => heroSheet,
    setRecord: (id, record) => records.push([id, record]),
    stamina: (id, change) => staminas.push([id, change]),
  });
  const body = new URLSearchParams({ action: 'sync-resource', character: 'dummy:tok-1', source: 'vtt', delta: '2' });
  const answer = await (await target.fetch('/dnd/character_sheet/handler.php', { method: 'POST', body })).json();
  assert.equal(answer.resource, 5);
  assert.deepEqual(records, [['tok-1', { hero: 'cal', resource: 5, surges: 0, recoveries: 8, victories: 2 }]]);
  const summary = await (await target.fetch('/dnd/character_sheet/handler.php?action=summary&character=dummy%3Atok-1&source=vtt')).json();
  assert.equal(summary.data.hero.resource.value, 3);
  assert.equal(sent.length, 0, 'nothing sent with a dummy id');
  // A read the hero's answer serves goes out for the hero; a hero's own request passes untouched.
  await target.fetch('/dnd/api/campaign.php?action=character&character=dummy%3Atok-1');
  assert.match(sent.at(-1)[0], /character=cal/);
  await target.fetch('/dnd/character_sheet/handler.php', { method: 'POST', body: new URLSearchParams({ action: 'sync-surges', character: 'cal', value: '0' }) });
  assert.match(sent.at(-1)[1], /character=cal/);
  // Its conditions to the hero's sheet: refused at the page.
  const refused = await (await target.fetch('/dnd/vtt/api/v2/hero-conditions.php', { method: 'POST', body: JSON.stringify({ character: 'dummy:tok-1' }) })).json();
  assert.equal(refused.success, false);
  assert.equal(sent.length, 2);
  assert.deepEqual(requestFields('/x?a=1', { body: '{"b":2}' }), { a: '1', b: 2 });
});

test('the board never links a dummy to its hero or player, and reads the hero for what it is', () => {
  const board = readFileSync(new URL('../board-interactions.js', import.meta.url), 'utf8');
  assert.match(board, /function getCharacterSheetProfileIdForPlacement\(placement\) \{\s*\/\/[^\n]*\n\s*if \(isTestDummy\(placement\)\) return '';/);
  assert.match(board, /function isPlacementPlayerOwned\(placement, metadata = null\) \{\s*if \(isTestDummy\(placement\)\) return false;/);
  assert.match(board, /function isPlacementInPlayerFolder\(placement, metadata = null\) \{\s*if \(isTestDummy\(placement\)\) return false;/);
  assert.match(board, /return isDummyId\(id\) \? '' : normalizeProfileId\(id\);/, 'its prompts are the Director\'s');
  assert.match(board, /const profileId = sheetIdForPlacement\(placement\);\s*if \(!profileId \|\| !isHeroSheetId\(profileId\)\) \{/, 'automation reads its sheet');
  assert.match(board, /placement\.hidden = true;\s*placement\.combatTeam = 'ally';/, 'the Director\'s only');
  const store = readFileSync(new URL('../../../../lib/SyncV2Store.php', import.meta.url), 'utf8');
  assert.match(store, /if \(is_array\(\$metadata\['testDummy'\] \?\? null\)\) \{\s*return null;/, 'no player\'s token on the server');
  const levels = readFileSync(new URL('../../state/normalize/map-levels.js', import.meta.url), 'utf8');
  assert.match(levels, /if \(metadata\.testDummy && typeof metadata\.testDummy === 'object'\) \{\s*return null;/);
  const boot = readFileSync(new URL('../../bootstrap.js', import.meta.url), 'utf8');
  assert.match(boot, /^\/\/[^\n]*\nimport '\.\/ui\/test-dummy\.mjs';/, 'the stand-in goes in before anything asks for a sheet');
  const library = readFileSync(new URL('../token-library.js', import.meta.url), 'utf8');
  assert.match(library, /const dragData = asTestDummy\(builtDrag\) \?\? builtDrag;/);
});
