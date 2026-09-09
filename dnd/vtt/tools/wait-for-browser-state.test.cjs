'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { waitForBrowserState } = require('./wait-for-browser-state.cjs');

test('an async false result keeps polling until the saved state is true', async () => {
  let reads = 0;
  const page = { evaluate: async (predicate, arg) => predicate(arg) };
  await waitForBrowserState(page, async expected => {
    await new Promise(resolve => setTimeout(resolve, 1));
    return ++reads === expected;
  }, 3, { timeout: 1000, interval: 1 });
  assert.equal(reads, 3);
});

test('false and stalled reads both fail within the deadline', async () => {
  await assert.rejects(waitForBrowserState({ evaluate: async () => false }, () => {}, null,
    { timeout: 20, interval: 1 }), /timeout/);
  await assert.rejects(waitForBrowserState({ evaluate: () => new Promise(() => {}) }, () => {}, null,
    { timeout: 20 }), /timed out/);
});

test('a failed read is surfaced instead of hidden by retries', async () => {
  let reads = 0;
  await assert.rejects(waitForBrowserState({ evaluate: async () => {
    reads++;
    throw new Error('Snapshot unavailable');
  } }, () => {}), /Snapshot unavailable/);
  assert.equal(reads, 1);
});
