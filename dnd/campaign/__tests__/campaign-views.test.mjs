// The Projects / Relationships views (campaign-views.js): what a player sees and what the Director sees,
// the set-back request, sorting, and project rolls waiting in chat.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const V = require('../campaign-views.js');

const gmProject = { index: 0, project_name: 'Golem', source: 'Book of Clay', points_earned: 40, total_points: 100, extra: 'secret notes', points_history: [10, 20, 27, 40], percent: 40, waiting: false, complete: false };
const playerProject = { index: 0, project_name: 'Golem', percent: 40, waiting: false, complete: false };
const hero = (projects, relationships = []) => ({ id: 'cal', name: 'Cal', info: { portrait: 'portraits/cal.png' }, projects, relationships });
const base = { view: 'projects', who: 'cal', filter: 'active', query: '', pending: {}, base: '../', theme: 'diablo' };

test('a player sees the title, the bar and the roll button only', () => {
  const html = V.projectsView({ ...base, isGM: false, heroes: [hero([playerProject])] });
  assert.match(html, /Golem/);
  assert.match(html, /class="fill" style="width:40%"/);
  assert.match(html, /<small>40%<\/small>/);
  assert.match(html, /data-roll="cal:0"/);
  assert.doesNotMatch(html, /Last rolls|Set back|data-setback|data-pts|data-pedit|Source:|\d+ \/ \d+/);
});

test('a player never gets history, numbers or tools even if the data has them', () => {
  const html = V.projectsView({ ...base, isGM: false, heroes: [hero([gmProject])] });
  assert.doesNotMatch(html, /Last rolls|data-setback|secret notes|Book of Clay|40 \/ 100|data-pts|data-pedit/);
  assert.match(html, /data-roll="cal:0"/);
});

test('the Director sees numbers, the last rolls as text with set-back, notes and tools', () => {
  const html = V.projectsView({ ...base, isGM: true, heroes: [hero([gmProject])] });
  assert.match(html, /40 \/ 100/);
  assert.match(html, /<div class="hrow now"><span>\+13 → <b>40<\/b><\/span><\/div>/, 'the newest row: bold, no set-back');
  assert.doesNotMatch(html, />now</, 'no "now" label (the history has no times, so no row gets one)');
  assert.match(html, /\+7 → <b>27<\/b>/);
  assert.match(html, /data-setback="cal:0" data-pos="2"[^>]*>↶ Set back to 27/);
  assert.match(html, /data-pos="0"[^>]*>↶ Set back to 10/);
  assert.match(html, /secret notes/);
  assert.match(html, /data-pts="cal:0"/);
  assert.match(html, /data-pedit="cal:0"/);
});

test('history rows: newest first, last four, steps from the total before', () => {
  const rows = V.historyRows({ points_history: [5, 10, 20, 27, 40] });
  assert.deepEqual(rows.map((r) => [r.step, r.total, r.pos, r.now]), [[13, 40, 4, true], [7, 27, 3, false], [10, 20, 2, false], [5, 10, 1, false]]);
});

test('set back sends the hero, project, its name and the place in the history', () => {
  assert.deepEqual(V.setBackRequest('cal', gmProject, 1), { action: 'project_set_back', character: 'cal', index: '0', name: 'Golem', to_index: '1', to: '20' });
  assert.equal(V.setBackRequest('cal', gmProject, 3), null, 'not to the current total');
  assert.equal(V.setBackRequest('cal', gmProject, 9), null);
});

test('a project with no total waits for the Director and cannot be rolled', () => {
  const waiting = { index: 1, project_name: 'My idea', percent: 0, waiting: true, complete: false };
  const html = V.projectsView({ ...base, isGM: false, heroes: [hero([waiting])] });
  assert.match(html, /Waiting for the Director to set the total/);
  assert.doesNotMatch(html, /data-roll=/);
  assert.doesNotMatch(html, /click ✎/);
});

test('closest to done comes first; complete ones only under Complete', () => {
  const ps = [
    { index: 0, project_name: 'Low', percent: 10, waiting: false, complete: false },
    { index: 1, project_name: 'Done', percent: 100, waiting: false, complete: true },
    { index: 2, project_name: 'High', percent: 80, waiting: false, complete: false },
  ];
  const html = V.projectsView({ ...base, isGM: false, heroes: [hero(ps)] });
  assert.ok(html.indexOf('High') < html.indexOf('Low'));
  assert.doesNotMatch(html, /Done<\/h4>/);
  // Counts live on the filter chips only; the summary adds just the "nearly done" number the chips do not give.
  assert.match(html, /<div class="summary"><b>1<\/b> nearly done <small>\(75% or more\)<\/small><\/div>/);
  assert.doesNotMatch(html, /in progress ·|· <b>\d+<\/b> complete/);
  assert.match(html, /data-filter="active" class="on">In progress<i>2<\/i>/);
  assert.match(html, /data-filter="done" class="">Complete<i>1<\/i>/);
  const done = V.projectsView({ ...base, isGM: false, filter: 'done', heroes: [hero(ps)] });
  assert.match(done, /<div class="ttl"><h4 title="Done">Done<\/h4><span class="ribbon">Complete/, 'the badge sits under the title');
  assert.match(done, /Finished/);
});

test('projects: everyone gets "All heroes" (players can roll on each other’s); relationships: a player sees only their own hero', () => {
  assert.match(V.page({ ...base, view: 'projects', isGM: false, me: 'indigo', heroes: [hero([])] }), /All heroes/);
  assert.match(V.page({ ...base, isGM: true, who: 'all', heroes: [hero([])] }), /All heroes/);
  const rel = V.page({ ...base, view: 'relationships', isGM: false, me: 'nobody', heroes: [hero([])] });
  assert.doesNotMatch(rel, /All heroes/);
});

test('relationships: linked student picture and name; player read-only, Director tools', () => {
  const rel = { index: 0, npc_name: 'New Relationship', display_name: 'Ana Ink', points: 3, boon: 'Ink trick', bane: '', extra: 'old friend', link: { type: 'student', id: 's1', name: 'Ana Ink', college: 'Silverquill', year: '2nd Year', image: 'strixhaven/students/portraits/ana.png', synced: true } };
  const p = V.relationshipsView({ ...base, view: 'relationships', isGM: false, heroes: [hero([], [rel])] });
  assert.match(p, /Ana Ink/);
  assert.match(p, /url\('\.\.\/strixhaven\/students\/portraits\/ana\.png'\)/);
  assert.match(p, /Silverquill · 2nd Year/);
  assert.match(p, /⇄ Students/);
  assert.match(p, /Boon: Ink trick/);
  assert.doesNotMatch(p, /data-rp|data-redit|Add someone/);
  const g = V.relationshipsView({ ...base, view: 'relationships', isGM: true, heroes: [hero([], [rel])] });
  assert.match(g, /data-rp="1" data-rel="cal:0"/);
  assert.match(g, /data-redit="cal:0"/);
  assert.match(g, /\+ Add someone/);
  assert.match(g, /<b>1<\/b> relationships · <b class="g">1<\/b> friendly · <b class="r">0<\/b> strained/);
});

test('names and notes are escaped', () => {
  const html = V.projectsView({ ...base, isGM: true, heroes: [hero([{ ...gmProject, project_name: '<img src=x onerror=alert(1)>' }])] });
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x/);
});

test('project rolls waiting in chat are found by index, or by name when the index moved', () => {
  const heroes = [hero([{ index: 0, project_name: 'Golem' }, { index: 1, project_name: 'Ward' }])];
  const pending = V.pendingRolls([
    { type: 'project_roll', payload: { characterId: 'cal', projectIndex: 0, projectName: 'Golem', total: 31, status: 'pending' } },
    { type: 'project_roll', payload: { characterId: 'cal', projectIndex: 0, projectName: 'Ward', total: 12, status: 'pending' } },
    { type: 'project_roll', payload: { characterId: 'cal', projectIndex: 1, projectName: 'Ward', total: 50, status: 'accepted' } },
    { type: 'text', payload: {} },
  ], heroes);
  assert.deepEqual(pending, { 'cal:0': 31, 'cal:1': 12 });
  const gm = V.projectsView({ ...base, isGM: true, pending, heroes: [hero([gmProject])] });
  assert.match(gm, /Roll of <b>31<\/b> sent to chat/);
  const pl = V.projectsView({ ...base, isGM: false, pending, heroes: [hero([playerProject])] });
  assert.match(pl, /Roll sent to chat — waiting for the Director/);
  assert.doesNotMatch(pl, /31/);
});


test('a project 75%+ of the way is tagged "Nearly done" (not "Close", which read as a close button); complete stays', () => {
  const html = V.projectsView({ ...base, isGM: false, heroes: [hero([{ index: 0, project_name: 'Ward', percent: 80, waiting: false, complete: false }])] });
  assert.match(html, /<span class="ribbon soon"[^>]*>Nearly done<\/span>/);
  assert.doesNotMatch(html, />Close</);
  assert.match(html, /<h4 title="Ward">Ward<\/h4>/, 'the full title is the tooltip of the two-line title box');
  const done = V.projectsView({ ...base, isGM: false, filter: 'done', heroes: [hero([{ index: 1, project_name: 'Done', percent: 100, waiting: false, complete: true }])] });
  assert.match(done, /<span class="ribbon">Complete<\/span>/);
});

test('notes are tidied on screen: trailing commas and spaces, double spaces, "+2to" -> "+2 to" (conservative)', () => {
  assert.equal(V.cleanNote('drinking with,  rose theatre date'), 'drinking with, rose theatre date');
  assert.equal(V.cleanNote('Insulted at club fair, '), 'Insulted at club fair');
  assert.equal(V.cleanNote('+2to empathize'), '+2 to empathize');
  assert.equal(V.cleanNote('roll -1on Might'), 'roll -1 on Might');
  assert.equal(V.cleanNote('I have 2to go'), 'I have 2to go', 'no sign: left alone');
  assert.equal(V.cleanNote('+2tons of rope'), '+2tons of rope', 'not a short word: left alone');
  assert.equal(V.cleanNote('one,\ntwo  \n\n\n\nthree'), 'one\ntwo\n\nthree', 'line breaks kept, runs of blank lines shortened');
  assert.equal(V.cleanNote(null), '');
  const gm = V.projectsView({ ...base, isGM: true, heroes: [hero([{ ...gmProject, extra: '+2to empathize,  ' }])] });
  assert.match(gm, /<p class="notes">\+2 to empathize<\/p>/);
  const rel = { index: 0, npc_name: 'Ana', points: -2, boon: 'Ink  trick,', extra: 'Insulted at club fair,', link: null };
  const r = V.relationshipsView({ ...base, view: 'relationships', isGM: false, heroes: [hero([], [rel])] });
  assert.match(r, /<p class="notes">Insulted at club fair<\/p>/);
  assert.match(r, /Boon: Ink trick</);
  assert.match(r, /class="meter-ends"[^>]*><span>strained<\/span><span>friendly<\/span>/, 'the meter has end labels');
  assert.match(r, /class="rel-grid few"/, 'a few cards get the roomier layout');
  assert.doesNotMatch(r, /rel-add-tile/, 'players get no add tile');
  assert.match(V.relationshipsView({ ...base, view: 'relationships', isGM: true, heroes: [hero([], [rel])] }), /<button class="rel-add-tile" data-add>/);
});

test('roll button: a drawn die (no emoji); Director tools have labels', () => {
  const html = V.projectsView({ ...base, isGM: true, heroes: [hero([gmProject])] });
  assert.match(html, /<button class="roll-btn" data-roll="cal:0"><svg class="die"[^>]*>.*<\/svg>Project roll<\/button>/);
  assert.doesNotMatch(html, /🎲/);
  assert.match(html, /data-pts="cal:0"[^>]*aria-label="Add points by hand"/);
});

test('relationship faces: college colour from the link, or a picture from the one student whose name matches', () => {
  assert.equal(V.collegeKey('Silverquill'), 'silverquill');
  assert.equal(V.collegeKey('Witherbloom College'), 'witherbloom');
  assert.equal(V.collegeKey(''), '');
  const people = [{ name: 'Theo Gearsprocket Finch', college: 'Quandrix', image: 'strixhaven/students/theo.png' }, { name: "Bhedum 'Rampart' Sooviij", college: 'Lorehold' }, { name: 'Nora Ann Wu' }, { name: 'Ana Ink' }, { name: 'Ana Ivy' }];
  assert.equal(V.guessStudent(people, 'Theo Gearsprocket').name, 'Theo Gearsprocket Finch');
  assert.equal(V.guessStudent(people, 'Rampart').name, "Bhedum 'Rampart' Sooviij");
  assert.equal(V.guessStudent(people, 'Nora Ann Vu'), null, 'no exact words: no guess');
  assert.equal(V.guessStudent(people, 'Ana'), null, 'more than one match: no guess');
  const theo = { index: 0, npc_name: 'Theo Gearsprocket', display_name: 'Theo Gearsprocket', points: 5, link: null };
  const html = V.relationshipsView({ ...base, view: 'relationships', isGM: false, people, heroes: [hero([], [theo])] });
  assert.match(html, /class="face c-quandrix" style="background-image:url\('\.\.\/strixhaven\/students\/theo\.png'\)" title="Picture from the Students page: Theo Gearsprocket Finch"/);
  assert.match(html, /<span class="sub sub-npc">NPC · Quandrix<\/span>/, 'still not linked (no synced points); the matched student’s college is said');
  const linked = { index: 1, npc_name: 'Ana Ink', points: 1, link: { type: 'student', name: 'Ana Ink', college: 'Silverquill' } };
  assert.match(V.relationshipsView({ ...base, view: 'relationships', isGM: false, heroes: [hero([], [linked])] }), /class="face c-silverquill" style="" title="Silverquill">A</);
});

test('one percent for everyone: rounded down, the same for the Director and a player, never 100% before complete', () => {
  const gmP = (earned, total) => ({ index: 0, project_name: 'Ward', points_earned: earned, total_points: total, points_history: [earned], waiting: false, complete: false });
  // 122/125 = 97.6%: the server floors the player's percent to 97, and the Director's card must say 97 too (not 98).
  assert.equal(V.percentOf(gmP(122, 125)), 97);
  assert.equal(V.percentOf({ percent: 97 }), 97);
  assert.equal(V.percentOf(gmP(173, 200)), 86);
  assert.equal(V.percentOf(gmP(91, 110)), 82);
  assert.equal(V.percentOf(gmP(29, 100)), 29, 'no float slip (0.29 * 100 = 28.999…)');
  assert.equal(V.percentOf(gmP(199, 200)), 99);
  assert.equal(V.percentOf(gmP(999, 1000)), 99, '99.9% is not 100%');
  assert.equal(V.percentOf(gmP(125, 125)), 100);
  assert.equal(V.percentOf({ percent: 100, complete: false, waiting: false, total_points: 0 }), 100);
  assert.equal(V.percentOf({ waiting: true, percent: 50 }), 0);
  const gm = V.projectsView({ ...base, isGM: true, heroes: [hero([gmP(122, 125)])] });
  const pl = V.projectsView({ ...base, isGM: false, heroes: [hero([{ index: 0, project_name: 'Ward', percent: 97, waiting: false, complete: false }])] });
  assert.match(gm, /122 \/ 125 <small>97%<\/small>/);
  assert.match(pl, /<small>97%<\/small>/);
  assert.match(gm, /class="fill" style="width:97%"/);
});

test('owner faces carry the hero’s college ring (gold when unknown); only shown with "All heroes"', () => {
  const sharon = { id: 'sharon', name: 'Sharon', info: { portrait: 'p/sharon.png', college: 'Witherbloom' }, projects: [playerProject], relationships: [] };
  const html = V.projectsView({ ...base, who: 'all', isGM: false, heroes: [sharon, hero([playerProject])] });
  assert.match(html, /<span class="hero-dot owner c-witherbloom" style="background-image:url\('\.\.\/p\/sharon\.png'\)" title="Sharon">/);
  assert.match(html, /<span class="hero-dot owner" style="[^"]*" title="Cal">/);
  assert.doesNotMatch(V.projectsView({ ...base, isGM: false, heroes: [hero([playerProject])] }), /hero-dot/);
});

test('a player sees whose project another hero’s card is ("Sharon’s project", with her face); not on their own', () => {
  const sharon = { id: 'sharon', name: 'Sharon', info: { portrait: 'p/sharon.png', college: 'Witherbloom' }, projects: [{ ...playerProject, project_name: 'Ink' }], relationships: [] };
  const html = V.projectsView({ ...base, who: 'all', isGM: false, me: 'cal', heroes: [sharon, hero([playerProject])] });
  assert.match(html, /<h4 title="Ink">Ink<\/h4><span class="owner-tag"[^>]*>Sharon’s project<\/span>/);
  assert.doesNotMatch(html, /Cal’s project/, 'not on the player’s own card');
  assert.match(html, /data-roll="sharon:0"/, 'they can still roll on it');
  const one = V.projectsView({ ...base, who: 'sharon', isGM: false, me: 'cal', heroes: [sharon, hero([playerProject])] });
  assert.match(one, /hero-dot owner c-witherbloom/, 'the face shows even when only Sharon is picked');
  assert.doesNotMatch(V.projectsView({ ...base, who: 'all', isGM: true, me: 'gm', heroes: [sharon] }), /owner-tag/, 'the Director sees faces only');
});

test('relationships: a card with no notes says so; an unknown person gets the neutral bronze face', () => {
  const nora = { index: 0, npc_name: 'Nora Ann Vu', display_name: 'Nora Ann Vu', points: 2, extra: '  ', link: null };
  const html = V.relationshipsView({ ...base, view: 'relationships', isGM: false, people: [], heroes: [hero([], [nora])] });
  assert.match(html, /<p class="notes none">No notes<\/p>/);
  assert.match(html, /class="face c-neutral" style="">N</);
  assert.match(html, /<span class="sub sub-npc">NPC · not on the Students page<\/span>/, 'an NPC line as full as a college label');
  const noted = V.relationshipsView({ ...base, view: 'relationships', isGM: false, heroes: [hero([], [{ ...nora, extra: 'Expedition' }])] });
  assert.doesNotMatch(noted, /No notes/);
});
