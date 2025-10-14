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
