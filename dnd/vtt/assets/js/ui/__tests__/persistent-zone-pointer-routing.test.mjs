import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isPersistentZoneControlTarget } from '../board-interactions.js';

const boardCss = readFileSync(new URL('../../../css/board.css', import.meta.url), 'utf8');

test('persistent zones pass board clicks through except on their badge and popup', () => {
  assert.match(
    boardCss,
    /\.vtt-persistent-zone\s*\{[^}]*pointer-events:\s*none;/s
  );
  assert.match(
    boardCss,
    /\.vtt-persistent-zone__badge\s*\{[^}]*pointer-events:\s*auto;/s
  );
  assert.match(
    boardCss,
    /\.vtt-persistent-zone__badge:hover\s*\+\s*\.vtt-persistent-zone__body/
  );
  assert.doesNotMatch(boardCss, /\.vtt-persistent-zone:hover\s+\.vtt-persistent-zone__body/);
});

test('board capture handlers recognize persistent-zone controls before map interactions', () => {
  const closestCalls = [];
  const control = {
    closest(selector) {
      closestCalls.push(selector);
      return selector.includes('.vtt-persistent-zone__body') ? this : null;
    },
  };

  assert.equal(isPersistentZoneControlTarget(control), true);
  assert.equal(closestCalls.length, 1);
  assert.equal(isPersistentZoneControlTarget({}), false);
  assert.equal(isPersistentZoneControlTarget(null), false);
});
