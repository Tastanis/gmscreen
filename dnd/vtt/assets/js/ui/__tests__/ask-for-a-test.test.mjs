import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Build 514: the Director asks heroes for a test. He picks heroes and, if he wishes, characteristics; each player
// picks the rest in a pop-up; the roll is made on the server (api/v2/tests/ask-for-a-test.test.php checks that
// half). Here: what the two forms say and sum, and that the pieces are on the pages they must be on.

const read = (path) => readFileSync(new URL('../../../../../' + path, import.meta.url), 'utf8');
const source = read('js/ask-test.js');
const fakeWindow = {};
new Function('window', source)(fakeWindow);
const { logic } = fakeWindow.AskTest;
const said = (pieces) => pieces.map(([text]) => text).join('');
const bold = (pieces) => pieces.filter(([, isBold]) => isBold).map(([text]) => text);

const HEROES = [{ id: 'cal', label: 'Cal' }, { id: 'sharon', label: 'Sharon' }, { id: 'indigo', label: 'Indigo' }, { id: 'zepha', label: 'Zepha' }];
// Indigo's own numbers, from her sheet.
const INDIGO = { stats: { might: -1, agility: 1, reason: 3, intuition: 1, presence: 3 }, skills: { Hide: 0, Magic: 0, 'Read Person': 1 } };

test('the Director\'s form says who is asked and what the player will be offered', () => {
  assert.equal(said(logic.heroLine(HEROES, ['cal', 'sharon', 'indigo'])), 'Asking Cal, Sharon, Indigo. Not asking Zepha.');
  assert.deepEqual(bold(logic.heroLine(HEROES, ['cal', 'sharon', 'indigo'])), ['Cal', 'Sharon', 'Indigo']);
  assert.equal(said(logic.heroLine(HEROES, ['cal', 'sharon', 'indigo', 'zepha'])), 'Asking Cal, Sharon, Indigo, Zepha.');
  assert.equal(said(logic.heroLine(HEROES, ['zepha'])), 'Asking Zepha. Not asking Cal, Sharon, Indigo.');
  assert.equal(said(logic.heroLine(HEROES, [])), 'Nobody is picked.');
  // None, one or several characteristics may be lit; every case is an ask.
  assert.equal(said(logic.statLine([])), 'The player picks: any characteristic, or none');
  assert.equal(said(logic.statLine(['agility'])), 'The player rolls Agility, or none');
  assert.equal(said(logic.statLine(['agility', 'intuition'])), 'The player picks: Agility or Intuition, or none');
  assert.deepEqual(bold(logic.statLine(['agility', 'intuition'])), ['Agility', 'Intuition']);
  // Asking needs a hero and nothing else, and he never picks the skill.
  assert.match(source, /ask\.textContent = lit\.length \? 'Ask' : 'Ask \(pick a hero\)';/);
  assert.match(source, /if \(!lit\.length \|\| asking\) return;/);
  const form = source.slice(source.indexOf('function openForm('), source.indexOf('// ---- what comes back to the Director'));
  assert.doesNotMatch(form, /skill/i, 'there is no skill on the Director\'s side');
});

test('the player is offered what he lit, or all five, and may always pick none', () => {
  assert.deepEqual(logic.offered(['intuition', 'agility']), ['agility', 'intuition']);
  assert.deepEqual(logic.offered(['presence']), ['presence']);
  assert.deepEqual(logic.offered([]), ['might', 'agility', 'reason', 'intuition', 'presence'], 'none lit: all five');
  // Where the pop-up starts: on the one lit, on the hero's best of several, on none when none is lit.
  assert.equal(logic.startOn(['presence'], INDIGO.stats), 'presence');
  assert.equal(logic.startOn(['might', 'reason', 'agility'], INDIGO.stats), 'reason');
  assert.equal(logic.startOn(['agility', 'intuition'], INDIGO.stats), 'agility', 'a tie starts on the first of them');
  assert.equal(logic.startOn([], INDIGO.stats), null);
  // Clicking the lit one again picks none, for a characteristic and for a skill alike.
  assert.match(source, /pick\.stat = pick\.stat === name \? null : name;/);
  assert.match(source, /pick\.skill = pick\.skill === skill \? null : skill;/);
});

test('the Roll button shows the sum the server will add', () => {
  const sum = (pick) => logic.modifier({ stat: null, skill: null, edge: 0, extra: '', ...pick }, INDIGO);
  assert.equal(sum({ stat: 'presence', skill: 'Read Person' }), 6, 'Presence 3, a skill of her own 2, and that skill\'s own 1');
  assert.equal(sum({ stat: 'presence', skill: 'Hide' }), 5);
  assert.equal(sum({ stat: 'reason', skill: 'Swim' }), 3, 'a skill that is not hers can be picked and adds nothing');
  assert.equal(sum({ stat: 'might' }), -1);
  assert.equal(sum({}), 0, 'no characteristic and no skill is a plain 2d10');
  assert.equal(sum({ edge: 1 }), 2);
  assert.equal(sum({ edge: -1, extra: '+1' }), -1);
  assert.equal(logic.rollLabel(6), 'Roll 2d10 +6');
  assert.equal(logic.rollLabel(-1), 'Roll 2d10 −1');
  assert.equal(logic.rollLabel(0), 'Roll 2d10');
  // The box to type an extra plus or minus.
  for (const [typed, taken] of [['+1', 1], ['-2', -2], ['−1', -1], ['3', 3], [' + 2 ', 2], ['', 0], ['two', 0], ['1.5', 0], ['99', 20], ['-99', -20], [null, 0]]) {
    assert.equal(logic.extra(typed), taken, JSON.stringify(typed));
  }
  // The sum is only shown here: what is sent is the picks, and the dice are the server's.
  const sent = source.match(/send\('chat_test_roll', \{([^}]*)\}\)/);
  assert.ok(sent);
  assert.deepEqual(sent[1].split(',').map((part) => part.split(':')[0].trim()), ['test', 'characteristic', 'skill', 'edge', 'extra']);
  assert.doesNotMatch(source, /Math\.random/);
});

test('what comes back: the Director\'s list, and whose turn the pop-up is', () => {
  const cal = { status: 'rolled', characteristic: 'intuition', skill: '', edge: 0, extra: 0, dice: [4, 5], modifier: -1, total: 8, tier: 1 };
  const sharon = { status: 'rolled', characteristic: 'agility', skill: 'Sneak', edge: 0, extra: 0, dice: [8, 7], modifier: 5, total: 20, tier: 3 };
  assert.deepEqual(logic.rowParts(cal), ['Intuition, no skill: 9 − 1 =', 8, 'tier 1']);
  assert.deepEqual(logic.rowParts(sharon), ['Agility, Sneak: 15 + 5 =', 20, 'tier 3']);
  assert.deepEqual(logic.rowParts({ ...cal, characteristic: '', edge: -1, extra: 2, modifier: 0, total: 9 }), ['No characteristic, no skill, bane, extra +2: 9 + 0 =', 9, 'tier 1']);
  const label = (id) => HEROES.find((hero) => hero.id === id).label;
  assert.equal(logic.heading({ asks: 'Agility or Intuition', private: false, rows: { cal: {}, sharon: {} } }, label), 'Test: Agility or Intuition');
  assert.equal(logic.heading({ asks: 'Presence', private: true, rows: { indigo: {} } }, label), 'Test, to Indigo only: Presence');
  assert.equal(logic.heading({ asks: 'any characteristic', private: false, rows: { cal: {} } }, label), 'Test: any characteristic');

  const waiting = { status: 'waiting' };
  const tests = [
    { id: 'a', age: 100, rows: { cal: cal, indigo: waiting } },
    { id: 'b', age: 40, rows: { indigo: waiting } },
    { id: 'c', age: 1790, rows: { indigo: waiting } },
  ];
  assert.deepEqual(logic.waitingOn(tests, 'indigo', 0).map((entry) => entry.id), ['a', 'b', 'c'], 'oldest first');
  assert.deepEqual(logic.waitingOn(tests, 'indigo', 20).map((entry) => entry.id), ['a', 'b'], 'one left for half an hour is no longer offered');
  assert.deepEqual(logic.waitingOn(tests, 'cal', 0), [], 'a test already rolled is not offered again');
  assert.deepEqual(logic.waitingOn(tests, 'sharon', 0), []);
  // The Director's pop-up comes up when a roll comes in.
  const later = [{ id: 'a', rows: { cal: cal, indigo: sharon } }, tests[1], tests[2]];
  assert.deepEqual(logic.newlyRolled(tests, later), [['a', 'indigo']]);
  assert.deepEqual(logic.newlyRolled(later, later), []);
  assert.deepEqual(logic.newlyRolled([], later), [['a', 'cal'], ['a', 'indigo']]);
});

test('it is on every page the chat is on, and the buttons are the Director\'s', () => {
  // The module is loaded before the chat panel, which starts it and tells it when the tests have changed.
  for (const [page, pattern] of [
    ['dashboard.php', /<script src="js\/ask-test\.js\?v=[^"]+"><\/script>\s*<script src="js\/chat-panel\.js\?v=[^"]+"><\/script>/],
    ['character_sheet/index.php', /<script src="\.\.\/js\/ask-test\.js\?v=[^"]+"><\/script>\s*<script src="\.\.\/js\/chat-panel\.js/],
    ['vtt/templates/layout.php', /<script src="\.\.\/js\/ask-test\.js\?v=[^"]+"><\/script>\s*<script src="\.\.\/js\/chat-panel\.js/],
  ]) {
    assert.match(read(page), pattern, page);
    assert.match(read(page), /css\/ask-test\.css\?v=/, page + ' has its look');
  }
  const chat = read('js/chat-panel.js');
  assert.match(chat, /window\.AskTest\.start\(\{ isGM, currentUser, endpoint: CHAT_ENDPOINT, participants \}\);/);
  assert.match(chat, /updateLatestTimestamp\(data\.latest\);\s*if \(window\.AskTest && typeof window\.AskTest\.noticed === 'function'\) \{\s*window\.AskTest\.noticed\(data\.tests\);/);
  // From the main page, from the map (where the heroes on the map start lit), and privately from a whisper window.
  assert.match(read('dashboard.php'), /<\?php if \(\$is_gm\): \?><button type="button" class="nav-btn" id="ask-test-btn" data-ask-test-open [^>]*>Test<\/button><\?php endif; \?>/);
  assert.match(read('vtt/components/SceneBoard.php'), /<\?php if \(\$isGm\): \?>\s*<button\s+class="btn"\s+type="button"\s+id="vtt-ask-test-btn"\s+data-ask-test-open\s+data-ask-test-from="map"[\s\S]{0,160}?Test\s*<\/button>\s*<\?php endif; \?>/);
  assert.match(chat, /if \(isGM && targetId !== 'GM' && window\.AskTest\) \{[\s\S]{0,420}testBtn\.dataset\.askTestOpen = '';\s*testBtn\.dataset\.askTestOnly = targetId;/);
  assert.match(source, /const opener = event\.target && event\.target\.closest \? event\.target\.closest\('\[data-ask-test-open\]'\) : null;\s*if \(opener\) openForm\(\{ from: opener\.dataset\.askTestFrom \|\| '', only: opener\.dataset\.askTestOnly \|\| '' \}\);/);
  assert.match(source, /function openForm\(\{ from = '', only = '' \} = \{\}\) \{\s*if \(!settings \|\| !settings\.isGM\) return;/, 'a player\'s page has no form to open');
  assert.match(source, /from === 'map' && typeof window\.vttHeroesOnMap === 'function'/);
  assert.match(read('vtt/assets/js/ui/board-interactions.js'), /window\.vttHeroesOnMap = \(\) => \[\.\.\.new Set\(getActiveScenePlacements\(boardApi\.getState\?\.\(\) \?\? \{\}\)\.map\(\(placement\) => getCharacterSheetProfileIdForPlacement\(placement\)\)\.filter\(Boolean\)\)\];/);
  // A chat line for two people says so.
  assert.match(chat, /if \(Array\.isArray\(message\.only\)\) \{[\s\S]{0,420}note\.textContent = `Only you and \$\{others\.join\(' and '\) \|\| 'the Director'\} see this\.`;/);
});

test('the skills offered are the character sheet\'s own', () => {
  const sheet = read('character_sheet/sheet.js');
  const groups = new Function(sheet.slice(sheet.indexOf('const SKILL_GROUPS = {'), sheet.indexOf('const SORTED_SKILL_GROUPS')) + '\nreturn SKILL_GROUPS;')();
  const php = read('includes/ask-test.php');
  const listed = php.slice(php.indexOf('public const SKILLS = ['), php.indexOf('];', php.indexOf('public const SKILLS = [')));
  const server = Object.fromEntries([...listed.matchAll(/'([A-Za-z]+)' => \[([^\]]*)\]/g)].map(([, group, skills]) => [group, skills.split(',').map((skill) => skill.trim().replace(/^'|'$/g, '')).filter(Boolean)]));
  assert.deepEqual(Object.keys(server), ['Crafting', 'Exploration', 'Interpersonal', 'Intrigue', 'Lore']);
  for (const [group, skills] of Object.entries(groups)) {
    assert.deepEqual([...server[group.replace(/ Skills$/, '')]].sort(), [...skills].sort(), group);
  }
});
