import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { applyConditionDelta } from '../../../../../character_sheet/parts/conditions.js';

// The character sheet page and the hero's token keep one list of conditions (October 2026; Brandon: "Idk why you
// would have a condition that is in your character sheet and not in the vtt or vice versa. So probably merge them.").
// The page shows the sheet's own list. While the hero is on the map a change here goes to the token, then the same
// change (a delta, never the token's whole list) to the sheet; opening the page writes nothing (late October 2026).
// With no token it changes its own list. The shared parts: conditions-merge.test.mjs.

const page = readFileSync(new URL('../../../../../character_sheet/index.php', import.meta.url), 'utf8');
const skeleton = page.slice(page.indexOf('<main id="sheet-app"'), page.indexOf('</main>') + 7).replace(/<\?php[\s\S]*?\?>/g, '');

const server = {
  revision: 3,
  // The mirror follows the hero's token (revision 6) and is behind it: the token now has Slowed (EOT).
  sheet: { hero: { name: 'Cal', conditions: ['Prone, save ends'], conditionsSource: { placementId: 'cal-token', revision: 6 }, vitals: { staminaMax: 30, currentStamina: 30 } }, actions: {}, features: [] },
  token: { onMap: true, placementId: 'cal-token', entityRevision: 7, conditions: [{ name: 'Slowed', duration: { type: 'end-of-turn' } }] },
  posts: [], loads: 0, tokenReads: 0,
};
const tokenView = () => (server.token.onMap ? { success: true, ...structuredClone(server.token) } : { success: true, onMap: false });

const dom = new JSDOM(`<!doctype html><html><body class="sheet-v2" data-character="cal" data-user="cal" data-is-gm="0">${skeleton}</body></html>`, { url: 'http://localhost/dnd/character_sheet/index.php', pretendToBeVisual: true });
const channels = new Map();
const broadcasts = [];
class FakeChannel {
  constructor(name) { this.name = name; (channels.get(name) || channels.set(name, []).get(name)).push(this); this.listeners = []; }
  postMessage(m) { broadcasts.push({ channel: this.name, m }); }
  addEventListener(type, fn) { this.listeners.push(fn); }
  close() {}
}
const deliver = (name, data) => (channels.get(name) || []).forEach((c) => c.listeners.forEach((fn) => fn({ data })));
const json = (value, status = 200) => ({ ok: status < 400, status, json: async () => value });
Object.assign(globalThis, {
  window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, Element: dom.window.Element, HTMLElement: dom.window.HTMLElement,
  Event: dom.window.Event, CustomEvent: dom.window.CustomEvent, getComputedStyle: dom.window.getComputedStyle.bind(dom.window), BroadcastChannel: FakeChannel,
  location: dom.window.location,
  fetch: async (url, options = {}) => {
    const u = new URL(url, 'http://localhost/dnd/character_sheet/');
    if (u.pathname.endsWith('/api/v2/hero-conditions.php')) {
      if (!options.method || options.method === 'GET') { server.tokenReads++; return json(tokenView()); }
      const body = JSON.parse(options.body);
      server.posts.push({ to: 'token', body });
      if (!server.token.onMap) return json({ success: true, applied: false, onMap: false });
      const key = (c) => `${c.name.toLowerCase()}|${c.duration.type}`;
      const list = server.token.conditions;
      if (body.op === 'add' && !list.some((c) => key(c) === key(body.condition))) list.push(body.condition);
      if (body.op === 'remove') { const at = list.findIndex((c) => key(c) === key(body.condition)); if (at >= 0) list.splice(at, 1); }
      server.token.entityRevision++;
      return json({ success: true, applied: true, ...tokenView() });
    }
    if (!options.method || options.method === 'GET') {
      const action = u.searchParams.get('action');
      if (action === 'load') { server.loads++; return json({ success: true, data: structuredClone(server.sheet), revision: server.revision }); }
      if (action === 'live') return json({ success: true, revision: server.revision, locks: [] });
      if (action === 'sync-hero-tokens') return json({ success: true, heroTokens: [false, false] });
      return json({ success: false });
    }
    const body = Object.fromEntries(new URLSearchParams(options.body));
    server.posts.push({ to: 'sheet', body });
    if (body.action === 'sync-conditions') {
      const conditions = body.delta ? applyConditionDelta(server.sheet.hero.conditions, JSON.parse(body.delta)) : JSON.parse(body.conditions);
      const changed = JSON.stringify(conditions) !== JSON.stringify(server.sheet.hero.conditions);
      if (changed) { server.sheet.hero.conditions = conditions; server.revision++; }
      return json({ success: true, applied: changed, conditions, revision: server.revision });
    }
    if (body.action === 'lock' || body.action === 'heartbeat') return json({ success: true, locked: true });
    return json({ success: false });
  },
});
dom.window.scrollTo = () => {};
const settle = async (n = 30) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0)); };

await import('../../../../../character_sheet/app.js');
await settle(60);
const app = dom.window.SheetApp;
const root = dom.window.document.getElementById('sheet-app');
const chips = () => [...root.querySelectorAll('.sp-cond:not(.sp-cond--add)')].map((c) => `${c.querySelector('.sp-cond__name').textContent} ${c.querySelector('.sp-cond__dur')?.textContent || ''}`.trim());
after(() => { app.live.stop(); dom.window.close(); });
const sheetWrites = () => server.posts.filter((p) => p.to === 'sheet' && p.body.action === 'sync-conditions');

test('opening the page shows the sheet\'s own list and writes nothing, though the token holds others', async () => {
  assert.equal(dom.window.document.documentElement.dataset.sheetStarted, '1');
  assert.ok(server.tokenReads >= 1, 'it did look where the token is');
  assert.deepEqual(chips(), ['Prone SE'], 'the sheet\'s list, not the token\'s leftover Slowed');
  assert.equal(sheetWrites().length, 0, 'a page opening sends nothing');
  assert.equal(app.state.token.onMap, true);
});

test('added on the sheet (Dazed, EOT): on the token, then only that change on the sheet, with the token\'s revision; no loop', async () => {
  const before = server.posts.length;
  root.querySelector('[data-character-condition-menu]').click();
  root.querySelector('[data-condition-duration="end-of-turn"]').click();
  root.querySelector('[data-character-condition-pick="Dazed"]').click();
  await settle();
  const sent = server.posts.slice(before);
  assert.deepEqual(sent[0], { to: 'token', body: { character: 'cal', op: 'add', condition: { name: 'Dazed', duration: { type: 'end-of-turn' } }, operationId: sent[0].body.operationId } });
  assert.equal(sent[1].body.action, 'sync-conditions');
  assert.equal(sent[1].body.revision, '8', 'the token\'s new revision');
  assert.deepEqual(JSON.parse(sent[1].body.delta), [{ op: 'add', condition: { name: 'Dazed', duration: { type: 'end-of-turn' } } }]);
  assert.equal(sent[1].body.conditions, undefined, 'never a whole list');
  assert.deepEqual(chips(), ['Prone SE', 'Dazed EOT'], 'the token\'s Slowed stays off the sheet');
  assert.ok(broadcasts.some((b) => b.channel === 'vtt-condition-sync' && b.m.source === 'sheet' && b.m.onMap === true), 'pages of this browser are told');
  const writes = sheetWrites().length;
  await app.load({ quiet: true });
  await settle();
  assert.equal(sheetWrites().length, writes, 'no echo: reading back its own change writes nothing');
  const loads = server.loads;
  deliver('vtt-condition-sync', { type: 'conditions-sync', source: 'sheet', character: 'cal', delta: [] });
  await settle();
  assert.equal(server.loads, loads, 'its own broadcast is not news to it');
});

test('taken off on the token (the map): the map sends that change, and the sheet shows it gone', async () => {
  server.token.conditions = server.token.conditions.filter((c) => c.name !== 'Dazed');
  server.token.entityRevision++;
  const delta = [{ op: 'remove', condition: { name: 'Dazed', duration: { type: 'end-of-turn' } } }];
  server.sheet.hero.conditions = applyConditionDelta(server.sheet.hero.conditions, delta);
  server.revision++;
  deliver('vtt-condition-sync', { type: 'conditions-sync', source: 'vtt', character: 'cal', delta });
  await settle();
  assert.deepEqual(chips(), ['Prone SE']);
});

test('the × on the sheet takes it off the token and the sheet', async () => {
  const before = server.posts.length;
  root.querySelector('[data-sheet-condition-remove="0"]').click();
  await settle();
  assert.deepEqual(server.posts[before].body.op, 'remove');
  assert.deepEqual(server.posts[before].body.condition, { name: 'Prone', duration: { type: 'save-ends' } });
  assert.deepEqual(JSON.parse(server.posts[before + 1].body.delta), [{ op: 'remove', condition: { name: 'Prone', duration: { type: 'save-ends' } } }]);
  assert.deepEqual(server.token.conditions, [{ name: 'Slowed', duration: { type: 'end-of-turn' } }], 'the token\'s own leftover is not the sheet\'s business');
  assert.deepEqual(chips(), []);
});

test('with no token on the map the sheet edits its own list, with the revision it read', async () => {
  server.token.onMap = false;
  const before = server.posts.length;
  root.querySelector('[data-character-condition-menu]').click();
  root.querySelector('[data-character-condition-other]').click();
  root.querySelector('[data-condition-other-text]').value = 'Soaked';
  root.querySelector('[data-condition-other-add]').click();
  await settle();
  const sent = server.posts.slice(before);
  assert.deepEqual(sent.map((p) => p.to), ['token', 'sheet']);
  assert.equal(sent[1].body.source, 'sheet');
  assert.equal(sent[1].body.baseRevision, String(server.revision - 1), 'the revision the page had read');
  assert.deepEqual(JSON.parse(sent[1].body.conditions), [{ name: 'Soaked', duration: { type: 'save-ends' } }]);
  assert.deepEqual(chips(), ['Soaked SE']);
  const writes = sheetWrites().length;
  await app.followToken();
  assert.equal(sheetWrites().length, writes);
  assert.deepEqual(chips(), ['Soaked SE']);

  // The hero placed again with a token that holds something else: the page still shows its own list, writes nothing.
  server.sheet.hero = { name: 'Cal', conditions: ['Prone, save ends'], vitals: { staminaMax: 30, currentStamina: 30 } };
  server.token = { onMap: true, placementId: 'cal-token-2', entityRevision: 1, conditions: [{ name: 'Bleeding', duration: { type: 'save-ends' } }] };
  const quiet = sheetWrites().length;
  await app.load({ quiet: true });
  await settle();
  assert.deepEqual(chips(), ['Prone SE']);
  assert.equal(sheetWrites().length, quiet, 'a read writes nothing');
});
