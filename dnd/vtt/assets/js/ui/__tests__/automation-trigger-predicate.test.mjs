import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildAutomationTriggerPredicate } from '../automation-trigger-predicate.js';

const TEAMS = { sharon: 'heroes', frunk: 'heroes', goblin: 'monsters' };

function makeEnv(overrides = {}) {
  return {
    getTeamForPlacementId: (id) => TEAMS[id] || null,
    getJudgedTargetForSource: () => null,
    getPlacementMark: () => null,
    getPlacementFromStore: () => null,
    ...overrides,
  };
}

function makeEntry(filter = {}, extra = {}) {
  return {
    casterId: 'sharon',
    casterTeam: 'heroes',
    targetIds: [],
    freeTriggered: true,
    match: { event: 'turnEnd', filter },
    ...extra,
  };
}

test('turnEnd + whose:ally arms when another hero ends their turn', () => {
  const predicate = buildAutomationTriggerPredicate(makeEntry({ whose: 'ally' }), makeEnv());
  assert.equal(predicate({ placementId: 'frunk' }), true);
  assert.equal(predicate({ placementId: 'goblin' }), false);
});

test('whose:ally includes the caster unless excludeSelf is set', () => {
  const plain = buildAutomationTriggerPredicate(makeEntry({ whose: 'ally' }), makeEnv());
  assert.equal(plain({ placementId: 'sharon' }), true);

  const gated = buildAutomationTriggerPredicate(
    makeEntry({ whose: 'ally', excludeSelf: true }),
    makeEnv()
  );
  assert.equal(gated({ placementId: 'sharon' }), false);
  assert.equal(gated({ placementId: 'frunk' }), true);
});

test('casterHasNotActed suppresses arming once the caster has taken their turn', () => {
  let acted = false;
  const predicate = buildAutomationTriggerPredicate(
    makeEntry({ whose: 'ally', excludeSelf: true, casterHasNotActed: true }),
    makeEnv({ hasCasterActedThisRound: () => acted })
  );
  assert.equal(predicate({ placementId: 'frunk' }), true);
  acted = true;
  assert.equal(predicate({ placementId: 'frunk' }), false);
});

test('a consumed usageLimit suppresses arming', () => {
  let spent = false;
  const usageLimit = { scope: 'round', key: 'hesitation-is-weakness', target: 'self' };
  const predicate = buildAutomationTriggerPredicate(
    makeEntry({ whose: 'ally', excludeSelf: true }, { usageLimit }),
    makeEnv({
      isUsageLimitSpent: (casterId, limit) => {
        assert.equal(casterId, 'sharon');
        assert.equal(limit, usageLimit);
        return spent;
      },
    })
  );
  assert.equal(predicate({ placementId: 'frunk' }), true);
  spent = true;
  assert.equal(predicate({ placementId: 'frunk' }), false);
});

test('caster-state gates apply to non-timing events too', () => {
  const predicate = buildAutomationTriggerPredicate(
    {
      casterId: 'sharon',
      casterTeam: 'heroes',
      targetIds: [],
      freeTriggered: true,
      match: { event: 'damage', filter: { whose: 'ally', excludeSelf: true, minAmount: 1 } },
    },
    makeEnv()
  );
  assert.equal(predicate({ placementId: 'frunk', amount: 4 }), true);
  assert.equal(predicate({ placementId: 'sharon', amount: 4 }), false);
});

// One roll against several targets (powerRoll.targetTiers) carries each target's own result in targetResults[].
// A tier / minTotal / maxTotal filter judges the watcher's own row, or the row of the targets it names.
function rollEntry(filter, extra = {}) {
  return makeEntry(filter, { match: { event: 'powerRoll', filter }, ...extra });
}

// The goblin rolls 12 (tier 2) on the shared dice; Sharon's own row is 10 (tier 1), Frunk's is 17 (tier 3).
const SPLIT_ROLL = {
  actorId: 'goblin', tier: 'tier2', rollTotal: 12, targetIds: ['sharon', 'frunk'],
  targetResults: [
    { id: 'sharon', name: 'Sharon', total: 10, tier: 'tier1', edge: 0, bane: 1 },
    { id: 'frunk', name: 'Frunk', total: 17, tier: 'tier3', edge: 2, bane: 0 },
  ],
};

test('a tier filter judges the watcher\'s own row of a per-target roll', () => {
  const tier1 = buildAutomationTriggerPredicate(rollEntry({ whose: 'enemy', tier: 'tier1' }), makeEnv());
  const tier2 = buildAutomationTriggerPredicate(rollEntry({ whose: 'enemy', tier: 'tier2' }), makeEnv());
  assert.equal(tier1(SPLIT_ROLL), true);
  assert.equal(tier2(SPLIT_ROLL), false);
  // Frunk watching the same roll is judged on his own row.
  const frunk = (tier) => buildAutomationTriggerPredicate(rollEntry({ whose: 'enemy', tier }, { casterId: 'frunk' }), makeEnv());
  assert.equal(frunk('tier3')(SPLIT_ROLL), true);
  assert.equal(frunk('tier1')(SPLIT_ROLL), false);
});

test('minTotal and maxTotal judge the watcher\'s own row of a per-target roll', () => {
  const low = buildAutomationTriggerPredicate(rollEntry({ whose: 'enemy', maxTotal: 11 }), makeEnv());
  const high = buildAutomationTriggerPredicate(rollEntry({ whose: 'enemy', minTotal: 12 }), makeEnv());
  assert.equal(low(SPLIT_ROLL), true);
  assert.equal(high(SPLIT_ROLL), false);
  // All of the filter is judged on one row: tier 1 with a total of 12 or more is nobody's result here.
  const both = buildAutomationTriggerPredicate(rollEntry({ whose: 'enemy', tier: 'tier1', minTotal: 12 }), makeEnv());
  assert.equal(both(SPLIT_ROLL), false);
});

test('a watcher who is not a target judges the row of the target its filter names', () => {
  // Sharon rolls against the goblin and a second monster; Frunk watches for a tier 3 against an enemy.
  const teams = { sharon: 'heroes', frunk: 'heroes', goblin: 'monsters', ogre: 'monsters' };
  const env = makeEnv({ getTeamForPlacementId: (id) => teams[id] || null });
  const roll = {
    actorId: 'sharon', tier: 'tier2', rollTotal: 13, targetIds: ['goblin', 'ogre'],
    targetResults: [{ id: 'goblin', total: 13, tier: 'tier2' }, { id: 'ogre', total: 17, tier: 'tier3' }],
  };
  const watch = (filter, extra) => buildAutomationTriggerPredicate(rollEntry(filter, { casterId: 'frunk', ...extra }), env);
  assert.equal(watch({ whose: 'ally', targetWhose: 'enemy', tier: 'tier3' })(roll), true);
  assert.equal(watch({ whose: 'ally', targetWhose: 'enemy', tier: 'tier1' })(roll), false);
  // whose:"target" names the creatures the trigger was registered on: only the goblin's row counts.
  assert.equal(watch({ whose: 'ally', targetWhose: 'target', tier: 'tier3' }, { targetIds: ['goblin'] })(roll), false);
  assert.equal(watch({ whose: 'ally', targetWhose: 'target', tier: 'tier2' }, { targetIds: ['goblin'] })(roll), true);
});

test('a roll with no row for the watcher is judged on its shared tier and total, as before', () => {
  // The roller's own trigger ("when you roll tier 3"): the roller is not one of the rows.
  const own = (filter) => buildAutomationTriggerPredicate(rollEntry({ whose: 'self', ...filter }, { casterId: 'goblin', casterTeam: 'monsters' }), makeEnv());
  assert.equal(own({ tier: 'tier2' })(SPLIT_ROLL), true);
  assert.equal(own({ tier: 'tier3' })(SPLIT_ROLL), false);
  assert.equal(own({ minTotal: 12 })(SPLIT_ROLL), true);
  // A roll without per-target results, and one whose rows are empty or malformed.
  const plain = { actorId: 'goblin', tier: 'tier2', rollTotal: 12, targetIds: ['sharon'] };
  const tier2 = buildAutomationTriggerPredicate(rollEntry({ whose: 'enemy', tier: 'tier2' }), makeEnv());
  const tier1 = buildAutomationTriggerPredicate(rollEntry({ whose: 'enemy', tier: 'tier1' }), makeEnv());
  assert.equal(tier2(plain), true);
  assert.equal(tier1(plain), false);
  assert.equal(tier2({ ...plain, targetResults: [] }), true);
  assert.equal(tier2({ ...plain, targetResults: [null, { total: 3, tier: 'tier1' }] }), true);
  // A filter with no tier or total is untouched by the rows.
  const any = buildAutomationTriggerPredicate(rollEntry({ whose: 'enemy' }), makeEnv());
  assert.equal(any(SPLIT_ROLL), true);
});
