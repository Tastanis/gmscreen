import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  isTokenFallInFlight,
  playTokenFallAnimation,
  TOKEN_FALL_DURATION_MS,
} from '../token-fall-animation.js';

// Levels v2 §5.6: the animation module is a thin runtime wrapper around
// the CSS keyframes. These tests cover the class toggle + Promise resolve
// behavior. The actual visual frames live in board.css.

function createFakeTokenElement() {
  const classes = new Set();
  return {
    classList: {
      add(name) {
        classes.add(name);
      },
      remove(name) {
        classes.delete(name);
      },
      has(name) {
        return classes.has(name);
      },
    },
    _classes: classes,
  };
}

describe('Levels v2 token fall animation', () => {
  test('TOKEN_FALL_DURATION_MS is a positive number', () => {
    assert.equal(typeof TOKEN_FALL_DURATION_MS, 'number');
    assert.equal(TOKEN_FALL_DURATION_MS > 0, true);
  });

  test('playTokenFallAnimation adds the falling class then removes it on resolve', async () => {
    const el = createFakeTokenElement();
    const promise = playTokenFallAnimation(el, { duration: 30 });
    assert.equal(el._classes.has('vtt-token--falling'), true);
    assert.equal(isTokenFallInFlight(el), true);
    await promise;
    assert.equal(el._classes.has('vtt-token--falling'), false);
    assert.equal(isTokenFallInFlight(el), false);
  });

  test('playTokenFallAnimation: a second call cancels the prior in-flight animation', async () => {
    const el = createFakeTokenElement();
    const first = playTokenFallAnimation(el, { duration: 200 });
    // Restart immediately — the prior promise should resolve early so
    // callers do not hang on a stale fall.
    const second = playTokenFallAnimation(el, { duration: 30 });
    await first;
    // Class should still be set because the second animation is in
    // flight; the first resolved early via cancel().
    assert.equal(el._classes.has('vtt-token--falling'), true);
    await second;
    assert.equal(el._classes.has('vtt-token--falling'), false);
  });

  test('playTokenFallAnimation: invalid element resolves immediately without throwing', async () => {
    const result = await playTokenFallAnimation(null);
    assert.equal(result, undefined);
  });

  test('isTokenFallInFlight: returns false for null/empty inputs', () => {
    assert.equal(isTokenFallInFlight(null), false);
    assert.equal(isTokenFallInFlight(undefined), false);
    assert.equal(isTokenFallInFlight({}), false);
  });
});
