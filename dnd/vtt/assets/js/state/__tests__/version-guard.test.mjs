import { test } from 'node:test';
import assert from 'node:assert/strict';

import { shouldApplyIncomingVersion } from '../version-guard.js';

test('applies a strictly newer version', () => {
  assert.equal(shouldApplyIncomingVersion(11, 10), true);
  assert.equal(shouldApplyIncomingVersion(1, 0), true);
});

test('skips an equal version to match the Pusher guard', () => {
  assert.equal(shouldApplyIncomingVersion(10, 10), false);
  assert.equal(shouldApplyIncomingVersion(0, 0), false);
});

test('skips an older version', () => {
  assert.equal(shouldApplyIncomingVersion(9, 10), false);
  assert.equal(shouldApplyIncomingVersion(1, 100), false);
});

test('accepts any incoming version when no last-applied is tracked', () => {
  assert.equal(shouldApplyIncomingVersion(5, undefined), true);
  assert.equal(shouldApplyIncomingVersion(5, null), true);
  assert.equal(shouldApplyIncomingVersion(0, undefined), true);
});

test('rejects missing or non-numeric incoming versions', () => {
  assert.equal(shouldApplyIncomingVersion(undefined, 5), false);
  assert.equal(shouldApplyIncomingVersion(null, 5), false);
  assert.equal(shouldApplyIncomingVersion('7', 5), false);
  assert.equal(shouldApplyIncomingVersion(NaN, 5), false);
  assert.equal(shouldApplyIncomingVersion(Infinity, 5), false);
});

test('rejects when both sides are missing or invalid', () => {
  assert.equal(shouldApplyIncomingVersion(undefined, undefined), false);
  assert.equal(shouldApplyIncomingVersion('a', 'b'), false);
});
