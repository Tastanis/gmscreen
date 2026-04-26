import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizePlacementEntry } from '../normalize/placements.js';

test('normalizePlacementEntry preserves stackOrder when present', () => {
  const placement = normalizePlacementEntry({
    id: 'token-1',
    name: 'Large Token',
    stackOrder: '7',
  });

  assert.equal(placement.stackOrder, 7);
});

test('normalizePlacementEntry omits stackOrder when absent', () => {
  const placement = normalizePlacementEntry({
    id: 'token-1',
    name: 'Large Token',
  });

  assert.equal(Object.hasOwn(placement, 'stackOrder'), false);
});

test('normalizePlacementEntry preserves trimmed levelId when present', () => {
  const placement = normalizePlacementEntry({
    id: 'token-1',
    name: 'Ground Token',
    levelId: ' ground ',
  });

  assert.equal(placement.levelId, 'ground');
});

test('normalizePlacementEntry accepts legacy map level aliases', () => {
  const placement = normalizePlacementEntry({
    id: 'token-1',
    name: 'Upper Token',
    levelId: '',
    mapLevelId: 'upper',
  });

  assert.equal(placement.levelId, 'upper');
});

test('normalizePlacementEntry omits levelId when absent', () => {
  const placement = normalizePlacementEntry({
    id: 'token-1',
    name: 'Base Token',
  });

  assert.equal(Object.hasOwn(placement, 'levelId'), false);
});
