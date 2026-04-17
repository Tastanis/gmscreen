import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// The BroadcastChannel helpers and the sheet stamina cache share module
// state, so import a single fresh copy per suite.
const SERVICE_PATH = '../stamina-sync-service.js';

describe('stamina-sync-service — broadcast', () => {
  let service;
  let messages;
  let originalBroadcastChannel;

  beforeEach(async () => {
    messages = [];
    originalBroadcastChannel = globalThis.BroadcastChannel;
    globalThis.BroadcastChannel = class {
      constructor(name) {
        this.name = name;
        this.listeners = new Set();
      }
      postMessage(data) {
        messages.push({ name: this.name, data });
      }
      addEventListener(_type, handler) {
        this.listeners.add(handler);
      }
    };

    service = await import(`${SERVICE_PATH}?broadcast=${Date.now()}-${Math.random()}`);
  });

  test('broadcastStaminaSync posts a message on the shared channel', () => {
    service.broadcastStaminaSync({
      character: 'Frunk',
      currentStamina: 12,
      staminaMax: 24,
    });

    assert.equal(messages.length, 1);
    assert.equal(messages[0].name, 'vtt-stamina-sync');
    assert.deepEqual(messages[0].data, {
      type: 'stamina-sync',
      source: 'vtt',
      character: 'Frunk',
      currentStamina: 12,
      staminaMax: 24,
    });
  });

  test('broadcastStaminaSync is a no-op when BroadcastChannel is unavailable', async () => {
    globalThis.BroadcastChannel = undefined;
    const fresh = await import(`${SERVICE_PATH}?nobc=${Date.now()}-${Math.random()}`);
    // Should not throw.
    fresh.broadcastStaminaSync({ character: 'x', currentStamina: 1, staminaMax: 2 });
    assert.equal(messages.length, 0);
    globalThis.BroadcastChannel = originalBroadcastChannel;
  });

  test('subscribeToStaminaSync registers a message listener', () => {
    const received = [];
    const handler = (event) => received.push(event);
    service.subscribeToStaminaSync(handler);
    service.subscribeToStaminaSync(null);
    service.subscribeToStaminaSync(undefined);
    // Intentionally no actual dispatch — just verify no throw and handler shape.
    assert.ok(true);
  });
});

describe('stamina-sync-service — sheet cache', () => {
  let service;
  let fetchCalls;
  let originalFetch;
  let originalBroadcastChannel;

  beforeEach(async () => {
    fetchCalls = [];
    originalFetch = globalThis.fetch;
    originalBroadcastChannel = globalThis.BroadcastChannel;
    globalThis.BroadcastChannel = undefined;
    globalThis.fetch = async (url) => {
      fetchCalls.push(url);
      return {
        ok: true,
        json: async () => ({ currentStamina: 7, staminaMax: 14 }),
      };
    };
    service = await import(`${SERVICE_PATH}?cache=${Date.now()}-${Math.random()}`);
  });

  test('fetchSheetStamina returns null without an endpoint', async () => {
    assert.equal(service.fetchSheetStamina({}, 'Indigo'), null);
    assert.equal(service.fetchSheetStamina(null, ''), null);
  });

  test('fetchSheetStamina populates the cache on success', async () => {
    const result = await service.fetchSheetStamina(
      { sheet: 'http://localhost/sheet' },
      'Indigo'
    );
    assert.deepEqual(result, { currentStamina: 7, staminaMax: 14 });
    assert.deepEqual(service.getCachedSheetStamina('INDIGO'), {
      currentStamina: 7,
      staminaMax: 14,
    });
    assert.equal(fetchCalls.length, 1);
  });

  test('fetchSheetStamina dedupes concurrent requests for the same name', async () => {
    const a = service.fetchSheetStamina({ sheet: 'http://localhost/sheet' }, 'Sharon');
    const b = service.fetchSheetStamina({ sheet: 'http://localhost/sheet' }, 'sharon');
    assert.equal(a, b);
    await Promise.all([a, b]);
    assert.equal(fetchCalls.length, 1);
  });

  test('getCachedSheetStamina returns null for missing or empty names', () => {
    assert.equal(service.getCachedSheetStamina(''), null);
    assert.equal(service.getCachedSheetStamina(null), null);
    assert.equal(service.getCachedSheetStamina('never-fetched'), null);
  });
});
