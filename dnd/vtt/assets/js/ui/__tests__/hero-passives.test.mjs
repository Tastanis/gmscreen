import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { heroPassives, passiveAsAbility, passiveDescription, PASSIVE_TRAY_CATEGORY } from '../hero-passives.js';
import { mountCharacterSummaryPanel } from '../character-summary-panel.js';

// Passives on the board's ability bar (Brandon, November 10, 2026: "In the VTT ability tray, let's add passives. And
// it can show all their information. The same way any other ability would. It shows all of their text."). They are
// the sheet's features.

test('a feature as a passive card: all its text, line by line; the sheet\'s "type about this" stand-in dropped', () => {
  const passive = passiveAsAbility({ id: 'feature_1', title: 'Clarity', useWhen: 'type about this', tags: ['Talent'], text: 'Strained: you take 1 damage.\nSpend 1 Clarity: push 1 more.', automation: null });
  assert.equal(passive.name, 'Clarity');
  assert.equal(passive.actionLabel, 'Passive');
  assert.equal(passive.useWhen, '');
  assert.deepEqual(passive.tags, ['Talent']);
  assert.equal(passive.description, 'Strained: you take 1 damage.\n\nSpend 1 Clarity: push 1 more.');
  assert.equal(passive._stableActionId, 'feature_1');
  assert.equal(passiveDescription('A<br>B\r\nC'), 'A\n\nB\n\nC');
  assert.equal(passiveAsAbility({ title: '', text: '' }), null);
  assert.deepEqual(heroPassives({ features: [{ title: 'Grit', text: 'Tough.' }, null, { title: 'Ferocity', useWhen: 'You take damage', text: 'Gain 1 ferocity.' }] }).map((p) => [p.name, p.useWhen]),
    [['Grit', ''], ['Ferocity', 'You take damage']]);
  assert.deepEqual(heroPassives({}), []);
  assert.deepEqual(PASSIVE_TRAY_CATEGORY, { key: 'passives', label: 'Passive', heading: 'Passives', empty: 'No passives listed.' });
});

async function settle(rounds = 12) { for (let i = 0; i < rounds; i += 1) await new Promise((resolve) => setTimeout(resolve, 0)); }

async function withTray(fn) {
  const dom = new JSDOM('<body><div class="vtt-board__header"></div><aside id="vtt-character-summary-panel"></aside></body>', { url: 'http://localhost/dnd/vtt/', pretendToBeVisual: true });
  const keys = ['window', 'document', 'CustomEvent', 'Element', 'HTMLElement', 'MutationObserver', 'BroadcastChannel', 'fetch'];
  const saved = Object.fromEntries(keys.map((key) => [key, globalThis[key]]));
  const sheet = {
    hero: { name: 'Indigo', vitals: { currentStamina: 30, staminaMax: 40 }, resource: { title: 'Clarity', value: 1 } },
    sidebar: {},
    features: [
      { id: 'f-clarity', title: 'Clarity', useWhen: 'type about this', tags: [], text: 'Strained: you take 1 damage at the end of your turn.\nYou can go below 0 Clarity.' },
      { id: 'f-ward', title: 'Entropy Ward', tags: [], text: 'Strike back.', automation: { cards: [{ type: 'damage', amount: '2' }] } },
    ],
    actions: { mains: [{ name: 'Mind Spike' }] },
  };
  const reply = (value) => ({ ok: true, status: 200, json: async () => value });
  Object.assign(globalThis, {
    window: dom.window, document: dom.window.document, CustomEvent: dom.window.CustomEvent, Element: dom.window.Element, HTMLElement: dom.window.HTMLElement,
    MutationObserver: dom.window.MutationObserver,
    BroadcastChannel: class { addEventListener() {} postMessage() {} close() {} },
    fetch: async (url) => {
      const action = new URL(url, 'http://localhost/').searchParams.get('action');
      if (action === 'live') return reply({ success: true, revision: 1, locks: [] });
      return reply({ success: true, data: structuredClone(sheet) });
    },
  });
  const chat = [], runs = [];
  dom.window.dashboardChat = { sendMessage: (m) => { chat.push(m); return true; } };
  dom.window.AbilityAutomationRunner = { open: (ctx) => runs.push(ctx) };
  try {
    mountCharacterSummaryPanel({ sheet: '/dnd/character_sheet/handler.php' }, { name: 'indigo' });
    document.dispatchEvent(new CustomEvent('vtt:token-selection-summary', { detail: { characterId: 'indigo', token: { id: 'indigo-token' } } }));
    await settle();
    await fn({ chat, runs });
  } finally {
    dom.window.close();
    Object.assign(globalThis, saved);
  }
}

test('the ability bar has a Passive tab: each passive with its whole card on hover; a click runs its automation or shows its card', async () => {
  await withTray(async ({ chat, runs }) => {
    const tray = document.getElementById('vtt-character-ability-tray');
    const tabs = [...tray.querySelectorAll('[data-character-ability-category]')].map((b) => b.textContent.trim());
    assert.deepEqual(tabs, ['Trigger', 'Main Action', 'Maneuver', 'Passive', 'Items']);
    tray.querySelector('[data-character-ability-category="passives"]').click();
    const items = [...tray.querySelectorAll('[data-character-ability-item]')];
    assert.deepEqual(items.map((n) => n.querySelector('.vtt-character-ability-item__name').textContent), ['Clarity', 'Entropy Ward']);
    assert.ok(items[1].classList.contains('vtt-character-ability-item--automated'), 'the automated one is marked as the others are');
    assert.ok(tray.querySelector('[data-character-chat-post="ability"][data-ability-category="passives"]'), 'a chat dot like the other abilities');

    // Hover: the card with all of its text.
    items[0].dispatchEvent(new window.MouseEvent('pointerover', { bubbles: true }));
    const preview = document.getElementById('vtt-character-ability-preview');
    assert.ok(preview.classList.contains('vtt-character-ability-preview--open'));
    const paragraphs = [...preview.querySelectorAll('.vtt-character-ability-card__description p')].map((p) => p.textContent);
    assert.deepEqual(paragraphs, ['Strained: you take 1 damage at the end of your turn.', 'You can go below 0 Clarity.']);
    assert.match(preview.querySelector('.vtt-character-ability-card__type').textContent, /Passive/);
    assert.equal(preview.querySelector('.vtt-character-ability-card__when'), null, 'no "type about this" stand-in');
    items[0].dispatchEvent(new window.MouseEvent('pointerout', { bubbles: true, relatedTarget: document.body }));
    assert.equal(preview.classList.contains('vtt-character-ability-preview--open'), false, 'gone when the pointer leaves');

    // A click on a passive with nothing to run: its card, no chat post.
    tray.querySelector('[data-character-ability-item][data-ability-index="0"]').click();
    assert.ok(preview.classList.contains('vtt-character-ability-preview--open'));
    assert.match(preview.textContent, /Clarity/);
    assert.equal(chat.length, 0);

    // A click on one with an automation: it runs, as the other abilities do.
    tray.querySelector('[data-character-ability-item][data-ability-index="1"]').click();
    assert.equal(runs.length, 1);
    assert.equal(runs[0].action.name, 'Entropy Ward');
    assert.equal(runs[0].actionType, 'passives');

    // Running one closes the list, as for every ability; its chat dot posts it.
    assert.equal(tray.querySelector('[data-character-ability-item]'), null);
    tray.querySelector('[data-character-ability-category="passives"]').click();
    tray.querySelector('[data-character-chat-post="ability"][data-ability-category="passives"][data-ability-index="0"]').click();
    assert.equal(chat.length, 1);
    assert.match(chat[0].message, /Indigo - Clarity\nType: Passive/);
  });
});

test('the bar\'s layout holds four ability tabs and Items', async () => {
  const { readFileSync } = await import('node:fs');
  const css = readFileSync(new URL('../../../css/character-summary.css', import.meta.url), 'utf8');
  assert.match(css, /grid-template-columns: repeat\(4, minmax\(104px, 1fr\)\) minmax\(58px, 78px\);/);
  assert.match(css, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\) minmax\(48px, 0\.62fr\);/);
});
