// The right button while a token is held (Brandon, October 10, 2026): "a quick right click gives you a
// node at wherever it is, then a right click and drag does the normal pull the map to move it around.
// Make sure these two dont interfere with each other." Shift is the shift move and nothing else.
//
// A right press starts as neither. It becomes a pull of the map the moment the pointer has moved
// further than the slack, and from then on it can never drop a node. Let go within the slack and
// within the time, it is a click and drops a node. Held still for longer and let go, it is nothing.

/** How far the pointer may move, in screen pixels, for a right press to still be a click. */
export const NODE_CLICK_PIXELS = 6;
/** How long a right press may last, in milliseconds, to still be a click. */
export const NODE_CLICK_MS = 400;

/** A right press that has just gone down at this place and time. */
export const rightPressAt = (x, y, time) => ({ x, y, time });

/** True once the pointer has moved far enough from where the press went down: it is a pull of the map. */
export function rightPressPulls(press, x, y) {
  return Boolean(press) && Math.hypot(x - press.x, y - press.y) > NODE_CLICK_PIXELS;
}

/** True when a press let go here and now was a quick click: it drops a node. */
export function rightPressClicked(press, x, y, time) {
  return Boolean(press) && !rightPressPulls(press, x, y) && time - press.time <= NODE_CLICK_MS;
}
