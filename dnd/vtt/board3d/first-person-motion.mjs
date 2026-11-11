// First-person walk and fly: the math only (no three.js, no page), so it can be tested on its own.
// Brandon, November 10, 2026: "I want a first-person view to use movement where you can fly around with the camera
// basically. WASD will move you around the camera. It will move you forward, back, side, side. And then the mouse will
// aim you in different directions so that you can walk. We'll have it keep you stuck to the ground unless your
// character has the flying turned on, in which case you can just fly around freely with the camera."
// A camera view only: it never moves a token or changes the game.
// World axes are the 3D board's: x = columns, z = rows, y = height, all in squares. A look is {yaw, pitch} in radians;
// yaw 0 looks down the rows (+z), and turning right lowers the yaw (the board's own drag-to-look rule).

// Every number the view uses, with its default (Brandon's rule: limits and settings are JSON fields, never hard-coded).
export const FIRST_PERSON_DEFAULTS = Object.freeze({
  walkSpeed: 4,            // squares a second on foot
  flySpeed: 6,             // squares a second in the air
  fastFactor: 2.5,         // speed times this while Shift is held
  eyeHeightFactor: 0.92,   // eye height as a share of the model's height (creature size scales it)
  defaultEyeHeight: 1,     // squares above the ground with no token to see from
  minEyeHeight: 0.4,       // squares: the lowest eye, however small the model
  ahead: 0.5,              // the view starts this many model-widths in front of the model's middle (its body is behind)
  lookSensitivity: 0.0025, // radians per pixel of mouse movement once the mouse is caught (click the board)
  dragSensitivity: 0.0045, // radians per pixel of a drag, when the mouse is not caught
  keyTurnSpeed: 1.8,       // radians a second for the arrow keys
  pitchLimit: 1.35,        // radians up or down from level
  stepUp: 0.6,             // squares: the highest ledge walked straight up onto (stairs and slopes climb any height)
  followRate: 14,          // how quickly the eye settles onto new ground (per second)
  flyClearance: 0.15,      // squares kept above the ground while flying
  fov: [32, 95],           // narrowest and widest view (the wheel), degrees
});

const LIMITS = { pitchLimit: [0.1, 1.55], eyeHeightFactor: [0.05, 2], fastFactor: [1, 20] };

// Defaults with any valid overrides on top; a missing, wrong or out-of-range value keeps its default.
export function normalizeSettings(input = {}) {
  const out = { ...FIRST_PERSON_DEFAULTS };
  const given = input && typeof input === 'object' ? input : {};
  for (const [key, fallback] of Object.entries(FIRST_PERSON_DEFAULTS)) {
    if (!(key in given)) continue;
    if (Array.isArray(fallback)) {
      const pair = given[key];
      if (Array.isArray(pair) && pair.length === 2 && pair.every((n) => Number.isFinite(Number(n))) && Number(pair[0]) > 0 && Number(pair[0]) < Number(pair[1]) && Number(pair[1]) < 180) out[key] = [Number(pair[0]), Number(pair[1])];
      continue;
    }
    const value = Number(given[key]);
    if (given[key] === null || given[key] === '' || !Number.isFinite(value) || value < 0) continue;
    const [lo, hi] = LIMITS[key] || [0, Infinity];
    out[key] = Math.max(lo, Math.min(hi, value));
  }
  return Object.freeze(out);
}

// Which way a look faces (a unit vector), and the level "right" of a yaw.
export function lookVector(yaw, pitch) {
  return { x: Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: Math.cos(yaw) * Math.cos(pitch) };
}
export function rightVector(yaw) { return { x: -Math.cos(yaw), y: 0, z: Math.sin(yaw) }; }

// A look turned by a pointer (or key) movement: right turns right, down looks down. Pitch stays inside the limit.
export function turnLook(look, dx, dy, sensitivity, pitchLimit = FIRST_PERSON_DEFAULTS.pitchLimit) {
  const yaw = look.yaw - (Number(dx) || 0) * sensitivity;
  const pitch = Math.max(-pitchLimit, Math.min(pitchLimit, look.pitch - (Number(dy) || 0) * sensitivity));
  return { yaw, pitch };
}

// The keys the view listens to (KeyboardEvent.code, so it is the same keys on any keyboard layout).
export const MOVE_KEYS = Object.freeze({
  KeyW: 'forward', KeyS: 'back', KeyA: 'left', KeyD: 'right',
  Space: 'up', KeyQ: 'up', KeyC: 'down', KeyE: 'down',
  ArrowLeft: 'turnLeft', ArrowRight: 'turnRight', ArrowUp: 'lookUp', ArrowDown: 'lookDown',
  ShiftLeft: 'fast', ShiftRight: 'fast',
});

// What the held keys ask for. Opposite keys cancel.
export function moveIntent(held) {
  const has = (name) => { for (const code of held || []) if (MOVE_KEYS[code] === name) return 1; return 0; };
  return {
    forward: has('forward') - has('back'),
    strafe: has('right') - has('left'),
    rise: has('up') - has('down'),
    turn: has('turnRight') - has('turnLeft'),
    tilt: has('lookUp') - has('lookDown'),
    fast: !!has('fast'),
  };
}

// One frame of movement. On foot: forward is level (looking down does not walk you into the ground) and the height is
// left to the ground. Flying: forward follows the look, and up/down keys lift or drop straight. Diagonals are not faster.
// `dt` is capped so a stalled frame (a hidden tab) does not throw the view across the map.
export function stepCamera(pos, look, intent, dt, settings = FIRST_PERSON_DEFAULTS, { flying = false } = {}) {
  const step = Math.max(0, Math.min(Number(dt) || 0, 0.1));
  const forward = flying ? lookVector(look.yaw, look.pitch) : { x: Math.sin(look.yaw), y: 0, z: Math.cos(look.yaw) };
  const right = rightVector(look.yaw);
  const rise = flying ? intent.rise || 0 : 0;
  let x = forward.x * (intent.forward || 0) + right.x * (intent.strafe || 0);
  let y = forward.y * (intent.forward || 0) + rise;
  let z = forward.z * (intent.forward || 0) + right.z * (intent.strafe || 0);
  const length = Math.hypot(x, y, z);
  if (length > 1) { x /= length; y /= length; z /= length; }
  const speed = (flying ? settings.flySpeed : settings.walkSpeed) * (intent.fast ? settings.fastFactor : 1) * step;
  return { x: pos.x + x * speed, y: pos.y + y * speed, z: pos.z + z * speed };
}

// The height a walker stands at: the ground, or the highest floor plate or stair under it that is no higher than
// `probe` (its feet plus a step). A balcony overhead is walked under; a floor reached by its stairs is walked onto.
export function standHeight(probe, terrain, plates = [], stairs = []) {
  let best = Number.isFinite(terrain) ? terrain : 0;
  for (const h of [...plates, ...stairs]) if (Number.isFinite(h) && h <= probe + 1e-6 && h > best) best = h;
  return best;
}

// The feet settle onto new ground smoothly (a step or a drop is not a jolt) and never overshoot it.
export function followGround(current, target, dt, rate = FIRST_PERSON_DEFAULTS.followRate) {
  if (!Number.isFinite(current)) return target;
  if (!Number.isFinite(target)) return current;
  const share = 1 - Math.exp(-Math.max(0, rate) * Math.max(0, Math.min(Number(dt) || 0, 0.1)));
  const next = current + (target - current) * share;
  return Math.abs(target - next) < 0.002 ? target : next;
}

// A flying eye stays a little above the ground; it is never stopped otherwise.
export function flyFloor(y, ground, clearance = FIRST_PERSON_DEFAULTS.flyClearance) {
  return Number.isFinite(ground) ? Math.max(y, ground + clearance) : y;
}

// The eye height for a model this tall (squares), never below the minimum.
export function eyeHeightFor(tall, settings = FIRST_PERSON_DEFAULTS) {
  const height = Number(tall);
  return Math.max(settings.minEyeHeight, (Number.isFinite(height) && height > 0 ? height : 1.1) * settings.eyeHeightFactor);
}

// Starting tilt: down toward the ground about `distance` squares ahead, so a model up high looks out over the board,
// not at the sky (the 1st person view's October 21 rule).
export function startPitch(eyeY, groundAheadY, distance = 12) {
  const drop = Number.isFinite(groundAheadY) ? eyeY - groundAheadY : 0;
  return -Math.max(0.05, Math.min(0.75, Math.atan2(drop, distance)));
}
