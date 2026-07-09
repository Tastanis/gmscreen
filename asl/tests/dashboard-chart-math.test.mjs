import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const math = require('../js/dashboard-chart-math.js');

const blocks = [
  { sourceIndex: 0, instructional_days: 10, instructional_days_elapsed: 10, is_complete: true },
  { sourceIndex: 1, instructional_days: 10, instructional_days_elapsed: 4, is_current: true },
  { sourceIndex: 2, instructional_days: 5, instructional_days_elapsed: 0 },
];

test('pace uses actual uploaded instructional-day counts', () => {
  assert.equal(math.totalInstructionalDays(blocks), 25);
  assert.equal(math.paceDayFraction(blocks, blocks[0], 'full'), 0.4);
  assert.equal(math.paceDayFraction(blocks, blocks[1], 'full'), 0.8);
  assert.equal(math.paceDayFraction(blocks, blocks[2], 'full'), 1);
  assert.equal(math.paceDayFraction(blocks, blocks[1], 'ytd'), 14 / 25);
});

test('pace endpoints match requested distributions', () => {
  assert.equal(math.paceEndpoint(60, 3), 180);
  assert.equal(math.paceEndpoint(60, 2.75), 165);
  assert.equal(math.paceEndpoint(60, 3.25), 195);
});
