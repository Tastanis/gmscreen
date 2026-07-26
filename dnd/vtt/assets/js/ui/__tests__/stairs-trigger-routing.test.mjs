import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveStairLevelFollower } from '../stairs-trigger.js';

test('stair transitions follow the token claimant instead of the mover', () => {
  const follower = resolveStairLevelFollower(
    { claimedTokens: { hero: ' Player One ' } },
    'hero',
    'gm'
  );

  assert.deepEqual(follower, {
    userId: 'player one',
    source: 'claim',
    tokenId: 'hero',
  });
});

test('unclaimed stair transitions follow the mover', () => {
  const follower = resolveStairLevelFollower({}, 'npc', ' GM ');

  assert.deepEqual(follower, {
    userId: 'gm',
    source: 'manual',
    tokenId: null,
  });
});
