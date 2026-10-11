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

// ---- The cut edge of the map ----------------------------------------------
// Height moves the ground up the screen and to the right. Raised ground at the south or west edge
// of the map is therefore drawn away from the map's own edge, and the strip between them was left
// empty. That strip is the side of the ground where the map ends, so it is drawn as one: the same
// ground, darkened, from where the edge is drawn down to where the edge really is.

/**
 * True for a scene that has asked for any of this file's ways of drawing: a `view` setting, or a
 * floor plate marked floating. The cut edge is drawn only for such a scene, so a map made before
 * these existed is drawn exactly as it always was, edge gaps included.
 */
export const usesHeightView = (design) => Object.keys(design?.view && typeof design.view === 'object' ? design.view : {}).length > 0
  || (design?.roofs || []).some((surface) => surface?.floating === true);

/**
 * The faces that close the south and west edges of the ground. `points` is the ground's grid of
 * drawn points, `n` across and `m` down, each {x, y} where it is drawn, {gx, gy} where it lies on
 * the flat map, and its picture position and light. Returns triangles of such points. Nothing for
 * an edge that is not raised, and so nothing at all at a slant of zero.
 */
export function edgeFaces(points, n, m, shade = 0.5) {
  const faces = [];
  const foot = (p) => ({ ...p, x: p.gx, y: p.gy, light: p.light * shade });
  const close = (a, b) => { const fa = foot(a), fb = foot(b); faces.push([a, b, fb], [a, fb, fa]); };
  // South: raised ground is drawn up the screen from the edge.
  for (let i = 0; i < n - 1; i++) { const a = points[(m - 1) * n + i], b = points[(m - 1) * n + i + 1]; if (a.gy - a.y > 0.5 || b.gy - b.y > 0.5) close(a, b); }
  // West: raised ground is drawn to the right of the edge.
  for (let j = 0; j < m - 1; j++) { const a = points[j * n], b = points[(j + 1) * n]; if (a.x - a.gx > 0.5 || b.x - b.gx > 0.5) close(a, b); }
  return faces;
}

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
 * plate's side stops a short way under the plate, or at `below` if that comes first. A plate may
 * say how deep its own side is (sideDepthOf): that many squares, or `below` if that comes first.
 */
export function sideFoot(surface, below) {
  const top = Number(surface?.height) || 0, floor = Math.min(top, below), own = sideDepthOf(surface);
  if (own !== null) return Math.max(floor, top - own);
  return isFloating(surface) ? Math.max(floor, top - FLOATING_SIDE) : floor;
}

/**
 * How deep a plate says its own side is drawn, in squares (`sideDepth` in the map design), or
 * null when it does not say: then it is drawn as it always was. A rope bridge or a plank deck is
 * a thin thing in the air: with a side a fifth of a square deep it reads as planks, and with 0 it
 * has no side at all, where the ordinary side would be a dark wall from the deck down to the ground.
 */
export function sideDepthOf(surface) {
  const depth = surface?.sideDepth;
  return typeof depth === 'number' && Number.isFinite(depth) && depth >= 0 ? depth : null;
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

// ---- The lip of a floor above the eyes ------------------------------------------
// From below, a floor is seen only at its near edge: the lip. Half a square of it up close, and
// more the further back the viewer stands. These are the numbers to change if the look is wrong.

/** For every this many squares a viewer stands back, one more square of lip is made out. */
export const LIP_BACK = 6;
/** The least and the most lip, in squares. */
export const LIP_LEAST = 0.5, LIP_MOST = 2;
/** How far from the hero, in squares, a floor above is shown at all in a raised view. */
export const RAISED_REACH = 10;

/** How deep a lip a viewer `distance` squares away makes out. */
export const lipDepth = (distance) => Math.min(LIP_MOST, Math.max(LIP_LEAST, distance / LIP_BACK));

/**
 * True when `point`, on a floor above the viewer's eyes, is part of the lip that viewer makes
 * out: going from the point straight back toward the viewer, the floor's edge (its outline or a
 * hole in it) is no further away than the lip is deep. `on(point)` says whether a point is on
 * the floor. A viewer standing under the floor sees no lip there: there is no edge between.
 */
export function inLip(viewer, point, on, step = 0.1) {
  const dx = viewer.x - point.x, dy = viewer.y - point.y, distance = Math.hypot(dx, dy);
  if (!(distance > 0)) return false;
  const depth = Math.min(lipDepth(distance), distance);
  for (let travelled = step; travelled <= depth + 1e-9; travelled += step) {
    if (!on({ x: point.x + dx / distance * travelled, y: point.y + dy / distance * travelled })) return true;
  }
  return false;
}

/**
 * True when some of a floor's lip can be made out by a viewer within reach of it: the sign that
 * "something is above" is drawn (its outline). `rings` are the floor's outline and holes, `on`
 * says whether a point is on the floor, `seen(point)` whether the viewer has a line to it there.
 */
export function lipInSight(viewer, rings, on, seen, reach = RAISED_REACH) {
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length], dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy) || 1;
      const samples = Math.max(1, Math.ceil(length * 2));
      for (let k = 0; k < samples; k++) {
        const t = (k + 0.5) / samples, mid = { x: a.x + dx * t, y: a.y + dy * t };
        if (Math.hypot(mid.x - viewer.x, mid.y - viewer.y) > reach) continue;
        // Just inside the edge, whichever side the floor is on.
        for (const side of [1, -1]) {
          const point = { x: mid.x - dy / length * 0.2 * side, y: mid.y + dx / length * 0.2 * side };
          if (on(point) && inLip(viewer, point, on) && seen(point)) return true;
        }
      }
    }
  }
  return false;
}

/** An edge is judged in pieces this long, and looked at this far out from the floor on its open side. */
export const EDGE_PIECE = 0.5, EDGE_OUT = 0.1;
/** A wall is under an edge when it lies this close to it, starts at least WALL_BELOW under the floor and comes up to it. */
export const WALL_AT = 0.03, WALL_BELOW = 0.5;

/**
 * True when a wall stands under a floor's edge at `point`: one of the building's own walls, holding that edge up.
 * `along` is the edge's direction (a unit vector). `walls` are [{ a, b, base, top }] in squares. An object's
 * walls inside a square (a rock at the rim of a pool) are not on the edge and do not count.
 */
export function wallUnderEdge(point, along, floorHeight, walls) {
  for (const wall of walls) {
    if (!(wall.base <= floorHeight - WALL_BELOW + 1e-6) || !(wall.top >= floorHeight - 0.1 - 1e-6)) continue;
    const vx = wall.b.x - wall.a.x, vy = wall.b.y - wall.a.y, length = Math.hypot(vx, vy);
    if (!(length > 0) || Math.abs(along.x * vy - along.y * vx) / length > 0.1) continue;
    const t = ((point.x - wall.a.x) * vx + (point.y - wall.a.y) * vy) / (length * length);
    if (t < -1e-6 || t > 1 + 1e-6) continue;
    if (Math.hypot(wall.a.x + vx * t - point.x, wall.a.y + vy * t - point.y) <= WALL_AT) return true;
  }
  return false;
}

/**
 * Indoors, a floor above the hero is never drawn. What he is shown of it is its open edges that he has a line to
 * from where he stands: the edge of a hole in it (a well, a stairwell), and a free edge with no wall under it (the
 * open side of a balcony). An edge that runs along one of the building's walls is not one. Returns the pieces to
 * outline, [[from, to], ...]. `rings` are the floor's outline and holes, `on(point)` says whether a point is on the
 * floor, `walled(point, along)` whether a wall stands under the edge there, `seen(point)` whether the viewer has a
 * line to a point just off the edge on its open side.
 */
export function openEdgePieces(viewer, rings, on, walled, seen, reach = RAISED_REACH) {
  const pieces = [];
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length], dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
      if (!(length > 0)) continue;
      const count = Math.max(1, Math.ceil(length / EDGE_PIECE - 1e-9)), along = { x: dx / length, y: dy / length };
      for (let k = 0; k < count; k++) {
        const t0 = k / count, t1 = (k + 1) / count, mid = { x: a.x + dx * (t0 + t1) / 2, y: a.y + dy * (t0 + t1) / 2 };
        if (Math.hypot(mid.x - viewer.x, mid.y - viewer.y) > reach) continue;
        if (walled(mid, along)) continue;
        const out = [1, -1].map((side) => ({ x: mid.x - along.y * EDGE_OUT * side, y: mid.y + along.x * EDGE_OUT * side })).find((p) => !on(p));
        if (!out || !seen(out)) continue;
        pieces.push([{ x: a.x + dx * t0, y: a.y + dy * t0 }, { x: a.x + dx * t1, y: a.y + dy * t1 }]);
      }
    }
  }
  return pieces;
}

/**
 * True when a floor has a picture of its own. One that has none (a deck whose planks are painted on the
 * ground picture) hides nothing and is already seen from below: it gets no outline.
 */
export const hasOwnPicture = (surface) => Boolean(surface?.imageId);

// ---- Ladder points -----------------------------------------------------------------
// A climb (a vine, a ladder: any way up steeper than a slope) leads somewhere the hero cannot see
// from its foot. A hero near the foot is shown the edges of what is at its top.

/** How near the foot of a climb, in squares, a hero is shown its top. */
export const LADDER_NEAR = 3;
/** How far round the head of a climb, in squares, the floor at its top is outlined. */
export const LADDER_TOP = 2;

/** The middles of a ramp's low end (its foot) and high end (its head), and how steep it is in squares up per square along. */
export function rampEnds(ramp) {
  const x = (ramp.left + ramp.right) / 2, y = (ramp.top + ramp.bottom) / 2;
  const along = ramp.direction === 'east' || ramp.direction === 'west' ? ramp.right - ramp.left : ramp.bottom - ramp.top;
  const ends = { north: [{ x, y: ramp.bottom }, { x, y: ramp.top }], south: [{ x, y: ramp.top }, { x, y: ramp.bottom }], east: [{ x: ramp.left, y }, { x: ramp.right, y }], west: [{ x: ramp.right, y }, { x: ramp.left, y }] }[ramp.direction || 'north'];
  return { foot: ends[0], head: ends[1], grade: along > 0 ? (ramp.height - ramp.base) / along : Infinity };
}

/**
 * The heads of the climbs to a floor `height` high whose top a viewer is shown: ramps at least
 * `climbGrade` steep, whose foot is within LADDER_NEAR squares of the viewer and about as high as
 * the viewer stands (so not a climb the viewer is far above or below).
 */
export function ladderHeads(ramps, viewer, ground, height, climbGrade, near = LADDER_NEAR) {
  const heads = [];
  for (const ramp of ramps || []) {
    if (Math.abs(ramp.height - height) > 1e-6) continue;
    const { foot, head, grade } = rampEnds(ramp);
    if (!(grade >= climbGrade - 1e-9) || Math.abs(ramp.base - ground) > 1) continue;
    if (Math.hypot(foot.x - viewer.x, foot.y - viewer.y) <= near) heads.push(head);
  }
  return heads;
}

/** How the edge of a floor above is drawn at the usual view: a pale dashed line over a dark one, to read on any ground. */
export const OUTLINE_LIGHT = 'rgba(235,240,255,0.85)', OUTLINE_DARK = 'rgba(8,10,20,0.7)';

// ---- What a viewer is shown of floating plates above and below ------------
// Two settings a scene's map design may carry beside the slant, `view.above` and `view.below`.
// Both are about floating plates only, and both leave creatures alone: a creature is shown or
// hidden by line of sight, whatever is done with the plate it stands on.

/**
 * Floating plates above the viewer's head. 'off' (as always): not drawn. 'shape': each is drawn
 * as a see-through dark shape where the plate is. 'tier': the same, for the nearest ones only.
 */
export const VIEW_ABOVE = ['off', 'shape', 'tier'];
/**
 * The part of a floating plate below the viewer that the viewer has no line of sight to.
 * 'black' (as always): blacked out. 'dim': its picture, dimmed.
 */
export const VIEW_BELOW = ['black', 'dim'];
export const viewAbove = (design) => (VIEW_ABOVE.includes(design?.view?.above) ? design.view.above : 'off');
export const viewBelow = (design) => (VIEW_BELOW.includes(design?.view?.below) ? design.view.below : 'black');

/** Plates within this many squares of the lowest one overhead count as the same tier. */
export const TIER_BAND = 0.5;

/**
 * The floating plates to draw as shapes for a viewer whose head is at height `eye`: those at or
 * above it, lowest first. With mode 'tier', only the lowest of them and any others level with it.
 */
export function shapesAbove(surfaces, eye, mode) {
  if (mode !== 'shape' && mode !== 'tier') return [];
  const above = (surfaces || []).filter((surface) => isFloating(surface) && surface.points?.length > 2 && eye <= Number(surface.height) + 1e-6)
    .sort((a, b) => a.height - b.height);
  return mode === 'tier' && above.length ? above.filter((surface) => surface.height <= above[0].height + TIER_BAND) : above;
}

/** True when the unseen part of this plate is shown dimmed and not black. */
export const dimsBelow = (surface, design) => isFloating(surface) && viewBelow(design) === 'dim';

/** How a shape overhead is painted: dark enough to read as "something is up there", light enough to see through. */
export const SHAPE_FILL = 'rgba(8,10,20,0.32)', SHAPE_EDGE = 'rgba(8,10,20,0.72)';
/** How dark the unseen part of a dimmed plate is. */
export const DIM_FILL = 'rgba(0,0,0,0.62)';

/** True when any of the plate's shadow lies below it: there is open air under some of its outline. */
export const castsShadow = (rings, surface) => rings.some((ring) => ring.some((point) => point.z < (Number(surface.height) || 0) - 0.05));

// ---- Looking down over an edge ---------------------------------------------------
// A viewer's own floor is in the way of everything below it, measured from the middle of his
// square: from the rim of a floor twelve up, the ground is hidden for six squares out, and on the
// screen the drop beside him is a black hole that reads as a wall. A hero on the last square
// before a drop leans out over it instead: he sees straight down, and a little way in under the
// rim he stands on (the lean times the drop), which is what the screen shows beside that rim.

/** How far past his own square, in squares, the edge of a hero's floor may be for him to look over it. */
export const EDGE_REACH = 0.5;
/** How far out past the edge he leans to look, in squares. A hair (0.01) would show nothing under his own floor. */
export const EDGE_LEAN = 0.5;

/**
 * The places a viewer standing on a floor can look down from: for every stretch of the floor's
 * edge (its outline or a hole) no further from the middle of his square than half his size plus
 * the reach, the point the lean beyond its nearest point. None when he is not on the last square
 * before a drop. `rings` are the floor's outline and holes.
 */
export function edgeLooks(centre, size, rings, reach = EDGE_REACH, lean = EDGE_LEAN) {
  const within = (Number(size) || 1) / 2 + reach, looks = [];
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length], dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
      const t = length ? Math.max(0, Math.min(1, ((centre.x - a.x) * dx + (centre.y - a.y) * dy) / length)) : 0;
      const x = a.x + dx * t, y = a.y + dy * t, distance = Math.hypot(x - centre.x, y - centre.y);
      if (distance > within + 1e-9 || distance < 1e-9) continue;
      looks.push({ x: x + (x - centre.x) / distance * lean, y: y + (y - centre.y) / distance * lean });
    }
  }
  return looks;
}

/**
 * True when the floor a viewer stands on hides `target`, at height `z` below that floor, from the
 * middle of his square and from every place he can look down from (`looks`, from edgeLooks).
 * `eye` is the height of his eyes, `on(point)` says whether a point is on the floor.
 */
export function ownFloorHides(centre, eye, floorHeight, target, z, on, looks) {
  if (!(z < floorHeight && floorHeight < eye)) return false;
  const t = (floorHeight - eye) / (z - eye);
  const hides = (from) => on({ x: from.x + (target.x - from.x) * t, y: from.y + (target.y - from.y) * t });
  return hides(centre) && looks.every(hides);
}

// ---- Climb markers ---------------------------------------------------------------
// The Director is shown the red foot and green head of every stair object as flat lines on the map.
// A player is shown the same two ends where they truly are: the foot at the height it starts from,
// the head at the height it reaches, so a vine reads as "this goes all the way up there".

/** The colours of a climb's foot and head, the same the Director's lines use (stairs.css). */
export const CLIMB_FOOT = '#e74c3c', CLIMB_HEAD = '#2ecc71', CLIMB_UNDER = 'rgba(8,10,20,0.85)';

/** Every stair object of a scene once: the ground's and each floor's copies of a stair share an id. */
export function sceneStairs(mapLevels) {
  const seen = new Set(), out = [];
  for (const stair of [...(mapLevels?.baseStairs || []), ...(mapLevels?.levels || []).flatMap((level) => level?.stairs || [])]) {
    if (!stair || seen.has(stair.id)) continue;
    seen.add(stair.id); out.push(stair);
  }
  return out;
}

/**
 * The lines to draw for one stair: each red or green stretch of its outline, with the height it
 * lies at. `segments` are the stretches ({from, to} in grid corners, and `colour`); `heightAt(x, y)`
 * gives the stair's own height there (its ramp), or null where it has none; `groundAt` the ground's.
 */
export function climbMarkers(segments, heightAt, groundAt) {
  const out = [];
  for (const segment of segments) {
    if (segment.colour !== 'red' && segment.colour !== 'green') continue;
    const a = { x: segment.from.column, y: segment.from.row }, b = { x: segment.to.column, y: segment.to.row };
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, own = heightAt(mid.x, mid.y);
    out.push({ a, b, mid, z: Number.isFinite(own) ? own : Number(groundAt(mid.x, mid.y)) || 0, colour: segment.colour });
  }
  return out;
}
