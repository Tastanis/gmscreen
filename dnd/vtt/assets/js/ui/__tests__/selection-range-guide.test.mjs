import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveSelectionRangeGuide, selectionRangeReachesFloor } from '../selection-range-guide.js';

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


test('floor reach uses the maximum axis: full horizontal range remains at reachable heights', () => {
  const guide = resolveSelectionRangeGuide({ range: 3 });
  const floors = { levels: [{ id: 'near', elevationSquares: 3 }, { id: 'far', elevationSquares: 5 }] };
  const base = { id: 'caster', levelId: 'level-0' };
  assert.equal(selectionRangeReachesFloor(guide, base, 'near', floors), true);
  assert.equal(selectionRangeReachesFloor(guide, base, 'far', floors), false);
  assert.equal(selectionRangeReachesFloor(guide, { levelId: 'far' }, 'near', floors), true);
  assert.equal(selectionRangeReachesFloor(guide, { levelId: 'far' }, 'level-0', floors), false);
  assert.equal(guide.range, 3);
  assert.equal(guide.enforce, false);
});

test('range guides reject unknown floors and missing sources without treating them as ground', () => {
  const guide = { range: 10 };
  assert.equal(selectionRangeReachesFloor(guide, { levelId: 'missing' }, 'level-0', {}), false);
  assert.equal(selectionRangeReachesFloor(guide, {}, 'missing', {}), false);
  assert.equal(selectionRangeReachesFloor(guide, null, 'level-0', {}), false);
  assert.equal(selectionRangeReachesFloor(guide, {}, null, {}), false);
  assert.equal(selectionRangeReachesFloor(guide, {}, 'level-0', {}), true);
});
