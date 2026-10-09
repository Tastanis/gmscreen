// Which square is under the pointer. Pure: no board, no page.
//
// The board is drawn with a slant: a thing `h` squares high is drawn `h * slant` up the screen. To
// turn a point on the screen back into a point on the flat map, the height of what was pointed at
// has to be known. The rule: it is whatever is drawn there for this viewer, the highest floor
// first, then a ramp, then the ground.
//
// It used to be worked out from one reference token (the selected one): only floors at or below
// that token's feet were tried. That went wrong twice over. Pressing on an unselected token read
// the start of the drag before the selection had caught up, so the start and the rest of the drag
// used different heights and the token landed off by the floor's height times the slant. And a
// pointer over any floor higher than the token was read as a point on the token's own floor.
import { rampPick, rampHeight, rampPlane } from './imported-ramps.mjs';
import { onSurface } from './stacked-surfaces.mjs';
import { seesRampTop } from './surface-facing.mjs';

/** The flat-map point that is drawn at `raw` when it lies `height` squares high. All in squares. */
export const pointAtHeight = (raw, height, slant) => ({ x: raw.x - height * slant.x, y: raw.y + height * slant.y });

/**
 * What the viewer is shown, for picking:
 *  - `{upTo}`: looking down from a chosen height (the GM's height view). Floors and ramps at or
 *    below it are drawn.
 *  - `{eye, viewer}`: looking through a token's eyes. `eye` is the height of its head and `viewer`
 *    its place {x, y}. Floors below its head are drawn; a floor at or above it is not. A ramp is
 *    drawn where the viewer is above its slope.
 * The floor drawing in roof-renderer.js uses the same two tests.
 */
const floorDrawn = (height, view) => (view.upTo !== undefined ? height <= view.upTo + 0.001 : view.eye > height + 1e-6);
function rampDrawn(ramp, point, height, view) {
  if (view.upTo !== undefined) return height <= view.upTo + 1e-9;
  const plane = rampPlane(ramp);
  return !!view.viewer && seesRampTop(view.viewer, view.eye, point, height, { x: plane.a, y: plane.b });
}

/**
 * The highest thing drawn under the pointer: {x, y, height} on the flat map, with `floor` or
 * `ramp` naming what was hit. Null when nothing but the ground is there.
 * `raw` is the pointer on the flat board, in squares, before any height is taken off.
 */
export function pickDrawn(raw, { slant, surfaces = [], ramps = [], view = null } = {}) {
  if (!view || (view.upTo === undefined && !(view.eye > -Infinity))) return null;
  let best = null;
  for (const floor of surfaces) {
    if (floor?.kind !== 'floor' || !(floor.points?.length > 2)) continue;
    const height = Number(floor.height) || 0;
    if (best && height <= best.height) continue;
    if (!floorDrawn(height, view)) continue;
    const point = pointAtHeight(raw, height, slant);
    if (onSurface(floor, point)) best = { ...point, height, floor };
  }
  for (const ramp of ramps) {
    const point = rampPick(ramp, raw, slant);
    if (!point) continue;
    const height = rampHeight(ramp, point.x, point.y);
    if (height === null || (best && height <= best.height) || !rampDrawn(ramp, point, height, view)) continue;
    best = { ...point, height, ramp };
  }
  return best;
}

/**
 * How the board is being viewed, for `pickDrawn`. `gmHeight` is the GM's chosen viewing height
 * when the GM is looking from a height and not through a token (null otherwise); `token` is the
 * token whose eyes are used, with `ground` the height it stands at.
 */
export function pickView({ gmHeight = null, token = null, ground = 0 } = {}) {
  if (gmHeight !== null && Number.isFinite(gmHeight)) return { upTo: gmHeight };
  if (!token) return null;
  const size = Math.max(token.width || 1, token.height || 1);
  return { eye: ground + size, viewer: { x: token.column + (token.width || 1) / 2, y: token.row + (token.height || 1) / 2 } };
}
