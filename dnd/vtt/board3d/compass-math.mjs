// The compass's arithmetic, apart from three.js so it can be tested (layers/compass.mjs draws it).

/**
 * The needle's turn in degrees, clockwise from straight up the screen. `forward` is where the camera looks and `up`
 * the top of its picture, both in the board's axes (x east, y up, z south). Looking straight down there is no
 * forward along the ground, so the top of the picture is used.
 */
export function compassDegrees(forward, up) {
  let x = forward.x, z = forward.z;
  if (Math.hypot(x, z) < 0.05) { x = up.x; z = up.z; }
  if (Math.hypot(x, z) < 1e-6) return 0;
  const degrees = Math.atan2(-x, -z) * 180 / Math.PI;
  return ((degrees % 360) + 360) % 360;
}
