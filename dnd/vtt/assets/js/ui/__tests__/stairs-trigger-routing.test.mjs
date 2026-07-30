import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveStairLevelFollower } from '../stairs-trigger.js';

test('stair transitions follow the user who moved the token', () => {
  const follower = resolveStairLevelFollower(
    {},
    'hero',
    'gm'
  );

  assert.deepEqual(follower, {
    userId: 'gm',
    source: 'manual',
    tokenId: null,
  });
});
