// Using a stair you are standing at. Brandon, October 10, 2026, of the bathhouse stair: "if I'm really close to
// it, like one square up. It should just push me down ... assuming I'm trying to get onto it. Needs to be a smart
// assume though so it doesn't snap me to it when I'm not trying to go up the stairs."
//
// A drag is one straight line from where the hero stands to where he is let go, and a stair is only taken by a
// line that runs along it from its end. From a square beside a stair's end the line to its other end crosses the
// stair at a slant and misses it: going up he ends under the floor above, going down he is carried across the
// stairwell and stays upstairs. So when a hero who stands at a stair's end is held over that stair or over where
// it leads, the app puts the corners in for him: to the square in front of the near end, along the stair, and on.
// It assumes nothing from further away, nothing for a square the stair does not lead to, and nothing once he has
// dropped a corner of his own. Pure: the squares only. Whether the straight line would have done as well, and
// whether a wall is in the way, are asked by the caller (terrain-prototype.js stairRoute).

/** How close to the square in front of a stair's near end the hero must stand, in squares. */
export const STAIR_NEAR = 1;
/** How close to the square in front of its far end he must be held, in squares, when he is held beyond the stair. */
export const STAIR_AIM = 1;

const apart = (a, b) => Math.max(Math.abs(a.column - b.column), Math.abs(a.row - b.row));
const OPPOSITE = { north: 'south', south: 'north', east: 'west', west: 'east' };

/**
 * A stair object's squares and the side its foot is on, from its corners and its red (foot) edge.
 * `segments` are the stretches of its outline ({from, to} in grid corners) with their `colour`.
 * Null when it has no red edge along one side.
 */
export function stairEnds(corners, segments) {
  if (!Array.isArray(corners) || corners.length !== 4) return null;
  const columns = corners.map((c) => Number(c.column)), rows = corners.map((c) => Number(c.row));
  const left = Math.min(...columns), right = Math.max(...columns), top = Math.min(...rows), bottom = Math.max(...rows);
  if (!(right > left && bottom > top)) return null;
  const red = (segments || []).filter((s) => s.colour === 'red');
  if (!red.length) return null;
  const all = (test) => red.every(test);
  const footSide = all((s) => s.from.row === bottom && s.to.row === bottom) ? 'south' : all((s) => s.from.row === top && s.to.row === top) ? 'north'
    : all((s) => s.from.column === left && s.to.column === left) ? 'west' : all((s) => s.from.column === right && s.to.column === right) ? 'east' : null;
  return footSide ? { left, right, top, bottom, footSide } : null;
}

/** The square in front of one side of the stair, in the lane `lane` (a column for a stair that runs north-south, a row otherwise). */
function inFront(stair, side, lane) {
  return side === 'north' ? { column: lane, row: stair.top - 1 } : side === 'south' ? { column: lane, row: stair.bottom }
    : side === 'west' ? { column: stair.left - 1, row: lane } : { column: stair.right, row: lane };
}

/**
 * The corners the app puts in for a hero at a stair's end: [the square in front of the near end], and
 * [.., the square in front of the far end] when he is held beyond the stair. Null when nothing is assumed.
 * `stair` is from stairEnds; `onUpper` says the hero is on the floor at the stair's head; `hero` and `target`
 * are squares ({column, row}); `size` is the hero's size in squares.
 */
export function stairAssume(stair, onUpper, hero, target, size = 1) {
  if (!stair || !hero || !target) return null;
  const near = onUpper ? OPPOSITE[stair.footSide] : stair.footSide, far = OPPOSITE[near];
  const upright = near === 'north' || near === 'south';
  const inside = (p) => p.column >= stair.left && p.column <= stair.right - 1 && p.row >= stair.top && p.row <= stair.bottom - 1;
  if (inside(hero)) return null;                      // already on it
  // The lane: where he is held if that is within the stair's width, else where he stands, kept within it.
  const lo = upright ? stair.left : stair.top, hi = Math.max(lo, (upright ? stair.right : stair.bottom) - Math.max(1, size));
  const across = (p) => (upright ? p.column : p.row), within = (v) => v >= lo && v <= hi;
  const lane = within(across(target)) ? across(target) : Math.max(lo, Math.min(hi, across(hero)));
  const enter = inFront(stair, near, lane), leave = inFront(stair, far, lane);
  if (apart(hero, enter) > STAIR_NEAR) return null;   // not standing at its end
  const same = (a, b) => a.column === b.column && a.row === b.row;
  if (same(target, enter)) return null;               // only stepping to the end itself
  if (inside(target)) return same(hero, enter) ? null : [enter];
  // Held beyond the stair: at the square in front of its far end, or beside or past it, never back toward the near end.
  const along = (p) => (upright ? p.row : p.column), outward = far === 'north' || far === 'west' ? -1 : 1;
  if (apart(target, leave) > STAIR_AIM || (along(target) - along(leave)) * outward < 0) return null;
  const corners = same(hero, enter) ? [] : [enter];
  if (!same(target, leave)) corners.push(leave);
  return corners.length ? corners : null;
}
