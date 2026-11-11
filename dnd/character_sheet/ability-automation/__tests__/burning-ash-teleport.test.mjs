import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createAbilityAutomationHarness } from './support/automation-harness.mjs';

// Brandon, November 10, 2026: "Check Sharon's teleporting causing fire damage. I think that one of her regular
// teleports away did not cause fire damage. When she teleported away from a creature." Burning Ash (book, 2nd-level
// Black Ash feature): "The first time on a turn that you use a shadow ability to teleport away from or into a space
// adjacent to an enemy, that enemy takes fire damage equal to your Agility score." The old card made her click the
// enemy herself; now the enemies next to the square she left and the square she landed in are pre-picked.

const reference = readFileSync(new URL('../../../ai-reference/characters/sharon-automations.md', import.meta.url), 'utf8');
const blackAshTeleport = JSON.parse(reference.split('## Black Ash Teleport (Maneuver)')[1].split('```json')[1].split('```')[0]);
const inAllThisConfusion = JSON.parse(readFileSync(new URL('../../../ai-reference/characters/uploads/sharon-in-all-this-confusion.json', import.meta.url), 'utf8'));

// Sharon (Agility 3) at 5,5. A goblin is next to her; she teleports 5 squares east, landing next to an orc.
// A kobold is far away; Cal (her ally) is next to where she started.
function board() {
  const tokens = {
    sharon: { id: 'sharon', name: 'Sharon', team: 'ally', column: 5, row: 5 },
    cal: { id: 'cal', name: 'Cal', team: 'ally', column: 5, row: 6 },
    gob: { id: 'gob', name: 'Goblin', team: 'enemy', column: 4, row: 5 },
    orc: { id: 'orc', name: 'Orc', team: 'enemy', column: 11, row: 5 },
    kob: { id: 'kob', name: 'Kobold', team: 'enemy', column: 20, row: 20 },
  };
  const gap = (a, b) => Math.max(Math.abs(a.column - b.column), Math.abs(a.row - b.row));
  return {
    tokens,
    overrides: (landAt) => ({
      getPlacementById: (id) => (tokens[id] ? { ...tokens[id] } : null),
      getActiveScenePlacements: () => Object.values(tokens).map((token) => ({ ...token })),
      getDistanceBetween: (a, b) => (tokens[a] && tokens[b] ? gap(tokens[a], tokens[b]) : null),
      applyTeleport: (payload) => {
        if (!landAt) return { skipped: true, reason: 'user-skip' };
        Object.assign(tokens[payload.placementId], landAt);
        return { name: tokens[payload.placementId].name, movedDistance: 5 };
      },
    }),
  };
}

async function run(ability, { landAt = { column: 10, row: 5 }, ...options } = {}) {
  const { overrides } = board();
  const harness = await createAbilityAutomationHarness({ attributes: { Agility: 3 } });
  try {
    const result = await harness.runAutomation({
      automation: ability.automation,
      action: { id: ability.fields.name, name: ability.fields.name, target: 'Self' },
      heroName: 'Sharon',
      hero: { name: 'Sharon', resource: { title: 'Insight', value: 0 } },
      sourcePlacement: { id: 'sharon', name: 'Sharon' },
      spendHeroicResourceResults: [{ spent: 0 }, { spent: 0 }],
      promptAnswers: [false],
      contextOverrides: overrides(landAt),
      ...options,
    });
    return { ...result, chat: result.calls.postChat.map((call) => call.message).join(' | ') };
  } finally { harness.close(); }
}
const burns = (result) => result.calls.applyDamage.filter((call) => call.damageType === 'fire').map((call) => [call.placementId, call.amount]);

test('Black Ash Teleport: the enemy she teleports away from and the one she lands next to both burn', async () => {
  const result = await run(blackAshTeleport, { targetSelections: [{ done: true }] });
  const pick = result.calls.selectTarget.at(-1);
  assert.deepEqual(pick.preselectedIds, ['gob', 'orc'], 'the goblin she left and the orc she landed by; not Cal, not the far kobold');
  assert.deepEqual(burns(result), [['gob', 3], ['orc', 3]], 'fire damage equal to her Agility');
  assert.deepEqual(result.calls.setScopedFlag.map((call) => [call.scope, call.key, call.sourceId, call.targetId]), [['turn', 'burning-ash', 'sharon', 'sharon']]);
});

test('Black Ash Teleport: teleporting away from an enemy into open ground still burns that enemy', async () => {
  const result = await run(blackAshTeleport, { landAt: { column: 8, row: 1 }, targetSelections: [{ done: true }] });
  assert.deepEqual(burns(result), [['gob', 3]]);
});

test('In All This Confusion: the attacker she teleports away from burns', async () => {
  const result = await run(inAllThisConfusion, {
    landAt: { column: 8, row: 1 },
    targetSelections: [{ done: true }],
    triggerPayload: { placementId: 'sharon', targetId: 'sharon', sourceId: 'gob', amount: 6 },
  });
  assert.deepEqual(result.calls.selectTarget.at(-1).preselectedIds, ['gob']);
  assert.deepEqual(burns(result), [['gob', 3]]);
});

test('Burning Ash: a token taken out of the pick does not burn', async () => {
  const result = await run(blackAshTeleport, { targetSelections: [{ id: 'orc', name: 'Orc' }, { done: true }] });
  assert.deepEqual(burns(result), [['gob', 3]]);
});

test('Burning Ash: only the first time on a turn', async () => {
  const result = await run(blackAshTeleport, { checkScopedFlagResults: [{ set: true }] });
  assert.equal(result.calls.selectTarget.length, 0, 'no pick');
  assert.deepEqual(burns(result), []);
  assert.match(result.chat, /Burning Ash was already used this turn\./);
});

test('Burning Ash: a skipped teleport burns nobody, and the turn is not used up', async () => {
  const result = await run(blackAshTeleport, { landAt: null });
  assert.equal(result.calls.selectTarget.length, 0);
  assert.deepEqual(burns(result), []);
  assert.match(result.chat, /no teleport was made/);
  assert.equal(result.calls.setScopedFlag.length, 0);
});

test('Burning Ash: nobody next to either square, no pick and the turn is not used up', async () => {
  const { overrides } = board();
  const lonely = overrides({ column: 15, row: 15 });
  const scene = lonely.getActiveScenePlacements().filter((token) => token.id !== 'gob');
  const result = await run(blackAshTeleport, { landAt: { column: 15, row: 15 }, contextOverrides: { ...lonely, getActiveScenePlacements: () => scene } });
  assert.deepEqual(burns(result), []);
  assert.match(result.chat, /nobody fits next to where Sharon teleported from or to/);
  assert.equal(result.calls.setScopedFlag.length, 0);
});

test('oncePer per target: one already hit this turn is left out', async () => {
  const automation = structuredClone(blackAshTeleport);
  automation.automation.cards.find((card) => card.name === 'burningAsh').oncePer.per = 'target';
  const result = await run(automation, {
    targetSelections: [{ done: true }],
    contextOverrides: { ...board().overrides({ column: 10, row: 5 }), checkScopedFlag: (payload) => ({ set: payload.targetId === 'gob' }) },
  });
  assert.deepEqual(result.calls.selectTarget.at(-1).preselectedIds, ['orc']);
  assert.deepEqual(burns(result), [['orc', 3]]);
});

test('the schema keeps near.teleport and oncePer with their defaults', async () => {
  const harness = await createAbilityAutomationHarness();
  try {
    for (const ability of [blackAshTeleport, inAllThisConfusion]) {
      const { normalized, issues } = harness.validateAutomation(ability.automation, { strict: false });
      assert.ok(!issues.length, issues.join(' | '));
      const card = normalized.cards.find((entry) => entry.name === 'burningAsh');
      assert.deepEqual(card.near, { teleport: true, within: 1 });
      assert.deepEqual(card.oncePer, { scope: 'turn', key: 'burning-ash', per: 'user' });
    }
    const bare = harness.validateAutomation({ schema: 'ability-automation/v3', cards: [{ type: 'target', name: 'ash', mode: 'token', near: { teleport: true }, oncePer: {} }] }, { strict: false });
    assert.deepEqual(bare.normalized.cards[0].oncePer, { scope: 'turn', key: 'ash', per: 'user' });
    assert.deepEqual(bare.normalized.cards[0].near, { teleport: true, within: 1 });
  } finally { harness.close(); }
});
