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
