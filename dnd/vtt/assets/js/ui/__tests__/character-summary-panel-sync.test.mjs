import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { mountCharacterSummaryPanel, __testing } from '../character-summary-panel.js';

// The map's side panel and the hero's two sheets (October 2026). Damage, healing, Recoveries and temporary Stamina
// pressed on the panel go through the hero's token when it is on the scene (the board writes the sheet), or else
// change the sheet by the amount and tell the token the server's answer, never the panel's own sum. A hit on the
// token reaches the panel at once. Hero tokens are the party's, usable from any hero's panel.

function baseSheet() {
  return {
    hero: {
      name: 'Cal',
      vitals: { currentStamina: 30, staminaMax: 40, currentRecoveries: 2, recoveriesMax: 8, recoveryValue: 13 },
      victories: 2,
      surges: 0,
      resource: { title: 'Focus', value: 1 },
      heroTokens: [true, false],
    },
    actions: { mains: [{ name: 'Plain Strike', description: 'Hit it.' }] },
  };
}

async function settle(rounds = 12) {
  for (let i = 0; i < rounds; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

async function withPanel({ token = {}, answers = {}, board = null } = {}, fn) {
  const dom = new JSDOM('<body><div class="vtt-board__header"></div><aside id="vtt-character-summary-panel"></aside></body>', {
    url: 'http://localhost/dnd/vtt/',
    pretendToBeVisual: true,
  });
  const keys = ['window', 'document', 'CustomEvent', 'Element', 'HTMLElement', 'MutationObserver', 'BroadcastChannel', 'fetch', 'vttUndo'];
  const saved = Object.fromEntries(keys.map((key) => [key, globalThis[key]]));
  const posted = [];
  const channels = [];
  class FakeBroadcastChannel {
    constructor(name) { this.name = name; this.listeners = []; channels.push(this); }
    addEventListener(type, listener) { if (type === 'message') this.listeners.push(listener); }
    postMessage(message) {
      posted.push({ channel: this.name, message });
      channels.filter((other) => other !== this && other.name === this.name)
        .forEach((other) => queueMicrotask(() => other.listeners.forEach((listener) => listener({ data: message }))));
    }
    close() {}
  }
  const state = { sheet: baseSheet(), requests: [], posted, toasts: [], undo: [], amount: '5', chat: [] };
  const reply = (value) => ({ ok: true, status: 200, json: async () => value, clone() { return this; } });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    CustomEvent: dom.window.CustomEvent,
    Element: dom.window.Element,
    HTMLElement: dom.window.HTMLElement,
    MutationObserver: dom.window.MutationObserver,
    BroadcastChannel: FakeBroadcastChannel,
    vttUndo: { recordSheet: (change) => state.undo.push(change) },
    fetch: async (url, options = {}) => {
      if (!options.method || options.method === 'GET') {
        state.requests.push({ action: new URL(url).searchParams.get('action') });
        return reply({ success: true, data: structuredClone(state.sheet) });
      }
      const body = options.body instanceof URLSearchParams ? options.body : new URLSearchParams(options.body);
      state.requests.push({ action: body.get('action'), body });
      const answer = answers[body.get('action')];
      return reply(typeof answer === 'function' ? answer(body, state) : (answer || { success: true }));
    },
  });
  dom.window.UIKit = {
    prompt: async () => state.amount,
    confirm: async () => true,
    toast: (message, kind) => state.toasts.push({ message, kind }),
  };
  dom.window.dashboardChat = { sendMessage: async (entry) => { state.chat.push(entry); return true; } };
  if (board) dom.window.VTTBoardCallbacks = board;
  try {
    mountCharacterSummaryPanel({ sheet: '/dnd/character_sheet/handler.php' }, { name: 'cal' });
    document.dispatchEvent(new CustomEvent('vtt:token-selection-summary', { detail: { characterId: 'cal', token } }));
    await settle();
    state.click = async (selector) => { document.querySelector(selector).click(); await settle(); };
    state.posts = () => state.requests.filter((request) => request.body);
    state.staminaBroadcasts = () => posted.filter((entry) => entry.channel === 'vtt-stamina-sync');
    state.otherStaminaChannel = () => new FakeBroadcastChannel('vtt-stamina-sync');
    await fn(state);
  } finally {
    dom.window.close();
    Object.assign(globalThis, saved);
  }
}

test('damage with no token on the scene tells the token the server\'s answer, not the panel\'s sum', async () => {
  // The sheet took another hit elsewhere: the server answers 20, not the panel's 25.
  await withPanel({ answers: { 'sync-vitals': { success: true, currentStamina: 20, currentRecoveries: 2 } } }, async (state) => {
    await state.click('[data-character-stamina-action="damage"]');
    const [post] = state.posts();
    assert.equal(post.body.get('staminaDelta'), '-5');
    assert.deepEqual(state.staminaBroadcasts().map((entry) => entry.message.currentStamina), [20]);
  });
});

test('a Recovery the server did not spend changes nothing and says why', async () => {
  const answers = { 'sync-vitals': { success: true, spent: 0, currentStamina: 30, currentRecoveries: 0, reason: 'No Recoveries left.' } };
  await withPanel({ answers }, async (state) => {
    await state.click('[data-character-recovery]');
    assert.equal(state.staminaBroadcasts().length, 0, 'the token is not healed');
    assert.equal(state.undo.length, 0);
    assert.match(state.toasts.at(-1).message, /No Recoveries left\./);
    assert.match(document.querySelector('.vtt-character-healthbar__text').textContent, /30 \/ 40/);
  });
});

test('a Recovery spent is kept for turn undo', async () => {
  const answers = { 'sync-vitals': { success: true, spent: 1, currentStamina: 40, currentRecoveries: 1, recoveryValue: 13 } };
  await withPanel({ answers }, async (state) => {
    await state.click('[data-character-recovery]');
    assert.deepEqual(state.undo, [{ characterId: 'cal', counter: 'recoveries', delta: -1 }]);
    assert.deepEqual(state.staminaBroadcasts().map((entry) => entry.message.currentStamina), [40]);
  });
});

function fakeBoard(calls) {
  return {
    applyDamage: async (payload) => { calls.push(['damage', payload]); return { current: 25, max: 40 }; },
    applyHeal: async (payload) => { calls.push(['heal', payload]); return { current: 35, max: 40 }; },
    getActiveScenePlacements: () => [{ id: 'cal-token' }],
  };
}

test('with the hero\'s token on the scene, damage goes through the board once and the panel writes nothing itself', async () => {
  const calls = [];
  await withPanel({ token: { id: 'cal-token' }, board: fakeBoard(calls) }, async (state) => {
    await state.click('[data-character-stamina-action="damage"]');
    assert.deepEqual(calls, [['damage', { placementId: 'cal-token', amount: 5, damageType: '' }]]);
    assert.equal(state.posts().length, 0, 'no sheet write from the panel: the board writes the sheet');
    assert.equal(state.staminaBroadcasts().length, 0, 'and no second broadcast');
    assert.match(document.querySelector('.vtt-character-healthbar__text').textContent, /25 \/ 40/);
  });
});

// Changed on purpose (October 2026): temporary Stamina is its own number with its own board path (keep the higher).
test('the Temp button gives temporary Stamina through the board', async () => {
  const calls = [];
  const board = { ...fakeBoard(calls), applyTemporaryStamina: async (payload) => { calls.push(['temp', payload]); return { current: 30, max: 40, temp: 5 }; } };
  await withPanel({ token: { id: 'cal-token' }, board }, async (state) => {
    await state.click('[data-character-stamina-action="temp"]');
    assert.deepEqual(calls, [['temp', { placementId: 'cal-token', amount: 5 }]]);
  });
});

test('with no token on the scene the Temp button asks the sheet to keep the higher temporary Stamina', async () => {
  await withPanel({ answers: { 'sync-vitals': { success: true, currentStamina: 30, currentRecoveries: 2, tempStamina: 5 } } }, async (state) => {
    await state.click('[data-character-stamina-action="temp"]');
    const [post] = state.posts();
    assert.equal(post.body.get('gainTemp'), '5');
    assert.equal(post.body.has('staminaDelta'), false);
    assert.deepEqual(state.staminaBroadcasts().map((entry) => entry.message.tempStamina), [5]);
  });
});

test('a hero token from the panel is sent as a map write', async () => {
  await withPanel({ answers: { 'sync-hero-tokens': { success: true, heroTokens: [false, false] } } }, async (state) => {
    await state.click('[data-character-hero-token="0"]');
    const [post] = state.posts();
    assert.equal(post.body.get('action'), 'sync-hero-tokens');
    assert.equal(post.body.get('source'), 'vtt');
  });
});

test('a hit on the token reaches the panel at once', async () => {
  await withPanel({}, async (state) => {
    state.sheet.hero.vitals.currentStamina = 12;
    const before = state.requests.length;
    state.otherStaminaChannel().postMessage({ type: 'stamina-sync', source: 'vtt', character: 'cal', currentStamina: 12, staminaMax: 40 });
    await settle();
    assert.equal(state.requests.length, before + 1);
    assert.match(document.querySelector('.vtt-character-healthbar__text').textContent, /12 \/ 40/);
  });
});

test('Victories has a minus that takes one off', async () => {
  const answers = { 'sync-victories': (body, state) => ({ success: true, victories: (state.sheet.hero.victories += Number(body.get('delta'))) }) };
  await withPanel({ answers }, async (state) => {
    await state.click('[data-character-victory-delta="-1"]');
    const [post] = state.posts();
    assert.equal(post.body.get('action'), 'sync-victories');
    assert.equal(post.body.get('delta'), '-1');
    assert.equal(document.querySelector('[data-character-counter="victories"]').textContent.trim(), '1');
  });
});

test('an ability with no automation posts its card to chat when clicked', async () => {
  await withPanel({}, async (state) => {
    await state.click('[data-character-ability-category="mains"]');
    await state.click('[data-character-ability-item]');
    assert.equal(state.chat.length, 1);
    assert.equal(state.chat[0].payload.name, 'Plain Strike');
  });
});

test('the Sheet button opens the full sheet: in the Table page by message, else in a new tab', () => {
  const saved = globalThis.window;
  const opened = [], messages = [];
  try {
    globalThis.window = { location: { origin: 'http://localhost' }, open: (...args) => opened.push(args) };
    globalThis.window.parent = globalThis.window;
    __testing.openFullCharacterSheet('Cal');
    assert.deepEqual(opened, [['/dnd/character_sheet/index.php?character=cal', '_blank']]);
    globalThis.window.parent = { Table: {}, postMessage: (...args) => messages.push(args) };
    __testing.openFullCharacterSheet('cal');
    assert.deepEqual(messages, [[{ type: 'table-open-sheet', character: 'cal' }, 'http://localhost']]);
    assert.equal(opened.length, 1);
  } finally {
    globalThis.window = saved;
  }
});

// Changed on purpose (October 2026): temporary Stamina is its own number. The board's temporary Stamina is still
// sent as a heal with allowTempHp, which the board reads as "gain temporary Stamina, keep the higher"; healing and
// damage follow character_sheet/parts/stamina-math.js.
test('the board\'s temporary Stamina keeps the higher, and a plain heal never touches temporary Stamina', async () => {
  const { readFileSync } = await import('node:fs');
  const board = readFileSync(new URL('../board-interactions.js', import.meta.url), 'utf8');
  assert.match(board, /applyTemporaryStamina: function \(payload\) \{ return dispatchBoardCustom\('vtt:automation-apply-heal', 'payload', \{ \.\.\.\(payload \|\| \{\}\), allowTempHp: true \}\); \}/);
  assert.doesNotMatch(board, /vtt:automation-apply-temporary-stamina/, 'nothing is sent that nobody listens for');
  assert.match(board, /if \(mode === 'heal' && allowTempHp\) \{\s*mode = 'temp';\s*\}/);
  assert.match(board, /const after = mode === 'damage'\s*\? damageStamina\(before, normalizedAmount\)\s*: mode === 'temp'\s*\? gainTempStamina\(before, normalizedAmount\)\s*: healStamina\(before, normalizedAmount\);/);
});
