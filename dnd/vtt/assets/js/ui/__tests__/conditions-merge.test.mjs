import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

import {
  CONDITION_NAMES, PICKER_CONDITION_NAMES, CUSTOM_CONDITION_NAME, getConditionDefinition, conditionOptionLabel,
  parseConditionText, normalizeSheetConditions, mirrorFromTokenConditions, applySheetConditionChange, sameSheetConditions, conditionChipLabel,
} from '../../../../../character_sheet/parts/conditions.js';
import { conditionPickerHtml, statusHtml, wireConditionPicker } from '../../../../../character_sheet/parts/sheet-parts.js';
import { mergeWithDefaults } from '../../../../../character_sheet/parts/sheet-model.js';
import { editHeroCondition } from '../../../../../character_sheet/parts/condition-edits.js';
import { shouldMirrorConditionChange, createConditionMirror, seedTokenConditions, createConditionTracker, heroSceneOrder, pickHeroPlacement, findHeroToken } from '../../services/condition-sync-service.js';
import { conditionDelta, applyConditionDelta } from '../../../../../character_sheet/parts/conditions.js';
import { mountCharacterSummaryPanel } from '../character-summary-panel.js';

// Brandon, October 2026: "Idk why you would have a condition that is in your character sheet and not in the vtt or
// vice versa. So probably merge them." One list (character_sheet/parts/conditions.js) for the token-settings menu,
// the map's side panel and the character sheet; one value: the token's while the hero is on the map, mirrored on the
// sheet; the sheet's own with no token. The server's halves: api/v2/tests/hero-conditions.test.php and
// sheet-conditions.test.php. The sheet page itself: sheet-conditions-page.test.mjs.

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const board = read('../board-interactions.js');
const panelSource = read('../character-summary-panel.js');
const reply = (value, status = 200) => ({ ok: status < 400, status, json: async () => value, clone() { return this; } });

test('one list: the token menu, the side panel and the sheet all draw from the shared module', () => {
  // The token's menu: the shared names and labels; its old copy of the list is gone.
  assert.match(board, /import \{CONDITION_NAMES,CUSTOM_CONDITION_NAME,getConditionDefinition,conditionOptionLabel\} from '\.\.\/\.\.\/\.\.\/\.\.\/character_sheet\/parts\/conditions\.js';/);
  assert.doesNotMatch(board, /const CONDITION_DEFINITIONS = \[/);
  assert.doesNotMatch(board, /While you are slowed, your speed is 2/, 'the rules text lives in one place');
  assert.match(board, /CONDITION_NAMES\.map\(\(name\) => \{\s*const value = escapeHtml\(name\);\s*const label = escapeHtml\(conditionOptionLabel\(name\)\);/);
  // The panel: the shared picker; its nine-name copy is gone.
  assert.doesNotMatch(panelSource, /const CONDITION_OPTIONS = \[/);
  assert.match(panelSource, /conditionPickerHtml\(\{ title: 'Add a condition to this token' \}\)/);
  // The sheet and the panel draw the same picker: SE / EOT, every condition with a name, then Other…
  const dom = new JSDOM(`<body>${conditionPickerHtml()}</body>`);
  const picks = [...dom.window.document.querySelectorAll('[data-character-condition-pick]')].map((b) => b.dataset.characterConditionPick);
  assert.deepEqual(picks, PICKER_CONDITION_NAMES);
  assert.deepEqual(PICKER_CONDITION_NAMES, ['Bleeding', 'Dazed', 'Frightened', 'Grabbed', 'Invisible', 'Concealed', 'Hidden', 'Prone', 'Restrained', 'Slowed', 'Taunted', 'Unconscious', 'Weakened']);
  assert.ok(dom.window.document.querySelector('[data-character-condition-other]'), '"Other…" for a condition typed by hand');
  assert.deepEqual([...dom.window.document.querySelectorAll('[data-condition-duration]')].map((b) => b.textContent), ['SE', 'EOT']);
  // The token's menu offers the same plus the damage riders (they need an amount: its own dialog) and Other.
  assert.deepEqual(CONDITION_NAMES, [...PICKER_CONDITION_NAMES, 'damageWeakness', 'damageImmunity', CUSTOM_CONDITION_NAME]);
  assert.equal(conditionOptionLabel('damageWeakness'), 'Weakness');
  assert.equal(conditionOptionLabel('damageImmunity'), 'Immunity');
  assert.equal(getConditionDefinition('grappled')?.name, 'Grabbed', 'the alias');
  assert.match(getConditionDefinition('SLOWED').description, /speed is 2/);
});

test('migration: an old sheet\'s free text is read leniently into {name, duration}', () => {
  const cases = [
    ['Slowed, save ends', 'Slowed', 'save-ends'],
    ['Dazed (EOT)', 'Dazed', 'end-of-turn'],
    ['dazed - end of turn', 'Dazed', 'end-of-turn'],
    ['Grappled (SE)', 'Grabbed', 'save-ends'],
    ['PRONE', 'Prone', 'save-ends'],
    ['weakened until the end of your next turn', 'Weakened', 'end-of-turn'],
    ['Frightened; saves end', 'Frightened', 'save-ends'],
    ['custom thing', 'custom thing', 'save-ends'],
    ['Cursed by the lich, EoT', 'Cursed by the lich', 'end-of-turn'],
  ];
  for (const [text, name, type] of cases) assert.deepEqual(parseConditionText(text), { name, duration: { type } }, text);
  assert.equal(parseConditionText('  '), null);
  assert.equal(parseConditionText('(save ends)'), null, 'a duration with no condition is nothing');
  // A stored list of either kind, structured, one of each.
  assert.deepEqual(normalizeSheetConditions(['Slowed, save ends', { name: 'slowed', duration: { type: 'save-ends' } }, 'Dazed (EOT)', '', null, { name: 'hiddenEffect' }]),
    [{ name: 'Slowed', duration: { type: 'save-ends' } }, { name: 'Dazed', duration: { type: 'end-of-turn' } }]);
  // The sheet reads it so; nothing is rewritten until the list next changes (the baseline matches the page).
  const sheet = mergeWithDefaults({ hero: { conditions: ['Slowed, save ends', 'custom thing'] } });
  assert.deepEqual(sheet.hero.conditions, [{ name: 'Slowed', duration: { type: 'save-ends' } }, { name: 'custom thing', duration: { type: 'save-ends' } }]);
  // The sheet shows them as themed chips with the duration small, and a × for whoever may edit.
  const html = new JSDOM(`<body>${statusHtml(sheet, { canEdit: true, conditions: sheet.hero.conditions })}</body>`).window.document;
  const chips = [...html.querySelectorAll('.sp-cond:not(.sp-cond--add)')];
  assert.deepEqual(chips.map((c) => [c.querySelector('.sp-cond__name').textContent, c.querySelector('.sp-cond__dur')?.textContent]), [['Slowed', 'SE'], ['custom thing', 'SE']]);
  assert.equal(chips[1].querySelector('[data-sheet-condition-remove]').dataset.sheetConditionRemove, '1');
  const readOnly = new JSDOM(`<body>${statusHtml(sheet, { canEdit: false, conditions: [] })}</body>`).window.document;
  assert.equal(readOnly.querySelector('[data-character-condition-picker]'), null);
  assert.match(readOnly.querySelector('.sp-conds').textContent, /No conditions/);
});

test('the sheet keeps the token\'s list without the Director\'s hidden effects; changes are by name and duration', () => {
  const token = [
    { name: 'Slowed', duration: { type: 'end-of-turn', targetTokenId: 't1', targetTokenName: 'Cal' }, sourceName: 'Ogre' },
    { name: 'hiddenEffect', hidden: true, label: 'Curse', duration: { type: 'save-ends' } },
    { name: 'Marked', hidden: true, shown: true, duration: { type: 'save-ends' } },
    { name: 'damageWeakness', amount: 5, damageType: 'fire', duration: { type: 'save-ends' } },
  ];
  assert.deepEqual(mirrorFromTokenConditions(token), [
    { name: 'Slowed', duration: { type: 'end-of-turn' } },
    { name: 'Marked', duration: { type: 'save-ends' } },
    { name: 'damageWeakness', duration: { type: 'save-ends' }, amount: 5, damageType: 'fire' },
  ]);
  assert.equal(conditionChipLabel(mirrorFromTokenConditions(token)[2]), 'Fire weakness 5');
  const list = [{ name: 'Slowed', duration: { type: 'save-ends' } }];
  assert.deepEqual(applySheetConditionChange(list, 'add', { name: 'slowed', duration: 'save-ends' }), list, 'no second Slowed (SE)');
  assert.equal(applySheetConditionChange(list, 'add', { name: 'Slowed', duration: 'end-of-turn' }).length, 2, 'Slowed (EOT) is another');
  assert.deepEqual(applySheetConditionChange(list, 'remove', { name: 'Slowed', duration: { type: 'save-ends' } }), []);
  assert.ok(sameSheetConditions(['Slowed, SE'], list));
});

test('which map page sends a change: a hero token\'s confirmed change on any scene; never a token just placed', () => {
  const change = (fields, extra = {}) => ({ kind: 'upsert', sceneId: 's1', placementId: 't1', entityRevision: 4, changedFields: fields, ...extra });
  const base = { profileId: 'cal', currentUserId: 'gm', isGm: true };
  assert.equal(shouldMirrorConditionChange({ ...base, mutation: change(['conditions', 'condition']) }), true, 'the Director\'s page');
  assert.equal(shouldMirrorConditionChange({ ...base, isGm: false, currentUserId: 'cal', mutation: change(['conditions']) }), true, 'the hero\'s own player\'s page');
  assert.equal(shouldMirrorConditionChange({ ...base, isGm: false, currentUserId: 'sharon', actorId: 'sharon', mutation: change(['conditions']) }), true, 'the page that made the change');
  assert.equal(shouldMirrorConditionChange({ ...base, isGm: false, currentUserId: 'sharon', actorId: 'zepha', mutation: change(['conditions']) }), false, 'an onlooker\'s page leaves it to them');
  assert.equal(shouldMirrorConditionChange({ ...base, mutation: change(['column', 'row']) }), false, 'a move is not a condition change');
  assert.equal(shouldMirrorConditionChange({ ...base, mutation: change(['conditions'], { sceneId: 's2' }) }), true, 'a real change on another scene is still a real change');
  assert.equal(shouldMirrorConditionChange({ ...base, profileId: '', mutation: change(['conditions']) }), false, 'not a hero');
  assert.equal(shouldMirrorConditionChange({ ...base, mutation: change(['*'], { entityRevision: 1 }) }), false, 'a token just placed takes the sheet\'s list instead');
  // The board sees every confirmed change; only what changed is scheduled; sending never patches a token.
  assert.match(board, /for \(const mutation of mutations\) \{\s*mirrorHeroConditions\(mutation, context\);/);
  assert.match(board, /const ops = heroConditionTracker\.observe\(mutation\.placementId, mutation\.entityRevision, placement\.conditions \?\? placement\.condition \?\? null, placement\.conditionsQuietMark \?\? null\);/);
  assert.match(board, /heroConditionMirror\.schedule\(profileId, ops, \{\s*placementId: mutation\.placementId, revision: mutation\.entityRevision,/);
  const mirror = board.slice(board.indexOf('function mirrorHeroConditions('), board.indexOf('function heroProfileOf('));
  assert.ok(mirror.length > 200 && !/updatePlacementById|applyConditionToPlacement/.test(mirror));
  assert.ok(board.indexOf('const heroConditionMirror = createConditionMirror(') < board.indexOf('function applyConfirmedPlacementBatch('));
  assert.ok(board.indexOf('const heroConditionTracker = createConditionTracker(') < board.indexOf('function applyConfirmedPlacementBatch('));
});

test('deltas: a token\'s change is only what it changed; the sheet applies it to its own list', () => {
  const before = [{ name: 'Slowed', duration: { type: 'save-ends' } }, { name: 'Prone', duration: { type: 'save-ends' } }, { name: 'hiddenEffect', hidden: true, duration: { type: 'save-ends' } }];
  const after = [{ name: 'Slowed', duration: { type: 'end-of-turn', targetTokenId: 't1' } }, { name: 'Dazed', duration: { type: 'save-ends' } }];
  assert.deepEqual(conditionDelta(before, after), [
    { op: 'duration', condition: { name: 'Slowed', duration: { type: 'end-of-turn' } }, from: 'save-ends' },
    { op: 'add', condition: { name: 'Dazed', duration: { type: 'save-ends' } } },
    { op: 'remove', condition: { name: 'Prone', duration: { type: 'save-ends' } } },
  ], 'saved Slowed turned end of turn, Dazed added, Prone ended; the hidden effect is not the sheet\'s');
  assert.deepEqual(conditionDelta(before, before), []);
  // On the sheet: its own list, whatever else it holds.
  const sheet = ['Slowed, save ends', 'Weakened (EOT)', 'Prone'];
  assert.deepEqual(applyConditionDelta(sheet, conditionDelta(before, after)), [
    { name: 'Slowed', duration: { type: 'end-of-turn' } }, { name: 'Weakened', duration: { type: 'end-of-turn' } }, { name: 'Dazed', duration: { type: 'save-ends' } },
  ]);
  assert.deepEqual(applyConditionDelta([], [{ op: 'remove', condition: { name: 'Prone' } }]), [], 'taking off one not there is nothing');
});

test('a delta from a stale token adds only the changed condition; opening its map sends nothing', () => {
  const tracker = createConditionTracker();
  // The old map's token still holds last fight's Slowed and Bleeding. The page loads / the scene opens: recorded only.
  const old = [{ name: 'Slowed', duration: { type: 'save-ends' } }, { name: 'Bleeding', duration: { type: 'save-ends' } }];
  tracker.primeSnapshot({ state: { placements: { old: { 'cal-old': { _entityRevision: 9, conditions: old } } } } });
  assert.equal(tracker.observe('cal-old', 9, old), null, 'the same revision again (a re-render, a poll) is nothing');
  assert.equal(tracker.observe('cal-old', 10, old), null, 'a change of something else (a move) is nothing');
  // Somebody puts Restrained on it: only Restrained goes.
  assert.deepEqual(tracker.observe('cal-old', 11, [...old, { name: 'Restrained', duration: { type: 'end-of-turn' } }]),
    [{ op: 'add', condition: { name: 'Restrained', duration: { type: 'end-of-turn' } } }]);
  assert.equal(tracker.observe('cal-old', 10, old), null, 'a late, older event is ignored');
  assert.equal(tracker.observe('cal-new', 1, old), null, 'a token never seen before (just placed) sends nothing');
  // The new-fight wipe and its Undo write the sheets themselves: their token change carries a new quiet mark.
  assert.equal(tracker.observe('cal-old', 12, [], 'nf-1'), null, 'a quiet change is recorded, not sent');
  assert.deepEqual(tracker.observe('cal-old', 13, [{ name: 'Prone' }], 'nf-1'), [{ op: 'add', condition: { name: 'Prone', duration: { type: 'save-ends' } } }], 'the next real change is sent');
  // The sheet had been wiped: it ends with Restrained only, not last fight's leftovers.
  assert.deepEqual(applyConditionDelta([], [{ op: 'add', condition: { name: 'Restrained', duration: { type: 'end-of-turn' } } }]), [{ name: 'Restrained', duration: { type: 'end-of-turn' } }]);
  // The board records every snapshot (page load, recovery, scene data) before anything else; a scene opened and the
  // page loading read nothing onto tokens.
  assert.match(board, /function reconcileTokenMovementSnapshot\(snapshot, context = \{\}\) \{[\s\S]{0,300}heroConditionTracker\.primeSnapshot\(snapshot\);/);
  const routeChange = board.slice(board.indexOf('if (changeSet.sceneRouting) {'), board.indexOf('if (changeSet.grid) {'));
  assert.ok(routeChange.length > 50 && !/Hydration|fetchAndApplyCharacterStamina|seedHeroTokenConditions/.test(routeChange), 'opening a scene reads nothing onto its tokens');
  const startup = board.slice(board.indexOf('// Sync V2 starts its authenticated private transport'), board.indexOf('startListeningForSheetSync();'));
  assert.ok(startup.length > 50 && !/Hydration/.test(startup), 'the page loading writes no token');
});

test('the hero\'s token: the players\' scene first, else the Director\'s open scene, else none', () => {
  const profileOf = (p) => p.profileId || '';
  assert.deepEqual(heroSceneOrder({ playerActiveSceneId: 'players', activeSceneId: 'director' }), ['players', 'director']);
  assert.deepEqual(heroSceneOrder({ playerActiveSceneId: 'players', activeSceneId: 'director', playerMapDisabled: true }), ['director']);
  assert.deepEqual(heroSceneOrder({ activeSceneId: 'director' }), ['director'], 'a player\'s page: its scene is the players\'');
  const boardState = {
    playerActiveSceneId: 'players', activeSceneId: 'director',
    placements: {
      director: [{ id: 'cal-d', profileId: 'cal' }, { id: 'rowan-d', profileId: 'rowan' }],
      players: [{ id: 'cal-p', profileId: 'cal' }, { id: 'zepha-p', profileId: 'zepha', hidden: true }],
    },
  };
  assert.deepEqual(findHeroToken(boardState, 'cal', profileOf), { sceneId: 'players', placement: boardState.placements.players[0] });
  assert.equal(findHeroToken(boardState, 'rowan', profileOf).placement.id, 'rowan-d', 'not on the players\' scene: the Director\'s');
  assert.equal(findHeroToken(boardState, 'zepha', profileOf), null, 'hidden: none');
  assert.equal(findHeroToken(boardState, 'indigo', profileOf), null, 'off the map');
  assert.equal(pickHeroPlacement([{ id: 'a', profileId: 'cal' }, { id: 'b', profileId: 'cal' }], 'cal', profileOf), null, 'two and no primary: no single answer');
  assert.equal(pickHeroPlacement([{ id: 'a', profileId: 'cal' }, { id: 'b', profileId: 'cal', primaryPc: true }], 'cal', profileOf).id, 'b');
  // The sheet's Stamina goes to that same token.
  assert.match(board, /const heroToken = findHeroToken\(boardApi\.getState\?\.\(\)\?\.boardState \?\? \{\}, characterId, heroProfileOf\);/);
});

test('the delta sender: one write per burst, the ops in order, the newest revision; a failed write goes again', async () => {
  const posts = [];
  const timers = [];
  let fail = false;
  const fetchImpl = async (url, options) => {
    const body = new URLSearchParams(options.body);
    posts.push(Object.fromEntries(body));
    if (fail) return reply({ success: false, error: 'locked' });
    return reply({ success: true, applied: true, conditions: [] });
  };
  const told = [];
  const mirror = createConditionMirror({ endpoint: '/dnd/character_sheet/handler.php', fetchImpl, broadcast: (m) => told.push(m),
    timers: { set: (fn) => { timers.push(fn); return timers.length; }, clear: (id) => { timers[id - 1] = null; } } });
  mirror.schedule('Cal', [{ op: 'add', condition: { name: 'Slowed', duration: { type: 'save-ends' } } }], { placementId: 't1', revision: 5 });
  mirror.schedule('cal', [{ op: 'add', condition: { name: 'Dazed', duration: 'end-of-turn' } }], { placementId: 't1', revision: 6 });
  for (const run of timers.splice(0)) await run?.();
  assert.equal(posts.length, 1, 'one write');
  assert.deepEqual({ ...posts[0], delta: JSON.parse(posts[0].delta) }, {
    action: 'sync-conditions', source: 'vtt', character: 'cal', placementId: 't1', revision: '6',
    delta: [{ op: 'add', condition: { name: 'Slowed', duration: { type: 'save-ends' } } }, { op: 'add', condition: { name: 'Dazed', duration: { type: 'end-of-turn' } } }],
  });
  assert.equal('conditions' in posts[0], false, 'never a whole list');
  assert.equal(told.length, 1, 'other pages of this browser are told');
  fail = true;
  mirror.schedule('cal', [{ op: 'remove', condition: { name: 'Slowed' } }], { placementId: 't1', revision: 7 });
  for (const run of timers.splice(0)) await run?.();
  fail = false;
  mirror.schedule('cal', [{ op: 'remove', condition: { name: 'Dazed', duration: 'end-of-turn' } }], { placementId: 't1', revision: 8 });
  for (const run of timers.splice(0)) await run?.();
  assert.deepEqual(JSON.parse(posts.at(-1).delta).map((op) => op.condition.name), ['Slowed', 'Dazed'], 'the failed change goes with the next');
  assert.equal(posts.at(-1).revision, '8');
});

test('a token placed with no conditions takes the sheet\'s list; one that has any keeps its own', () => {
  const seeded = seedTokenConditions([], ['Slowed (EOT)', 'Prone'], { placementId: 't9', tokenName: 'Cal' });
  assert.deepEqual(seeded, [
    { name: 'Slowed', duration: { type: 'end-of-turn', targetTokenId: 't9', targetTokenName: 'Cal' } },
    { name: 'Prone', duration: { type: 'save-ends' } },
  ]);
  assert.equal(seedTokenConditions([{ name: 'Dazed' }], ['Prone']), null);
  assert.equal(seedTokenConditions([], []), null);
  assert.match(board, /if \(seedConditions\) \{\s*seedHeroTokenConditions\(placementId, sceneId, data, pendingSavePromise\)\.catch/, 'the stamina read of a placed token seeds it');
  assert.match(board, /fetchAndApplyCharacterStamina\(placement\.id, activeSceneId, dropSavePromise, \{ seedConditions: true \}\);/, 'only a token just dropped');
  assert.match(board, /pcPlacements\.map\(\(placement\) => fetchAndApplyCharacterStamina\(placement\.id, sceneId\)\)/, 'never a scene\'s heroes read all at once');
  assert.match(board, /if \(ensurePlacementConditions\(target\?\.conditions \?\? target\?\.condition \?\? null\)\.length\) return;/, 'checked again as it is written');
});

test('a sheet change: on the token while the hero is on the map, then the same change on the sheet; with no token, the sheet\'s list', async () => {
  const calls = [];
  let onMap = true;
  const fetchImpl = async (url, options) => {
    if (String(url).includes('hero-conditions')) {
      const body = JSON.parse(options.body);
      calls.push({ to: 'token', body });
      return reply(onMap
        ? { success: true, applied: true, onMap: true, placementId: 't1', entityRevision: 8, conditions: [{ name: 'Bleeding', duration: { type: 'save-ends' } }, { name: 'Slowed', duration: { type: 'end-of-turn' } }] }
        : { success: true, applied: false, onMap: false });
    }
    const body = Object.fromEntries(new URLSearchParams(options.body));
    calls.push({ to: 'sheet', body });
    if (body.delta) return reply({ success: true, applied: true, conditions: [{ name: 'Slowed', duration: { type: 'end-of-turn' } }], revision: 12 });
    return reply({ success: true, applied: true, conditions: JSON.parse(body.conditions), revision: 12 });
  };
  const added = await editHeroCondition({ character: 'cal', op: 'add', condition: { name: 'Slowed', duration: 'end-of-turn' }, currentList: [], baseRevision: 10, fetchImpl, operationId: 'op-12345678' });
  assert.deepEqual(calls[0], { to: 'token', body: { character: 'cal', op: 'add', condition: { name: 'Slowed', duration: { type: 'end-of-turn' } }, operationId: 'op-12345678' } });
  assert.equal(calls[1].to, 'sheet');
  assert.deepEqual({ source: calls[1].body.source, placementId: calls[1].body.placementId, revision: calls[1].body.revision }, { source: 'vtt', placementId: 't1', revision: '8' }, 'with the token\'s revision');
  assert.deepEqual(JSON.parse(calls[1].body.delta), [{ op: 'add', condition: { name: 'Slowed', duration: { type: 'end-of-turn' } } }], 'only this change: the token\'s old Bleeding stays off the sheet');
  assert.equal(calls[1].body.conditions, undefined);
  assert.deepEqual(added, { ok: true, onMap: true, applied: true, conditions: [{ name: 'Slowed', duration: { type: 'end-of-turn' } }], revision: 12 });

  onMap = false;
  calls.length = 0;
  const own = await editHeroCondition({ character: 'cal', op: 'remove', condition: { name: 'Prone', duration: 'save-ends' }, currentList: ['Prone', 'Dazed (EOT)'], baseRevision: 10, fetchImpl });
  assert.deepEqual(calls.map((c) => c.to), ['token', 'sheet']);
  assert.equal(calls[1].body.source, 'sheet');
  assert.equal(calls[1].body.baseRevision, '10', 'with the revision the page read: a stale page is refused');
  assert.deepEqual(JSON.parse(calls[1].body.conditions), [{ name: 'Dazed', duration: { type: 'end-of-turn' } }]);
  assert.equal(own.ok && own.onMap, false);

  const refused = await editHeroCondition({ character: 'cal', op: 'add', condition: { name: 'Prone' }, fetchImpl: async () => reply({ success: false, error: 'You cannot change this placement.' }, 422) });
  assert.deepEqual(refused, { ok: false, error: 'You cannot change this placement.' }, 'the token\'s rules decide; nothing falls back to the sheet');
});

async function settle(rounds = 12) { for (let i = 0; i < rounds; i += 1) await new Promise((resolve) => setTimeout(resolve, 0)); }

async function withPanel({ user = 'cal', isGM = false, token = { id: 'cal-token', conditions: [{ name: 'Slowed', duration: { type: 'end-of-turn' } }] }, conditions = [] } = {}, fn) {
  const dom = new JSDOM('<body><div class="vtt-board__header"></div><aside id="vtt-character-summary-panel"></aside></body>', { url: 'http://localhost/dnd/vtt/', pretendToBeVisual: true });
  const keys = ['window', 'document', 'CustomEvent', 'Element', 'HTMLElement', 'MutationObserver', 'BroadcastChannel', 'fetch'];
  const saved = Object.fromEntries(keys.map((key) => [key, globalThis[key]]));
  const state = { requests: [], sheet: { hero: { name: 'Cal', conditions, vitals: { currentStamina: 30, staminaMax: 40 } } } };
  Object.assign(globalThis, {
    window: dom.window, document: dom.window.document, CustomEvent: dom.window.CustomEvent, Element: dom.window.Element, HTMLElement: dom.window.HTMLElement,
    MutationObserver: dom.window.MutationObserver,
    BroadcastChannel: class { addEventListener() {} postMessage() {} close() {} },
    fetch: async (url, options = {}) => {
      const u = new URL(url, 'http://localhost/');
      if (u.pathname.endsWith('hero-conditions.php')) { state.requests.push({ to: 'token', body: JSON.parse(options.body) }); return reply({ success: true, onMap: false }); }
      if (options.method === 'POST') {
        const body = Object.fromEntries(new URLSearchParams(options.body));
        state.requests.push({ to: 'sheet', body });
        state.sheet.hero.conditions = JSON.parse(body.conditions);
        return reply({ success: true, applied: true, conditions: state.sheet.hero.conditions, revision: 4 });
      }
      const action = u.searchParams.get('action');
      if (action === 'live') return reply({ success: true, revision: 3, locks: [] });
      if (u.pathname.endsWith('campaign.php')) return reply({ success: false });
      return reply({ success: true, data: structuredClone(state.sheet) });
    },
  });
  try {
    mountCharacterSummaryPanel({ sheet: '/dnd/character_sheet/handler.php' }, { name: user, isGM });
    document.dispatchEvent(new CustomEvent('vtt:token-selection-summary', { detail: { characterId: 'cal', token } }));
    await settle();
    await fn(state, dom.window.document.getElementById('vtt-character-summary-panel'));
  } finally {
    dom.window.close();
    Object.assign(globalThis, saved);
  }
}

test('the side panel with the hero\'s token: its chips, and SE / EOT and Other… go to the token like an ability\'s', async () => {
  await withPanel({}, async (state, panel) => {
    const chip = panel.querySelector('.sp-cond:not(.sp-cond--add)');
    assert.equal(chip.querySelector('.sp-cond__name').textContent, 'Slowed');
    assert.equal(chip.querySelector('.sp-cond__dur').textContent, 'EOT', 'the duration, shown small');
    // Beside the conditions: the healthy hero's bar has no state pill and no "winded" word under its tick.
    assert.equal(panel.querySelector('.sp-stam__state'), null, '30 of 40, no temporary Stamina: no pill');
    assert.equal(panel.querySelector('.sp-stam__wlbl'), null);
    assert.equal(panel.querySelector('.sp-stam__winded').title, 'Winded at 20');
    assert.ok(chip.querySelector('[data-character-condition-remove][data-placement-id="cal-token"]'), 'the × takes it off the token');
    const applied = [];
    document.addEventListener('vtt:automation-apply-condition', (e) => applied.push(e.detail.payload));
    panel.querySelector('[data-character-condition-menu]').click();
    panel.querySelector('[data-condition-duration="end-of-turn"]').click();
    panel.querySelector('[data-character-condition-pick="Dazed"]').click();
    panel.querySelector('[data-character-condition-menu]').click();
    panel.querySelector('[data-character-condition-other]').click();
    panel.querySelector('[data-condition-other-text]').value = 'Soaked';
    panel.querySelector('[data-condition-other-add]').click();
    assert.deepEqual(applied, [
      { placementId: 'cal-token', condition: { name: 'Dazed', duration: 'end-of-turn' } },
      { placementId: 'cal-token', condition: { name: 'Soaked', duration: 'save-ends' } },
    ]);
    assert.equal(state.requests.length, 0, 'the token path: nothing written to the sheet from here (the map mirrors it)');
  });
});

test('the side panel with no token: the sheet\'s list, edited by the hero\'s player; others only read it', async () => {
  await withPanel({ token: {}, conditions: ['Prone, save ends'] }, async (state, panel) => {
    assert.equal(panel.querySelector('.sp-cond__name').textContent, 'Prone', 'an old sheet\'s text, read leniently');
    panel.querySelector('[data-character-condition-menu]').click();
    panel.querySelector('[data-condition-duration="end-of-turn"]').click();
    panel.querySelector('[data-character-condition-pick="Slowed"]').click();
    await settle();
    assert.deepEqual(state.requests.map((r) => r.to), ['token', 'sheet'], 'asks the map first (no token there), then the sheet');
    assert.equal(state.requests[1].body.source, 'sheet');
    assert.equal(state.requests[1].body.baseRevision, '3');
    assert.deepEqual(JSON.parse(state.requests[1].body.conditions), [{ name: 'Prone', duration: { type: 'save-ends' } }, { name: 'Slowed', duration: { type: 'end-of-turn' } }]);
    assert.deepEqual([...panel.querySelectorAll('.sp-cond__name')].map((n) => n.textContent), ['Prone', 'Slowed']);
    panel.querySelector('[data-sheet-condition-remove="0"]').click();
    await settle();
    assert.deepEqual(JSON.parse(state.requests.at(-1).body.conditions), [{ name: 'Slowed', duration: { type: 'end-of-turn' } }]);
  });
  await withPanel({ user: 'sharon', token: {}, conditions: ['Prone'] }, async (state, panel) => {
    assert.equal(panel.querySelector('[data-character-condition-picker]'), null, 'another player sees the list, without the picker');
    assert.equal(panel.querySelector('[data-sheet-condition-remove]'), null);
  });
});

test('the picker: keyboard and outside clicks close it; a duration choice is not a pick', () => {
  const dom = new JSDOM(`<body><div id="a">${conditionPickerHtml()}</div><p id="out">x</p></body>`);
  const doc = dom.window.document;
  const picks = [];
  wireConditionPicker(doc.getElementById('a'), (c) => picks.push(c));
  wireConditionPicker(doc.getElementById('a'), (c) => picks.push(c));      // drawn again: bound once
  const toggle = doc.querySelector('[data-character-condition-menu]');
  const menu = doc.querySelector('[role="menu"]');
  toggle.click();
  doc.querySelector('[data-condition-duration="end-of-turn"]').click();
  assert.equal(menu.hidden, false);
  assert.equal(doc.querySelector('[data-condition-duration="end-of-turn"]').getAttribute('aria-checked'), 'true');
  doc.getElementById('out').dispatchEvent(new dom.window.Event('pointerdown', { bubbles: true }));
  assert.equal(menu.hidden, true);
  toggle.click();
  assert.equal(doc.querySelector('[data-condition-duration="save-ends"]').getAttribute('aria-checked'), 'true', 'each opening starts at save ends');
  doc.querySelector('[data-condition-duration="end-of-turn"]').click();
  doc.querySelector('[data-character-condition-other]').click();
  const input = doc.querySelector('[data-condition-other-text]');
  input.value = 'On fire';
  input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  assert.deepEqual(picks, [{ name: 'On fire', duration: 'end-of-turn' }]);
});
