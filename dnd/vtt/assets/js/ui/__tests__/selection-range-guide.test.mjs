import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveSelectionRangeGuide } from '../selection-range-guide.js';

test('token distance becomes an advisory selection guide', () => {
  const sourcePlacement = { id: 'hero-1', row: 3, column: 4 };
  assert.deepEqual(resolveSelectionRangeGuide({
    mode: 'token',
    distance: { form: 'ranged', value: 5 },
    sourcePlacement,
  }), {
    range: 5,
    form: 'ranged',
    enforce: false,
    sourcePlacement,
  });
});

test('legacy range and area within use the same non-enforcing guide', () => {
  assert.equal(resolveSelectionRangeGuide({ mode: 'token', range: '7' }).range, 7);
  assert.deepEqual(resolveSelectionRangeGuide({
    mode: 'area',
    shape: 'cube',
    distance: { form: 'cube', value: 3, within: 10 },
  }), {
    range: 10,
    form: 'cube',
    enforce: false,
    sourcePlacement: null,
  });
});

test('explicit selection guide is reusable and never enforces target legality', () => {
  const guide = resolveSelectionRangeGuide({
    range: 3,
    selectionGuide: { range: 12, form: 'ranged', enforce: true },
  });
  assert.equal(guide.range, 12);
  assert.equal(guide.enforce, false);
});

