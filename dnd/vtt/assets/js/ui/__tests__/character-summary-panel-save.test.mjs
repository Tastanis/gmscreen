import test from 'node:test';
import assert from 'node:assert/strict';

import { __testing } from '../character-summary-panel.js';

function withFakeSaveEnvironment(fn) {
  const originalFetch = globalThis.fetch;
  const originalBroadcastChannel = globalThis.BroadcastChannel;
  const broadcasts = [];
  const requests = [];

  globalThis.fetch = async (endpoint, options = {}) => {
    requests.push({ endpoint, options });
    return {
      ok: true,
      async json() {
        return { success: true };
      },
    };
  };

  globalThis.BroadcastChannel = class FakeBroadcastChannel {
    constructor(name) {
      this.name = name;
    }

    postMessage(message) {
      broadcasts.push({ channel: this.name, message });
    }

    close() {}
  };

  return Promise.resolve()
    .then(() => fn({ broadcasts, requests }))
    .finally(() => {
      globalThis.fetch = originalFetch;
      globalThis.BroadcastChannel = originalBroadcastChannel;
    });
}

test('saveCharacterSummarySheet broadcasts the requested change type', async () => {
  await withFakeSaveEnvironment(async ({ broadcasts, requests }) => {
    const saved = await __testing.saveCharacterSummarySheet(
      { hero: { name: 'Cal' } },
      { characterId: 'cal', change: 'resource' }
    );

    assert.equal(saved, true);
    assert.equal(requests.length, 1);
    assert.deepEqual(broadcasts, [
      {
        channel: 'vtt-character-sheet-sync',
        message: {
          type: 'character-sheet-sync',
          source: 'vtt',
          character: 'cal',
          change: 'resource',
        },
      },
    ]);
  });
});

test('saveCharacterSummarySheet can skip broadcasting for callers that broadcast centrally', async () => {
  await withFakeSaveEnvironment(async ({ broadcasts }) => {
    const saved = await __testing.saveCharacterSummarySheet(
      { hero: { name: 'Indigo' } },
      { characterId: 'indigo', broadcast: false }
    );

    assert.equal(saved, true);
    assert.deepEqual(broadcasts, []);
  });
});

test('resourceFloor clamps only allowNegative resources', () => {
  assert.equal(__testing.resourceFloor({ stats: { reason: 2 } }, { allowNegative: true }), -3);
  assert.equal(__testing.resourceFloor({ stats: { reason: 2 } }, { allowNegative: false }), 0);
  assert.equal(__testing.resourceFloor({ stats: { reason: 2 } }, null), 0);
});

test('heroic resource counter is separate from victories counter', () => {
  const victoriesHtml = __testing.renderResource('Victories', 2);
  const wrathHtml = __testing.renderResource('Wrath', 4, { resource: { title: 'Wrath' } });

  assert.match(victoriesHtml, /data-character-counter="victories"/);
  assert.doesNotMatch(victoriesHtml, /data-character-counter="resource"/);
  assert.match(wrathHtml, /data-character-counter="resource"/);
});

test('spendHeroicResource reports insufficient when an allowNegative resource is at its floor', async () => {
  const result = await __testing.spendHeroicResource(
    {
      hero: {
        stats: { reason: 2 },
        resource: { title: 'Clarity', value: -3, allowNegative: true },
      },
    },
    { amount: 1, resource: 'Clarity' }
  );

  assert.deepEqual(result, {
    skipped: true,
    reason: 'insufficient',
    resource: 'Clarity',
    current: -3,
    required: 1,
  });
});
