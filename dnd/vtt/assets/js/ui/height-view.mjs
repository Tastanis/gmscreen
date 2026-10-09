// How height is shown on the flat board, and what a floating floor plate looks like. Pure: no
// board, no page, so the drawing code and the tests share one rule.
//
// The board is seen from above with a slant. A thing `h` squares high is drawn `h * slant`
// squares up the screen and a third of that to the right. The usual slant, 0.36, was tuned for
// heights of 2 to 6 (a building's floors, a cliff). A scene of very tall things (islands 18 high)
// can carry a flatter slant in its map design, `view.slant`, anywhere from the usual value down
// to 0, which is a plain view from straight overhead. Only how the scene is drawn changes: sight,
// movement and falls use the real heights whatever the slant.

/** Squares up the screen for each square of height, unless the scene says otherwise. */
export const DEFAULT_SLANT = 0.36;
/** The shift to the right, as a share of the shift up the screen. */
const RIGHT_SHARE = 1 / 3;
const USUAL = Object.freeze({ x: 0.12, y: 0.36 });

/** True when `value` is a slant a scene may carry: a number from 0 to the usual slant. */
export const validSlant = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= DEFAULT_SLANT;

/** The slant a map design asks for; the usual one when it asks for none, or for nonsense. */
export function viewSlant(design) {
  const value = design?.view?.slant;
  return validSlant(value) ? value : DEFAULT_SLANT;
}

/** How far one square of height moves a thing on screen, in squares: {x: right, y: up}. */
export function slantVector(slant = DEFAULT_SLANT) {
  // The usual slant keeps the exact numbers the board has always used.
  return slant === DEFAULT_SLANT ? USUAL : { x: slant * RIGHT_SHARE, y: slant };
}

/** Where a point at grid position (x, y) and height `h` is drawn, in squares. */
export function slanted(x, y, h, slant = USUAL) { return { x: x + h * slant.x, y: y - h * slant.y }; }

// ---- Floating plates -----------------------------------------------------
// A floor plate's edges are drawn with a dark side face from the plate down to whatever lies
// under the edge: the next plate, or the ground. That is right for a building. A plate marked
// `floating` (a rock in the air, a platform on chains) gets only a short side, so it reads as a
// slab and the ground behind it is not walled off.

/**
 * How deep the side of a floating plate is drawn, in squares. On screen it is this times the
 * slant: two squares still shows as a rim of rock at a slant a third of the usual one, where one
 * square all but disappears.
 */
export const FLOATING_SIDE = 2;

/** True for a floor plate the map design marks as floating. */
export const isFloating = (surface) => surface?.kind === 'floor' && surface.floating === true;

/**
 * The height at which a plate's side face ends. `below` is what lies under that edge (the next
 * plate down, or the ground). An ordinary plate's side runs all the way down to it; a floating
 * plate's side stops a short way under the plate, or at `below` if that comes first.
 */
export function sideFoot(surface, below) {
  const top = Number(surface?.height) || 0, floor = Math.min(top, below);
  return isFloating(surface) ? Math.max(floor, top - FLOATING_SIDE) : floor;
}

/**
 * The shadow a floating plate casts straight down: its own outline and holes, each as a ring of
 * {x, y, z} with z the height of the ground under that point. Edges are cut into short pieces so
 * the shadow follows uneven ground. Where the ground is as high as the plate there is nothing to
 * shade, and z is the plate's own height. Empty for a plate that is not floating.
 */
export function shadowRings(surface, groundAt, perSquare = 4) {
  if (!isFloating(surface) || !(surface.points?.length > 2)) return [];
  const top = Number(surface.height) || 0;
  return [surface.points, ...(surface.holes || [])].filter((ring) => ring?.length > 2).map((ring) => {
    const out = [];
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      const steps = Math.max(1, Math.min(4096, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * perSquare)));
      for (let k = 0; k < steps; k++) {
        const x = a.x + ((b.x - a.x) * k) / steps, y = a.y + ((b.y - a.y) * k) / steps;
        out.push({ x, y, z: Math.min(top, Number(groundAt(x, y)) || 0) });
      }
    }
    return out;
  });
}

/** True when any of the plate's shadow lies below it: there is open air under some of its outline. */
export const castsShadow = (rings, surface) => rings.some((ring) => ring.some((point) => point.z < (Number(surface.height) || 0) - 0.05));
