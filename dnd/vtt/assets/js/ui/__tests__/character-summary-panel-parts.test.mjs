import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { mountCharacterSummaryPanel } from '../character-summary-panel.js';

// The map's side panel draws the same parts as the full sheet at panel width (October 2026): the status, then
// Skills & traits / Features / Record, with no Abilities tab (the board's ability bar below keeps them). A change
// to the sheet made elsewhere reaches the panel through the sheet's revision; a field being edited shows as locked.

async function settle(rounds = 12) { for (let i = 0; i < rounds; i += 1) await new Promise((resolve) => setTimeout(resolve, 0)); }

async function withPanel(fn, { embed = false } = {}) {
  const dom = new JSDOM(`<body>${embed ? '<div id="te-top"></div>' : ''}<div class="vtt-board__header"></div><aside id="vtt-character-summary-panel"></aside></body>`, { url: 'http://localhost/dnd/vtt/', pretendToBeVisual: true });
  if (embed) {
    // Inside the Table: the embed's top bar ends 72px down.
    dom.window.document.documentElement.classList.add('vtt-embed');
    dom.window.document.getElementById('te-top').getBoundingClientRect = () => ({ top: 0, bottom: 72, left: 0, right: 1200, width: 1200, height: 72 });
  }
  const keys = ['window', 'document', 'CustomEvent', 'Element', 'HTMLElement', 'MutationObserver', 'BroadcastChannel', 'fetch'];
  const saved = Object.fromEntries(keys.map((key) => [key, globalThis[key]]));
  const state = {
    revision: 3, locks: [], requests: [],
    sheet: { hero: { name: 'Cal', vitals: { currentStamina: 30, staminaMax: 40, currentRecoveries: 2, recoveriesMax: 8, tempStamina: 3 }, resource: { title: 'Focus', value: 1 } },
      sidebar: { skills: { Climb: 'Trained' } }, features: [{ title: 'Grit', text: 'Effect: tough.' }], actions: { mains: [{ name: 'Strike' }] } },
  };
  const reply = (value) => ({ ok: true, status: 200, json: async () => value });
  Object.assign(globalThis, {
    window: dom.window, document: dom.window.document, CustomEvent: dom.window.CustomEvent, Element: dom.window.Element, HTMLElement: dom.window.HTMLElement,
    MutationObserver: dom.window.MutationObserver,
    BroadcastChannel: class { addEventListener() {} postMessage() {} close() {} },
    fetch: async (url) => {
      const u = new URL(url, 'http://localhost/');
      const action = u.searchParams.get('action');
      state.requests.push(action);
      if (action === 'live') return reply({ success: true, revision: state.revision, locks: state.locks });
      if (u.pathname.endsWith('campaign.php')) return reply({ success: true, heroes: [{ id: 'cal', info: { college: 'Lorehold', player_name: 'Sam', portrait: 'portraits/cal.png' } }] });
      return reply({ success: true, data: structuredClone(state.sheet) });
    },
  });
  try {
    mountCharacterSummaryPanel({ sheet: '/dnd/character_sheet/handler.php' }, { name: 'cal' });
    document.dispatchEvent(new CustomEvent('vtt:token-selection-summary', { detail: { characterId: 'cal', token: { id: 'cal-token' } } }));
    await settle();
    await fn(state, dom);
  } finally {
    dom.window.close();
    Object.assign(globalThis, saved);
  }
}

test('the panel: the status and Skills & traits / Features / Record, no Abilities tab; the ability bar stays', async () => {
  await withPanel(async () => {
    const tabs = [...document.querySelectorAll('#vtt-character-summary-panel [data-sheet-tab]')].map((b) => b.dataset.sheetTab);
    assert.deepEqual(tabs, ['skills', 'features', 'record']);
    assert.equal(document.querySelector('#vtt-character-summary-panel [data-sheet-ab-tab]'), null, 'no ability cards in the panel');
    assert.ok(document.querySelector('#vtt-character-ability-tray'), 'the board\'s ability bar is still there');
    assert.match(document.querySelector('.vtt-character-healthbar__text').textContent, /30 \/ 40\s*\+3/, 'temporary Stamina in the bar');
    assert.ok(document.querySelector('[data-sp-temp-fill]'), 'drawn blue from the right');
    assert.match(document.querySelector('.vtt-panel-ability-hint')?.textContent || '', /Abilities: on the bar below the board/, 'a one-line pointer where abilities would be');
    assert.equal(document.querySelector('#vtt-character-summary-panel .sp').dataset.sheetTheme, 'diablo', 'Diablo by default');
    document.querySelector('[data-sheet-tab="features"]').click();
    assert.match(document.querySelector('#vtt-character-summary-panel .sp-pane').textContent, /Grit/);
    assert.equal(document.querySelector('.vtt-panel-ability-hint'), null, 'the pointer shows on Skills & traits only');
    document.querySelector('[data-sheet-tab="record"]').click();
    await settle();
    assert.match(document.querySelector('#vtt-character-summary-panel .sp-pane').textContent, /Lorehold/);
    assert.equal(document.querySelector('#vtt-character-summary-panel [data-sheet-info]'), null, 'the panel shows the record, it does not edit it');
    assert.ok(document.querySelector('[data-character-open-sheet]'), 'the Sheet button is there');
  });
});

test('a change to the sheet made elsewhere reaches the panel through the revision; a lock shows', async () => {
  await withPanel(async (state) => {
    // The panel's live poll runs every 1.6 s; this calls the same read the timer does.
    state.sheet.hero.vitals.currentStamina = 12;
    state.revision = 4;
    state.locks = [{ field: 'sidebar.skills', user: 'gm', name: 'GM', mine: false }];
    await new Promise((resolve) => setTimeout(resolve, 1800));
    await settle();
    assert.match(document.querySelector('.vtt-character-healthbar__text').textContent, /12 \/ 40/);
    assert.match(document.querySelector('#vtt-character-summary-panel .sp-pane').textContent, /GM is editing/);
  });
});


test('conditions: a themed "+ condition" menu (no native select); a pick goes to the token; the record portrait resolves from dnd/', async () => {
  await withPanel(async () => {
    const panel = document.getElementById('vtt-character-summary-panel');
    assert.equal(panel.querySelector('select'), null, 'no native select');
    const toggle = panel.querySelector('[data-character-condition-menu]');
    const menu = panel.querySelector('.sp-cond-menu');
    assert.ok(toggle && menu);
    assert.equal(menu.hidden, true);
    toggle.click();
    assert.equal(menu.hidden, false);
    assert.equal(toggle.getAttribute('aria-expanded'), 'true');
    const applied = [];
    document.addEventListener('vtt:automation-apply-condition', (e) => applied.push(e.detail.payload));
    menu.querySelector('[data-character-condition-pick="Prone"]').click();
    assert.deepEqual(applied, [{ placementId: 'cal-token', condition: { name: 'Prone', duration: 'save-ends' } }]);
    assert.equal(menu.hidden, true, 'the menu closes after a pick');
    // The token has no picture: the header uses the campaign record's portrait, resolved under dnd/ (not dnd/vtt/).
    assert.match(panel.querySelector('.sp-pic').getAttribute('style'), /url\('\/dnd\/portraits\/cal\.png'\)/);
    panel.querySelector('[data-sheet-tab="record"]').click();
    assert.equal(panel.querySelector('.sp-portrait').getAttribute('src'), '/dnd/portraits/cal.png');
  });
});

test('panel layout: it fills down to just above the ability bar; every ability-bar dot sits top-right', async () => {
  const { readFileSync } = await import('node:fs');
  const css = readFileSync(new URL('../../../css/character-summary.css', import.meta.url), 'utf8');
  assert.match(css, /--vtt-character-panel-bottom: calc\(18px \+ 38px \+ 8px\)/, 'the bar: 18px up, 38px tall, then an 8px gap');
  assert.match(css, /\.vtt-character-summary:not\(\.vtt-monster-summary\) \{ bottom: var\(--vtt-character-panel-bottom\); max-height: none; \}/);
  assert.match(css, /\.vtt-character-ability-tab > \.vtt-character-ability-tab__trigger-dot \{\s*top: 4px; right: 4px; left: auto; transform: none; width: 9px; height: 9px;/);
});

test('inside the Table the panel starts flush under the embed\'s top bar (no strip of board above the name)', async () => {
  await withPanel(async () => {
    assert.equal(document.body.style.getPropertyValue('--vtt-character-panel-embed-top'), '73px', 'one pixel under the 72px bar');
  }, { embed: true });
  await withPanel(async () => {
    assert.equal(document.body.style.getPropertyValue('--vtt-character-panel-embed-top'), '', 'outside the Table: not set');
  });
  const { readFileSync } = await import('node:fs');
  const css = readFileSync(new URL('../../../css/character-summary.css', import.meta.url), 'utf8');
  assert.match(css, /html\.vtt-embed body\.vtt-body \.vtt-character-summary \{ top: var\(--vtt-character-panel-embed-top, 80px\) !important; \}/);
});

test('more below: the bottom fade and chevron show whenever rows are below, re-checked after every draw', async () => {
  await withPanel(async () => {
    const panel = document.getElementById('vtt-character-summary-panel');
    // Measured while hidden (nothing to scroll): "at the end".
    panel.dispatchEvent(new window.Event('scroll'));
    assert.ok(panel.classList.contains('vtt-character-summary--at-end'));
    // Shown with rows below: the next draw clears the stale class, so the fade is back.
    Object.defineProperty(panel, 'scrollHeight', { configurable: true, value: 1100 });
    Object.defineProperty(panel, 'clientHeight', { configurable: true, value: 690 });
    Object.defineProperty(panel, 'scrollTop', { configurable: true, writable: true, value: 0 });
    document.querySelector('[data-sheet-tab="skills"]').click();
    assert.equal(panel.classList.contains('vtt-character-summary--at-end'), false, 'rows below: the fade shows');
    panel.scrollTop = 410;
    panel.dispatchEvent(new window.Event('scroll'));
    assert.ok(panel.classList.contains('vtt-character-summary--at-end'), 'scrolled to the end: the fade goes');
  });
  const { readFileSync } = await import('node:fs');
  const css = readFileSync(new URL('../../../css/character-summary.css', import.meta.url), 'utf8');
  assert.match(css, /\.sp--panel::after \{ content: "\\25BE"; position: sticky; bottom: 0;[^}]*height: 56px; margin-top: -56px;/, 'a 56px sticky fade with a chevron');
  assert.match(css, /\.vtt-character-summary--at-end \.vtt-character-card--sheet \.sp--panel::after \{ opacity: 0; \}/);
});

test('a condition put on the hero from the sheet page shows in the open panel: its chips follow the board\'s token, not the copy taken at selection', async () => {
  await withPanel(async (state, dom) => {
    const chips = () => [...document.querySelectorAll('#vtt-character-summary-panel [data-character-condition-remove]')].map((b) => b.parentElement.textContent);
    assert.deepEqual(chips(), [], 'selected with no conditions');
    // The sheet page added Dazed: the server put it on the token (the board's store) and on the sheet's list.
    dom.window.VTTBoardCallbacks = { getPlacementById: (id) => (id === 'cal-token' ? { id, conditions: [{ name: 'Dazed', duration: { type: 'save-ends' } }] } : null) };
    state.sheet.hero.conditions = [{ name: 'Dazed', duration: 'save-ends' }];
    state.revision = 5;
    await new Promise((resolve) => setTimeout(resolve, 1800));
    await settle();
    assert.equal(chips().length, 1);
    assert.match(chips()[0], /Dazed/);
  });
});
