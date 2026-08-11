import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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
