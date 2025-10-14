import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { mountBoardInteractions } from '../board-interactions.js';

function createDom() {
  const dom = new JSDOM(
    `<!DOCTYPE html>
      <body>
        <div id="vtt-board-canvas">
          <div class="vtt-board__empty"></div>
          <div id="vtt-map-surface">
            <div id="vtt-map-transform">
              <img id="vtt-map-image" />
            </div>
            <div id="vtt-grid-overlay"></div>
            <div id="vtt-token-layer"></div>
            <div id="vtt-template-layer"></div>
          </div>
        </div>
        <div id="vtt-map-backdrop"></div>
        <div id="active-scene-status"></div>
        <div id="active-scene-name"></div>
        <div id="vtt-main"></div>
        <div data-combat-tracker>
          <div data-combat-tracker-waiting></div>
          <div data-combat-tracker-completed></div>
        </div>
        <button data-action="upload-map"></button>
        <input id="vtt-map-upload-input" />
        <button data-action="open-templates"></button>
        <button data-action="group-combatants"></button>
        <button data-action="start-combat">Start Combat</button>
        <div data-round-tracker><span data-round-value></span></div>
        <div data-turn-timer>
          <div data-turn-timer-image></div>
          <div data-turn-timer-display></div>
        </div>
        <div data-condition-banner-region></div>
      </body>`
  , { url: 'http://localhost' });

  const { window } = dom;
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.navigator = window.navigator;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.Element = window.Element;
  globalThis.Node = window.Node;
  globalThis.CustomEvent = window.CustomEvent;
  globalThis.Event = window.Event;
  globalThis.getComputedStyle = window.getComputedStyle.bind(window);
  window.matchMedia ??= () => ({ matches: false, addListener() {}, removeListener() {} });
  globalThis.requestAnimationFrame = window.requestAnimationFrame?.bind(window) ?? ((cb) => setTimeout(cb, 16));
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame?.bind(window) ?? ((id) => clearTimeout(id));
  globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
  return dom;
}

function createMockStore(initialState) {
  let state = initialState;
  let subscriber = null;

  const clone = (value) => {
    if (typeof structuredClone === 'function') {
      return structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value));
  };

  return {
    getState: () => state,
    subscribe: (callback) => {
      subscriber = typeof callback === 'function' ? callback : null;
      return () => {
        if (subscriber === callback) {
          subscriber = null;
        }
      };
    },
    setState: (nextState) => {
      state = nextState;
      subscriber?.(state);
    },
    updateState: (updater) => {
      if (typeof updater !== 'function') {
        return;
      }
      const draft = clone(state);
      updater(draft);
      state = draft;
      subscriber?.(state);
    },
  };
}

test('numeric activeSceneId toggles combat button to End Combat', () => {
  const dom = createDom();
  try {
    const startCombatButton = dom.window.document.querySelector('[data-action="start-combat"]');
    assert.ok(startCombatButton, 'start combat button should exist');

    const combatState = {
      active: true,
      round: 1,
      updatedAt: 1,
      activeCombatantId: '',
      completedCombatantIds: [],
    };

    const boardState = {
      activeSceneId: 42,
      sceneState: {
        '42': { combat: combatState },
      },
    };

    const state = {
      user: { isGM: true, name: 'GM' },
      boardState,
      scenes: { items: [{ id: '42', name: 'Test Scene' }] },
    };

    const store = {
      getState: () => state,
      subscribe: () => {},
    };

    mountBoardInteractions(store);

    assert.equal(startCombatButton.textContent, 'End Combat');
  } finally {
    dom.window.close();
  }
});

test('Sharon confirmation is required for other allies but triggers Hesitation banner on her own token', () => {
  const dom = createDom();
  try {
    const { window } = dom;
    const { document } = window;

    const messages = [];
    window.dashboardChat = {
      sendMessage: ({ message }) => {
        messages.push(message);
        return { catch() {} };
      },
    };

    const confirmMessages = [];
    window.confirm = (message) => {
      confirmMessages.push(message);
      return false;
    };

    const state = {
      user: { isGM: false, name: 'Sharon' },
      boardState: {
        activeSceneId: 'scene-1',
        mapUrl: 'http://example.com/map.png',
        placements: {
          'scene-1': [
            {
              id: 'ally-1',
              column: 0,
              row: 0,
              width: 1,
              height: 1,
              name: 'Frunk',
              combatTeam: 'ally',
              profileId: 'frunk',
            },
            {
              id: 'sharon-token',
              column: 1,
              row: 0,
              width: 1,
              height: 1,
              name: 'Sharon',
              combatTeam: 'ally',
              profileId: 'sharon',
            },
          ],
        },
        sceneState: {
          'scene-1': {
            grid: { size: 64 },
            combat: {
              active: true,
              round: 2,
              activeCombatantId: 'enemy-1',
              completedCombatantIds: [],
              startingTeam: 'ally',
              currentTeam: 'enemy',
              lastTeam: 'ally',
              roundTurnCount: 3,
              updatedAt: 1,
            },
          },
        },
      },
      grid: { size: 64, visible: true },
      scenes: { items: [{ id: 'scene-1', name: 'Scene One' }] },
    };

    const store = createMockStore(state);

    mountBoardInteractions(store, { state: '/state' });

    const mapImage = document.getElementById('vtt-map-image');
    Object.defineProperty(mapImage, 'naturalWidth', { value: 1024, configurable: true });
    Object.defineProperty(mapImage, 'naturalHeight', { value: 768, configurable: true });
    mapImage.onload?.();

    const allyToken = document.querySelector('[data-combatant-id="ally-1"]');
    assert.ok(allyToken, 'ally combatant should render');

    allyToken.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true }));

    assert.equal(confirmMessages.length, 1);
    assert.equal(
      confirmMessages[0],
      "It is not the PC's turn. Would you like to go anyways?",
      'standard confirmation dialog should be shown for non-Sharon allies'
    );
    assert.equal(document.querySelector('.vtt-hesitation-banner'), null);
    assert.deepEqual(messages, []);

    window.confirm = () => {
      throw new Error('Sharon should not be prompted when selecting her own token');
    };

    const sharonToken = document.querySelector('[data-combatant-id="sharon-token"]');
    assert.ok(sharonToken, 'Sharon combatant should render');

    sharonToken.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true }));

    const banner = document.querySelector('.vtt-hesitation-banner');
    assert.ok(banner, 'Hesitation banner should appear for Sharon overriding her own turn');
    assert.equal(banner.textContent, 'HESITATION IS WEAKNESS!');
    assert.deepEqual(messages, ['HESITATION IS WEAKNESS!']);
  } finally {
    dom.window.close();
  }
});

test('Sharon hesitation broadcast from shared combat state shows banner for observers', () => {
  const dom = createDom();
  try {
    const { window } = dom;
    const { document } = window;

    const state = {
      user: { isGM: false, name: 'Indigo' },
      boardState: {
        activeSceneId: 'scene-2',
        mapUrl: 'http://example.com/map.png',
        placements: {
          'scene-2': [
            {
              id: 'sharon-token',
              column: 3,
              row: 4,
              width: 1,
              height: 1,
              name: 'Sharon',
              combatTeam: 'ally',
              profileId: 'sharon',
            },
          ],
        },
        sceneState: {
          'scene-2': {
            combat: {
              active: true,
              round: 3,
              activeCombatantId: 'enemy-7',
              completedCombatantIds: [],
              startingTeam: 'ally',
              currentTeam: 'enemy',
              lastTeam: 'ally',
              roundTurnCount: 2,
              updatedAt: 1_700_000_005_000,
              lastEffect: {
                type: 'sharon-hesitation',
                combatantId: 'sharon-token',
                triggeredAt: 1_700_000_000_000,
                initiatorId: 'sharon',
              },
            },
          },
        },
      },
      scenes: { items: [{ id: 'scene-2', name: 'Scene Two' }] },
      grid: { size: 64, visible: true },
    };

    const store = createMockStore(state);

    mountBoardInteractions(store, { state: '/state' });

    const mapImage = document.getElementById('vtt-map-image');
    Object.defineProperty(mapImage, 'naturalWidth', { value: 1024, configurable: true });
    Object.defineProperty(mapImage, 'naturalHeight', { value: 768, configurable: true });
    mapImage.onload?.();

    const banner = document.querySelector('.vtt-hesitation-banner');
    assert.ok(
      banner,
      'Hesitation banner should appear for observers when combat state broadcasts Sharon’s effect'
    );
    assert.equal(banner.textContent, 'HESITATION IS WEAKNESS!');
  } finally {
    dom.window.close();
  }
});
