import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  formatHeroicResourcePrompt,
  normalizeHeroicResourceAutomation,
  resolveHeroicResourceAmount,
  ruleMatchesHeroicResourceEvent,
} from '../heroic-resource-automation.js';

function env(overrides = {}) {
  return {
    casterId: 'hero-1',
    casterTeam: 'ally',
    getTeamForPlacementId(id) {
      return id?.startsWith('enemy') ? 'enemy' : 'ally';
    },
    getJudgedTargetForSource(id) {
      return id === 'hero-1' ? { id: 'enemy-judged' } : null;
    },
    getPlacementMark() {
      return null;
    },
    getPlacementFromStore(id) {
      return id ? { id } : null;
    },
    getSquareDistance(a, b) {
      if (!a || !b) return null;
      if (b === 'far-target') return 12;
      return 5;
    },
    ...overrides,
  };
}

describe('heroic resource automation schema', () => {
  test('normalizes rules with limits and amount specs', () => {
    const normalized = normalizeHeroicResourceAutomation({
      schema: 'heroic-resource/v1',
      rules: [
        {
          id: 'turn-start',
          event: 'turnStart',
          filter: { whose: 'self' },
          limit: { scope: 'round', key: 'once' },
          effect: { kind: 'gain', amount: { dice: '1d3', bonusByLevel: [{ min: 7, bonus: 1 }] } },
        },
      ],
    });

    assert.deepEqual(normalized.warnings, []);
    assert.equal(normalized.rules.length, 1);
    assert.equal(normalized.rules[0].event, 'turnStart');
    assert.equal(normalized.rules[0].limit.scope, 'round');
    assert.equal(normalized.rules[0].effect.amount.dice, '1d3');
  });

  test('normalizes combat-start, turn-start, combat-end, and once-per-round rules', () => {
    const normalized = normalizeHeroicResourceAutomation({
      rules: [
        { id: 'start', event: 'combatStart', effect: { kind: 'set', amount: { from: 'victories' } } },
        { id: 'turn', event: 'turnStart', filter: { whose: 'self' }, effect: { kind: 'gain', amount: 2 } },
        {
          id: 'round',
          event: 'forcedMovement',
          limit: { scope: 'round', key: 'first-force-move' },
          effect: { kind: 'gain', amount: 1 },
        },
        { id: 'end', event: 'combatEnd', effect: { kind: 'set', amount: 0 }, autoApply: true },
      ],
    });

    assert.deepEqual(normalized.rules.map((rule) => rule.event), [
      'combatStart',
      'turnStart',
      'forcedMovement',
      'combatEnd',
    ]);
    assert.equal(normalized.rules[2].limit.scope, 'round');
    assert.equal(normalized.rules[3].autoApply, true);
  });

  test('reports unsupported event inventory items instead of keeping impossible rules', () => {
    const normalized = normalizeHeroicResourceAutomation({
      rules: [
        { id: 'bad', event: 'surgeSpent', effect: { kind: 'gain', amount: 1 } },
      ],
    });

    assert.equal(normalized.rules.length, 0);
    assert.ok(normalized.warnings.some((warning) => warning.includes('unsupported event')));
  });

  test('resolves victories, dice, and level bonuses', () => {
    assert.equal(
      resolveHeroicResourceAmount({ from: 'victories' }, { victories: 4 }).amount,
      4
    );
    assert.equal(
      resolveHeroicResourceAmount(
        { dice: '1d3', bonusByLevel: [{ min: 7, bonus: 1 }] },
        { level: 7 },
        () => 0
      ).amount,
      2
    );
    assert.equal(
      resolveHeroicResourceAmount(
        {
          amountByLevel: [
            { min: 1, amount: 1 },
            { min: 4, amount: 2 },
            { min: 10, amount: 3 },
          ],
        },
        { level: 10 }
      ).amount,
      3
    );
    assert.equal(
      resolveHeroicResourceAmount({ from: 'negativeResource' }, { currentResource: -3 }).amount,
      3
    );
  });
});

describe('heroic resource automation matching', () => {
  test('matches judged-target damage dealt by the caster', () => {
    const [rule] = normalizeHeroicResourceAutomation({
      rules: [
        {
          id: 'wrath-judged-damage',
          event: 'damageDealt',
          filter: { whose: 'self', targetWhose: 'judgedTarget' },
          effect: { kind: 'gain', amount: 1 },
        },
      ],
    }).rules;

    assert.equal(ruleMatchesHeroicResourceEvent(rule, 'damageDealt', {
      sourceId: 'hero-1',
      targetId: 'enemy-judged',
      amount: 5,
    }, env()), true);
  });

  test('matches damage from a judged source to the caster', () => {
    const [rule] = normalizeHeroicResourceAutomation({
      rules: [
        {
          id: 'wrath-judged-damages-you',
          event: 'damage',
          filter: { whose: 'self', sourceWhose: 'judgedTarget' },
          effect: { kind: 'gain', amount: 1 },
        },
      ],
    }).rules;

    assert.equal(ruleMatchesHeroicResourceEvent(rule, 'damage', {
      placementId: 'hero-1',
      sourceId: 'enemy-judged',
      amount: 4,
    }, env()), true);
  });

  test('matches nearby qualifying damage while excluding holy and untyped', () => {
    const [rule] = normalizeHeroicResourceAutomation({
      rules: [
        {
          id: 'essence-nearby-damage',
          event: 'damage',
          filter: { withinSquares: 10, damageTypeNot: ['holy', 'untyped'] },
          effect: { kind: 'gain', amount: 1 },
        },
      ],
    }).rules;

    assert.equal(ruleMatchesHeroicResourceEvent(rule, 'damage', {
      placementId: 'ally-2',
      damageType: 'fire',
      amount: 3,
    }, env()), true);
    assert.equal(ruleMatchesHeroicResourceEvent(rule, 'damage', {
      placementId: 'ally-2',
      damageType: 'holy',
      amount: 3,
    }, env()), false);
    assert.equal(ruleMatchesHeroicResourceEvent(rule, 'damage', {
      placementId: 'far-target',
      damageType: 'fire',
      amount: 3,
    }, env()), false);
  });

  test('matches future surge-including damage payloads', () => {
    const [rule] = normalizeHeroicResourceAutomation({
      rules: [
        {
          id: 'surge-damage',
          event: 'damageDealt',
          filter: { whose: 'self', includesSurge: true },
          effect: { kind: 'gain', amount: 1 },
        },
      ],
    }).rules;

    assert.equal(ruleMatchesHeroicResourceEvent(rule, 'damageDealt', {
      sourceId: 'hero-1',
      targetId: 'enemy-1',
      includesSurge: true,
    }, env()), true);
    assert.equal(ruleMatchesHeroicResourceEvent(rule, 'damageDealt', {
      sourceId: 'hero-1',
      targetId: 'enemy-1',
    }, env()), false);
  });

  test('formats prompt templates', () => {
    assert.equal(
      formatHeroicResourcePrompt('Gain {amount} {resource}: {reason}.', {
        amount: 2,
        resource: 'Wrath',
        reason: 'start of your turn',
      }),
      'Gain 2 Wrath: start of your turn.'
    );
  });
});
