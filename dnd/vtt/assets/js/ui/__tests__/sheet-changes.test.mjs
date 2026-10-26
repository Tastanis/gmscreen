import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { diffSheet, applyChanges, sameValue } from '../../../../../character_sheet/sheet-changes.mjs';

// Brandon, October 12, 2026: "Character sheets seem to be changing without permission ... zepha's might and agility
// were just randomly reset to zero. and when they did a respite, i think it didnt give him back any of his
// recoveries or something."
//
// A save sent the whole character as the page held it. Now a page keeps the sheet as it last knew the server to
// hold it (its baseline) and sends only the fields that differ. The server's side, run through the real request
// handler, is api/v2/tests/sheet-field-saves.test.php.

const sheet = () => ({
  hero: { name: 'Zepha', level: 3, wealth: '', stats: { might: 2, agility: 1, reason: 3 }, vitals: { recoveriesMax: 8, currentRecoveries: 1, staminaMax: 57, currentStamina: 33 }, heroTokens: [false, false], victories: 3 },
  sidebar: { skills: ['Sneak', 'Hide'], lists: { languages: ['Caelian'] } },
  features: [{ name: 'Flame', text: 'a' }], actions: { mains: [{ name: 'Strike' }] },
});

test('a page that changed nothing sends nothing', () => {
  assert.deepEqual(diffSheet(sheet(), sheet()), []);
  // Reading a form back gives text where the record has numbers, and empty where it has nothing: neither is a change.
  const read = sheet(); read.hero.level = '3'; read.hero.stats.might = '2'; read.hero.wealth = null; read.hero.vitals.staminaMax = '57';
  assert.deepEqual(diffSheet(sheet(), read), []);
  assert.equal(sameValue({ a: 1, b: [1, { c: '2' }] }, { b: ['1', { c: 2 }], a: '1' }), true, 'whatever the order of the fields');
});

test('only the fields that differ are sent, each by its place in the sheet', () => {
  const now = sheet(); now.hero.wealth = '3'; now.hero.vitals.currentRecoveries = 0;
  assert.deepEqual(diffSheet(sheet(), now), [{ path: ['hero', 'wealth'], value: '3' }, { path: ['hero', 'vitals', 'currentRecoveries'], value: 0, from: 1 }]);
  // A counter says what this page believed it was, so the server can move its own number by the difference;
  // the server's half is api/v2/tests/sheet-counters.test.php.
  const counted = sheet(); counted.hero.victories = 4; counted.hero.surges = 1; counted.hero.vitals.currentStamina = '30'; counted.hero.resource = { value: 2 };
  assert.deepEqual(diffSheet(sheet(), counted).map((change) => [change.path.join('.'), change.value, change.from]),
    [['hero.vitals.currentStamina', '30', 33], ['hero.victories', 4, 3], ['hero.surges', 1, null], ['hero.resource', { value: 2 }, undefined]]);
  // A number typed in Edit mode is the number meant: no "from".
  assert.deepEqual(diffSheet(sheet(), counted, [], false).filter((change) => 'from' in change), []);
  const withResource = sheet(); withResource.hero.resource = { value: 2 }; const spent = JSON.parse(JSON.stringify(withResource)); spent.hero.resource.value = 1;
  assert.deepEqual(diffSheet(withResource, spent), [{ path: ['hero', 'resource', 'value'], value: 1, from: 2 }]);
});

test('THE FAULT: an old copy of the sheet that changes one field cannot roll back or blank the others', () => {
  // The page loaded when Might and Agility were still blank; they have since been set to 2 and 1 elsewhere.
  const loadedLongAgo = sheet(); loadedLongAgo.hero.stats.might = ''; loadedLongAgo.hero.stats.agility = ''; loadedLongAgo.hero.vitals.recoveriesMax = '';
  const baseline = JSON.parse(JSON.stringify(loadedLongAgo));
  loadedLongAgo.hero.wealth = '3';                                  // the one thing its player now types
  const sent = diffSheet(baseline, loadedLongAgo);
  assert.deepEqual(sent, [{ path: ['hero', 'wealth'], value: '3' }], 'the blanks it holds are not in what it sends');
  const stored = applyChanges(sheet(), sent);
  assert.deepEqual([stored.hero.stats.might, stored.hero.stats.agility, stored.hero.vitals.recoveriesMax, stored.hero.wealth], [2, 1, 8, '3']);
});

test('an emptied characteristic is not sent; a typed one is', () => {
  const now = sheet(); now.hero.stats.might = ''; now.hero.stats.agility = 4; now.hero.stats.reason = null;
  assert.deepEqual(diffSheet(sheet(), now), [{ path: ['hero', 'stats', 'agility'], value: 4 }], 'an empty Might is how a blank input reads, not a score');
  // A characteristic that had no score may be given one, and a field that is not a characteristic may be emptied.
  const blank = sheet(); blank.hero.stats.might = '';
  const filled = JSON.parse(JSON.stringify(blank)); filled.hero.stats.might = 0; filled.hero.name = '';
  assert.deepEqual(diffSheet(blank, filled), [{ path: ['hero', 'name'], value: '' }, { path: ['hero', 'stats', 'might'], value: 0 }]);
});

test('a list is one field and is sent whole; the party\'s hero tokens are never sent', () => {
  const now = sheet(); now.features[0].text = 'b'; now.sidebar.skills.push('Lie'); now.hero.heroTokens = [true, false];
  assert.deepEqual(diffSheet(sheet(), now), [{ path: ['sidebar', 'skills'], value: ['Sneak', 'Hide', 'Lie'] }, { path: ['features'], value: [{ name: 'Flame', text: 'b' }] }]);
  // A page does not delete what it does not hold: a part missing on the page is not a change.
  const partial = sheet(); delete partial.actions;
  assert.deepEqual(diffSheet(sheet(), partial), []);
});

test('the skills as stored (a group by name) are one field: a skill taken off is sent, the group whole', () => {
  // October 2026: a skill removed in the Skills form came back on reload; the group was gone into and a missing name
  // is never a change there.
  const was = sheet(); was.sidebar.skills = { Alchemy: { level: 'Trained', bonus: '' }, Sneak: { level: 'Trained', bonus: '1' } };
  const now = JSON.parse(JSON.stringify(was)); delete now.sidebar.skills.Alchemy;
  assert.deepEqual(diffSheet(was, now), [{ path: ['sidebar', 'skills'], value: { Sneak: { level: 'Trained', bonus: '1' } } }]);
  const bonus = JSON.parse(JSON.stringify(was)); bonus.sidebar.skills.Sneak.bonus = '2';
  assert.deepEqual(diffSheet(was, bonus).map((c) => c.path.join('.')), ['sidebar.skills']);
  assert.deepEqual(diffSheet(was, JSON.parse(JSON.stringify(was))), []);
});

test('what was sent becomes the baseline, and a refused save can be taken back out of it', () => {
  const baseline = sheet(), now = sheet(); now.hero.wealth = '3'; now.features = [{ name: 'Flame', text: 'b' }];
  const sent = diffSheet(baseline, now);
  const held = sent.map(({ path }) => ({ path, value: path.reduce((at, step) => (at == null ? undefined : at[step]), baseline) }));
  applyChanges(baseline, sent);
  assert.deepEqual(diffSheet(baseline, now), [], 'a second save started before the first is answered sends nothing twice');
  now.features[0].text = 'c';
  assert.deepEqual(baseline.features[0].text, 'b', 'the baseline holds a copy, not the page\'s own list');
  applyChanges(baseline, held);
  assert.deepEqual(diffSheet(baseline, now).map((change) => change.path.join('.')), ['hero.wealth', 'features'], 'refused: the next save sends them again');
});

test('the sheet page saves what it changed, asks the server for a respite, and says when a save failed', () => {
  const page = readFileSync(new URL('../../../../../character_sheet/sheet.js', import.meta.url), 'utf8');
  assert.match(page, /const changes = diffSheet\(sheetBaseline, sheetState, \[\], !\(typed \|\| document\.body\.classList\.contains\("edit-mode"\)\)\);\s*if \(!changes\.length\) return Promise\.resolve\(true\);/, 'nothing changed, nothing sent: turning Edit off or a tab going into the background writes nothing');
  assert.match(page, /captureAllSections\(\);\s*renderAll\(\);\s*saveSheet\(\{ typed: true \}\);/, 'what was typed in Edit mode is sent as typed');
  assert.match(page, /payload\.append\("operationId", operationId\);/, 'a save names itself');
  assert.match(page, /const stored = await sheetSaveWasStored\(operationId, character\);\s*if \(stored === true\) \{/, 'a save that got no answer is asked after before anything is sent again');
  assert.match(page, /applyChanges\(sheetBaseline, stored === false \? held : held\.filter\(\(_, index\) => !\("from" in changes\[index\]\)\)\);/, 'and an amount whose fate is unknown is not sent twice');
  assert.match(page, /payload\.append\("action", "save-fields"\);[\s\S]{0,200}payload\.append\("changes", JSON\.stringify\(changes\)\);/);
  assert.doesNotMatch(page, /payload\.append\("action", "save"\);/, 'the whole-sheet save is gone from the page');
  assert.doesNotMatch(page, /payload\.append\("data", JSON\.stringify\(sheetState\)\)/);
  for (const taken of [/sheetState = mergeWithDefaults\(result\.data\);\s*sheetBaseline = deepClone\(sheetState\);/, /sheetState = nextState;\s*sheetBaseline = deepClone\(sheetState\);/, /sheetBaseline\.hero\.vitals = \{ \.\.\.sheetBaseline\.hero\.vitals, currentStamina: nextCurrent, staminaMax: nextMax \};/]) {
    assert.match(page, taken, 'wherever server data is taken in, the baseline takes it too');
  }
  assert.match(page, /renderAll\(\);[\s\S]{0,330}captureAllSections\(\);\s*sheetBaseline = deepClone\(sheetState\);/, 'Edit mode begins from the form as it reads untouched');
  assert.match(page, /rested = await askSheetServer\("respite"\);/, 'a respite is asked of the server');
  assert.match(page, /used = await askSheetServer\("sync-vitals", \{ useRecovery: 1 \}\);/, 'and so is a Recovery');
  assert.doesNotMatch(page, /Math\.min\(currentStamina \+ recoveryVal, staminaMax\)/, 'which the page no longer works out (it set Stamina to none on a sheet with no maximum)');
  assert.doesNotMatch(page, /vitals\.currentRecoveries = recoveriesMax;/, 'and no longer worked out on the page');
  assert.match(page, /applyChanges\(sheetBaseline, held\);\s*showSheetSaveProblem\(result\.error \|\| "The server did not take the change\."\);/, 'a save the server refuses is shown on the page and tried again with the next change');
  assert.match(page, /bar\.setAttribute\("role", "alert"\);/);
  const server = readFileSync(new URL('../../../../../character_sheet/handler.php', import.meta.url), 'utf8');
  assert.match(server, /case 'save':[\s\S]{0,700}'reload' => true,[\s\S]{0,200}break;\s*case 'save-fields':/, 'the server refuses a whole-sheet save from a page that has not reloaded');
});
