import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isPersistentZoneControlTarget } from '../board-interactions.js';

const overlay = readFileSync(new URL('../../../../board3d/area-volume.mjs', import.meta.url), 'utf8');

test('only the projected zone control receives pointer input', () => {
  assert.match(overlay, /\.vtt3d-zone-tag\{[^}]*pointer-events:auto/);
  assert.match(overlay, /\.vtt3d-zone-tag:hover \.vtt3d-zone-tag__body/);
  assert.match(overlay, /\.vtt3d-zone-tag__body\{display:none/);
});

test('board capture handlers recognize persistent-zone controls before map interactions', () => {
  const closestCalls = [];
  const control = {
    closest(selector) {
      closestCalls.push(selector);
      return selector.includes('.vtt3d-zone-tag') ? this : null;
    },
  };

  assert.equal(isPersistentZoneControlTarget(control), true);
  assert.equal(closestCalls.length, 1);
  assert.equal(isPersistentZoneControlTarget({}), false);
  assert.equal(isPersistentZoneControlTarget(null), false);
});
