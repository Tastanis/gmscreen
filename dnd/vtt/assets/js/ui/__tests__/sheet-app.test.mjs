import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

// The character sheet page (character_sheet/app.js, October 2026) in a pretend browser: the theme, saving through
// save-fields with the page's revision, a stale save refused and reloaded, drag order persisted, damage through
// sync-vitals with temporary Stamina told to the token, an ability's Use posting to chat.

const page = readFileSync(new URL('../../../../../character_sheet/index.php', import.meta.url), 'utf8');
const skeleton = page.slice(page.indexOf('<main id="sheet-app"'), page.indexOf('</main>') + 7).replace(/<\?php[\s\S]*?\?>/g, '');

const server = {
  revision: 7,
  sheet: {
    hero: { name: 'Indigo', vitals: { staminaMax: 36, currentStamina: 24, tempStamina: 4, recoveriesMax: 8, currentRecoveries: 6 }, resource: { title: 'Clarity', value: 2 }, surges: 1, victories: 0 },
    actions: { mains: [{ id: 'a1', name: 'Mind Spike', tests: [] }, { id: 'a2', name: 'Bolt', cost: '3 Clarity' }], maneuvers: [], triggers: [], freeStrikes: [] },
    features: [{ id: 'f1', title: 'Feat' }],
  },
  posts: [],
  answer: null,          // a one-off answer for the next save-fields
  loads: 0,
};

const dom = new JSDOM(`<!doctype html><html><body class="sheet-v2" data-character="indigo" data-user="gm" data-is-gm="1">${skeleton}</body></html>`, { url: 'http://localhost/dnd/character_sheet/index.php', pretendToBeVisual: true });
const broadcasts = [];
class FakeChannel { constructor(name) { this.name = name; } postMessage(m) { broadcasts.push({ channel: this.name, m }); } addEventListener() {} close() {} }
const json = (value) => ({ ok: true, status: 200, json: async () => value });
Object.assign(globalThis, {
  window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, Element: dom.window.Element, HTMLElement: dom.window.HTMLElement,
  Event: dom.window.Event, CustomEvent: dom.window.CustomEvent, getComputedStyle: dom.window.getComputedStyle.bind(dom.window), BroadcastChannel: FakeChannel,
  location: dom.window.location,
  fetch: async (url, options = {}) => {
    const u = new URL(url, 'http://localhost/dnd/character_sheet/');
    if (!options.method || options.method === 'GET') {
      const action = u.searchParams.get('action');
      if (action === 'load') { server.loads++; return json({ success: true, data: structuredClone(server.sheet), revision: server.revision }); }
      if (action === 'live') return json({ success: true, revision: server.revision, locks: [] });
      if (action === 'sync-hero-tokens') return json({ success: true, heroTokens: [false, false] });
      // No campaign record yet and no portrait in the heroes list: the header falls back to the map token's picture.
      if (u.pathname.endsWith('campaign.php') && action === 'heroes') return json({ success: true, heroes: [{ id: 'indigo', name: 'Indigo', portrait: '' }] });
      if (u.pathname.endsWith('campaign.php')) return json({ success: false, error: 'not yet' });
      if (u.pathname === '/dnd/vtt/api/tokens.php') return json({ success: true, data: { folders: [], items: [{ id: 't1', name: 'Zepha', imageUrl: '/dnd/vtt/storage/tokens/z.png' }, { id: 't2', name: 'Indigo', imageUrl: '/dnd/vtt/storage/tokens/indigo.png' }] } });
      return json({ success: false });
    }
    const body = new URLSearchParams(options.body);
    server.posts.push({ path: u.pathname, body });
    const action = body.get('action');
    if (action === 'save-fields') {
      if (server.answer) { const a = server.answer; server.answer = null; return json(a); }
      server.revision += 1;
      return json({ success: true, applied: JSON.parse(body.get('changes')).length, revision: server.revision });
    }
    if (action === 'sync-vitals') return json({ success: true, currentStamina: 22, currentRecoveries: 6, tempStamina: 0 });
    if (action === 'chat_send') return json({ success: true });
    if (action === 'lock' || action === 'heartbeat') return json({ success: true, locked: true });
    if (action === 'unlock') return json({ success: true, released: true });
    return json({ success: false });
  },
});
dom.window.scrollTo = () => {};
const settle = async (n = 20) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0)); };

await import('../../../../../character_sheet/app.js');
await settle(40);
const app = dom.window.SheetApp;

test('the page starts with the Diablo look and the Skills & traits tab; the switch is remembered', async () => {
  assert.equal(dom.window.document.documentElement.dataset.sheetStarted, '1');
  const root = dom.window.document.getElementById('sheet-app');
  assert.equal(root.dataset.sheetTheme, 'diablo');
  assert.equal(root.querySelector('[data-sheet-tab].on').dataset.sheetTab, 'skills');
  // 24 of 36 with 4 temporary: the pill says only "4 temp" (never "stamina"); no stored recovery value, no "!" chip.
  assert.equal(root.querySelector('.sp-stam__state').textContent, '4 temp');
  assert.equal(root.querySelector('.sp-stam__wlbl'), null, 'the tick is unlabelled');
  assert.equal(root.querySelector('.sp-warn'), null);
  root.querySelector('[data-sheet-theme-toggle]').click();
  assert.equal(root.dataset.sheetTheme, 'parchment');
  assert.equal(dom.window.localStorage.getItem('sheet-theme'), 'parchment');
  root.querySelector('[data-sheet-theme-toggle]').click();
  assert.equal(dom.window.localStorage.getItem('sheet-theme'), 'diablo');
});

test('dragging a card persists the new order through save-fields, with the page\'s revision', async () => {
  const root = dom.window.document.getElementById('sheet-app');
  root.querySelector('[data-sheet-tab="abilities"]').click();
  root.querySelector('[data-sheet-edit-toggle]').click();
  assert.ok(root.querySelector('[data-kind="mains"][draggable="true"]'), 'cards are draggable in edit mode');
  assert.ok(dom.window.document.body.classList.contains('edit-mode'), 'the inventory sees edit mode too');
  const before = server.posts.length;
  await app.moveCard('mains', 1, 0, false);
  await settle();
  const save = server.posts.slice(before).find((p) => p.body.get('action') === 'save-fields');
  assert.ok(save, 'saved');
  assert.deepEqual(JSON.parse(save.body.get('changes')).map((c) => c.path.join('.')), ['actions.mains']);
  assert.deepEqual(JSON.parse(save.body.get('changes'))[0].value.map((a) => a.name), ['Bolt', 'Mind Spike']);
  assert.equal(save.body.get('baseRevision'), '7');
  assert.equal(app.live.revision, 8, 'the page takes the new revision');
  const locks = server.posts.slice(before).map((p) => p.body.get('action'));
  assert.deepEqual([locks[0], locks.at(-1)], ['lock', 'unlock'], 'the list is locked while it is saved');
  server.sheet.actions.mains = [server.sheet.actions.mains[1], server.sheet.actions.mains[0]];
});

test('a stale save is refused, not written: the page reloads the sheet', async () => {
  const loads = server.loads;
  server.answer = { success: false, stale: true, conflicts: ['hero.wealth'], error: 'Someone else changed this since your page last read it.' };
  app.state.sheet.hero.wealth = '3';
  const ok = await app.saveSheet({ typed: true });
  await settle();
  assert.equal(ok, false);
  assert.ok(server.loads > loads, 'the sheet was read again');
  assert.equal(app.state.sheet.hero.wealth, server.sheet.hero.wealth ?? '', 'the server\'s value stands');
  assert.match(dom.window.document.querySelector('.sp-flash').textContent, /Someone else changed this/);
});

test('damage goes through sync-vitals and the token is told the server\'s answer, temporary Stamina included', async () => {
  const root = dom.window.document.getElementById('sheet-app');
  root.querySelector('[data-character-stamina-action="damage"]').click();
  await settle();
  const input = dom.window.document.querySelector('.sp-modal [data-ask]');
  input.value = '6';
  dom.window.document.querySelector('.sp-modal [data-go]').click();
  await settle(40);
  const post = server.posts.filter((p) => p.body.get('action') === 'sync-vitals').at(-1);
  assert.equal(post.body.get('staminaDelta'), '-6');
  const told = broadcasts.filter((b) => b.channel === 'vtt-stamina-sync').at(-1).m;
  assert.deepEqual([told.currentStamina, told.tempStamina, told.source, told.character], [22, 0, 'sheet', 'indigo']);
  assert.match(root.querySelector('.vtt-character-healthbar__text').textContent, /22 \/ 36/);
});

test('Use on an ability posts its card to chat (the full sheet does not run automation)', async () => {
  const root = dom.window.document.getElementById('sheet-app');
  root.querySelector('[data-sheet-edit-toggle]').click();
  root.querySelector('[data-sheet-tab="abilities"]').click();
  root.querySelector('[data-kind="mains"] [data-sheet-use]').click();
  await settle();
  const chat = server.posts.filter((p) => p.body.get('action') === 'chat_send').at(-1);
  assert.match(chat.body.get('message'), /^Indigo — Bolt\nType: /);
  assert.match(chat.body.get('message'), /Cost: 3 Clarity/);
});

test('the header portrait: no record and no heroes-list picture, so the hero’s map token picture (by name)', async () => {
  const pic = dom.window.document.querySelector('#sheet-app .sp-pic');
  assert.match(pic.getAttribute('style'), /url\('\/dnd\/vtt\/storage\/tokens\/indigo\.png'\)/);
  assert.ok(!pic.classList.contains('sp-pic--initials'));
  assert.equal(app.state.portrait, '/dnd/vtt/storage/tokens/indigo.png');
});

test('a form sends only what was changed in it: Stamina changed on the map while it was open is not written back', async () => {
  // October 2026: Hero & vitals open, the token hit for 3 (the page reloads behind the form), the form saved for a
  // new Wealth: it sent the Stamina it opened with too, and the token followed it back up.
  const root = dom.window.document.getElementById('sheet-app');
  if (!app.state.editing) root.querySelector('[data-sheet-edit-toggle]').click();
  root.querySelector('[data-sheet-edit-section="core"]').click();
  await settle();
  const form = dom.window.document.querySelector('.sp-modal');
  assert.equal(form.querySelector('[data-f="vitals.currentStamina"]').value, String(app.state.sheet.hero.vitals.currentStamina));
  server.sheet.hero.vitals.currentStamina = 9; server.revision += 1;
  await app.load({ quiet: true });
  assert.equal(app.state.sheet.hero.vitals.currentStamina, 9, 'the page reloaded behind the form');
  form.querySelector('[data-f="wealth"]').value = '12';
  const before = server.posts.length;
  form.querySelector('[data-go]').click();
  await settle(40);
  const save = server.posts.slice(before).find((p) => p.body.get('action') === 'save-fields');
  assert.deepEqual(JSON.parse(save.body.get('changes')), [{ path: ['hero', 'wealth'], value: '12' }]);
  assert.equal(app.state.sheet.hero.vitals.currentStamina, 9);
  server.sheet.hero.wealth = '12';
});

test('a skill taken off in the Skills form is saved off (the skills are sent whole)', async () => {
  server.sheet.sidebar = { skills: { Alchemy: { level: 'Trained', bonus: '' }, Sneak: { level: 'Trained', bonus: '' } } }; server.revision += 1;
  await app.load({ quiet: true });
  const root = dom.window.document.getElementById('sheet-app');
  root.querySelector('[data-sheet-tab="skills"]').click();
  if (!app.state.editing) root.querySelector('[data-sheet-edit-toggle]').click();
  root.querySelector('[data-sheet-edit-section="skills"]').click();
  await settle();
  const form = dom.window.document.querySelector('.sp-modal');
  form.querySelector('[data-row="skill"][data-skill="Alchemy"] [data-remove-row]').click();
  const before = server.posts.length;
  form.querySelector('[data-go]').click();
  await settle(40);
  const save = server.posts.slice(before).find((p) => p.body.get('action') === 'save-fields');
  assert.ok(save, 'saved');
  assert.deepEqual(JSON.parse(save.body.get('changes')), [{ path: ['sidebar', 'skills'], value: { Sneak: { level: 'Trained', bonus: '' } } }]);
  assert.deepEqual(Object.keys(app.state.sheet.sidebar.skills), ['Sneak']);
});

test('the record degrades when the campaign record is not there yet', async () => {
  const root = dom.window.document.getElementById('sheet-app');
  root.querySelector('[data-sheet-tab="record"]').click();
  assert.match(root.textContent, /The campaign record is not available right now\./);
  assert.equal(root.querySelector('[data-sheet-info]'), null, 'nothing to edit');
  app.live.stop();
  dom.window.close();
});
