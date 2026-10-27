// When a token is put down, its movement line does not just vanish: it shrinks from where the move
// started toward where the token went, so the board shows which way it moved (Brandon, October 26, 2026).
// Short moves take half a second, long ones up to one second. Pure data: movement-route.mjs draws it.

export const COLLAPSE_SHORTEST = 0.5;   // seconds, for a move of SHORT_SQUARES or less
export const COLLAPSE_LONGEST = 1;      // seconds, for a move of LONG_SQUARES or more
const SHORT_SQUARES = 2, LONG_SQUARES = 12;

const valid = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
const gap = (a, b) => Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });

/** Seconds the line takes to collapse, from its length in squares. */
export function collapseDuration(length) {
  const t = Math.min(1, Math.max(0, ((Number(length) || 0) - SHORT_SQUARES) / (LONG_SQUARES - SHORT_SQUARES)));
  return COLLAPSE_SHORTEST + (COLLAPSE_LONGEST - COLLAPSE_SHORTEST) * t;
}

/** Eased progress (0..1) of the collapse: starts and ends gently, so the motion reads as a movement. */
export function collapseProgress(elapsed, duration) {
  const t = Math.min(1, Math.max(0, elapsed / Math.max(1e-6, duration)));
  return t * t * (3 - 2 * t);
}

// The route as one line (its pieces run end to end) with the distance along it at each corner.
function routeLine(payload) {
  const line = [], along = [];
  for (const piece of payload?.pieces || []) for (const p of (piece.points || []).filter(valid)) {
    along.push(line.length ? along.at(-1) + gap(line.at(-1), p) : 0);
    line.push(p);
  }
  return { line, along, length: along.at(-1) || 0 };
}

// How far along the route a point lies (the nearest place on it).
function distanceAlong(route, p) {
  if (!valid(p) || route.line.length < 2) return 0;
  let best = Infinity, at = 0;
  for (let i = 1; i < route.line.length; i++) {
    const a = route.line[i - 1], b = route.line[i], dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, span = dx * dx + dy * dy + dz * dz;
    const t = span ? Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy + (p.z - a.z) * dz) / span)) : 0;
    const q = lerp(a, b, t), d = gap(p, q);
    if (d < best) { best = d; at = route.along[i - 1] + (route.along[i] - route.along[i - 1]) * t; }
  }
  return at;
}

// The part of a line from `cut` onward, given the route distance at each of its points.
function trimLine(points, distances, cut) {
  const kept = [];
  for (let i = 0; i < points.length; i++) {
    if (distances[i] < cut) continue;
    if (!kept.length && i > 0 && distances[i] > distances[i - 1]) kept.push(lerp(points[i - 1], points[i], (cut - distances[i - 1]) / (distances[i] - distances[i - 1])));
    kept.push(points[i]);
  }
  return kept;
}

/** Everything the collapse needs, worked out once when the token is put down. Null when there is no line. */
export function prepareCollapse(payload) {
  const route = routeLine(payload);
  if (route.length <= 1e-6) return null;
  let offset = 0;
  const pieces = (payload.pieces || []).map((piece) => {
    const points = (piece.points || []).filter(valid), distances = [];
    points.forEach((p, i) => { if (i) offset += gap(points[i - 1], p); distances.push(offset); });
    return { color: piece.color, points, distances };
  });
  const place = (item) => ({ item, at: distanceAlong(route, item?.at) });
  return {
    payload,
    length: route.length,
    duration: collapseDuration(route.length),
    pieces,
    difficult: (payload.difficult || []).map((step) => {
      const points = (step.points || []).filter(valid);
      return { step, points, distances: points.map((p) => distanceAlong(route, p)), at: distanceAlong(route, step.at) };
    }),
    climbs: (payload.climbs || []).map(place),
    legs: (payload.legs || []).map(place),
    nodes: (payload.nodes || []).map((node) => ({ node, at: distanceAlong(route, node) })),
  };
}

/**
 * The line as it looks `progress` (0..1) of the way through its collapse: the part already passed is gone,
 * and the corner dots, leg lengths and difficult-square marks go with it. The arrowhead and the total stay
 * with the end until the line is gone. Null at the end.
 */
export function collapsedRoute(prepared, progress) {
  if (!prepared || progress >= 1) return null;
  const cut = prepared.length * Math.max(0, progress);
  const pieces = prepared.pieces.map((piece) => ({ color: piece.color, points: trimLine(piece.points, piece.distances, cut) })).filter((piece) => piece.points.length >= 2);
  if (!pieces.length) return null;
  const difficult = prepared.difficult.map(({ step, points, distances, at }) => ({ ...step, points: trimLine(points, distances, cut), at: at >= cut ? step.at : null }))
    .filter((step) => step.points.length >= 2);
  const nodes = prepared.nodes.filter((entry, index) => index === prepared.nodes.length - 1 || entry.at >= cut).map((entry) => entry.node);
  return {
    ...prepared.payload,
    pieces,
    difficult,
    climbs: prepared.climbs.filter((entry) => entry.at >= cut).map((entry) => entry.item),
    legs: prepared.legs.filter((entry) => entry.at >= cut).map((entry) => entry.item),
    nodes,
  };
}
