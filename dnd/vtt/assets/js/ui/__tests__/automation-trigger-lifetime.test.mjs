import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createTriggerLifetimeState,
  shouldExpireTriggerEntry,
} from '../automation-trigger-lifetime.js';

describe('automation trigger lifetime', () => {
  test('expires after own turn end boundary', () => {
    const entry = {
      tokenId: 'cal',
      expires: { event: 'turnEnd', whose: 'self', count: 1 },
    };

    assert.equal(
      shouldExpireTriggerEntry(entry, { eventType: 'turnEnd', placementId: 'enemy' }),
      false
    );
    assert.equal(
      shouldExpireTriggerEntry(entry, { eventType: 'turnEnd', placementId: 'cal' }),
      true
    );
  });

  test('expires after target turn start boundary', () => {
    const entry = {
      tokenId: 'cal',
      targetIds: ['bugbear'],
      expires: { event: 'turnStart', whose: 'target', count: 1 },
    };

    assert.equal(
      shouldExpireTriggerEntry(entry, { eventType: 'turnStart', placementId: 'goblin' }),
      false
    );
    assert.equal(
      shouldExpireTriggerEntry(entry, { eventType: 'turnStart', placementId: 'bugbear' }),
      true
    );
  });

  test('counts round boundaries before expiring', () => {
    const entry = {
      tokenId: 'cal',
      expires: { event: 'roundStart', whose: 'any', count: 2 },
    };

    assert.equal(
      shouldExpireTriggerEntry(entry, { eventType: 'roundStart', round: 2 }),
      false
    );
    assert.equal(
      shouldExpireTriggerEntry(entry, { eventType: 'roundStart', round: 3 }),
      true
    );
  });

  test('skipCurrent ignores the matching active combatant boundary once', () => {
    const entry = {
      tokenId: 'cal',
      lifetimeState: createTriggerLifetimeState(
        { event: 'turnEnd', whose: 'self', count: 1, skipCurrent: true },
        { activeCombatantId: 'cal' }
      ),
    };

    assert.equal(
      shouldExpireTriggerEntry(entry, { eventType: 'turnEnd', placementId: 'cal' }),
      false
    );
    assert.equal(
      shouldExpireTriggerEntry(entry, { eventType: 'turnEnd', placementId: 'cal' }),
      true
    );
  });

  test('expires at combat end regardless of placement', () => {
    const entry = {
      tokenId: 'cal',
      expires: { event: 'combatEnd', count: 1 },
    };

    assert.equal(
      shouldExpireTriggerEntry(entry, { eventType: 'combatEnd' }),
      true
    );
  });
});
