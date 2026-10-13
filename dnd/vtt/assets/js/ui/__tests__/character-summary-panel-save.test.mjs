import test from 'node:test';
import assert from 'node:assert/strict';

import { __testing } from '../character-summary-panel.js';

test('power-roll surge refresh reads the configured character endpoint', async () => {
 const oldWindow=globalThis.window,oldFetch=globalThis.fetch;let runner=null,requested=null;
 globalThis.window={location:{href:'http://localhost/dnd/vtt/'},AbilityAutomationRunner:{open:config=>{runner=config;}}};
 globalThis.fetch=async(url)=>{requested=url;return{ok:true,json:async()=>({success:true,data:{hero:{surges:4}}})};};
 try{
  const sheet={hero:{surges:1}};
  __testing.startAbilityAutomation(sheet,{name:'Test',automation:{cards:[]}},'mains',null,{characterId:'cal',routes:{sheet:'/custom/sheet.php'}});
  assert.deepEqual(await runner.getSurges(),{current:4});
  assert.equal(new URL(requested).pathname,'/custom/sheet.php');
  assert.equal(new URL(requested).searchParams.get('character'),'cal');
  assert.equal(sheet.hero.surges,4);
 }finally{globalThis.window=oldWindow;globalThis.fetch=oldFetch;}
});

function withFakeSaveEnvironment(fn, fetchImpl = null) {
  const originalFetch = globalThis.fetch;
  const originalBroadcastChannel = globalThis.BroadcastChannel;
  const broadcasts = [];
  const requests = [];

  globalThis.fetch = fetchImpl || (async (endpoint, options = {}) => {
    requests.push({ endpoint, options });
    return {
      ok: true,
      async json() {
        return { success: true };
      },
    };
  });

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

test('saveCharacterHeroicResource uses the narrow authenticated VTT resource route', async () => {
  await withFakeSaveEnvironment(async ({ broadcasts, requests }) => {
    const saved = await __testing.saveCharacterHeroicResource(
      { hero: { resource: { title: 'Insight', value: 4 } } },
      { characterId: 'sharon' }
    );

    assert.equal(saved, true);
    assert.equal(requests.length, 1);
    const body = requests[0].options.body;
    assert.equal(body.get('action'), 'sync-resource');
    assert.equal(body.get('character'), 'sharon');
    assert.equal(body.get('source'), 'vtt');
    assert.equal(body.get('value'), '4');
    assert.equal(body.has('data'), false);
    assert.deepEqual(broadcasts, [{
      channel: 'vtt-character-sheet-sync',
      message: {
        type: 'character-sheet-sync',
        source: 'vtt',
        character: 'sharon',
        change: 'resource',
      },
    }]);
  });
});

// Changed on purpose in Build 493. The panel used to send "the number is now N" from its own copy of the sheet,
// and a copy that was behind wrote the sheet back (Brandon, October 12, 2026: "Some weird things seem to not be
// syncing or staying correctly sometimes"). It now says how much it changed the number by, and the server adds
// that to the number it holds (api/v2/tests/sheet-counters.test.php). The whole-sheet save is gone from the panel.
test('the panel sends amounts, never the numbers it holds', async () => {
  const cases = [
    ['stamina', -7, 'sync-vitals', { staminaDelta: '-7' }],
    ['recovery', 0, 'sync-vitals', { useRecovery: '1' }],
    ['surges', 1, 'sync-surges', { delta: '1' }],
    ['resource', -2, 'sync-resource', { delta: '-2' }],
    ['victories', 1, 'sync-victories', { delta: '1' }],
  ];
  const sheet = { hero: { vitals: { currentStamina: 17, currentRecoveries: 3 }, surges: 2, resource: { value: 4 }, victories: 5 } };

  for (const [change, amount, action, expectedFields] of cases) {
    await withFakeSaveEnvironment(async ({ requests }) => {
      const saved = await __testing.saveCharacterSummaryResources(sheet, { characterId: 'sharon', change, amount, broadcast: false });
      assert.equal(saved, true);
      assert.equal(requests.length, 1);
      const body = requests[0].options.body;
      assert.equal(body.get('action'), action);
      assert.equal(body.get('character'), 'sharon');
      assert.equal(body.get('source'), 'vtt');
      Object.entries(expectedFields).forEach(([key, value]) => assert.equal(body.get(key), value));
      for (const held of ['data', 'value', 'currentStamina', 'currentRecoveries']) assert.equal(body.has(held), false, `${change} sends no ${held}`);
    });
  }
  // A change of nothing asks nothing; an unknown kind of change saves nothing (there is no whole-sheet save to fall to).
  await withFakeSaveEnvironment(async ({ requests }) => {
    assert.equal(await __testing.saveCharacterSummaryResources(sheet, { characterId: 'sharon', change: 'surges', amount: 0 }), true);
    assert.equal(await __testing.saveCharacterSummaryResources(sheet, { characterId: 'sharon', change: 'sheet', amount: 3 }), false);
    assert.equal(requests.length, 0);
    assert.equal(__testing.saveCharacterSummarySheet, undefined);
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
