import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  TURN_EFFECT_MAX_AGE_MS,
  TURN_EFFECT_TYPES,
  getTurnEffectSignature,
  partitionEndOfTurnConditions,
  prepareSyncedTurnEffect,
  recordLocalTurnEffect,
  shouldTriggerSharonHesitation,
} from '../combat-effects.js';

describe('combat turn effect signatures', () => {
  test('normalizes type and timestamp for signatures', () => {
    assert.equal(
      getTurnEffectSignature({
        type: ' Draw-Steel ',
        combatantId: ' token-1 ',
        triggeredAt: 1234.9,
      }),
      'draw-steel:token-1:1234'
    );
  });

  test('local turn effect recording normalizes effects and rejects invalid payloads', () => {
    const recorded = recordLocalTurnEffect({
      type: TURN_EFFECT_TYPES.DRAW_STEEL,
      triggeredAt: 2000,
    });

    assert.equal(recorded.recorded, true);
    assert.equal(recorded.effect.type, TURN_EFFECT_TYPES.DRAW_STEEL);
    assert.equal(recorded.signature, 'draw-steel::2000');
    assert.equal(recordLocalTurnEffect({ triggeredAt: 2000 }).recorded, false);
  });
});

describe('synced combat turn effects', () => {
  test('fresh non-duplicate effects are stored, marked processed, and displayed', () => {
    const result = prepareSyncedTurnEffect(
      {
        type: TURN_EFFECT_TYPES.SHARON_HESITATION,
        combatantId: 'sharon-token',
        triggeredAt: 5000,
      },
      {
        now: () => 5000 + TURN_EFFECT_MAX_AGE_MS,
      }
    );

    assert.equal(result.valid, true);
    assert.equal(result.shouldStore, true);
    assert.equal(result.shouldMarkProcessed, true);
    assert.equal(result.shouldDisplay, true);
    assert.equal(result.displayType, TURN_EFFECT_TYPES.SHARON_HESITATION);
  });

  test('stale effects are remembered but not replayed', () => {
    const result = prepareSyncedTurnEffect(
      {
        type: TURN_EFFECT_TYPES.DRAW_STEEL,
        triggeredAt: 1000,
      },
      {
        now: () => 1000 + TURN_EFFECT_MAX_AGE_MS + 1,
      }
    );

    assert.equal(result.valid, true);
    assert.equal(result.shouldStore, true);
    assert.equal(result.shouldMarkProcessed, true);
    assert.equal(result.shouldDisplay, false);
  });

  test('duplicate effects update stored effect only when the local signature differs', () => {
    const effect = {
      type: TURN_EFFECT_TYPES.DRAW_STEEL,
      triggeredAt: 3000,
    };
    const signature = getTurnEffectSignature(effect);

    assert.equal(
      prepareSyncedTurnEffect(effect, {
        lastProcessedTurnEffectSignature: signature,
        lastTurnEffectSignature: signature,
      }).shouldStore,
      false
    );

    const staleLocal = prepareSyncedTurnEffect(effect, {
      lastProcessedTurnEffectSignature: signature,
      lastTurnEffectSignature: 'other::1',
    });

    assert.equal(staleLocal.duplicate, true);
    assert.equal(staleLocal.shouldStore, true);
    assert.equal(staleLocal.shouldDisplay, false);
  });
});

describe('special combat turn effects', () => {
  test('triggers Sharon hesitation only on enemy turns after an ally acted', () => {
    assert.equal(
      shouldTriggerSharonHesitation({
        combatantProfileId: 'sharon',
        initiatorProfileId: 'sharon',
        expectedTeam: 'enemy',
        previousTeam: 'ally',
      }),
      true
    );

    assert.equal(
      shouldTriggerSharonHesitation({
        combatantProfileId: 'sharon',
        initiatorProfileId: 'indigo',
        expectedTeam: 'enemy',
        previousTeam: 'ally',
      }),
      false
    );

    assert.equal(
      shouldTriggerSharonHesitation({
        combatantProfileId: 'sharon',
        expectedTeam: 'enemy',
        previousTeam: 'ally',
        isFirstTurnOfRound: true,
      }),
      false
    );
  });
});

describe('combat condition cleanup', () => {
  test('partitions end-of-turn conditions linked to the finished combatant', () => {
    const linked = {
      name: 'Guarded',
      duration: { type: 'end-of-turn', targetTokenId: 'token-1' },
    };
    const otherTarget = {
      name: 'Marked',
      duration: { type: 'end-of-turn', targetTokenId: 'token-2' },
    };
    const saveEnds = {
      name: 'Dazed',
      duration: { type: 'save-ends', targetTokenId: 'token-1' },
    };

    const result = partitionEndOfTurnConditions([linked, otherTarget, saveEnds], 'token-1');

    assert.equal(result.changed, true);
    assert.deepEqual(result.removed, [linked]);
    assert.deepEqual(result.remaining, [otherTarget, saveEnds]);
  });

  test('supports board duration aliases and preserves conditions when target is missing', () => {
    const eotAlias = {
      name: 'Bolstered',
      duration: { type: 'eot', targetTokenId: 'token-1' },
    };
    const endMode = {
      name: 'Inspired',
      mode: 'end',
      duration: { targetTokenId: 'token-1' },
    };

    assert.deepEqual(
      partitionEndOfTurnConditions([eotAlias], 'token-1').removed,
      [eotAlias]
    );

    const missingTarget = partitionEndOfTurnConditions([endMode], '');
    assert.equal(missingTarget.changed, false);
    assert.deepEqual(missingTarget.remaining, [endMode]);
  });
});
