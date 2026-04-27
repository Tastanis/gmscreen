// Levels v2 §5.6: lightweight CSS-class-based fall animation for tokens
// that drop through a cutout to a lower level. The animation is a one-shot
// per fall chain — chained drops snap through to the resting level and
// only the initial drop plays the wobble. The keyframes themselves live
// in `board.css` (`@keyframes vtt-token-fall`); this module is the thin
// runtime wrapper that toggles the trigger class and resolves a Promise
// when the animation ends so callers can sequence reveal-of-final-state.

const FALL_CLASS = 'vtt-token--falling';
// Keep in sync with `--vtt-token-fall-duration` in board.css. The plan
// targets ~1 second of animation.
export const TOKEN_FALL_DURATION_MS = 1000;

// Track active fall timers per token element so a rapid second fall
// (e.g. GM repositioning a token mid-animation) cleans up the prior
// state without leaving the class stuck on the element.
const activeFalls = new WeakMap();

export function playTokenFallAnimation(tokenElement, options = {}) {
  if (!tokenElement || typeof tokenElement.classList?.add !== 'function') {
    return Promise.resolve();
  }

  const duration = Number.isFinite(options?.duration) && options.duration > 0
    ? options.duration
    : TOKEN_FALL_DURATION_MS;

  const previous = activeFalls.get(tokenElement);
  if (previous) {
    if (typeof previous.cancel === 'function') {
      previous.cancel();
    }
  }

  return new Promise((resolve) => {
    let resolved = false;
    let timerId = null;

    const finalize = () => {
      if (resolved) {
        return;
      }
      resolved = true;
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
      try {
        tokenElement.classList.remove(FALL_CLASS);
      } catch (error) {
        // Ignore if the element was unmounted before cleanup.
      }
      const recorded = activeFalls.get(tokenElement);
      if (recorded && recorded.cancel === cancel) {
        activeFalls.delete(tokenElement);
      }
      resolve();
    };

    const cancel = () => finalize();

    activeFalls.set(tokenElement, { cancel });

    try {
      tokenElement.classList.add(FALL_CLASS);
    } catch (error) {
      // If we cannot add the class, resolve immediately so callers do not
      // hang waiting on an animation that will never play.
      finalize();
      return;
    }

    timerId = setTimeout(finalize, duration);
  });
}

// Test/utility: returns true if a fall animation is currently in flight
// on the supplied element.
export function isTokenFallInFlight(tokenElement) {
  return Boolean(tokenElement && activeFalls.has(tokenElement));
}
